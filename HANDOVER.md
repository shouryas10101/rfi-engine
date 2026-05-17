# Setu — RFI Compliance Engine: Product Handover Guide

**Project:** Setu — Tata Motors RFI Compliance Engine  
**Version:** 0.2.0 (Proof of Concept)  
**Prepared by:** Shourya Shrivastava  
**Date:** May 2026

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [Repository Structure](#3-repository-structure)
4. [Prerequisites & Access](#4-prerequisites--access)
5. [Local Development Setup](#5-local-development-setup)
6. [Environment Variables Reference](#6-environment-variables-reference)
7. [Database Schema](#7-database-schema)
8. [Feature Walkthrough](#8-feature-walkthrough)
9. [System Architecture](#9-system-architecture)
10. [Backend Reference](#10-backend-reference)
11. [Frontend Reference](#11-frontend-reference)
12. [Deployment](#12-deployment)
13. [Known Limitations & Future Work](#13-known-limitations--future-work)

---

## 1. Project Overview

Setu is a multi-tenant web application built as a proof of concept for **Tata Motors (TML)**. It automates the **Request for Information (RFI) compliance evaluation** process in automotive component procurement.

The traditional RFI process involves TML engineers manually sending specification questionnaires to suppliers, collecting responses, and evaluating whether supplier components meet requirements — a process that takes weeks. Setu replaces this with an AI-driven agent conversation where:

- A **TML agent** (LLM-powered) asks requirement questions
- A **Supplier agent** (LLM-powered) answers using the supplier's own catalogue data
- Responses are **automatically evaluated** against spec thresholds (deterministic for numeric/boolean specs, LLM-judged for subjective ones)
- A **compliance report** is generated showing which supplier products pass, which are eliminated, and which is recommended

**Roles in the system:**

| Role | Access |
|---|---|
| `TML_ADMIN` | Full access — manage all projects, RFIs, suppliers, sessions, users |
| `TML_ENGINEER` | Manage projects, RFIs, suppliers, view/run sessions |
| `SUPPLIER_ENGINEER` | View own sessions, manage own catalogue |

---

## 2. Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite 5, Tailwind CSS 3, React Router 6, Axios |
| Backend | Node.js 20, Express 4, TypeScript 5, Prisma 5 ORM |
| Database | PostgreSQL 16 |
| LLM | OpenAI API (default: `gpt-4o-mini`) |
| Auth | JWT (jsonwebtoken), bcryptjs |
| Document parsing | pdf-parse, mammoth (DOCX), xlsx (Excel) |
| File storage | Local filesystem (dev) or Cloudflare R2 (prod) |
| Deployment | Railway (backend), Netlify (frontend) |
| Dev database | Docker Compose (PostgreSQL) |

---

## 3. Repository Structure

```
rfi-engine/
├── backend/                    # Node.js/Express API (port 4000)
│   ├── prisma/
│   │   ├── schema.prisma       # Database schema
│   │   └── migrations/         # SQL migration history
│   ├── scripts/                # One-off utility scripts
│   │   ├── regenerate-reports.mjs
│   │   ├── reset-session.ts
│   │   └── list-sessions.ts
│   ├── src/
│   │   ├── agents/             # LLM agent prompts (TML + Supplier)
│   │   ├── auth/               # JWT signing/verification
│   │   ├── compliance/         # Compliance report builder
│   │   ├── config/             # Env validation, logger
│   │   ├── db/                 # Prisma client singleton
│   │   ├── documents/          # File extraction + storage adapters
│   │   ├── domain/             # Shared types (parameter specs, phase machine)
│   │   ├── evaluation/         # Deterministic + LLM evaluators
│   │   ├── llm/                # OpenAI client wrapper
│   │   ├── middleware/         # Auth guard, async handler
│   │   ├── ranking/            # Supplier score calculation
│   │   ├── routes/             # Express route handlers
│   │   └── services/           # Session orchestration, context service
│   ├── .env.example
│   └── package.json
│
├── frontend/                   # React SPA (port 5173)
│   ├── public/                 # Static assets (tata-logo.svg, etc.)
│   ├── src/
│   │   ├── api/                # Axios client (auth headers, interceptors)
│   │   ├── auth/               # AuthContext, LoginPage, OnboardPage
│   │   ├── components/         # Shared: Layout, Badges, DocumentList
│   │   ├── supplier/           # Supplier-role pages
│   │   └── tml/                # TML-role pages
│   ├── .env.example
│   └── package.json
│
├── docker-compose.yml          # Local PostgreSQL
├── railway.json                # Railway backend deploy config
├── netlify.toml                # Netlify frontend deploy config
└── nixpacks.toml               # Build config for Railway/Render
```

---

## 4. Prerequisites & Access

### What you need installed

- **Node.js 20+** — `node --version` should show v20 or higher
- **npm 10+** — comes with Node.js
- **Docker Desktop** — for running local PostgreSQL
- **Git** — to clone the repository

### What credentials you need

You will need to get the following from the current developer:

1. **`.env` file for backend** — contains all secrets (database URL, JWT secret, OpenAI API key). Do not commit this file to git.
2. **Supabase database credentials** — the production database is hosted on Supabase. Get the `DATABASE_URL` connection string.
3. **OpenAI API key** — required for LLM-powered question generation and subjective evaluation. The system still runs without it (falls back to deterministic-only mode).
4. **Cloudflare R2 credentials** — if running in production with file uploads. Not required for local dev (uses local filesystem).
5. **Railway account access** — for backend deployment.
6. **Netlify account access** — for frontend deployment.

### Repository access

The repository is a private Git repo. Ensure you have been added as a collaborator and can `git clone` it successfully.

---

## 5. Local Development Setup

### Step 1 — Clone the repository

```bash
git clone <repo-url>
cd rfi-engine
```

### Step 2 — Start the local database

```bash
docker compose up -d
```

This starts PostgreSQL on `localhost:5432` with:
- Username: `rfi`
- Password: `rfi`
- Database: `rfi_engine`

### Step 3 — Set up the backend

```bash
cd backend
cp .env.example .env
# Edit .env — fill in DATABASE_URL, JWT_SECRET (any 32+ char string), OPENAI_API_KEY
npm install
npx prisma migrate dev
npx prisma db seed    # creates initial tenant + TML_ADMIN user
```

The seed script creates:
- Tenant: Tata Motors (`tml`)
- User: `priya@tml.test` / password: `password123` (TML_ADMIN)

To start the backend dev server:
```bash
npm run dev
# API now running on http://localhost:4000
```

### Step 4 — Set up the frontend

Open a second terminal:
```bash
cd frontend
npm install
npm run dev
# App now running on http://localhost:5173
```

The Vite dev server proxies `/api/*` requests to `http://localhost:4000` automatically.

### Step 5 — Log in

Open `http://localhost:5173` and log in with `priya@tml.test` / `password123`.

### Step 6 — Create a supplier user (optional)

To test the supplier experience:
1. Log in as TML admin
2. Go to Vendor master → create a supplier
3. Go to that supplier's detail page → Invite user
4. Copy the invitation link → open in incognito browser
5. Set a password and log in as the supplier

---

## 6. Environment Variables Reference

### Backend (`.env`)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string. For local dev: `postgresql://rfi:rfi@localhost:5432/rfi_engine?schema=public` |
| `JWT_SECRET` | Yes | Random 32+ character string for signing tokens |
| `PORT` | No | API port (default: 4000) |
| `NODE_ENV` | No | `development` or `production` |
| `OPENAI_API_KEY` | No | OpenAI API key. System works without it but LLM features degrade to templates |
| `OPENAI_MODEL` | No | LLM model name (default: `gpt-4o-mini`) |
| `STORAGE_PROVIDER` | No | `local` (default) or `r2` |
| `LOCAL_UPLOAD_DIR` | No | Directory for local file uploads (default: `./uploads`) |
| `R2_ACCOUNT_ID` | If R2 | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | If R2 | R2 access key |
| `R2_SECRET_ACCESS_KEY` | If R2 | R2 secret key |
| `R2_BUCKET` | If R2 | R2 bucket name |
| `CORS_ORIGIN` | No | Frontend URL for CORS (default: `http://localhost:5173`) |
| `PUBLIC_FRONTEND_URL` | No | Used in invitation links (default: `http://localhost:5173`) |
| `INVITATION_TTL_DAYS` | No | How long invitation links are valid (default: 7) |
| `MAX_UPLOAD_BYTES` | No | Max file upload size in bytes (default: 10485760 = 10MB) |

### Frontend (`.env`)

| Variable | Required | Description |
|---|---|---|
| `VITE_API_BASE_URL` | No | Backend URL. Leave empty in dev (proxy handles it). In production: `https://<backend>.railway.app` |

---

## 7. Database Schema

The database has the following main models. See `backend/prisma/schema.prisma` for exact field definitions.

### Core hierarchy

```
Tenant
 └─ User (role: TML_ADMIN | TML_ENGINEER | SUPPLIER_ENGINEER)
 └─ Project (vehicle programme)
     └─ RFI (component specification)
         ├─ RFIParameter (individual requirement, e.g. "Max torque > 300 Nm")
         ├─ BidlistEntry (which suppliers are invited to this RFI)
         └─ Session (one evaluation run for one supplier)
             ├─ Turn (individual chat messages)
             ├─ ParameterResponse (evaluation verdict per parameter)
             └─ ComplianceReport (final JSON report)
 └─ Supplier
     ├─ CatalogueItem (product variant with parameter values)
     └─ Invitation (onboarding link for new users)
```

### Session lifecycle

A `Session` has the following statuses:

| Status | Meaning |
|---|---|
| `pending` | Created, not yet started |
| `active` | Evaluation in progress |
| `paused` | Manually paused by TML |
| `completed` | All parameters evaluated, report generated |
| `failed_veto` | Eliminated because a must-have parameter failed |
| `abandoned` | Manually abandoned |

### ParameterResponse

Each `ParameterResponse` stores:
- `rawResponse` — the supplier agent's raw text
- `parsedValue` — structured value extracted from text
- `verdict` — `pass`, `fail`, `partial`, or `not_applicable`
- `confidence` — 0 to 1
- `rationale` — human-readable explanation
- `modificationDistance` — how far the supplier value is from the requirement (for partial)
- `evaluatedBy` — `deterministic`, `llm`, or `none`

---

## 8. Feature Walkthrough

### 8.1 Projects

**Location:** TML sidebar → Projects

Projects represent vehicle programmes (e.g., "Harrier EV 2026"). Each project has:
- Vehicle type and target market
- Programme milestones (KO, DR0–DR5) with dates
- A list of RFIs for different component categories

**Creating a project:** Fill in the name, vehicle type, and optional milestone dates.

---

### 8.2 RFI Management

**Location:** Project detail → RFIs

An RFI (Request for Information) is a specification sheet for one component category (e.g., Brake Caliper). It defines:
- A list of **parameters** (requirements) with thresholds
- A **bidlist** — which suppliers are invited to respond

#### Parameter types

Each parameter has a type that determines how it is evaluated:

| Type | Example | Evaluation method |
|---|---|---|
| `numeric_range` | "Max torque: 300–350 Nm" | Deterministic — supplier value must fall within range |
| `numeric_exact` | "Thread pitch: M12 ± 0.5mm" | Deterministic — tolerance band check |
| `numeric_subset_range` | "Voltage: 12–48V (RFI must be covered)" | Deterministic — supplier range must fully contain RFI range |
| `boolean` | "ABS compatible: yes/no" | Deterministic — yes/no parse |
| `enum` | "Finish: anodised / powder-coated" | Deterministic — must be one of allowed values |
| `text` | "Describe your QC process" | LLM-judged — no threshold |
| `subjective` | "Rate your after-sales support" | LLM-judged — no threshold |

Parameters are grouped into **phases**:
- `general` — introductory questions (not scored)
- `must_have` — hard requirements; any fail immediately eliminates the supplier
- `good_to_have` — scored preferences
- `subjective` — open-ended qualitative questions

#### Parsing parameters from a document

In the RFI detail page, you can upload a PDF/DOCX/Excel spec sheet and click "Extract parameters." The LLM will attempt to parse the document into structured parameters. Review and edit before saving.

#### Bidlist management

Add suppliers to the bidlist in the RFI detail page. Only bidlisted suppliers can have sessions started for this RFI.

---

### 8.3 Suppliers and Catalogue

**Location:** TML sidebar → Vendor master

Suppliers are the vendor companies. Each supplier has:
- Name, contact email, optional logo URL
- A **catalogue** — a list of product variants they offer

#### Catalogue items

Each catalogue item represents one product variant with:
- A component category (must match the RFI it will be evaluated against)
- A product code (e.g., "CAL-X200")
- A **parameters JSON object** — key-value pairs of their product's specs

Example parameters JSON:
```json
{
  "max_torque": "320 Nm",
  "abs_compatible": "yes",
  "finish": "anodised",
  "weight": "1.8 kg"
}
```

#### Bulk catalogue upload

In the supplier detail page, you can upload an Excel file containing multiple product variants. The system auto-detects whether variants are rows or columns and parses them into catalogue items.

#### Supplier self-management

Supplier users (role: `SUPPLIER_ENGINEER`) can manage their own catalogue from the "My catalogue" sidebar link. They can add, edit, and upload datasheets for each product.

---

### 8.4 Sessions (RFI Evaluation)

**Location:** TML sidebar → Sessions (or Supplier sidebar → My sessions)

A session is one evaluation run between an RFI and a supplier. One session per (RFI, supplier) pair.

#### Starting a session (TML)

1. Open an RFI detail page
2. Click "Start session" next to a supplier on the bidlist
3. The session begins automatically — evaluation runs in the background
4. Open the session to watch the conversation in real time

#### What happens during evaluation

The system works through parameters phase by phase:

1. **TML agent** asks a question about the parameter (phrased naturally)
2. **Supplier agent** answers using its catalogue data
3. **Evaluator** checks the answer against the spec threshold
4. A verdict (`pass` / `fail` / `partial`) is recorded
5. If a must-have parameter fails, the session immediately ends as `failed_veto`

All of this happens automatically. The conversation is visible as a chat thread.

#### Human interjection

Either the TML user or the supplier user can add their own message at any point:
- Use the text box at the bottom of the session chat
- The system re-evaluates the affected parameter using the human's message
- Human turns are marked differently from agent turns

#### Session controls (TML only)

| Button | Action |
|---|---|
| Start | Begin evaluation (pending → active) |
| Pause | Pause mid-session |
| Resume | Continue a paused session |
| Step | Run exactly one parameter evaluation |

---

### 8.5 Compliance Report

**Location:** Session detail → "View report" (after session completes)

After a session completes (either `completed` or `failed_veto`), a compliance report is generated. It shows:

- **Summary stats** — must-have pass rate, good-to-have score, overall compliance status
- **Variant recommendations** — which of the supplier's product variants best matches the requirements, and why
  - Recommended variant highlighted in green
  - Eliminated variants shown in red with reason and the parameter they failed at
- **Parameter-by-parameter breakdown** — verdict, confidence, and rationale for each question

The compliance status is derived as:
- `compliant` — all must-haves passed, good-to-have score ≥ 70%
- `partially_compliant` — all must-haves passed but good-to-have score < 70%
- `non_compliant` — one or more must-haves failed

#### Regenerating a report

If responses were modified (e.g., after a human interjection), TML users can regenerate the report from the session page using "Regenerate report."

---

### 8.6 Supplier Comparison

**Location:** RFI detail → "Compare suppliers"

After multiple sessions are completed for the same RFI, the comparison view shows all suppliers side-by-side:
- Each column is a supplier
- Each row is a parameter
- Cells show the verdict (color-coded) and the supplier's answer

Suppliers are ranked by a composite score:
- Must-have pass rate: 50%
- Good-to-have score: 25%
- Subjective/qualitative score: 15%
- Modification distance penalty: 10%

A supplier with any must-have failure is marked **ineligible** regardless of other scores.

**Excel export:** Click "Export" to download the comparison table as an `.xlsx` file.

---

### 8.7 User Management / Invitations

**Location:** Vendor master → Supplier detail → "Invite user"

There is no email sending. Invitations work by generating a link that you manually share:

1. TML admin opens a supplier detail page
2. Clicks "Invite user" — enters the supplier user's email
3. Copies the generated link
4. Sends it to the supplier via email/Slack/etc.
5. Supplier opens the link, sets their name and password, and gets logged in

Invitations expire after 7 days (configurable). An admin can revoke a pending invitation.

---

## 9. System Architecture

### Request flow

```
Browser (React SPA)
  │  Bearer JWT in Authorization header
  ▼
Express API (port 4000)
  ├── requireAuth middleware → verify JWT → attach req.auth
  ├── Route handler → validate request (Zod)
  │   ├── Prisma ORM → PostgreSQL
  │   └── Session orchestration:
  │       ├── TML Agent (LLM prompt → OpenAI)
  │       ├── Supplier Agent (LLM prompt → OpenAI)
  │       └── Evaluator (deterministic or LLM)
  └── Response JSON
```

### Session evaluation state machine

```
pending ──start──▶ active ──pause──▶ paused
                     │   ◀──resume──┘
                     │
           (per parameter loop)
                     │
            must_have fail ──▶ failed_veto
                     │
           all params done ──▶ completed
```

### Multi-tenancy

Every database query is scoped by `tenantId`. The JWT contains the user's `tenantId`, which is passed into every service call. There is no cross-tenant data leakage.

### LLM usage

The system uses OpenAI (`gpt-4o-mini` by default). LLM calls are made for:
1. TML agent turn — phrasing the question naturally
2. Supplier agent turn — phrasing the answer naturally from catalogue data
3. LLM evaluation — for `text` and `subjective` parameter types
4. RFI document parsing — extracting structured parameters from a spec PDF
5. Catalogue bulk parse — interpreting Excel files into product variants

If `OPENAI_API_KEY` is not set, the system falls back to template-based question/answer phrasing. Deterministic parameters still evaluate correctly; subjective parameters are recorded as `partial` pending manual review.

---

## 10. Backend Reference

### API Routes

All routes require a `Bearer <jwt>` Authorization header unless marked public.

#### Auth

| Method | Path | Description |
|---|---|---|
| POST | `/auth/login` | Email + password → JWT + user profile |

#### Projects (TML only)

| Method | Path | Description |
|---|---|---|
| GET | `/projects` | List all projects for tenant |
| POST | `/projects` | Create project |
| GET | `/projects/:id` | Project detail with RFIs |
| PATCH | `/projects/:id` | Update project fields |
| DELETE | `/projects/:id` | Delete project (cascades) |

#### RFIs

| Method | Path | Description |
|---|---|---|
| POST | `/rfis/parse-file` | Upload doc → extract parameters via LLM |
| POST | `/rfis` | Create RFI with parameters array |
| GET | `/rfis/:id` | RFI detail with parameters + sessions |
| DELETE | `/rfis/:id` | Delete RFI |
| POST | `/rfis/:id/bidlist` | Add supplier to bidlist |
| DELETE | `/rfis/:id/bidlist/:supplierId` | Remove from bidlist |
| GET | `/rfis/:id/comparison` | All supplier responses ranked |
| GET | `/rfis/:id/comparison/export` | Excel export of comparison |

#### Suppliers

| Method | Path | Description |
|---|---|---|
| GET | `/suppliers` | List suppliers for tenant |
| POST | `/suppliers` | Create supplier |
| GET | `/suppliers/:id` | Supplier detail + catalogue + users |
| PATCH | `/suppliers/:id` | Update supplier |
| DELETE | `/suppliers/:id` | Delete supplier (cascades) |
| POST | `/suppliers/:id/catalogue` | Add catalogue item |
| POST | `/suppliers/:id/catalogue/parse-file` | Parse Excel → multiple catalogue items |
| PUT | `/suppliers/:id/catalogue/:itemId` | Update catalogue item |
| DELETE | `/suppliers/:id/catalogue/:itemId` | Delete catalogue item |

#### Sessions

| Method | Path | Description |
|---|---|---|
| GET | `/sessions` | List sessions (role-filtered) |
| POST | `/sessions` | Create session for RFI × supplier |
| GET | `/sessions/:id` | Session detail with turns + responses |
| POST | `/sessions/:id/start` | Start session, auto-run in background |
| POST | `/sessions/:id/pause` | Pause session |
| POST | `/sessions/:id/resume` | Resume paused session |
| POST | `/sessions/:id/step` | Run exactly one parameter |
| POST | `/sessions/:id/run` | Run until blocked |
| POST | `/sessions/:id/interject` | Submit human turn |
| DELETE | `/sessions/:id` | Delete session |
| GET | `/sessions/:id/report` | Fetch latest compliance report |
| POST | `/sessions/:id/report/regenerate` | Rebuild compliance report |

#### Documents

| Method | Path | Description |
|---|---|---|
| POST | `/documents/upload` | Upload file (RFI or catalogue scope) |
| POST | `/documents/upload-for-turn` | Upload file for turn citation |
| GET | `/documents/:id/download` | Download file |
| DELETE | `/documents/:id` | Delete file |

#### Invitations

| Method | Path | Description |
|---|---|---|
| GET | `/invitations` | List invitations (TML only) |
| POST | `/invitations` | Issue invitation |
| POST | `/invitations/:id/revoke` | Revoke pending invitation |
| GET | `/invitations/onboard/:token` | Fetch invite details (public) |
| POST | `/invitations/onboard/:token` | Accept invite, create user, return JWT |

### Utility Scripts

Run from `backend/` directory after `npm run build`:

| Script | Description |
|---|---|
| `node scripts/regenerate-reports.mjs` | Rebuild compliance reports for all completed sessions |
| `npx ts-node scripts/reset-session.ts <id>` | Reset a session back to pending |
| `npx ts-node scripts/list-sessions.ts` | List all sessions with status |

---

## 11. Frontend Reference

### Pages and routes

| Route | Component | Visible to |
|---|---|---|
| `/login` | `LoginPage` | Everyone (public) |
| `/onboard/:token` | `OnboardPage` | Everyone (public) |
| `/projects` | `ProjectsPage` | TML only |
| `/projects/:id` | `ProjectDetailPage` | TML only |
| `/rfis/:id` | `RFIDetailPage` | TML only |
| `/rfis/:id/comparison` | `ComparisonPage` | TML only |
| `/suppliers` | `SuppliersPage` | TML only |
| `/suppliers/:id` | `SupplierDetailPage` | TML only |
| `/sessions` | `SessionsPage` | Both TML and Supplier |
| `/sessions/:id` | `ChatPage` | Both TML and Supplier |
| `/sessions/:id/report` | `ReportPage` | Both TML and Supplier |
| `/catalogue` | `CataloguePage` | Supplier only |

### Auth flow

1. User submits login form
2. `AuthContext.login()` → `POST /auth/login` → receives JWT
3. JWT stored in `localStorage`
4. Axios request interceptor adds `Authorization: Bearer <token>` to every request
5. On 401 response, token cleared and user redirected to `/login`
6. `RequireAuth` wrapper in App.tsx redirects unauthenticated users to `/login`

### Design system

The app uses a custom Tailwind palette:
- `ink-*` — neutral grays for text, borders, backgrounds
- `accent-*` — indigo/blue for primary actions and highlights
- Common classes: `btn-primary`, `input`, `select`, `textarea`

---

## 12. Deployment

### Backend — Railway

The backend is deployed on Railway using Nixpacks.

- **Build command:** `cd backend && npm ci && npm run build`
- **Start command:** `cd backend && node dist/server.js`
- **Config file:** `railway.json` and `nixpacks.toml` at repo root

**Environment variables to set in Railway:**
- All variables from the `.env` reference above
- `DATABASE_URL` pointing to your production Supabase database
- `CORS_ORIGIN` set to your Netlify frontend URL
- `PUBLIC_FRONTEND_URL` set to your Netlify frontend URL
- `NODE_ENV=production`

**Database migrations on deploy:**
Railway does not run migrations automatically. After deploying, run:
```bash
railway run npx prisma migrate deploy
```

### Frontend — Netlify

The frontend is deployed on Netlify.

- **Build directory:** `frontend/`
- **Build command:** `npm run build`
- **Publish directory:** `dist/`
- **Config file:** `netlify.toml`

The `netlify.toml` includes a redirect rule that proxies `/api/*` requests to the Railway backend URL. Update this URL in `netlify.toml` if the Railway backend URL changes:
```toml
[[redirects]]
  from = "/api/*"
  to = "https://<your-backend>.up.railway.app/:splat"
  status = 200
  force = true
```

**Environment variables to set in Netlify:**
- `VITE_API_BASE_URL` — set to your Railway backend URL (e.g., `https://rfi-engine-production.up.railway.app`)

### Database — Supabase

The production database is hosted on Supabase (PostgreSQL 15/16). The `DATABASE_URL` is a standard PostgreSQL connection string from the Supabase project settings.

To apply schema changes:
```bash
cd backend
npx prisma migrate deploy
```

---

## 13. Known Limitations & Future Work

### Current limitations (PoC scope)

1. **No real-time updates** — The chat page does not use WebSockets. Users must manually refresh to see new turns from agent evaluation. Auto-polling can be added with a `setInterval` or by switching to Server-Sent Events.

2. **No email integration** — Invitation links must be manually copied and shared. A real deployment would integrate with SendGrid or similar to send invitation emails automatically.

3. **Single catalogue item per session** — Each session is bound to one catalogue item at creation time. The variant recommendation in the report reconstructs multi-variant analysis from session turns, but the live evaluation only uses one item's values.

4. **LLM evaluation reliability** — Subjective parameter evaluation relies on the LLM following the prompt correctly. Confidence scores are self-reported by the LLM and are not calibrated. Manual review of LLM-judged parameters is recommended.

5. **No audit log** — There is no tamper-evident audit trail of who changed what. For a production compliance tool, this would be required.

6. **No notifications** — Users are not notified when a session completes or when a human interjection is added. Push notifications or email alerts would be needed.

7. **Password reset** — There is no "forgot password" flow. An admin would need to directly update the database.

8. **File storage in production** — For large deployments, switch `STORAGE_PROVIDER` to `r2` and set up a Cloudflare R2 bucket. Local storage does not persist across Railway redeploys.

### Suggested next steps

- Add WebSocket/SSE for live session updates
- Integrate email sending for invitations and session notifications
- Add password reset flow
- Add audit logging (who ran what session, when)
- Calibrate LLM confidence scores with a validation set
- Add session-level access control (not just supplier-level)
- Build an admin dashboard for tenant management
- Support multiple simultaneous catalogue items per session evaluation

---

*This document covers the codebase as of the v0.2.0 PoC handover. For questions about specific design decisions, refer to git commit history or reach out to Shourya Shrivastava.*
