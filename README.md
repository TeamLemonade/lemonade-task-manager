# Lemonade Work OS

Personal monday-style task manager. One tiny Node server (zero dependencies) serves the UI and a JSON API.

## Deploy on Railway

1. Push this folder to a GitHub repo.
2. Railway → New Project → Deploy from GitHub repo → pick the repo. It auto-detects Node and runs `npm start`.
3. Service → **Variables**: add `API_KEY` (your secret access key) and `DATA_DIR=/data`.
4. Service → Settings → **Attach Volume**, mount path `/data` (keeps tasks across deploys).
5. Settings → Networking → **Generate Domain**.

Open the domain, paste your `API_KEY` when the app asks — done.

## API (for Claude or scripts)

All endpoints require `?key=API_KEY` (or `Authorization: Bearer`).

- `GET /api/tasks` — full board state (JSON)
- `PUT /api/tasks` — replace full state (the web app uses this)
- `GET /api/add?name=Task+name&group=Inbox&prio=high&date=2026-07-10` — add a task
- `GET /api/update?find=task+name&status=done` — update first matching task (`status`, `prio`, `date`, `owner`, `rename`)
- `GET /api/summary` — counts + overdue / due-today / stuck lists

Statuses: `not`, `work`, `stuck`, `done`. Priorities: `crit`, `high`, `med`, `low`.
