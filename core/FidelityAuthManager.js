'use strict';

/**
 * Handles the authentication flow for Fidelity, including login and MFA detection.
 */
class FidelityAuthManager {
  constructor(options = {}) {
    this.options = {
      username: options.username,
      password: options.password,
      timeout: options.timeout || 60000,
      ...options
    };
    this.loginUrl = 'https://digital.fidelity.com/prgw/digital/login/full-page';
  }

  /**
   * Orchestrates the login flow.
   * @param {import('playwright').Page} page
   */
  async authenticate(page) {
    console.error(`[AuthManager] Navigating to login page...`);
    await this.safeGoto(page, 'https://digital.fidelity.com/ftgw/digital/portfolio/summary', 'initial portfolio summary');
    await page.waitForTimeout(3000);

    if (await this.isLoggedIn(page)) {
      console.error(`[AuthManager] Already logged in via persistent session.`);
      return true;
    }

    // If not logged in, we need the actual login page
    console.error(`[AuthManager] Not authenticated. Navigating to login page...`);
    await this.safeGoto(page, this.loginUrl, 'login page');

    // Step 0: Handle "Pardon our Interruption" or other blockers
    try {
        if (page.url().includes('interruption') || await page.locator('h1:has-text("interruption")').isVisible({ timeout: 5000 }).catch(() => false)) {
            console.error(`[AuthManager] Blocked by "Pardon our Interruption". Attempting to click through...`);
            // Sometimes there is a checkbox or button. We just wait or try to reload.
            await page.reload({ waitUntil: 'commit', timeout: 30000 }).catch((err) => {
              console.error(`[AuthManager] Interruption reload warning: ${err.message}`);
            });
        }
    } catch (e) {}

    const canAutoLogin = Boolean(this.options.username && this.options.password && !this.options.manualLogin);
    if (!canAutoLogin) {
      if (this.options.headless) {
        throw new Error('Credentials are required in headless mode. Provide FIDELITY_USERNAME/FIDELITY_PASSWORD or re-run with --visible --manual-login.');
      }

      console.error(`[AuthManager] Waiting for manual login in the browser window...`);
      await this.handleAuthState(page, { manual: true });
      return true;
    }

    // Step 1: Detect and Fill Login Form
    try {
        const userSelectors = [
          '#userId-input',
          '#dom-username-input',
          '#username',
          'input[name="userId"]',
          'input[name="username"]',
          'input[autocomplete="username"]',
          'input[id*="userId" i]:not([type="checkbox"])',
          'input[id*="username" i]:not([type="checkbox"])'
        ];
        const passSelectors = [
          '#password',
          '#dom-pswd-input',
          'input[name="password"]',
          'input[autocomplete="current-password"]',
          'input[id*="password" i]',
          'input[type="password"]'
        ];
        const loginBtnSelectors = ['#login-button', 'button[type="submit"]', '#dom-login-button', 'button:has-text("Log In")'];

        console.error(`[AuthManager] Looking for login form...`);
        
        // Sometimes the login is in an iframe or just takes forever to mount
        await page.waitForTimeout(5000); 

        // Let's check for frames if we can't find it in the main page
        let target = page;
        const frames = page.frames();
        for (const frame of frames) {
            const hasUser = await frame.locator(userSelectors.join(',')).first().isVisible().catch(() => false);
            if (hasUser) {
                console.error(`[AuthManager] Found login fields in iframe: ${frame.url()}`);
                target = frame;
                break;
            }
        }

        let loginBtn;
        const userField = await this.findVisibleTextInput(target, userSelectors, 'username');
        const passField = await this.findVisibleTextInput(target, passSelectors, 'password');

        for (const s of loginBtnSelectors) {
            const el = target.locator(s).first();
            if (await el.isVisible().catch(() => false)) {
                loginBtn = el;
                console.error(`[AuthManager] Found login button: ${s}`);
                break;
            }
        }

        if (userField && passField) {
            console.error(`[AuthManager] Filling credentials...`);
            await userField.focus();
            await userField.fill(this.options.username);
            
            await page.waitForTimeout(500);
            
            await passField.focus();
            await passField.fill(this.options.password);
            
            await page.waitForTimeout(1000);
            
            if (loginBtn) {
                await loginBtn.click();
            } else {
                if (target.keyboard) {
                  await target.keyboard.press('Enter');
                } else {
                  await page.keyboard.press('Enter');
                }
            }
        } else {
            console.error(`[AuthManager] Login fields not found. Page URL: ${page.url()}`);
        }
    } catch (err) {
        console.error(`[AuthManager] Automatic form filling failed: ${err.message}`);
    }

    // Check for success or MFA
    await this.handleAuthState(page);
    return true;
  }

