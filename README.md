# BodyWise AI

**A personal AI weight coach for Malaysian students.**
SDT2143 Artificial Intelligence in Modern Computing · Mini AI Hackathon · Theme: *AI for Problem Solving*

Enter your height and weight to get a 3D virtual body, a calorie target calculated by formula, a 7-day Malaysian
meal plan written by AI, food-photo and nutrition-label logging, an AI coach, and a machine-learning forecast of
when you'll reach your goal. It runs in the browser and installs on a phone like an app.

- **Design (Figma):** https://www.figma.com/design/yFMT2RV65E5SPAXmv7bxuu
- **Live app:** *add your Vercel link here after deploying*

> Student prototype, not medical advice. Calorie values are approximate; verify with MyFCD.

---

## Problem

Many Malaysian students want to lose or gain weight but don't know how many calories they need. Generic diet apps
ignore local food (nasi lemak, roti canai, teh tarik) and student budgets, and without a way to see progress most
people give up within weeks.

## Features

| Feature | AI / technique |
|---|---|
| 7-day meal plan for losing, maintaining or gaining weight, with a ringgit budget, halal and vegetarian options and **Puasa (Ramadan) mode** | **Google Gemini**, structured JSON output |
| **Food photo**: identifies the dish, calories come from our Malaysian food list | **Teachable Machine** image model, runs entirely on the device (photos never leave the phone) |
| **Nutrition label scanner** for packaged food | **Gemini Vision** reads the label into a fixed format, then an arithmetic check (kcal ≈ 4P + 4C + 9F, per-100 g vs per-serving, kJ/kcal mix-ups) |
| **Menu scanner**: ranks dishes on a hawker menu board for the calories you have left | **Gemini Vision** |
| **AI coach** chat that knows your targets and today's log | **Gemini** |
| **Progress forecast**: goal date, kg/week, plateau detection | **scikit-learn** linear regression |
| **3D virtual body** that changes shape with BMI, with your goal shown as a glowing outline | **Three.js**, body shape generated from BMI |
| BMI, BMR, TDEE, macros and safety guardrails | Mifflin-St Jeor formula, Malaysian (Asian) BMI cut-offs |

### Features mainstream calorie apps don't have
1. **Future You:** drag a slider to watch your 3D body change week by week toward your goal.
2. **Menu Scanner:** choose *before* you order, not just log after you eat.
3. **Puasa mode:** Sahur, Iftar and Moreh meal plans.
4. **Kenduri Rebalancer:** spreads a feast's extra calories safely over the days around it.
5. **Smart Swap:** lighter local alternatives (roti canai → thosai), ranked to keep protein high.
6. **Plateau Detector:** spots a 3-week stall and suggests a refresh.
7. **Budget in ringgit:** every meal has an estimated cost, checked against your daily budget.
8. **Next best bite:** Home suggests a protein-rich local food that fits the calories you have left.

### Screens
Home · Plan · Snap (Food / Label / Menu) · Progress · Profile · Settings · AI Coach, plus a guided onboarding
(splash → welcome → goal → about you → height & weight wheels → goal weight with the 3D body → activity → food →
"building your plan" → plan ready) and a "meal logged" success screen. All screens follow the Figma design.

### App experience
- **Installable (PWA):** on a phone, open the link and choose *Add to Home Screen*. It opens full-screen with the pink BodyWise icon, and the app's screens load offline.
- **Light mode by default**, with an optional dark theme (Settings → Appearance).
- **Every launch opens with the splash and welcome screens.** Returning users tap *Continue* to pick up where they left off.
- **No account needed:** you're signed in anonymously and your data syncs to Supabase in the background (or stays on the device if Supabase isn't set up). Optionally link Google to restore it on another phone. Settings lets you export or delete it.

---

## Run it locally

Requirements: Python 3.12+ and Google Chrome or Edge. Node.js 18+ only if you change the frontend
(the built app in `frontend/dist` is committed).

```bash
python -m venv .venv
.venv\Scripts\activate                 # macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
copy .env.example .env                 # macOS/Linux: cp .env.example .env
# put your free Gemini key in .env  →  https://aistudio.google.com/apikey
python app.py
```

