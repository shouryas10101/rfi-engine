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
4. [Setting Up on Your Local Machine](#4-setting-up-on-your-local-machine)
5. [Environment Variables — Plain English Guide](#5-environment-variables--plain-english-guide)
6. [Database Schema](#6-database-schema)
7. [Feature Walkthrough](#7-feature-walkthrough)
8. [System Architecture](#8-system-architecture)
9. [Backend API Reference](#9-backend-api-reference)
10. [Frontend Reference](#10-frontend-reference)
11. [Deploying to Production](#11-deploying-to-production)
12. [Known Limitations & Future Work](#12-known-limitations--future-work)

---

## 1. Project Overview

Setu is a multi-tenant web application built as a proof of concept for **Tata Motors (TML)**. It automates the **Request for Information (RFI) compliance evaluation** process in automotive component procurement.

The traditional RFI process involves TML engineers manually sending specification questionnaires to suppliers, collecting responses, and evaluating whether supplier components meet requirements — a process that takes weeks. Setu replaces this with an AI-driven agent conversation where:

- A **TML agent** (AI-powered) asks requirement questions on behalf of Tata Motors
- A **Supplier agent** (AI-powered) answers using the supplier's own catalogue data
- Responses are **automatically evaluated** against spec thresholds
- A **compliance report** is generated at the end showing which supplier products pass, which are eliminated, and which is recommended

### User Roles

| Role | Who | What they can do |
|---|---|---|
| `TML_ADMIN` | Tata Motors administrator | Full access — manage projects, RFIs, suppliers, sessions, users |
| `TML_ENGINEER` | Tata Motors engineer | Manage projects, RFIs, suppliers, view and run sessions |
| `SUPPLIER_ENGINEER` | Supplier company user | View their own sessions, manage their own product catalogue |

---

## 2. Technology Stack

You do not need to deeply understand all of these. This table is for reference.

| Layer | Technology | What it does |
|---|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS | The web pages the user sees and interacts with |
| Backend | Node.js, Express, TypeScript, Prisma | The server that handles business logic and database operations |
| Database | PostgreSQL 16 | Stores all application data |
| AI / LLM | OpenAI API (gpt-4o-mini) | Powers the agent conversations and evaluations |
| Authentication | JWT, bcryptjs | Handles user login and session security |
| Document parsing | pdf-parse, mammoth, xlsx | Extracts text from uploaded PDF, Word, and Excel files |
| File storage | Local filesystem or Cloudflare R2 | Stores uploaded documents |
| Deployment | Railway (backend), Netlify (frontend) | Hosts the live application |
| Production database | Supabase | Hosts the PostgreSQL database in the cloud |

---

## 3. Repository Structure

The codebase lives at: **https://github.com/shouryas10101/rfi-engine**

```
rfi-engine/
├── backend/                         The server-side application
│   ├── prisma/
│   │   ├── schema.prisma            Defines the database structure
│   │   └── migrations/              History of database changes
│   ├── scripts/                     One-off utility scripts
│   │   └── regenerate-reports.mjs   Rebuilds old compliance reports
│   └── src/
│       ├── agents/                  AI agent prompts (TML + Supplier)
│       ├── compliance/              Compliance report builder
│       ├── domain/                  Shared data types
│       ├── evaluation/              Checks supplier answers against specs
│       ├── routes/                  API endpoint handlers
│       └── services/                Session orchestration logic
│
├── frontend/                        The browser-side application
│   ├── public/                      Static files (logos, icons)
│   └── src/
│       ├── auth/                    Login page and auth logic
│       ├── components/              Shared UI components
│       ├── supplier/                Pages visible to supplier users
│       └── tml/                     Pages visible to TML users
│
├── docker-compose.yml               Runs a local PostgreSQL database
├── railway.json                     Tells Railway how to deploy the backend
├── netlify.toml                     Tells Netlify how to deploy the frontend
└── HANDOVER.md                      This document
```

---

## 4. Setting Up on Your Local Machine

This section walks you through running the application on your own computer, step by step. No prior experience is assumed.

---

### Step 1 — Install the required software

You need to install four things before you can run the project. Follow each link, download the installer for Windows, and run it with default settings.

#### 1a. Node.js (version 20 or higher)

Node.js is the engine that runs the backend server.

- Download from: **https://nodejs.org** — click the **LTS** button (the left one)
- Run the installer with all default settings
- When it finishes, open a new **Command Prompt** or **PowerShell** window and type:
  ```
  node --version
  ```
  You should see something like `v20.11.0`. If you do, Node.js is installed correctly.

#### 1b. Git

Git is the tool that lets you download the code from GitHub.

- Download from: **https://git-scm.com/download/win**
- Run the installer with all default settings
- When it finishes, open a new terminal and type:
  ```
  git --version
  ```
  You should see something like `git version 2.43.0`.

#### 1c. Docker Desktop

Docker Desktop runs the local database on your machine.

- Download from: **https://www.docker.com/products/docker-desktop**
- Run the installer with all default settings
- After installation, **open Docker Desktop** from the Start menu and wait for it to say "Docker Desktop is running" (the whale icon in the taskbar should stop animating)
- You do not need to create a Docker account — you can skip any sign-in prompt

#### 1d. Visual Studio Code (recommended, optional)

A code editor that makes it easier to read and edit the files.

- Download from: **https://code.visualstudio.com**

---

### Step 2 — Download the code

Open a **PowerShell** or **Command Prompt** window. Decide where you want to store the project (e.g., your Desktop or Documents folder) and run:

```
cd Desktop
git clone https://github.com/shouryas10101/rfi-engine.git
cd rfi-engine
```

This downloads the entire codebase into a folder called `rfi-engine`.

---

### Step 3 — Start the local database

The application needs a database to store its data. Docker Desktop runs this database locally on your machine.

Make sure Docker Desktop is open and running (check the taskbar). Then in your terminal, inside the `rfi-engine` folder, run:

```
docker compose up -d
```

This downloads and starts a PostgreSQL database. The `-d` flag runs it in the background so it does not take over your terminal window.

To confirm it is running, run:
```
docker ps
```
You should see a row with `postgres:16-alpine` in it. If you do, the database is running.

> **Note:** You need to run `docker compose up -d` every time you restart your computer, before starting the app.

---

### Step 4 — Set up the backend

Open a new terminal window. Navigate into the backend folder:

```
cd Desktop\rfi-engine\backend
```

#### 4a. Create the environment file

The backend needs a configuration file called `.env` that tells it things like the database password and API keys. A template is already provided. Copy it:

```
copy .env.example .env
```

Now open the `.env` file in a text editor (Notepad or VS Code) and fill in the values. See **Section 5** for a plain-English explanation of each variable.

The minimum you need to fill in for local development:
- `DATABASE_URL` — already filled in the template, no change needed for local
- `JWT_SECRET` — type any random string of 32+ characters (e.g., `my-super-secret-key-that-nobody-knows-1234`)
- `OPENAI_API_KEY` — your OpenAI API key (see note below)

> **Note on OpenAI API key:** The AI features (agent conversations, document parsing) require an OpenAI API key. You can get one at **https://platform.openai.com**. If you do not have one, the app will still run but the session evaluation will use simple templates instead of real AI responses.

#### 4b. Install dependencies

This downloads all the third-party code the backend depends on:

```
npm install
```

This may take 1–2 minutes. You will see a lot of text — this is normal.

#### 4c. Set up the database tables

This creates all the required tables in your local database:

```
npx prisma migrate dev
```

When prompted with "Enter a name for the new migration", just press **Enter** to skip.

#### 4d. Create the initial user

This populates the database with a default Tata Motors admin user:

```
npx prisma db seed
```

This creates one user:
- **Email:** `priya@tml.test`
- **Password:** `password123`
- **Role:** TML Admin

#### 4e. Start the backend server

```
npm run dev
```

You should see output ending with something like:
```
Server listening on port 4000
```

Leave this terminal window open. The backend is now running at `http://localhost:4000`.

---

### Step 5 — Set up the frontend

Open a **second** terminal window (keep the first one running the backend). Navigate to the frontend folder:

```
cd Desktop\rfi-engine\frontend
```

#### 5a. Install dependencies

```
npm install
```

#### 5b. Start the frontend

```
npm run dev
```

You should see output ending with:
```
Local: http://localhost:5173/
```

Leave this terminal window open too.

---

### Step 6 — Open the app

Open a browser (Chrome recommended) and go to:

**http://localhost:5173**

Log in with:
- **Email:** `priya@tml.test`
- **Password:** `password123`

You are now logged in as a TML Admin and can use the full application.

---

### Stopping the application

To stop, press `Ctrl + C` in both terminal windows (backend and frontend). The database will keep running in Docker until you restart your computer or run `docker compose down`.

### Starting again after a restart

Every time you want to run the app again:

1. Open Docker Desktop and wait for it to start
2. In terminal: `cd Desktop\rfi-engine` then `docker compose up -d`
3. In terminal 1: `cd Desktop\rfi-engine\backend` then `npm run dev`
4. In terminal 2: `cd Desktop\rfi-engine\frontend` then `npm run dev`
5. Open `http://localhost:5173`

---

## 5. Environment Variables — Plain English Guide

The `.env` file in the `backend/` folder contains configuration values the app needs. Here is what each one means:

### Backend `.env`

| Variable | Plain English | Example value |
|---|---|---|
| `DATABASE_URL` | The address of your database, including the username and password. For local development, this is already set in the template. | `postgresql://rfi:rfi@localhost:5432/rfi_engine?schema=public` |
| `JWT_SECRET` | A secret password used to sign login tokens. Make it long and random. Keep it private — if someone gets this, they can forge login sessions. | `my-very-long-random-secret-abc-123` |
| `PORT` | Which port number the backend server runs on. 4000 is the default. | `4000` |
| `NODE_ENV` | Whether the app is running in development or production mode. Affects logging and error messages. | `development` or `production` |
| `OPENAI_API_KEY` | Your API key from OpenAI. Required for AI-powered features. Get one at platform.openai.com. The app still runs without it but AI features are replaced by simple templates. | `sk-...` |
| `OPENAI_MODEL` | Which OpenAI model to use. `gpt-4o-mini` is cheaper and fast. Change to `gpt-4o` for better quality at higher cost. | `gpt-4o-mini` |
| `STORAGE_PROVIDER` | Where uploaded files are saved. Use `local` for development (saves to your computer). Use `r2` in production (saves to Cloudflare cloud storage). | `local` |
| `LOCAL_UPLOAD_DIR` | The folder on your computer where uploaded files are saved when using local storage. | `./uploads` |
| `R2_ACCOUNT_ID` | Your Cloudflare account ID. Only needed if `STORAGE_PROVIDER=r2`. | *(from Cloudflare dashboard)* |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 access key. Only needed if `STORAGE_PROVIDER=r2`. | *(from Cloudflare dashboard)* |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 secret key. Only needed if `STORAGE_PROVIDER=r2`. | *(from Cloudflare dashboard)* |
| `R2_BUCKET` | The name of the Cloudflare R2 bucket where files are stored. | `rfi-engine-uploads` |
| `CORS_ORIGIN` | The URL of the frontend. The backend uses this to decide which browser requests to accept. | `http://localhost:5173` (dev) or your Netlify URL (prod) |
| `PUBLIC_FRONTEND_URL` | Used when generating invitation links. Set this to whatever URL users will open in their browser. | `http://localhost:5173` (dev) or your Netlify URL (prod) |
| `INVITATION_TTL_DAYS` | How many days an invitation link stays valid before expiring. | `7` |
| `MAX_UPLOAD_BYTES` | Maximum file size allowed for uploads, in bytes. 10485760 = 10 MB. | `10485760` |

### Frontend `.env`

The frontend has its own `.env` file in `frontend/`. For local development you do not need to change anything — the Vite dev server automatically forwards all API requests to the backend on port 4000.

| Variable | Plain English | Example value |
|---|---|---|
| `VITE_API_BASE_URL` | The URL of the backend API. Leave this empty in local development. In production, set it to your Railway backend URL. | *(empty for dev)* or `https://your-app.railway.app` |

---

## 6. Database Schema

The database has the following main tables and how they relate to each other:

```
Tenant  (the organisation — e.g., Tata Motors)
 └─ User  (people who log in — TML engineers, supplier staff)
 └─ Project  (a vehicle programme — e.g., Harrier EV 2026)
     └─ RFI  (a component specification — e.g., Brake Caliper)
         ├─ RFIParameter  (one requirement — e.g., Max torque > 300 Nm)
         ├─ BidlistEntry  (which suppliers are invited to respond)
         └─ Session  (one evaluation run for one supplier)
             ├─ Turn  (individual chat messages in the session)
             ├─ ParameterResponse  (the evaluation verdict for each requirement)
             └─ ComplianceReport  (the final report generated at the end)
 └─ Supplier  (a vendor company)
     ├─ CatalogueItem  (a product variant the supplier offers)
     └─ Invitation  (onboarding link sent to a new user)
```

### Session status values

| Status | Meaning |
|---|---|
| `pending` | Session created but not started yet |
| `active` | Evaluation is currently running |
| `paused` | Manually paused by a TML user |
| `completed` | All parameters evaluated, compliance report generated |
| `failed_veto` | Supplier was eliminated because a must-have requirement failed |
| `abandoned` | Manually abandoned |

---

## 7. Feature Walkthrough

### 7.1 Logging In

Open the app URL in your browser. You will see the Setu login screen. Enter your email and password and click **Sign in**. After logging in, you are taken to your home page — TML users see the Projects list, supplier users see their Sessions list.

If you forget your password, there is currently no self-service reset. A TML admin needs to update it directly in the database (this is a known limitation noted in Section 12).

---

### 7.2 Projects (TML only)

**Where to find it:** Left sidebar → Projects

Projects represent vehicle programmes at Tata Motors (e.g., "Harrier EV 2026", "Nexon Facelift"). Each project is a container for one or more RFIs.

**To create a project:**
1. Click the **New project** button on the Projects page
2. Fill in the project name, vehicle type, and target market
3. Optionally fill in programme milestone dates (KO, DR0–DR5)
4. Click **Save**

**To open a project:** Click its name in the list. You will see the project detail page showing all RFIs created under it.

---

### 7.3 RFI Management (TML only)

**Where to find it:** Open a project → click on an RFI, or create a new one

An RFI (Request for Information) is a specification document for one component category (e.g., Brake Caliper, Driveline). It contains:
- A list of **parameters** — the individual requirements a supplier must meet
- A **bidlist** — the list of suppliers invited to respond

#### Creating an RFI

1. Open a project and click **New RFI**
2. Enter the RFI title and component category
3. Add parameters manually, or upload a spec document (PDF/Word/Excel) and click **Extract parameters** to let the AI parse them automatically
4. Review extracted parameters and edit if needed
5. Click **Save**

#### Parameter types

Each parameter has a type that determines how it is evaluated:

| Type | Example | How it is checked |
|---|---|---|
| `numeric_range` | Max torque: 300–350 Nm | Supplier's value must fall within the range |
| `numeric_exact` | Thread pitch: M12 ± 0.5mm | Supplier's value must be within the tolerance |
| `numeric_subset_range` | Voltage: must cover 12–48V | Supplier's range must fully contain the RFI range |
| `boolean` | ABS compatible: yes/no | Parsed as yes or no |
| `enum` | Finish: anodised or powder-coated | Must match one of the listed values |
| `text` | Describe your QC process | Judged by AI — no numeric threshold |
| `subjective` | Rate your after-sales support | Judged by AI — no numeric threshold |

#### Parameter phases

Parameters are grouped into phases that are evaluated in order:

- **general** — warm-up questions, not scored
- **must_have** — hard requirements; if a supplier fails any one of these, the session ends immediately
- **good_to_have** — preferences that are scored but not eliminatory
- **subjective** — open-ended qualitative questions

#### Managing the bidlist

The bidlist controls which suppliers are invited to respond to this RFI. On the RFI detail page, scroll to the Bidlist section and click **Add supplier** to invite a supplier. Only suppliers on the bidlist can have sessions started for this RFI.

---

### 7.4 Suppliers and Catalogue (TML only)

**Where to find it:** Left sidebar → Vendor master

This section manages all the supplier companies and their product catalogues.

#### Creating a supplier

1. Click **New supplier**
2. Enter the supplier name, contact email, and optionally a logo URL
3. Click **Save**

The supplier will now appear in the Vendor master list and can be added to RFI bidlists.

#### Inviting a supplier user

Supplier engineers need a login to access their sessions. To create one:

1. Open a supplier's detail page
2. Click **Invite user**
3. Enter the supplier engineer's email address
4. Copy the generated invitation link
5. Send the link to the supplier engineer via email or any messaging tool

The supplier engineer opens the link, sets their name and password, and is automatically logged in. Invitation links expire after 7 days.

> **Note:** The system does not send emails automatically. You must manually copy and share the link.

#### Managing the catalogue

Each supplier can have multiple **catalogue items** — these represent the actual products they offer. The AI uses catalogue data to answer RFI questions on behalf of the supplier.

To add a catalogue item:
1. Open a supplier's detail page
2. Click **Add product**
3. Enter the component category (must match an RFI's component category exactly), a product code, and the parameter values as key-value pairs
4. Optionally upload a product datasheet (PDF)
5. Click **Save**

Example parameter values for a brake caliper:
```
max_torque: 320 Nm
abs_compatible: yes
finish: anodised
weight: 1.8 kg
operating_temp: -40 to 150 C
```

To upload multiple products at once, click **Upload catalogue file** and provide an Excel spreadsheet. The system detects whether products are listed as rows or columns and parses them automatically.

---

### 7.5 Sessions — Running an Evaluation

**Where to find it:** Left sidebar → Sessions

A session is one evaluation run between an RFI and a specific supplier. There is one session per (RFI, supplier) pair.

#### Starting a session

1. Open an RFI detail page
2. In the Bidlist section, click **Start session** next to the supplier you want to evaluate
3. The session is created and evaluation begins automatically in the background
4. Click on the session to open the chat view and watch the conversation in real time

#### What happens during evaluation

The system works through each parameter phase by phase, automatically:

1. The **TML agent** phrases a natural-language question about the parameter
2. The **Supplier agent** looks up the value in the supplier's catalogue and phrases an answer
3. The **Evaluator** checks the answer against the parameter's spec threshold
4. A verdict (`pass`, `fail`, or `partial`) is recorded along with a confidence score and rationale
5. If a must-have parameter fails, the session ends immediately as `failed_veto`
6. Once all phases are complete, a compliance report is generated automatically

All of this happens without any manual input. You can watch the conversation appear in the chat view as it progresses.

#### Human interjection

Either a TML user or a supplier user can add their own message at any point during the session:

1. Type your message in the text box at the bottom of the chat
2. Click **Send**
3. The system re-evaluates the affected parameter using your message instead of the agent's answer

Human turns are displayed differently from agent turns in the chat so you can tell them apart.

#### Session controls (visible to TML users only)

| Button | What it does |
|---|---|
| Start | Begins evaluation — moves the session from pending to active |
| Pause | Pauses the session mid-way through |
| Resume | Continues a paused session |
| Step | Runs exactly one parameter evaluation and stops |

---

### 7.6 Compliance Report

**Where to find it:** Open a completed session → click **View report**

After a session completes (or ends as failed_veto), a compliance report is automatically generated. The report contains:

**Summary section:**
- Overall compliance status: `compliant`, `partially_compliant`, or `non_compliant`
- Must-have pass rate (e.g., 8/10 requirements passed)
- Good-to-have score (e.g., 65%)
- If the session ended as failed_veto, which parameter caused the elimination and why

**Variant recommendations section:**
- A green callout showing the recommended product variant with its score
- A table listing all the supplier's product variants, their status (active or eliminated), and how many requirements each one passed

**Parameter-by-parameter breakdown:**
- Every question asked and answered
- The verdict (pass/fail/partial), confidence level, and rationale for each

#### How compliance status is determined

| Status | Condition |
|---|---|
| `compliant` | All must-have requirements passed AND good-to-have score ≥ 70% |
| `partially_compliant` | All must-have requirements passed BUT good-to-have score < 70% |
| `non_compliant` | One or more must-have requirements failed |

#### Regenerating a report

If a session's responses were updated after the report was first generated (e.g., due to a human interjection), TML users can rebuild the report by clicking **Regenerate report** on the session page.

---

### 7.7 Supplier Comparison

**Where to find it:** Open an RFI → click **Compare suppliers**

Once multiple sessions are completed for the same RFI, this view shows all suppliers side by side:
- Each column is a supplier
- Each row is a parameter
- Each cell shows the supplier's answer and verdict (colour coded: green = pass, red = fail, yellow = partial)
- Suppliers are ranked by a composite score at the top

**Scoring weights:**
- Must-have pass rate: 50%
- Good-to-have score: 25%
- Subjective score: 15%
- Modification distance penalty: 10%

Any supplier with a must-have failure is marked **ineligible** regardless of other scores.

Click **Export to Excel** to download the full comparison table as a `.xlsx` file.

---

### 7.8 Supplier View — Sessions and Catalogue

When a supplier engineer logs in, they see a simplified interface:

**My sessions** (left sidebar): Shows all sessions assigned to their supplier company. They can open a session to view the conversation, see which parameters have been evaluated, and add interjections via the message box.

**My catalogue** (left sidebar): Shows their company's product catalogue. They can add, edit, and delete catalogue items, and upload product datasheets.

---

## 8. System Architecture

### How a request flows through the system

```
Your browser (React app)
    │
    │  Sends requests with a login token (JWT) in the header
    ▼
Backend API server (Express, port 4000)
    │
    ├── Checks the login token (auth middleware)
    ├── Validates the request data (Zod)
    ├── Reads/writes the database (Prisma → PostgreSQL)
    │
    └── For session evaluation:
        ├── TML Agent  →  asks OpenAI to phrase a question
        ├── Supplier Agent  →  asks OpenAI to phrase an answer from catalogue data
        └── Evaluator  →  checks the answer deterministically or via OpenAI
```

### Session state machine

```
[pending] ──── Start ────▶ [active] ──── Pause ────▶ [paused]
                               │          ◀─── Resume ───┘
                               │
                    (evaluates parameters one by one)
                               │
                    Must-have fails ──▶ [failed_veto]
                               │
                    All done   ──▶ [completed]
```

### AI fallback behaviour

If no `OPENAI_API_KEY` is configured, the system switches to template mode:
- Agent questions and answers use pre-written templates instead of natural language
- Numeric, boolean, and enum parameters still evaluate correctly (this is done with code, not AI)
- Text and subjective parameters are recorded as `partial` — they need manual review

---

## 9. Backend API Reference

All API endpoints require a login token in the request header (`Authorization: Bearer <token>`), except the auth and onboarding endpoints.

### Auth

| Method | Path | Description |
|---|---|---|
| POST | `/auth/login` | Log in with email + password, receive a token |

### Projects

| Method | Path | Description |
|---|---|---|
| GET | `/projects` | List all projects |
| POST | `/projects` | Create a project |
| GET | `/projects/:id` | Get project detail with RFIs |
| PATCH | `/projects/:id` | Update project fields |
| DELETE | `/projects/:id` | Delete project and all its RFIs and sessions |

### RFIs

| Method | Path | Description |
|---|---|---|
| POST | `/rfis/parse-file` | Upload a document and extract parameters using AI |
| POST | `/rfis` | Create an RFI |
| GET | `/rfis/:id` | Get RFI with parameters, sessions, and documents |
| DELETE | `/rfis/:id` | Delete RFI |
| POST | `/rfis/:id/bidlist` | Add a supplier to the bidlist |
| DELETE | `/rfis/:id/bidlist/:supplierId` | Remove a supplier from the bidlist |
| GET | `/rfis/:id/comparison` | Get all supplier responses ranked |
| GET | `/rfis/:id/comparison/export` | Download comparison as Excel |

### Suppliers

| Method | Path | Description |
|---|---|---|
| GET | `/suppliers` | List all suppliers |
| POST | `/suppliers` | Create a supplier |
| GET | `/suppliers/:id` | Get supplier with catalogue and users |
| PATCH | `/suppliers/:id` | Update supplier details |
| DELETE | `/suppliers/:id` | Delete supplier |
| POST | `/suppliers/:id/catalogue` | Add a catalogue item |
| POST | `/suppliers/:id/catalogue/parse-file` | Parse Excel file into catalogue items |
| PUT | `/suppliers/:id/catalogue/:itemId` | Update a catalogue item |
| DELETE | `/suppliers/:id/catalogue/:itemId` | Delete a catalogue item |

### Sessions

| Method | Path | Description |
|---|---|---|
| GET | `/sessions` | List sessions (filtered by role) |
| POST | `/sessions` | Create a session |
| GET | `/sessions/:id` | Get session with turns and responses |
| POST | `/sessions/:id/start` | Start session and run evaluation automatically |
| POST | `/sessions/:id/pause` | Pause session |
| POST | `/sessions/:id/resume` | Resume paused session |
| POST | `/sessions/:id/step` | Run one parameter evaluation |
| POST | `/sessions/:id/run` | Run until all parameters are evaluated |
| POST | `/sessions/:id/interject` | Submit a human message |
| DELETE | `/sessions/:id` | Delete session |
| GET | `/sessions/:id/report` | Get the latest compliance report |
| POST | `/sessions/:id/report/regenerate` | Rebuild the compliance report |

### Documents

| Method | Path | Description |
|---|---|---|
| POST | `/documents/upload` | Upload a file for an RFI or catalogue item |
| POST | `/documents/upload-for-turn` | Upload a file to attach to a chat turn |
| GET | `/documents/:id/download` | Download a file |
| DELETE | `/documents/:id` | Delete a file |

### Invitations

| Method | Path | Description |
|---|---|---|
| GET | `/invitations` | List all invitations |
| POST | `/invitations` | Create an invitation link |
| POST | `/invitations/:id/revoke` | Revoke a pending invitation |
| GET | `/invitations/onboard/:token` | Get invitation details (public, no login needed) |
| POST | `/invitations/onboard/:token` | Accept invitation and create account |

---

## 10. Frontend Reference

### Pages and who can see them

| URL | Page | Visible to |
|---|---|---|
| `/login` | Login screen | Everyone |
| `/onboard/:token` | Accept invitation and set password | Everyone (via invite link) |
| `/projects` | List of all projects | TML only |
| `/projects/:id` | Project detail with RFIs | TML only |
| `/rfis/:id` | RFI detail with parameters and bidlist | TML only |
| `/rfis/:id/comparison` | Side-by-side supplier comparison | TML only |
| `/suppliers` | Vendor master list | TML only |
| `/suppliers/:id` | Supplier detail with catalogue and users | TML only |
| `/sessions` | All sessions list | Both |
| `/sessions/:id` | Session chat interface | Both |
| `/sessions/:id/report` | Compliance report | Both |
| `/catalogue` | Supplier's own catalogue | Supplier only |

---

## 11. Deploying to Production

The live application runs on two separate hosting platforms:
- **Railway** — hosts the backend API server
- **Netlify** — hosts the frontend web app
- **Supabase** — hosts the PostgreSQL database

The code is automatically deployed whenever you push changes to the `main` branch on GitHub. You do not need to manually trigger a deploy.

---

### 11.1 Setting up Railway (backend hosting)

If this is your first time setting up Railway:

1. Go to **https://railway.app** and sign in with GitHub
2. Click **New Project** → **Deploy from GitHub repo**
3. Select the `rfi-engine` repository
4. Railway will detect the `railway.json` config and set up the service automatically

#### Setting environment variables on Railway

The backend needs its `.env` variables configured in Railway:

1. In your Railway project, click on the backend service
2. Click the **Variables** tab
3. Add each variable from the table in Section 5, using your production values:
   - `DATABASE_URL` — your Supabase connection string (see Section 11.3)
   - `JWT_SECRET` — a long random string (different from your local one)
   - `NODE_ENV` — `production`
   - `OPENAI_API_KEY` — your OpenAI key
   - `OPENAI_MODEL` — `gpt-4o-mini`
   - `STORAGE_PROVIDER` — `local` (or `r2` if you have Cloudflare set up)
   - `CORS_ORIGIN` — your Netlify URL (e.g., `https://your-app.netlify.app`)
   - `PUBLIC_FRONTEND_URL` — same as CORS_ORIGIN

#### Running database migrations on Railway

After the first deploy (or after any schema change), run migrations:

1. Install the Railway CLI: `npm install -g @railway/cli`
2. Log in: `railway login`
3. Run: `railway run npx prisma migrate deploy`

#### Finding your Railway backend URL

1. In the Railway project, click the backend service
2. Click the **Settings** tab → **Domains**
3. Your URL looks like `https://rfi-engine-production.up.railway.app`

---

### 11.2 Setting up Netlify (frontend hosting)

If this is your first time setting up Netlify:

1. Go to **https://netlify.com** and sign in with GitHub
2. Click **Add new site** → **Import an existing project**
3. Select GitHub → select `rfi-engine`
4. Netlify will detect the `netlify.toml` config automatically. The settings should show:
   - Base directory: `frontend`
   - Build command: `npm run build`
   - Publish directory: `dist`
5. Click **Deploy site**

#### Setting environment variables on Netlify

1. In your Netlify site, go to **Site configuration** → **Environment variables**
2. Add: `VITE_API_BASE_URL` = your Railway backend URL (e.g., `https://rfi-engine-production.up.railway.app`)

#### Updating the API proxy URL

The `netlify.toml` file at the root of the repository contains a redirect rule that forwards API requests to Railway. If your Railway URL ever changes, update this line in `netlify.toml`:

```toml
[[redirects]]
  from = "/api/*"
  to = "https://YOUR-RAILWAY-URL.up.railway.app/:splat"
  status = 200
  force = true
```

Commit and push the change — Netlify will redeploy automatically.

---

### 11.3 Setting up Supabase (production database)

Supabase hosts the PostgreSQL database for the live application.

1. Go to **https://supabase.com** and create an account
2. Click **New project** — choose a name, set a database password, and select a region close to your users
3. Wait for the project to provision (takes about 1 minute)
4. Go to **Settings** → **Database**
5. Under **Connection string**, select the **URI** tab and copy the connection string
6. It looks like: `postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres`
7. Use this as the `DATABASE_URL` in Railway's environment variables

#### Running migrations on the production database

After setting `DATABASE_URL` in Railway and deploying, run:

```
railway run npx prisma migrate deploy
```

This creates all the required tables in the Supabase database.

---

### 11.4 Deploying future code changes

Once everything is set up, deploying changes is simple:

1. Make your code changes locally and test them
2. Run in the `rfi-engine` folder:
   ```
   git add <files you changed>
   git commit -m "Description of what you changed"
   git push origin main
   ```
3. Railway and Netlify automatically detect the push and redeploy within 3–5 minutes
4. Monitor the deploy in the Railway and Netlify dashboards

> **Important:** If you make changes to `prisma/schema.prisma` (the database structure), you must also run `railway run npx prisma migrate deploy` after deploying to apply the schema changes to the production database.

---

## 12. Known Limitations & Future Work

### Current limitations (PoC scope)

| Limitation | Detail |
|---|---|
| No real-time updates | The session chat page does not automatically refresh. Users must manually reload the page to see new agent turns. This can be fixed by adding WebSockets or Server-Sent Events. |
| No email sending | Invitation links must be manually copied and shared. A production version would integrate with an email service (e.g., SendGrid) to send them automatically. |
| No password reset | There is no "forgot password" feature. An admin must update the password directly in the database. |
| No notifications | Users are not alerted when a session completes or when someone adds a human interjection. |
| Local file storage not persistent | When using `STORAGE_PROVIDER=local`, uploaded files are stored on the Railway server's local disk. These are wiped when Railway redeploys. Switch to `STORAGE_PROVIDER=r2` (Cloudflare R2) for persistent file storage in production. |
| No audit log | There is no record of who changed what and when. A production compliance tool would require a full audit trail. |
| Single tenant | The system is designed for one organisation (Tata Motors). Adding a second OEM tenant would require additional setup. |
| LLM evaluation reliability | Subjective parameter evaluations rely on the AI following instructions correctly. Confidence scores are self-reported by the model and not calibrated. Manual review of AI-judged parameters is recommended. |

### Suggested next steps for a production version

- Add live updates using WebSockets so the session chat refreshes automatically
- Integrate email sending for invitations and session completion notifications
- Build a password reset flow
- Switch file storage to Cloudflare R2
- Add an audit log for all data changes
- Calibrate and validate LLM evaluation accuracy against a labelled dataset
- Add session-level access control (currently any TML user can see all sessions)
- Build a tenant management admin panel

---

*This document covers the Setu RFI Compliance Engine as of the v0.2.0 PoC handover in May 2026. For questions, reach out to Shourya Shrivastava.*
