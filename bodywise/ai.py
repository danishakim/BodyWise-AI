"""Generative AI layer (Google Gemini) with graceful offline fallbacks.

Every AI feature has a deterministic "demo mode" fallback so the app keeps
working without an API key, offline, or when the API fails or is rate-limited.
Responses always report their `source` ("gemini" or "demo") so the UI can be
honest about what produced them.
"""
from __future__ import annotations

import logging
import os
import threading
from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from .foods import FOODS, db_slots

log = logging.getLogger(__name__)

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
NORMAL_SLOTS = [("Breakfast", 0.25), ("Lunch", 0.35), ("Snack", 0.10), ("Dinner", 0.30)]
PUASA_SLOTS = [("Sahur", 0.35), ("Iftar", 0.50), ("Moreh", 0.15)]
DAY_TOLERANCE = 0.15  # a day within ±15 % of target counts as on-target


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------
class Preferences(BaseModel):
    vegetarian: bool = False
    halal: bool = True
    budget_rm: float = Field(default=30, ge=5, le=300)
    puasa: bool = False
    dislikes: str = Field(default="", max_length=120)


# AI output is untrusted: every number is bounded, so a prompt-injected or
# confused reply can't put negative or absurd calories into a user's log.
class MealOut(BaseModel):
    slot: str = Field(max_length=20)
    name: str = Field(max_length=120)
    description: str = Field(max_length=300)
    kcal: int = Field(ge=0, le=2500)
    protein_g: int = Field(ge=0, le=200)
    cost_rm: float = Field(ge=0, le=200)


class DayOut(BaseModel):
    day: str
    meals: list[MealOut]


class PlanOut(BaseModel):
    summary: str
    days: list[DayOut]
    tips: list[str]


class MenuPick(BaseModel):
    dish: str = Field(max_length=120)
    est_kcal: int = Field(ge=0, le=3000)
    verdict: Literal["best", "ok", "limit"]
    reason: str = Field(max_length=300)
    tweak: str = Field(max_length=200)


class MenuScan(BaseModel):
    is_menu: bool
    summary: str
    picks: list[MenuPick]


class NutritionLabel(BaseModel):
    """Values read from a packaged food's nutrition panel, always PER SERVING."""
    is_label: bool
    product_name: str = Field(max_length=120)
    serving_desc: str = Field(max_length=60)
    serving_g: float | None = Field(default=None, ge=0, le=2000)
    kcal: float = Field(ge=0, le=2500)
    protein_g: float = Field(ge=0, le=200)
    carbs_g: float = Field(ge=0, le=400)
    fat_g: float = Field(ge=0, le=200)
    sugar_g: float | None = Field(default=None, ge=0, le=400)
    sodium_mg: float | None = Field(default=None, ge=0, le=20000)
    kcal_per_100g: float | None = Field(default=None, ge=0, le=1000)
    confidence: Literal["low", "medium", "high"]


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    text: str = Field(max_length=1500)


# ---------------------------------------------------------------------------
# Gemini client
# ---------------------------------------------------------------------------
_client = None


DEFAULT_MODEL = "gemini-3.8-flash"
# Tried in order when the main model is retired (404), overloaded (503/504) or rate-limited (429).
# "Lite" models are usually far less congested during peak demand.
FALLBACK_MODELS = [
    m.strip() for m in os.getenv("GEMINI_FALLBACK_MODELS", "gemini-3.5-flash-lite,gemini-flash-lite-latest").split(",")
    if m.strip()
]
RETRYABLE = ("NOT_FOUND", "UNAVAILABLE", "RESOURCE_EXHAUSTED", "DEADLINE_EXCEEDED",
             "503", "504", "429", "timed out", "Timeout")
REQUEST_TIMEOUT_MS = 50_000


def model_name() -> str:
    return os.getenv("GEMINI_MODEL", DEFAULT_MODEL)


