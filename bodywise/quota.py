"""AI request limits: per visitor (per minute + per day) and a global daily cap.

On Vercel, FastAPI runs as serverless functions that share no memory, so counters live in
Supabase (`public.bw_take_quota`, see supabase/schema.sql). Locally, in tests, or if Supabase
is unreachable, an in-memory counter is used instead, so the app never breaks.
"""
from __future__ import annotations

import hashlib
import logging
import os
import threading
import time
from collections import defaultdict, deque
from datetime import date

import httpx

log = logging.getLogger("bodywise.quota")

MSG_MINUTE = "Too many requests. Please wait a minute."
MSG_DAY = "You've reached today's AI limit. It resets tomorrow; the app still works without AI."


class MemoryQuota:
    """Exact with ONE process (local dev, tests). Not shared between serverless instances."""

    def __init__(self):
        self.minute: dict[str, deque] = defaultdict(deque)
        self.daily: dict[str, int] = defaultdict(int)
        self.day = date.today()
        self.lock = threading.Lock()

    def take(self, key: str, per_minute: int, per_day: int) -> str | None:
        now = time.monotonic()
        with self.lock:
            if date.today() != self.day:                       # new day: reset allowances
                self.day, self.daily = date.today(), defaultdict(int)
            if len(self.minute) > 50_000:                       # bound memory against key spraying
                self.minute = defaultdict(deque, {k: q for k, q in self.minute.items() if q and now - q[-1] < 60})
            q = self.minute[key]
            while q and now - q[0] > 60:
                q.popleft()
            if len(q) >= per_minute:
                return "minute"
            if self.daily[key] >= per_day:
                return "day"
            q.append(now)
            self.daily[key] += 1
            return None


def _supabase() -> tuple[str, str] | None:
    url = (os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL") or "").strip().rstrip("/")
    key = (os.getenv("SUPABASE_SECRET_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    return (url, key) if url.startswith("https://") and key else None


def supabase_enabled() -> bool:
    return _supabase() is not None


def _rpc(key: str, per_minute: int, per_day: int) -> str | None:
    url, secret = _supabase()
    headers = {"apikey": secret, "Content-Type": "application/json"}
    if secret.startswith("eyJ"):                                # legacy service_role JWT also needs Bearer
        headers["Authorization"] = f"Bearer {secret}"
    r = httpx.post(f"{url}/rest/v1/rpc/bw_take_quota", headers=headers, timeout=4,
                   json={"p_key": key, "p_per_min": per_minute, "p_per_day": per_day})
    r.raise_for_status()
    return r.json()                                             # 'minute' | 'day' | None


class Quota:
    """Supabase-backed when SUPABASE_URL + SUPABASE_SECRET_KEY are set, else in memory."""

    def __init__(self):
        self.memory = MemoryQuota()

    def take(self, key: str, per_minute: int, per_day: int) -> str | None:
        if supabase_enabled():
            try:
                return _rpc(key, per_minute, per_day)
            except Exception as exc:  # noqa: BLE001 - never let the limiter take the app down
                log.warning("Supabase quota unavailable (%s); using in-memory limits", str(exc)[:80])
        return self.memory.take(key, per_minute, per_day)

    def allow(self, client: str, per_minute: int, per_day: int) -> str | None:
        """Per-visitor check. Returns a user-facing message when blocked, else None."""
        hit = self.take(visitor_key(client), per_minute, per_day)
        return {"minute": MSG_MINUTE, "day": MSG_DAY}.get(hit or "")


def visitor_key(client: str) -> str:
    """Hash IPs so the quota table never stores personal data."""
    salt = os.getenv("QUOTA_SALT", "bodywise")
    return "ip:" + hashlib.sha256(f"{salt}:{client}".encode()).hexdigest()[:32]


quota = Quota()
