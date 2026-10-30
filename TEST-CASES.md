# Test cases — scripted walkthroughs

Four runs, with **every field value written out** so you can copy-paste rather
than improvise mid-demo. Case A is the one to record.

Everything in **`code blocks`** is literal text to paste. Everything in
**bold** is a thing to click.

Before any case: **reset** in the top bar. Every stage must start unticked.

| Case | Purpose | Time |
|---|---|---|
| **A** | The video run — full path, strong product, happy case | ~4 min |
| **B** | Scale — 1,000 accounts, graph still at millisecond latency | ~60 s |
| **C** | Honest uncertainty — low confidence → clarification → climb | ~3 min |
| **D** | The gate gauntlet — 403, rejection, edit, credit gate | ~2 min |

---

# Case A — the video run

**Product:** an observability platform. Chosen because the buyer is technical
(so the room recognises them), the trigger events are vivid (outages), and it
produces a mid-range confidence you can be honest about.

### A1 · Landing page — the only field

Paste this into the single textarea:

```
We sell an observability platform to backend engineering teams running distributed systems. It traces a request across every service it touches and ties a latency regression back to the exact deploy that caused it, so an on-call engineer stops bisecting commits at 3am. Our users are platform and SRE teams at Series A to Series C companies — usually the first infrastructure hire who just inherited an on-call rotation and no tooling. They want traces, not a hundred dashboards. Self-serve starts at $400 a month and the team tier lands around $45,000 a year.
```

Click **Forge my pipeline**.

**Say while it runs (~22s):**
> "Three concurrent passes — firmographics, buyers, filters. They're independent,
> so this takes about as long as the slowest one rather than the sum. That was
> ninety-one seconds before I split it."

**Expect:** workspace opens. Product extracted as *"Observability platform"*
(the description never names it — the system doesn't invent a name, it writes a
category label). ACV `$45,000 a year`. Confidence **~57%**.

### A2 · The one sentence

**Expect** something close to:
> *"You sell to 25–250 person B2B software and infrastructure companies in the US
> and Canada, reaching Platform Engineering Leads and VPs of Engineering — best
> reached right after a production incident or outage."*

**Say:**
> "That's the only thing I need to read to know if it understood me. Fifty-seven
> percent — and that's the system telling me my own input was thin, not a
> failure. I never told it who's actually paying me."

### A3 · Open one group, one rationale

Expand **Who to target** → click **how this was inferred** on *Verticals*.

**Say:**
> "Every field has its own confidence and its own reason. This isn't a score
> you have to trust — it tells you what it was working from."

### A4 · Approve → discovery

Click **Approve & find accounts**. Rail spine advances a node.

Click **Run discovery** (~45s).

**Say:**
> "Several search angles in parallel, because one phrasing surfaces one slice of
> the web. The model never writes a URL — it gets a numbered list of results we
> actually fetched and answers with indices into it. A fabricated citation isn't
> something it's asked to avoid. It's something it has no way to express."

**Then:** click any **`[1] domain`** chip → a real source opens.
Hover a **fit ring** → the arithmetic.
Scroll to the struck-through row → read the disqualification reason aloud.

### A5 · Enrichment

Click **Find & enrich buyers** (~30s).

**Say, pointing at the Method column:**
> "`mx_validated_pattern`, sixty-two percent. Not 'verified.' A real DNS lookup
> proved the domain accepts mail — that is not the same as this mailbox
> existing, and the confidence ceiling says so."

Point at the credit counter dropping in the header.

### A6 · Outreach + the gate ← **the moment**

Click **Draft outreach** (~35s) → you land in **Approval queue**.

Point at a **"2 signals cited"** badge, then at a **reviewer: flagged** one.

**Say:**
> "The reviewer runs in a separate context that never sees the drafting prompt.
> Hand it the prompt and it just inherits the drafter's assumptions."

**Now press `Send →` on a message still marked *pending approval*.**

**403.** Pause two seconds.

> "That's the gate. Not a disabled button — the send function looks for an
> approval record before it touches a transport."

Then click **Reject** on that one. Paste as the reason:

```
Asserts they have no tracing in place. Nothing in the evidence supports that.
```

Click **Confirm reject**.

Now **Edit** a different touch-1 message. Append this to the end of the body:

```

Happy to send a 90-second Loom instead if that's easier than a call.
```

Click **Save & approve**, then **Send →**.

**Say:** read the audit line aloud — decision, who, timestamp, approval ID,
dispatch ID.

### A7 · Graph

Click **Run graph queries**, expand one **show Cypher**.

Then go to **Accounts** → click **⬡** on any row.

**Say:**
> "Two-hop neighbourhood, not a two-thousand-node hairball. The dashed violet
> edge is the bridge — someone on my side worked at the same company as that
> buyer. That query returns in two milliseconds."

### A8 · Pipeline → Learning → close

**Pipeline** → drag a card from **Contacted** to **Replied**.
> "I moved that, so it's attributed to me. The agent's moves are attributed to
> it."

**Learning** → point at the posterior curves.
> "Variant selection is a contextual bandit — Thompson sampling. Wide curve
> means explore, narrow means exploit, and there's no exploration rate to tune
> because it falls out of sampling the posterior. The approval gate isn't just
> safety — it's the reward signal."

Then the honesty table:
> "Three of these five don't learn, and I'd rather tell you which."

**Agent room** → **Run collaboration** → `6/6 delivered`.

---

# Case B — scale

No typing. Entirely keyboard.

