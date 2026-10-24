// UI Elements
const emptyState = document.getElementById('empty-state');
const activeState = document.getElementById('active-state');
const emptyComposer = document.getElementById('empty-composer');
const emptyInput = document.getElementById('empty-input');
const btnEmptySend = document.getElementById('btn-empty-send');

const chatComposer = document.getElementById('chat-composer');
const chatInput = document.getElementById('chat-input');
const btnChatSend = document.getElementById('btn-chat-send');
const btnChatStop = document.getElementById('btn-chat-stop');
const chatContainer = document.getElementById('chat-container');

const fileTree = document.getElementById('file-tree');
const editorTabBar = document.getElementById('editor-tab-bar');
const editorTabName = document.getElementById('editor-tab-name');
const editorContentArea = document.getElementById('editor-content-area');
const codeContent = document.getElementById('code-content');
const lineNumbers = document.getElementById('line-numbers');
const emptyEditor = document.getElementById('empty-editor');
const currentFolderText = document.getElementById('current-folder');
const btnSelectFolder = document.getElementById('btn-select-folder');

const loadingScreen = document.getElementById('loading-screen');
const loadingStatus = document.getElementById('loading-status');

// History Sidebar Elements
const historySidebar = document.getElementById('history-sidebar');
const btnEmptyHistory = document.getElementById('btn-empty-history');
const btnActiveHistory = document.getElementById('btn-active-history');
const btnCloseHistory = document.getElementById('btn-close-history');
const btnNewChatSidebar = document.getElementById('btn-new-chat-sidebar');
const historySearch = document.getElementById('history-search');
const historyList = document.getElementById('history-list');

let currentAiMessage = null;
let currentActionBox = null;
let rawAiText = '';

// ── Resizing Logic ──
function setupMainSplitter() {
  const splitter = document.getElementById('main-splitter');
  const workspace = document.querySelector('.workspace');
  let dragging = false;

  splitter.addEventListener('pointerdown', (e) => {
    dragging = true;
    splitter.setPointerCapture(e.pointerId);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  splitter.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const bounds = workspace.getBoundingClientRect();
    const percent = ((e.clientX - bounds.left) / bounds.width) * 100;
    const clamped = Math.max(23, Math.min(60, percent));
    workspace.style.gridTemplateColumns = `minmax(250px, ${clamped}%) 8px minmax(0, 1fr)`;
  });

  splitter.addEventListener('pointerup', () => {
    dragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
}
setupMainSplitter();

// ── State Transitions ──
function startChat(prompt) {
  if (!prompt.trim()) return;
  
  emptyState.classList.add('hidden');
  activeState.classList.remove('hidden');
  
  activeState.classList.remove('web-task', 'non-web-task');
  activeState.style.gridTemplateColumns = ''; 
  btnEmptyHistory.classList.add('hidden');
  
  appendMessage('user', prompt);
  emptyInput.value = '';
  chatComposer.querySelector('textarea').style.height = 'auto';
  
  btnChatSend.classList.add('hidden');
  btnChatStop.classList.remove('hidden');
  
  currentAiMessage = null;
  currentActionBox = null;
  rawAiText = '';
  
  if (window.api) {
    window.api.saveState({ uiState: 'active' });
    window.api.runTask(prompt);
  }
}

emptyComposer.addEventListener('submit', (e) => {
  e.preventDefault();
  startChat(emptyInput.value);
});

chatComposer.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  
  appendMessage('user', text);
  chatInput.value = '';
  chatInput.style.height = 'auto';
  
  btnChatSend.classList.add('hidden');
  btnChatStop.classList.remove('hidden');
  
  currentAiMessage = null;
  currentActionBox = null;
  rawAiText = '';
  if (window.api) window.api.runTask(text);
});

[emptyInput, chatInput].forEach(input => {
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 150) + 'px';
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input === emptyInput) startChat(input.value);
      else chatComposer.dispatchEvent(new Event('submit'));
    }
  });
});

btnChatStop.addEventListener('click', () => {
  if (window.api) window.api.stopTask();
});

