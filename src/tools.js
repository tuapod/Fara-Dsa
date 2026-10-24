// src/tools.js — All tools available to the AI agent (Windows Compatible)
'use strict';

const fs            = require('fs');
const path          = require('path');
const { execSync }  = require('child_process');
const http          = require('http');
const https         = require('https');
const config        = require('./config');

function truncate(str, max = config.MAX_OUTPUT_LENGTH) {
  if (!str) return '';
  const s = String(str);
  if (s.length <= max) return s;
  const half = Math.floor(max / 2);
  return (
    s.slice(0, half) +
    `\n\n⚠ [OUTPUT TRUNCATED — ${s.length.toLocaleString()} chars total, showing first & last ${half} chars]\n\n` +
    s.slice(-half)
  );
}

function resolve(filePath) {
  if (!filePath) return config.WORKING_DIR;
  
  // نرمال سازی اسلش‌ها برای ویندوز
  filePath = filePath.replace(/\\/g, '/');
  
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(config.WORKING_DIR, filePath);
  
  // محاسبه مسیر نسبی نسبت به پوشه اصلی
  const rel = path.relative(config.WORKING_DIR, abs);
  
  // اگر مسیر با .. شروع بشه یا absolute باشه، یعنی هوش مصنوعی میخواد از پوشه خارج بشه
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    // به زور فقط اسم فایل رو برمیداریم و داخل پوشه اصلی میسازیم
    return path.resolve(config.WORKING_DIR, path.basename(abs));
  }
  
  return abs;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

// ── Windows-friendly recursive file walker ──
function walkDir(dir, options = {}) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    if (!options.show_hidden && file.startsWith('.')) continue;
    if (['node_modules', '.git', 'dist', '.next', 'build'].includes(file)) continue;
    
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    
    if (stat && stat.isDirectory()) {
      results.push({ path: fullPath, isDirectory: true, size: stat.size });
      if (options.recursive) {
        results = results.concat(walkDir(fullPath, options));
      }
    } else {
      results.push({ path: fullPath, isDirectory: false, size: stat.size });
    }
  }
  return results;
}

