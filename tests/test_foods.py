from bodywise import ai
from bodywise.foods import FOOD_BY_ID, FOODS, LOOKALIKES, TM_CLASSES, smart_swaps

PLAN_SLOTS = {"breakfast", "lunch", "dinner", "snack"}


def test_every_model_class_is_in_the_food_list():
    assert len(TM_CLASSES) == len(set(TM_CLASSES))
    assert all(c in FOOD_BY_ID for c in TM_CLASSES)


def test_lookalikes_point_at_real_foods():
    assert set(LOOKALIKES) <= set(TM_CLASSES)
    for cls, ids in LOOKALIKES.items():
        assert ids and cls not in ids and len(ids) == len(set(ids))
        assert all(i in FOOD_BY_ID for i in ids), cls


def test_food_ids_are_unique():
    assert len(FOOD_BY_ID) == len(FOODS)


def test_photo_only_foods_stay_out_of_meal_plans():
    photo_only = {f["name"] for f in FOODS if not PLAN_SLOTS & set(f["slots"])}
    assert "Café latte" in photo_only and "Char kuey teow" in photo_only
    metrics = {"daily_kcal": 1800}
    for puasa in (False, True):
        plan = ai.demo_plan(metrics, ai.Preferences(puasa=puasa))
        names = {m["name"].split(" ×")[0] for d in plan["days"] for m in d["meals"]}
        assert not names & photo_only
    assert not {s["name"] for s in smart_swaps("lunch", 900)} & photo_only
