# Day-by-day plan (today = Day 1, deadline Sep 9 5PM = end of Day 2)

Priority order matters more than completeness here — a working scheduler with
persistence/idempotency/rate-limiting (the "hard constraints" section) scores
higher than a half-broken app that also has Elasticsearch. Build in this order.

## Before anything: repo + tooling setup

```bash
# Install Node.js 20 LTS if you don't have it: https://nodejs.org
node -v   # confirm it printed something >= v20

# Install Docker Desktop if you don't have it (for Redis + Postgres)

git init reachinbox-scheduler
cd reachinbox-scheduler
git branch -M main
```

Copy the `backend/` and `frontend/` folders you were given into this repo
root, then:

```bash
git add .
git commit -m "chore: scaffold backend and frontend project structure"
```

Create the GitHub repo (private), then:

```bash
git remote add origin https://github.com/<your-username>/reachinbox-scheduler.git
git push -u origin main
```

Add collaborators now (Settings → Collaborators → add `Mitrajit`,
`Yadav036`) so you don't forget later.

---

## Day 1 (today) — backend must fully work end-to-end

**Goal by end of today: you can POST an email via Postman, see it in the
BullMQ dashboard, and see it arrive in Ethereal's inbox at the right time —
including surviving a restart.**

1. `cd backend && npm install`
   Commit: `git commit -am "chore: add backend dependencies"` (commit
   `package-lock.json` too — don't gitignore it)

2. Run `docker compose up -d`, confirm `docker ps` shows redis + postgres
   healthy.

3. `cp .env.example .env`, go to https://ethereal.email/create, generate a
   test account, paste the user/pass into `.env`.

4. `npx prisma migrate dev --name init` — this creates your tables.
   Commit: `git commit -am "feat: add prisma schema for users, senders, email jobs"`

5. `npx ts-node prisma/seed.ts` to create a demo user + sender.

6. `npm run dev` — this starts the API (port 4000) and the worker together.
   Open http://localhost:4000/admin/queues — you should see an empty BullMQ
   dashboard load.

7. Test scheduling with Postman/curl:
   ```bash
   curl -X POST http://localhost:4000/api/emails/schedule \
     -H "Content-Type: application/json" \
     -d '{
       "senderId": "demo-sender-id",
       "recipients": ["test1@example.com","test2@example.com"],
       "subject": "Hello from ReachInbox",
       "body": "<p>Test email</p>",
       "startTime": "2026-09-08T12:00:00.000Z",
       "delayBetweenEmailsMs": 2000
     }'
   ```
   Use a `startTime` ~1-2 minutes in the future so you can actually watch it
   fire. Check `/admin/queues` — you should see a delayed job. Wait for it —
   check `GET /api/emails/sent` and confirm status flips to `SENT`, and grab
   the Ethereal preview URL from the row's `errorMessage` field (it's reused
   to store the preview link — rename this field if it bugs you) to see the
   rendered email.
   Commit: `git commit -am "feat: schedule and sent email API routes wired to BullMQ"`

8. **Restart test (this is graded explicitly)**: schedule an email 3-4
   minutes out, kill the `npm run dev` process (Ctrl+C), wait a few seconds,
   restart `npm run dev`, and confirm the email still sends at the right
   time and doesn't duplicate. Watch the console — `reconcileOnBoot` logs how
   many pending jobs it found.
   Commit: `git commit -am "test: verify restart persistence and idempotent job recovery"`

9. Test rate limiting: temporarily set `MAX_EMAILS_PER_HOUR_PER_SENDER=2` in
   `.env`, restart, schedule 4 emails at the same `startTime`. Confirm 2 send
   and 2 flip to `DELAYED_RATE_LIMIT` with a `scheduledFor` pushed to the next
   hour. Set the env var back to something realistic afterward.
   Commit: `git commit -am "feat: redis-backed hourly rate limiter with reschedule-not-drop behavior"`

10. Write the backend README sections you customize (delay chosen, rate
    limit approach) — the scaffold README already has a draft, just adjust
    numbers to what you actually tested.
    Commit: `git commit -am "docs: backend architecture and setup instructions"`

**If you have time left today:** start on Google OAuth for the frontend
(see Day 2, step 3) — the login screen is worth doing early since it blocks
your demo video's opening shot.

---

## Day 2 — frontend + whatever stretch goals fit

