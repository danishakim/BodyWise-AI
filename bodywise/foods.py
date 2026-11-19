"""Local Malaysian food database.

Calorie values are approximate per typical hawker serving, compiled for this
prototype. Verify against the Malaysian Food Composition Database (MyFCD)
before any real-world use.

`id` values double as Teachable Machine class names: train your TM model with
classes named exactly like these ids (e.g. "nasi_lemak").
"""
from __future__ import annotations

FOODS: list[dict] = [
    # id, name, kcal, protein g, cost RM, slots, vegetarian
    {"id": "nasi_lemak", "name": "Nasi lemak (egg, sambal, ikan bilis)", "kcal": 400, "protein": 13, "rm": 4.0, "slots": ["breakfast", "lunch"], "veg": False},
    {"id": "roti_canai", "name": "Roti canai with dhal", "kcal": 360, "protein": 9, "rm": 2.5, "slots": ["breakfast"], "veg": True},
    {"id": "thosai", "name": "Thosai with chutney", "kcal": 230, "protein": 6, "rm": 2.5, "slots": ["breakfast"], "veg": True},
    {"id": "roti_telur", "name": "Roti telur", "kcal": 380, "protein": 13, "rm": 3.0, "slots": ["breakfast"], "veg": False},
    {"id": "kaya_toast", "name": "Kaya toast with 2 half-boiled eggs", "kcal": 400, "protein": 15, "rm": 5.0, "slots": ["breakfast"], "veg": False},
    {"id": "oat_banana", "name": "Oats with banana & milk", "kcal": 300, "protein": 11, "rm": 3.0, "slots": ["breakfast"], "veg": True},
    {"id": "wholemeal_eggs", "name": "Wholemeal bread with 2 boiled eggs", "kcal": 320, "protein": 18, "rm": 3.0, "slots": ["breakfast"], "veg": False},
    {"id": "nasi_ayam", "name": "Nasi ayam (chicken rice)", "kcal": 600, "protein": 28, "rm": 8.0, "slots": ["lunch", "dinner"], "veg": False},
    {"id": "nasi_campur", "name": "Nasi campur (rice, chicken, 1 veg)", "kcal": 550, "protein": 26, "rm": 8.0, "slots": ["lunch", "dinner"], "veg": False},
    {"id": "nasi_goreng", "name": "Nasi goreng kampung", "kcal": 600, "protein": 18, "rm": 7.0, "slots": ["lunch", "dinner"], "veg": False},
    {"id": "mee_goreng", "name": "Mee goreng mamak", "kcal": 650, "protein": 17, "rm": 7.0, "slots": ["lunch", "dinner"], "veg": False},
    {"id": "asam_laksa", "name": "Asam laksa", "kcal": 430, "protein": 20, "rm": 8.0, "slots": ["lunch", "dinner"], "veg": False},
    {"id": "curry_laksa", "name": "Curry laksa", "kcal": 590, "protein": 22, "rm": 9.0, "slots": ["lunch", "dinner"], "veg": False},
    {"id": "mee_rebus", "name": "Mee rebus", "kcal": 550, "protein": 18, "rm": 6.0, "slots": ["lunch", "dinner"], "veg": False},
    {"id": "soto_ayam", "name": "Soto ayam", "kcal": 300, "protein": 22, "rm": 6.0, "slots": ["lunch", "dinner"], "veg": False},
    {"id": "bihun_sup", "name": "Bihun sup ayam", "kcal": 350, "protein": 20, "rm": 6.0, "slots": ["lunch", "dinner"], "veg": False},
    {"id": "yong_tau_foo", "name": "Yong tau foo soup (6 pcs)", "kcal": 350, "protein": 22, "rm": 9.0, "slots": ["lunch", "dinner"], "veg": False},
    {"id": "ikan_bakar", "name": "Ikan bakar with rice & ulam", "kcal": 500, "protein": 35, "rm": 12.0, "slots": ["lunch", "dinner"], "veg": False},
    {"id": "ayam_masak_merah", "name": "Ayam masak merah with rice", "kcal": 650, "protein": 30, "rm": 9.0, "slots": ["lunch", "dinner"], "veg": False},
    {"id": "rendang_rice", "name": "Rendang daging with rice", "kcal": 700, "protein": 32, "rm": 12.0, "slots": ["lunch", "dinner"], "veg": False},
    {"id": "chicken_salad", "name": "Grilled chicken salad", "kcal": 350, "protein": 32, "rm": 12.0, "slots": ["lunch", "dinner"], "veg": False},
    {"id": "tofu_brown_rice", "name": "Tofu & veg stir-fry with brown rice", "kcal": 450, "protein": 20, "rm": 7.0, "slots": ["lunch", "dinner"], "veg": True},
    {"id": "banana_leaf_veg", "name": "Banana leaf rice (vegetarian)", "kcal": 650, "protein": 16, "rm": 10.0, "slots": ["lunch", "dinner"], "veg": True},
    {"id": "burger", "name": "Burger (Ramly-style, with egg)", "kcal": 450, "protein": 18, "rm": 6.0, "slots": ["fastfood"], "veg": False},  # recognisable, but never put in plans
    {"id": "satay","name": "Satay ayam (6 sticks + kuah)", "kcal": 350, "protein": 26, "rm": 7.0, "slots": ["dinner", "snack"], "veg": False},
    {"id": "popiah", "name": "Popiah basah (2 rolls)", "kcal": 190, "protein": 6, "rm": 4.0, "slots": ["snack"], "veg": True},
    {"id": "kuih", "name": "Kuih (2 pieces)", "kcal": 200, "protein": 2, "rm": 2.0, "slots": ["snack"], "veg": True},
    {"id": "pisang_goreng", "name": "Pisang goreng (2 pcs)", "kcal": 250, "protein": 2, "rm": 2.0, "slots": ["snack"], "veg": True},
    {"id": "cucur_udang", "name": "Cucur udang (3 pcs)", "kcal": 300, "protein": 7, "rm": 3.0, "slots": ["snack"], "veg": False},
    {"id": "apam_balik", "name": "Apam balik (1 slice)", "kcal": 230, "protein": 5, "rm": 2.0, "slots": ["snack"], "veg": True},
    {"id": "banana", "name": "Banana", "kcal": 105, "protein": 1, "rm": 0.8, "slots": ["snack"], "veg": True},
    {"id": "papaya", "name": "Papaya (1 bowl)", "kcal": 60, "protein": 1, "rm": 2.0, "slots": ["snack"], "veg": True},
    {"id": "yoghurt", "name": "Low-fat yoghurt", "kcal": 120, "protein": 8, "rm": 3.0, "slots": ["snack"], "veg": True},
    {"id": "kacang", "name": "Roasted peanuts (30 g)", "kcal": 170, "protein": 7, "rm": 1.5, "slots": ["snack"], "veg": True},
    {"id": "pb_sandwich", "name": "Peanut butter sandwich", "kcal": 350, "protein": 12, "rm": 2.5, "slots": ["snack", "breakfast"], "veg": True},
    {"id": "teh_tarik", "name": "Teh tarik", "kcal": 170, "protein": 4, "rm": 2.0, "slots": ["drink"], "veg": True},
    {"id": "milo_ais", "name": "Milo ais", "kcal": 200, "protein": 5, "rm": 3.0, "slots": ["drink"], "veg": True},
    {"id": "teh_o_kosong", "name": "Teh O kosong", "kcal": 5, "protein": 0, "rm": 1.5, "slots": ["drink"], "veg": True},
    {"id": "kurma", "name": "Kurma / dates (3 pcs)", "kcal": 70, "protein": 1, "rm": 1.0, "slots": ["snack"], "veg": True},
]

