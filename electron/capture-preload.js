const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("captureApi", {
  getSourceId: () => ipcRenderer.invoke("capture-get-source-id"),
  sendFrame: (buffer) => ipcRenderer.send("capture-frame", buffer),
  notifyReady: () => ipcRenderer.send("capture-ready"),
  notifyError: (message) => ipcRenderer.send("capture-error", message),
});
