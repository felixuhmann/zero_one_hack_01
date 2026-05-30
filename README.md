# Zero One Hack_01

**36 hours. Real infrastructure. European AI sovereignty.**

Welcome to the central repository for Zero One Hack_01, hosted by [Lumos Consulting](https://lumos-consulting.at) at [AI Factory Austria](https://aifactory.at) in Vienna, with compute provided by CINECA on the Leonardo GPU Cluster.

---

## Quick links

- 🌐 **Docs**: [docs.zero-one.lumos-consulting.at](https://docs.zero-one.lumos-consulting.at/)
- 💬 **Discord**: https://discord.gg/e6rrVbcD5
- 📍 **Venue**: AI Factory Austria (AI:AT), Vienna

---

## The three tracks

| Track                | Partner  | What you'll build                                                                                                               |
| -------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 🧾 **Insurance AI**   | UNIQA    | An AI-guided conversion flow that replaces a static form-based insurance calculator. Persona-based simulations on Leonardo.     |
| ⚙️ **Industrial AI**  | Infineon | Train and benchmark sequence models on semiconductor process flows. Does your model learn real process logic, or just memorize? |
| 📈 **Forecasting AI** | Sybilion | Build a decision agent on top of a probabilistic forecasting API. Live mid-run plot twist on Sunday.                            |

Each track's full briefing, data, and starter materials live in [`/tracks/`](./tracks/). 

---

## Development

This repo is a monorepo for the **Sybilion forecasting** track app:

| Path | Purpose |
|------|---------|
| [`apps/frontend/`](./apps/frontend/) | React + TypeScript (Vite) UI |
| [`apps/backend/`](./apps/backend/) | Python forecasting pipeline (FRED → Sybilion → ensemble → scenario) |
| [`tracks/forecasting-sybilion/`](./tracks/forecasting-sybilion/) | Track briefing and reference docs |

### Prerequisites

- **Node.js** 20.19+ (or 22.12+) and npm (for the frontend — Vite 8 + Tailwind v4)
- **Python** 3.11+
- API keys (see [Environment variables](#environment-variables)):
  - [FRED API key](https://fred.stlouisfed.org/docs/api/api_key.html)
  - Sybilion API key (from hackathon mentors / track materials)

### One-time setup

From the repository root:

```bash
# Python backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
pip install -e apps/backend

# Environment
cp .env.example .env
# Edit .env and set FRED_API_KEY and SYBILION_API_KEY

# Frontend (use Node 20.19+; `nvm use` if you have .nvmrc)
cd apps/frontend && npm install && cd ../..
```

If `npm run dev:frontend` fails with **Cannot find native binding** / `@rolldown/binding-linux-x64-gnu`, npm skipped an optional dependency. From `apps/frontend`:

```bash
rm -rf node_modules package-lock.json && npm install
# still broken on Linux/WSL:
npm install @rolldown/binding-linux-x64-gnu@1.0.2 --save-dev
```

### Run in dev mode

Use **two terminals** (both from the repo root, with the venv activated in the backend terminal).

**Terminal 1 — frontend** (hot reload at http://localhost:5173):

```bash
npm run dev:frontend
```

Or from `apps/frontend`:

```bash
cd apps/frontend && npm run dev
```

The Vite dev server proxies `/api` to `http://127.0.0.1:8000`. Start the API in another terminal:

```bash
npm run dev:backend
```

Endpoints: `GET /api/health`, `POST /api/chat` (streaming chat for the frontend; see [`docs/chat-api.md`](./docs/chat-api.md)), `POST /api/forecast/run` (runs the full pipeline; can take a long time).

The frontend uses **Tailwind CSS v4** with **shadcn/ui** (`@tailwindcss/vite` plugin). Add components with `npx shadcn@latest add <name>` from `apps/frontend/`.

**Terminal 2 — backend pipeline** (CLI, long-running Sybilion jobs):

Run from the **repository root** so artifacts land in `artifacts/fed_rate_forecast/`:

```bash
source .venv/bin/activate
cd apps/backend && python -m forecasting
```

Or from the root (with venv active):

```bash
npm run pipeline
```

The pipeline fetches FRED data, submits parallel Sybilion forecast jobs, builds an ensemble, and prints a scenario classification. Expect **several minutes to an hour** depending on API queue time.

### Environment variables

Copy [`.env.example`](./.env.example) to `.env` in the repo root (do not commit `.env`):

| Variable | Required for |
|----------|----------------|
| `FRED_API_KEY` | Fetching macro time series from FRED |
| `SYBILION_API_KEY` | Sybilion forecast and drivers API |
| `AI_GATEWAY_API_KEY` | Chat endpoint (`POST /api/chat`) — LLM via Vercel AI Gateway |

Optional chat overrides: `LLM_MODEL` (default `anthropic/claude-sonnet-4.6`) and
`LLM_BASE_URL` (any OpenAI-compatible endpoint, e.g. a self-hosted / Leonardo
vLLM server). See [`docs/chat-api.md`](./docs/chat-api.md) for the full contract.

The backend loads `.env` automatically on startup (`forecasting.env.load_env`). Do not put real keys in `.env.example`.

### Build frontend for production

```bash
npm run build:frontend
```

Output: `apps/frontend/dist/`

### Deploy (Docker / Railway)

The app ships as a **single container**: the multi-stage [`Dockerfile`](./Dockerfile)
builds the frontend, then the FastAPI backend serves both the API (`/api/*`) and
the built static UI from the **same origin** (so no CORS/proxy config is needed
in production).

**Build & run locally with Docker:**

```bash
docker build -t zero-one-hack .
docker run --rm -p 8000:8000 \
  -e FRED_API_KEY=... \
  -e SYBILION_API_KEY=... \
  -e AI_GATEWAY_API_KEY=... \
  zero-one-hack
# open http://localhost:8000
```

**Railway:** [`railway.json`](./railway.json) tells Railway to build from the
`Dockerfile` and health-check `/api/health`. Just connect the repo, set the env
vars below in the service **Variables** tab, and deploy. Railway injects `$PORT`
automatically and the server binds it (no `.env` file needed — see below).

**Required env vars** (set in the platform, not a committed file): `FRED_API_KEY`,
`SYBILION_API_KEY`, `AI_GATEWAY_API_KEY`. Optional: `LLM_MODEL`, `LLM_BASE_URL`,
`HOST`/`PORT` (defaults `0.0.0.0` / `8000`), and `CORS_ALLOW_ORIGINS`
(comma-separated extra origins, only needed if you host the frontend separately).

> In hosted deployments there is no `.env` file; `load_env()` skips file loading
> and reads keys straight from the process environment injected by the platform.

### Project layout (backend package)

```text
apps/backend/forecasting/
├── cli.py                 # CLI + FastAPI app (python -m forecasting)
├── pipeline.py            # region-agnostic forecast orchestrator
├── regions.py             # region registry (fed/ecb) + pipeline factory
├── api/                   # FRED + Sybilion HTTP clients
├── payloads/              # Sybilion request builders
├── chat/                  # streaming chat service + agent tools
└── analysis/              # ensemble + scenario rules
```

Track-specific docs: [`tracks/forecasting-sybilion/Track_Build_on_Probability.md`](./tracks/forecasting-sybilion/Track_Build_on_Probability.md)

---

## What's provided

- **Compute**: Leonardo GPU Cluster (A100s). 
- **Workspace**: Power, fast WiFi, monitors on request, breakout rooms for team calls.
- **Mentors**: Domain experts from each partner company, plus ML/infra mentors from Lumos and HPE.
- **API credits and tokens**: Track-specific, documented in each track's README.


---
## How submissions work

1. **Fill out the Tally submission form** by Sunday 10:00 — link will be shared in `#announcements`
2. The form takes four fields: team name, repository URL, slides (PDF), and demo video (file or link, max 2 minutes)
3. The Tally form timestamp is your official submission time
4. After 10:00 the form closes. No late submissions.

Full submission details, requirements, and the pre-submission checklist live in [`/submission/SUBMISSION.md`](./submission/SUBMISSION.md).

---

## Judging

Each track has its own rubric in [`/judging/rubrics.md`](./judging/rubrics.md). All tracks share these baseline expectations:

- **Working artifact** — not a slideware demo, something that actually runs
- **Reproducibility** — your repo should let someone else re-run your work
- **Honest evaluation** — show what worked, show what didn't, show what you measured
- **Visible reasoning** — explain *why* you made the technical choices you did

---

## Code of conduct & house rules

- Be kind. Be useful. Be honest about your work.
- AI Factory Austria is a working facility — respect equipment, doors, quiet hours.
- Mentors are here to unblock you, not to write your code. Use them well.
- The Leonardo cluster is shared infrastructure. No cryptomining, no training on copyrighted data, no abuse of compute. Violations = disqualification.
- See [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md) for the full version.

---

## Get help

| Channel                                    | Use for                             |
| ------------------------------------------ | ----------------------------------- |
| `#announcements`                           | Schedule changes, important updates |
| `#industrial`,`#insurance`, `#forecasting` | Track-specific questions            |
| `#infra`                                   | Leonardo, GPU quota, WiFi, hardware |
| `#general`                                 | Everything else                     |
| In-person Lumos desk (lobby)               | Anything urgent                     |

---

*Looking forward to seeing what you build.* 🚀