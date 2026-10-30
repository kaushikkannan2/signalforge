# Grapevine — a graph-native GTM engine

Plain-language product description in. Evidence-cited pipeline out.

Grapevine infers who you should sell to, finds those accounts and the named
people inside them with a source link on every claim, connects them in a
knowledge graph so you can ask relationship questions, drafts outreach that
quotes the specific event that makes them in-market, and **refuses to send
anything until a human approves it**.

---

## The three guarantees this codebase actually enforces

These are the load-bearing claims. Each is enforced structurally, not promised
in a prompt — the "where" column is the file you can read to check.

| Guarantee | How it is enforced | Where |
|---|---|---|
| **No uncited claim can render** | The model is never asked to write a URL. It receives a numbered list of results we genuinely fetched, and the output schema forces it to answer with *indices* into that list, which we resolve back to real `Evidence` objects. A fabricated citation is not something it is asked to avoid — it is something it has no way to express. Any record whose indices don't resolve is dropped, and the drop count is reported. | `lib/discovery.ts`, `lib/competitors.ts` |
| **Nothing is dispatched without human approval** | `dispatch()` is the only path out of the system. Before touching a transport it looks up an `ApprovalRecord`; with none, or with a rejection, it throws `GateViolationError`. The UI button state is a convenience — the server refuses independently. | `lib/hitl.ts` |
| **Enrichment cannot outrun its credits** | `assertCredits()` runs *before* the vendor call, not after. When the balance is short it throws, the batch halts cleanly rather than half-processing, and the gate decision is written to the audit feed. | `lib/meter.ts`, `lib/enrichment.ts` |

A fourth: **a demo cannot mail a real prospect by accident.** `assertSafeRecipient()`
sits beneath the approval gate and refuses any recipient other than `DEMO_INBOX`
unless `GRAPEVINE_ALLOW_REAL_SEND=true` is set deliberately — so the safe
behaviour is what you get by forgetting to configure something.

A fifth, quieter one: **an inferred email never renders as a verified one.**
`hunter_verified`, `mx_validated_pattern` and `pattern_inferred` are distinct
methods with distinct confidence ceilings, and the UI shows which produced any
given address. MX validation is a real DNS lookup — it proves the *domain*
accepts mail, which is not the same as the mailbox existing, and the 0.62
confidence cap reflects exactly that.

---

## Quick start

```bash
npm install
cp .env.example .env.local   # then fill in at minimum ANTHROPIC_API_KEY
npm run dev                  # http://localhost:3000
```

Only `ANTHROPIC_API_KEY` is strictly required. Every other provider degrades
explicitly rather than silently: the header shows which integrations are live,
and a capability that isn't wired says so instead of pretending.

| Variable | Without it |
|---|---|
| `ANTHROPIC_API_KEY` | **Required.** Nothing infers. |
| `TAVILY_API_KEY` | Discovery cannot cite, so it stops rather than guessing. |
| `HUNTER_API_KEY` | Falls back to DNS MX validation + pattern inference, labelled as such. |
| `RESEND_API_KEY` | Dispatch records as `simulated`, never as `sent`. |
| `FLEXPRICE_API_KEY` | Metered locally only; each event records that the mirror failed. |
| `NEO4J_URI` | In-process graph with real multi-hop traversal. |
| `BAND_*` | Multi-agent roles run in-process instead of in a Band room. |
| `SNYK_TOKEN` | CI security job is skipped. |

### Walking the pipeline

1. **Load example → Infer ICP.** Watch the right-hand panel stream reasoning live.
2. **Approve profile.** Discovery is blocked until you do; it will not spend a
   provider call against an unapproved ICP.
3. **Run discovery.** Fans out across search angles, extracts only accounts the
   sources actually name, scores each 0–100 with the arithmetic visible on hover.
4. **Find & enrich buyers.** Role-matched people, then email resolution.
5. **Draft outreach.** Three touches across email and LinkedIn, A/B split across
   two variants, each first touch independently fact-checked by a reviewer pass
   that never sees the drafting prompt.
6. **Approve, edit or reject** in the queue. Try **Send** on an unapproved
   message — the server returns 403 and the reason lands in the audit feed.
7. **Run graph queries.** Warm-intro paths, active buying cycles, displacement
   openings — with the real Cypher shown.
8. **Drag a card** on the board. Your move is attributed to you; the agent's
   moves are attributed to it.

---

## Architecture

