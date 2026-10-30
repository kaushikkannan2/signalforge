# Pitch training — technical end to end

For: a room of builders, founders and solopreneurs.
Goal: they leave believing you built something architecturally serious, not a
wrapper with a nice UI.

Read this in order. §1–§3 are the pitch. §4 is the technical substrate so you
can answer "how does that actually work?" without hedging. §5 is the hard
questions. §6 is what *not* to say. §7 is practice drills.

---

## 1. The one sentence

Memorise this. It is the only thing you must say word-for-word.

> **"Every AI GTM tool hands you a confident score. We built the one that shows
> you the sentence and the URL it came from — and refuses to send anything a
> human hasn't approved."**

Why this sentence and not a feature list: it names a shared frustration in the
first clause, states your differentiator in the second, and the third clause
pre-empts the objection every buyer's counsel raises. It does all three in
about eight seconds.

**Do not open with "we use AI to find leads."** Everyone in that room has seen
that demo and most have built it.

---

## 2. Your spine — three claims that are structurally true

Everything else you say hangs off these. Each is enforced in code, which means
you can be unhedged about it, and that confidence is what the room reads.

### Claim 1 — "A fabricated citation isn't something the model is asked to avoid. It's something it has no way to express."

This is your best line. Deliver it slowly.

**The mechanism:** the model never writes a URL. It receives a *numbered list*
of search results we genuinely fetched, and the output schema forces it to
answer with **indices into that list**. We resolve those indices back to real
evidence objects on our side. Anything whose indices don't resolve is dropped
before it reaches the screen, and the count of what was dropped is reported.

**Why that matters, said out loud:** "Prompt engineering against hallucination
is a request. This is a type system. The model is structurally incapable of
inventing a source, because inventing one isn't in its output space."

### Claim 2 — "The gate isn't a disabled button."

**The mechanism:** `dispatch()` is the only path out of the system. Before it
touches a transport it looks up an approval record; with none, or with a
rejection, it throws. There's a second, independent guard beneath it that
refuses any recipient other than the demo inbox unless an env flag is
explicitly true.

**Demo this, don't describe it.** Press Send on an unapproved message and show
the 403. Then say:

> "Everyone here has shipped a guardrail that turned out to be a disabled
> button. The server refuses this independently of the UI."

### Claim 3 — "Three of five components don't learn, and I'll tell you which."

Counter-intuitive, and it's the one that earns trust with this audience.
Open the **Learning** view and point at the table. Details in §4.7.

---

## 3. The demo narration, beat by beat

Press **reset** in the top bar before you start. Every stage must begin
unticked — an audience that sees ticks assumes the work is already done.

### Beat 0 (0:00–0:15) — the sentence
Empty workspace on screen. Deliver §1. Say **"synthetic dataset"** once, here,
and move on. Four seconds that pre-empt the only awkward question in the room.

### Beat 1 (0:15–0:40) — intake → ICP
Click **load example**, then **Infer ICP**.

While it runs, narrate the trace, not the wait:
> "Three concurrent passes — firmographics, buyers, filters. They're
> independent, so wall-clock is the slowest one rather than the sum. That's
> ninety-one seconds down to twenty-two."

When it lands, point at the dial:
> "Forty-eight percent. That's the system telling me my own intake was thin —
> no reference customers, so every firmographic is extrapolation. It says so in
> its own rationale. I'd rather have an honest forty-eight than a
> manufactured ninety."

**This is a strength. Deliver it as one.** Then hover a confidence bar to show
the per-field reason.

### Beat 2 (0:40–1:00) — the confidence climb *(your best interactive moment)*
> "And when it's uncertain, it knows what to ask."

Trigger the clarification loop. It asks about precisely its weakest fields:
*"Name the last three companies that paid you"* — +30 points, because with zero
reference customers the verticals are inferred from capability rather than
observed from behaviour.

Answer two or three, re-infer, and show the **per-field deltas**.
> "It reports which answers actually bought certainty and which didn't. That's
> the difference between a calibrated estimate and a vibe."

### Beat 3 (1:00–1:25) — discovery, including what got filtered out
**Run discovery.**
> "Thirty sources, five accounts kept, zero dropped for missing citations."

Point at the disqualified row — struck through, not hidden:
> "This one scores well on every firmographic and is still disqualified. Minus
> forty, reason on the row: headquartered in an opt-in outbound jurisdiction.
> That's a *compliance* disqualifier, not a fit one — and it's the first
> objection a buyer's legal team raises."

Hover a fit score to show the arithmetic:
> "Industry twenty-five, size eight because headcount is unknown — unknown, not
> guessed — geo fifteen, intent thirty. You can disagree with the score and see
> exactly which component you disagree with."

