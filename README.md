# EstateFlow — Real Estate Automation Suite

A production-structured automation suite for real estate teams, built to the four-system specification:

| System | What it does |
|---|---|
| 🤖 **AI Messaging** | Autonomous conversation handling — instant replies, lead qualification, intent detection, human escalation, spam suppression. Pluggable providers: **OpenAI**, **Anthropic (Claude)**, or a built-in **offline engine** (zero keys required). |
| 🏠 **Property Database** | Pulls and organizes public records via Python connectors (sample county feed, CSV assessor exports, generic HTTP/BeautifulSoup scraper) with automatic dedupe + full CRUD, filtering, and per-record provenance. |
| ☏ **Contacts & Data Management** | CRM pipeline (new → contacted → qualified → negotiating → closed), tags, budgets, target areas, CSV import/export, and auto-enrichment from AI conversations. |
| 📊 **Dashboard** | One interface tying it all together: KPIs, message volume charts, pipeline analytics, activity feed, ingest console, settings. |

**Stack:** Node.js (Express) · React (Vite) · Python (connectors worker) · SQLite (WAL, Postgres-portable schema) · N8N workflow included.

---

## Quick start

```bash
# 1. API server + dashboard (single port)
cd server && npm install
npm start                       # → http://localhost:3000

# 2. Frontend (already built into frontend/dist; to rebuild:)
cd frontend && npm install && npm run build

# 3. Optional: enable the generic HTTP scraper connector
pip3 install -r pyworker/requirements.txt
```

Demo data (10 properties, 8 contacts, 4 live conversations) seeds automatically on first boot. Reset anytime:

```bash
cd server && npm run seed       # add --force to wipe existing data
```

### Environment (`.env`, see `.env.example`)

| Variable | Purpose |
|---|---|
| `PORT` | API + dashboard port (default 3000) |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | Live AI providers — the app works without them (offline engine) |
| `OPENAI_MODEL` / `ANTHROPIC_MODEL` | Model overrides (defaults `gpt-4o-mini`, `claude-3-5-haiku-latest`) |
| `AI_PROVIDER` | `auto` \| `openai` \| `anthropic` \| `mock` |

Keys can also be saved at runtime from **Settings → AI messaging engine** (stored masked server-side).

---

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                    React dashboard (Vite build)                │
│   Dashboard · AI Inbox · Properties · Public Records · CRM     │
└────────────────────────────┬───────────────────────────────────┘
                             │ REST (same port)
┌────────────────────────────┴───────────────────────────────────┐
│                     Node.js / Express API                      │
│  properties · contacts · conversations · ingest · dashboard    │
│  ┌──────────────────────────┐  ┌────────────────────────────┐  │
│  │ AI engine (ai.js)        │  │ Ingest orchestrator        │  │
│  │ OpenAI / Claude / offline│  │ (pybridge.js)              │  │
│  │ intent · qualify · reply │  └─────────────┬──────────────┘  │
│  │ escalate · anti-spam     │                │ JSON over stdio │
│  └──────────────────────────┘  ┌─────────────┴──────────────┐  │
│                                │ Python worker (scraper.py) │  │
│                                │ sample · csv · http+bs4    │  │
└────────┬───────────────────────┴────────────────────────────┘  │
         │ POST /api/webhooks/inbound
         ▼
  Twilio (SMS) · SendGrid/Mailgun (email) · chat widget · N8N
```

- **One deployment** — the Express server serves both the REST API and the built dashboard on a single port.
- **Python isolation** — connectors run as subprocesses communicating over stdio (no extra service, no shared-process risk). The Node side stays crash-proof if a scrape fails.
- **Database** — SQLite (WAL mode) via Node's built-in driver; schema is written to be lifted straight into PostgreSQL (see below).

## The autonomous messaging pipeline

Every inbound message (`POST /api/webhooks/inbound`, Twilio-shaped payloads accepted too):

1. **Identity resolution** — matches the sender to a contact by email/phone or captures a new lead.
2. **Intent detection** — buying, selling, renting, investing, valuation, scheduling, mortgage, spam, general.
3. **Qualification extraction** — budget, beds/baths, target locations, timeline, pre-approval → written onto the contact record; high scores auto-advance pipeline stage.
4. **Reply generation** — through the active provider (OpenAI → Claude → offline engine), grounded on the business profile and contact context.
5. **Guardrails** — spam is never answered; legal/complaint/“speak to a human” language flags `pending_human` and notifies the dashboard instead of auto-sending.
6. **Audit** — every message stores its intent, sentiment, provider, and lead score.

Try it:

```bash
curl -X POST http://localhost:3000/api/webhooks/inbound \
  -H "Content-Type: application/json" \
  -d '{"channel":"sms","from":"+16025550100","name":"Alex Rivera","body":"Hi! Looking to buy a 3 bed in Tempe around $450k, pre-approved"}'
