import io

import pytest
from pydantic import ValidationError

from bodywise import ai

PROFILE = dict(name="Aina", sex="female", age=21, height_cm=158, weight_kg=62, activity="light", goal="lose", target_kg=55)
PLAN = {"profile": PROFILE, "prefs": {"budget_rm": 30}}


def make_client(monkeypatch, **env):
    from fastapi.testclient import TestClient

    from app import create_app

    monkeypatch.delenv("GEMINI_API_KEY", raising=False)   # demo mode: never call the paid API in tests
    for k, v in env.items():
        monkeypatch.setenv(k, str(v))
    return TestClient(create_app())


def test_per_minute_quota(monkeypatch):
    c = make_client(monkeypatch, AI_RATE_LIMIT_PER_MIN=2)
    assert [c.post("/api/plan", json=PLAN).status_code for _ in range(3)] == [200, 200, 429]


def test_daily_quota_per_ip(monkeypatch):
    c = make_client(monkeypatch, AI_RATE_LIMIT_PER_MIN=100, AI_DAILY_PER_IP=2)
    codes = [c.post("/api/coach", json={"profile": PROFILE, "messages": [{"role": "user", "text": "hi"}]}).status_code for _ in range(3)]
    assert codes == [200, 200, 429]


def test_quota_uses_real_client_ip_behind_proxy(monkeypatch):
    c = make_client(monkeypatch, AI_RATE_LIMIT_PER_MIN=1, TRUST_PROXY=1)
    a = {"X-Forwarded-For": "1.1.1.1"}
    b = {"X-Forwarded-For": "2.2.2.2"}
    assert c.post("/api/plan", json=PLAN, headers=a).status_code == 200
    assert c.post("/api/plan", json=PLAN, headers=a).status_code == 429   # same person throttled
    assert c.post("/api/plan", json=PLAN, headers=b).status_code == 200   # a different person is not


def test_cheap_routes_have_no_quota(monkeypatch):
    c = make_client(monkeypatch, AI_RATE_LIMIT_PER_MIN=1)
    assert all(c.post("/api/assess", json=PROFILE).status_code == 200 for _ in range(5))


def test_uploads_need_same_site_header(monkeypatch):
    c = make_client(monkeypatch)
    jpeg = b"\xff\xd8\xff\xe0" + b"0" * 100
    r = c.post("/api/label/scan", files={"image": ("x.jpg", io.BytesIO(jpeg))})
    assert r.status_code == 403


def test_security_headers(monkeypatch):
    c = make_client(monkeypatch)
    h = c.get("/").headers
    csp = h["Content-Security-Policy"]
    assert "frame-ancestors 'none'" in csp and "script-src 'self';" in csp
    assert h["Cross-Origin-Opener-Policy"] == "same-origin"
    assert "Strict-Transport-Security" not in h                          # only sent over https
    assert c.get("https://testserver/").headers["Strict-Transport-Security"].startswith("max-age=")


def test_internal_errors_are_not_leaked(monkeypatch):
    c = make_client(monkeypatch)
    r = c.post("/api/menu/scan", files={"image": ("m.jpg", io.BytesIO(b"\xff\xd8\xff" + b"0" * 50))}, data={"remaining_kcal": "abc"}, headers={"X-BodyWise": "1"})
    assert r.status_code == 400 and r.json()["error"] == "Invalid remaining calories."


def test_image_sniffing_is_strict():
    from app import sniff_image

    assert sniff_image(b"RIFF\x00\x00\x00\x00WEBPVP8 ") == "image/webp"
    assert sniff_image(b"RIFF\x00\x00\x00\x00WAVEfmt ") is None      # WAV is not WebP
    assert sniff_image(b"\x89PNG\r\n\x1a\n....") == "image/png"
    assert sniff_image(b"GIF89a") is None


def test_ai_output_is_bounded():
    with pytest.raises(ValidationError):
        ai.MenuPick(dish="x", est_kcal=99999, verdict="best", reason="", tweak="")
    with pytest.raises(ValidationError):
        ai.MealOut(slot="Lunch", name="x", description="", kcal=9000, protein_g=10, cost_rm=5)


def test_daily_cap_trips(monkeypatch):
    monkeypatch.setenv("AI_DAILY_CAP", "2")
    cap = ai.DailyCap()
    assert [cap.take() for _ in range(3)] == [True, True, False]


def test_supabase_quota_used_when_configured(monkeypatch):
    from bodywise import quota

    calls = []
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "sb_secret_test")
    monkeypatch.setattr(quota, "_rpc", lambda key, m, d: calls.append(key) or ("day" if len(calls) > 1 else None))
    q = quota.Quota()
    assert q.allow("1.2.3.4", 10, 50) is None
    assert q.allow("1.2.3.4", 10, 50) == quota.MSG_DAY
    assert calls[0].startswith("ip:") and "1.2.3.4" not in calls[0]          # IPs are hashed, never stored raw


def test_supabase_outage_falls_back_to_memory(monkeypatch):
    from bodywise import quota

    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "sb_secret_test")

    def down(*_):
        raise ConnectionError("supabase down")

    monkeypatch.setattr(quota, "_rpc", down)
    q = quota.Quota()
    assert [q.allow("5.5.5.5", 2, 50) for _ in range(3)] == [None, None, quota.MSG_MINUTE]


def test_vercel_uses_platform_client_ip(monkeypatch):
    c = make_client(monkeypatch, AI_RATE_LIMIT_PER_MIN=1, VERCEL=1)
    assert c.post("/api/plan", json=PLAN, headers={"x-real-ip": "9.9.9.9"}).status_code == 200
    assert c.post("/api/plan", json=PLAN, headers={"x-real-ip": "9.9.9.9"}).status_code == 429
    assert c.post("/api/plan", json=PLAN, headers={"x-real-ip": "8.8.8.8"}).status_code == 200
