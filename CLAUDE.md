# CLAUDE.md — fidelity-exporter

## Project Overview

`fidelity-exporter` is a Node.js CLI tool and library that uses Playwright browser automation to log into Fidelity's website and export portfolio positions as a CSV file. It handles the full login flow including MFA/OTP challenges and interstitial splash screens. Sessions are persisted to avoid MFA prompts on subsequent runs.

## Repository Structure

```
fidelity-exporter/
├── cli.js                          # CLI entry point — parses args, reads env vars
├── index.js                        # FidelityExporter class — main orchestrator
├── core/
│   ├── FidelityBrowserFactory.js   # Browser lifecycle, stealth config, session persistence
│   ├── FidelityAuthManager.js      # Login flow, MFA detection, interstitial dismissal
│   └── FidelityCredentials.js      # Loads Fidelity credentials from env/.env
├── actions/
│   ├── FidelityAction.js           # Abstract base class (command pattern)
│   └── ExportPositionsAction.js    # Navigates to Positions, triggers CSV download
├── tests/
│   └── stealth-check.js            # Smoke test for bot detection evasion
├── package.json
└── package-lock.json
```

No build step. No TypeScript. CommonJS modules (`require`/`module.exports`).

## Key Components

### `index.js` — `FidelityExporter`
- **`new FidelityExporter(options)`** — Accepts `username`, `password`, `envFile`, `downloadDir`, `headless`, `timeout`, `manualLogin`, and `keepOpen`.
- **`exportPositions()`** — Orchestrates browser init → auth → action execution → cleanup. Closes the browser in `finally` unless `keepOpen` is set.

### `core/FidelityBrowserFactory.js`
- Launches a **persistent** Chromium context (not ephemeral) with session stored at `~/.config/fidelity-exporter/session`.
- Applies `playwright-extra` with `puppeteer-extra-plugin-stealth` to avoid Fidelity's bot detection (Akamai/PerimeterX fingerprinting).
- Realistic User-Agent (Chrome 124 on macOS), viewport 1280×900, `acceptDownloads: true`.

### `core/FidelityAuthManager.js`
- Navigates to Fidelity's portfolio summary URL and checks if already authenticated (session reuse).
- If login required: fills username/password with 100ms keystroke delays, submits form.
- Uses resilient selector chains for login fields (ID, name, role-based, wildcard) because Fidelity's DOM changes.
- **MFA handling**: Detects MFA via URL patterns (`/mfa`, `/challenge`) or page text.
  - **Headless mode**: Throws an error instructing the user to re-run with `--visible`.
  - **Headed mode**: Waits up to 600s for the user to complete the challenge manually.
- Supports manual login with `--visible --manual-login` when credentials are not provided to the process.
- Auto-dismisses interstitials ("Skip for now", "No thanks", "Continue").

### `actions/FidelityAction.js`
- Abstract base class. Subclasses implement `execute(page)`.
- **`ensurePage(page, targetUrl, fragment)`** — SPA-aware navigation: tries clicking a tab/link first, falls back to hard navigation, waits for URL fragment match.
- **`triggerDownload(page, buttonSelector)`** — Uses `Promise.all` with `page.waitForEvent('download')` to avoid race conditions. Returns `{ filePath, content }`.

### `actions/ExportPositionsAction.js`
- Navigates to the Positions page, waits for content to render.
- Opens "More" / "Available Actions" menu if present, then clicks Download.
- Saves files as `fidelity-positions-YYYY-MM-DD.csv` using the Pacific date, with numeric suffixes to preserve same-day reruns.
- Returns `{ filePath, content }` where `content` is the CSV string.

### `cli.js`
- Reads credentials from explicit options, `FIDELITY_USERNAME` / `FIDELITY_PASSWORD`, or `.env`; never from CLI args.
- Outputs CSV content to **stdout**, file path to **stderr**.
- Waits for manual login in visible mode when credentials are not provided.
- Options: `--out <dir>`, `--visible`, `--timeout <ms>`, `--env-file <path>`, `--manual-login`, `--keep-open`, `--debug`.

## Running the Tool

```bash
# Install dependencies (once)
npm install
npx playwright install chromium

# Run
FIDELITY_USERNAME=user@example.com FIDELITY_PASSWORD=secret node cli.js
node cli.js                         # Reads FIDELITY_USERNAME/FIDELITY_PASSWORD from .env when present

# Options
node cli.js --out ./downloads     # Save CSV to specific directory
node cli.js --visible             # Show browser window (required for MFA in headless)
node cli.js --env-file ./fidelity.env  # Load credentials from a specific env file
node cli.js --visible --manual-login  # Log in manually without env credentials
node cli.js --timeout 120000      # Custom timeout in ms (default: 60000)
node cli.js --debug               # Enable verbose debug output
node cli.js --help

# Smoke test stealth (bot detection check)
npm run test:stealth
```

## Programmatic Usage

```javascript
const { FidelityExporter } = require('./index');

const exporter = new FidelityExporter({
  envFile: './.env',
  downloadDir: './downloads',  // optional, defaults to system temp
  headless: true,              // optional, default true
  timeout: 60000               // optional, default 60000ms
});

const result = await exporter.exportPositions();
console.log(result.filePath);  // absolute path to saved CSV
console.log(result.content);   // CSV string
```

## Selector Strategy

Fidelity's frontend uses custom web components (`pvd-*`, `ap143-*`) and changes the DOM frequently. Always use **fallback chains** rather than a single selector. The ExportPositionsAction fallback order is:

1. `[pvd-link-name*="Download All Positions"]`
2. Custom Fidelity component selectors (`pvd-*`, `ap143-*`)
3. ARIA labels (`[aria-label*="Download"]`)
4. Button/link text matching
5. Accessibility role fallback

When adding new actions, follow the same pattern. Prefer `page.getByRole()` and `page.getByLabel()` (accessibility-grounded) over brittle CSS class selectors.

## Session Persistence

Sessions are stored at `~/.config/fidelity-exporter/session` (Playwright persistent context). This preserves cookies, IndexedDB, and "Trusted Device" tokens across runs, reducing MFA frequency. If a session appears broken, delete that directory and re-authenticate with `--visible`.

## Error Handling

- Credentials are validated before the browser launches.
- Browser is closed in a `finally` block unless `--keep-open` / `keepOpen` is set.
- Errors surface with descriptive messages. Use `--debug` for verbose output.
- MFA in headless mode throws immediately with instructions to use `--visible`.

## What Not To Do

- Do not accept credentials as CLI arguments — env vars only.
- Do not add a build step or transpile to TypeScript — keep it plain JS.
- Do not mock Playwright in tests — mocked browser tests do not catch selector regressions.
- Do not store credentials in code or config files.
- Do not switch from CommonJS to ESM without verifying Playwright compatibility.
- Do not hardcode Fidelity page URLs outside of the auth/action classes — they may change.
- Do not rely on a single CSS selector for any Fidelity interaction — always use fallback chains.
