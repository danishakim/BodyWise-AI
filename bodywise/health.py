"""Deterministic health calculations.

Design decision: all numbers (BMI, BMR, TDEE, calorie targets) are computed with
established formulas here, NOT by the language model. The LLM only writes meal
plans *around* these numbers, which prevents hallucinated calorie targets.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Literal

from pydantic import BaseModel, Field

Sex = Literal["male", "female"]
Goal = Literal["lose", "maintain", "gain"]
Activity = Literal["sedentary", "light", "moderate", "active", "very_active"]

ACTIVITY_FACTORS: dict[str, float] = {
    "sedentary": 1.2,
    "light": 1.375,
    "moderate": 1.55,
    "active": 1.725,
    "very_active": 1.9,
}

# Malaysian Clinical Practice Guidelines (Asian BMI cut-offs), which flag health
# risk at a lower BMI than the WHO international cut-offs.
BMI_BANDS = [
    (18.5, "underweight", "Underweight"),
    (23.0, "normal", "Healthy"),
    (27.5, "overweight", "Overweight"),
    (float("inf"), "obese", "Obese"),
]
HEALTHY_BMI_MIN = 18.5
HEALTHY_BMI_MAX = 22.9

CALORIE_FLOOR = {"female": 1200, "male": 1500}
DEFICIT_KCAL = 500   # ~0.5 kg/week loss
SURPLUS_KCAL = 350   # ~0.3 kg/week lean gain
KCAL_PER_KG = 7700


class Profile(BaseModel):
    name: str = Field(default="", max_length=40)
    sex: Sex
    age: int = Field(ge=13, le=100)
    height_cm: float = Field(ge=120, le=230)
    weight_kg: float = Field(ge=30, le=300)
    activity: Activity = "light"
    goal: Goal = "maintain"
    target_kg: float | None = Field(default=None, ge=30, le=300)


def bmi(weight_kg: float, height_cm: float) -> float:
    m = height_cm / 100
    return round(weight_kg / (m * m), 1)


def bmi_category(value: float) -> tuple[str, str]:
    for upper, key, label in BMI_BANDS:
        if value < upper:
            return key, label
    return "obese", "Obese"  # unreachable, keeps type-checkers happy


def bmr_mifflin(p: Profile) -> float:
    """Mifflin-St Jeor equation (most accurate common BMR estimate)."""
    base = 10 * p.weight_kg + 6.25 * p.height_cm - 5 * p.age
    return base + (5 if p.sex == "male" else -161)


def healthy_weight_range(height_cm: float) -> tuple[float, float]:
    m = height_cm / 100
    return round(HEALTHY_BMI_MIN * m * m, 1), round(HEALTHY_BMI_MAX * m * m, 1)


def assess(p: Profile) -> dict:
    """Return all metrics plus safety warnings for a profile."""
    warnings: list[str] = []
    goal = p.goal
    value = bmi(p.weight_kg, p.height_cm)
    cat_key, cat_label = bmi_category(value)
    lo, hi = healthy_weight_range(p.height_cm)

    # --- Safety guardrails -------------------------------------------------
    if goal == "lose" and value < HEALTHY_BMI_MIN:
        goal = "gain"
        warnings.append(
            "Your BMI is already below the healthy range, so a weight-loss plan "
            "isn't safe. We switched you to a healthy gain plan. Please talk to a doctor."
        )
    target = p.target_kg
    if target is not None and bmi(target, p.height_cm) < HEALTHY_BMI_MIN:
        target = lo
        warnings.append(
            f"That target is below a healthy weight for your height. "
            f"We set it to {lo} kg, the lowest healthy weight."
        )
    if target is not None:
        if goal == "lose" and target >= p.weight_kg:
            target = None
        if goal == "gain" and target <= p.weight_kg:
            target = None
    if p.age < 18:
        warnings.append(
            "You're under 18 and still growing. Use this for healthy-eating ideas "
            "only, and check calorie targets with a doctor or dietitian."
        )

    bmr = bmr_mifflin(p)
    tdee = bmr * ACTIVITY_FACTORS[p.activity]
    if goal == "lose":
        raw_target = tdee - DEFICIT_KCAL
    elif goal == "gain":
        raw_target = tdee + SURPLUS_KCAL
    else:
        raw_target = tdee
    floor = CALORIE_FLOOR[p.sex]
    daily = max(raw_target, floor)
    if daily > raw_target:
        warnings.append(
            f"Your daily target was raised to the safe minimum of {floor} kcal."
        )
    daily = int(round(daily / 10) * 10)

    weekly_kg = round((daily - tdee) * 7 / KCAL_PER_KG, 2)

    eta_weeks = None
    eta_date = None
    if target is not None and weekly_kg != 0:
        weeks = (target - p.weight_kg) / weekly_kg
        if weeks > 0:
            eta_weeks = round(weeks, 1)
            eta_date = (date.today() + timedelta(weeks=weeks)).isoformat()

    return {
        "bmi": value,
        "bmi_category": cat_key,
        "bmi_label": cat_label,
        "healthy_range_kg": [lo, hi],
        "bmr": int(round(bmr)),
        "tdee": int(round(tdee)),
        "daily_kcal": daily,
        "goal": goal,
        "target_kg": target,
        "weekly_change_kg": weekly_kg,
        "eta_weeks": eta_weeks,
        "eta_date": eta_date,
        "macros": macros(daily, p.weight_kg, goal),
        "warnings": warnings,
    }


def macros(daily_kcal: int, weight_kg: float, goal: str) -> dict:
    """Protein-first split: 1.6 g/kg when changing weight, 1.2 g/kg otherwise."""
    protein_g = round(weight_kg * (1.2 if goal == "maintain" else 1.6))
    protein_g = min(protein_g, round(daily_kcal * 0.35 / 4))
    fat_g = round(daily_kcal * 0.27 / 9)
    carbs_g = max(0, round((daily_kcal - protein_g * 4 - fat_g * 9) / 4))
    return {"protein_g": protein_g, "carbs_g": carbs_g, "fat_g": fat_g}


# --- Exclusive: Kenduri (feast) rebalancer ---------------------------------

MAX_DAILY_TRIM = 300  # never cut more than this from a normal day


def rebalance_for_event(
    daily_kcal: int, sex: str, event_extra_kcal: int, days_before: int, days_after: int
) -> dict:
    """Spread a feast's extra calories across the surrounding days safely.

    Each normal day is trimmed by at most MAX_DAILY_TRIM kcal and never below the
    safe calorie floor. Whatever can't be absorbed is reported honestly.
    """
    floor = CALORIE_FLOOR.get(sex, 1500)
    spread_days = max(0, days_before) + max(0, days_after)
    per_day_cap = max(0, min(MAX_DAILY_TRIM, daily_kcal - floor))
    if spread_days == 0 or per_day_cap == 0:
        trim = 0
    else:
        trim = min(per_day_cap, -(-event_extra_kcal // spread_days))  # ceil div
    trim = int(round(trim / 10) * 10)
    absorbed = min(event_extra_kcal, trim * spread_days)
    return {
        "trim_per_day": trim,
        "adjusted_daily_kcal": daily_kcal - trim,
        "spread_days": spread_days,
        "absorbed_kcal": absorbed,
        "unabsorbed_kcal": max(0, event_extra_kcal - absorbed),
        "floor_kcal": floor,
    }