```
Intake (plain language)
   │
   ▼
ICP Engine ──────────── per-field confidence + rationale
   │                    adjacent-segment expansion, each thesis re-searched
   ├── human approval gate
   ▼
Discovery ───────────── multi-angle search → index-constrained extraction
   │                    0–100 fit, Tier A/B/C, negative-signal disqualification
   ├── Competitor map (direct / indirect / alternative, published prices only)
   ▼
Knowledge Graph ─────── Company · Person · Product · Competitor · Signal · Lead
   │                    works_at, previously_employed_at, studied_at,
   │                    competes_with, matched_to, contacted_via, replied_to,
   │                    emits_signal, uses_vendor
   │                    3 multi-hop queries, Cypher + traversal side by side
   ▼
Enrichment ──────────── credit gate → Hunter → DNS MX → pattern
   ▼
Outreach ────────────── signal-grounded copy, signal IDs audited
   ├── Reviewer pass (independent context, link validation)
   ├── ■ HUMAN GATE ■  approve / edit / reject
   ▼
Dispatch ────────────── Resend, or recorded as simulated
   ▼
Pipeline ────────────── Matched → Contacted → Replied → Meeting → Closed
                        every transition carries its actor (AI / rep / system)
```

**One datastore, deliberately.** Leads, stages, messages and meter events all
live as graph nodes, so the graph is load-bearing rather than a decorative
side-copy that can drift. The in-process graph is the system of record and
Neo4j is a write-through mirror; the three reasoning queries are written twice
— once as real Cypher, once as a traversal — and kept adjacent in
`lib/reasoning.ts` so they cannot tell different stories.

| Layer | Choice |
|---|---|
| Reasoning | Claude Opus 5 (ICP, extraction, review), Sonnet 5 (drafting) |
| Discovery | Tavily, with verbatim snippets — never LLM-paraphrased |
| Graph | In-process traversal, Neo4j write-through when configured |
| Enrichment | Hunter.io, Node `dns.resolveMx`, pattern inference |
| Dispatch | Resend |
| Metering | Flexprice `/v1/events` + local enforcement ledger |
| Security | Snyk SCA + SAST + secret-hygiene job in CI |
| Frontend | Next.js 16, React 19, Tailwind 4 |

### Datasets and scale

Three loadable datasets, all via the ⌘K palette:

| Dataset | Shape | Purpose |
|---|---|---|
| Demo scenario | 7 accounts, 8 buyers | Hand-authored; every record proves one capability (see `DEMO-GUIDE.md`) |
| Scale | ~307 accounts, ~728 buyers, 2,133 nodes | Production-shaped; loads in ~50ms |
| Stress | ~1,007 accounts, ~2,376 buyers, 6,802 nodes / 9,424 edges | Loads in ~420ms; graph queries stay at 2–9ms |

The generator is deterministic (seeded PRNG), so a rehearsal and a recording
produce identical data. Distributions are deliberately shaped rather than
uniform — fit scores form a bell curve, signals follow a power law, and the
former-employer pool is small enough that genuine two-hop warm-introduction
paths exist. A uniformly random graph has almost none, which would make the
multi-hop queries look better than they are.

**Everything generated is synthetic.** Names are composed from word lists and
all domains use reserved TLDs (`.example` / `.invalid` / `.test`), so no record
can collide with a real organisation or person. `data/` is gitignored.

### Privacy

`GRAPEVINE_PRIVACY_MODE=mask` renders `Dana Okafor` as `Dana O.` and
`dana.okafor@…` as `d••••••••@…`, and strips identifying paths from evidence
URLs while keeping the host — because the host is the evidence. Masking is a
presentation boundary; the pipeline still operates on real values, so a masked
run is a real run. Use it for any live demo against real data: a recorded demo
is a publication, and an inferred address may also be wrong.

### Data modes

`GRAPEVINE_DATA_MODE=demo` serves a **synthetic** dataset (`lib/fixtures/demo.ts`)
for exercising the UI deterministically. Those companies are invented and
labelled as such — we do not attach invented funding rounds or job titles to
real companies, and we do not draft outreach to a named person who doesn't hold
that role. `live` mode calls Tavily, and **live mode is what carries real cited
leads.**

---

## Security

`.github/workflows/security.yml` runs three jobs on every push and PR:

- **SCA** (`snyk test`) — known CVEs in the dependency tree, fails on high.
- **SAST** (`snyk code test`) — injection, unsafe sinks, secret handling, with
  SARIF uploaded to GitHub code scanning.
