# IT Request Portal

Next.js **v0.6** is the primary product (App Router, API routes, light theme, Section 4 schemas). The static HTML **Prototype v0.5.1** stays in this repository so the existing GitHub Pages links keep working.

## Live URLs

| What | URL |
| --- | --- |
| Next.js v0.6 app | Not deployed yet. GitHub Pages cannot run the Next.js API routes. Connect this repo in Vercel (steps below) to get the public app URL. |
| Prototype v0.5.1 (Pages root) | https://kylow327-stack.github.io/it-request-portal/ |
| Prototype v0.5.1 (named file) | https://kylow327-stack.github.io/it-request-portal/IT-Request-Portal-Prototype-v0.5.1.html |

Local HTML files: `index.html` and `IT-Request-Portal-Prototype-v0.5.1.html` (same prototype). The Pages workflow publishes only those files plus `.nojekyll`, at the same paths as before.

## Run v0.6 locally

```bash
npm install
npm run dev
```

Open http://localhost:3000

Production check:

```bash
npm run build
npm start
```

The UI sends demo auth headers: `x-role` = `Requester` | `BA` | `Engineer` | `PodLead`, and `x-user-id`.

## Locked scoring (U40 / I25 / C15 / V20)

Weights in `src/lib/scoring.ts` are locked. Each letter is that factor’s maximum:

| Factor | Max | Values |
| --- | --- | --- |
| **U** urgency | 40 | P0 = 40, P1 = 30, P2 = 18, P3 = 8 |
| **I** impact | 25 | direct business impact = 25, otherwise 8 |
| **C** complexity | 15 | low = 15, med = 10, high = 5 |
| **V** value | 20 | high = 20, med = 12, low = 5 |

Band from the total: **≥ 85 → P0**, **≥ 70 → P1**, **≥ 50 → P2**, else **P3**.

Other locks carried from the prototype:

- Chat: custom in-app flow first
- Priority override: **BA** or **PodLead** only, mandatory `reason`, written to the audit log
- ETA: `PATCH /api/requests/:id/eta` is **BA** only
- Intake UX: v0.5.1 parity

## Persistence

- Local `npm run dev` / `npm start`, when `data/` is writable: `data/tickets.json` (Section 4.2) and `data/audit.jsonl` (Section 4.4). Created from seed data on first read.
- If that directory cannot be written, the store tries `/tmp/it-request-portal`, then an in-memory copy.
- On Vercel (`VERCEL` or `VERCEL_ENV` is set) the store is in-memory and seeded once per serverless instance. It does not write the read-only project directory. Data lasts for that instance only.

Do not treat a hosted deploy as durable. Postgres and real OIDC are intentionally not part of v0.6. API failures return JSON `{ "error": "..." }` rather than an empty body.

## API

| Method | Path | Who |
| --- | --- | --- |
| POST | `/api/requests` | Requester |
| GET | `/api/me/requests` | Requester |
| GET | `/api/requests` | IT |
| PATCH | `/api/requests/:id` | IT (not ETA / priority) |
| PATCH | `/api/requests/:id/eta` | BA |
| PATCH | `/api/requests/:id/priority` | BA, PodLead (+ reason) |
| GET | `/api/metrics/by-status` | IT |
| GET | `/api/requests/export?format=csv` | IT |
| POST | `/api/requests/:id/signoff` | Requester |
| GET | `/api/audit?case_id=` | IT |

Schemas: `PRD-Section4-Schemas-v1.md` (same content as `docs-PRD-Section4-Schemas-v1.md`).

## Why two hosts

GitHub Pages serves static files only. It cannot execute `src/app/api/*`, so the v0.6 app is not the Pages site. Pages remains the v0.5.1 prototype. Vercel is the host for the Next.js app and its API routes.

## Deploy v0.6 on Vercel

This environment had no Vercel login or linked project, so production was not deployed from here. After this branch is on GitHub, Rick connects the repo once:

1. Open [https://vercel.com/new](https://vercel.com/new) and sign in with the GitHub account that can access `kylow327-stack/it-request-portal`.
2. If GitHub asks, install the Vercel GitHub App and grant it **kylow327-stack/it-request-portal** (Import Git → select that repository).
3. Confirm the project settings, then click **Deploy**:
   - Framework Preset: **Next.js**
   - Root Directory: **./** (repository root; leave it blank / default)
   - Build Command: `npm run build`
   - Output Directory: leave the Next.js default (do not set a static `out` directory)
   - Environment variables: none
4. Production follows **main**. Merge the v0.6 pull request, then Vercel builds `main` and the project page shows the `https://….vercel.app` URL. Until that merge, the deployment for this branch is a Preview URL on the same project.

No database URL or OIDC client is required for this demo.
