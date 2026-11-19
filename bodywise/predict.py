"""Progress prediction with linear regression (scikit-learn).

Fits weight = a + b * day on the user's weigh-ins, then extrapolates to find
when the trend line crosses the target weight. Also detects plateaus.
"""
from __future__ import annotations

from datetime import date, timedelta

import numpy as np
from pydantic import BaseModel, Field
from sklearn.linear_model import LinearRegression


class WeighIn(BaseModel):
    date: date
    kg: float = Field(ge=30, le=300)


class PredictRequest(BaseModel):
    weights: list[WeighIn] = Field(max_length=1000)
    target_kg: float | None = Field(default=None, ge=30, le=300)
    goal: str = "maintain"


PLATEAU_WINDOW_DAYS = 21
PLATEAU_KG_PER_WEEK = 0.1
FAST_LOSS_KG_PER_WEEK = 1.0
MAX_PROJECTION_DAYS = 730


def _fit(days: np.ndarray, kgs: np.ndarray) -> tuple[LinearRegression, float]:
    model = LinearRegression().fit(days.reshape(-1, 1), kgs)
    r2 = float(model.score(days.reshape(-1, 1), kgs)) if len(days) > 2 else 0.0
    return model, r2


def predict(req: PredictRequest) -> dict:
    pts = sorted({w.date: w.kg for w in req.weights}.items())  # dedupe by date
    if len(pts) < 2:
        return {"ok": False, "reason": "Log at least 2 weigh-ins on different days to see a prediction."}

    start = pts[0][0]
    days = np.array([(d - start).days for d, _ in pts], dtype=float)
    kgs = np.array([kg for _, kg in pts], dtype=float)
    model, r2 = _fit(days, kgs)
    slope_day = float(model.coef_[0])
    slope_week = round(slope_day * 7, 2)

    last_day = days[-1]
    trend = [
        {"date": (start + timedelta(days=int(d))).isoformat(), "kg": round(float(model.predict([[d]])[0]), 2)}
        for d in (days[0], last_day)
    ]

    eta = None
    projection = []
    target = req.target_kg
    if target is not None and abs(slope_day) > 1e-4:
        cross_day = (target - float(model.intercept_)) / slope_day
        if last_day < cross_day <= last_day + MAX_PROJECTION_DAYS:
            eta = (start + timedelta(days=int(round(cross_day)))).isoformat()
            projection = [
                trend[-1],
                {"date": eta, "kg": round(target, 2)},
            ]

    # Plateau detection on the most recent window only.
    recent = days >= last_day - PLATEAU_WINDOW_DAYS
    plateau = False
    if req.goal in ("lose", "gain") and recent.sum() >= 3 and last_day >= 14:
        recent_model, _ = _fit(days[recent], kgs[recent])
        plateau = abs(float(recent_model.coef_[0]) * 7) < PLATEAU_KG_PER_WEEK

    confidence = "low"
    if len(pts) >= 6 and r2 >= 0.7:
        confidence = "high"
    elif len(pts) >= 4 and r2 >= 0.4:
        confidence = "medium"

    alerts: list[str] = []
    if slope_week <= -FAST_LOSS_KG_PER_WEEK:
        alerts.append("You're losing more than 1 kg a week. That's faster than recommended, so eat a bit more to protect muscle.")
    if req.goal == "lose" and slope_week > 0.1:
        alerts.append("Your trend is going up while your goal is to lose. Check portion sizes and drinks like teh tarik.")
    if req.goal == "gain" and slope_week < -0.1:
        alerts.append("Your trend is going down while your goal is to gain. Add a calorie-dense snack like a peanut butter sandwich.")
    if plateau:
        alerts.append("Plateau detected: your weight has barely moved for 3 weeks. That's normal. Try a 2-week refresh: re-weigh portions, add 2,000 steps a day, and get 7+ hours of sleep.")

    return {
        "ok": True,
        "slope_kg_per_week": slope_week,
        "r2": round(r2, 2),
        "confidence": confidence,
        "points": len(pts),
        "trend": trend,
        "projection": projection,
        "eta_date": eta,
        "plateau": plateau,
        "alerts": alerts,
    }