// ── Helpers ──
function getActionBox() {
  if (!currentActionBox) {
    currentActionBox = document.createElement('div');
    currentActionBox.className = 'agent-action-box';
    chatContainer.appendChild(currentActionBox);
    
    if (currentAiMessage) {
      let text = currentAiMessage.textContent.trim();
      if (/tool_call|<ds_safety>|"name"\s*:/.test(text)) {
        currentAiMessage.remove();
      } else if (text.length > 0) {
        finalizeAiMessage(currentAiMessage, text);
      } else {
        currentAiMessage.remove();
      }
      currentAiMessage = null;
    }
  }
  return currentActionBox;
}

// ── Agent Events ──
if (window.api) {
  // 👈 دریافت رویدادهای دانلود
  window.api.onDownloadProgress((data) => {
    const progressContainer = document.getElementById('progress-container');
    const progressBarFill = document.getElementById('progress-bar-fill');
    const progressText = document.getElementById('progress-text');

    if (data.type === 'start') {
      progressContainer.classList.remove('hidden');
      loadingStatus.textContent = data.message;
    } else if (data.type === 'progress') {
      progressBarFill.style.width = data.percent + '%';
      progressText.textContent = `Downloading: ${data.percent}% of ${data.totalSize}${data.speed}`;
    } else if (data.type === 'log') {
      progressText.textContent = data.message;
    } else if (data.type === 'done') {
      progressContainer.classList.add('hidden');
      loadingStatus.textContent = data.message;
    } else if (data.type === 'error') {
      loadingStatus.textContent = data.message;
      loadingStatus.style.color = '#ef4444';
      progressText.textContent = 'Please check your internet connection and restart the app.';
    }
  });

  window.api.onAgentEvent(async (event) => {
    const { type, data } = event;

    switch (type) {
      case 'status':
        if (loadingStatus) loadingStatus.textContent = data;
        break;
        
      case 'chat_id_updated':
        break;

      case 'thinking':
        rawAiText = data;
        
        const isInternal = /```tool_call|<ds_safety>|\[用户未成年\]|"name"\s*:\s*"/i.test(rawAiText);
        
        if (isInternal) {
          if (currentAiMessage && currentAiMessage.textContent.trim() === '') {
            currentAiMessage.remove();
            currentAiMessage = null;
          }
          break;
        }
        
        if (rawAiText.trim().length > 0) {
          currentActionBox = null;
          if (!currentAiMessage) {
            currentAiMessage = document.createElement('div');
            currentAiMessage.className = 'msg ai';
            chatContainer.appendChild(currentAiMessage);
          }
          currentAiMessage.textContent = rawAiText;
          scrollToBottom();
        }
        break;

      case 'tool_call': {
        currentAiMessage = null;
        const box = getActionBox();
        
        const title = data.args.title || `Executing ${data.name.replace(/_/g, ' ')}`;
        const card = document.createElement('details');
        card.className = 'action-card';
        
        let icon = '⚡';
        if (data.name === 'write_file') icon = '📝';
        else if (data.name === 'read_file') icon = '📄';
        else if (data.name === 'run_command') icon = '💻';
        else if (data.name === 'list_directory') icon = '📁';
        
        card.innerHTML = `
          <summary>
            <span class="action-icon">${icon}</span>
            <span class="action-title">${title}</span>
            <span class="action-status" style="color: var(--blue);">Running...</span>
          </summary>
          <div class="action-details">${JSON.stringify(data.args, null, 2)}</div>
        `;
        box.appendChild(card);
        break;
      }

      case 'tool_result': {
        const box = getActionBox();
        const lastCard = box.lastElementChild;
        
        if (lastCard && lastCard.classList.contains('action-card')) {
          lastCard.classList.add('is-result');
          const status = lastCard.querySelector('.action-status');
          if (status) {
            status.textContent = data.isError ? 'Failed' : 'Done';
            status.style.color = data.isError ? '#ef4444' : '#10b981';
          }
        } else {
          const card = document.createElement('details');
          card.className = 'action-card is-result';
          card.innerHTML = `
            <summary>
              <span class="action-icon">✅</span>
              <span class="action-title">Result: ${data.name}</span>
              <span class="action-status">Done</span>
            </summary>
            <div class="action-details">${data.result}</div>
          `;
          box.appendChild(card);
        }
        break;
      }

      case 'open_file':
        await openFile(data);
        await loadFileTree();
        break;

      case 'final':
        if (currentAiMessage) {
          let cleanFinal = rawAiText
            .replace(/<ds_safety>[\s\S]*?<\/ds_safety>\s*Safe/gi, '')
            .replace(/<ds_safety>[\s\S]*$/gi, '')
            .replace(/\[用户未成年\][\s\S]*$/gi, '')
            .trim();
            
          if (cleanFinal === 'Safe' || cleanFinal.length === 0) {
            currentAiMessage.remove();
          } else if (!/tool_call/.test(cleanFinal)) {
            finalizeAiMessage(currentAiMessage, cleanFinal);
          } else {
            currentAiMessage.remove();
          }
        } else {
          let cleanData = data
            .replace(/<ds_safety>[\s\S]*?<\/ds_safety>\s*Safe/gi, '')
            .replace(/<ds_safety>[\s\S]*$/gi, '')
            .replace(/\[用户未成年\][\s\S]*$/gi, '')
            .trim();
            
          if (cleanData !== 'Safe' && cleanData.length > 0 && !/tool_call/.test(cleanData)) {
            appendMessage('ai', cleanData);
          }
        }
        currentAiMessage = null;
        currentActionBox = null;
        resetChatButtons();
        await loadFileTree();
        break;

      case 'error':
        currentAiMessage = null;
        currentActionBox = null;
        appendMessage('ai', '⚠️ Error: ' + data);
        resetChatButtons();
        break;

      case 'classification': {
        const box = getActionBox();
        const card = document.createElement('div');
        card.className = 'action-card';
        card.style.padding = '10px 12px';
        card.style.display = 'flex';
        card.style.alignItems = 'center';
        card.style.gap = '10px';
        card.innerHTML = `<span class="action-icon" style="color: #c084fc;">🧠</span> <span class="action-title">Task Analysis: ${data.isWeb ? 'Web Development' : 'General Coding'}</span>`;
        box.appendChild(card);
        
        activeState.style.gridTemplateColumns = '';
        
        if (data.isWeb) {
          activeState.classList.add('web-task');
          activeState.classList.remove('non-web-task');
          document.querySelector('.view-toggle').classList.remove('hidden');
        } else {
          activeState.classList.add('non-web-task');
          activeState.classList.remove('web-task');
          document.querySelector('.view-toggle').classList.add('hidden');
        }
        break;
      }
    }
  });
}

function resetChatButtons() {
  btnChatSend.classList.remove('hidden');
  btnChatStop.classList.add('hidden');
}

// ── File System (Tree View) ──
btnSelectFolder.addEventListener('click', async () => {
  if (!window.api) return;
  const res = await window.api.selectFolder();
  if (res.success) {
    currentFolderText.textContent = res.path.split(/[\\/]/).pop() || res.path;
    loadFileTree();
  }
});

async function loadFileTree() {
  if (!window.api) return;
  const files = await window.api.getFiles();
  fileTree.innerHTML = '';
  if (!files || files.length === 0) {
    fileTree.innerHTML = '<div style="padding:16px;font-size:12px;color:var(--muted)">No files found</div>';
    return;
  }

  function renderTree(items, container, depth = 0) {
    items.forEach(item => {
      const el = document.createElement('button');
      el.className = 'tree-item ' + (item.isDir ? 'folder' : 'file');
      
      if (item.isDir) {
        el.innerHTML = `<span class="chevron">›</span><span>${item.name}</span>`;
        
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'tree-files';
        childrenContainer.style.display = 'none';
        childrenContainer.style.paddingLeft = `${depth * 12}px`;

        el.onclick = (e) => {
          e.stopPropagation();
          const chevron = el.querySelector('.chevron');
          const isOpen = el.dataset.open === 'true';
          el.dataset.open = String(!isOpen);
          chevron.textContent = isOpen ? '›' : '⌄';
          
          if (isOpen) {
            childrenContainer.style.display = 'none';
          } else {
            childrenContainer.style.display = 'flex';
            if (childrenContainer.children.length === 0 && item.children) {
              renderTree(item.children, childrenContainer, depth + 1);
            }
          }
        };
        
        container.appendChild(el);
        container.appendChild(childrenContainer);
      } else {
        el.innerHTML = `<span class="file-icon"></span><span>${item.name}</span>`;
        el.onclick = (e) => {
          e.stopPropagation();
          document.querySelectorAll('.tree-item').forEach(n => n.classList.remove('active'));
          el.classList.add('active');
          openFile(item.path);
        };
        container.appendChild(el);
      }
    });
  }
  
  renderTree(files, fileTree);
}

// ── Editor & Views ──
async function openFile(filePath) {
  if (!window.api) return;
  const res = await window.api.readFile(filePath);
  if (res.error) return;
  
  const fileName = filePath.split(/[\\/]/).pop();
  editorTabName.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg> ${fileName}`;
  
  const ext = filePath.split('.').pop();
  const lines = res.content.split('\n').length;
  
  lineNumbers.innerHTML = Array.from({ length: lines }, (_, i) => i + 1).join('<br>');
  
  emptyEditor.classList.add('hidden');
  editorTabBar.classList.remove('hidden');
  editorContentArea.classList.remove('hidden');
  
  codeContent.className = `hljs language-${ext}`;
  try {
    codeContent.innerHTML = hljs.highlight(res.content, { language: ext }).value;
  } catch {
    codeContent.textContent = res.content;
  }
}

// Toggle View (Code / Preview)
const btnViewCode = document.getElementById('btn-view-code');
const btnViewPreview = document.getElementById('btn-view-preview');
btnViewCode.addEventListener('click', () => {
  btnViewPreview.classList.remove('active');
  btnViewCode.classList.add('active');
  editorContentArea.classList.remove('hidden');
});
btnViewPreview.addEventListener('click', () => {
  btnViewCode.classList.remove('active');
  btnViewPreview.classList.add('active');
  editorContentArea.classList.add('hidden');
});

// ── History Sidebar ──
function openHistorySidebar() {
  historySidebar.classList.add('open');
  loadHistory();
}

function closeHistorySidebar() {
  historySidebar.classList.remove('open');
}

async function loadHistory() {
  historyList.innerHTML = '<div class="history-loading">Fetching sessions...</div>';
  
  if (!window.api) return;
  const res = await window.api.getChatHistory();
  
  if (!res.success) {
    historyList.innerHTML = `<div style="color:#ef4444;padding:10px;font-size:12px">Error: ${res.error}</div>`;
    return;
  }
  
  const chats = res.chats;
  if (chats.length === 0) {
    historyList.innerHTML = '<div style="color:var(--muted);padding:10px;font-size:12px;text-align:center;">No chat history found.</div>';
    return;
  }
  
  historyList.innerHTML = '';
  chats.forEach(chat => {
    const item = document.createElement('div');
    item.className = 'history-item';
    
    const titleSpan = document.createElement('span');
    titleSpan.className = 'item-title';
    titleSpan.textContent = chat.title;
    titleSpan.title = chat.title;
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-history-btn';
    deleteBtn.title = 'Delete Session';
    deleteBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6"/></svg>`;
    
    deleteBtn.onclick = async (e) => {
      e.stopPropagation();
      const confirmDelete = confirm(`Are you sure you want to delete "${chat.title}"?\nThis will also permanently delete it from DeepSeek.`);
      if (!confirmDelete) return;
      
      item.style.pointerEvents = 'none';
      titleSpan.textContent = 'Deleting...';
      titleSpan.style.color = '#ef4444';
      deleteBtn.innerHTML = `<div class="spinner" style="width:12px;height:12px;border-width:1.5px;border-top-color:#ef4444;"></div>`;
      
      const delRes = await window.api.deleteChat(chat.id);
      if (delRes.success) {
        item.style.opacity = '0';
        item.style.transform = 'translateX(-10px)';
        item.style.transition = 'all 0.2s ease';
        setTimeout(() => item.remove(), 200);
      } else {
        alert('Failed to delete chat from DeepSeek: \n' + delRes.error);
        loadHistory();
      }
    };
    
    item.appendChild(titleSpan);
    item.appendChild(deleteBtn);
    
    item.onclick = async (e) => {
      if (e.target.closest('.delete-history-btn')) return;
      closeHistorySidebar();
      
      emptyState.classList.add('hidden');
      activeState.classList.remove('hidden');
      
      activeState.classList.add('web-task');
      activeState.classList.remove('non-web-task');
      activeState.style.gridTemplateColumns = '';
      document.querySelector('.view-toggle').classList.remove('hidden');
      
      chatContainer.innerHTML = '<div class="history-loading" style="margin-top:20px;">Loading session...</div>';

      const loadRes = await window.api.loadChat(chat.id);
      
      if (!loadRes.success) {
        alert('Error loading chat: ' + loadRes.error);
        chatContainer.innerHTML = '';
        emptyState.classList.remove('hidden');
        activeState.classList.add('hidden');
      } else {
        chatContainer.innerHTML = '';
        if (loadRes.messages && loadRes.messages.length > 0) {
          loadRes.messages.forEach(msg => {
            appendMessage(msg.role === 'user' ? 'user' : 'ai', msg.content);
          });
        } else {
          appendMessage('ai', `Loaded session: **${chat.title}**\n\nYou can continue this conversation now.`);
        }
        window.api.saveState({ uiState: 'active', activeChatId: chat.id });
      }
    };
    
    historyList.appendChild(item);
  });
}

btnEmptyHistory.addEventListener('click', openHistorySidebar);
btnActiveHistory.addEventListener('click', openHistorySidebar);
btnCloseHistory.addEventListener('click', closeHistorySidebar);

btnNewChatSidebar.addEventListener('click', async () => {
  closeHistorySidebar();
  if (!window.api) return;
  
  const res = await window.api.newChat();
  if (res.success) {
    activeState.classList.remove('web-task', 'non-web-task');
    activeState.style.gridTemplateColumns = '';
    document.querySelector('.view-toggle').classList.remove('hidden');
    chatContainer.innerHTML = '';
    emptyState.classList.remove('hidden');
    activeState.classList.add('hidden');
    emptyInput.value = '';
    chatInput.value = '';
    emptyEditor.classList.remove('hidden');
    editorTabBar.classList.add('hidden');
    editorContentArea.classList.add('hidden');
    window.api.saveState({ uiState: 'empty', activeChatId: null });
  } else {
    alert('Failed to start new chat: ' + res.error);
  }
});

historySearch.addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase();
  document.querySelectorAll('.history-item').forEach(item => {
    const text = item.textContent.toLowerCase();
    item.style.display = text.includes(query) ? 'flex' : 'none';
  });
});

// ── Helpers ──
function finalizeAiMessage(el, text) {
  try {
    el.innerHTML = marked.parse(text || '');
    el.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
  } catch { el.textContent = text; }
  scrollToBottom();
}

function appendMessage(role, text) {
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  if (role === 'ai') {
    try {
      div.innerHTML = marked.parse(text || '');
      div.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
    } catch { div.textContent = text; }
  } else {
    div.textContent = text;
  }
  chatContainer.appendChild(div);
  scrollToBottom();
}

function scrollToBottom() {
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ── Init ──
if (window.api) {
  window.api.initAgent().then(async res => {
    if (res.success && res.workDir) {
      currentFolderText.textContent = res.workDir.split(/[\\/]/).pop() || res.workDir;
      btnEmptyHistory.classList.remove('hidden');
      loadFileTree();
      
      if (res.uiState === 'active') {
        emptyState.classList.add('hidden');
        activeState.classList.remove('hidden');
        
        if (res.messages && res.messages.length > 0) {
           res.messages.forEach(msg => appendMessage(msg.role === 'user' ? 'user' : 'ai', msg.content));
        } else if (res.activeChatId) {
           appendMessage('ai', `Loaded session from your last visit.\n\nYou can continue this conversation now.`);
        }
      }
      
      setTimeout(() => {
        loadingScreen.classList.add('hidden-loader');
      }, 800);
    } else {
      loadingStatus.textContent = "خطا در راه‌اندازی: " + (res.error || 'Unknown error');
      loadingStatus.style.color = "#ef4444";
    }
  }).catch(err => {
    loadingStatus.textContent = "خطای ارتباط با هسته: " + err.message;
    loadingStatus.style.color = "#ef4444";
  });
}