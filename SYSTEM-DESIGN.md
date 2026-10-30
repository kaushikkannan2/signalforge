# Grapevine — System Design

Companion to `README.md`. This document covers what the README does not: the
graph ontology, the query logic, the reasoning loops, and how the bonus
services are wired.

---

## 1. Graph ontology

### Node labels

| Label | Identity | Key properties |
|---|---|---|
| `Company` | `company_<domain-slug>` | `domain`, `industry`, `naics`, `headcount`, `fit`, `tier`, `disqualified`, `external` |
| `Person` | `person_<domain>-<name-slug>` | `title`, `seniority`, `department`, `isInternal` |
| `Product` | `product_<slug>` / `edu_<slug>` | `ours`, `kind` (`institution` for education nodes) |
| `Competitor` | `comp_<domain-slug>` | `category` (direct/indirect/alternative), `positioning` |
| `Signal` | `signal_NNNN` | `category`, `observedAt`, `intentWeight` |
| `Lead` | `lead_NNNN` | `stage`, `tier`, `fit` |

`external: true` marks a company that exists only as a former employer —
it is a bridge for warm-intro pathing, not a prospect, and is excluded from
discovery results.

### Edge types

| Edge | From → To | Carries |
|---|---|---|
| `works_at` | Person → Company | `title` |
| `previously_employed_at` | Person → Company | — |
| `studied_at` | Person → Product(institution) | — |
| `competes_with` | Product(ours) → Competitor | `category` |
| `matched_to` | Person → Icp | `fit`, `tier` |
| `emits_signal` | Company → Signal | `category` |
| `uses_vendor` | Company → Competitor | `renewalWindow` |
| `contacted_via` | Person → Company | `channel`, `touch`, `at`, `status` |
| `replied_to` | Person → Company | `at` |

### Why a graph and not a wide table

The three questions that drive prioritisation are all relationship questions
at depth ≥ 2:

- *Who do we already know who can walk us in?* — two hops through a shared
  former employer or institution.
- *Which accounts have an open budget right now?* — company → signals →
  economic buyer, with the signal set scored in aggregate.
- *Who is paying a competitor and currently able to switch?* — company →
  vendor → our product, intersected with a churn signal.

Each is a join of unbounded depth over heterogeneous entities. In a relational
schema these become recursive CTEs over a polymorphic join table; in a
spreadsheet they are not expressible at all.

### Storage topology

The in-process graph is the **system of record**; Neo4j is a **write-through
mirror** that also serves the showcase Cypher.

Two reasons, both deliberate:

1. **Demo determinism.** A cold or absent Aura instance cannot break a live
   walkthrough.
2. **Honest Cypher.** Each reasoning query is written twice — real Cypher and
   an in-process traversal — and the two live adjacent in `lib/reasoning.ts`.
   The Cypher rendered in the UI is the query that would run, not a decorative
   string pasted next to unrelated logic. Keeping them in the same file is the
   mechanism that stops them drifting apart.

---

## 2. Query logic

Each query exposes `cypher`, `question`, `findings[]`, `nodeIdsTouched[]` and
`tookMs`. Every finding carries an `actionable` field, because a traversal
result that doesn't change what a rep does next is trivia.

### 2.1 Warm introduction paths

```cypher
MATCH (us:Person {isInternal: true})
      -[:previously_employed_at|studied_at]->(bridge)
      <-[:previously_employed_at|studied_at]-(target:Person)
      -[:works_at]->(acct:Company)
WHERE acct.disqualified = false
RETURN us.fullName AS introducer, labels(bridge)[0] AS bridgeKind,
       bridge.name AS sharedContext, target.fullName AS buyer,
       target.title AS buyerTitle, acct.name AS account, acct.fit AS fitScore
ORDER BY acct.fit DESC LIMIT 10
```

Path strength is the account's fit score, so a weak shared connection into a
strong account outranks a strong connection into a poor one. Findings are
deduplicated by headline — the same bridge often matches via both employment
and education, and surfacing it twice would overstate the signal.

### 2.2 Job requisitions as active buying cycles

```cypher
MATCH (acct:Company)-[:emits_signal]->(sig:Signal)
WHERE sig.category IN ['headcount_growth','tech_stack_change','exec_hire']
MATCH (buyer:Person)-[:works_at]->(acct)
WHERE buyer.seniority IN ['VP','C-Suite','Director','Founder']
WITH acct, buyer, collect(sig) AS signals,
     reduce(w = 0, s IN collect(sig) | w + s.intentWeight) AS intent
WHERE intent >= 15
RETURN acct.name, acct.fit, buyer.fullName, buyer.title, intent,
       [s IN signals | s.name] AS evidenceChain
ORDER BY intent DESC
```

The threshold of 15 is a floor on *aggregate* intent, not on any single signal,
so two medium signals qualify an account that one strong signal would not. The
reasoning: a company hiring for a role our product serves has already decided
to spend money on the problem — the job posting is the budget approval made
public. Reinforcing signals from different categories are better evidence than
one loud signal, which is often just a press release.

### 2.3 Competitor displacement

```cypher
MATCH (acct:Company)-[u:uses_vendor]->(comp:Competitor)<-[:competes_with]-(us:Product)
OPTIONAL MATCH (acct)-[:emits_signal]->(sig:Signal {category: 'competitor_churn'})
WITH acct, comp, u, sig
WHERE sig IS NOT NULL OR u.renewalWindow = true
RETURN acct.name, comp.name AS incumbent, comp.category, u.renewalWindow,
       sig.name AS churnSignal, acct.fit
ORDER BY acct.fit DESC
```

