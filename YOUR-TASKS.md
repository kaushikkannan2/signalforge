# Your Parallel Track — Accounts & Keys

**Rule for all of these:** never paste a key into the chat. Put it straight into
`/Users/kaushikkannan/gtm-engine/.env.local` (I created it with placeholders) and
just tell me "Tavily done". The file is gitignored and I never print its contents.

Quickest way to edit it from this session: type
`! open -e /Users/kaushikkannan/gtm-engine/.env.local`
(the `!` prefix runs the command and opens it in TextEdit).

Do them in this order. Total hands-on time ≈ 45 min.

---

## 1. Anthropic API key — DO THIS FIRST (2 min) 🔴 blocks everything
You said you have this.
1. https://console.anthropic.com/settings/keys
2. Create key → copy.
3. In `.env.local`, set `ANTHROPIC_API_KEY=sk-ant-...`
4. Tell me "anthropic done".

Why it blocks me: ICP inference, discovery synthesis, outreach copy and all four
Band agents run on it. Without it I can only build the shell.

---

## 2. GitHub repo + login (5 min) 🔴 blocks deploy & Snyk
The submission requires a *public* repo.
1. Run: `! gh auth login` → choose GitHub.com → HTTPS → authenticate in browser.
2. Tell me "gh done" — I'll create and push the public repo myself.

---

## 3. Vercel (5 min) 🔴 blocks the live URL deliverable
1. https://vercel.com/signup → **Continue with GitHub**.
2. Run: `! npx vercel login` → pick GitHub → confirm in browser.
3. Tell me "vercel done" — I'll link and deploy from the CLI.

---

## 4. Tavily — live search with citations (3 min) 🟠 high value
This is what makes discovered leads real and citable instead of fixture-backed.
1. https://app.tavily.com/sign-in → sign up (Google works).
2. Dashboard shows your key immediately: `tvly-...` (1,000 free credits/mo).
3. `.env.local` → `TAVILY_API_KEY=tvly-...`

---

## 5. Band.ai — +20 marks (12 min) 🟠 highest marks-per-minute after Snyk
Register **four** remote agents and one room. Each key is shown **once** — copy as you go.
1. https://www.band.ai → sign up (free tier, no card).
2. Go to https://app.band.ai/agents
3. Click **New Agent** → choose **Remote Agent** → name it exactly `GV-Planner`
   → copy the **API Key** and the **Agent UUID** (UUID is in the agent's settings).
4. Repeat for `GV-Builder`, `GV-Reviewer`, `GV-Security`.
   (Don't use generic names like "Assistant" — their guide warns against it.)
5. Create a chatroom named `GTM War Room`. In the participants panel, add all four
   agents **and yourself** (you need to be in it to drive the HITL demo on camera).
6. Fill in `.env.local`:
   ```
   BAND_PLANNER_AGENT_ID=   BAND_PLANNER_API_KEY=
   BAND_BUILDER_AGENT_ID=   BAND_BUILDER_API_KEY=
   BAND_REVIEWER_AGENT_ID=  BAND_REVIEWER_API_KEY=
   BAND_SECURITY_AGENT_ID=  BAND_SECURITY_API_KEY=
   BAND_ROOM_ID=
   ```
   (Room ID is in the room's URL.)
7. Reference if you get stuck: https://www.band.ai/hacker-guide

---

## 6. Flexprice — +20 marks (10 min) 🟠
1. https://flexprice.io → **Get started** / sign up → note which region you land in
   (US → `https://us.api.flexprice.io/v1`, India → `https://api.cloud.flexprice.io/v1`).
2. Create a **Customer** — set its external ID to exactly `grapevine-demo-org`.
3. Create three **Metered Features**, event names exactly:
   - `leads_enriched`
   - `outreach_sent`
   - `graph_queries`
4. Create an API key (Developers / API Keys section).
5. `.env.local`:
   ```
   FLEXPRICE_API_KEY=
   FLEXPRICE_BASE_URL=https://us.api.flexprice.io/v1
   FLEXPRICE_CUSTOMER_ID=grapevine-demo-org
   ```
6. Docs if needed: https://docs.flexprice.io/docs/event-ingestion/sending-events

---

## 7. Snyk — +20 marks (5 min) 🟠 cheapest points on the board
1. https://app.snyk.io/login → **Continue with GitHub** (authorize).
2. Top-right avatar → **Account settings** → **General** → **Auth Token** → click to show → copy.
3. `.env.local` → `SNYK_TOKEN=...`
4. After I push the repo I'll tell you to add the same token as a GitHub Actions
   secret named `SNYK_TOKEN` (Settings → Secrets and variables → Actions → New secret).

---

## 8. Resend — real outbound email (4 min) 🟡 nice-to-have
Lets the HITL "Approve & Send" button actually deliver mail on camera.
1. https://resend.com/signup → **API Keys** → Create → copy `re_...`
2. `.env.local` → `RESEND_API_KEY=re_...`
3. No domain setup needed — I'll send from `onboarding@resend.dev`. Note their test
   mode only delivers to the address you signed up with, which is fine: in the demo
   we send to your own inbox and show it arriving.

---

## 9. Hunter.io — verified emails (3 min) 🟡 nice-to-have
Without it I use DNS MX validation + pattern inference, which is genuinely real but
scores lower on "verified contact resolution".
1. https://hunter.io/users/sign_up (free: 25 searches/mo)
2. Dashboard → **API** → copy key.
3. `.env.local` → `HUNTER_API_KEY=...`

---

## 10. Neo4j Aura Free — do this LAST (10 min) 🟡
Only worth it if the above are done. The rubric has no standalone graph line item,
and I have an in-process graph with real multi-hop traversal as the fallback.
1. https://console.neo4j.io → sign up → **New Instance** → **AuraDB Free**.
2. **Download the credentials file when prompted — the password is shown once.**
3. Wait ~3 min for it to go green.
4. `.env.local`:
   ```
   NEO4J_URI=neo4j+s://xxxx.databases.neo4j.io
   NEO4J_USERNAME=neo4j
   NEO4J_PASSWORD=...
   ```

---

## What I need from you on camera (last 40 min)
- You in the Band `GTM War Room` approving one agent handoff.
- You clicking **Approve & Send** in the HITL queue, and **Reject** on one message.
- Your inbox showing the delivered email.
