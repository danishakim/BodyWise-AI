import io

import pytest
from pydantic import ValidationError

from bodywise.ai import NutritionLabel, check_label

BREAD = dict(is_label=True, product_name="Gardenia Original Classic", serving_desc="2 slices", serving_g=60,
             kcal=159, protein_g=5.5, carbs_g=28.8, fat_g=2.1, sugar_g=2.4, sodium_mg=250,
             kcal_per_100g=265, confidence="high")


def test_consistent_label_has_no_warnings():
    assert check_label(BREAD) == []


def test_kilojoules_mistaken_for_kcal_is_flagged():
    w = check_label({**BREAD, "kcal": 665, "kcal_per_100g": None})   # 665 kJ read as kcal
    assert any("kilojoules" in x for x in w)


def test_macros_mismatch_is_flagged():
    w = check_label({**BREAD, "kcal": 300, "kcal_per_100g": None})
    assert any("don't match" in x for x in w)


def test_per_100g_mismatch_is_flagged():
    w = check_label({**BREAD, "kcal_per_100g": 400})                 # 400 × 0.6 = 240, not 159
    assert any("per-100 g" in x for x in w)


def test_low_confidence_is_flagged():
    assert check_label({**BREAD, "confidence": "low"})


def test_label_values_are_bounded():
    with pytest.raises(ValidationError):
        NutritionLabel(**{**BREAD, "kcal": -10})
    with pytest.raises(ValidationError):
        NutritionLabel(**{**BREAD, "fat_g": 5000})


@pytest.fixture()
def client(monkeypatch):
    from fastapi.testclient import TestClient

    from app import create_app

    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    return TestClient(create_app())


def test_label_endpoint_demo_mode(client):
    png = b"\x89PNG\r\n\x1a\n" + b"0" * 64
    r = client.post("/api/label/scan", files={"image": ("l.png", io.BytesIO(png))}, headers={"X-BodyWise": "1"})
    assert r.status_code == 200 and r.json()["ok"] is False


def test_label_endpoint_blocks_cross_site(client):
    png = b"\x89PNG\r\n\x1a\n" + b"0" * 64
    r = client.post("/api/label/scan", files={"image": ("l.png", io.BytesIO(png))})
    assert r.status_code == 403
