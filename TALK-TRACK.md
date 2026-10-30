# Talk track — the 2:55 demo video

Written against the brief's actual requirements:

> *"2–3 minute video walking through **product intake, automated graph
> matching, message composition, HITL review, and dashboard
> synchronization**."*

All five are covered, plus every weighted rubric row and both bonus
integrations. Target runtime **2:55** — inside the window with five seconds of
headroom.

**Narration: 386 words — measured, not estimated.** At a clear demo pace
(~150 wpm) that is 154 seconds of talking inside a 175-second video, leaving
21 seconds for the 403 pause and the visual beats. Read it; the first draft came
in at 493 words, which was 22 seconds over, and talking faster is not a fix.

---

## Rubric coverage map — check this before you record

| Rubric row | Weight | Covered at | How |
|---|---|---|---|
| ICP & Discovery Quality | **20%** | 0:14–0:56 | Inferred ICP with per-field confidence, cited leads, expansion segments |
| Enrichment & Outreach | **20%** | 1:12–1:52 | MX-validated resolution, signal-grounded copy, the 403 |
| Dashboard & Lead Management | **15%** | 1:52–2:08 | Kanban, AI-vs-rep attribution, step conversion |
| Startup Viability | **15%** | 0:00–0:14 + 2:44 | Pain, wedge, differentiation, pricing model |
| Technical Execution & Demo | **10%** | throughout | Working end to end, no stubs, scale shown |
| **Band Desktop** | **+20%** | 2:08–2:26 | Four agents, @mention handoffs, **and you making the HITL decision in the room** |
| **Flexprice** | **+20%** | 2:26–2:44 | Metered events mirrored live **and the credit gate firing** |

Two details from the rubric wording that change the script:

- Band's expectation is *"multi-agent collaboration **with HITL decision
  demo**."* Agents talking is not enough — **you** must be seen deciding.
- Flexprice's is *"active usage metering **and credit-gated execution**."*
  Events flowing is not enough — **the gate must fire on camera.**
- Snyk is **not** in the evaluation matrix (it appears only in the optional
  integrations section). It gets one clause at the close, not a beat.

---

## Pre-flight — 10 minutes before you hit record

```bash
# 1. Clean slate
curl -s -X POST localhost:3000/api/reset -d '{}' -H 'Content-Type: application/json'

# 2. Pre-warm every provider so nothing is cold on camera
curl -s -X POST localhost:3000/api/scenario -H 'Content-Type: application/json' \
  -d '{"scale":300,"credits":45}' > /dev/null
curl -s -X POST localhost:3000/api/buyers  -H 'Content-Type: application/json' -d '{"enrich":true}' > /dev/null
curl -s -X POST localhost:3000/api/outreach -H 'Content-Type: application/json' -d '{"review":true}' > /dev/null
curl -s -X POST localhost:3000/api/graph   -H 'Content-Type: application/json' -d '{}' > /dev/null
curl -s -X POST localhost:3000/api/band    -H 'Content-Type: application/json' -d '{}' > /dev/null

# 3. Then reset again — you want the WARM caches and the EMPTY state
curl -s -X POST localhost:3000/api/reset -d '{}' -H 'Content-Type: application/json'
```

- Browser at 100% zoom, 1440p, window maximised
- Band room open in a second tab
- Thinking panel open
- `TEST-CASES.md` §A1 paragraph in your clipboard
- Notifications off, dock hidden

**Record in one take, then cut.** The script has four marked cut points where
a model call runs. Do not sit through them on camera.

---

# The script

Format: **`[timecode]`** → *screen action* → **narration in bold**

---

### `[0:00–0:14]` · Hook + viability — *35 words*

*Screen: the landing page. Just the mark, the headline, and one empty field.*

> **"Every AI GTM tool hands you a confident score. SignalForge shows you the
> sentence and the URL it came from — and refuses to send anything a human
> hasn't approved. One input."**

*→ paste the paragraph, click **Forge my pipeline***

---

### `[0:14–0:38]` · Product intake → ICP — *62 words*
**Rubric: ICP & Discovery (20%) · Brief: "product intake"**

*Screen: the forging state — trace streaming, mark lit. Hold 4 seconds.*

> **"Three concurrent inference passes — firmographics, buyers, filters."**

**✂ CUT HERE** — *resume on the completed profile.*

*Screen: the one-sentence summary and the confidence dial.*

> **"One sentence to check. Fifty-seven percent — the system telling me my input
> was thin, because I never said who's paying me. Every field carries its own
> score and reason."**

*→ expand **Who to target**, click **how this was inferred***

---