### Beat 4 (1:25–1:45) — enrichment that doesn't overclaim
**Find & enrich buyers.**
> "Real DNS MX lookup on every domain. Note the label: `mx_validated_pattern`,
> sixty-two percent. Not 'verified.' The domain accepts mail — that is not the
> same as this mailbox existing, and the confidence ceiling says so."

Then point at the credit counter dropping, and the batch stopping:
> "Four enriched, then the credit gate fired. Seven hundred and twenty-four
> left untouched — and it halted *cleanly*, so a top-up resumes it rather than
> restarting it. The gate runs before the vendor call, because a gate that
> checks after you've spent the money isn't a gate."

### Beat 5 (1:45–2:15) — the centrepiece
**Draft outreach**, then the queue.
> "Three touches, email and LinkedIn. Each one shows which cited signal it
> used — and flags itself *generic* if it used none."

Point at a flagged message:
> "The reviewer runs in a separate context that never sees the drafting prompt.
> It caught this: the copy attributed a claim to 'your agencies page,' which the
> evidence doesn't support. Two models that can actually disagree is worth more
> than one model agreeing with itself."

**Press Send on an unapproved message. Get the 403.** Pause.
> "That's the gate."

Then reject one with a reason, approve another, send it, and show the audit
line: decision, who, timestamp, approval ID, dispatch ID.

### Beat 6 (2:15–2:35) — the graph
**Run graph queries**, expand one Cypher block.
> "Warm-introduction paths, open buying cycles, displacement windows. That's the
> real query — it sits in the same file as the traversal so the two can't drift
> into telling different stories."

Click **⬡** on an account row. The constellation focuses:
> "Two-hop neighbourhood, not a two-thousand-node hairball. The dashed violet
> edge is the bridge — someone on my side worked at the same company as that
> buyer. Six thousand eight hundred nodes, and that query returns in two
> milliseconds."

### Beat 7 (2:35–2:45) — learning, billing, security
Open **Learning**:
> "Variant selection is a contextual bandit — Thompson sampling. Each curve is
> an arm's posterior. Wide means explore, narrow means exploit, and there's no
> exploration rate to tune because it falls out of sampling. The approval gate
> isn't just safety — it's the reward signal."

Then the honesty table:
> "Three of these five don't learn, and I'd rather tell you that than claim
> they do."

Close on billing and Snyk:
> "Flexprice metering, live. Snyk on every push — dependencies, static
> analysis, and a secret-hygiene check, because this service holds seven
> third-party credentials."

---

## 4. Technical substrate — so you can answer "how?"

One subsection per module. Read until you can explain each **without** this
document.

### 4.1 Intake → ICP
- **Structured outputs**, not prompt-and-parse. A JSON schema is enforced at
  the API layer, so shape is guaranteed and only *content* needs review.
- **Three concurrent slices**: firmographics (verticals/NAICS, headcount,
  revenue, geo), buyers (personas, triggers), filters (negative signals, stack).
  Independent work → wall-clock is the slowest slice.
- **Confidence is produced by the same call that produces the value**, not
  estimated afterwards. Overall is the unweighted mean.
- **Why unweighted:** weighting toward strong fields moves the number without
  moving the knowledge. That's miscalibration.
- **NAICS verification** is deterministic against a curated list. A code not on
  the list returns **"unverified", never "invalid"** — absence from our list
  isn't proof the code is wrong.

### 4.2 Discovery
- **Multi-angle fan-out**: several query formulations in parallel, because one
  phrasing surfaces one slice of the web.
- **Index-constrained extraction** — Claim 1. Snippets pass through *verbatim*
  from the provider and are never LLM-paraphrased, because a paraphrased quote
  attributed to a URL is indistinguishable from a fabricated one.
- **Fit score**: 0–100 from five components (industry 25, size 20, geo 15,
  stack 10, intent 30) minus penalties. Decomposed and visible.
- **Unknown ≠ wrong**: a missing headcount gets partial credit (8 of 20), not
  a plausible guess.
- **Intent aggregates**: two medium signals outrank one loud press release.

### 4.3 Knowledge graph
- **Nodes**: Company, Person, Product, Competitor, Signal, Lead.
  **Edges**: `works_at`, `previously_employed_at`, `studied_at`,
  `competes_with`, `matched_to`, `emits_signal`, `uses_vendor`,
  `contacted_via`, `replied_to`.
- **Three multi-hop queries**, each written twice — real Cypher and an
  in-process traversal — kept adjacent so they can't diverge.
- **Storage topology**: in-process graph is the system of record; Neo4j is a
  write-through mirror. Two reasons: demo determinism, and the Cypher on screen
  is the query that *would* run rather than a decorative string.
- **Bounded traversal**: former-employer overlap is deliberately dense so warm
  paths exist at all, which makes an unbounded walk effectively quadratic. We
  take the best N and **report the bound** rather than silently truncating.
