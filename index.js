'use strict';

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const FIDELITY_LOGIN_URL = 'https://digital.fidelity.com/prgw/digital/login/full-page';
const FIDELITY_POSITIONS_URL = 'https://digital.fidelity.com/ftgw/digital/portfolio/positions';

/**
 * @typedef {Object} ExportOptions
 * @property {string} username - Fidelity username
 * @property {string} password - Fidelity password
 * @property {string} [downloadDir] - Directory to save the CSV (default: cwd)
 * @property {boolean} [headless] - Run browser headlessly (default: true)
 * @property {number} [timeout] - Navigation/action timeout in ms (default: 60000)
 */

/**
 * @typedef {Object} ExportResult
 * @property {string} filePath - Absolute path to the downloaded CSV
 * @property {string} content - Raw CSV content as a string
 */

/**
 * Logs into Fidelity and downloads the positions CSV from the Positions tab.
 *
 * @param {ExportOptions} options
 * @returns {Promise<ExportResult>}
 */
async function exportPositions(options) {
  const {
    username,
    password,
    downloadDir = process.cwd(),
    headless = true,
    timeout = 60_000,
  } = options;

  if (!username || !password) {
    throw new Error('username and password are required');
  }

  fs.mkdirSync(downloadDir, { recursive: true });

  const browser = await chromium.launch({
    headless,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  try {
    const context = await browser.newContext({
      acceptDownloads: true,
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 900 },
    });

    const page = await context.newPage();
    page.setDefaultTimeout(timeout);

    // ── Step 1: Navigate to login page ────────────────────────────────────────
    await page.goto(FIDELITY_LOGIN_URL, { waitUntil: 'domcontentloaded' });

    // ── Step 2: Fill username ─────────────────────────────────────────────────
    await page.locator('#userId-input').fill(username);
    await page.locator('#userId-input').press('Tab');

    // ── Step 3: Fill password ─────────────────────────────────────────────────
    await page.locator('#password').fill(password);

    // ── Step 4: Submit login ──────────────────────────────────────────────────
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout }),
      page.locator('#fs-login-button').click(),
    ]);

    // ── Step 5: Handle MFA / security challenges if present ───────────────────
    await handlePostLoginChallenges(page, timeout);

    // ── Step 6: Navigate to Positions tab ────────────────────────────────────
    await page.goto(FIDELITY_POSITIONS_URL, { waitUntil: 'domcontentloaded' });

    // Wait for the positions table to be present
    await page.waitForSelector(
      'ap143-positions-shell, [data-testid="positions-table"], .account-selector--tab-group',
      { timeout }
    );

    // Small stabilization pause after page load
    await page.waitForTimeout(2000);

    // ── Step 7: Click the Download button and capture the file ───────────────
    const download = await triggerDownload(page, timeout);

    const suggestedName = download.suggestedFilename();
    const destPath = path.join(downloadDir, suggestedName || 'positions.csv');

    await download.saveAs(destPath);

    const content = fs.readFileSync(destPath, 'utf8');
    return { filePath: destPath, content };
  } finally {
    await browser.close();
  }
}

/**
 * Waits for and dismisses any post-login interstitials Fidelity may show:
 * - SMS / TOTP two-factor prompts
 * - "Don't ask again on this device" modals
 * - Splash / marketing pages
 *
 * If MFA is required this function will wait up to `timeout` ms for the user
 * to complete the challenge (only relevant when headless=false).
 *
 * @param {import('playwright').Page} page
 * @param {number} timeout
 */
async function handlePostLoginChallenges(page, timeout) {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const url = page.url();

    // Reached the portfolio / positions area — we're in.
    if (url.includes('digital.fidelity.com/ftgw') || url.includes('digital.fidelity.com/prgw/digital/portfolio')) {
      return;
    }

    // "Remember this device" / "Don't show again" button
    const skipBtn = page.locator('button:has-text("Skip"), button:has-text("No thanks"), button:has-text("Not now")').first();
    if (await skipBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await skipBtn.click();
      await page.waitForTimeout(1000);
      continue;
    }

    // OTP / verification code input — pause and let the user handle it if
    // headless=false; if headless=true, surface a clear error.
    const otpInput = page.locator('input[name="otpCode"], input[id*="otpCode"], input[placeholder*="code" i]').first();
    if (await otpInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      if (await page.evaluate(() => document.querySelector('body') !== null)) {
        // Wait for the page to advance on its own (user may complete OTP in headed mode)
        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: Math.min(120_000, deadline - Date.now()) });
        continue;
      }
    }

    // Generic "Continue" button on splash / marketing interstitials
    const continueBtn = page.locator('button:has-text("Continue"), a:has-text("Continue")').first();
    if (await continueBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await continueBtn.click();
      await page.waitForTimeout(1000);
      continue;
    }

    // Nothing matched — wait a moment then re-check
    await page.waitForTimeout(1500);
  }
}

/**
 * Finds and clicks the Download (CSV) button on the Positions page, waits for
 * the browser download event, and returns the Playwright Download handle.
 *
 * @param {import('playwright').Page} page
 * @param {number} timeout
 * @returns {Promise<import('playwright').Download>}
 */
async function triggerDownload(page, timeout) {
  // Fidelity renders a download icon/button — try several known selectors in order.
  const downloadSelectors = [
    // Icon button with a "Download" aria-label
    'button[aria-label*="Download" i]',
    // SVG icon button inside the positions header bar
    'ap143-positions-shell button.download-icon',
    // Fallback: any button whose text contains "download"
    'button:has-text("Download")',
    // Positions page top-bar action icons (Fidelity uses pvd3-icon components)
    'pvd3-icon[name="download"]',
    '[data-testid="download-button"]',
  ];

  let downloadBtn = null;
  for (const sel of downloadSelectors) {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
      downloadBtn = el;
      break;
    }
  }

  if (!downloadBtn) {
    // Last resort: look for any element whose accessible name mentions download
    downloadBtn = page.getByRole('button', { name: /download/i }).first();
    const visible = await downloadBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (!visible) {
      throw new Error(
        'Could not locate the Download button on the Positions page. ' +
        'Fidelity may have changed its UI. Try running with headless:false to inspect.'
      );
    }
  }

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout }),
    downloadBtn.click(),
  ]);

  return download;
}

module.exports = { exportPositions };
