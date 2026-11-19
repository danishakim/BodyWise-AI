from datetime import date, timedelta

from bodywise.predict import PredictRequest, predict

START = date(2026, 1, 1)


def series(kgs, step=7):
    return [{"date": START + timedelta(days=i * step), "kg": kg} for i, kg in enumerate(kgs)]


def test_needs_two_points():
    assert predict(PredictRequest(weights=series([70]))).get("ok") is False


def test_steady_loss_predicts_goal_date():
    r = predict(PredictRequest(weights=series([80, 79.5, 79, 78.5, 78, 77.5]), target_kg=75, goal="lose"))
    assert r["ok"] and r["slope_kg_per_week"] == -0.5
    assert r["r2"] > 0.99 and r["confidence"] == "high"
    # 77.5 at day 35, needs 2.5 kg more at 0.5/week → 5 weeks later
    assert r["eta_date"] == (START + timedelta(days=70)).isoformat()


def test_wrong_direction_has_no_eta_and_alerts():
    r = predict(PredictRequest(weights=series([70, 70.4, 70.9, 71.3]), target_kg=65, goal="lose"))
    assert r["eta_date"] is None
    assert any("going up" in a for a in r["alerts"])


def test_plateau_detected():
    r = predict(PredictRequest(weights=series([80, 79, 78, 77.1, 77.0, 77.1, 77.0], step=7), target_kg=70, goal="lose"))
    assert r["plateau"] is True


def test_duplicate_dates_are_deduped():
    w = series([80, 79]) + [{"date": START, "kg": 81}]
    assert predict(PredictRequest(weights=w))["points"] == 2
