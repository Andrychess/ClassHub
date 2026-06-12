const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("classHub", {
  getState: () => ipcRenderer.invoke("get-state"),
  scan: () => ipcRenderer.invoke("scan"),
  pickFolder: () => ipcRenderer.invoke("pick-folder"),
  selectFolder: (folderPath) => ipcRenderer.invoke("select-folder", folderPath),
  removeSavedFolder: (folderPath) => ipcRenderer.invoke("remove-saved-folder", folderPath),
  startSource: (folderPath) => ipcRenderer.invoke("start-source", folderPath),
  stopSource: () => ipcRenderer.invoke("stop-source"),
  startScreenShare: () => ipcRenderer.invoke("start-screen-share"),
  stopScreenShare: () => ipcRenderer.invoke("stop-screen-share"),
  openUrl: (url) => ipcRenderer.invoke("open-url", url),
  copyToClipboard: (text) => ipcRenderer.invoke("copy-to-clipboard", text),
  checkUpdates: () => ipcRenderer.invoke("check-updates"),
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  onPeersUpdated: (callback) => {
    const listener = (_event, peers) => callback(peers);
    ipcRenderer.on("peers-updated", listener);
    return () => ipcRenderer.removeListener("peers-updated", listener);
  },
  onStatus: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on("status", listener);
    return () => ipcRenderer.removeListener("status", listener);
  },
});
