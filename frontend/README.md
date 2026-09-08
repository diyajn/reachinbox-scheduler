# ReachInbox Scheduler — Frontend

## Setup

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

Runs at http://localhost:3000. Requires the backend running at
http://localhost:4000 (see ../backend/README.md).

## What's here

- `/` — dashboard: tabs for Scheduled / Sent emails, polls the backend every
  5s, loading + empty states handled in `EmailTable.tsx`.
- `/compose` — form to upload a CSV/TXT of leads (parsed client-side with
  PapaParse, shows the detected email count), set subject/body/start
  time/delay/hourly limit, and POST to `/api/emails/schedule`.

## Still to build

- **Real Google OAuth login.** `layout.tsx` currently hardcodes a demo user.
  Easiest path: add `next-auth` with the Google provider, or call the
  backend's `/auth/google` redirect flow and read the session from a cookie.
- **Figma-accurate styling.** This scaffold is functional, unstyled-beyond-
  Tailwind-basics — budget time to match spacing/colors/typography to the
  provided Figma once the functional pieces work end to end.
- **Slack "Connect" button** somewhere in the dashboard header that hits the
  backend's `/auth/slack` redirect.
