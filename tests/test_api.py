import io

import pytest

PROFILE = dict(name="Aina", sex="female", age=21, height_cm=158, weight_kg=62, activity="light", goal="lose", target_kg=55)


@pytest.fixture()
def client(monkeypatch):
    from fastapi.testclient import TestClient

    from app import create_app  # importing app loads .env, so remove the key afterwards

    monkeypatch.delenv("GEMINI_API_KEY", raising=False)  # force demo mode: tests never call the paid API
    monkeypatch.delenv("TM_MODEL_URL", raising=False)
    return TestClient(create_app())


SAME_SITE = {"X-BodyWise": "1"}


def test_status_demo_mode(client):
    assert client.get("/api/status").json()["ai_enabled"] is False


def test_index_served_with_security_headers(client):
    r = client.get("/")
    assert r.status_code == 200
    assert "Content-Security-Policy" in r.headers


def test_assess_validates_input(client):
    r = client.post("/api/assess", json={**PROFILE, "age": 5})
    assert r.status_code == 400 and "age" in r.json()["error"]


@pytest.mark.parametrize("puasa,slots", [(False, 4), (True, 3)])
def test_demo_plan(client, puasa, slots):
    r = client.post("/api/plan", json={"profile": PROFILE, "prefs": {"puasa": puasa, "budget_rm": 30}})
    data = r.json()
    assert r.status_code == 200
    plan = data["plan"]
    assert plan["source"] == "demo" and len(plan["days"]) == 7
    assert all(len(d["meals"]) == slots for d in plan["days"])
    target = data["metrics"]["daily_kcal"]
    assert all(abs(d["total_kcal"] - target) <= target * 0.25 for d in plan["days"])


def test_vegetarian_plan_has_no_meat(client):
    plan = client.post("/api/plan", json={"profile": PROFILE, "prefs": {"vegetarian": True}}).json()["plan"]
    names = " ".join(m["name"].lower() for d in plan["days"] for m in d["meals"])
    for meat in ("ayam", "chicken", "ikan", "daging", "udang", "satay"):
        assert meat not in names


def test_smart_swap(client):
    swaps = client.post("/api/swap", json={"slot": "Breakfast", "kcal": 400, "name": "Nasi lemak"}).json()["swaps"]
    assert swaps and all(s["kcal"] < 400 for s in swaps)


def test_rebalance(client):
    r = client.post("/api/rebalance", json={"profile": PROFILE, "extra_kcal": 900, "days_before": 3, "days_after": 2})
    assert r.status_code == 200 and r.json()["trim_per_day"] > 0


def test_coach_demo(client):
    r = client.post("/api/coach", json={"profile": PROFILE, "messages": [{"role": "user", "text": "Can I eat nasi lemak?"}]})
    assert r.json()["source"] == "demo" and "kcal" in r.json()["reply"]


@pytest.mark.parametrize("path", ["/api/food/recognize", "/api/label/scan", "/api/menu/scan"])
def test_no_photo_upload_endpoints(client, path):
    # Food photos are recognised on-device by Teachable Machine; label and menu scanning were removed.
    jpeg = b"\xff\xd8\xff\xe0" + b"0" * 100
    r = client.post(path, files={"image": ("x.jpg", io.BytesIO(jpeg))}, headers=SAME_SITE)
    assert r.status_code in (404, 405)


def test_foods_endpoint_lists_model_classes_and_lookalikes(client):
    r = client.get("/api/foods").json()
    assert "mineral_water" in r["tm_classes"] and "latte" in r["lookalikes"]["teh_tarik"]


def test_predict_endpoint(client):
    weights = [{"date": f"2026-01-{d:02d}", "kg": 70 - d * 0.05} for d in range(1, 30, 7)]
    r = client.post("/api/predict", json={"weights": weights, "target_kg": 65, "goal": "lose"}).json()
    assert r["ok"] and r["eta_date"]
