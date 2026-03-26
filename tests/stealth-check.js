'use strict';

const { FidelityBrowserFactory } = require('../core/FidelityBrowserFactory');

/**
 * Basic stealth check against a bot-detection site.
 * Used for smoke-testing the setup before hitting real financial infrastructure.
 */
async function runStealthCheck() {
  const factory = new FidelityBrowserFactory({
    headless: true, // Test in headless mode specifically
    debug: true
  });

  try {
    const page = await factory.getPage();
    const testUrl = 'https://bot.sannysoft.com';

    console.log(`[StealthCheck] Navigating to: ${testUrl}`);
    await page.goto(testUrl, { waitUntil: 'load' });
    
    // Capture a screenshot for visual confirmation
    const screenshotPath = '/tmp/stealth-check.png';
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`[StealthCheck] Screenshot captured: ${screenshotPath}`);

    // Check specific detection fields
    const results = await page.evaluate(() => {
      const getStatus = (id) => document.getElementById(id)?.innerText || 'MISSING';
      return {
        userAgent: getStatus('user-agent'),
        webdriver: getStatus('webdriver'),
        chrome: getStatus('chrome'),
        permissions: getStatus('permissions'),
        plugins: getStatus('plugins'),
        languages: getStatus('languages'),
        webgl: getStatus('webgl-vendor'),
        hairline: getStatus('hairline'),
        brokenImage: getStatus('broken-image')
      };
    });

    console.log('[StealthCheck] Results:');
    console.table(results);

    const passed = results.webdriver.toLowerCase().includes('fail'); // 'fail' means it didn't detect webdriver
    if (passed) {
      console.log('[StealthCheck] Result: SUCCESS (Detection avoided)');
    } else {
      console.warn('[StealthCheck] Result: WARNING (Bot detected or partial success)');
    }
    
    // Cleanup
    await factory.close();

  } catch (err) {
    console.error(`[StealthCheck] FATAL ERROR: ${err.message}`);
    process.exit(1);
  }
}

runStealthCheck();
