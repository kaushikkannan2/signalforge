# Demo guide — data, privacy, and what to say

Three things live here: how the datasets are designed and why, the PII posture
you can defend if someone in the room asks, and a record-by-record map of what
each row proves so you can narrate rather than improvise.

---

## 1. Privacy and data security — decide this before the camera is on

A GTM engine's entire subject matter is identifiable information about people
who never consented to being in it. Three places that becomes a concrete risk,
and what this build does about each.

### A recorded demo is a publication

An email address on screen is published to everyone who ever watches, and an
**inferred** address may also be *wrong* — attributing a wrong contact to a
named person is its own harm, separate from the disclosure.

**What we do:** the demo dataset is **fully synthetic — invented companies and
invented people.** All domains use the reserved `.example` / `.invalid` /
`.test` TLDs, so no generated record can collide with a real organisation, and
no name is a real person's. Nothing identifiable appears in a frame.

### Masking, for when you want to show live data

`SIGNALFORGE_PRIVACY_MODE=mask` is a first-class mode, not screenshot editing.
It renders `Dana Okafor` as `Dana O.`, `dana.okafor@…` as `d••••••••@…`, and
strips the identifying path from evidence URLs while keeping the host — because
the host *is* the evidence. Masking is a presentation boundary: the pipeline
keeps operating on real values, so you are demonstrating the real system.

Use it for the one live run that proves the citations are real:
```bash
SIGNALFORGE_PRIVACY_MODE=mask npm run dev
```

### Dispatch cannot reach a real prospect by accident

A second, independent guard sits beneath the approval gate. The HITL gate asks
*"did a human approve this?"*; `assertSafeRecipient()` asks *"is it safe to
actually deliver?"* and refuses any recipient other than `DEMO_INBOX` unless
`SIGNALFORGE_ALLOW_REAL_SEND=true` is set deliberately. **The safe behaviour is
what you get by forgetting to configure something**, which is the only way a
safety default actually holds.

### Data at rest

`data/` is gitignored, and the snapshot that briefly contained real people's
inferred addresses was deleted rather than scrubbed. The public repo contains
code and the synthetic generator — no contact data.

### If someone asks the hard version of the question

> *"You're guessing people's email addresses. Isn't that a GDPR problem?"*

The honest answer, which is also the product answer: **yes, which is why the
system refuses to overstate what it knows.** Three distinct resolution methods
with different confidence ceilings, a real DNS check that proves the domain and
is labelled as proving only the domain, hard geographic disqualification for
opt-in jurisdictions built into the ICP's negative signals, and an approval
record on every outbound message. The compliance objection is not a footnote we
answer afterwards — it is the reason the architecture looks like this.

---

## 2. The three datasets

| Command (⌘K) | Shape | Use it for |
|---|---|---|
| **Load demo scenario** | 7 accounts, 8 buyers, hand-authored | Narration. Every record proves one specific thing (§3). |
| **Load scale dataset** | ~307 accounts, ~728 buyers, 2,133 nodes | The "this is production software" shot. Loads in ~50ms. |
| **Load stress dataset** | ~1,007 accounts, ~2,376 buyers, 6,802 nodes / 9,424 edges | Robustness. Loads in ~420ms; graph queries still 2–9ms. |

The generator is **deterministic** — a seeded PRNG, so the same seed produces
byte-identical output. You can rehearse against exactly what you will record.

Distributions are shaped rather than uniform, because a uniform dataset
flatters the system: fit scores form a bell curve centred near 60 (not a
cluster), signals follow a power law (most accounts have none, a few have
several), ~9% are disqualified across all five reasons, ~11% have no stated
headcount, ~7% have unresolvable domains, and the former-employer pool is
deliberately small so genuine warm-introduction paths exist. A uniformly random
graph has almost no two-hop paths, which would make the multi-hop queries look
better than they are.

The hand-authored records always sort to the top of the grid, so known answers
and realistic scale are not in tension.

---

## 3. Test cases — every record proves one thing

Each row's claim also lives in the `demonstrates` field in
`lib/fixtures/scenario.ts`, next to the data, so the two cannot drift.

### Accounts

