'use strict';

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

function expandHome(filePath) {
  if (!filePath || typeof filePath !== 'string') return filePath;
  if (filePath === '~') return process.env.HOME;
  if (filePath.startsWith('~/')) {
    return path.join(process.env.HOME, filePath.slice(2));
  }
  return filePath;
}

function resolveEnvFile(envFile) {
  if (envFile === false) return null;

  if (envFile) {
    return path.resolve(envFile);
  }

  const candidates = [
    path.join(process.cwd(), '.env'),
    path.join(__dirname, '..', '.env')
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function loadFidelityEnv(options = {}) {
  const envFilePath = resolveEnvFile(options.envFile);
  if (!envFilePath) {
    return { loaded: false, envFilePath: null };
  }

  const result = dotenv.config({
    path: envFilePath,
    override: options.overrideEnv === true
  });

  if (result.error) {
    throw result.error;
  }

  return { loaded: true, envFilePath };
}

function loadFidelityConfig(options = {}) {
  const env = loadFidelityEnv(options);

  return {
    ...env,
    username: options.username || process.env.FIDELITY_USERNAME,
    password: options.password || process.env.FIDELITY_PASSWORD,
    userDataDir: expandHome(options.userDataDir || process.env.FIDELITY_USER_DATA_DIR),
    browserChannel: options.browserChannel || process.env.FIDELITY_BROWSER_CHANNEL,
    profileDirectory: options.profileDirectory || process.env.FIDELITY_PROFILE_DIRECTORY
  };
}

module.exports = {
  expandHome,
  loadFidelityConfig,
  loadFidelityEnv,
  resolveEnvFile
};
