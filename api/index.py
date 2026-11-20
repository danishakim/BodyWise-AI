"""Vercel entry point: every /api/* request is rewritten here (see vercel.json).

Vercel's Python runtime serves the ASGI `app`. The React site itself is served by
Vercel's CDN from frontend/dist, so this function only ever handles the API.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import app  # noqa: E402,F401