| Record | Proves | What to say |
|---|---|---|
| **Northwind Ledger** (Tier A, 3 signals, renewal window) | Intent **aggregation**, not one loud event | "Three reinforcing signals — funding, a RevOps hire, eight open requisitions. The score adds them up, because two medium signals predict a purchase better than one press release." |
| **Pallas Robotics** (no headcount) | Honest nulls | "Nobody published a headcount, so the grid shows an em dash and the score gives partial credit. Unknown is not the same as wrong, and guessing a plausible number would be the easy lie." |
| **Verity Care Systems** (churn signal) | Displacement, evidence-weighted | "A public complaint about their incumbent scores higher than a renewal date, because dissatisfaction is stronger evidence than a calendar." |
| **Granite Freight** (hiring freeze) | Negative signal — **fit** | "Scores well on every firmographic and is still disqualified, minus forty, struck through with the reason on the row. The filter is auditable, not hidden." |
| **Meridian Analytik GmbH** (Germany) | Negative signal — **compliance** | "This one is excluded on legal grounds, not fit grounds. Opt-in jurisdiction, no entity in an opt-out market. That's the first objection a buyer's counsel raises, and it's encoded in the ICP." |
| **Cobalt Compliance** (`.invalid` domain) | Enrichment failing honestly | "No MX record, so the system refuses to claim an address. It says unresolved instead of showing you a pattern guess." |
| **Helio Commerce** (no signals, weak geo) | The score discriminating | "Tier C. Not everything it finds gets flattered." |

### Buyers

| Record | Proves | What to say |
|---|---|---|
| **Dana Okafor** (Northwind) | Warm intro via **shared employer** | "She and our founder both worked at Beacon Analytics. That's a referable introduction, two hops through the graph, not a cold approach." |
| **Priya Raghunathan** (Northwind) | Warm intro via **shared institution** | "Different bridge type — Carnegie Mellon — same query. The graph doesn't care which kind of shared history it is." |
| **Marcus Feld** (Pallas, CRO) | Active buying cycle | "New CRO at a company standing up CRM infrastructure. Aggregate intent clears the threshold, and he's the economic buyer." |
| **Elena Vasquez** (Verity) | Two queries **intersecting** | "She's a displacement target *and* reachable through a warm path. That intersection is the whole reason for a graph." |
| **Tobias Lindqvist** (Granite) | Disqualification propagating | "A 72% persona match at a frozen account. Good buyer, wrong moment — and the system never works him." |
| **Sam Oyelaran** (Cobalt) | Unresolvable contact | "Enrichment tried and failed, and told you so." |

### Mechanisms to trigger live

| Action | Proves |
|---|---|
| **Send** on an unapproved message | **403 from the server.** Not a disabled button — `dispatch()` looks for an approval record before touching a transport. ← *the single most important shot* |
| **Reject** with a reason | That message can never be dispatched, and the reason is in the audit trail |
| Enrich with 45 credits | **Gate fires after exactly 4 enrichments.** 724 buyers left unenriched, batch halted cleanly so a top-up resumes rather than restarts |
| **+300 credits** | Gated work resumes |
| Click **⬡** on any account row | Constellation re-focuses on that account's two-hop neighbourhood |
| Drag a pipeline card | Your move attributes to you; the agent's moves attribute to it |
| **Run agent collaboration** | Four Band agents hand off by @mention; the final message hands the dispatch decision to you by name because no agent can approve its own copy |

---

## 4. Pre-flight, 10 minutes before recording

```bash
# 1. Clean start, scale dataset, credits sized so the gate fires
curl -s -X POST localhost:3000/api/scenario \
  -H 'Content-Type: application/json' \
  -d '{"scale":300,"credits":45}' | python3 -m json.tool

# 2. Enrich — expect exactly 4 before the gate
curl -s -X POST localhost:3000/api/buyers \
  -H 'Content-Type: application/json' -d '{"enrich":true}' > /dev/null

# 3. Draft outreach on the enriched four
curl -s -X POST localhost:3000/api/outreach \
  -H 'Content-Type: application/json' \
  -d '{"variant":"signal_led","review":true}' > /dev/null

# 4. Graph queries + the agent room
curl -s -X POST localhost:3000/api/graph -H 'Content-Type: application/json' -d '{}' > /dev/null
curl -s -X POST localhost:3000/api/band -H 'Content-Type: application/json' -d '{}' > /dev/null
```

