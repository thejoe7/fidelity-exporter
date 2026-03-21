#!/usr/bin/env node
'use strict';

/**
 * CLI wrapper for fidelity-exporter.
 *
 * Usage:
 *   node cli.js [--out <dir>] [--visible] [--timeout <ms>]
 *
 * Credentials are read from environment variables:
 *   FIDELITY_USERNAME
 *   FIDELITY_PASSWORD
 */

const { exportPositions } = require('./index');

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--out':
        opts.downloadDir = args[++i];
        break;
      case '--visible':
        opts.headless = false;
        break;
      case '--timeout':
        opts.timeout = parseInt(args[++i], 10);
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
    }
  }
  return opts;
}

function printUsage() {
  console.log(`
fidelity-exporter — download your Fidelity positions as CSV

Usage:
  FIDELITY_USERNAME=<user> FIDELITY_PASSWORD=<pass> node cli.js [options]

Options:
  --out <dir>       Directory to save the CSV file (default: current directory)
  --visible         Run with a visible browser window (useful for MFA)
  --timeout <ms>    Action/navigation timeout in milliseconds (default: 60000)
  --help, -h        Show this help text

The downloaded CSV is also printed to stdout so you can pipe it elsewhere.
`.trim());
}

async function main() {
  const cliOpts = parseArgs(process.argv);

  const username = process.env.FIDELITY_USERNAME;
  const password = process.env.FIDELITY_PASSWORD;

  if (!username || !password) {
    console.error('Error: FIDELITY_USERNAME and FIDELITY_PASSWORD environment variables are required.');
    process.exit(1);
  }

  console.error('Launching browser and logging in to Fidelity…');

  try {
    const { filePath, content } = await exportPositions({
      username,
      password,
      ...cliOpts,
    });

    console.error(`Positions saved to: ${filePath}`);
    process.stdout.write(content);
  } catch (err) {
    console.error(`Export failed: ${err.message}`);
    if (process.env.DEBUG) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

main();
