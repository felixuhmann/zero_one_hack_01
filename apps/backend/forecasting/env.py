import os
from pathlib import Path

from dotenv import load_dotenv

# Repo root: .../zero_one_hack_01
_REPO_ROOT = Path(__file__).resolve().parents[3]

# Sybilion requires 40+ monthly observations
SYBILION_MIN_OBSERVATIONS = 40

_ENV_FILE = _REPO_ROOT / ".env"


def _strip_env(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip().strip('"').strip("'")
    return cleaned or None


def load_env() -> None:
    """
    Load API keys from repo-root `.env` when present.

    For local development, copy `.env.example` to `.env` and set your keys
    there. In hosted/containerized deployments (Docker, Railway, ...) there is
    usually no `.env` file and the variables are injected into the process
    environment by the platform; in that case we simply skip file loading and
    rely on whatever is already in `os.environ`.
    """
    if _ENV_FILE.is_file():
        load_dotenv(_ENV_FILE)

    managed_vars = (
        "FRED_API_KEY",
        "SYBILION_API_KEY",
        "SYBILION_API_TOKEN",
        # Chat (LLM) configuration — Vercel AI Gateway by default.
        "AI_GATEWAY_API_KEY",
        "LLM_BASE_URL",
        "LLM_MODEL",
    )
    for name in managed_vars:
        if name in os.environ:
            cleaned = _strip_env(os.environ.get(name))
            if cleaned:
                os.environ[name] = cleaned
