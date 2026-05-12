'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('os');
const path = require('node:path');

const { FidelityExporter, exportPositions } = require('../index');
const { FidelityAction } = require('../actions/FidelityAction');
const { FidelityAuthManager } = require('../core/FidelityAuthManager');
const { loadFidelityConfig } = require('../core/FidelityCredentials');

test('module exports the class and convenience exportPositions function', () => {
  assert.equal(typeof FidelityExporter, 'function');
  assert.equal(typeof exportPositions, 'function');
});

test('exporter normalizes download directory defaults', () => {
  const defaultExporter = new FidelityExporter();
  assert.equal(defaultExporter.options.downloadDir, os.tmpdir());
  assert.equal(defaultExporter.options.closeOnFinish, true);

  const customExporter = new FidelityExporter({ outDir: '/tmp/fidelity-custom' });
  assert.equal(customExporter.options.downloadDir, '/tmp/fidelity-custom');
});

test('credentials can be loaded from an explicit .env file', () => {
  const previousUsername = process.env.FIDELITY_USERNAME;
  const previousPassword = process.env.FIDELITY_PASSWORD;
  const previousBrowserChannel = process.env.FIDELITY_BROWSER_CHANNEL;
  const previousUserDataDir = process.env.FIDELITY_USER_DATA_DIR;
  const previousProfileDirectory = process.env.FIDELITY_PROFILE_DIRECTORY;
  delete process.env.FIDELITY_USERNAME;
  delete process.env.FIDELITY_PASSWORD;
  delete process.env.FIDELITY_BROWSER_CHANNEL;
  delete process.env.FIDELITY_USER_DATA_DIR;
  delete process.env.FIDELITY_PROFILE_DIRECTORY;

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fidelity-env-test-'));
  const envFile = path.join(dir, '.env');
  fs.writeFileSync(envFile, [
    'FIDELITY_USERNAME=env-user',
    'FIDELITY_PASSWORD=env-pass',
    'FIDELITY_BROWSER_CHANNEL=chrome',
    'FIDELITY_USER_DATA_DIR=~/Library/Application Support/Google/Chrome',
    'FIDELITY_PROFILE_DIRECTORY=Default',
    ''
  ].join('\n'), 'utf8');

  try {
    const config = loadFidelityConfig({ envFile });
    assert.equal(config.loaded, true);
    assert.equal(config.envFilePath, envFile);
    assert.equal(config.username, 'env-user');
    assert.equal(config.password, 'env-pass');
    assert.equal(config.browserChannel, 'chrome');
    assert.equal(config.userDataDir, path.join(os.homedir(), 'Library/Application Support/Google/Chrome'));
    assert.equal(config.profileDirectory, 'Default');

    const exporter = new FidelityExporter({ envFile });
    assert.equal(exporter.options.username, 'env-user');
    assert.equal(exporter.options.password, 'env-pass');
    assert.equal(exporter.options.browserChannel, 'chrome');
    assert.equal(exporter.options.userDataDir, path.join(os.homedir(), 'Library/Application Support/Google/Chrome'));
    assert.equal(exporter.options.profileDirectory, 'Default');
  } finally {
    if (previousUsername === undefined) {
      delete process.env.FIDELITY_USERNAME;
    } else {
      process.env.FIDELITY_USERNAME = previousUsername;
    }

    if (previousPassword === undefined) {
      delete process.env.FIDELITY_PASSWORD;
    } else {
      process.env.FIDELITY_PASSWORD = previousPassword;
    }

    if (previousBrowserChannel === undefined) {
      delete process.env.FIDELITY_BROWSER_CHANNEL;
    } else {
      process.env.FIDELITY_BROWSER_CHANNEL = previousBrowserChannel;
    }

    if (previousUserDataDir === undefined) {
      delete process.env.FIDELITY_USER_DATA_DIR;
    } else {
      process.env.FIDELITY_USER_DATA_DIR = previousUserDataDir;
    }

    if (previousProfileDirectory === undefined) {
      delete process.env.FIDELITY_PROFILE_DIRECTORY;
    } else {
      process.env.FIDELITY_PROFILE_DIRECTORY = previousProfileDirectory;
    }

    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('action options support both CLI outDir and programmatic downloadDir', () => {
  const cliAction = new FidelityAction({ outDir: '/tmp/fidelity-cli' });
  assert.equal(cliAction.options.downloadDir, '/tmp/fidelity-cli');

  const apiAction = new FidelityAction({ downloadDir: '/tmp/fidelity-api' });
  assert.equal(apiAction.options.downloadDir, '/tmp/fidelity-api');
});

test('download filenames include Pacific date and preserve same-day files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fidelity-download-name-test-'));
  const action = new FidelityAction({
    downloadDir: dir,
    exportFilePrefix: 'Fidelity Positions',
    exportDate: new Date('2026-05-08T01:00:00.000Z')
  });

  try {
    const firstPath = action.buildDownloadPath('Portfolio_Positions.csv');
    assert.equal(path.basename(firstPath), 'fidelity-positions-2026-05-07.csv');
    fs.writeFileSync(firstPath, 'first', 'utf8');

    const secondPath = action.buildDownloadPath('Portfolio_Positions.csv');
    assert.equal(path.basename(secondPath), 'fidelity-positions-2026-05-07-2.csv');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('isLoggedIn only treats portfolio pages as authenticated', async () => {
  const auth = new FidelityAuthManager();

  assert.equal(await auth.isLoggedIn({ url: () => 'https://digital.fidelity.com/ftgw/digital/portfolio/summary' }), true);
  assert.equal(await auth.isLoggedIn({ url: () => 'https://digital.fidelity.com/ftgw/digital/portfolio/positions' }), true);
  assert.equal(await auth.isLoggedIn({ url: () => 'https://digital.fidelity.com/prgw/digital/login/full-page?AuthRedUrl=https%3A%2F%2Fdigital.fidelity.com%2Fftgw%2Fdigital%2Fportfolio%2Fsummary' }), false);
  assert.equal(await auth.isLoggedIn({ url: () => 'https://digital.fidelity.com/prgw/digital/login/mfa' }), false);
});
