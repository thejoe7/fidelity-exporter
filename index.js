'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { FidelityBrowserFactory } = require('./core/FidelityBrowserFactory');
const { FidelityAuthManager } = require('./core/FidelityAuthManager');
const { loadFidelityConfig } = require('./core/FidelityCredentials');
const { ExportPositionsAction } = require('./actions/ExportPositionsAction');

/**
 * High-level orchestration for the Fidelity Exporter.
 * Manages the connection, auth, and action execution.
 */
class FidelityExporter {
  constructor(options = {}) {
    const credentials = loadFidelityConfig(options);
    const downloadDir = options.downloadDir || options.outDir || os.tmpdir();
    this.options = {
      timeout: 60000,
      closeOnFinish: true,
      ...options,
      username: credentials.username,
      password: credentials.password,
      downloadDir,
      outDir: options.outDir || downloadDir,
      userDataDir: options.userDataDir || credentials.userDataDir,
      browserChannel: options.browserChannel || credentials.browserChannel,
      profileDirectory: options.profileDirectory || credentials.profileDirectory,
      envFilePath: credentials.envFilePath
    };
    this.factory = new FidelityBrowserFactory(this.options);
    this.auth = new FidelityAuthManager(this.options);
  }

  /**
   * Main entry point to export positions.
   * Orchestrates the entire lifecycle.
   */
  async exportPositions() {
    let page;

    try {
      page = await this.factory.getPage();
      const action = new ExportPositionsAction(this.options);

      // Step 1: Perform authentication (with session persistence support)
      await this.auth.authenticate(page);

      // Step 2: Execute the requested action
      const result = await action.execute(page);

      return result;
    } catch (err) {
      await this.captureDebugScreenshot(page).catch((screenshotErr) => {
        console.error(`[FidelityExporter] Failed to save debug screenshot: ${screenshotErr.message}`);
      });
      console.error(`[FidelityExporter] Error during action execution: ${err.message}`);
      throw err;
    } finally {
      if (this.options.keepOpen) {
        console.error('[FidelityExporter] Browser will stay open for inspection. Use Ctrl+C in this terminal to close it.');
        await new Promise(() => {}); 
      }
      
      if (this.options.closeOnFinish !== false) {
        await this.factory.close();
      }
    }
  }

  /**
   * Expose methods for future actions.
   */
  async runAction(ActionClass) {
    let page;

    try {
      page = await this.factory.getPage();
      const action = new ActionClass(this.options);

      await this.auth.authenticate(page);
      return await action.execute(page);
    } catch (err) {
      await this.captureDebugScreenshot(page).catch((screenshotErr) => {
        console.error(`[FidelityExporter] Failed to save debug screenshot: ${screenshotErr.message}`);
      });
      throw err;
    } finally {
      if (this.options.keepOpen) {
        console.error('[FidelityExporter] Browser will stay open for inspection. Use Ctrl+C in this terminal to close it.');
        await new Promise(() => {});
      }

      if (this.options.closeOnFinish !== false) {
        await this.factory.close();
      }
    }
  }

  async captureDebugScreenshot(page) {
    if (!this.options.debug || !page) return;

    fs.mkdirSync(this.options.downloadDir, { recursive: true });
    const screenshotPath = path.join(this.options.downloadDir, `fidelity-exporter-error-${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.error(`[FidelityExporter] Debug screenshot saved to: ${screenshotPath}`);
  }
}

async function exportPositions(options = {}) {
  const exporter = new FidelityExporter(options);
  return exporter.exportPositions();
}

module.exports = { FidelityExporter, exportPositions };
