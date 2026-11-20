import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import app  # noqa: E402,F401  -- loads .env once, BEFORE the fixture below strips the secrets


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    """Tests never touch paid or shared services: no Gemini, no Supabase."""
    for var in ("GEMINI_API_KEY", "SUPABASE_URL", "VITE_SUPABASE_URL", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "VERCEL"):
        monkeypatch.delenv(var, raising=False)