- **Server-side neighbourhoods**: the full graph is megabytes at scale, so the
  constellation endpoint computes the two-hop subgraph server-side.
  2.5 MB → 21.7 KB.

### 4.4 Enrichment
Three strategies, descending trustworthiness, and the UI always shows which:
| Method | Confidence | What it actually proves |
|---|---|---|
| `hunter_verified` | ≥0.80 | A vendor confirmed the mailbox |
| `mx_validated_pattern` | 0.62 cap | Pattern + real DNS MX. Proves the **domain** accepts mail — *not* that the mailbox exists |
| `pattern_inferred` | 0.25 | Pattern only; no MX |

> "An address we inferred must never render as one a vendor confirmed."

### 4.5 Outreach + review + gate
- Drafting is handed the **cited signals** and must return the **signal IDs it
  used**. IDs that don't exist are silently dropped, which is why the "generic"
  badge is trustworthy rather than self-reported.
- **Reviewer** gets only the evidence and the copy — never the drafting prompt.
  Handing it the prompt lets it inherit the drafter's assumptions, which is how
  two-model review collapses into one model agreeing with itself.
- **Link validation** is a real HEAD request on every URL in the body.
- **The gate**: `dispatch()` checks for an approval record before any transport
  call. Second guard refuses non-demo recipients unless explicitly overridden.

### 4.6 Pipeline + attribution
- Six stages. Every transition stores **actor** (`ai_agent` / `sales_rep` /
  `system`), actor name and reason.
- **Step conversion**, not conversion-from-top — the number beside each stage is
  the share that made it from the stage immediately before.
- Closed stages are terminal for agents: an agent can't quietly resurrect a
  lost deal.

### 4.7 The learning layer — know this cold
- **Algorithm**: contextual multi-armed bandit, **Beta-Bernoulli Thompson
  sampling**.
- **Arms**: variant × channel. **Context**: seniority band × whether a cited
  signal exists. Coarse on purpose — more contexts than observations learns
  nothing, and that's the most common way this technique is misapplied.
- **Reward**: approval 1, reply 2, meeting 3, rejection 0. Replies and meetings
  are **delayed reward**, credited back to the message that earned them.
- **Exploration**: posterior sampling. No epsilon to tune.
- **Why sample instead of using the mean:** the mean collapses exploration
  entirely and locks in whichever arm got lucky first.
- **Preference data**: every edited-and-approved message is a
  `(prompt, chosen, rejected)` triple — the human's edit is the chosen
  completion. That's DPO's input format, downloadable as JSONL.
  **Collected, not trained on.** A dataset is not a trained policy.
- **Does not learn**: fit weights (hand-set), ICP inference (frozen model),
  reviewer thresholds (fixed rules).

### 4.8 Metering + security
- Three metered events: `leads_enriched` (10 credits), `outreach_sent` (4),
  `graph_queries` (1).
- **Local ledger enforces; Flexprice is mirrored.** Why: a billing outage must
  not take down enrichment, and a gate that depends on a network round-trip
  **fails open**. Each event records whether its mirror succeeded, so the
  ledger can't silently diverge from the invoice.
- **Snyk**: SCA + SAST + a secret-hygiene job that greps for provider key
  patterns and asserts no env file is tracked. Gating rather than reporting,
  because this service holds prospect contact data and sends mail on a human's
  behalf.

### 4.9 Multi-agent
Four registered agents — Planner, Builder, Reviewer, Security — handing off by
`@mention` in a live room. The final message hands the dispatch decision to a
human **by name**, because no agent in the room can approve its own copy.

Worth mentioning if asked how it went: the published integration guide was
incomplete, so the wire format was found by probing — `x-api-key` not Bearer,
mentions as objects with namespaced handles, events with a `message_type` enum.
**And the first run silently logged six messages locally while the API rejected
all six.** Every transcript line now carries a `delivered` flag set from the
real HTTP status. Tell that story if someone asks what broke — it shows you
verify instead of trusting your own logs.

---

## 5. The hard questions

### "Isn't this just a wrapper around an LLM and a search API?"
> "The LLM is a component. The engineering is the constraints around it: the
> model can't emit a URL, so it can't fabricate a citation; it can't dispatch,
> because dispatch requires an approval record it can't create; and it can't
> outrun its budget, because the credit check runs before the vendor call.
> Those three are type-level and gate-level, not prompt-level."

### "You're guessing people's email addresses. Isn't that a GDPR problem?"
> "Yes — which is why the system refuses to overstate what it knows. Three
> resolution methods with different confidence ceilings. A real DNS check,
> labelled as proving only the domain. Opt-in jurisdictions are a hard
> disqualifier in the ICP's negative signals. An approval record on every
> outbound message. The compliance objection isn't a footnote we answer
> afterwards — it's why the architecture looks like this."

