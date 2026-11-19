"""BodyWise AI: Flask backend.

Run locally:  python app.py   →  http://127.0.0.1:5000
"""
from __future__ import annotations

import logging
import os
import threading
import time
from collections import defaultdict, deque
from datetime import date
from functools import wraps

from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory
from pydantic import BaseModel, Field, ValidationError
from werkzeug.middleware.proxy_fix import ProxyFix

from bodywise import ai
from bodywise.foods import FOODS, smart_swaps
from bodywise.health import Profile, assess, rebalance_for_event
from bodywise.predict import PredictRequest, predict

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

MAX_UPLOAD_BYTES = 5 * 1024 * 1024


class UserError(ValueError):
    """An error whose message is safe to show to the user."""


def sniff_image(data: bytes) -> str | None:
    """Identify an image by its magic bytes (never trust the filename or Content-Type)."""
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


# --- Request bodies -------------------------------------------------------
class PlanRequest(BaseModel):
    profile: Profile
    prefs: ai.Preferences = ai.Preferences()


class SwapRequest(BaseModel):
    slot: str = Field(max_length=20)
    kcal: int = Field(ge=0, le=5000)
    vegetarian: bool = False
    name: str = Field(default="", max_length=120)


class RebalanceRequest(BaseModel):
    profile: Profile
    extra_kcal: int = Field(ge=100, le=5000)
    days_before: int = Field(ge=0, le=7)
    days_after: int = Field(ge=0, le=7)


class TodaySummary(BaseModel):
    kcal: int = Field(default=0, ge=0, le=20000)
    items: str = Field(default="", max_length=600)


class CoachRequest(BaseModel):
    profile: Profile
    messages: list[ai.ChatMessage] = Field(min_length=1, max_length=40)
    today: TodaySummary = TodaySummary()


# --- Quotas: per-minute rate limit + per-day allowance, keyed by user -------
class Quota:
    """In-memory limiter. Accurate with ONE worker process (see render.yaml);
    move to Redis/Firestore counters when scaling out."""

    def __init__(self):
        self.minute: dict[str, deque] = defaultdict(deque)
        self.daily: dict[str, int] = defaultdict(int)
        self.day = date.today()
        self.lock = threading.Lock()

    def allow(self, key: str, per_minute: int, per_day: int) -> str | None:
        now = time.monotonic()
        with self.lock:
            if date.today() != self.day:                       # new day: reset allowances
                self.day, self.daily = date.today(), defaultdict(int)
            if len(self.minute) > 50_000:                       # bound memory against key spraying
                self.minute = defaultdict(deque, {k: q for k, q in self.minute.items() if q and now - q[-1] < 60})
            q = self.minute[key]
            while q and now - q[0] > 60:
                q.popleft()
            if len(q) >= per_minute:
                return "Too many requests. Please wait a minute."
            if self.daily[key] >= per_day:
                return "You've reached today's AI limit. It resets tomorrow; the app still works without AI."
            q.append(now)
            self.daily[key] += 1
            return None


