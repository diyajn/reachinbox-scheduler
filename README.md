# ReachInbox Email Scheduler

A production-shaped full-stack email scheduler built with BullMQ, Redis, PostgreSQL, Elasticsearch, and Next.js.

## Tech Stack

**Backend:** TypeScript, Express, BullMQ, Redis, PostgreSQL, Prisma, Nodemailer, Elasticsearch, Google OAuth, Slack OAuth
**Frontend:** Next.js, TypeScript, Tailwind CSS
**Infrastructure:** Docker Compose

## Project Structure

```text
backend/     Express API + BullMQ worker
frontend/    Next.js dashboard
```

## Quick Start

### 1. Start Infrastructure

```bash
cd backend
docker compose up -d
```

Starts Redis, PostgreSQL, and Elasticsearch.

### 2. Start Backend

```bash
npm install
cp .env.example .env
npx prisma migrate dev --name init
npx ts-node prisma/seed.ts
npm run dev
```

Backend runs on `:4000` and BullMQ dashboard on `/admin/queues`.

### 3. Start Frontend

```bash
cd ../frontend
npm install
cp .env.local.example .env.local
npm run dev
```

Frontend runs on `:3000`.

See `backend/README.md` for complete environment and credential setup.

## Key Features

### Backend

* BullMQ delayed jobs for email scheduling — no cron
* PostgreSQL as the source of truth
* Restart-safe job reconciliation
* Idempotent email sending using `jobId = EmailJob.id`
* Redis-based per-sender hourly rate limiting
* Rate-limited jobs are rescheduled instead of dropped
* Slack notification when rate limits are reached
* Configurable worker concurrency and send delay
* Ethereal SMTP with email preview URLs
* Google OAuth authentication with JWT
* Slack OAuth integration
* Elasticsearch indexing and email search
* BullMQ dashboard for monitoring jobs

### Frontend

* Google login and protected dashboard
* Logged-in user information and logout
* Slack connection status
* Scheduled / Sent email tabs
* Compose page with CSV/TXT recipient upload
* Recipient count detection
* Subject, body, start time, delay, and hourly-limit configuration
* Loading, empty, and basic error states

## Architecture

### Scheduling

Each email is stored in PostgreSQL as an `EmailJob` and scheduled in BullMQ as a delayed job.

The BullMQ `jobId` is the same as the database row ID, which prevents duplicate jobs.

### Restart Safety

On worker startup, all `SCHEDULED` emails are read from PostgreSQL and added back to BullMQ.

Because the job ID is deterministic, re-adding jobs is safe and does not create duplicates.

### Rate Limiting

Redis maintains an atomic counter using:

```text
sender + current hour
```

When the limit is reached, the email is rescheduled for the next hour instead of being dropped. A Slack notification is also sent.

### Search

Email records are indexed in Elasticsearch whenever they are created or their status changes.

Search is available through:

```text
GET /api/emails/search?q=
```

## Assumptions & Trade-offs

* JWT is passed through a one-time URL parameter and stored in `localStorage` to simplify localhost frontend/backend authentication.
* Rate limiting uses fixed hourly windows instead of a rolling 60-minute window.
* The backend supports multiple senders, but the current frontend uses the seeded sender.
* Frontend styling focuses on functionality rather than exact Figma matching.
* CSV parsing is handled on the frontend using PapaParse.

## Demo
 [**[ReachInbox Email Scheduler video]**](https://drive.google.com/drive/folders/1tjuOrdae1YUjGPB5hFcxvqbWSI_oVerh?usp=drive_link)

## Live demo
- Frontend: [https://reachinbox-scheduler.vercel.app](https://reachinbox-scheduler-beta-green.vercel.app/)
- Backend API: https://reachinbox-scheduler-production-34cc.up.railway.app
- BullMQ dashboard: [https://reachinbox-scheduler-production-34cc.up.railway.app/admin/queues](https://reachinbox-scheduler-production-34cc.up.railway.app/admin/queues)