### `[0:38–0:56]` · Discovery + expansion — *46 words*
**Rubric: ICP & Discovery (20%) — "real candidate leads with source citations, credible expansion segments"**

*→ click **Approve & find accounts**, then **Run discovery***

**✂ CUT** — *resume on the populated grid.*

*→ click a citation chip; a real source opens. Then point at the struck-through row.*

> **"Every account carries a source you can open. The model never writes a URL —
> it answers with indices into results we fetched. A fabricated citation isn't
> something it avoids; it's something it can't express. And this one's
> disqualified, with the reason on the row."**

*→ scroll to **Adjacent segments**, 2 seconds on a "missed because" line*

---

### `[0:56–1:12]` · Automated graph matching — *41 words*
**Brief: "automated graph matching"**

*→ click **⬡** on an account row. The constellation focuses.*

> **"Six thousand eight hundred nodes. One account's two-hop neighbourhood. The
> dashed edge is a bridge — someone on my side worked where that buyer did.
> A warm introduction, found by traversal."**

*→ expand **show Cypher** for 2 seconds*

> **"That's the real query, returning in two milliseconds."**

---

### `[1:12–1:28]` · Enrichment — *40 words*
**Rubric: Enrichment & Outreach (20%) — "verified contact resolution"**

*→ **⌘3** to Buyers. Point at the Method column.*

> **"Real DNS MX lookup on every domain. Sixty-two percent — not 'verified.'
> The domain accepts mail; that isn't the same as this mailbox existing. No MX
> here, so no address is claimed."**

---

### `[1:28–1:52]` · Message composition + HITL review — *58 words*
**Rubric: Enrichment & Outreach (20%) — "signal-personalized messages, strict HITL approval gate"**
**Brief: "message composition" + "HITL review"** ← **the centrepiece**

*→ **⌘5** to the Approval queue.*

> **"Three touches across email and LinkedIn, each quoting the signal that made
> this account in-market. A reviewer fact-checked it in a context that never saw
> the drafting prompt."**

*→ **press Send on a message still marked pending.** The 403 appears.*

**PAUSE TWO SECONDS. Say nothing.**

> **"That's the gate. Not a disabled button — the send function looks for an
> approval record before it touches a transport."**

*→ Reject one with a reason. Approve another. Send it. Point at the audit line.*

---

### `[1:52–2:08]` · Dashboard synchronization — *40 words*
**Rubric: Dashboard & Lead Management (15%) — "stage tracking, agent/rep attribution, conversion analytics"**
**Brief: "dashboard synchronization"**

*→ **⌘6** to Pipeline. The card that was just dispatched has moved to Contacted.*

> **"The dispatch moved that lead itself — tagged AI, because the agent did
> it."**

*→ drag a card from Contacted to Replied*

> **"I moved that one — tagged Rep. Every transition stores its actor. Below:
> step conversion and the AI-versus-rep split."**

---

### `[2:08–2:26]` · Band Desktop — *44 words*
**Bonus +20% — "multi-agent collaboration with HITL decision demo"**

*→ **⌘8** to Agent room → **Run collaboration**. Then **switch to the Band tab.**

> **"Four registered agents in a live Band room — Planner, Builder, Reviewer,
> Security — handing off by @mention."**

*→ scroll to Planner's final message, which names you*

> **"And it ends by handing the decision to me, by name. No agent in that room
> can approve its own copy."**

*→ **switch back and approve a message.** That is the HITL decision demo.*

---

### `[2:26–2:44]` · Flexprice + the learning layer — *45 words*
**Bonus +20% — "active usage metering and credit-gated execution"**

*→ **⌘7** to Usage & billing. Point at the ledger and the mirrored events.*

> **"Three metered events, mirrored live to Flexprice. The gate: forty-five
> credits, ten per enrichment — four went through, then it stopped. The check
> runs before the vendor call."**

*→ **⌘K** → **Show the learning layer**. Point at the posterior curves.*

> **"Variant choice is a contextual bandit — Thompson sampling. The approval
> gate isn't just safety, it's the reward signal."**

---

### `[2:44–2:55]` · Close — *26 words*
**Rubric: Startup Viability (15%) + Technical Execution (10%)**

*→ scroll to the honesty table in the Learning view*

> **"Three of those five components don't learn, and I'd rather tell you
> which. Usage-priced, graph-native, and every claim auditable. That's
> SignalForge."**

---

## Reinforcement learning — how to talk about it

The script spends 15 seconds on it because 15 seconds is what the rubric
affords. **If you get Q&A, this is where the depth goes.** Say it precisely —
your audience includes people who know the field, and a vague claim invites the
one question that ends badly.

