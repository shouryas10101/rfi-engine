# RFI Compliance Engine

A multi-tenant SaaS for running auditable, agent-driven RFI sessions between an OEM (Tata Motors)
and its bid-list suppliers. Built around a five-phase state machine, deterministic-first evaluation,
and human interjection at any point.

## What it does

OEM creates an RFI describing a component (e.g. *Front Brake Caliper for Harrier EV*) with parameters
in four phases: **general → must-have → good-to-have → subjective**. Each phase has its own gating
rule; a single must-have failure ends the session immediately. For each supplier on the bid list,
two agents converse turn-by-turn: a TML agent asks one parameter at a time, the supplier agent answers
from its catalogue. Either side's human operator can interject mid-flight to override or clarify.
Every numeric/boolean/enum answer is graded by a pure deterministic evaluator; subjective answers go
to an LLM judge. At session end, a structured compliance report is produced and suppliers are ranked.

## Architecture

```
┌───────────────────────┐     ┌────────────────────────┐
│ Frontend (React/Vite) │ ◄── │ Backend (Express/Node) │
│ Netlify or localhost  │     │ Render or localhost    │
└───────────────────────┘     └────────┬───────────────┘
                                       │
                  ┌────────────────────┼────────────────────┐
                  │                    │                    │
            ┌─────▼─────┐       ┌──────▼──────┐      ┌──────▼──────┐
            │ Postgres  │       │  Storage    │      │   OpenAI    │
            │  (Neon)   │       │ (R2 / disk) │      │  (your key) │
            └───────────┘       └─────────────┘      └─────────────┘
```

- **Backend:** Node + Express + TypeScript + Prisma. Routes for auth, projects, RFIs, suppliers,
  sessions, documents, invitations. Centralized OpenAI client used by both agents and the subjective
  evaluator. Storage layer (interface) with `local` and `r2` implementations.
- **Frontend:** React + Vite + Tailwind. Single-page app with role-aware routing.
- **Database:** PostgreSQL via Prisma. Cascade deletes wired throughout.
- **Storage:** Cloudflare R2 (production) or local filesystem (dev).
- **LLM:** OpenAI Chat Completions. The system runs end-to-end without an API key — agents fall
  back to template phrasing and the subjective evaluator records answers as `partial` for manual
  review. Adding a key just makes it nicer.

## Run locally

### 1. Prerequisites
- Node 20+
- Docker (for Postgres)
- An OpenAI API key (optional)

### 2. Start Postgres
```bash
cd rfi-engine
docker compose up -d
```
Postgres now listens on `localhost:5432` with database `rfi_engine`.

### 3. Backend
```bash
cd backend
cp .env.example .env
# Optionally edit .env to set OPENAI_API_KEY
npm install
npx prisma migrate dev --name init
npm run seed
npm run dev
```
Backend listens on `:4000`. Seed creates `priya@tml.test` / `password123` (TML admin), one project,
and one RFI for "Front Brake Caliper". No suppliers — you add them through the UI.

### 4. Frontend
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173` and sign in.

### 5. Demo walkthrough (two devices / two browsers)

You'll need two browser sessions — one for TML, one for the supplier. Easiest: a normal window and
an incognito window.

**Window 1 (TML):**
1. Sign in as `priya@tml.test` / `password123`.
2. Click **Suppliers → + Add supplier**. Enter `Brembo` and an email like `eng@brembo.test`.
3. The page shows an invitation link. **Copy it.**
4. (Keep this window open.)

**Window 2 (supplier):**
5. Paste the invitation link into a fresh incognito window.
6. Set a name and password. You're now signed in as a Brembo engineer.
7. Click **My catalogue → + Add catalogue item**. Use:
   - Component category: `Brake Caliper` (must exactly match the RFI's category)
   - Product code: `BC-EV-X40`
   - Parameters JSON (the form prefills this — confirm it):
     ```json
     {
       "max_braking_force_kn": 32,
       "operating_temp_range": [-40, 650],
       "regen_brake_compatible": true,
       "homologation_standard": "ECE-R13",
       "weight_kg": 3.9,
       "piston_count": "4",
       "warranty_months": 48
     }
     ```
8. Save. Optionally upload a datasheet PDF.

**Window 1 (TML again):**
9. Go to **Projects → Harrier EV — Front Brake Module**.
10. In the **Bid list** sidebar, click `+ Add`, pick `Brembo`.
11. Click into the RFI card, then click `→ Brembo` to open a pending session.
12. The session opens in **pending** state. Hit **Start session** — agents start conversing.

**Both windows:**
13. Either side can paste interjections via the chat input at the bottom. Supplier interjections
    that arrive before evaluation will supersede the agent's reply.
14. When all phases complete (or a must-have fails), the report becomes available.

## Deploy to cloud

The whole thing fits in free tiers: Netlify (frontend), Render (backend), Neon (Postgres),
Cloudflare R2 (files). You'll need accounts for all four plus an OpenAI key.

### Postgres on Neon
1. Create a project at neon.tech.
2. Copy the connection string (it ends with `?sslmode=require`).
3. From local, point Prisma at it once and run:
   ```bash
   cd backend
   DATABASE_URL='postgresql://...' npx prisma migrate deploy
   DATABASE_URL='postgresql://...' npm run seed
   ```

### File storage on Cloudflare R2
1. Cloudflare dashboard → R2 → create a bucket called `rfi-engine-uploads`.
2. R2 → Manage R2 API tokens → Create API token. Permissions: Object Read & Write, scoped to that bucket.
3. Copy three things: **Access Key ID**, **Secret Access Key**, and **Account ID** (visible at the
   top of the R2 dashboard). The endpoint is auto-built from the account ID.

### Backend on Render
1. Render → New → Web Service → connect your Git repo.
2. Settings:
   - Root directory: `backend`
   - Build command: `npm install && npx prisma generate && npm run build`
   - Start command: `npm start`
3. Environment variables (paste from your local .env, plus the cloud-only ones):
   ```
   DATABASE_URL=<neon connection string>
   JWT_SECRET=<at least 32 random bytes; generate with `openssl rand -hex 32`>
   OPENAI_API_KEY=<your key>
   OPENAI_MODEL=gpt-4o-mini
   STORAGE_PROVIDER=r2
   R2_ACCOUNT_ID=<from R2>
   R2_ACCESS_KEY_ID=<from R2>
   R2_SECRET_ACCESS_KEY=<from R2>
   R2_BUCKET=rfi-engine-uploads
   CORS_ORIGIN=https://<your-netlify-site>.netlify.app
   PUBLIC_FRONTEND_URL=https://<your-netlify-site>.netlify.app
   NODE_ENV=production
   ```
4. Deploy. Note the URL Render gives you (e.g. `https://rfi-engine-backend.onrender.com`).
5. **Render's free tier sleeps after 15 minutes of inactivity.** First request after a cold start
   takes 30–60 seconds. For the demo, ping the `/health` endpoint right before showing it, or
   add a UptimeRobot keepalive.

