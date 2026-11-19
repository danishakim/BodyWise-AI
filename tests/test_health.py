from bodywise.health import Profile, assess, bmi, bmi_category, bmr_mifflin, rebalance_for_event


def make(**kw):
    base = dict(sex="male", age=20, height_cm=170, weight_kg=70, activity="light", goal="maintain")
    base.update(kw)
    return Profile(**base)


def test_bmi_and_asian_cutoffs():
    assert bmi(70, 170) == 24.2
    assert bmi_category(24.2)[0] == "overweight"  # Asian cut-off: 23 (WHO would say normal)
    assert bmi_category(22.9)[0] == "normal"
    assert bmi_category(18.4)[0] == "underweight"
    assert bmi_category(27.5)[0] == "obese"


def test_mifflin_st_jeor():
    # 10*70 + 6.25*170 - 5*20 + 5 = 1667.5
    assert bmr_mifflin(make()) == 1667.5
    assert bmr_mifflin(make(sex="female")) == 1667.5 - 166


def test_lose_goal_creates_deficit_and_eta():
    m = assess(make(goal="lose", target_kg=65))
    assert m["daily_kcal"] < m["tdee"]
    assert m["weekly_change_kg"] < 0
    assert m["eta_weeks"] and m["eta_date"]


def test_underweight_cannot_get_loss_plan():
    m = assess(make(weight_kg=50, goal="lose"))  # BMI 17.3
    assert m["goal"] == "gain"
    assert m["warnings"]


def test_unhealthy_target_is_clamped():
    m = assess(make(goal="lose", target_kg=45))
    assert m["target_kg"] == m["healthy_range_kg"][0]


def test_calorie_floor():
    m = assess(Profile(sex="female", age=60, height_cm=148, weight_kg=50, activity="sedentary", goal="lose"))
    assert m["daily_kcal"] >= 1200


def test_minor_warning():
    assert any("under 18" in w for w in assess(make(age=15))["warnings"])


def test_rebalance_spreads_and_respects_floor():
    r = rebalance_for_event(2000, "male", 900, 3, 2)
    assert r["trim_per_day"] == 180 and r["absorbed_kcal"] == 900 and r["unabsorbed_kcal"] == 0
    capped = rebalance_for_event(1600, "male", 2000, 2, 0)  # only 100 kcal/day above floor
    assert capped["adjusted_daily_kcal"] >= 1500
    assert capped["unabsorbed_kcal"] > 0
