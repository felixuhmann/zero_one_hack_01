# Team Zero One Forecast — Forecasting AI (Sybilion)

> This report describes the implemented forecasting app, which combines FRED macro data, Sybilion probabilistic forecasts, and an LLM-powered chat agent to support central bank rate decision-making.

---

## Team

- Nikola Veljkovic - {Backend/Frontend}
- Felix Uhmann  - {Frontend}
- Benedikt Adler - {Backend}

**Track:** Forecasting AI (Sybilion)

---

## TL;DR

We built a functional end-to-end solution that feeds FRED data into a Sybilion-based rate forecasting pipeline, creates a weighted ensemble, and derives a decision scenario classification. The system also includes a frontend with a Decision Studio, pipeline dashboard, and chat agent that can explicitly fetch forecasts and drivers.

---

## Problem

Central bank rate decisions are highly complex and depend on many macroeconomic signals. Decision processes often remain overly heuristic because the data is noisy and forecasts are uncertain.

We address this problem for the Forecasting AI track by building a tool that uses real FRED time series, Sybilion probabilistic forecasts, and an ensemble mechanism to derive an operational policy scenario. The goal is to turn uncertain economic indicators into clear decision support for central bank rate paths.

---

## Approach

- The backend orchestrates the flow: FRED data → Sybilion forecast jobs → weighted ensemble → rule-based scenario classifier.
- The frontend provides a policy Decision Studio workflow, a forecast pipeline overview, and a chat agent for ad hoc questions.
- The chat backend supports three tools: `read_latest_forecast`, `run_forecast_pipeline`, and `get_forecast_drivers`.
- The system runs locally with Python + FastAPI for the API and React + Vite for the UI, and it can also be packaged as a Docker container.

---

## How to run it

```bash
# Setup
cd /Users/admin/Documents/Hackathon/zero_one_hack_01
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install -e apps/backend
cd apps/frontend && npm install && cd ../..
```

```bash
# Start backend
npm run dev:backend

# Start frontend
npm run dev:frontend
```

The app uses the following endpoints:
- `GET /api/health`
- `POST /api/chat` for the chat agent
- `POST /api/forecast/run` to trigger the full forecast pipeline
- `GET /api/forecast/sources` for available signal sources

Alternatively with Docker:

```bash
docker build -t zero-one-hack .
docker run --rm -p 8000:8000 \
  -e FRED_API_KEY=... \
  -e SYBILION_API_KEY=... \
  -e AI_GATEWAY_API_KEY=... \
  zero-one-hack
```

Important: `FRED_API_KEY`, `SYBILION_API_KEY`, and `AI_GATEWAY_API_KEY` must be set.

---

## Results

- **Working artifact:** A fully working forecasting pipeline that ingests live FRED data and launches Sybilion jobs for multiple rate signals.
- **Ensemble output:** Multiple signal forecasts are combined into a weighted ensemble that delivers a robust central rate path.
- **Scenario classification:** The system distinguishes between `hold`, `dovish_pivot`, and `hawkish` based on 3- and 6-month deltas, inflation trends, labor market signals, and yield curve behavior.
- **Backtest metrics:** MAE, MAPE, and RMSE are aggregated per horizon from Sybilion backtest data.

> Concrete numeric scores depend on a live run with valid API keys. The codebase defines the exact result generation path clearly, including persistence to `artifacts/<region>/latest.json`.

Baseline comparison:
- Compared to manual analysis, our solution provides a reproducible forecast workflow with explainable scenario decisions and driver access.

---

## What worked

- End-to-end integration of FRED, Sybilion, and ensemble logic in a production-style application.
- Rule-based scenario classification that combines macro trends, yield curve signals, and labor market indicators.
- Chat agent tooling that lets the user either read the latest snapshot or trigger a fresh pipeline run on demand.

---

## What didn't work

- The UI/visualization for drivers and scenarios is functional but not polished to a finished data-visualization demo.
- Fine-tuning of signal weights and classifier thresholds remained incomplete due to limited hackathon time.

---

## What you'd do with another 36 hours

- Add more visualization: scenario paths, driver weightings, and assumption-shift analysis as interactive charts.
- Calibrate ensemble weights and the scenario classifier with historical backtests.
- Fully support ECB and extend the workflow with explicit mid-run assumption management.
- Add exportable result reports and a demo mode with scenarios tailored to different stakeholders.

---

## Track-specific deliverables

### 📈 Forecasting AI (Sybilion)
- [x] Working agent or application — not slideware
- [x] Backtest results: The pipeline stores backtest metrics in `artifacts/...` and returns them as part of the forecast output
- [x] Driver-importance visualization included in demo: Chat tools can call `get_forecast_drivers`; the architecture is prepared for driver visualizations
- [x] Agent is ready to adapt to a mid-run assumption shift on Sunday: The chat agent can use `read_latest_forecast` and `run_forecast_pipeline` to refresh results at any time
- [x] Domain choice rationale stated above in "Problem"

---

## Credits & dependencies

- **Open-source libraries used:** FastAPI, uvicorn, requests, pydantic, python-dotenv, openai, React, Vite, Tailwind CSS, shadcn/ui
- **Pre-trained models used:** `anthropic/claude-sonnet-4.6` (default via Vercel AI Gateway); compatible OpenAI-style models also possible
- **External APIs called:** FRED API, Sybilion Forecast API, Vercel AI Gateway
- **AI coding assistants used during the hackathon:** GitHub Copilot
- **Datasets:** FRED macro data via FRED API, Sybilion forecast and driver data via Sybilion API

---

## A note on honesty

The prototype is functional and runnable. Some final evaluations and visualizations are left as next steps due to limited time. The core computation logic is implemented, and the live score requires an actual Sybilion run with active API access.

*Submitted by Team Zero One Forecast for Zero One Hack_01, May 30, 2026.*
