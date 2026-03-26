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
    try {
      await page.goto('https://digital.fidelity.com/ftgw/digital/portfolio/summary', { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (err) {
      if (err.message.includes('ERR_HTTP2_PROTOCOL_ERROR') || err.message.includes('Timeout')) {
        console.error(`[AuthManager] Initial navigation hit issues (${err.message}). Checking current page content...`);
      }
    }

    if (await this.isLoggedIn(page)) {
      console.error(`[AuthManager] Already logged in via persistent session.`);
      return true;
    }

    // If not logged in, we need the actual login page
    console.error(`[AuthManager] Not authenticated. Navigating to login page...`);
    await page.goto(this.loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(e => {
        console.error(`[AuthManager] Login page navigation warning: ${e.message}`);
    });

    // Step 0: Handle "Pardon our Interruption" or other blockers
    try {
        if (page.url().includes('interruption') || await page.locator('h1:has-text("interruption")').isVisible({ timeout: 5000 }).catch(() => false)) {
            console.error(`[AuthManager] Blocked by "Pardon our Interruption". Attempting to click through...`);
            // Sometimes there is a checkbox or button. We just wait or try to reload.
            await page.reload({ waitUntil: 'domcontentloaded' });
        }
    } catch (e) {}

    // Step 1: Detect and Fill Login Form
    try {
        const userSelectors = ['#userId-input', '#username', '#dom-username-input', 'input[name="userId"]', 'input[id*="username"]'];
        const passSelectors = ['#password', '#dom-pswd-input', 'input[name="password"]', 'input[id*="password"]'];
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

        let userField, passField, loginBtn;

        for (const s of userSelectors) {
            const el = target.locator(s).first();
            if (await el.isVisible().catch(() => false)) {
                userField = el;
                console.error(`[AuthManager] Found username field: ${s}`);
                break;
            }
        }

        for (const s of passSelectors) {
            const el = target.locator(s).first();
            if (await el.isVisible().catch(() => false)) {
                passField = el;
                console.error(`[AuthManager] Found password field: ${s}`);
                break;
            }
        }

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
            await userField.click();
            await userField.fill(''); // Clear first
            await userField.type(this.options.username, { delay: 100 });
            
            await page.waitForTimeout(500);
            
            await passField.focus();
            await passField.click();
            await passField.fill('');
            await passField.type(this.options.password, { delay: 100 });
            
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

  /**
   * Detects if we are already authenticated by looking at the URL.
   */
  async isLoggedIn(page) {
    const url = page.url();
    return url.includes('portfolio') || (url.includes('summary') && !url.includes('login'));
  }

  /**
   * Monitors the page state after login submission.
   * If MFA is detected, it pauses and waits for user intervention in headed mode.
   */
  async handleAuthState(page) {
    const deadline = Date.now() + this.options.timeout;

    while (Date.now() < deadline) {
      const url = page.url();

      // Check if we reached the portfolio summary or main dash
      if (url.includes('portfolio/summary') || url.includes('portfolio/positions') || url.includes('portfolio/summary/all-accounts')) {
        console.error(`[AuthManager] Login successful.`);
        return;
      }

      // Check for MFA challenge
      if (url.includes('mfa') || url.includes('challenge') || (await page.locator(':has-text("Security Code")').isVisible().catch(() => false))) {
        console.error(`[AuthManager] !!! MFA CHALLENGE DETECTED !!!`);
        console.error(`[AuthManager] If running in headless mode, re-launch with --visible to complete the challenge.`);
        
        if (this.options.headless) {
            throw new Error('MFA challenge triggered in headless mode. Please re-run with --visible to authenticate manually.');
        }

        console.error(`[AuthManager] Waiting for user to complete MFA challenge in the browser window...`);
        // In headed mode, we just wait until the user finishes and reaches the dashboard.
        await page.waitForURL('**/portfolio/**', { timeout: 300_000 });
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
