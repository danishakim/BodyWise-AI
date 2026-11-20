"""BodyWise AI: FastAPI backend.

Run locally:  python app.py              →  http://127.0.0.1:5000
On your LAN:  set HOST=0.0.0.0 first     →  http://<your-laptop-ip>:5000
API docs:     http://127.0.0.1:5000/api/docs
"""
from __future__ import annotations

import json
import logging
import os
import threading
import time
from collections import defaultdict, deque
from datetime import date
from pathlib import Path

import uvicorn
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, ValidationError
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from bodywise import ai
from bodywise.foods import FOODS, smart_swaps
from bodywise.health import Profile, assess, rebalance_for_event
from bodywise.predict import PredictRequest, predict

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("bodywise")

MAX_UPLOAD_BYTES = 5 * 1024 * 1024
FRONTEND_DIST = Path(__file__).resolve().parent / "frontend" / "dist"

APP_CSP = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "font-src https://fonts.gstatic.com; "
    "img-src 'self' data: blob:; "
    "connect-src 'self' https://teachablemachine.withgoogle.com https://storage.googleapis.com; "
    "frame-src 'none'; "
    "worker-src 'self'; manifest-src 'self'; "
    "frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
)
# Swagger UI (only at /api/docs) loads its own script and styles from jsDelivr.
DOCS_CSP = (
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: https://fastapi.tiangolo.com; "
    "frame-ancestors 'none'"
)


class UserError(ValueError):
    """An error whose message is safe to show to the user."""


class ApiError(Exception):
    def __init__(self, status: int, error: str, code: str | None = None):
        self.status, self.error, self.code = status, error, code


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


# --- Quotas: per-minute rate limit + per-day allowance, keyed by client IP ---
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


def read_image(image: UploadFile | None) -> tuple[bytes, str]:
    if image is None:
        raise UserError("No image uploaded.")
    data = image.file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise ApiError(413, "Image is too large (max 5 MB).")
    mime = sniff_image(data)
    if not data or mime is None:
        raise UserError("Please upload a JPEG, PNG or WebP image.")
    return data, mime


