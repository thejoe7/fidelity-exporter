'use strict';

const path = require('path');
const os = require('os');
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();

chromium.use(stealth);

/**
 * Manages the Playwright browser lifecycle and persistent session data.
 */
class FidelityBrowserFactory {
  constructor(options = {}) {
    this.options = {
      userDataDir: options.userDataDir || path.join(os.homedir(), '.config', 'fidelity-exporter', 'session'),
      browserChannel: options.browserChannel,
      profileDirectory: options.profileDirectory,
      headless: options.headless !== false,
      timeout: options.timeout || 60000,
      debug: !!options.debug,
      ...options
    };
    this.browserContext = null;
  }

  /**
   * Launch a persistent browser context with stealth plugins.
   */
  async launch() {
    if (this.browserContext) return this.browserContext;

    console.error(`[FidelityBrowserFactory] Launching browser with session at: ${this.options.userDataDir}`);
    if (this.options.browserChannel) {
      console.error(`[FidelityBrowserFactory] Using browser channel: ${this.options.browserChannel}`);
    }
    if (this.options.profileDirectory) {
      console.error(`[FidelityBrowserFactory] Using Chrome profile directory: ${this.options.profileDirectory}`);
    }

    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-infobars',
      '--window-position=0,0',
      '--start-maximized',
      '--disable-http2',
    ];

    if (this.options.profileDirectory) {
      args.push(`--profile-directory=${this.options.profileDirectory}`);
    }

    this.browserContext = await chromium.launchPersistentContext(this.options.userDataDir, {
      ...(this.options.browserChannel ? { channel: this.options.browserChannel } : {}),
      headless: this.options.headless,
      acceptDownloads: true,
      viewport: null, // Let the window size be natural
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      ignoreHTTPSErrors: true,
      args,
    });

    this.browserContext.setDefaultTimeout(this.options.timeout);
    return this.browserContext;
  }

  async close() {
    if (this.browserContext) {
      await this.browserContext.close();
      this.browserContext = null;
    }
  }

  /**
   * Simple helper to get a page from the context.
   */
  async getPage() {
    const context = await this.launch();
    const pages = context.pages();
    return pages.length > 0 ? pages[0] : await context.newPage();
  }
}

module.exports = { FidelityBrowserFactory };
