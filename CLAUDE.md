# CLAUDE.md — fidelity-exporter

## Project Overview

`fidelity-exporter` is a Node.js CLI tool and library that uses Playwright browser automation to log into Fidelity's website and export portfolio positions as a CSV file. It handles the full login flow including MFA/OTP challenges and splash screens.

## Repository Structure

```
fidelity-exporter/
├── index.js          # Core library — exportPositions() and helpers
├── cli.js            # CLI entry point — parses args, reads env vars, calls index.js
├── package.json      # Project metadata, bin entry, single dependency (playwright)
└── package-lock.json # Locked dependency versions
```

No build step. No TypeScript. No tests. CommonJS modules (`require`/`module.exports`).

## Key Functions

### `index.js`
- **`exportPositions(options)`** — Main entry point. Launches Chromium, logs in, navigates to Positions, triggers download, returns `{ filePath, content }`.
- **`handlePostLoginChallenges(page, timeout)`** — Polling loop (1.5s interval) that auto-dismisses MFA prompts, OTP inputs, and splash screens. Waits for user input on OTP if running in headed mode.
- **`triggerDownload(page, timeout)`** — Locates the CSV download button using a fallback selector chain (aria-label → custom element class → button text → data-testid → accessibility role). Returns a Playwright `Download` handle.

### `cli.js`
- Reads credentials from `FIDELITY_USERNAME` / `FIDELITY_PASSWORD` env vars — never from CLI args.
- Outputs CSV content to **stdout**, file path to **stderr**.
- `DEBUG=1` env var enables full stack traces on errors.

## Running the Tool

```bash
# Install dependencies (once)
npm install
npx playwright install chromium

# Run
FIDELITY_USERNAME=user@example.com FIDELITY_PASSWORD=secret node cli.js

# Options
node cli.js --out ./downloads   # Save CSV to specific directory
node cli.js --visible           # Show browser window (useful for MFA debugging)
node cli.js --timeout 120000    # Custom timeout in ms (default: 60000)
node cli.js --help
```

## Programmatic Usage

```javascript
const { exportPositions } = require('./index');

const result = await exportPositions({
  username: 'user@fidelity.com',
  password: 'secret',
  downloadDir: './downloads',  // optional, defaults to system temp
  headless: true,              // optional, default true
  timeout: 60000               // optional, default 60000ms
});

console.log(result.filePath);  // absolute path to saved CSV
console.log(result.content);   // CSV string
```

## Browser Automation Conventions

- Chromium is launched with `--disable-blink-features=AutomationControlled` and a realistic User-Agent to avoid bot detection.
- Viewport is fixed at 1280×900.
- Downloads are enabled via `acceptDownloads: true` on the browser context.
- Form submissions use `Promise.all([page.waitForNavigation(), page.click()])` to avoid race conditions.
- All async waits use `waitForSelector` with `{ state: 'visible' }` before interacting.

## Selector Strategy (triggerDownload)

The download button selector is brittle by nature — Fidelity's frontend changes. The current fallback chain is:
1. `[aria-label*="Download"]`
2. Custom element class selectors specific to Fidelity's component library
3. Button text matching
4. `[data-testid]` attributes
5. Accessibility role fallback

When updating selectors, maintain this fallback chain pattern rather than relying on a single selector.

## Error Handling

- Validates username/password are provided before launching browser.
- Browser is always closed in a `finally` block.
- Errors bubble up with descriptive messages. Set `DEBUG=1` for full stack traces.

## What Not To Do

- Do not add a build step or transpile to TypeScript — keep it plain JS.
- Do not add a test framework without a clear testing strategy for browser automation (mocking Playwright is not valuable here).
- Do not store credentials in code or config files — always use env vars.
- Do not switch from CommonJS to ESM without verifying Playwright compatibility.
- Do not hardcode file paths for the Fidelity website — use the existing navigation flow in case URLs change.