def create_app() -> FastAPI:
    app = FastAPI(
        title="BodyWise AI API",
        version="2.0",
        description="Personal AI weight coach for Malaysian students. Numbers come from formulas; words come from AI.",
        docs_url="/api/docs", redoc_url=None, openapi_url="/api/openapi.json",
    )
    quota = Quota()
    per_min = int(os.getenv("AI_RATE_LIMIT_PER_MIN", "10"))
    per_day = int(os.getenv("AI_DAILY_PER_IP", "50"))

    # --- Dependencies -----------------------------------------------------
    def ai_quota(request: Request) -> None:
        # Real client IP: ProxyHeadersMiddleware (TRUST_PROXY=1) makes request.client correct behind Render.
        ip = request.client.host if request.client else "anon"
        msg = quota.allow(f"ip:{ip}", per_min, per_day)
        if msg:
            raise ApiError(429, msg, "quota")

    def same_site_only(request: Request) -> None:
        """Uploads are 'simple' requests a foreign site could forge; require our custom header."""
        if request.headers.get("x-bodywise") != "1":
            raise ApiError(403, "Request blocked.")

    upload_guard = [Depends(same_site_only), Depends(ai_quota)]

    # --- Error handling: always JSON {"error": ...}, never stack traces -----
    def first_error(errors) -> JSONResponse:
        first = errors[0]
        field = ".".join(str(x) for x in first["loc"] if x != "body") or "request"
        return JSONResponse({"error": f"Invalid {field}: {first['msg']}"}, status_code=400)

    @app.exception_handler(RequestValidationError)
    async def on_request_validation(_req, err: RequestValidationError):
        return first_error(err.errors())

    @app.exception_handler(ValidationError)
    async def on_validation(_req, err: ValidationError):
        return first_error(err.errors())

    @app.exception_handler(UserError)
    async def on_user_error(_req, err: UserError):
        return JSONResponse({"error": str(err)}, status_code=400)

    @app.exception_handler(ApiError)
    async def on_api_error(_req, err: ApiError):
        body = {"error": err.error, **({"code": err.code} if err.code else {})}
        return JSONResponse(body, status_code=err.status)

    @app.exception_handler(Exception)
    async def on_unexpected(_req, err: Exception):
        log.exception("Unhandled error: %s", err)
        return JSONResponse({"error": "Something went wrong on our side."}, status_code=500)

    # --- Security headers on every response --------------------------------
    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        resp = await call_next(request)
        path = request.url.path
        h = resp.headers
        h["X-Content-Type-Options"] = "nosniff"
        h["Referrer-Policy"] = "strict-origin-when-cross-origin"
        h["X-Frame-Options"] = "DENY"
        h["Permissions-Policy"] = "camera=(self), geolocation=(), microphone=()"
        h["Cross-Origin-Opener-Policy"] = "same-origin"
        h["Cross-Origin-Resource-Policy"] = "same-origin"
        if request.url.scheme == "https":
            h["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        h["Content-Security-Policy"] = DOCS_CSP if path.startswith("/api/docs") else APP_CSP
        if path.startswith("/assets/"):
            h["Cache-Control"] = "public, max-age=31536000, immutable"   # content-hashed by Vite
        elif path in ("/", "/sw.js") or path.endswith(".html"):
            h["Cache-Control"] = "no-cache"
        return resp

    # --- API: public (cheap, pure computation) ------------------------------
    @app.get("/api/status", tags=["app"])
    def status():
        return {"ai_enabled": ai.is_enabled(), "tm_model_url": os.getenv("TM_MODEL_URL", "").strip() or None}

    @app.get("/api/foods", tags=["food"])
    def foods():
        return {"foods": FOODS}

    @app.post("/api/assess", tags=["health"])
    def api_assess(profile: Profile):
        """BMI, BMR, TDEE, calorie target and macros, calculated by formula with safety guardrails."""
        return assess(profile)

    @app.post("/api/swap", tags=["food"])
    def api_swap(req: SwapRequest):
        return {"swaps": smart_swaps(req.slot, req.kcal, req.vegetarian, exclude_name=req.name)}

    @app.post("/api/predict", tags=["health"])
    def api_predict(req: PredictRequest):
        """Linear-regression forecast of the goal date, plus plateau detection."""
        return predict(req)

    @app.post("/api/rebalance", tags=["health"])
    def api_rebalance(req: RebalanceRequest):
        metrics = assess(req.profile)
        result = rebalance_for_event(metrics["daily_kcal"], req.profile.sex, req.extra_kcal, req.days_before, req.days_after)
        return {"base_kcal": metrics["daily_kcal"], **result}

    # --- API: AI (costs money) → per-IP quotas + global daily cap -----------
    # Plain `def` endpoints run in FastAPI's thread pool, so slow AI calls don't block other users.
    @app.post("/api/plan", tags=["ai"], dependencies=[Depends(ai_quota)])
    def api_plan(req: PlanRequest):
        """7-day Malaysian meal plan written by Gemini around the formula-based calorie target."""
        metrics = assess(req.profile)
        return {"metrics": metrics, "plan": ai.generate_plan(req.profile.model_dump(), metrics, req.prefs)}

    @app.post("/api/menu/scan", tags=["ai"], dependencies=upload_guard)
    def api_menu(image: UploadFile | None = File(None), remaining_kcal: str = Form("600"),
                 goal: str = Form("maintain"), prefs: str = Form("{}")):
        data, mime = read_image(image)
        try:
            remaining = max(0, min(int(remaining_kcal), 5000))
        except ValueError:
            raise UserError("Invalid remaining calories.") from None
        if goal not in ("lose", "maintain", "gain"):
            goal = "maintain"
        try:
            parsed = ai.Preferences.model_validate(json.loads(prefs))
        except json.JSONDecodeError:
            raise UserError("Invalid preferences.") from None
        return ai.scan_menu(data, mime, remaining, parsed, goal)

    @app.post("/api/label/scan", tags=["ai"], dependencies=upload_guard)
    def api_label(image: UploadFile | None = File(None)):
        """Read a packaged food's nutrition label (per serving) and check the arithmetic."""
        data, mime = read_image(image)
        return ai.read_label(data, mime)

    @app.post("/api/coach", tags=["ai"], dependencies=[Depends(ai_quota)])
    def api_coach(req: CoachRequest):
        metrics = assess(req.profile)
        return ai.coach_reply(req.profile.model_dump(), metrics, req.today.model_dump(), req.messages)

    # --- Frontend: the React app built by Vite into frontend/dist ------------
    @app.api_route("/", methods=["GET", "HEAD"], include_in_schema=False)
    def index():
        page = FRONTEND_DIST / "index.html"
        if page.exists():
            return FileResponse(page)
        return HTMLResponse("<h1>BodyWise</h1><p>Frontend not built. Run <code>npm run build</code> in <code>frontend/</code>.</p>", status_code=503)

    app.mount("/", StaticFiles(directory=FRONTEND_DIST, check_dir=False), name="frontend")

    if os.getenv("TRUST_PROXY") == "1":
        # Behind exactly one reverse proxy (Render): trust X-Forwarded-For/Proto for the real client IP and https.
        app.add_middleware(ProxyHeadersMiddleware, trusted_hosts="*")
    return app


app = create_app()

if __name__ == "__main__":
    uvicorn.run(app, host=os.getenv("HOST", "127.0.0.1"), port=int(os.getenv("PORT", "5000")))