- **Secret hygiene** — asserts no `.env`, `agent_config.yaml` or gh config is
  tracked, and greps for hardcoded provider keys. The engine holds seven
  third-party credentials; a committed env file is the likeliest way they leak,
  so it is checked mechanically rather than left to review discipline.

Gating rather than merely reporting is deliberate: this service holds prospect
contact data and sends mail on a human's behalf, so a high-severity finding on
`main` is an incident, not a backlog item.

---

## The learning layer

One component genuinely learns, one dataset is being collected for training,
and three components do not learn — and the UI says which is which.

| Component | Learns | Method |
|---|---|---|
| Outreach variant selection | **yes** | Contextual multi-armed bandit, Beta-Bernoulli Thompson sampling. Arms = variant × channel; context = seniority band × signal presence; reward = approval (1), reply (2), meeting (3), rejection (0). Exploration comes from posterior sampling, not a tuned epsilon. |
| Copy quality preferences | no | Every human edit at the approval gate is a `(prompt, chosen, rejected)` triple in DPO format, exported as JSONL. **Collected, not trained on** — a dataset is not a trained policy. |
| Fit score weights | no | Hand-set and decomposed on screen. Could be fit by logistic regression against closed-won outcomes; n is far too small to fit anything honest. |
| ICP inference | no | Frozen model, structured output. Confidence is the model's own calibrated estimate, not a learned parameter. |
| Reviewer thresholds | no | Deterministic rules. |

The approval gate does double duty: it is the safety mechanism *and* the reward
signal. Replies and booked meetings arrive as delayed reward with credit
assigned back to the message that earned them, which is the part usually
missing from systems that claim a feedback loop.

## Why this is a business

**The pain.** A seed-to-Series-B B2B company runs GTM across disconnected
silos: the ICP lives in a slide deck, prospecting is ad-hoc search, enrichment
is three separate tools, outreach is whatever each rep pastes, and tracking is
a spreadsheet. Context degrades at every handoff. The visible symptom is CAC;
the actual mechanism is that nobody can answer *why this account, why now,
why this message* — so targeting drifts and copy goes generic.

**The wedge.** Not "AI SDR". The wedge is **evidence**. Every incumbent asks you
to trust a score; Grapevine shows you the sentence and the URL it came from.
That matters commercially and not just ethically: the reason outbound teams
distrust AI tooling is that they've been burned by confident fabrication, and
the reason their compliance teams block it is that there's no audit trail. A
cited claim and a mandatory approval record answer both objections at once.

**Differentiation.**

| Versus | Their shape | Ours |
|---|---|---|
| Clay / Claystack | A table you author, 50+ providers to chain | A pipeline from a product description; no table-building |
| Apollo / ZoomInfo | A database you query with filters | An inferred profile that explains its own confidence |
| 6sense / Demandbase | Black-box intent score, marketing-owned | Intent explained with a citable source per claim |
| Agency on retainer | $8–15k/mo, context leaves with the agency | Institutional knowledge stays in the graph |
| In-house SDRs + spreadsheets | ~$95k/yr per rep, context dies with turnover | Research-to-first-touch in seconds, context persists |

**Pricing.** Usage-based, metered through Flexprice: credits per lead enriched,
per message sent, per graph query. It aligns price with value delivered, and —
not incidentally — the credit gate is what stops a runaway agent from spending
a customer's budget overnight.

**Why a graph is the moat.** Warm-intro paths, job-requisition-to-buying-cycle
links, and competitor-displacement windows are all multi-hop relationship
questions. They are awkward in a relational schema and impossible in a
spreadsheet. The graph compounds: every run adds nodes and edges, so the
hundredth account is cheaper to work than the first.

---

## Honest limitations

- Pipeline state is in-process. It survives a page reload (the UI rehydrates
  from the API) but not a server restart. Neo4j is the production answer.
- LinkedIn has no open API for unsolicited messaging; those touches are drafted,
  approved and queued, and recorded as `simulated` — never as `sent`.
- Reply detection is manual. There is no inbound webhook yet, so `replied` is a
  rep action on the board rather than an observed event.
- Fit scoring is a transparent weighted model, not a trained one. That is a
  deliberate trade for explainability at this stage, but it is not calibrated
  against outcome data because there is none yet.
- Snyk Code (SAST) requires the org-level toggle to be enabled; without it the
  SAST job reports `SNYK-CODE-0005` rather than silently passing.