class DailyCap:
    """Global circuit breaker on paid AI calls. When exceeded, every feature falls
    back to demo mode until tomorrow, so a bot can never run up an unbounded bill."""

    def __init__(self):
        self.day, self.count, self.lock = None, 0, threading.Lock()

    def take(self) -> bool:
        limit = int(os.getenv("AI_DAILY_CAP", "500"))
        with self.lock:
            today = date.today()
            if today != self.day:
                self.day, self.count = today, 0
            if self.count >= limit:
                return False
            self.count += 1
            return True


daily_cap = DailyCap()


def _generate(contents, config):
    """Call the configured model, falling back to other models on retryable errors."""
    from google.genai import types

    if not daily_cap.take():
        raise RuntimeError("Daily AI cap reached")

    # Low "thinking" keeps structured answers fast; these tasks don't need deep reasoning.
    fast = config.model_copy(update={"thinking_config": types.ThinkingConfig(thinking_level="low")})
    names = list(dict.fromkeys([model_name(), *FALLBACK_MODELS]))
    for i, name in enumerate(names):
        try:
            try:
                return _get_client().models.generate_content(model=name, contents=contents, config=fast)
            except Exception as exc:  # noqa: BLE001
                if "thinking" not in str(exc).lower():
                    raise
                # Model doesn't support thinking_level: retry with its defaults.
                return _get_client().models.generate_content(model=name, contents=contents, config=config)
        except Exception as exc:  # noqa: BLE001
            if i == len(names) - 1 or not any(code in str(exc) for code in RETRYABLE):
                raise
            log.warning("Model %s failed (%s), trying %s", name, str(exc)[:60], names[i + 1])


def is_enabled() -> bool:
    return bool(os.getenv("GEMINI_API_KEY"))


def _get_client():
    global _client
    if _client is None:
        from google import genai  # imported lazily so demo mode needs no SDK

        from google.genai import types

        # Per-request timeout so a stuck model fails over to the next one quickly.
        _client = genai.Client(
            api_key=os.environ["GEMINI_API_KEY"],
            http_options=types.HttpOptions(timeout=REQUEST_TIMEOUT_MS),
        )
    return _client


def _structured(contents, schema: type[BaseModel], system: str, temperature: float = 0.7):
    """Call Gemini and force a JSON reply that matches a Pydantic schema."""
    from google.genai import types

    resp = _generate(
        contents,
        types.GenerateContentConfig(
            system_instruction=system,
            response_mime_type="application/json",
            response_schema=schema,
            temperature=temperature,
        ),
    )
    if resp.parsed is None:
        raise ValueError("Gemini returned no parseable JSON")
    return resp.parsed


SAFETY_RULES = (
    "You are BodyWise, a friendly nutrition assistant for Malaysian students. "
    "You are not a doctor. Never recommend fewer calories than the target given, "
    "crash diets, skipping meals, laxatives or diet pills. If the user mentions "
    "disordered eating, self-harm or a medical condition, respond kindly and "
    "recommend a doctor, dietitian, or the Befrienders KL hotline (03-7627 2929)."
)


# ---------------------------------------------------------------------------
# Feature 1: Diet plan
# ---------------------------------------------------------------------------
def generate_plan(profile: dict, metrics: dict, prefs: Preferences) -> dict:
    if is_enabled():
        try:
            plan = _gemini_plan(profile, metrics, prefs)
            return _finalise_plan(plan.model_dump(), metrics, "gemini")
        except Exception as exc:  # noqa: BLE001 - any API failure falls back
            log.warning("Gemini plan failed, using demo plan: %s", exc)
            result = _finalise_plan(demo_plan(metrics, prefs), metrics, "demo")
            result["notice"] = "The AI service is busy, so this plan comes from our local food database."
            return result
    return _finalise_plan(demo_plan(metrics, prefs), metrics, "demo")


