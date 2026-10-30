# Demo video — 2:45 shooting script

Record at 1440p, browser zoom 100%, thinking panel open throughout.
**Pre-run everything once before recording** so searches are warm; then reset
and re-run live for the shoot.

---

**0:00–0:15 — The problem, stated once**

> "Every outbound tool asks you to trust a score. This one shows you the
> sentence and the URL it came from, and it refuses to send anything a human
> hasn't approved."

Screen: the empty intake form.

**0:15–0:40 — Intake → ICP**

Click **load example**, then **Infer ICP**. Let the thinking panel stream.

> "A paragraph in. Out comes a profile with a confidence score on every
> field — and it's honest: 48% overall, because the rationale says there are no
> reference customers yet to confirm the firmographics."

Hover one confidence bar to show the per-field reason.

**0:40–1:00 — Expansion, with evidence**

Scroll to Adjacent segments.

> "Three markets standard filtering throws away — PE search funds, higher-ed
> advancement teams, CRE brokerages. Each thesis was sent back out to live
> search."

**Click a citation chip.** Real source opens. Then **Dismiss** one segment and
**Approve profile.**

**1:00–1:25 — Discovery, including what got filtered**

Click **Run discovery**.

> "Five accounts kept, zero dropped for missing citations — because the model
> never writes a URL. It picks indices into results we actually fetched."

Point at the Tiledesk row.

> "And this one is disqualified, minus forty, with the reason visible:
> headquartered outside the target market. The filter isn't hidden — you can
> see what it removed and argue with it."

Hover a fit score to show the arithmetic.

**1:25–1:45 — Enrichment that doesn't overclaim**

Click **Find & enrich buyers**.

> "Real DNS MX validation on every domain. Note the label —
> `mx_validated_pattern`, 62%, not 'verified'. The domain accepts mail; that's
> not the same as this mailbox existing, and the confidence says so."

Point at the credit balance in the header dropping.

**1:45–2:15 — The gate (the centrepiece)**

Click **Draft outreach**. Scroll to the queue.

> "Three touches, email and LinkedIn, A/B split. Each one shows which cited
> signal it used — and flags itself generic if it used none. The reviewer agent
> fact-checked it in a separate context that never saw the drafting prompt."

**Press Send on an unapproved message.** The 403 appears.

> "That's the gate. Not a disabled button — the send function looks for an
> approval record before it touches a transport."

Now **Reject** one with a reason, **Approve** another, then **Send**. Show the
audit line: decision, who, timestamp, approval ID, dispatch ID.

**2:15–2:35 — Graph + pipeline**

Click **Run graph queries**. Expand one Cypher block.

> "Warm-intro paths, open buying cycles, displacement windows. That's the real
> query, not a decorative string."

Drag a card from Contacted to Replied.

> "I moved that one, so it's attributed to me. The agent's moves are attributed
> to it — the analytics split AI from rep because the brief asks who did what."

**2:35–2:45 — Bonuses + close**

Show the billing panel, then click **+300 credits**.

> "Flexprice metering, live — 202 Accepted on every event. Snyk runs SCA, SAST
> and a secret-hygiene check on every push. And everything you just saw carries
> a citation or an approval record."

---

## Shot checklist

- [ ] Confidence hover showing a per-field rationale
- [ ] Citation chip opening a real URL
- [ ] Disqualified row with its reason
- [ ] Fit-score arithmetic on hover
- [ ] `mx_validated_pattern` label at 62%
- [ ] Credit balance decreasing in the header
- [ ] **403 on unapproved Send** ← the single most important shot
- [ ] Rejection with reason, then approval, then dispatch
- [ ] Audit line with approval ID
- [ ] Real Cypher expanded
- [ ] Card drag changing attribution badge
- [ ] Credit top-up unblocking a gated operation