  async safeGoto(page, url, label) {
    try {
      await page.goto(url, { waitUntil: 'commit', timeout: 30000 });
      const loaded = await page.waitForLoadState('domcontentloaded', { timeout: 10000 })
        .then(() => true)
        .catch(() => false);

      if (!loaded) {
        await this.stopLoading(page, `${label} domcontentloaded wait`);
      }
    } catch (err) {
      if (err.message.includes('ERR_HTTP2_PROTOCOL_ERROR') || err.message.includes('Timeout')) {
        console.error(`[AuthManager] ${label} navigation warning: ${err.message}. Checking current page content...`);
        await this.stopLoading(page, `${label} navigation timeout`);
        return;
      }

      throw err;
    }
  }

  async findVisibleTextInput(target, selectors, label) {
    for (const selector of selectors) {
      const locator = target.locator(selector);
      const count = Math.min(await locator.count().catch(() => 0), 5);

      for (let index = 0; index < count; index++) {
        const candidate = locator.nth(index);
        if (!await candidate.isVisible().catch(() => false)) {
          continue;
        }

        const usable = await candidate.evaluate((node) => {
          const type = (node.getAttribute('type') || 'text').toLowerCase();
          const blockedTypes = new Set(['checkbox', 'radio', 'hidden', 'submit', 'button', 'reset']);
          return node.tagName === 'INPUT' && !blockedTypes.has(type) && !node.disabled && node.getAttribute('aria-disabled') !== 'true';
        }).catch(() => false);

        if (usable) {
          console.error(`[AuthManager] Found ${label} field: ${selector}`);
          return candidate;
        }
      }
    }

    return null;
  }

  async stopLoading(page, label) {
    try {
      const session = await page.context().newCDPSession(page);
      await session.send('Page.stopLoading');
      await session.detach();
    } catch (cdpErr) {
      await page.evaluate(() => window.stop()).catch((err) => {
        console.error(`[AuthManager] ${label} stop-loading warning: ${err.message || cdpErr.message}`);
      });
    }
  }

  /**
   * Detects if we are already authenticated by looking at the URL.
   */
  async isLoggedIn(page) {
    const url = page.url();
    try {
      const parsed = new URL(url);
      const path = parsed.pathname.toLowerCase();
      const loginLike = /login|mfa|challenge|interruption/.test(path) || /login|mfa|challenge|interruption/.test(parsed.search.toLowerCase());
      return path.includes('/portfolio/') && !loginLike;
    } catch (err) {
      return false;
    }
  }

  /**
   * Monitors the page state after login submission.
   * If MFA is detected, it pauses and waits for user intervention in headed mode.
   */
  async handleAuthState(page, stateOptions = {}) {
    const timeout = stateOptions.manual ? (this.options.manualAuthTimeout || 600_000) : this.options.timeout;
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      const url = page.url();
      const lowerUrl = url.toLowerCase();

      // Check if we reached the portfolio summary or main dash
      if (await this.isLoggedIn(page)) {
        console.error(`[AuthManager] Login successful.`);
        return;
      }

      // Check for MFA challenge
      if (lowerUrl.includes('mfa') || lowerUrl.includes('challenge') || (await page.locator(':has-text("Security Code")').isVisible().catch(() => false))) {
        console.error(`[AuthManager] !!! MFA CHALLENGE DETECTED !!!`);
        console.error(`[AuthManager] If running in headless mode, re-launch with --visible to complete the challenge.`);
        
        if (this.options.headless) {
            throw new Error('MFA challenge triggered in headless mode. Please re-run with --visible to authenticate manually.');
        }

        console.error(`[AuthManager] Waiting for user to complete MFA challenge in the browser window...`);
        // In headed mode, wait until the actual browser path reaches the portfolio app.
        await page.waitForFunction(
          () => window.location.pathname.toLowerCase().includes('/portfolio/'),
          { timeout: this.options.manualAuthTimeout || 600_000 }
        );
        return;
      }

      // Handle common interstitials ("Skip for now", "No thanks")
      const interstitialText = ['Skip for now', 'Skip', 'No thanks', 'Continue'];
      for (const text of interstitialText) {
        const btn = page.locator(`button:has-text("${text}")`).first();
        if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
            console.error(`[AuthManager] Dismissing interstitial: ${text}`);
            await btn.click().catch(() => {});
            break;
        }
      }

      await page.waitForTimeout(2000);
    }

    throw new Error('Authentication timed out waiting for dashboard.');
  }
}

module.exports = { FidelityAuthManager };