Open **http://127.0.0.1:5000**. Interactive API docs (Swagger) are at **http://127.0.0.1:5000/api/docs**.
Don't use VS Code "Live Server": it can't run the Python backend.

**Frontend development:**

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173 with hot reload; /api is proxied to the FastAPI server on :5000
npm run build    # writes frontend/dist, which FastAPI serves
```

**Demo mode:** without a Gemini key the app still works. Meal plans come from the built-in Malaysian food list and
the coach gives rule-based replies, so a presentation never breaks.

**Tests:** `python -m pytest -q` runs 47 tests in demo mode, so they never call the paid API or Supabase.

### Settings (`.env`)

| Variable | Purpose | Default |
|---|---|---|
| `GEMINI_API_KEY` | Google AI Studio key. Leave empty for demo mode. | — |
| `GEMINI_MODEL` | Main model | `gemini-3.8-flash` |
| `GEMINI_FALLBACK_MODELS` | Tried in order if the main model is busy or retired | lite models |
| `TM_MODEL_URL` | Your Teachable Machine shareable link | — |
| `AI_RATE_LIMIT_PER_MIN` | AI requests per minute per visitor | `10` |
| `AI_DAILY_PER_IP` | AI requests per day per visitor | `50` |
| `AI_DAILY_CAP` | Total AI requests per day; after that everything switches to demo mode | `500` |
| `VITE_SUPABASE_URL` | Supabase project URL (public) | — |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key (public, protected by Row-Level Security) | — |
| `SUPABASE_SECRET_KEY` | Supabase secret key, server only (AI rate limits) | — |
| `TRUST_PROXY` | Set to `1` only behind one reverse proxy (not needed on Vercel) | `0` |

### Teachable Machine food model (needed for food photos)
1. Go to https://teachablemachine.withgoogle.com → **Image Project**.
2. Create classes named exactly like the food ids in [bodywise/foods.py](bodywise/foods.py), e.g. `nasi_lemak`, `roti_canai`, `teh_tarik`. Use 50+ photos each.
3. Train → **Export Model** → **Upload (shareable link)** → paste the link into `TM_MODEL_URL`.
4. The app classifies on the device. If the model is less than 60% sure, it shows its top guesses for the user to pick, or the user searches the food list.

## Cloud data (Supabase)

Optional: without these keys the app keeps everything on the device, exactly as before.

1. Create a project at https://supabase.com. In **SQL Editor**, paste [supabase/schema.sql](supabase/schema.sql) and run it.
   That creates five tables (`profiles`, `plans`, `weight_logs`, `meal_logs`, `chat_messages`), all protected by
   Row-Level Security so each person can only read their own rows, plus a server-only `ai_quota` table for the AI limits.
2. **Authentication → Sign In / Providers:** turn on **Allow anonymous sign-ins** and **Allow manual linking**.
3. *(Optional, for "Back up with Google")* **Authentication → Providers → Google:** enable it with a Google Cloud OAuth
   client ID and secret, then add your site URL (e.g. `https://your-app.vercel.app`) under **URL Configuration → Redirect URLs**.
