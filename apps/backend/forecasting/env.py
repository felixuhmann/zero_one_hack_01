import os
from pathlib import Path

from dotenv import load_dotenv

# Repo root: .../zero_one_hack_01
_REPO_ROOT = Path(__file__).resolve().parents[3]

# Sybilion requires 40+ monthly observations
SYBILION_MIN_OBSERVATIONS = 40

_ENV_FILE = _REPO_ROOT / ".env"
_ENV_EXAMPLE = _REPO_ROOT / ".env.example"


def _strip_env(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip().strip('"').strip("'")
    return cleaned or None


def load_env() -> None:
    """
    Load API keys from repo-root `.env` only.

    Copy `.env.example` to `.env` and set your keys there.
    """
    if not _ENV_FILE.is_file():
        hint = (
            f"Create {_ENV_FILE.name} at the repo root "
            f"(copy from {_ENV_EXAMPLE.name}) and set FRED_API_KEY and SYBILION_API_KEY."
        )
        raise EnvironmentError(hint)

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
