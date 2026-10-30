# SignalForge — Build Roadmap & Review Log

> **Living document.** I update this after every chunk. When you see ✅ it is ready
> for you to review, and the chunk will have three sections: *What I built in plain
> terms*, *How you verify it* (click-by-click), and *What it scores*.

**Status legend:** ☐ not started · ⏳ in progress · ✅ done, ready for your review ·
👀 reviewed by you · ⚠️ blocked · ⏭️ cut for time

**Submission clock:** 5 hours from 2026-10-30 start.

**Live app:** http://localhost:3000 (dev server running)

---

## Scoring model we are optimising against

Base 80 + up to 60 bonus = **140 marks available.**

| Criterion | Weight | Chunk |
|---|---|---|
| ICP & Discovery Quality | 20% | 1, 2 |
| Enrichment & Outreach | 20% | 4 |
| Dashboard & Lead Management | 15% | 5 |
| Startup Viability | 15% | 7 |
| Technical Execution & Demo | 10% | 0, 7 |
| Band Desktop integration | +20% | 6B |
| Flexprice integration | +20% | 6A |
| Snyk integration | +20% | 6C |

Three rules I am holding to throughout, because the rubric explicitly rewards them:
1. **No uncited claim.** Every lead, signal and competitor fact renders a source URL.
2. **The HITL gate cannot be bypassed.** Dispatch is impossible without an approval record.
3. **Everything external has a cached-fixture fallback,** so a rate limit can never
   break the demo — but live mode is one toggle away and proves it is real.

---

## Chunk progress

### ✅ Chunk 0 — Scaffold, contracts, continuous deploy *(done — ready for review)*

**What I built, in plain terms.** The foundation: a Next.js 16 app, the shared vocabulary
every later module agrees on, and the demo dataset. The two decisions worth your attention:

1. **No uncited claim can render.** The `Evidence[]` array is a *required* field on every
   type that describes something we learned from the outside world — company, person,
   signal, competitor. That isn't a convention I'm promising to follow; TypeScript refuses
   to compile a company record without it. When a source genuinely isn't available the UI
   prints an `Uncited` badge in red rather than hiding the gap.
2. **Demo data is synthetic and says so.** `lib/fixtures/demo.ts` contains invented
   companies. I won't attach invented funding rounds or invented job titles to real
   companies, and I won't draft outreach to a named person who doesn't hold that role —
   so demo mode exists to exercise the UI deterministically, and **live mode is what
   carries real cited leads.** That's what the video records and what judges should grade
   the citation requirement on. The dataset deliberately includes one account disqualified
   by a hiring freeze, so you can watch the negative-signal filter fire.

Also: Node.js wasn't installed on this machine and everything was blocked on it, so I
installed it via Homebrew (`node v25`).

**How you verify it**
- `npx tsc --noEmit` → should print nothing. A silent
  run means the whole ontology, graph, store and reasoning layer type-check together.
- `curl -s localhost:3000/api/state | python3 -m json.tool` → shows which providers are
  actually wired. Nothing is claimed that isn't configured; the header dots in the UI read
  from this same endpoint.
- Open `lib/types.ts` and search for `evidence:` — every externally-sourced type has it as
  a non-optional field. That's the anti-hallucination guarantee, stated in code.

**Scores:** Technical Execution (10%)

### ✅ Chunk 1 — Product Intake & ICP Engine *(done — ready for review)*

**What I built, in plain terms.** You type a paragraph about what you sell. The engine
returns a buyer profile — target verticals with real NAICS codes, headcount and revenue
bands, named buyer personas with what each one is measured on, trigger events scored by
how strongly they predict a near-term purchase, and hard disqualifiers. **Every field
carries its own confidence score and a one-sentence reason**, both rendered in the UI.

Then it proposes three *adjacent* segments — markets that conventional firmographic
filtering would throw away — and sends each thesis back out to live web search, so the
claim arrives with citations you can click rather than as an assertion you have to trust.
You accept, adjust or dismiss each one.

The low overall confidence number (~48% on the example) is the feature, not a bug: the
example intake has no reference customers, and the engine says so in the rationale
("no reference customers exist yet to confirm it") instead of projecting false precision.

The live reasoning feed was built here and is reused by every later module — reasoning
steps, provider calls, the verbatim Cypher of each graph query, and every human gate all
stream into the collapsible right-hand panel as they happen.

**How you verify it** — the app is running at **http://localhost:3000**
1. Click **load example** → **Infer ICP**. Watch the thinking panel on the right stream
   steps live; it shows the model, the timings, and the actual search queries fired.
2. Hover any confidence percentage → you get the engine's reason for that specific field.
3. Scroll to **Adjacent segments** → click a `[1] domain` citation chip. It opens the real
   source URL. Hover it first and you'll see the verbatim snippet it was drawn from.
4. Click **Dismiss** on one segment and **Accept** on another → both decisions appear in
   the thinking panel as `human gate` steps, which is the audit trail.
5. Click **Approve profile** → the gate step is recorded and discovery unlocks. Nothing is
   searched, enriched or drafted against an unapproved profile.

**What it proved on the live run:** real cited expansion segments including
lower-middle-market PE search funds, higher-ed advancement teams, and CRE brokerages —
each with 3 live sources and an explanation of why standard targeting excludes it.

**Scores:** ICP & Discovery (20%)

### ✅ Chunk 2 — Discovery & Competitor Mapping *(done)*

**Plain terms.** Turns the approved profile into real companies with real source
links, plus a map of who else sells to them.

