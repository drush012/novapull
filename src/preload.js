const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nova', {
  appInfo: () => ipcRenderer.invoke('app-info'),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  inspectUrl: (url, options) => ipcRenderer.invoke('inspect-url', { url, ...options }),
  cookiesStatus: () => ipcRenderer.invoke('cookies-status'),
  browseSites: () => ipcRenderer.invoke('browse-sites'),
  openSite: id => ipcRenderer.invoke('open-site', id),
  exitIp: () => ipcRenderer.invoke('exit-ip'),
  setTheme: theme => ipcRenderer.invoke('set-theme', theme),
  setLanguage: lang => ipcRenderer.invoke('set-language', lang),
  checkUpdate: feed => ipcRenderer.invoke('check-update', feed),
  openExternal: url => ipcRenderer.invoke('open-external', url),
  clearLogin: () => ipcRenderer.invoke('clear-login'),
  startDownload: task => ipcRenderer.invoke('start-download', task),
  stopDownload: id => ipcRenderer.invoke('stop-download', id),
  openPath: path => ipcRenderer.invoke('open-path', path),
  onParseStage: callback => ipcRenderer.on('parse-stage', (_event, data) => callback(data)),
  onTaskEvent: callback => ipcRenderer.on('task-event', (_event, data) => callback(data)),
  onTaskLog: callback => ipcRenderer.on('task-log', (_event, data) => callback(data))
});
