# Fara DSA (DeepSeek Browser Agent)

<div align="center">

  <img src="images/icon.png" alt="Fara DSA Logo" width="96" height="96" />

  ### Autonomous AI Coding Agent & Desktop Workspace Powered by DeepSeek
  **No API key required — Seamless browser automation via Playwright**

  [![Node.js Version](https://img.shields.io/badge/Node.js-18+-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
  [![Electron](https://img.shields.io/badge/Electron-28+-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
  [![Playwright](https://img.shields.io/badge/Playwright-Automated-2EAD33?logo=playwright&logoColor=white)](https://playwright.dev/)
  [![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Linux%20%7C%20macOS-lightgrey)]()
  [![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

</div>

---

## 📌 Overview

**Fara DSA** is an autonomous AI coding agent and developer environment designed to give developers the full power of DeepSeek directly on their local machine **without paying for API tokens or requiring an API key**.

It connects to your personal account on [chat.deepseek.com](https://chat.deepseek.com) using a background persistent Playwright browser session. It can plan, inspect codebases, read and write files, execute shell commands, and iteratively solve programming problems through a specialized autonomous loop.

The application comes with:
1. **A modern Desktop IDE (Electron)** featuring split view, real-time tool execution cards, an integrated code viewer with syntax highlighting, a live file explorer, and chat history.
2. **A headless CLI runner** for direct task execution inside your terminal.

---

## 🖼️ User Interface

The desktop application provides a clean, dark-mode workspace inspired by modern developer environments:

![Fara DSA Screenshot](images/preview.png)

- **Landing Screen**: Select a workspace directory and dispatch tasks.
- **Dynamic Task Classification**: The agent first categorizes the task (Web vs. Non-Web) and dynamically configures the layout.
- **Action Cards**: Tool calls (`write_file`, `run_command`, etc.) appear as interactive, real-time cards showing parameters and live results.
- **File Explorer & Editor**: View created and modified files immediately with syntax highlighting.
- **Session History Drawer**: Access, load, or permanently delete past chat sessions directly synced with your DeepSeek account.

---

## 🚀 Key Features

- 🔑 **Zero API Costs**: Automates DeepSeek Web directly — no subscriptions, API keys, or credit cards required.
- 🔄 **Fully Autonomous Event Loop**: The agent initiates actions, parses responses, runs local tools, feeds outputs back, and iterates until completion.
- 🖥️ **Desktop IDE & Headless CLI**: Use the interactive Electron app or execute quick terminal tasks via `node src/index.js "task"`.
- 🛡️ **Self-Healing & Filter Bypass**: Includes parsers that recover from safety markers (`<ds_safety>`), empty answers, and malformed JSON blocks.
- 📁 **Native Filesystem Tools**: High-level cross-platform tools for reading, writing, regex search, directory inspection, and shell command execution.
- 🌐 **Session Persistence**: Login once in the visible browser prompt; all credentials and session states are safely stored in your home directory (`~/.fara-dsa/session`).
- 🔬 **Built-in DOM Calibrator**: If DeepSeek changes their web interface, run `node src/calibrate.js` to inspect and regenerate UI selectors automatically.

---

## 🏗️ Architecture

```
┌───────────────────────────────────────────────────────────┐
│                    Fara DSA Desktop GUI                   │
│         (Electron Main + Preload IPC + Renderer)          │
└─────────────────────────────┬─────────────────────────────┘
                              │ IPC Channels
┌─────────────────────────────▼─────────────────────────────┐
│                    DeepSeekAgent (Core)                   │
│   ├── Conversation & Prompt Builder (prompt.js)           │
│   ├── Response & Tool Parser (parser.js)                  │
│   └── Tool Execution Engine (tools.js)                    │
└──────────────┬──────────────────────────────┬─────────────┘
               │                              │
        Local Execution               Browser Automation
               │                              │
┌──────────────▼─────────────┐  ┌─────────────▼─────────────┐
│    Local System Tools      │  │      DeepSeekBrowser      │
│  - File System Ops         │  │   (Playwright Controller) │
│  - Shell / Terminal Exec   │  │   - Session Store         │
│  - Search / URL Fetch      │  │   - chat.deepseek.com     │
└────────────────────────────┘  └───────────────────────────┘
```

---

## 🧰 Available Agent Tools

The autonomous engine uses the following tools defined in `src/tools.js`:

| Tool | Parameters | Description |
| :--- | :--- | :--- |
| `read_file` | `path`, `start_line?`, `end_line?` | Reads the full content or specific line ranges of a file. |
| `write_file` | `path`, `content` | Writes (or overwrites) a file with provided content. |
| `write_files` | `files: [{path, content}]` | Atomic write operation for multiple files at once. |
| `append_to_file` | `path`, `content` | Appends text content to the end of an existing file. |
| `replace_in_file` | `path`, `find`, `replace`, `use_regex?` | Performs string or regex search-and-replace in a file. |
| `delete_file` | `path` | Removes a file from the workspace. |
| `list_directory` | `path?`, `recursive?`, `show_hidden?` | Windows-safe directory listing showing files and sizes. |
| `create_directory` | `path` | Creates folders recursively. |
| `move_file` | `source`, `destination` | Moves or renames files across directories. |
| `copy_file` | `source`, `destination` | Copies files from one destination to another. |
| `get_file_info` | `path` | Returns metadata including type, size, and modified time. |
| `run_command` | `command`, `cwd?`, `timeout?` | Executes shell commands locally with buffer output. |
| `find_files` | `pattern`, `directory?` | Locates files by pattern matching (e.g. `*.jsx`). |
| `search_in_files` | `pattern`, `directory?`, `file_pattern?` | Grep-style search across project files with line numbers. |
| `read_url` | `url` | Fetches web documentation and extracts stripped text. |

---

## 📦 Installation

### Prerequisites
- [Node.js](https://nodejs.org/) (version 18 or higher)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)
- A free account on [chat.deepseek.com](https://chat.deepseek.com)

### 1. Clone the repository
```bash
git clone https://github.com/tuapod/fara-dsa.git
cd fara-dsa
```

### 2. Install dependencies
```bash
npm install
```
*(The post-install script will automatically create the storage directories and download the required Chromium binary into `~/.fara-dsa/browsers`).*

If Playwright does not download automatically:
```bash
npx playwright install chromium
```

---

## 💻 How to Run

### Method 1: Desktop Application (Electron)

Start the desktop IDE:
```bash
npm start
```

#### First-Time Authentication:
1. On your very first run, if you are not logged in, a visible browser window will pop up.
2. Log in to your DeepSeek account (Google, Phone, or Email).
3. Once logged in, the window will close and save your encrypted cookies/session to `~/.fara-dsa/session`.
4. Subsequent launches will run headless in the background without prompting you.

---

### Method 2: CLI Mode

You can run individual tasks directly from your terminal:
```bash
node src/index.js "Write a clean Node.js script to monitor CPU usage and write logs to stats.json"
```

---

### Method 3: Selector Calibration

If DeepSeek updates its frontend markup and the agent has trouble finding the text area or send button:
```bash
node src/calibrate.js
```
This utility opens the browser, inspects live DOM elements, displays current button/input selectors, and takes a diagnostic screenshot at `/tmp/deepseek-calibrate.png`.

---

## ⚙️ Configuration & Storage Paths

All persistent user data is kept isolated in the user home directory under `.fara-dsa`:

```
~/.fara-dsa/
├── session/        # Persistent browser profile & login cookies
├── browsers/       # Dedicated Playwright Chromium binary
├── logs/           # Detailed conversation and execution logs
├── state.json      # Workspace cache (last opened folder, active chat ID)
└── config.json     # Optional global configuration overrides
```

### Project Configuration
You can place a `fara-dsa.config.json` inside your project directory to customize options:
```json
{
  "MAX_ITERATIONS": 50,
  "RESPONSE_TIMEOUT": 240000,
  "STABLE_DELAY": 3000,
  "HEADLESS": true
}
```

---

## 🗂️ Project Structure

```
fara-dsa/
├── build/                # Application assets & icons (.ico)
├── images/               # Screenshots and UI graphics
├── src/
│   ├── agent.js          # Core loop, event system, and tool runner
│   ├── browser.js        # Playwright controller for chat.deepseek.com
│   ├── calibrate.js      # DOM selector calibration script
│   ├── config.js         # Settings & paths resolution
│   ├── index.js          # CLI entry point
│   ├── logger.js         # ANSI terminal logger
│   ├── parser.js         # Tool call, DSML, and JSON response parser
│   ├── postinstall.js    # Browser installation hooks
│   ├── prompt.js         # System prompts and message formatting
│   └── tools.js          # Safe filesystem and process management tools
├── index.html            # Electron UI layout
├── main.js               # Electron main process & IPC handlers
├── preload.js            # Secure IPC context bridge
├── renderer.js           # UI logic, state management, and file tree
├── style.css             # Dark theme styling & layout rules
├── package.json          # Dependencies & scripts
└── README.md             # Project documentation
```

---

## 🛡️ Disclaimer

This application is an independent open-source tool and is **not** affiliated with, endorsed by, or partnered with DeepSeek. It uses browser automation for personal assistance. Please use it in compliance with DeepSeek's Terms of Service.

---

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
