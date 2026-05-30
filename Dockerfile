# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1 — build the React/Vite frontend into apps/frontend/dist
# ---------------------------------------------------------------------------
FROM node:22-slim AS frontend
WORKDIR /app/apps/frontend

# Install deps first for better layer caching.
COPY apps/frontend/package.json apps/frontend/package-lock.json ./
RUN npm ci

# Build the static bundle.
COPY apps/frontend/ ./
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2 — Python runtime that serves the API *and* the built frontend
# ---------------------------------------------------------------------------
FROM python:3.11-slim AS runtime
WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000

# Install backend dependencies first (cached unless requirements change).
COPY apps/backend/requirements.txt apps/backend/requirements.txt
RUN pip install --no-cache-dir -r apps/backend/requirements.txt

# Install the backend package (registers the `forecast-api` entrypoint).
COPY apps/backend/ apps/backend/
RUN pip install --no-cache-dir -e apps/backend

# Copy the built frontend so FastAPI can serve it from the same origin.
COPY --from=frontend /app/apps/frontend/dist apps/frontend/dist

EXPOSE 8000

# `forecast-api` -> forecasting.cli:serve, which binds 0.0.0.0 and honours $PORT.
CMD ["forecast-api"]