4. **Project Settings → API Keys:** copy the project URL, the **publishable** key and the **secret** key into `.env`
   (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`), then rebuild the frontend.

There's no login screen: everyone is signed in anonymously and their data syncs in the background. **Settings → Cloud
backup → Back up with Google** links a Google account to the same data, so it can be restored on another phone.

## Deploy (Vercel)

1. Push the project to GitHub (`.env` is git-ignored, so your keys stay private).
2. On https://vercel.com choose **Add New → Project** and import the repository. [vercel.json](vercel.json) already sets
   the build (`frontend/` → `frontend/dist`) and routes `/api/*` to FastAPI ([api/index.py](api/index.py)), which runs as a Python serverless function.
3. Under **Settings → Environment Variables**, add `GEMINI_API_KEY`, `TM_MODEL_URL`, `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` (and optionally the `AI_*` limits). Redeploy.

AI rate limits are stored in Supabase because serverless functions don't share memory. If Supabase is unreachable,
the API falls back to per-instance limits instead of failing.

## Android app (APK)

The same React app is packaged as a native Android app with [Capacitor](https://capacitorjs.com) (`frontend/android/`).
Screens, the 3D body and Teachable Machine run inside the app; AI features call the deployed FastAPI backend.

1. Deploy to Vercel (above) and put the link in [.env.android](.env.android): `VITE_API_BASE=https://your-app.vercel.app`.
2. With Android Studio installed, run:
   ```powershell
   powershell -ExecutionPolicy Bypass -File frontenduild-apk.ps1
   ```
3. Copy `BodyWise.apk` (repo root) to an Android phone and open it (allow "install unknown apps").

Or open `frontend/android` in Android Studio and press **Run** to install it on a connected phone or emulator.
The backend only accepts cross-origin calls from the app's own origin (`https://localhost`), not from other websites.

---

## How it works

```
Phone / browser (React + Vite, Three.js, TensorFlow.js / Teachable Machine, service worker)
   │  your data (anonymous or Google login) ──────► Supabase: Postgres + Auth, Row-Level Security
   │  JSON + photo uploads
FastAPI on Vercel (app.py) ── validation, AI rate limits (kept in Supabase), daily AI cap, security headers
   ├─ bodywise/health.py   formulas + safety guardrails (no AI)
   ├─ bodywise/ai.py       Gemini: meal plan, label, menu, coach (+ demo fallbacks)
   ├─ bodywise/predict.py  scikit-learn regression + plateau detection
   └─ bodywise/foods.py    Malaysian food list + Smart Swap
```

```
app.py                  FastAPI app: routes, quotas, security headers; serves frontend/dist
api/index.py            Vercel entry point for the FastAPI app
bodywise/               Python logic (health, ai, predict, foods, quota)
frontend/src/App.jsx    app shell: hash router, navigation, toasts
frontend/src/views/     one React component per screen (Onboarding, Home, Plan, Snap, Progress, Coach, Profile, Settings)
frontend/src/lib/       api.js, store.js (localStorage state), sync.js (Supabase sync + Google), avatar3d.js (3D body)
frontend/src/styles/    styles.css (base + colour tokens), v2.css, flow.css (pink design)
frontend/public/        sw.js (offline + install), manifest.webmanifest, img/ icons
frontend/dist/          production build (served by FastAPI locally, by Vercel's CDN in production)
tests/                  pytest suite
supabase/schema.sql     database tables, Row-Level Security policies, AI quota function
vercel.json             Vercel build, routing and security headers
frontend/android/       Capacitor Android project (APK); build with frontend/build-apk.ps1
```

## Responsible AI

- **Numbers come from formulas, words come from AI.** The AI never sets calorie targets. The server recalculates every day's total from the AI's meals and flags days more than 15% off target.
- **AI output isn't trusted blindly.** Every number the AI returns has hard limits, and scanned labels must pass an arithmetic check before logging.
- **Structured outputs:** Gemini must reply in a fixed JSON format, so there's no fragile text parsing.
- **Guardrails:**
  - no weight-loss plans for underweight users;
  - calorie floors of 1200 kcal (women) and 1500 kcal (men);
  - unhealthy targets are clamped;
  - a warning for under-18s;
  - a crisis hotline in the coach's instructions.
- **Body image:** the 3D body is a stylised mannequin, never an AI-generated photo of the user.
- **Privacy:** data stays in the user's browser; photos are resized on the device, analysed, and never stored.

## Security

- **API key on the server only.**
- **Cost protection:** per-visitor rate limits and daily allowances, plus a global daily AI cap that falls back to demo mode, so there's no surprise bill.
- **Safe page content:** all text is HTML-escaped, and a strict Content-Security-Policy is set, along with HSTS and COOP/CORP headers.
- **Upload checks:** images are identified by their file contents (not the filename or extension) and limited to 5 MB. Cross-site upload posts are blocked.
- **No internal errors leaked** to users.

## Credits

Built for the SDT2143 Mini AI Hackathon, German-Malaysian Institute. AI tools: Google Gemini, Google Teachable
Machine, scikit-learn, Three.js. Calorie values are approximate, based on common Malaysian servings.
