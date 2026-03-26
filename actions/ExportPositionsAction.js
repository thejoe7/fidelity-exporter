'use strict';

const { FidelityAction } = require('./FidelityAction');

/**
 * Concrete action for exporting all positions/holdings.
 */
class ExportPositionsAction extends FidelityAction {
  constructor(options = {}) {
    super(options);
    this.positionsUrl = 'https://digital.fidelity.com/ftgw/digital/portfolio/positions';
    this.positionsFragment = '/positions';
  }

  /**
   * Action implementation for Export Positions.
   * @param {import('playwright').Page} page
   */
  async execute(page) {
    console.error(`[ExportPositions] Starting export positions action...`);
    
    // Step 1: Navigate to the Positions page
    try {
        console.log(`[ExportPositions] Navigating to: ${this.positionsUrl}`);
        await this.ensurePage(page, this.positionsUrl, this.positionsFragment);
    } catch (err) {
        console.error(`[ExportPositions] Navigation failed: ${err.message}. Checking if already on page...`);
        if (!page.url().includes(this.positionsFragment)) {
            throw err;
        }
    }

    // Step 2: Wait for render
    // Use a robust indicator (the summary table)
    await page.waitForFunction(
      () => {
        const body = document.body.innerText;
        return body.includes('Symbol') || body.includes('Quantity') || body.includes('positions');
      },
      { timeout: this.options.timeout }
    );
    
    // Give Angular a moment to settle the UI
    await page.waitForTimeout(2000);

    // Step 3: Trigger CSV download
    // On some views, the download is hidden inside a "More" / "Three Dots" menu.
    const menuSelectors = [
      'button:has-text("Available Actions")',
      'button:has([pvd-name*="overflow-vertical"])',
      'button:has(svg:has([href*="overflow-vertical"]))',
      'pvd-scoped-icon[pvd-name*="overflow-vertical"]',
      'button[aria-label*="More" i]',
      'button[title*="More" i]',
      '.icon-more-dots',
      'button.pos-more-btn',
    ];

    const downloadSelectors = [
      'a[pvd-link-name*="Download All Positions"]',
      'pvd-list-item:has-text("Download")',
      'button:has-text("Download")',
      'a:has-text("Download")',
      '[role="menuitem"]:has-text("Download")',
      'ap143-positions-shell button.download-icon',
      'button[aria-label*="Download" i]',
    ];

    console.error(`[ExportPositions] Searching for download button...`);

    // Try clicking a menu first if present
    for (const menuSel of menuSelectors) {
      try {
        const menuEl = page.locator(menuSel).first();
        if (await menuEl.isVisible({ timeout: 2000 }).catch(() => false)) {
          console.error(`[ExportPositions] Found a "More" menu (${menuSel}). Clicking to reveal download...`);
          // Use force click because the SVG might be inside a span that intercepts the event
          await menuEl.click({ force: true });
          // Small wait for the menu to animate open
          await page.waitForTimeout(2000);
          break;
        }
      } catch (err) {
        console.error(`[ExportPositions] Menu selector check failed: ${menuSel}. ${err.message}`);
      }
    }
    
    let lastError;
    for (const sel of downloadSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 2000 })) {
            const result = await this.triggerDownload(page, sel);
            return result;
        } else {
            console.error(`[ExportPositions] Selector not visible: ${sel}`);
        }
      } catch (err) {
        lastError = err;
        console.error(`[ExportPositions] Selector check failed: ${sel}. ${err.message}`);
      }
    }

    // Fallback: If no dedicated download button works, try getting by role
    try {
        const result = await this.triggerDownload(page, page.getByRole('button', { name: /download/i }).first());
        return result;
    } catch (err) {
        throw new Error(`Export positions failed after all attempts: ${lastError?.message || err.message}`);
    }
  }
}

module.exports = { ExportPositionsAction };
