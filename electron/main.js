const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const config = require('../src/config'); // باید قبل از playwright لود شود
const { chromium } = require('playwright');
const DeepSeekAgent = require('../src/agent');

let mainWindow;
let agent = null;

// ── State Management ──
const stateFile = path.join(os.homedir(), '.fara-dsa', 'state.json');

function loadState() {
  try {
    if (fs.existsSync(stateFile)) {
      return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    }
  } catch {}
  return { workingDir: null, activeChatId: null, uiState: 'empty' };
}

function saveState(updates) {
  try {
    const current = loadState();
    const next = { ...current, ...updates };
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify(next, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save state:', err);
  }
}

// ── Window Setup ──
const logFile = path.join(__dirname, 'agent-debug.log');
function log(msg) {
  const text = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(logFile, text);
  console.log(msg);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#161616',
    frame: false,
    titleBarStyle: 'hiddenInset',
    icon: path.join(__dirname, '..', 'build', 'icon.ico'), // 👈 این خط را اضافه کنید
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── Browser Check & Auto-Download ──
async function ensureBrowser() {
  const executablePath = chromium.executablePath();
  if (fs.existsSync(executablePath)) {
    return true;
  }

  return new Promise((resolve, reject) => {
    if (mainWindow) {
      mainWindow.webContents.send('download-progress', { type: 'start', message: 'Downloading Chromium Browser...' });
    }

    const nodePath = process.execPath;
    const cliPath = path.join(__dirname, '..', 'node_modules', 'playwright', 'cli.js');

    const child = spawn(nodePath, [cliPath, 'install', 'chromium'], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        PLAYWRIGHT_BROWSERS_PATH: config.BROWSERS_DIR
      }
    });

    let lastTime = Date.now();
    let lastPercent = 0;
    let speed = '';

    child.stderr.on('data', (data) => {
      const output = data.toString();
      const match = output.match(/\|\s*[^\|]+\|\s*(\d+)%\s*of\s*([\d\.]+\s*\w+)/);
      
      if (match) {
        const percent = parseInt(match[1], 10);
        const totalSize = match[2];

        const now = Date.now();
        const timeDiff = (now - lastTime) / 1000;
        
        if (timeDiff > 1 && percent > lastPercent) {
          const percentDiff = percent - lastPercent;
          speed = ` (${(percentDiff / timeDiff).toFixed(1)}%/s)`;
          lastTime = now;
          lastPercent = percent;
        }

        if (mainWindow) {
          mainWindow.webContents.send('download-progress', {
            type: 'progress',
            percent,
            totalSize,
            speed
          });
        }
      } else if (output.includes('Downloading') || output.includes('Extracting')) {
        if (mainWindow) {
          mainWindow.webContents.send('download-progress', { type: 'log', message: output.trim() });
        }
      }
    });

    child.on('close', (code) => {
      if (code === 0) {
        if (mainWindow) {
          mainWindow.webContents.send('download-progress', { type: 'done', message: 'Browser installed successfully!' });
        }
        resolve(true);
      } else {
        if (mainWindow) {
          mainWindow.webContents.send('download-progress', { type: 'error', message: 'Failed to download browser.' });
        }
        reject(new Error('Download failed'));
      }
    });
  });
}

// ── IPC ──
ipcMain.handle('load-state', () => {
  return loadState();
});

ipcMain.handle('save-state', (event, updates) => {
  saveState(updates);
  return { success: true };
});

