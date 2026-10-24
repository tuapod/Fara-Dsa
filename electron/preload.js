const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  initAgent: (chatId) => ipcRenderer.invoke('init-agent', chatId),
  runTask: (task) => ipcRenderer.send('run-task', task),
  stopTask: () => ipcRenderer.send('stop-task'),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  getFiles: () => ipcRenderer.invoke('get-files'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  getChatHistory: () => ipcRenderer.invoke('get-chat-history'),
  loadChat: (chatId) => ipcRenderer.invoke('load-chat', chatId),
  newChat: () => ipcRenderer.invoke('new-chat'),
  deleteChat: (chatId) => ipcRenderer.invoke('delete-chat', chatId),
  loadState: () => ipcRenderer.invoke('load-state'),
  saveState: (updates) => ipcRenderer.invoke('save-state', updates),
  onAgentEvent: (callback) => {
    ipcRenderer.on('agent-event', (event, data) => callback(data));
  },
  onDownloadProgress: (callback) => {
    ipcRenderer.on('download-progress', (event, data) => callback(data));
  },
  minimize: () => ipcRenderer.send('window-min'),
  maximize: () => ipcRenderer.send('window-max'),
  close: () => ipcRenderer.send('window-close')
});