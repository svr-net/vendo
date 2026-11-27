# Vendo: advertising engine for ordinary people

Vendo teaches non-experts how online advertising works and lets them launch **real campaigns** on the five biggest self-serve ad platforms from one simple brief:

| Platform | API | What Vendo creates |
|---|---|---|
| **Meta** (Facebook, Instagram) | Marketing API (Graph) | Image upload → Campaign → Ad set → Ad creative → Ad |
| **Google Ads** | Google Ads API (REST) | Budget → Search campaign → Locations/language → Ad group → Keywords → Responsive search ad |
| **TikTok** | TikTok API for Business v1.3 | Video + cover upload → Identity → Campaign → Ad group → Ad |
| **LinkedIn** | Marketing API (versioned `/rest`) | Campaign group → Image upload → Campaign → Sponsored post → Creative |
| **Pinterest** | API v5 | Pin → Campaign → Ad group → Ad |

## What's inside

- **Academy** (`/learn`): 10 short lessons (auctions, goals, platform choice, budgets & bidding, targeting, creative, tracking, metrics, testing, ad policies) with quizzes and interactive tools: a budget calculator, a break-even ROAS calculator and a UTM builder.
- **Connect** (`/connect`): OAuth 2.0 connection to each platform, ad-account and asset picking (Facebook Page, LinkedIn Company Page, Pinterest board, pixels), plus a **sandbox mode** to practise without an ad account or money.
- **Campaign wizard** (`/campaigns/new`): six steps (Goal → Platforms → Audience → Budget → Ad → Review). Alongside the form it shows:
  - a **coach** panel with best-practice tips for each step,
  - live **readiness checks** against every platform's rules (character limits, minimum budgets, required media, and so on),
  - a **recommended budget split** per goal and a **daily forecast** (impressions, clicks, conversions),
  - **ad previews** in each platform's style,
  - **"What Vendo will create"**: the exact API requests, in order, each with a plain-language explanation.
- **Dashboard** (`/campaigns/:id`): per-platform on/off switch, metrics (impressions, clicks, CTR, CPC, CPM, spend, conversions, CPA, ROAS), **plain-language insights** ("Low CTR: test a new image…"), the full launch log with every request and response, and resumable retry after a failure.

### Safety by default
- Everything is created **paused** unless the user explicitly chooses to start delivery. Live activation asks for confirmation.
- A failed launch keeps every object already created. Retry resumes from the failed step, so nothing is duplicated.
- Platform tokens are encrypted at rest (AES-256-GCM). Passwords are hashed with scrypt. State-changing API calls need a same-origin header (CSRF protection), and OAuth uses a one-time `state`.
- Conversion goals (leads, sales) fall back to traffic optimisation when no pixel or tag is configured, and the user is told why.

## Quick start

Requires **Node.js ≥ 22.13**. There are no runtime npm dependencies (it uses the built-in `node:sqlite`, `node:http` and `fetch`).

```bash
cp .env.example .env        # set APP_SECRET; platform keys are optional
npm start                   # http://localhost:3000
npm test                    # 23 tests: engine, all 5 platform adapters (mocked HTTP), API flow
```

With no platform credentials configured, every platform runs in **sandbox mode**. Launches are simulated, no network calls are made, and realistic metrics build up over time (sandbox time runs 120× faster). This is the best way to explore the product.

To go live, follow **[docs/PLATFORM_SETUP.md](docs/PLATFORM_SETUP.md)** to create a developer app on each platform and put its keys in `.env`.

## Browser version on GitHub Pages (WebAssembly)

Vendo also runs **entirely in the browser**, so it can be hosted on GitHub Pages with no server:

- The **same server code** (router, API routes, campaign engine, platform adapters, validation) is bundled with esbuild and runs inside a **Service Worker**, which answers the pages' `/api/*` requests.
- `node:sqlite` is replaced by **SQLite compiled to WebAssembly** ([sql.js](https://sql.js.org)). The database, uploads and session are kept in IndexedDB on the visitor's device.
- The other Node built-ins it uses are swapped for small browser versions in `web/shims/`: `fs` (in memory), `path`, and `crypto` (scrypt/AES-GCM/SHA-256 via `@noble/*`).
- **Only sandbox mode is available** in this version. Connecting real ad accounts needs the server version, because OAuth client secrets cannot be published to a static site and the ad APIs don't accept browser requests.

```bash
npm install                 # build-time tools only (esbuild, sql.js, @noble/*, buffer)
PAGES_BASE=/vendo/ npm run build:pages   # → dist-pages/
```

**Deploying:** the workflow `.github/workflows/pages.yml` builds and publishes on every push to `main`. One-time setup: *Settings → Pages → Build and deployment → Source: **GitHub Actions***. The site is then available at `https://<owner>.github.io/<repo>/`.

Strictly speaking, Node.js itself is not compiled to WebAssembly here: Vendo's JavaScript runs on the browser's own engine, and the native part (SQLite) is WebAssembly. That gives the same behaviour with a small download (≈ 210 KB of JavaScript plus a 650 KB `.wasm` file) and no special server headers. Running a full Node.js runtime in WebAssembly (e.g. WebContainers) would need cross-origin isolation headers that GitHub Pages cannot set, and commercial use of WebContainers requires a license from StackBlitz.

## Architecture

```
public/                 Static frontend (HTML + ES modules, no build step)
src/
  server.js             HTTP server, routes, static files
  config.js             .env loader and settings (API versions are configurable)
  lib/                  http router, sqlite, auth/sessions, crypto, apiClient (retries + error normalisation)
  engine/
    spec.js             The unified campaign spec + goals
    validate.js         Per-platform rule checks (errors, warnings, tips)
    advisor.js          Benchmarks, budget split, forecasts, KPI and insight generation
    orchestrator.js     Plan → execute (live or sandbox) → store ids/log → resume on retry
    connections.js      Encrypted token storage + refresh
    geo.js              Country → Google/TikTok/LinkedIn location ids
  platforms/            One adapter per platform: OAuth, accounts, assets, plan(), setStatus(), fetchMetrics()
  routes/               JSON API + OAuth callbacks
test/                   node:test suites
web/                    Browser build: Service Worker entry, Node shims, boot script, build script
```

The core idea is that **each adapter returns a plan**: an ordered list of steps (`method`, `url`, `body(refs)`, `extract(response)`, `explain`). The same plan is used three ways:
1. **Preview**: bodies are rendered with placeholders (`{{campaign}}`) and shown to the user as teaching material.
2. **Live**: steps run in order, and each step's returned id is fed into later steps.
3. **Sandbox**: steps are recorded with simulated ids and no network calls.

Adding a platform (for example Snapchat, X or Microsoft Advertising) means writing one adapter file that implements the same interface.

## Status and limitations

- The adapters follow each platform's public API documentation. Tests check the request structure and the ID chaining with mocked HTTP. **They have not yet been run against real ad accounts**, so expect small field-level adjustments when you first connect each platform. Error messages from the platforms are shown word for word in the launch log to make this easy.
- Ad platform APIs version often. API versions are set in `.env` (`META_API_VERSION`, `GOOGLE_ADS_API_VERSION`, `LINKEDIN_API_VERSION`).
- Google campaigns are created without an end date (Vendo tells the user to pause them, or to set an end date in Google Ads).
- Location ids in `src/engine/geo.js` cover 28 countries. Check new entries against each platform's targeting lookup endpoints before adding them.
- Interest or job-title targeting, lookalikes, retargeting and special ad categories (housing, employment, credit, politics) are not supported in Vendo yet. They are covered in the Academy.
- Benchmarks in the Advisor are broad cross-industry averages, meant for teaching rather than as guarantees.
- For production: run behind HTTPS (`PUBLIC_BASE_URL=https://…`), set a strong `APP_SECRET`, and back up `data/`.

## License

MIT