```

…or use **“Simulate inbound”** in the Inbox UI.

## API reference

Base URL `/api`. All endpoints return JSON.

| Method & path | Purpose |
|---|---|
| `GET/POST /properties` · `GET/PUT/DELETE /properties/:id` | Property CRUD with filters (`q, status, type, city, source, min, max, beds, sort, limit, offset`) |
| `POST /properties/import` | Bulk CSV import (public-records exports) with upsert dedupe |
| `GET/POST /contacts` · `GET/PUT/DELETE /contacts/:id` | CRM CRUD, filters (`q, type, stage, tag`) |
| `POST /contacts/import` | Bulk contact CSV import |
| `GET /conversations` · `GET /conversations/:id` | Thread list + full message thread |
| `PATCH /conversations/:id` | Autopilot toggle, status (`open/pending_human/closed`), subject |
| `POST /conversations/:id/messages` | Agent manual reply (hand-off) |
| `POST /conversations/:id/suggest` | AI draft **without sending** |
| `POST /conversations/:id/run-autopilot` | Manually trigger autopilot |
| `POST /webhooks/inbound` | Inbound message pipeline (see above) |
| `GET /ingest/connectors` · `POST /ingest/run` · `GET /ingest/runs[/:id]` | Connector catalog, run a scrape, run history + logs |
| `GET /dashboard/stats` | KPIs, time series, intents, recent activity |
| `GET/PUT /settings/ai` · `POST /settings/ai/test` | Provider config (keys masked) + smoke test |
| `GET /health` | Liveness |

## Public-records connectors (`pyworker/scraper.py`)

| Connector | Input | Notes |
|---|---|---|
| `sample` | `limit, city, state` | Synthetic “Maricopa County” feed (stdlib only) — exercises the full pipeline offline |
| `csv` | `path` | County assessor/recorder CSV exports; 25+ column synonyms auto-mapped |
| `http` | `url, format, item_selector, fields, limit` | Generic scraper: JSON key-paths or HTML + CSS selectors via requests/BeautifulSoup |

Records upsert by `source + source_id`, falling back to `address + zip` — re-running a connector updates instead of duplicating. Each run is persisted with status, counts, and a full log.

### PostgreSQL migration

The schema in `server/src/db.js` is standard SQL. To move to Postgres: run the same DDL against Postgres, swap the driver (e.g. `pg` or `postgres` npm package) behind the `db.js` helpers (`all/get/run`), and replace the few SQLite idioms (`datetime('now', …)` → `now() - interval`, `json_each` → `jsonb_array_elements`). The rest of the codebase is driver-agnostic.

### N8N

Import `integrations/n8n/real-estate-automation.json` into N8N, point its HTTP nodes at your server, and wire the inbound webhook to Twilio/IMAP. A minimal flow (webhook → autopilot → respond) is pre-built.

## Project structure

```
server/          Node.js + Express API
  src/ai.js        provider abstraction + autopilot engine
  src/db.js        schema + helpers (SQLite, Postgres-portable)
  src/pybridge.js  spawn Python connectors, JSON over stdio
  src/routes/      properties · contacts · conversations · ingest · dashboard · settings · webhooks
  src/seed.js      demo dataset
frontend/        React (Vite) dashboard
  src/pages/       Dashboard · Inbox · Properties · Ingest · Contacts · Settings
  src/components/  design system, hand-rolled SVG charts (no chart deps)
pyworker/        Python connector worker (sample · csv · http)
integrations/n8n N8N workflow
```

## Delivery plan (milestones)

As scoped for the fixed-price engagement:

1. **M1 — Foundations (week 1):** repo, schema, property + contact CRUD, dashboard shell.
2. **M2 — Public records (week 2):** connector framework, sample + CSV + HTTP scrapers, ingest console with run history, dedupe strategy.
3. **M3 — AI messaging (weeks 3–4):** webhook pipeline, provider abstraction (OpenAI/Claude/offline), qualification + escalation guardrails, AI Inbox UI, N8N workflow.
4. **M4 — Dashboard & hardening (week 5):** analytics, settings, seed/demo data, docs, deployment notes, hand-off.

## Roadmap / next steps

- AuthN/AuthZ (multi-agent accounts, roles, audit log)
- Twilio + SendGrid live send/receive adapters (webhook shapes already handled)
- Property ↔ contact interest matching with automatic lead alerts
- Map view + county portal coverage beyond Maricopa-style feeds
- Postgres + Docker Compose deployment profile