def _gemini_plan(profile: dict, metrics: dict, prefs: Preferences) -> PlanOut:
    slots = PUASA_SLOTS if prefs.puasa else NORMAL_SLOTS
    slot_text = ", ".join(f"{name} (~{round(share * 100)}%)" for name, share in slots)
    diet = []
    if prefs.halal:
        diet.append("halal only")
    if prefs.vegetarian:
        diet.append("vegetarian")
    prompt = f"""
Create a 7-day meal plan (Monday to Sunday).

FIXED NUMBERS (calculated by formula, do not change them):
- Daily calorie target: {metrics['daily_kcal']} kcal (each day's meals must add up to within ±10%)
- Protein target: {metrics['macros']['protein_g']} g/day
- Goal: {metrics['goal']} weight

USER: {profile['sex']}, {profile['age']} years old, activity level: {profile['activity']}.
Diet: {', '.join(diet) or 'no restrictions'}. Dislikes: {prefs.dislikes or 'none'}.
Budget: about RM{prefs.budget_rm:.0f} per day for all meals combined.
Meal slots per day: {slot_text}.
{"RAMADAN MODE: the user is fasting. Sahur must be slow-digesting with high fibre and protein. Iftar starts with 3 dates and water. Moreh is a light snack after terawih." if prefs.puasa else ""}

Rules:
- Use realistic Malaysian food (mamak, kopitiam, Malay, Chinese, Indian, home cooking), with variety across the week.
- Estimate kcal, protein_g and cost_rm per meal realistically for a Malaysian hawker or home portion.
- Description: one short line covering the portion and a healthy tweak (e.g. "kurang manis", "less gravy", "add ulam").
- summary: 1-2 sentences. tips: 4 short practical tips for this user.
"""
    return _structured(prompt, PlanOut, SAFETY_RULES)


def demo_plan(metrics: dict, prefs: Preferences) -> dict:
    """Deterministic plan from the local database, scaled to the calorie target."""
    target = metrics["daily_kcal"]
    slots = PUASA_SLOTS if prefs.puasa else NORMAL_SLOTS
    days = []
    for d, day in enumerate(DAYS):
        meals = []
        for s, (slot, share) in enumerate(slots):
            slot_kcal = target * share
            fits_diet = [
                f for f in FOODS
                if set(db_slots(slot)) & set(f["slots"]) and (f["veg"] or not prefs.vegetarian)
            ]
            pool = [f for f in fits_diet if f["rm"] <= prefs.budget_rm * share * 1.6] or fits_diet
            food = pool[(d * 3 + s * 5) % len(pool)]
            servings = min(2.5, max(0.5, round(slot_kcal / food["kcal"] * 2) / 2))
            label = food["name"] if servings == 1 else f"{food['name']} ×{servings:g}"
            desc = "Serving scaled to fit your calorie target."
            if slot == "Iftar":
                desc = "Break your fast with 3 kurma and water first, then eat slowly."
            elif slot == "Sahur":
                desc = "Slow-release energy. Drink 2 glasses of water."
            meals.append({
                "slot": slot,
                "name": label,
                "description": desc,
                "kcal": round(food["kcal"] * servings),
                "protein_g": round(food["protein"] * servings),
                "cost_rm": round(food["rm"] * servings, 2),
            })
        days.append({"day": day, "meals": meals})
    tips = [
        "Order drinks 'kurang manis' or 'kosong'. One teh tarik is about 170 kcal.",
        "Fill half your plate with sayur or ulam before adding rice.",
        "Ask for 'kuah sikit' (less gravy) on nasi campur.",
        "Drink a glass of water before each meal.",
    ]
    if prefs.puasa:
        tips[3] = "Spread 8 glasses of water between iftar and sahur (the 2-4-2 rule)."
    return {
        "summary": f"A {len(slots)}-meal plan built around your {target} kcal target using familiar Malaysian food.",
        "days": days,
        "tips": tips,
    }


def _finalise_plan(plan: dict, metrics: dict, source: str) -> dict:
    """Verify LLM output: recompute totals ourselves instead of trusting the model."""
    target = metrics["daily_kcal"]
    for day in plan["days"]:
        day["total_kcal"] = sum(m["kcal"] for m in day["meals"])
        day["total_protein_g"] = sum(m["protein_g"] for m in day["meals"])
        day["total_cost_rm"] = round(sum(m["cost_rm"] for m in day["meals"]), 2)
        day["on_target"] = abs(day["total_kcal"] - target) <= target * DAY_TOLERANCE
    plan["source"] = source
    plan["target_kcal"] = target
    return plan