FOOD_BY_ID = {f["id"]: f for f in FOODS}


def find_food(label: str) -> dict | None:
    """Match a classifier label or free-text name to a database entry."""
    key = label.strip().lower().replace(" ", "_").replace("-", "_")
    if key in FOOD_BY_ID:
        return FOOD_BY_ID[key]
    words = set(label.lower().replace("_", " ").split())
    best, best_score = None, 0
    for f in FOODS:
        overlap = len(words & set(f["name"].lower().replace("(", " ").split()))
        if overlap > best_score:
            best, best_score = f, overlap
    return best if best_score >= 2 or (best_score == 1 and len(words) == 1) else None


# Ramadan (puasa) meal slots map onto the regular database slots.
SLOT_ALIASES = {
    "sahur": ["breakfast", "lunch"],
    "iftar": ["lunch", "dinner"],
    "moreh": ["snack"],
}


def db_slots(slot: str) -> list[str]:
    slot = slot.lower()
    return SLOT_ALIASES.get(slot, [slot])


def smart_swaps(slot: str, kcal: int, vegetarian: bool = False, limit: int = 3,
                exclude_name: str = "") -> list[dict]:
    """Exclusive: lighter local alternatives for the same meal slot.

    Ranks by calories saved plus a protein bonus, so a swap that keeps you full
    beats one that just cuts calories.
    """
    wanted = set(db_slots(slot))
    exclude = exclude_name.strip().lower()
    candidates = [
        f for f in FOODS
        if wanted & set(f["slots"])
        and f["kcal"] < kcal
        and (f["veg"] or not vegetarian)
        and f["name"].lower() != exclude
    ]
    candidates.sort(key=lambda f: (kcal - f["kcal"]) + 6 * f["protein"], reverse=True)
    return [{**f, "saves_kcal": kcal - f["kcal"]} for f in candidates[:limit]]
