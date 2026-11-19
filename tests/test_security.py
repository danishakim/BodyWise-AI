import io

import pytest
from pydantic import ValidationError

from bodywise import ai

PROFILE = dict(name="Aina", sex="female", age=21, height_cm=158, weight_kg=62, activity="light", goal="lose", target_kg=55)
PLAN = {"profile": PROFILE, "prefs": {"budget_rm": 30}}


def make_client(monkeypatch, **env):
    from app import create_app

    monkeypatch.delenv("GEMINI_API_KEY", raising=False)   # demo mode: never call the paid API in tests
    for k, v in env.items():
        monkeypatch.setenv(k, str(v))
    return create_app().test_client()


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
    r = c.post("/api/food/recognize", data={"image": (io.BytesIO(jpeg), "x.jpg")}, content_type="multipart/form-data")
    assert r.status_code == 403


def test_security_headers(monkeypatch):
    c = make_client(monkeypatch)
    h = c.get("/").headers
    csp = h["Content-Security-Policy"]
    assert "frame-ancestors 'none'" in csp and "script-src 'self' https://cdn.jsdelivr.net;" in csp
    assert h["Cross-Origin-Opener-Policy"] == "same-origin"
    assert "Strict-Transport-Security" not in h                          # only sent over https
    assert c.get("/", base_url="https://localhost").headers["Strict-Transport-Security"].startswith("max-age=")


def test_internal_errors_are_not_leaked(monkeypatch):
    c = make_client(monkeypatch)
    r = c.post("/api/menu/scan", data={"image": (io.BytesIO(b"\xff\xd8\xff" + b"0" * 50), "m.jpg"), "remaining_kcal": "abc"},
               content_type="multipart/form-data", headers={"X-BodyWise": "1"})
    assert r.status_code == 400 and r.get_json()["error"] == "Invalid remaining calories."


def test_image_sniffing_is_strict():
    from app import sniff_image

    assert sniff_image(b"RIFF\x00\x00\x00\x00WEBPVP8 ") == "image/webp"
    assert sniff_image(b"RIFF\x00\x00\x00\x00WAVEfmt ") is None      # WAV is not WebP
    assert sniff_image(b"\x89PNG\r\n\x1a\n....") == "image/png"
    assert sniff_image(b"GIF89a") is None


def test_ai_output_is_bounded():
    with pytest.raises(ValidationError):
        ai.FoodGuess(is_food=True, name="x", portion="1", kcal=-50, protein_g=5, confidence="high", note="")
    with pytest.raises(ValidationError):
        ai.MenuPick(dish="x", est_kcal=99999, verdict="best", reason="", tweak="")
    with pytest.raises(ValidationError):
        ai.MealOut(slot="Lunch", name="x", description="", kcal=9000, protein_g=10, cost_rm=5)


def test_daily_cap_trips(monkeypatch):
    monkeypatch.setenv("AI_DAILY_CAP", "2")
    cap = ai.DailyCap()
    assert [cap.take() for _ in range(3)] == [True, True, False]
