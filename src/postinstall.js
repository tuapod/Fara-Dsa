// src/postinstall.js — Runs after `npm install -g deepseek-browser-agent`
'use strict';

const { execSync } = require('child_process');
const path         = require('path');
const os           = require('os');
const fs           = require('fs');

if (process.env.CI || process.env.SKIP_PLAYWRIGHT_INSTALL) {
  console.log('[deepseek-agent] Skipping Playwright browser install (CI detected).');
  process.exit(0);
}

console.log('');
console.log('╔══════════════════════════════════════════════════╗');
console.log('║   🤖  DeepSeek Browser Agent — Setup             ║');
console.log('╚══════════════════════════════════════════════════╝');
console.log('');
console.log('  Downloading Playwright Chromium browser...');
console.log('  (This only happens once — ~150 MB)\n');

try {
  const browsersDir = path.join(os.homedir(), '.fara-dsa', 'browsers');
  fs.mkdirSync(browsersDir, { recursive: true });

  const playwrightBin = path.join(__dirname, '..', 'node_modules', '.bin', 'playwright');

  execSync(`"${playwrightBin}" install chromium`, {
    stdio : 'inherit',
    env   : { 
      ...process.env,
      PLAYWRIGHT_BROWSERS_PATH: browsersDir 
    },
  });

  console.log('');
  console.log('  ✓ Browser installed successfully!');
  console.log('');
  console.log('  Get started:');
  console.log('    deepseek-agent --interactive');
  console.log('    deepseek-agent "build a REST API in Express"');
  console.log('');
} catch (err) {
  console.warn('');
  console.warn('  ⚠  Could not auto-install Chromium.');
  console.warn('  Run this manually to complete setup:');
  console.warn('');
  console.warn('    npx playwright install chromium');
  console.warn('');
}