**Verified live:** 30 sources searched → **5 accounts kept, 0 dropped for missing
citations**. Four Tier A at fit 78. One (Tiledesk) visibly disqualified at −40:
*"Headquartered in Italy, outside the supported markets, and the $52K round is far
below the ACV threshold."* **9 competitors** mapped — Unify GTM, Clay, Apollo.io
(direct); UserGems, 6sense, Demandbase, ZoomInfo, Boomerang (indirect); in-house
SDR team (alternative). Prices read "Not published" where they genuinely are.

**Verify:** run discovery, hover a fit score to see its arithmetic, click a
citation chip, toggle "show disqualified" to see what was filtered and why.

### ✅ Chunk 3 — Knowledge graph & reasoning *(done, viz simplified)*

Ontology, edges and three multi-hop queries all working, each written twice
(real Cypher + traversal, adjacent in `lib/reasoning.ts`). **Cut for time: the
force-directed canvas.** Replaced with a path-and-Cypher panel — the reasoning
is intact, the picture isn't. No rubric line asked for a force graph.

**Verify:** "Run graph queries" → expand a Cypher block; findings carry an
actionable line, and an empty result says so rather than padding.

### ✅ Chunk 4 — Enrichment, Outreach & HITL Gateway *(done)*

**Verified live:** 3 buyers found and enriched, **real DNS MX validation**,
credits 500 → 470. Two resolved to `mx_validated_pattern` at 62% — labelled as
inferred, never as verified, because MX proves the *domain* accepts mail, not
that the mailbox exists. The third returned no address because MX genuinely
failed; reported unresolved rather than guessed.

Outreach: 3 touches, email + LinkedIn, A/B split across two variants, signal IDs
audited against the real signal set, independent reviewer pass that never sees
the drafting prompt.

**The gate:** `dispatch()` in `lib/hitl.ts` is the only exit. It looks up an
approval record before touching a transport and throws `GateViolationError`
otherwise. **Verify by pressing Send on an unapproved message — you get a 403
and the refusal lands in the audit feed.** That is the single most important
shot in the video.

### ✅ Chunk 5 — Dashboard, Attribution & Analytics *(done)*

Kanban with drag across all six stages; every transition records its actor, so
your drags attribute to you and the agent's moves attribute to it. Step-conversion
funnel, AI-vs-rep split, A/B variant table, by-tier and by-industry breakdowns.

### ✅ Chunk 6 — Bonus integrations

- **Flexprice (+20): REAL.** `POST https://us.api.flexprice.io/v1/events` →
  **202 Accepted**, verified. Local ledger enforces; every event records whether
  its mirror succeeded. Credit gate halts enrichment cleanly and a top-up resumes it.
- **Snyk (+20): REAL.** SCA **0 issues**, SAST **0 issues**, both verified locally
  after you enabled Snyk Code. CI runs three jobs including a secret-hygiene check.
- **Band Desktop (+20): REAL and complete.** All four agents — `GV Planner`,
  `GV Builder`, `GV Reviewer`, `GV Security` — authenticate **HTTP 200** and the
  four-role collaboration posts **6/6 messages and events into the live
  `GTM War Room`**, confirmed by Band returning `201` with the resolved
  recipient on each. Handoffs are @mention-routed; the final message addresses
  the human by handle because no agent in the room can approve a dispatch.

  Wire-format notes, all found by probing (the published guide was incomplete):
  `x-api-key`, not `Authorization: Bearer`. Messages take
  `{message:{content, mentions:[{handle}]}}` — mentions must be objects with a
  namespaced handle, minimum one. Events take
  `{event:{message_type, content}}` with `message_type` an enum of
  `thought | tool_call | error`. Rooms are created with `{chat:{title}}`.

  Every transcript line records a `delivered` flag set from the actual HTTP
  status. That was added after discovering the first run had logged six
  messages locally while Band rejected all six with 422 — a local log that
  reads as success is exactly how an integration gets overstated.

### ✅ Chunk 7 — Deliverables

- `README.md` — setup, the three enforced guarantees, architecture, viability case
- `SYSTEM-DESIGN.md` — ontology, all three queries with Cypher, four reasoning loops, bonus wiring
- `VIDEO-SCRIPT.md` — 2:45 shot-by-shot with a checklist
- `.env.example` — scrubbed, 19 variables, zero secrets
- **Outstanding: the public GitHub repo is not pushed** (auth incomplete)

---

## What is NOT done

1. **GitHub repo not pushed** — a required deliverable. Needs `gh auth login` in a
   real Terminal window (it's interactive, so it can't run through this session).
2. **`GV-Builder` agent + `BAND_ROOM_ID`** — without these the Band handoffs are
   recorded locally rather than posted to a real room.
3. **Demo video not recorded** — script and shot list are ready.
4. Resend and Hunter not configured: dispatch records as `simulated` rather than
   `sent`, and enrichment uses MX + pattern instead of vendor verification.

## Cut order if we slip
First to go: Neo4j (in-process graph already passes), then LinkedIn as a second channel,
then A/B variant analytics, then live Tavily (fixtures carry it). **Never cut:** citations,
the HITL gate, the Flexprice credit gate firing, Snyk, or the video.

---

## Decisions log
- **2026-10-30** Product name **SignalForge** — graph-native GTM. Changeable on request.
- **2026-10-30** One datastore. Leads, stages, messages and meter events all live as
  graph nodes, so the graph is load-bearing rather than decorative.
- **2026-10-30** Band agents run as a local worker process, not on Vercel — their SDK
  needs long-lived WebSockets, which serverless cannot hold. Fine for the recorded demo.
- **2026-10-30** Flexprice is mirrored for the integration proof, but a local ledger is
  the enforcement source of truth so the credit gate fires deterministically on camera.
