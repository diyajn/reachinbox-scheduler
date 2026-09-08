# ReachInbox Email Scheduler — Backend

## Setup

```bash
cd backend
npm install
cp .env.example .env

# start Redis + Postgres
docker compose up -d

# create the DB tables from the schema
npx prisma migrate dev --name init

# get free fake SMTP creds: go to https://ethereal.email/create -> copy the
# generated user/pass into .env as ETHEREAL_USER / ETHEREAL_PASS

# seed a demo user + sender (uses ETHEREAL_USER/PASS from .env)
npx ts-node prisma/seed.ts

# run API + worker together
npm run dev
```

API: http://localhost:4000
BullMQ dashboard: http://localhost:4000/admin/queues

## Architecture

**Scheduling.** Every email is a row in the `EmailJob` Postgres table
(status: SCHEDULED / SENT / FAILED / DELAYED_RATE_LIMIT). When a schedule
request comes in, we create the row *and* add a BullMQ **delayed job**
(`delay = scheduledFor - now`) whose `jobId` is the row's own id. No cron
anywhere — BullMQ's own timer wakes the worker when the delay elapses.

**Why the row id as BullMQ jobId matters (idempotency).** BullMQ refuses to
create a second job with a jobId that's already in the queue. So re-adding a
job for the same row (from an API retry, or from restart reconciliation) is
always a safe no-op — this is what prevents duplicate sends.

**Persistence across restarts.** Two layers:
1. Redis persists BullMQ's delayed jobs to disk (the docker-compose volume),
   so jobs already scheduled survive a container/process restart on their own.
2. On worker boot, `reconcileOnBoot()` in `src/worker.ts` re-reads every
   `SCHEDULED` row from Postgres and re-adds it to the queue. Because of the
   idempotency guarantee above, this is safe to run on every boot — it either
   no-ops (job already there) or recovers a job that never made it into Redis
   before a crash.

**Rate limiting.** `src/rateLimiter.ts` keeps a Redis counter keyed by
`sender + current hour` (`ratelimit:<senderId>:<hour>`), incremented
atomically with `INCR`. Because Redis serializes that command, this is safe
even with multiple worker processes hitting it at once — no in-memory
counter could give that guarantee. When a sender goes over
`MAX_EMAILS_PER_HOUR_PER_SENDER` (env-configurable), the job is **not**
dropped: the DB row is marked `DELAYED_RATE_LIMIT`, rescheduled to the top
of the next hour, and a Slack message fires (see below).

**Concurrency + minimum delay.** `WORKER_CONCURRENCY` (env) controls how
many jobs BullMQ's `Worker` processes in parallel. Inside each job handler
we `await sleep(MIN_DELAY_MS_BETWEEN_SENDS)` before sending, which throttles
how fast any single worker "slot" fires — the simplest correct way to
guarantee a minimum gap between sends without fighting BullMQ's queue-level
limiter across multiple senders.

**Slack.** `mailer.ts#notifySlackRateLimitHit` posts to the user's stored
Slack **incoming webhook URL** the moment a rate limit is hit. If no
`SlackConfig` row exists for the user (never connected), it's a silent
no-op — never throws, never crashes the worker. See "Still to build" below
for wiring the actual OAuth button.

**Behavior under load (1000+ emails at once).** The `/api/emails/schedule`
endpoint accepts a `recipients[]` array and a `delayBetweenEmailsMs` stagger —
it creates one row + one delayed job per recipient, offset by
`i * delayBetweenEmailsMs` from the requested start time. So "1000 emails
scheduled for the same instant" actually fan out in the queue rather than
firing simultaneously, and the per-hour rate limiter still applies on top of
that as a second safety net.

## Features implemented here

- [x] Scheduling via BullMQ delayed jobs (no cron)
- [x] Postgres as source of truth (Prisma)
- [x] Restart persistence + reconciliation
- [x] Idempotency (jobId = row id)
- [x] Redis-backed hourly rate limiting, per sender, configurable via env
- [x] Rescheduling (not dropping) jobs that exceed the rate limit
- [x] Configurable worker concurrency + min delay between sends
- [x] Live BullMQ dashboard at `/admin/queues`
- [x] Ethereal SMTP sending with preview URL captured on the row
- [x] Slack webhook notification on rate-limit hit (no-op if not connected)

## Still to build (see top-level repo README for the day-by-day plan)

- [ ] **Elasticsearch indexing** — index each `EmailJob` on create/update;
      add a `GET /api/emails/search?q=` route. Not started in this scaffold.
- [ ] **Slack OAuth flow** — currently only the *notification send* is wired.
      You still need `GET /auth/slack` (redirect to Slack's authorize URL)
      and `GET /auth/slack/callback` (exchange code for a token, save a
      `SlackConfig` row). Use `SLACK_CLIENT_ID`/`SECRET` from `.env.example`.
- [ ] **Google OAuth login** — same shape: `GET /auth/google` +
      `GET /auth/google/callback`, then create/update a `User` row and issue
      a session (a signed cookie or JWT is simplest given your JWT
      experience from PrimeTrade).

## Assumptions / trade-offs (mention these in your submission too)

- Multi-tenant senders exist in the schema, but the demo seed only creates
  one sender — enough to prove the rate-limit/idempotency logic end to end.
- Rate limiting resets on a fixed clock-hour boundary (`14:00–15:00`) rather
  than a rolling 60-minute window, for simplicity.
- CSV parsing of leads happens on the frontend before hitting `/schedule`
  (the API just takes a plain `recipients[]` array) — keeps the backend
  format-agnostic.
