# BodyWise AI

**A personal AI weight coach for Malaysian students.**
SDT2143 Artificial Intelligence in Modern Computing · Mini AI Hackathon · Theme: *AI for Problem Solving*

Enter your height and weight to get a 3D virtual body, a calorie target calculated by formula, a 7-day Malaysian
meal plan written by AI, food-photo and nutrition-label logging, an AI coach, and a machine-learning forecast of
when you'll reach your goal. It runs in the browser and installs on a phone like an app.

- **Design (Figma):** https://www.figma.com/design/yFMT2RV65E5SPAXmv7bxuu
- **Live app:** *add your Render link here after deploying*

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
Home · Plan · Snap (Food / Label / Menu) · Progress · Profile · Settings · AI Coach, plus a 5-step onboarding.

### App experience
- **Installable (PWA):** on a phone, open the link and choose *Add to Home Screen*. It opens full-screen with the pink BodyWise icon, and the app's screens load offline.
- **Light and dark themes** (Settings → Appearance).
- **No account needed:** data stays in your browser on your device. Settings lets you export it or delete it.

---

## Run it locally

Requirements: Python 3.12+ and Google Chrome or Edge.

```bash
python -m venv .venv
.venv\Scripts\activate                 # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env                 # macOS/Linux: cp .env.example .env
# put your free Gemini key in .env  →  https://aistudio.google.com/apikey
python app.py
```

Open **http://127.0.0.1:5000**. Don't use VS Code "Live Server": it can't run the Python backend.

**Demo mode:** without a Gemini key the app still works. Meal plans come from the built-in Malaysian food list and
the coach gives rule-based replies, so a presentation never breaks.

**Tests:** `python -m pytest -q` runs 43 tests in demo mode, so they never call the paid API.

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
| `TRUST_PROXY` | Set to `1` only behind one reverse proxy (Render) | `0` |

### Teachable Machine food model (needed for food photos)
1. Go to https://teachablemachine.withgoogle.com → **Image Project**.
2. Create classes named exactly like the food ids in [bodywise/foods.py](bodywise/foods.py), e.g. `nasi_lemak`, `roti_canai`, `teh_tarik`. Use 50+ photos each.
3. Train → **Export Model** → **Upload (shareable link)** → paste the link into `TM_MODEL_URL`.
4. The app classifies on the device. If the model is less than 60% sure, it shows its top guesses for the user to pick, or the user searches the food list.

## Deploy (free public link)

1. Push the project to GitHub (`.env` is git-ignored, so your key stays private).
2. On https://render.com choose **New → Blueprint** and pick the repository. It reads [render.yaml](render.yaml).
3. Enter your `GEMINI_API_KEY` when asked. After 3–5 minutes you get a link like `https://bodywise-ai.onrender.com`.

The free tier sleeps after 15 minutes without visitors; open the link a minute before presenting.

---

## How it works

```
Phone / browser (HTML, CSS, JavaScript modules, Three.js, service worker)
   │  JSON + photo uploads
Flask API (app.py) ── input validation, rate limits, daily AI cap, security headers
   ├─ bodywise/health.py   formulas + safety guardrails (no AI)
   ├─ bodywise/ai.py       Gemini: meal plan, label, menu, coach (+ demo fallbacks)
   ├─ bodywise/predict.py  scikit-learn regression + plateau detection
   └─ bodywise/foods.py    Malaysian food list + Smart Swap
```

```
app.py                  Flask app: routes, quotas, security headers
bodywise/               Python logic (health, ai, predict, foods)
static/index.html       single-page app shell
static/css/             styles.css (base + colour tokens), v2.css (pink design components)
static/js/              main.js (router), api.js, store.js, ui.js, avatar*.js (3D body)
static/js/views/        one file per screen
static/sw.js            service worker (offline + install)
static/manifest.webmanifest, static/img/   app name and icons
tests/                  pytest suite
firebase/               Firestore schema design (for the report; not used by the app)
render.yaml             Render deployment
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
