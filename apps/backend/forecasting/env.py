import os
from pathlib import Path

from dotenv import load_dotenv

# Repo root: .../zero_one_hack_01
_REPO_ROOT = Path(__file__).resolve().parents[3]

# Sybilion requires 40+ monthly observations
SYBILION_MIN_OBSERVATIONS = 40


def _strip_env(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip().strip('"').strip("'")
    return cleaned or None


def load_env() -> None:
    """Load API keys from `.env.example`, optional `.env`, then `to_hide/key`."""
    example = _REPO_ROOT / ".env.example"
    if example.is_file():
        load_dotenv(example)

    env_file = _REPO_ROOT / ".env"
    if env_file.is_file():
        load_dotenv(env_file, override=True)

    for name in ("FRED_API_KEY", "SYBILION_API_KEY", "SYBILION_API_TOKEN"):
        if name in os.environ:
            cleaned = _strip_env(os.environ.get(name))
            if cleaned:
                os.environ[name] = cleaned

    # Local override for Sybilion (e.g. hackathon key not committed in .env.example)
    key_file = _REPO_ROOT / "to_hide" / "key"
    if key_file.is_file():
        token = _strip_env(key_file.read_text(encoding="utf-8"))
        if token:
            os.environ["SYBILION_API_KEY"] = token