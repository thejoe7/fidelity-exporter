# fidelity-exporter

A CLI tool and Node.js library that automates logging into [Fidelity](https://www.fidelity.com) and exporting your portfolio positions as a CSV file.

Uses [Playwright](https://playwright.dev) to drive a Chromium browser through the full login flow, including MFA/OTP challenges.

## Requirements

- Node.js 18+
- Chromium (installed via Playwright)

## Installation

```bash
npm install
npx playwright install chromium
```

## Usage

### CLI

Set your credentials as environment variables and run:

```bash
FIDELITY_USERNAME=your@email.com FIDELITY_PASSWORD=yourpassword node cli.js
```

Or create a local `.env` file:

```bash
cp .env.example .env
```

Then edit `.env`:

```dotenv
FIDELITY_USERNAME=your@email.com
FIDELITY_PASSWORD=yourpassword
```

The CLI loads `.env` from the current working directory, falling back to this package directory.

CSV content is written to **stdout**. The saved file path is written to **stderr**.
Saved files are named with the Pacific date, for example `fidelity-positions-2026-05-07.csv`. If a file already exists for that date, the exporter keeps both by adding a suffix like `-2`.

```bash
# Save to a specific directory
node cli.js --out ./downloads

# Run with a visible browser (useful when MFA requires interaction)
node cli.js --visible

# Log in manually in a visible browser instead of providing credentials
node cli.js --visible --manual-login

# Set a custom timeout (milliseconds)
node cli.js --timeout 120000

# Load credentials from a specific env file
node cli.js --env-file /path/to/fidelity.env

# Use installed Chrome with your macOS Default profile
node cli.js --browser-channel chrome --user-data-dir "~/Library/Application Support/Google/Chrome" --profile-directory Default

# Pipe CSV output to another command
FIDELITY_USERNAME=... FIDELITY_PASSWORD=... node cli.js | csvkit ...
```

#### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--out <dir>` | Directory to save the CSV file | System temp directory |
| `--visible` | Show the browser window | Headless (hidden) |
| `--timeout <ms>` | Timeout for page interactions | `60000` |
| `--env-file <path>` | Path to a `.env` file with Fidelity credentials | Auto-detect `.env` |
| `--manual-login` | Wait for you to log in manually in a visible browser | Disabled |
| `--keep-open` | Leave the browser open after completion | Disabled |
| `--debug` | Print full stack traces and save a screenshot on failure | Disabled |
| `--browser-channel <channel>` | Playwright browser channel to use, such as `chrome` | Playwright's bundled browser |
| `--user-data-dir <path>` | Persistent browser user data directory | `~/.config/fidelity-exporter/session` |
| `--profile-directory <name>` | Chrome profile directory inside the user data directory | Browser default |
| `--help`, `-h` | Show usage | — |

#### Environment Variables

| Variable | Description |
|----------|-------------|
| `FIDELITY_USERNAME` | Your Fidelity username or email |
| `FIDELITY_PASSWORD` | Your Fidelity password |
| `FIDELITY_BROWSER_CHANNEL` | Browser channel to launch, such as `chrome` |
| `FIDELITY_USER_DATA_DIR` | Persistent browser user data directory. `~` is supported |
| `FIDELITY_PROFILE_DIRECTORY` | Chrome profile directory inside `FIDELITY_USER_DATA_DIR`, such as `Default` |
| `DEBUG` | Set to `1` to print full stack traces and save screenshots on errors |

### Programmatic API

```javascript
const { exportPositions } = require('./index');

const result = await exportPositions({
  envFile: './.env',
  downloadDir: './downloads', // optional
  headless: true,             // optional, default: true
  timeout: 60000,             // optional, default: 60000ms
  browserChannel: 'chrome',   // optional
  userDataDir: '~/Library/Application Support/Google/Chrome',
  profileDirectory: 'Default'
});

console.log(result.filePath); // '/path/to/positions.csv'
console.log(result.content);  // raw CSV string
```

You can also use the class directly:

```javascript
const { FidelityExporter } = require('./index');

const exporter = new FidelityExporter({
  username: 'your@email.com',
  password: 'yourpassword',
  downloadDir: './downloads'
});

const result = await exporter.exportPositions();
```

#### `ExportOptions`

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `username` | `string` | No | Fidelity username. Required unless provided by environment / `.env` or using manual login |
| `password` | `string` | No | Fidelity password. Required unless provided by environment / `.env` or using manual login |
| `envFile` | `string` | No | Path to a `.env` file. Explicit `username` / `password` options still take precedence |
| `downloadDir` | `string` | No | Directory to save the CSV |
| `headless` | `boolean` | No | Run browser headlessly (default: `true`) |
| `timeout` | `number` | No | Timeout in ms (default: `60000`) |
| `browserChannel` | `string` | No | Playwright browser channel, for example `chrome` |
| `userDataDir` | `string` | No | Persistent browser user data directory |
| `profileDirectory` | `string` | No | Chrome profile directory inside `userDataDir` |

#### `ExportResult`

| Property | Type | Description |
|----------|------|-------------|
| `filePath` | `string` | Absolute path to the saved CSV file |
| `content` | `string` | Raw CSV content as a string |

## MFA / Two-Factor Authentication

If your account has MFA enabled, run with `--visible` so the browser window is shown. The tool will pause at the OTP prompt and wait for you to enter the code manually in the browser.

```bash
FIDELITY_USERNAME=... FIDELITY_PASSWORD=... node cli.js --visible
```

If you do not want to provide credentials to the process, use manual login:

```bash
node cli.js --visible --manual-login
```

## Notes

- This tool automates a real browser session — it is subject to Fidelity's terms of service. Use responsibly and only for your own account.
- Fidelity's frontend can change without notice, which may break selectors. If the download button is not found, the selector chain in `ExportPositionsAction.js` may need updating.
- Credentials are never written to disk. Always pass them via environment variables.

## License

ISC