**What is genuinely RL here — say this flatly:**

> "Variant selection is a **contextual multi-armed bandit** with
> **Beta-Bernoulli Thompson sampling**. Arms are variant-by-channel. Context is
> the buyer's seniority band crossed with whether a cited signal exists. Reward
> is approval one, reply two, meeting three, rejection zero — and replies
> arrive as **delayed reward**, credited back to the message that earned them.
> Exploration comes from sampling the posterior, so there's no epsilon to tune."

**The curves on screen are the proof.** Wide posterior = still exploring.
Narrow = exploiting. Approve something and refresh, and they move.

**What is RLHF substrate — call it that, not more:**

> "Every message a human **edits** before approving is a preference triple —
> the model's draft is rejected, the human's edit is chosen. That's exactly
> DPO's input format, and there's a button that downloads the JSONL. We're
> collecting the dataset. **We have not fine-tuned on it**, and I'm not going
> to claim we have."

**What does not learn — this is the credibility move:**

> "Fit-score weights are hand-set. They could be fit by logistic regression
> against closed-won outcomes and the plumbing is there, but n is nowhere near
> large enough to fit anything honest. ICP inference is a frozen model — no
> gradient flows back. The reviewer's thresholds are fixed rules."

**If asked "isn't a bandit over four arms trivial?":**

> "At four arms and two contexts, yes — that's the honest state at this data
> volume. The interesting part is that the reward signal is instrumented end to
> end, including delayed reward with correct credit assignment. Expanding the
> arm space is a config change. The delayed-reward plumbing is the part that's
> usually missing."

---

## Sponsor integrations — the specifics that prove they're real

### Band Desktop

Say these, in this order, if asked how deep the integration goes:

1. **Four separately registered remote agents**, each with its own Band identity
   and API key — `GV-Planner`, `GV-Builder`, `GV-Reviewer`, `GV-Security`. Not
   one process narrating four personas.
2. **@mention routing** in a real room. Agents only see messages that mention
   them; humans see everything.
3. **Both surfaces used** — chat messages for handoffs, execution events
   (`message_type: tool_call`) for the Security agent's gate-integrity record.
4. **6/6 delivered**, and every transcript line carries a `delivered` flag set
   from the real HTTP status.

**The war story, if someone asks what broke** — tell it, it lands well:

> "The published guide was incomplete, so I found the wire format by probing:
> `x-api-key`, not Bearer — a bearer token comes back as an invalid JWT.
> Mentions have to be objects with namespaced handles, minimum one. Events need
> a `message_type` enum. And the first run **logged six messages locally while
> Band rejected all six with a 422.** My own log said success. That's why every
> line now carries a delivered flag from the actual status code — I don't trust
> my own logging."

### Flexprice

1. **Three metered features** — `leads_enriched` (10 credits),
   `outreach_sent` (4), `graph_queries` (1).
2. **Live `POST /v1/events`** with `x-api-key`, returning **202 Accepted**.
3. **The local ledger enforces; Flexprice is mirrored.** If asked why not the
   other way round:

> "A billing outage must not take down enrichment, and a gate that depends on a
> network round-trip **fails open**. So the ledger is local and authoritative,
> and every event records whether its mirror succeeded — so the ledger can't
> silently diverge from the invoice without that being visible."

4. **Cost allocation per lead**, derived from the `personId` on each event.

### Snyk — one clause, not a beat

Not in the evaluation matrix, so don't spend video time. If it comes up:

> "SCA, SAST and a secret-hygiene job on every push. Zero issues on both scans.
> The hygiene job greps source for provider key patterns and asserts no env
> file is tracked — this service holds seven third-party credentials, so that's
> checked mechanically rather than left to review discipline."

---

## Editing notes

- **Four cut points are marked ✂.** Each sits where a model call runs. Cutting
  them is standard, and sitting through them costs you 40 of your 175 seconds.
- **The 403 pause is non-negotiable.** Two full seconds of silence. It's your
  best moment and silence is what makes it land.
- **Keep the trace panel visible the whole time.** It's the ambient proof the
  system is reasoning rather than replaying.
- **Caption the three hard numbers** if your editor allows: `6,802 nodes · 2ms`,
  `62% — not verified`, `403`.
- **Say "synthetic dataset" once**, at 0:14. Not again.

## If you overrun

Cut in this order:
1. The expansion-segments beat at 0:52 *(−4s)*
2. The Cypher expansion at 1:08 *(−3s)*
3. The A/B variant line at 2:04 *(−4s)*

**Never cut:** the 403, the Band handoff to a named human, or the credit gate.
Those are three rubric rows.