- [ ] Browser zoom 100%, thinking panel open
- [ ] At least one message still **pending** so you can reject it live
- [ ] At least one message **approved** so Send succeeds on camera
- [ ] Credits reading **5/45** so the gate story is visible in the header
- [ ] Band room open in a second tab
- [ ] Say the words "synthetic dataset" once, early. It costs four seconds and
      pre-empts the only awkward question in the room.

---

## 5. The learning layer — how to talk about RL without getting caught out

**Do not say "powered by reinforcement learning."** Your audience includes
people who know exactly what that means, and a vague claim invites the one
follow-up question that ends badly. The precise version is more impressive and
it is defensible under questioning.

### What is actually RL here, and you can say so flatly

**Variant selection is a contextual multi-armed bandit with Beta-Bernoulli
Thompson sampling.** That is a real sequential-decision policy, not a label:

- **Arms:** variant × channel (signal-led/peer-proof × email/LinkedIn)
- **Context:** buyer seniority band × whether a cited signal exists
- **Reward:** approval = 1, reply = 2, meeting = 3, rejection = 0 — the HITL
  gate *is* the reward signal
- **Exploration:** by sampling each arm's posterior, not a tuned epsilon

Open **Learning** in the rail. The curves are the arms' posterior beliefs about
their own success rates, drawn from the real Beta parameters. The line to use:

> "Each curve is an arm's posterior. Wide means we don't know yet, so it
> explores. Narrow means we have evidence, so it exploits. There's no
> exploration rate to tune — it falls out of sampling the posterior."

Then approve one message and reject another, and refresh. The curves move. A
bandit you can watch update is worth more than any slide about RL.

### What is RLHF substrate, stated as substrate

Every message a human **edits** before approving is a preference triple: the
model's draft is `rejected`, the human's edit is `chosen`. That is exactly the
shape DPO consumes, and the **Download DPO .jsonl** button hands over a real
training file.

> "The approval gate isn't just a safety mechanism — it's a preference-data
> generator. Every edit is a DPO pair. We're collecting the dataset. We have
> **not** fine-tuned on it, and I'm not going to claim we have."

That last sentence is the one that earns trust in a room of builders.

### What does not learn — say this out loud

The Learning view ends with a table where **three of five components are marked
"no"**: fit-score weights are hand-set, ICP inference is a frozen model with no
gradient flowing back, and the reviewer's thresholds are fixed rules.

> "Fit weights could be fit by logistic regression against closed-won outcomes.
> The plumbing is there. But n is nowhere near large enough to fit anything
> honest, so they stay hand-set — and the arithmetic stays on screen so you can
> argue with it."

Naming the boundary is the credibility move. A system that claims to learn
everywhere is a system nobody believes anywhere.

### If someone asks the expert question

> *"Isn't a bandit over two arms a bit trivial?"*

Yes, at four arms and two contexts it is small — and that is the honest state of
it at this data volume. The interesting part is that the **reward signal is
already instrumented end to end**: approval, reply and meeting outcomes all flow
back with correct credit assignment to the message that earned them. Scaling the
arm space (subject-line families, send timing, touch spacing) is a config change
rather than an architecture change, and the delayed-reward plumbing for replies
is the part that is usually missing.

---

## 6. Framing for this specific audience

Builders and founders will not be impressed by "AI finds leads" — they have all
seen that demo. Three things will land:

1. **"A fabricated citation is not something the model is asked to avoid. It's
   something it has no way to express."** The model never writes a URL; it
   picks indices into results we fetched, and we resolve them. That's an
   architectural answer to hallucination, not a prompt-engineering one.
2. **Press Send on an unapproved message and get a 403.** Everyone in that room
   has shipped a guardrail that was really just a disabled button.
3. **The reviewer catching the drafter.** Show the flagged message: the copy
   attributed a claim to "your agencies page" and the reviewer — running in a
   separate context that never saw the drafting prompt — caught it. Two models
   that can actually disagree is worth more than one model that agrees with
   itself.