**Goal: dashboard usable end-to-end from the browser, then spend remaining
hours on OAuth/Slack/Elasticsearch in that priority order.**

1. `cd frontend && npm install && cp .env.local.example .env.local`
   `npm run dev` → http://localhost:3000 — confirm the dashboard loads and
   shows the rows you scheduled via curl yesterday.
   Commit: `git commit -am "feat: dashboard page with scheduled/sent tabs"`

2. Go to `/compose`, upload a small `.csv` (one email per line, or a column
   of emails), fill the form, submit, confirm it lands in the backend.
   Commit: `git commit -am "feat: compose page with CSV upload and scheduling form"`

3. **Google OAuth** (do this before styling — it's required, styling is
   "closely follow Figma" i.e. best-effort):
   - Go to Google Cloud Console → create OAuth 2.0 credentials (Web
     application), authorized redirect URI:
     `http://localhost:4000/auth/google/callback`
   - Simplest implementation given your JWT background: on the backend, add
     `GET /auth/google` that redirects to Google's consent screen, and
     `GET /auth/google/callback` that exchanges the code, upserts a `User`
     row, and issues a JWT in an httpOnly cookie. On the frontend, replace
     the hardcoded `DEMO_USER` in `layout.tsx` with a fetch to a new
     `GET /api/me` backend route that reads that cookie.
   - If you're short on time: `next-auth` (`npm i next-auth`) with the
     Google provider is faster to wire than hand-rolled OAuth, at the cost
     of the session living on the frontend instead of your own backend —
     acceptable trade-off, just say so in the README's assumptions section.
   Commit: `git commit -am "feat: google oauth login"`

4. **Slack OAuth flow** (the notification-send side already works in the
   scaffold — you're adding the "Connect Slack" button flow):
   - Create a Slack app at https://api.slack.com/apps → enable Incoming
     Webhooks → OAuth & Permissions → add redirect URL
     `http://localhost:4000/auth/slack/callback`.
   - Backend: `GET /auth/slack` redirects to Slack's `oauth/v2/authorize`;
     `GET /auth/slack/callback` exchanges the code for a webhook URL, saves
     it to `SlackConfig`.
   - Frontend: a "Connect Slack" button in the header that links to
     `http://localhost:4000/auth/slack`.
   Commit: `git commit -am "feat: slack oauth connect flow"`

5. **Elasticsearch** (do this last — lowest weight vs. effort of the
   remaining items):
   - `docker compose` add an `elasticsearch:8.x` service.
   - On every `EmailJob` create/update in `routes/emails.ts` and
     `worker.ts`, also index/update the doc in an `emails` ES index.
   - Add `GET /api/emails/search?q=` using a simple `match` query over
     subject/recipient/body.
   Commit: `git commit -am "feat: elasticsearch indexing and search endpoint"`

6. Polish pass: loading/empty states (already scaffolded), error toasts on
   failed schedule submissions, tighten spacing/colors to the Figma.
   Commit: `git commit -am "polish: loading states, error handling, figma alignment"`

7. Record the demo video (script below), finalize both READMEs' "features
   implemented" checklists to match what actually works, note trade-offs.
   Commit: `git commit -am "docs: finalize readme with features and assumptions"`

8. Final push, double-check collaborators are added, submit.

---

## If you run out of time before Elasticsearch/Slack/Google OAuth are done

Ship what works. A scheduler that's genuinely restart-safe, idempotent, and
rate-limited (the explicit "hard constraints" section of the brief) with a
working dashboard beats a broken attempt at everything. In the README's
"assumptions / shortcuts" section, say plainly what's stubbed and why —
graders read that section; being upfront reads a lot better than silently
missing pieces.

## Demo video script (≤5 min)

1. (30s) Show the repo structure, mention tech stack.
2. (60s) Compose an email in the UI → CSV upload → schedule → show it appear
   in "Scheduled" tab and in the BullMQ dashboard.
3. (60s) Wait for / fast-forward to it sending → show "Sent" tab, open the
   Ethereal preview link on screen.
4. (90s) **Restart demo**: stop the server, show the DB still has the row as
   SCHEDULED, restart, show it still fires at the right time, mention (or
   also demo) that re-adding doesn't duplicate.
5. (60s) Rate limiting: schedule enough emails to exceed your configured
   limit, show the Slack notification arriving, show the row's status
   changing to `DELAYED_RATE_LIMIT` with a pushed-out time.
