#!/usr/bin/env node
'use strict';

const { program } = require('commander');
const { FidelityExporter } = require('./index');
require('dotenv').config();

program
  .name('fidelity-exporter')
  .description('Robust Fidelity investment account exporter')
  .version('1.0.0')
  .option('-u, --username <user>', 'Fidelity username (or set FIDELITY_USERNAME)')
  .option('-p, --password <pass>', 'Fidelity password (or set FIDELITY_PASSWORD)')
  .option('-o, --out <dir>', 'Directory to save the CSV file', process.cwd())
  .option('-v, --visible', 'Run in headed mode (useful for manual MFA)', false)
  .option('-t, --timeout <ms>', 'Operation timeout in milliseconds', '60000')
  .option('--debug', 'Save screenshot on failure to the output directory', false)
  .action(async (options) => {
    const username = options.username || process.env.FIDELITY_USERNAME;
    const password = options.password || process.env.FIDELITY_PASSWORD;

    if (!username || !password) {
      console.error('Error: username and password are required via flags or FIDELITY_USERNAME/FIDELITY_PASSWORD environment variables.');
      process.exit(1);
    }

    const exporter = new FidelityExporter({
      username,
      password,
      outDir: options.out,
      headless: !options.visible,
      visible: !!options.visible,
      timeout: parseInt(options.timeout, 10),
      debug: options.debug,
      closeOnFinish: !options.visible
    });

    try {
      console.error(`[FidelityExporter] Starting export positions action...`);
      const { filePath, content } = await exporter.exportPositions();
      
      console.error(`[FidelityExporter] Positions saved to: ${filePath}`);
      // Send result to stdout so users can pipe to another tool or grep
      process.stdout.write(content);
    } catch (err) {
      console.error(`[FidelityExporter] Export failed: ${err.message}`);
      if (options.debug) {
        console.error(err.stack);
      }
      process.exit(1);
    }
  });

program.parse(process.argv);
