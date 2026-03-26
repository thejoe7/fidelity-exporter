'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Base class for all Fidelity actions (ExportPositions, Statements, etc.)
 * Implements the command pattern for modularity.
 */
class FidelityAction {
  constructor(options = {}) {
    this.options = {
      downloadDir: options.outDir || process.cwd(),
      timeout: options.timeout || 60000,
      ...options
    };
  }

  /**
   * Main entry point for the specific action.
   * @param {import('playwright').Page} page
   */
  async execute(page) {
    throw new Error('Action must implement the execute method');
  }

  /**
   * Abstracted logic for navigating to the correct URL or tab in an SPA.
   */
  async ensurePage(page, targetUrl, fragment) {
    if (page.url().includes(fragment)) return;
    
    console.error(`[FidelityAction] Navigating to: ${targetUrl}`);
    // Try clicking first (better for SPAs and bypassing bot-mitigation on hard navs)
    const tabSelectors = [
      `a[href*="${fragment}"]`,
      `[role="tab"]:has-text("Positions")`,
      `a:has-text("Positions")`
    ];
    
    let clicked = false;
    for (const sel of tabSelectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
        console.error(`[FidelityAction] Found tab via: ${sel}. Clicking...`);
        await el.click();
        clicked = true;
        break;
      }
    }

    if (!clicked) {
      console.error(`[FidelityAction] No clickable tab found. Current URL: ${page.url()}`);
      
      console.error(`[FidelityAction] Attempting hard navigation to: ${targetUrl}`);
      try {
        await page.goto(targetUrl, { waitUntil: 'commit', timeout: this.options.timeout });
        console.error(`[FidelityAction] Navigation committed for ${targetUrl}. Waiting for content...`);
      } catch (err) {
        console.error(`[FidelityAction] Navigation failed: ${err.message}. Current URL is: ${page.url()}`);
      }
    }

    // Wait for the URL to change to the target or at least contain the fragment
    await page.waitForFunction((f) => window.location.href.includes(f), fragment, { timeout: 10000 }).catch(() => {
        console.error(`[FidelityAction] Navigation wait timed out. Current URL: ${page.url()}`);
    });
  }

  /**
   * Universal helper for triggering a download and capturing the file.
   */
  async triggerDownload(page, buttonSelector) {
    console.error(`[FidelityAction] Triggering download using selector: ${buttonSelector}`);
    const el = page.locator(buttonSelector).first();
    
    if (!await el.isVisible({ timeout: 10000 })) {
        throw new Error(`Download button not found or invisible: ${buttonSelector}`);
    }

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: this.options.timeout }),
      el.click(),
    ]);

    const suggestedName = download.suggestedFilename();
    const destPath = path.join(this.options.downloadDir, suggestedName || 'fidelity-export.csv');
    
    await download.saveAs(destPath);
    console.error(`[FidelityAction] Download captured: ${destPath}`);

    const content = fs.readFileSync(destPath, 'utf8');
    return { filePath: destPath, content };
  }
}

module.exports = { FidelityAction };
