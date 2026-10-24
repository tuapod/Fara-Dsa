// src/config.js — Central configuration for Fara DSA
const path = require('path');
const fs   = require('fs');
const os   = require('os');

const defaults = {
  DEEPSEEK_URL   : 'https://chat.deepseek.com',
  SESSION_DIR    : path.join(os.homedir(), '.fara-dsa', 'session'),
  BROWSERS_DIR   : path.join(os.homedir(), '.fara-dsa', 'browsers'), // مسیر ذخیره مرورگر
  HEADLESS       : true,

  RESPONSE_TIMEOUT : 180_000,
  STABLE_DELAY     : 2_500,
  SEND_DELAY       : 400,

  MAX_ITERATIONS   : 40,
  WORKING_DIR      : process.cwd(),

  MAX_OUTPUT_LENGTH : 8_000,
  DEBUG             : false,
};

function loadJson(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch {
    console.warn('[fara-dsa] Could not parse config file: ' + filePath);
  }
  return {};
}

const globalConfigPath  = path.join(os.homedir(), '.fara-dsa', 'config.json');
const projectConfigPath = path.join(process.cwd(), 'fara-dsa.config.json');

const config = {
  ...defaults,
  ...loadJson(globalConfigPath),
  ...loadJson(projectConfigPath),
};

delete config._comment;

if (!path.isAbsolute(config.SESSION_DIR)) {
  config.SESSION_DIR = path.resolve(process.cwd(), config.SESSION_DIR);
}
if (!path.isAbsolute(config.BROWSERS_DIR)) {
  config.BROWSERS_DIR = path.resolve(process.cwd(), config.BROWSERS_DIR);
}

// تنظیم متغیر محیطی برای Playwright تا مرورگر را در این مسیر ذخیره/بخواند
process.env.PLAYWRIGHT_BROWSERS_PATH = config.BROWSERS_DIR;

fs.mkdirSync(config.SESSION_DIR, { recursive: true });
fs.mkdirSync(config.BROWSERS_DIR, { recursive: true });
fs.mkdirSync(path.join(os.homedir(), '.fara-dsa', 'logs'), { recursive: true });

module.exports = config;