# Food PHOTOS are recognised on the device by the Teachable Machine model (static/js/views/snap.js);
# the server only handles nutrition labels and menu boards.

# ---------------------------------------------------------------------------
# Exclusive: Menu Scanner
# ---------------------------------------------------------------------------
def scan_menu(image: bytes, mime: str, remaining_kcal: int, prefs: Preferences, goal: str) -> dict:
    if not is_enabled():
        return {"ok": False, "source": "demo", "reason": "Menu Scanner needs the Gemini API key (AI vision)."}
    from google.genai import types

    prompt = f"""
This is a photo of a restaurant or hawker menu board. Read the dishes on it.
The user has {remaining_kcal} kcal left today, wants to {goal} weight, budget about RM{prefs.budget_rm:.0f}/day,
{"vegetarian, " if prefs.vegetarian else ""}{"halal only." if prefs.halal else ""}
Return up to 6 picks ranked best first. verdict: "best" (fits well), "ok" (fine with tweak), "limit" (save for special days).
Each reason is one short sentence. tweak is a specific way to order it, in Manglish if natural (e.g. "kurang minyak, telur rebus").
If the image is not a menu, set is_menu=false and leave picks empty.
"""
    try:
        scan: MenuScan = _structured(
            [types.Part.from_bytes(data=image, mime_type=mime), prompt],
            MenuScan, SAFETY_RULES, temperature=0.3,
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("Gemini menu scan failed: %s", exc)
        return {"ok": False, "source": "gemini", "reason": "Couldn't read that menu. Try a sharper, well-lit photo."}
    out = {"ok": scan.is_menu, "source": "gemini", **scan.model_dump()}
    if not scan.is_menu:
        out["reason"] = "That doesn't look like a menu."
    return out


# ---------------------------------------------------------------------------
# Feature: Nutrition label scanner (document understanding)
# ---------------------------------------------------------------------------
LABEL_PROMPT = """
This should be a photo of a packaged food's NUTRITION INFORMATION panel. Malaysian labels are often
bilingual: Maklumat Pemakanan = Nutrition Information, Saiz hidangan = Serving size,
Tenaga = Energy, Karbohidrat = Carbohydrate, Lemak = Fat, Gula = Sugar, Natrium = Sodium,
Hidangan per bekas = Servings per pack.

Extract the values PER SERVING:
- If the panel has a per-serving column, use it.
- If it only has per 100 g / 100 ml, compute per serving from the serving size. If there is no serving size,
  report per 100 g and set serving_desc to "100 g".
- Energy must be in kcal. If only kJ is shown, convert with kcal = kJ / 4.184.
- kcal_per_100g: the per-100 g energy in kcal if shown, else null.
- product_name: from any visible brand/product text, otherwise a short description (e.g. "Wholemeal bread").
- Use null for sugar or sodium if not shown. Never guess numbers that are not on the label.
If the image is not a nutrition label, set is_label=false and use 0 for the numbers.
"""


def check_label(label: dict) -> list[str]:
    """Arithmetic sanity checks on what the AI read. Returns user-facing warnings (empty = looks right)."""
    warnings: list[str] = []
    kcal = label["kcal"]
    from_macros = 4 * label["protein_g"] + 4 * label["carbs_g"] + 9 * label["fat_g"]
    if kcal > 0 and from_macros > 0 and abs(from_macros - kcal) > max(40, 0.25 * kcal):
        if kcal > 3 * from_macros:
            warnings.append("The calories look like kilojoules (kJ). Please check the number or retake the photo.")
        else:
            warnings.append("The calories don't match the protein, carbs and fat on the label. Please check or retake the photo.")
    per100, grams = label.get("kcal_per_100g"), label.get("serving_g")
    if per100 and grams and kcal > 0:
        expected = per100 * grams / 100
        if abs(expected - kcal) > max(25, 0.2 * kcal):
            warnings.append(f"Per-serving energy doesn't match the per-100 g value (expected about {round(expected)} kcal).")
    if label["confidence"] == "low":
        warnings.append("The label was hard to read. Double-check the numbers.")
    return warnings


def read_label(image: bytes, mime: str) -> dict:
    if not is_enabled():
        return {"ok": False, "source": "demo", "reason": "Label scanning needs the Gemini API key (AI vision)."}
    from google.genai import types

    try:
        label: NutritionLabel = _structured(
            [types.Part.from_bytes(data=image, mime_type=mime), LABEL_PROMPT],
            NutritionLabel, SAFETY_RULES, temperature=0.1,
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("Gemini label scan failed: %s", exc)
        return {"ok": False, "source": "gemini", "reason": "Couldn't read that label. Try a flat, well-lit photo of the nutrition table."}
    data = label.model_dump()
    if not label.is_label or label.kcal == 0:
        return {"ok": False, "source": "gemini", "reason": "That doesn't look like a nutrition label. Photograph the nutrition table on the back of the pack."}
    for k in ("kcal", "protein_g", "carbs_g", "fat_g", "sugar_g"):
        if data.get(k) is not None:
            data[k] = round(data[k], 1)
    return {"ok": True, "source": "gemini", **data, "warnings": check_label(data)}


# ---------------------------------------------------------------------------
# Feature 3: AI coach chat
# ---------------------------------------------------------------------------
def coach_reply(profile: dict, metrics: dict, today: dict, messages: list[ChatMessage]) -> dict:
    if not is_enabled():
        return {"reply": demo_coach(messages[-1].text, metrics, today), "source": "demo"}
    from google.genai import types

    context = (
        f"{SAFETY_RULES}\nKeep answers under 120 words, warm and practical, "
        "and use Malaysian food examples. Use short bullet points where helpful.\n"
        f"User context: {profile.get('name') or 'User'}, {profile['sex']}, {profile['age']}y, "
        f"{profile['weight_kg']} kg, BMI {metrics['bmi']} ({metrics['bmi_label']}), goal {metrics['goal']}, "
        f"target {metrics['daily_kcal']} kcal/day, protein {metrics['macros']['protein_g']} g. "
        f"Eaten today: {today.get('kcal', 0)} kcal ({today.get('items', 'nothing logged')})."
    )
    contents = [
        types.Content(
            role="model" if m.role == "assistant" else "user",
            parts=[types.Part.from_text(text=m.text)],
        )
        for m in messages[-12:]
    ]
    try:
        resp = _generate(contents, types.GenerateContentConfig(system_instruction=context, temperature=0.8))
        return {"reply": (resp.text or "").strip() or "Sorry, could you rephrase that?", "source": "gemini"}
    except Exception as exc:  # noqa: BLE001
        log.warning("Gemini coach failed: %s", exc)
        return {"reply": demo_coach(messages[-1].text, metrics, today), "source": "demo"}


def demo_coach(text: str, metrics: dict, today: dict) -> str:
    t = text.lower()
    left = metrics["daily_kcal"] - int(today.get("kcal", 0))
    if any(w in t for w in ("nasi lemak", "roti", "mamak")):
        return (f"You have about {left} kcal left today. Nasi lemak is about 400 kcal, so it fits if you skip the "
                "fried chicken and ask for sambal sikit. At the mamak, thosai (230 kcal) is a lighter pick than roti canai.")
    if any(w in t for w in ("hungry", "lapar", "snack", "night")):
        return ("Late-night hunger? Try a banana (105 kcal), a cup of low-fat yoghurt, or a bowl of papaya. "
                "Drink a glass of water first. Sometimes thirst feels like hunger.")
    if any(w in t for w in ("stuck", "plateau", "not losing", "same weight")):
        return ("Plateaus are normal! Try: 1) re-check portion sizes, 2) cut sweet drinks, 3) add 2,000 steps a day, "
                "4) sleep 7+ hours. Give it 2 weeks before changing your plan.")
    return (f"Your target is {metrics['daily_kcal']} kcal/day with {metrics['macros']['protein_g']} g protein, "
            f"and you have about {left} kcal left today. Ask me about specific foods, snacks or plateaus! "
            "(Demo mode: add a Gemini API key for full AI answers.)")
