#!/usr/bin/env node
'use strict';

const { program } = require('commander');
const os = require('os');
const { FidelityExporter } = require('./index');
const { loadFidelityConfig } = require('./core/FidelityCredentials');

function envFlag(name) {
  return /^(1|true|yes)$/i.test(process.env[name] || '');
}

program
  .name('fidelity-exporter')
  .description('Robust Fidelity investment account exporter')
  .version('1.0.0')
  .option('-o, --out <dir>', 'Directory to save the CSV file', os.tmpdir())
  .option('-v, --visible', 'Run in headed mode (useful for manual MFA)', false)
  .option('-t, --timeout <ms>', 'Operation timeout in milliseconds', '60000')
  .option('--env-file <path>', 'Path to a .env file with Fidelity credentials')
  .option('--manual-login', 'Open a visible browser and wait for you to log in manually', false)
  .option('--keep-open', 'Leave the browser open after completion for inspection', false)
  .option('--debug', 'Print stack traces and save a screenshot on failure', false)
  .option('--browser-channel <channel>', 'Playwright browser channel to use, such as "chrome"')
  .option('--user-data-dir <path>', 'Persistent browser user data directory')
  .option('--profile-directory <name>', 'Chrome profile directory inside the user data directory, such as "Default"')
  .action(async (options) => {
    let config;
    try {
      config = loadFidelityConfig({ envFile: options.envFile });
    } catch (err) {
      console.error(`[FidelityExporter] Failed to load .env file: ${err.message}`);
      process.exit(1);
    }

    const username = config.username;
    const password = config.password;
    const debug = Boolean(options.debug || envFlag('DEBUG'));
    const timeout = parseInt(options.timeout, 10);
    const manualLogin = Boolean(options.manualLogin || (options.visible && (!username || !password)));

    if (!Number.isFinite(timeout) || timeout <= 0) {
      console.error('Error: --timeout must be a positive number of milliseconds.');
      process.exit(1);
    }

    if (manualLogin && !options.visible) {
      console.error('Error: --manual-login requires --visible so you can complete the login in the browser.');
      process.exit(1);
    }

    if ((!username || !password) && !manualLogin) {
      console.error('Error: FIDELITY_USERNAME and FIDELITY_PASSWORD are required unless you run with --visible --manual-login.');
      process.exit(1);
    }

    const exporter = new FidelityExporter({
      username,
      password,
      downloadDir: options.out,
      envFile: options.envFile,
      headless: !options.visible,
      visible: !!options.visible,
      timeout,
      browserChannel: options.browserChannel || config.browserChannel,
      userDataDir: options.userDataDir || config.userDataDir,
      profileDirectory: options.profileDirectory || config.profileDirectory,
      manualLogin,
      manualAuthTimeout: 600000,
      debug,
      keepOpen: !!options.keepOpen,
      closeOnFinish: !options.keepOpen
    });

    try {
      console.error(`[FidelityExporter] Starting export positions action...`);
      const { filePath, content } = await exporter.exportPositions();
      
      console.error(`[FidelityExporter] Positions saved to: ${filePath}`);
      // Send result to stdout so users can pipe to another tool or grep
      process.stdout.write(content);
    } catch (err) {
      console.error(`[FidelityExporter] Export failed: ${err.message}`);
      if (debug) {
        console.error(err.stack);
      }
      process.exit(1);
    }
  });

program.parse(process.argv);