### "Isn't a bandit over four arms trivial?"
> "At four arms and two contexts, yes, it's small — that's the honest state at
> this data volume. The interesting part is that the reward signal is
> instrumented end to end, including delayed reward from replies with correct
> credit assignment. Expanding the arm space — subject-line families, send
> timing, touch spacing — is a config change. The delayed-reward plumbing is
> the part that's usually missing."

### "Why is confidence only forty-eight percent?"
> "Because my intake had no reference customers, and the system says so rather
> than hiding it. Watch —" *(run the clarification loop)* "— it knows which of
> its own fields are weakest and asks about exactly those."

### "What's your moat? Clay could ship this."
> "Clay could ship citations. What compounds is the graph: warm-intro paths,
> job-requisition-to-buying-cycle links, displacement windows. Those are
> multi-hop relationship questions — awkward in a relational schema, impossible
> in a spreadsheet, and the spreadsheet is their core metaphor. Every run adds
> nodes and edges, so the hundredth account is cheaper to work than the first."

### "How do you know the leads are real?"
> "Click a citation chip. It opens the source. Hover it first and you'll see the
> verbatim snippet it was drawn from — passed through from the provider, never
> paraphrased."

### "What doesn't work?"
Answer this one *fast and specifically*. Hedging here costs more than the gaps do.
> "Pipeline state is in-process — survives a page reload, not a server restart;
> Neo4j is the production answer. LinkedIn has no open API for unsolicited
> messaging, so those touches are drafted, approved and queued, and recorded as
> *simulated* — never as sent. Reply detection is manual; there's no inbound
> webhook yet. And fit weights aren't calibrated against outcome data, because
> there isn't any outcome data yet."

---

## 6. What not to say

| Don't say | Because |
|---|---|
| "Powered by reinforcement learning" | Vague, and one follow-up exposes it. Say "contextual bandit with Thompson sampling" — precise and more impressive. |
| "We use RLHF" | You collect preference data. You haven't trained. Say exactly that. |
| "It's fully autonomous" | It is deliberately *not*. The gate is the feature. |
| "100% accurate" / "no hallucinations" | Claim the mechanism, not the outcome: the model can't express a fabricated citation. |
| "Verified emails" (for pattern-inferred ones) | The UI distinguishes three methods. Match its precision. |
| "We're better than Clay/Apollo" | Name the structural difference instead. Comparative claims invite scoring arguments you can't win in a room. |
| Apologising for the 48% | Deliver it as calibration. Hedging turns a strength into a weakness. |

---

## 7. Practice drills

Do these in order. Out loud. Record yourself on drill 2 and 4.

**Drill 1 — the sentence (today, 10×)**
§1, word for word, until it's muscle memory. You should be able to deliver it
while distracted.

**Drill 2 — ninety seconds, no screen**
Spine only: the three claims from §2, nothing else. No feature list. If you
can't do this without the UI, the pitch is leaning on the demo.

**Drill 3 — the module quiz (no notes)**
Say out loud, in two sentences each:
- How a fabricated citation is made impossible
- What MX validation does and does not prove
- Why the local ledger enforces instead of Flexprice
- Why the reviewer never sees the drafting prompt
- What the bandit's reward signal is
- Three components that don't learn

Any you can't answer cleanly, re-read that §4 subsection.

**Drill 4 — the full demo, timed**
Target 2:45. Over three minutes means cutting a beat, not talking faster.
Beat 6 (graph) is the most cuttable; Beat 5 (the gate) is never cuttable.

**Drill 5 — hostile Q&A**
Have someone read §5 questions in random order, plus these:
- "What happens if Tavily goes down mid-demo?"
- "Who's the buyer — founder or VP Sales?"
- "What does this cost to run per lead?"
- "Why should I trust a confidence score from the same model that made the claim?"

**Drill 6 — the thirty-second version**
For a hallway. Sentence from §1, then one claim from §2, then "want to see the
403?"

---

## 8. Delivery notes

- **Pause after the 403.** Let it sit for two seconds. It's your best moment and
  silence makes it land.
- **Narrate the trace while things load.** Never say "it's thinking" — say what
  it's doing. Dead air is where attention goes.
- **Say "synthetic dataset" once, in beat 0.** Not again.
- **When something breaks, say what broke.** This audience has shipped software.
  Diagnosing live earns more than a flawless run.
- **Low numbers are deliverable.** 48% confidence, "0 DPO pairs so far", "three
  of five don't learn" — delivered flatly, these read as rigour. Delivered
  apologetically, they read as gaps.
- **Don't scroll past the disqualified row.** Stop on it. The filter firing
  visibly is more persuasive than the leads it kept.
