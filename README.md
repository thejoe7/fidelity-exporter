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

CSV content is written to **stdout**. The saved file path is written to **stderr**.

```bash
# Save to a specific directory
node cli.js --out ./downloads

# Run with a visible browser (useful when MFA requires interaction)
node cli.js --visible

# Set a custom timeout (milliseconds)
node cli.js --timeout 120000

# Pipe CSV output to another command
FIDELITY_USERNAME=... FIDELITY_PASSWORD=... node cli.js | csvkit ...
```

#### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--out <dir>` | Directory to save the CSV file | System temp directory |
| `--visible` | Show the browser window | Headless (hidden) |
| `--timeout <ms>` | Timeout for page interactions | `60000` |
| `--help`, `-h` | Show usage | — |

#### Environment Variables

| Variable | Description |
|----------|-------------|
| `FIDELITY_USERNAME` | Your Fidelity username or email |
| `FIDELITY_PASSWORD` | Your Fidelity password |
| `DEBUG` | Set to `1` to print full stack traces on errors |

### Programmatic API

```javascript
const { exportPositions } = require('./index');

const result = await exportPositions({
  username: 'your@email.com',
  password: 'yourpassword',
  downloadDir: './downloads', // optional
  headless: true,             // optional, default: true
  timeout: 60000              // optional, default: 60000ms
});

console.log(result.filePath); // '/path/to/positions.csv'
console.log(result.content);  // raw CSV string
```

#### `ExportOptions`

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `username` | `string` | Yes | Fidelity username |
| `password` | `string` | Yes | Fidelity password |
| `downloadDir` | `string` | No | Directory to save the CSV |
| `headless` | `boolean` | No | Run browser headlessly (default: `true`) |
| `timeout` | `number` | No | Timeout in ms (default: `60000`) |

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

## Notes

- This tool automates a real browser session — it is subject to Fidelity's terms of service. Use responsibly and only for your own account.
- Fidelity's frontend can change without notice, which may break selectors. If the download button is not found, the selector chain in `triggerDownload()` in `index.js` may need updating.
- Credentials are never written to disk. Always pass them via environment variables.

## License

ISC
