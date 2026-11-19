# BodyWise AI

Personal AI weight coach for Malaysian students (SDT2143 Mini AI Hackathon, theme: AI for Problem Solving).
Flask backend + vanilla-JS single-page frontend (no build step), installable as a PWA. User data lives in the
browser's localStorage. There are **no user accounts**: the owner decided against Firebase, so don't add auth.

## Commands

```bash
.venv\Scripts\python.exe app.py          # run → http://127.0.0.1:5000 (serves API + static frontend)
.venv\Scripts\python.exe -m pytest -q    # 43 tests; always run in demo mode, never call the paid API
node --check static/js/<file>.js         # quick JS syntax check (there is no bundler/linter)
```

Setup: `python -m venv .venv` then `.venv\Scripts\python.exe -m pip install -r requirements.txt`, then copy `.env.example` → `.env`.
Do NOT open the app with VS Code "Live Server": it can't run the Flask API, so every AI feature fails.

## Layout

- `app.py`: Flask app factory, `/api/*` routes, Pydantic validation, AI quotas (per IP + global daily cap), CSP/security headers.
- `bodywise/health.py`: BMI/BMR/TDEE/macros + safety guardrails + Kenduri rebalancer. **Pure formulas, no AI.**
- `bodywise/ai.py`: Gemini calls (plan, food vision, nutrition-label scan, menu scan, coach), each with a demo fallback.
- `bodywise/predict.py`: scikit-learn linear regression forecast + plateau detection.
- `bodywise/foods.py`: Malaysian food DB, Smart Swap. Food `id`s double as Teachable Machine class names.
- `static/js/main.js`: hash router + nav. Tabs: Home · Plan · Snap (centre FAB) · Progress · Profile. Coach and Settings are reached from the top bar / Home / Profile.
- `static/js/views/*.js`: one module per screen, each exports `render(root, ctx)`. Snap has three modes: Food, Label, Menu.
- `static/js/avatar.js` + `avatar3d.js`: 3D mannequin (Three.js from jsDelivr), procedurally lofted from BMI.
- `static/js/ui.js`: `html` tagged template (auto-escapes), icons, toasts, formatters.
- `static/css/styles.css` (base + tokens) and `static/css/v2.css` (pink redesign components). Tokens mirror the Figma file.
- `static/sw.js` + `static/manifest.webmanifest` + `static/img/icon-*.png`: PWA (icons rendered from `logo.svg` / `icon-maskable.svg`).
- `README.md`: user/lecturer-facing overview. Keep its feature table and test count in sync when features change.
- `firebase/`: an earlier Firestore schema design kept for the report only. Not used by the app.

## Design source of truth

Figma: https://www.figma.com/design/yFMT2RV65E5SPAXmv7bxuu (page "Mobile v2 — Pink"). Pink `#EC4D86` primary,
dark-slate pill CTAs (`.btn-primary`), pink pills (`.btn-brand`), Plus Jakarta Sans only, borderless soft-shadow cards.

## Rules and conventions

- **Numbers come from formulas, words come from AI.** Never let the LLM decide calorie targets. `_finalise_plan` recomputes daily totals from the AI's meals; keep that verification.
- AI output is untrusted: keep the `Field(ge=…, le=…)` bounds on `MealOut`, `FoodGuess`, `MenuPick` and `NutritionLabel`,
  and keep `check_label()` (energy must roughly equal 4P + 4C + 9F; flags kJ/kcal mix-ups).
- Every AI feature must keep working without `GEMINI_API_KEY` (demo mode) and must report `source: "gemini" | "demo"`.
- Gemini output must use structured JSON (`response_schema` = a Pydantic model). Don't parse free text.
- Keep safety guardrails: no loss plans for BMI < 18.5, calorie floor 1200 kcal (women) / 1500 kcal (men), clamp unhealthy targets, warn under-18s.
- BMI categories use Malaysian/Asian cut-offs (18.5 / 23 / 27.5), not WHO.
- Frontend: build markup only with the `html` template from `ui.js` (it escapes). Use `raw()` only for markup you generated yourself (SVG/numbers), never for user or AI text.
- Icons get a 20px default via a zero-specificity rule in `v2.css`; size them explicitly in new components.
- CSP blocks inline `<script>`. Put JS in files. External scripts are only allowed from `cdn.jsdelivr.net`, so update the CSP in `app.py` if you add a host.
- Upload endpoints require the `X-BodyWise: 1` header (blocks cross-site form posts); `api.js` sends it.
- Pin CDN versions: three@0.160.0, @tensorflow/tfjs@1.7.4 (matches the TM model), @teachablemachine/image@0.8.5.
- The virtual body is **3D only**. No 2D body, skin tone, hijab, "Gemini AI online" pill or AI status card; all removed on purpose.
- UI copy the owner removed on purpose; don't add it back: the small eyebrow labels "Powered by Gemini" (Coach),
  "Machine-learning forecast" (Progress), "AI vision" (Snap) and "7-day plan · N kcal/day" (Plan); the
  "Local food database" badge on Plan; and "… confidence" on the Progress/Profile forecast. Keep page headers to the H1 only.
- After any frontend change, bump `VERSION` in `static/sw.js` so installed copies pick it up.
- Add new Teachable Machine classes in two places: the TM project, and `FOODS` in `foods.py` with the identical `id`.

## Config (`.env`, never commit it)

`GEMINI_API_KEY`, `GEMINI_MODEL` (default `gemini-3.8-flash`), `GEMINI_FALLBACK_MODELS` (default lite models),
`TM_MODEL_URL`, `AI_RATE_LIMIT_PER_MIN`, `AI_DAILY_PER_IP`, `AI_DAILY_CAP` (global → demo mode), `TRUST_PROXY=1` only behind one proxy (Render).

## Gotchas

- Google retires Gemini models (`gemini-2.5-flash` returns 404 for new keys) and the free tier often returns 503/504.
  `_generate()` in `ai.py` fails over through `GEMINI_FALLBACK_MODELS` and uses `thinking_level="low"`. Keep it.
- `tests/test_api.py` imports `app` (which loads `.env`) *before* deleting `GEMINI_API_KEY`; keep that order or tests hit the real API.
- Quotas are in memory, so Render must run **one** gunicorn worker (`render.yaml`). Use Redis if you ever scale out.
- Headless Chrome on Windows enforces a minimum window width of about 500px, so screenshots narrower than that are cropped and misleading.
  For WebGL screenshots use `--headless=new --use-angle=swiftshader --enable-unsafe-swiftshader`. To screenshot inner screens, seed localStorage from a temporary static page (CSP forbids inline scripts) and delete it afterwards.
- Deploy target: Render free tier via `render.yaml` (gunicorn). It sleeps after 15 minutes idle.
