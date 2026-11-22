"""BodyWise AI: FastAPI backend.

Run locally:  python app.py              →  http://127.0.0.1:5000
On your LAN:  set HOST=0.0.0.0 first     →  http://<your-laptop-ip>:5000
API docs:     http://127.0.0.1:5000/api/docs
"""
from __future__ import annotations

import logging
import os
from pathlib import Path

import uvicorn
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, ValidationError
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from bodywise import ai
from bodywise.foods import FOODS, LOOKALIKES, TM_CLASSES, smart_swaps
from bodywise.health import Profile, assess, rebalance_for_event
from bodywise.predict import PredictRequest, predict
from bodywise.quota import Quota

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("bodywise")

FRONTEND_DIST = Path(__file__).resolve().parent / "frontend" / "dist"

APP_CSP = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "font-src https://fonts.gstatic.com; "
    "img-src 'self' data: blob:; "
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://teachablemachine.withgoogle.com https://storage.googleapis.com; "
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


class ApiError(Exception):
    def __init__(self, status: int, error: str, code: str | None = None):
        self.status, self.error, self.code = status, error, code


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
        # Real client IP: on Vercel, x-real-ip is set by the platform (clients can't spoof it);
        # elsewhere ProxyHeadersMiddleware (TRUST_PROXY=1) fixes request.client.
        ip = (request.headers.get("x-real-ip") if os.getenv("VERCEL") else None) or (request.client.host if request.client else "anon")
        msg = quota.allow(ip, per_min, per_day)
        if msg:
            raise ApiError(429, msg, "quota")

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
        # tm_classes: what the photo model knows; lookalikes: what each class is often confused with.
        return {"foods": FOODS, "tm_classes": TM_CLASSES, "lookalikes": LOOKALIKES}

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

    # The Android app (Capacitor) loads its screens from https://localhost and calls this API cross-origin.
    # Only those app origins are allowed, so other websites still can't send our X-BodyWise header.
    origins = ["https://localhost", "capacitor://localhost", "http://localhost"]
    origins += [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET", "POST"],
                       allow_headers=["Content-Type", "X-BodyWise"], max_age=600)

    if os.getenv("TRUST_PROXY") == "1":
        # Behind exactly one reverse proxy: trust X-Forwarded-For/Proto for the real client IP and https.
        app.add_middleware(ProxyHeadersMiddleware, trusted_hosts="*")
    return app


app = create_app()

if __name__ == "__main__":
    uvicorn.run(app, host=os.getenv("HOST", "127.0.0.1"), port=int(os.getenv("PORT", "5000")))
