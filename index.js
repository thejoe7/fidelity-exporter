'use strict';

const { FidelityBrowserFactory } = require('./core/FidelityBrowserFactory');
const { FidelityAuthManager } = require('./core/FidelityAuthManager');
const { ExportPositionsAction } = require('./actions/ExportPositionsAction');

/**
 * High-level orchestration for the Fidelity Exporter.
 * Manages the connection, auth, and action execution.
 */
class FidelityExporter {
  constructor(options = {}) {
    this.factory = new FidelityBrowserFactory(options);
    this.auth = new FidelityAuthManager(options);
    this.options = options;
  }

  /**
   * Main entry point to export positions.
   * Orchestrates the entire lifecycle.
   */
  async exportPositions() {
    const page = await this.factory.getPage();
    const action = new ExportPositionsAction(this.options);

    try {
      // Step 1: Perform authentication (with session persistence support)
      await this.auth.authenticate(page);

      // Step 2: Execute the requested action
      const result = await action.execute(page);

      return result;
    } catch (err) {
      console.error(`[FidelityExporter] Error during action execution: ${err.message}`);
      throw err;
    } finally {
      // FORCED INSPECTION: If visible, wait forever so user can see what happened
      if (this.options.visible) {
        console.error("[DEBUG] TASK FINISHED/FAILED. Browser will stay open for your inspection.");
        console.error("[DEBUG] Check the window, then use Ctrl+C in this terminal to close.");
        await new Promise(() => {}); 
      }
      
      if (this.options.closeOnFinish !== false && !this.options.visible) {
        await this.factory.close();
      }
    }
  }

  /**
   * Expose methods for future actions.
   */
  async runAction(ActionClass) {
    const page = await this.factory.getPage();
    const action = new ActionClass(this.options);

    try {
      await this.auth.authenticate(page);
      return await action.execute(page);
    } finally {
      if (this.options.closeOnFinish !== false) {
        await this.factory.close();
      }
    }
  }
}

module.exports = { FidelityExporter };