def create_app() -> Flask:
    app = Flask(__name__, static_folder="static", static_url_path="")
    app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_BYTES
    if os.getenv("TRUST_PROXY") == "1":
        # Behind exactly one proxy (Render): trust its X-Forwarded-For/Proto for the real client IP and https.
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1)
    quota = Quota()
    per_min = int(os.getenv("AI_RATE_LIMIT_PER_MIN", "10"))
    per_day = int(os.getenv("AI_DAILY_PER_IP", "50"))

    def ai_quota(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            # Real client IP: ProxyFix (TRUST_PROXY=1) makes remote_addr correct behind Render.
            msg = quota.allow(f"ip:{request.remote_addr or 'anon'}", per_min, per_day)
            if msg:
                return jsonify(error=msg, code="quota"), 429
            return fn(*args, **kwargs)
        return wrapper

    def same_site_only(fn):
        """Uploads are 'simple' requests a foreign site could forge; require our custom header."""
        @wraps(fn)
        def wrapper(*args, **kwargs):
            if request.headers.get("X-BodyWise") != "1":
                return jsonify(error="Request blocked."), 403
            return fn(*args, **kwargs)
        return wrapper

    def body(model: type[BaseModel]):
        return model.model_validate(request.get_json(silent=True) or {})

    def read_image() -> tuple[bytes, str]:
        file = request.files.get("image")
        if file is None:
            raise UserError("No image uploaded.")
        data = file.read()
        mime = sniff_image(data)
        if not data or mime is None:
            raise UserError("Please upload a JPEG, PNG or WebP image.")
        return data, mime

    # --- Error handling: always JSON, never stack traces ------------------
    @app.errorhandler(ValidationError)
    def on_validation(err: ValidationError):
        first = err.errors()[0]
        field = ".".join(str(x) for x in first["loc"])
        return jsonify(error=f"Invalid {field}: {first['msg']}"), 400

    @app.errorhandler(UserError)
    def on_user_error(err: UserError):
        return jsonify(error=str(err)), 400

    @app.errorhandler(ValueError)
    def on_value(_err: ValueError):
        return jsonify(error="Invalid request."), 400

    @app.errorhandler(413)
    def on_too_large(_):
        return jsonify(error="Image is too large (max 5 MB)."), 413

    @app.errorhandler(500)
    def on_500(_):
        return jsonify(error="Something went wrong on our side."), 500

    @app.after_request
    def security_headers(resp):
        resp.headers["X-Content-Type-Options"] = "nosniff"
        resp.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        resp.headers["X-Frame-Options"] = "DENY"
        resp.headers["Permissions-Policy"] = "camera=(self), geolocation=(), microphone=()"
        resp.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        resp.headers["Cross-Origin-Resource-Policy"] = "same-origin"
        if request.is_secure:
            resp.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        resp.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' https://cdn.jsdelivr.net; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src https://fonts.gstatic.com; "
            "img-src 'self' data: blob:; "
            "connect-src 'self' https://teachablemachine.withgoogle.com https://storage.googleapis.com; "
            "frame-src 'none'; "
            "worker-src 'self'; manifest-src 'self'; "
            "frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
        )
        if request.path == "/sw.js":
            resp.headers["Cache-Control"] = "no-cache"
        return resp

    # --- Pages ------------------------------------------------------------
    @app.get("/")
    def index():
        return send_from_directory(app.static_folder, "index.html")

    # --- API: public (cheap, pure computation) ------------------------------
    @app.get("/api/status")
    def status():
        return jsonify(
            ai_enabled=ai.is_enabled(),
            tm_model_url=os.getenv("TM_MODEL_URL", "").strip() or None,
        )

    @app.get("/api/foods")
    def foods():
        return jsonify(foods=FOODS)

    @app.post("/api/assess")
    def api_assess():
        return jsonify(assess(body(Profile)))

    @app.post("/api/swap")
    def api_swap():
        req = body(SwapRequest)
        return jsonify(swaps=smart_swaps(req.slot, req.kcal, req.vegetarian, exclude_name=req.name))

    @app.post("/api/predict")
    def api_predict():
        return jsonify(predict(body(PredictRequest)))

    @app.post("/api/rebalance")
    def api_rebalance():
        req = body(RebalanceRequest)
        metrics = assess(req.profile)
        result = rebalance_for_event(
            metrics["daily_kcal"], req.profile.sex, req.extra_kcal, req.days_before, req.days_after
        )
        return jsonify(base_kcal=metrics["daily_kcal"], **result)

    # --- API: AI (costs money) → per-IP quotas + global daily cap --------------
    @app.post("/api/plan")
    @ai_quota
    def api_plan():
        req = body(PlanRequest)
        metrics = assess(req.profile)
        plan = ai.generate_plan(req.profile.model_dump(), metrics, req.prefs)
        return jsonify(metrics=metrics, plan=plan)

    @app.post("/api/menu/scan")
    @same_site_only
    @ai_quota
    def api_menu():
        data, mime = read_image()
        try:
            remaining = max(0, min(int(request.form.get("remaining_kcal", "600")), 5000))
        except ValueError:
            raise UserError("Invalid remaining calories.") from None
        goal = request.form.get("goal", "maintain")
        if goal not in ("lose", "maintain", "gain"):
            goal = "maintain"
        prefs = ai.Preferences.model_validate_json(request.form.get("prefs", "{}"))
        return jsonify(ai.scan_menu(data, mime, remaining, prefs, goal))

    @app.post("/api/label/scan")
    @same_site_only
    @ai_quota
    def api_label():
        data, mime = read_image()
        return jsonify(ai.read_label(data, mime))

    @app.post("/api/coach")
    @ai_quota
    def api_coach():
        req = body(CoachRequest)
        metrics = assess(req.profile)
        return jsonify(ai.coach_reply(req.profile.model_dump(), metrics, req.today.model_dump(), req.messages))

    return app


app = create_app()

if __name__ == "__main__":
    app.run(debug=os.getenv("FLASK_DEBUG") == "1", port=int(os.getenv("PORT", "5000")))