ipcMain.handle('init-agent', async (event, chatId = null) => {
  if (agent) return { success: true, workDir: config.WORKING_DIR };
  
  try {
    await ensureBrowser();
  } catch (err) {
    return { success: false, error: 'Browser download failed: ' + err.message };
  }

  const savedState = loadState();
  
  if (savedState.workingDir && fs.existsSync(savedState.workingDir)) {
    config.WORKING_DIR = savedState.workingDir;
  }
  
  const targetChatId = chatId || savedState.activeChatId;

  try {
    agent = new DeepSeekAgent({ saveLog: true });
    
    agent.on('status', (msg) => mainWindow.webContents.send('agent-event', { type: 'status', data: msg }));
    agent.on('iteration', (data) => mainWindow.webContents.send('agent-event', { type: 'iteration', data }));
    agent.on('thinking', (text) => mainWindow.webContents.send('agent-event', { type: 'thinking', data: text }));
    agent.on('tool_call', (data) => mainWindow.webContents.send('agent-event', { type: 'tool_call', data }));
    
    agent.on('tool_result', (data) => {
      mainWindow.webContents.send('agent-event', { type: 'tool_result', data });
      if (['write_file', 'read_file'].includes(data.name) && !data.isError && data.args) {
        const filePath = data.args.path;
        if (filePath) {
          mainWindow.webContents.send('agent-event', { type: 'open_file', data: filePath });
        }
      }
    });
    
    agent.on('final', (text) => mainWindow.webContents.send('agent-event', { type: 'final', data: text }));
    agent.on('error', (err) => mainWindow.webContents.send('agent-event', { type: 'error', data: err }));
    agent.on('classification', (data) => mainWindow.webContents.send('agent-event', { type: 'classification', data }));
    
    agent.on('chat_id_updated', (id) => {
      saveState({ activeChatId: id, uiState: 'active' });
      mainWindow.webContents.send('agent-event', { type: 'chat_id_updated', data: id });
    });

    await agent.init(targetChatId);
    
    let messages = [];
    if (targetChatId) {
      messages = await agent.browser.getCurrentChatMessages();
    }

    return { 
      success: true, 
      workDir: config.WORKING_DIR, 
      uiState: savedState.uiState || 'empty',
      activeChatId: targetChatId,
      messages
    };
  } catch (err) {
    log(`Init Error: ${err.message}`);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-chat-history', async () => {
  if (!agent) return { success: false, error: 'Agent not initialized' };
  try {
    const chats = await agent.browser.getChatHistory();
    return { success: true, chats };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('load-chat', async (event, chatId) => {
  if (!agent) return { success: false, error: 'Agent not initialized' };
  try {
    await agent.browser.navigateToChat(chatId);
    const messages = await agent.browser.getCurrentChatMessages();
    return { success: true, messages };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('new-chat', async () => {
  if (!agent) return { success: false, error: 'Agent not initialized' };
  try {
    await agent.browser.newChat();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('delete-chat', async (event, chatId) => {
  if (!agent) return { success: false, error: 'Agent not initialized' };
  try {
    await agent.browser.deleteChat(chatId);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.on('run-task', async (event, task) => {
  if (!agent) return;
  try { await agent.run(task); } catch (err) { log(`Run Error: ${err.message}`); }
});

ipcMain.on('stop-task', () => {
  if (agent) agent.stop();
});

ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(config.WORKING_DIR, filePath);
    if (!fs.existsSync(fullPath)) return { error: 'File not found' };
    const content = fs.readFileSync(fullPath, 'utf8');
    return { content, path: filePath };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('get-files', async () => {
  try {
    function walk(dir, base) {
      let results = [];
      if (!fs.existsSync(dir)) return [];
      const list = fs.readdirSync(dir);
      for (const file of list) {
        if (['node_modules', '.git', 'dist', '.next'].includes(file)) continue;
        const full = path.join(dir, file);
        const rel = path.relative(base, full);
        if (fs.statSync(full).isDirectory()) {
          results.push({ name: file, path: rel, isDir: true, children: walk(full, base) });
        } else {
          results.push({ name: file, path: rel, isDir: false });
        }
      }
      return results;
    }
    return walk(config.WORKING_DIR, config.WORKING_DIR);
  } catch { return []; }
});

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'انتخاب پوشه پروژه',
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const newPath = result.filePaths[0];
    config.WORKING_DIR = newPath;
    saveState({ workingDir: newPath });
    return { success: true, path: newPath };
  }
  return { success: false };
});

ipcMain.on('window-min', () => mainWindow.minimize());
ipcMain.on('window-max', () => {
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on('window-close', () => mainWindow.close());