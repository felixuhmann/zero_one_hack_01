# AGENTS.md

## Cursor Cloud specific instructions

### Product

Single runnable app: **Sybilion forecasting** (`apps/frontend` + `apps/backend`). Other repo paths (`tracks/`, `submission/`, `docs/`) are documentation only.

### System dependency (one-time on fresh Ubuntu VMs)

`python3 -m venv` requires the distro package **`python3.12-venv`** (or matching Python version). Install once if venv creation fails:

```bash
sudo apt-get install -y python3.12-venv
```

### Environment file

Copy `.env.example` → `.env` at repo root if missing. Keys: `FRED_API_KEY`, `SYBILION_API_KEY`, `AI_GATEWAY_API_KEY` (see root `README.md`). Without Sybilion/FRED keys, Decision Studio **Processing** and full forecast API calls fail; health, static studio steps, and UI navigation still work.

### Dev servers (two processes)

From repo root, with `.venv` activated for the backend terminal:

| Service | Command | URL |
|---------|---------|-----|
| Backend | `npm run dev:backend` | http://127.0.0.1:8000 |
| Frontend | `npm run dev:frontend` | http://localhost:5173 |

Vite proxies `/api` → `127.0.0.1:8000`. Prefer `curl http://localhost:5173/api/health` over `127.0.0.1:5173` right after startup (Vite can be slow to bind on IPv4).

Use **tmux** for long-running dev servers in Cloud Agent sessions.

### Lint / test / build

| Task | Command | Notes |
|------|---------|-------|
| Lint | `npm run lint` in `apps/frontend` | ESLint; repo currently has pre-existing rule violations |
| Build | `npm run build:frontend` from root | `tsc -b` + Vite → `apps/frontend/dist/` |
| Backend tests | — | Not configured (no pytest/ruff scripts) |

### Rolldown / Vite native binding

If `npm run dev:frontend` fails with **Cannot find native binding**, see root `README.md` (`@rolldown/binding-linux-x64-gnu` workaround).

### Docker alternative

`docker build` + `docker run -p 8000:8000` serves API + built UI on one port; see `README.md`.

### Hello-world smoke test

1. `curl -s http://127.0.0.1:8000/api/health` → `{"status":"ok"}`
2. Open http://localhost:5173 → Policy Decision Studio
3. Select a jurisdiction, advance to Data Sources (no external keys required)