A churn signal scores 0.9 and a renewal window 0.65, because a public complaint
is stronger evidence of intent to switch than a contract date. Both exist
because the renewal window is the one moment switching cost is near zero even
without visible dissatisfaction.

---

## 3. Reasoning loops

### 3.1 The citation loop — index-constrained extraction

The central anti-hallucination mechanism, used by account discovery, buyer
discovery and competitor mapping alike:

```
plan N search angles from the approved ICP
   → fan out concurrently (Tavily)
   → flatten into ONE numbered pool of genuinely fetched results
   → hand the model the numbered pool; schema requires sourceIndices[]
   → resolve indices → real Evidence objects on OUR side
   → drop any record whose indices do not resolve; report the count
```

The model is never in a position to write a URL. Snippets are passed through
verbatim from the provider and never LLM-paraphrased, because a paraphrased
quote attributed to a source is indistinguishable from a fabricated one.

`droppedUncited` is returned to the UI rather than swallowed — a run that
dropped nine of ten candidates is telling the operator something about the
search angles, and hiding that would make the system look more confident than
it is.

### 3.2 The confidence loop

ICP inference emits a value, a 0.00–1.00 confidence and a one-sentence
rationale *in the same structured call*, so confidence is produced by the same
reasoning that produced the value rather than estimated afterwards. Overall
confidence is the unweighted mean across fields, and the UI explains that a low
number means the intake was thin — not that the profile is wrong. On the
dogfood example it lands near 0.48 and the rationale says why: no reference
customers exist yet to confirm the firmographics.

### 3.3 The draft → review → gate loop

```
draft (Sonnet 5, signal IDs required in schema)
   → filter claimed signal IDs against the real signal set
     (a hallucinated ID is silently dropped, so the "generic" badge is trustworthy)
   → reviewer pass (Opus 5, independent context — never sees the drafting prompt)
       · unsupported-claim extraction against evidence only
       · HEAD request on every URL in the body
   → ■ HUMAN GATE ■ approve / edit / reject
   → dispatch() verifies an ApprovalRecord exists and is not a rejection
   → meter outreach_sent, advance lead, write contacted_via edge
```

The reviewer deliberately receives only the evidence and the copy. Handing it
the drafting prompt would let it inherit the drafter's assumptions, which is
how two-model review collapses into one model agreeing with itself.

### 3.4 The credit loop

`assertCredits()` → expensive vendor call → `meter()`. The gate runs *before*
the spend, and on failure the batch halts cleanly rather than half-processing,
so a top-up resumes it rather than restarting it.

---

## 4. Bonus service integration

### Flexprice — usage metering and credit enforcement

Three metered events: `leads_enriched` (10 credits), `outreach_sent` (4),
`graph_queries` (1). Unit costs are deliberately cheap to exhaust so the gate
can be demonstrated inside a three-minute video.

Every metered operation does two things:

1. **Local ledger entry** — the enforcement source of truth.
2. **Mirror to `POST {FLEXPRICE_BASE_URL}/events`** with `x-api-key`, carrying
   `event_name`, `external_customer_id`, a deduplicating `event_id`, an RFC-3339
   `timestamp`, and `properties` including `credits`.

**Why the ledger is local and not Flexprice-derived:** a billing provider
outage must not take down the enrichment pipeline, and a gate that depends on a
network round-trip is a gate that fails open. Each event records whether its
mirror succeeded (`mirroredToFlexprice`, `flexpriceError`), so the ledger can
never silently diverge from the invoice without that being visible in
`/api/billing`.

Verified live against `https://us.api.flexprice.io/v1/events` → `202 Accepted`.

Cost allocation per lead is derived from `properties.personId` on each event,
which is what maps outreach cost to the commercial ledger.

### Snyk — security and compliance

Three CI jobs (`.github/workflows/security.yml`):

- **SCA** — `snyk test --severity-threshold=high --all-projects`. Verified
  locally: 0 issues.
- **SAST** — `snyk code test` with SARIF uploaded to GitHub code scanning.
  Requires the org-level Snyk Code toggle; without it the job reports
  `SNYK-CODE-0005` rather than passing silently.
- **Secret hygiene** — asserts no `.env`, `agent_config.yaml` or gh config dir
  is tracked, and greps source for `sk-ant-`, `tvly-`, `re_` and `snyk_uat.`
  patterns.

The third job exists because this engine holds seven third-party credentials
and the likeliest leak path is a committed env file, which is a mechanical
check rather than a review-discipline problem.

### Band Desktop — multi-agent orchestration

Four roles map onto the pipeline as follows:

| Role | Owns | Tool surface |
|---|---|---|
| Planner | Parses the brief, defines milestones, allocates work | read-only state |
| Builder | Discovery, graph mutation, enrichment, drafting | the POST routes |
| Reviewer | Fact-checks copy, validates that cited links resolve | `reviewMessage` |
| Security | Scans dispatch payloads and outbound links | audit endpoints |

Handoffs are `@mention`-routed in a shared room; schema changes and dispatch
both require human confirmation, so the HITL gate sits inside the agent
workflow rather than beside it. Telemetry is token counts and cumulative USD
from `lib/models.ts` pricing, reported as dollars because a token count is not
something an operator can act on.

**Integration status is stated honestly in the roadmap.** Band agents are
long-lived WebSocket processes and cannot run on serverless, so they run as a
local worker against the app's HTTP tool endpoints. Whether that worker is
wired to a real Band room or runs through our own orchestrator depends on
whether the four agent credentials were registered before the submission
deadline — and the README and roadmap say which of the two shipped rather than
implying the integration either way.