1. **⌘K** → type `stress` → **Load stress dataset (1,000 accounts)**
2. **⌘2** (Accounts) → set the tier filter to **A** → scroll
3. **⌘4** (Graph) → **Run graph queries**

**Expect:** ~1,007 accounts / 2,376 buyers / **6,802 nodes / 9,424 edges**,
loaded in ~420ms, all three queries returning in **2–9 ms**.

**Say:**
> "Fit scores form a bell curve rather than clustering, which means the scorer
> is actually discriminating. The warm-intro query reports how many candidate
> paths it examined and whether it truncated — a bounded result should be
> visibly bounded."

---

# Case C — honest uncertainty

Shows the clarification loop. **This is the best interactive moment in the
product** and worth rehearsing separately.

### C1 · A deliberately thin description

**reset**, then paste:

```
We built a tool that helps sales teams write better cold emails using AI. It plugs into your CRM. Teams of all sizes use it and we charge per seat.
```

Click **Forge my pipeline**.

**Expect:** confidence **~30–40%**. Vague input, honestly low score.

**Say:**
> "Thirty-four percent. Deliberately vague input, and it says so rather than
> manufacturing a profile."

### C2 · Let it ask

Click **Raise it →** under the dial.

**Expect** four questions targeting its weakest fields. Paste these answers
(match by the field name in brackets, the wording may vary slightly):

**[industries] — who's paying you:**
```
Northbeam (B2B marketing analytics), Caddi (developer tooling), and Rillavoice (sales enablement for home services). All B2B SaaS between 40 and 180 people.
```

**[geographies] — where they're headquartered:**
```
All US. Six in SF, two in NYC, one in Austin. We've had no European deals.
```

**[revenueBand] — ARR at signing:**
```
Between $3M and $12M ARR, usually 8 to 20 people on the GTM team.
```

**[triggerEvents] — what happened before they signed:**
```
Every one of them had just hired their first VP Sales or RevOps lead in the previous 60 days, and that person was told to build outbound from nothing.
```

**[negativeSignals] — if asked about a lost deal:**
```
We walked away from a 600-person company that already had Outreach and a six-person SDR team. They wanted us to replace a workflow they'd spent two years building.
```

Click **Re-infer**.

**Expect:** a toast reading `Confidence 34% → 70-something%` with per-field deltas.

**Say:**
> "It reports which answers actually bought certainty and which didn't. That's
> the difference between a calibrated estimate and a vibe. And note what it
> asked — it went straight at the fields it knew were weakest."

---

# Case D — the gate gauntlet

Four safety mechanisms firing in two minutes. Run this when someone asks
*"how do I know it won't go rogue?"*

### D1 · Discovery blocked on approval
**reset** → paste any Case A description → **Forge my pipeline** → then click
**Accounts** in the rail **without approving**.

**Expect:** locked, tooltip *"Approve the ICP first."*

### D2 · Credit gate stops a batch mid-run
**⌘K** → **Load scale dataset** (sets credits to 45) → **Find & enrich buyers**.

**Expect:** exactly **4 enriched** at 10 credits each, then it stops. ~724
buyers untouched, header reads `credits 5/45`.

**Say:**
> "The check runs *before* the vendor call. A gate that checks after you've
> spent the money isn't a gate. And it halted cleanly — a top-up resumes it
> rather than restarting it."

Click **+300 credits** → run enrichment again → it resumes.

### D3 · Dispatch blocked without approval
**Draft outreach** → press **Send →** on a pending message → **403**.

### D4 · A rejection is permanent
**Reject** one with:
```
Claims they're migrating off a competitor. The evidence doesn't say that.
```
**Expect:** status `rejected`, Send unavailable, reason in the audit trail
permanently.

### D5 · Mail cannot reach a real prospect
Point out that dispatch is redirected to `DEMO_INBOX` regardless of the
resolved address, unless `SIGNALFORGE_ALLOW_REAL_SEND=true` is set.

**Say:**
> "The safe behaviour is what you get by forgetting to configure something.
> That's the only kind of default that actually holds."

---

## Every human input, in one place

| Where | What to type |
|---|---|
| Landing (Case A) | The observability paragraph in **A1** |
| Landing (Case C) | The thin cold-email paragraph in **C1** |
| Clarification ×4–5 | The five answers in **C2** |
| Rejection reason (A6) | `Asserts they have no tracing in place. Nothing in the evidence supports that.` |
| Message edit (A6) | `Happy to send a 90-second Loom instead if that's easier than a call.` |
| Rejection reason (D4) | `Claims they're migrating off a competitor. The evidence doesn't say that.` |

Everything else is a click. **Case A has exactly three typing moments**, and two
of them are a single sentence.

## Keyboard, so you never hunt for a button

| Key | Action |
|---|---|
| **⌘K** | Command palette — every step is reachable from here |
| **⌘1–8** | Jump to a view |
| **⌘↵** | Submit on the landing screen |
| **Esc** | Close the record drawer or palette |

## If something breaks mid-demo

**Say what broke.** This audience ships software; diagnosing live earns more
than a flawless run.

| Symptom | Cause | Say |
|---|---|---|
| Discovery returns 0 accounts | Tavily rate limit or a thin query | "Search came back empty — here's the same run from a prepared dataset" → **⌘K → Load scale dataset** |
| Everything already ticked | State left from a previous run | **reset**, start again |
| Trace looks frozen | A long model call mid-flight | "That's one call in flight — three run concurrently and the panel moves when the first returns" |
| Band shows `local only` | Room ID unset or agent key rotated | "The post wasn't accepted, and it says so rather than logging a success — that flag is set from the real HTTP status" |