### Frontend on Netlify
1. Netlify → Add new site → import from Git.
2. Settings:
   - Base directory: `frontend`
   - Build command: `npm install && npm run build`
   - Publish directory: `frontend/dist`
3. Environment variables:
   ```
   VITE_API_BASE_URL=https://<your-render-app>.onrender.com
   ```
4. Deploy. Open the site, sign in as Priya, run the demo as above — but now your two devices can
   actually be two devices on different networks.

### Production checklist
- Generate a strong JWT_SECRET (`openssl rand -hex 32`). Never reuse the example value.
- Set CORS_ORIGIN to your real frontend URL — leaving it as `localhost` will block production calls.
- The seeded `priya@tml.test` password is `password123`. Change it (or delete and re-seed) before
  letting anyone touch the production instance.

## How agents work

Two agent files live in `backend/src/agents/`:
- `tmlAgent.ts` — given an RFI parameter, phrases it as a question. Falls back to a deterministic
  template if no LLM is available. Optionally cites RFI documents.
- `supplierAgent.ts` — given the catalogue value for that parameter, phrases the answer. **If the
  catalogue does not specify a value, the agent says so honestly** ("Our catalogue does not currently
  specify..."). Optionally cites catalogue documents.

The orchestrator (`services/sessionService.ts`) drives one parameter per `runOneStep()`:
1. Pick the next unanswered parameter in the current phase.
2. Pull cross-session prior context (last 2 completed sessions for the same supplier+component).
3. TML agent asks → write turn.
4. Supplier agent answers → write turn.
5. Evaluate (deterministic-first, LLM for subjective only).
6. Persist the verdict, update phase if the rule fires (advance / fail-veto / complete).

Human interjection (`submitHumanTurn`) supersedes the most recent unanswered agent reply for the
same parameter and triggers re-evaluation on the human's text instead.

## Things to know

- **Phase advance rules** are in `backend/src/domain/phaseMachine.ts`. The must-have gate is a hard
  veto: any single `fail` in must-have ends the session.
- **Subset-range coverage logic** is in `evaluation/deterministic.ts`. A supplier offering
  `[-25, 580]` against an RFI of `[-30, 600]` is *fail* (doesn't cover the lower bound).
- **Document text is excerpted** to ~1500 characters before being injected into agent prompts. This
  keeps token usage under control. Full text is preserved in DB for auditability.
- **All cascade deletes are wired.** Deleting a project takes its RFIs, sessions, turns, responses,
  reports, and turn-attached documents with it. Deleting an RFI does the same. Deleting a tenant
  is not exposed in the UI but is safe at the DB layer.
- **No emails are sent.** Invitations work by copy-pasting the link. This is deliberate — adds zero
  ops surface area. If you want SES/Resend integration later, the plumbing is in `routes/invitations.ts`.

## File map

```
backend/
  prisma/schema.prisma       — full data model
  src/
    config/        — env, logger
    domain/        — parameter Zod schemas, phase machine
    evaluation/    — deterministic evaluator, LLM evaluator, orchestrator
    ranking/       — supplier scoring
    compliance/    — report builder
    agents/        — tmlAgent, supplierAgent
    documents/     — storage interface (local/r2), text extraction
    llm/           — centralized OpenAI client
    services/      — session orchestrator, cross-session context
    routes/        — auth, projects, rfis, suppliers, sessions, documents, invitations
    middleware/    — async error handler, auth/role guards
    auth/          — JWT
    db/            — Prisma client singleton
    seed/          — initial data
    server.ts      — Express entry
frontend/
  src/
    api/client.ts            — axios + token + JWT decode
    auth/                    — context, login, onboard
    components/              — Layout, Badges, DocumentList
    tml/                     — Projects, ProjectDetail, RFIDetail, Comparison, Report,
                                Suppliers, SupplierDetail
    supplier/                — Sessions list, Chat, Catalogue
    App.tsx, main.tsx, index.css
docker-compose.yml           — Postgres for local dev
```

## License

MIT.