const TOOLS = {
  read_file: { /* بدون تغییر */ 
    description: 'Read the full contents of a file. Optionally read specific line ranges.',
    parameters: {
      path        : { type: 'string',  required: true,  description: 'Path to the file' },
      start_line  : { type: 'number',  required: false, description: 'First line to read (1-indexed)' },
      end_line    : { type: 'number',  required: false, description: 'Last line to read (inclusive)' },
    },
    async execute({ path: filePath, start_line, end_line }) {
      const abs = resolve(filePath);
      if (!fs.existsSync(abs)) throw new Error(`File not found: ${filePath}`);
      if (fs.statSync(abs).isDirectory()) throw new Error(`${filePath} is a directory`);
      let content = fs.readFileSync(abs, 'utf8');
      if (start_line != null || end_line != null) {
        const lines = content.split('\n');
        const s = Math.max(0, (start_line || 1) - 1);
        const e = end_line != null ? end_line : lines.length;
        content = lines.slice(s, e).map((l, i) => `${s + i + 1}: ${l}`).join('\n');
        return `[${filePath} | lines ${s + 1}–${e}]\n${truncate(content)}`;
      }
      const lineCount = content.split('\n').length;
      if (lineCount <= 300) {
        return `[${filePath} | ${lineCount} lines]\n${content.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n')}`;
      }
      return `[${filePath} | ${lineCount} lines — use start_line/end_line to read sections]\n${truncate(content)}`;
    },
  },
  write_file: { /* بدون تغییر */
    description: 'Write (create or overwrite) a file with given content.',
    parameters: { path: { type: 'string', required: true }, content: { type: 'string', required: true } },
    async execute({ path: filePath, content }) {
      const abs = resolve(filePath);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content, 'utf8');
      return `✓ Wrote ${formatBytes(Buffer.byteLength(content, 'utf8'))} → ${filePath}`;
    },
  },
  append_to_file: { /* بدون تغییر */
    description: 'Append text to the end of an existing file.',
    parameters: { path: { type: 'string', required: true }, content: { type: 'string', required: true } },
    async execute({ path: filePath, content }) {
      const abs = resolve(filePath);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.appendFileSync(abs, content, 'utf8');
      return `✓ Appended to ${filePath}`;
    },
  },
  replace_in_file: { /* بدون تغییر */
    description: 'Find and replace text in a file.',
    parameters: {
      path: { type: 'string', required: true }, find: { type: 'string', required: true }, replace: { type: 'string', required: true },
      use_regex: { type: 'boolean', required: false }, all_occurrences: { type: 'boolean', required: false },
    },
    async execute({ path: filePath, find, replace, use_regex = false, all_occurrences = true }) {
      const abs = resolve(filePath);
      let content = fs.readFileSync(abs, 'utf8');
      const original = content;
      if (use_regex) {
        content = content.replace(new RegExp(find, all_occurrences ? 'g' : ''), replace);
      } else if (all_occurrences) {
        content = content.split(find).join(replace);
      } else {
        content = content.replace(find, replace);
      }
      if (content === original) return `⚠ No matches found for "${find}" in ${filePath}`;
      fs.writeFileSync(abs, content, 'utf8');
      return `✓ Replaced occurrences in ${filePath}`;
    },
  },
  delete_file: { /* بدون تغییر */
    description: 'Permanently delete a file.',
    parameters: { path: { type: 'string', required: true } },
    async execute({ path: filePath }) {
      const abs = resolve(filePath);
      if (!fs.existsSync(abs)) throw new Error(`File not found: ${filePath}`);
      fs.unlinkSync(abs);
      return `✓ Deleted ${filePath}`;
    },
  },
  
  // 👇 سازگار شده با ویندوز
  list_directory: {
    description: 'List files and folders in a directory, optionally recursive.',
    parameters: {
      path: { type: 'string', required: false }, recursive: { type: 'boolean', required: false }, show_hidden: { type: 'boolean', required: false },
    },
    async execute({ path: dirPath = '.', recursive = false, show_hidden = false }) {
      const abs = resolve(dirPath);
      if (!fs.existsSync(abs)) throw new Error(`Directory not found: ${dirPath}`);
      if (!fs.statSync(abs).isDirectory()) throw new Error(`${dirPath} is not a directory`);

      const items = walkDir(abs, { recursive, show_hidden });
      if (items.length === 0) return `(empty directory: ${dirPath})`;

      const lines = items.slice(0, 300).map(item => {
        const relPath = path.relative(abs, item.path);
        if (item.isDirectory) return `📁  ${relPath}/`;
        return `📄  ${relPath}  ${formatBytes(item.size)}`;
      });

      if (items.length > 300) lines.push(`... and ${items.length - 300} more items`);
      return `[${dirPath}] — ${items.length} items\n${lines.join('\n')}`;
    },
  },
  create_directory: { /* بدون تغییر */
    description: 'Create a directory.',
    parameters: { path: { type: 'string', required: true } },
    async execute({ path: dirPath }) {
      fs.mkdirSync(resolve(dirPath), { recursive: true });
      return `✓ Created directory: ${dirPath}`;
    },
  },
  move_file: { /* بدون تغییر */
    description: 'Move or rename a file.',
    parameters: { source: { type: 'string', required: true }, destination: { type: 'string', required: true } },
    async execute({ source, destination }) {
      const src = resolve(source); const dest = resolve(destination);
      if (!fs.existsSync(src)) throw new Error(`Source not found: ${source}`);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.renameSync(src, dest);
      return `✓ Moved: ${source} → ${destination}`;
    },
  },
  copy_file: { /* بدون تغییر */
    description: 'Copy a file.',
    parameters: { source: { type: 'string', required: true }, destination: { type: 'string', required: true } },
    async execute({ source, destination }) {
      const src = resolve(source); const dest = resolve(destination);
      if (!fs.existsSync(src)) throw new Error(`Source not found: ${source}`);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
      return `✓ Copied: ${source} → ${destination}`;
    },
  },
  get_file_info: { /* بدون تغییر */
    description: 'Get metadata about a file.',
    parameters: { path: { type: 'string', required: true } },
    async execute({ path: filePath }) {
      const abs = resolve(filePath);
      if (!fs.existsSync(abs)) throw new Error(`Not found: ${filePath}`);
      const stat = fs.statSync(abs);
      return JSON.stringify({ path: abs, type: stat.isDirectory() ? 'directory' : 'file', size_human: formatBytes(stat.size), modified: stat.mtime.toISOString() }, null, 2);
    },
  },
  run_command: { /* بدون تغییر - دستورات شل رو سیستم عامل خودش اجرا میکنه */
    description: 'Execute a shell command.',
    parameters: { command: { type: 'string', required: true }, cwd: { type: 'string', required: false }, timeout: { type: 'number', required: false } },
    async execute({ command, cwd, timeout = 60_000 }) {
      const workDir = cwd ? resolve(cwd) : config.WORKING_DIR;
      try {
        const output = execSync(command, { cwd: workDir, encoding: 'utf8', timeout, maxBuffer: 20 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
        return truncate((output || '').trim() || '(no output)');
      } catch (err) {
        throw new Error(`Command failed (exit code ${err.status}):\n${truncate((err.stdout || '') + '\n' + (err.stderr || ''))}`);
      }
    },
  },

  // 👇 سازگار شده با ویندوز
  find_files: {
    description: 'Search for files by name pattern (e.g. "*.js").',
    parameters: { pattern: { type: 'string', required: true }, directory: { type: 'string', required: false } },
    async execute({ pattern, directory = '.' }) {
      const dir = resolve(directory);
      const items = walkDir(dir, { recursive: true, show_hidden: false });
      
      // تبدیل الگوی ساده (مثل *.js) به Regex
      const regexPattern = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$', 'i');
      
      const matches = items
        .filter(item => !item.isDirectory && regexPattern.test(path.basename(item.path)))
        .map(item => path.relative(dir, item.path))
        .slice(0, 100);

      return matches.length > 0 ? matches.join('\n') : `No files matching "${pattern}" in ${directory}`;
    },
  },

  // 👇 سازگار شده با ویندوز
  search_in_files: {
    description: 'Search for text patterns inside files (like grep).',
    parameters: { pattern: { type: 'string', required: true }, directory: { type: 'string', required: false }, file_pattern: { type: 'string', required: false } },
    async execute({ pattern, directory = '.', file_pattern }) {
      const dir = resolve(directory);
      const items = walkDir(dir, { recursive: true, show_hidden: false });
      const fileRegex = file_pattern ? new RegExp('^' + file_pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$', 'i') : null;
      
      let matches = [];
      let count = 0;

      for (const item of items) {
        if (item.isDirectory) continue;
        if (fileRegex && !fileRegex.test(path.basename(item.path))) continue;
        if (item.size > 2 * 1024 * 1024) continue; // رد کردن فایل‌های بزرگتر از 2MB

        try {
          const content = fs.readFileSync(item.path, 'utf8');
          const lines = content.split('\n');
          let fileMatched = false;

          for (let i = 0; i < lines.length; i++) {
            if (lines[i].toLowerCase().includes(pattern.toLowerCase())) {
              if (!fileMatched) {
                matches.push(`\n📄 ${path.relative(dir, item.path)}:`);
                fileMatched = true;
              }
              matches.push(`  ${i + 1}: ${lines[i].trim().substring(0, 200)}`);
              count++;
              if (count > 150) break;
            }
          }
        } catch { /* skip binary files */ }
        if (count > 150) break;
      }

      return matches.length > 0 ? truncate(matches.join('\n')) : `No matches found for: ${pattern}`;
    },
  },
  read_url: { /* بدون تغییر */ 
    description: 'Fetch the text content of a URL.',
    parameters: { url: { type: 'string', required: true } },
    async execute({ url }) {
      return new Promise((resolve_p, reject) => {
        const client = url.startsWith('https') ? https : http;
        const req = client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
          let data = '';
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => {
            const text = data.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s{3,}/g, '\n\n').trim();
            resolve_p(truncate(text));
          });
        });
        req.on('error', reject);
        req.setTimeout(15_000, () => { req.destroy(); reject(new Error('Timeout')); });
      });
    },
  },
  write_files: { /* بدون تغییر */
    description: 'Write multiple files at once.',
    parameters: { files: { type: 'array', required: true } },
    async execute({ files }) {
      if (!Array.isArray(files)) throw new Error('"files" must be an array');
      const results = files.map(({ path: p, content }) => {
        const abs = resolve(p);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, content, 'utf8');
        return `✓ ${p}`;
      });
      return `Wrote ${results.length} files:\n${results.join('\n')}`;
    },
  },
};

function getToolDescriptions() {
  return Object.entries(TOOLS).map(([name, tool]) => {
    const paramLines = Object.entries(tool.parameters || {}).map(([pName, p]) => `    - ${pName} (${p.type}${p.required ? ', REQUIRED' : ''})`).join('\n');
    return `### ${name}\n  ${tool.description}\n  Parameters:\n${paramLines}`;
  }).join('\n\n');
}

async function executeTool(name, args) {
  const tool = TOOLS[name];
  if (!tool) throw new Error(`Unknown tool: "${name}". Available: ${Object.keys(TOOLS).join(', ')}`);
  return await tool.execute(args);
}

module.exports = { TOOLS, executeTool, getToolDescriptions };