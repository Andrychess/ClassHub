const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("classHub", {
  getState: () => ipcRenderer.invoke("get-state"),
  scan: () => ipcRenderer.invoke("scan"),
  pickFolder: () => ipcRenderer.invoke("pick-folder"),
  selectFolder: (folderPath) => ipcRenderer.invoke("select-folder", folderPath),
  removeSavedFolder: (folderPath) => ipcRenderer.invoke("remove-saved-folder", folderPath),
  startSource: (payload) => ipcRenderer.invoke("start-source", payload),
  stopSource: () => ipcRenderer.invoke("stop-source"),
  getClasses: () => ipcRenderer.invoke("get-classes"),
  createClass: (payload) => ipcRenderer.invoke("create-class", payload),
  updateClass: (classId, patch) => ipcRenderer.invoke("update-class", classId, patch),
  deleteClass: (classId) => ipcRenderer.invoke("delete-class", classId),
  setActiveClass: (classId) => ipcRenderer.invoke("set-active-class", classId),
  joinClass: (payload) => ipcRenderer.invoke("join-class", payload),
  leaveClass: () => ipcRenderer.invoke("leave-class"),
  getDiscoveredClasses: () => ipcRenderer.invoke("get-discovered-classes"),
  discoverTeacherClasses: () => ipcRenderer.invoke("discover-teacher-classes"),
  setAppRole: (role) => ipcRenderer.invoke("set-app-role", role),
  getDeviceSession: () => ipcRenderer.invoke("get-device-session"),
  getAutoLaunch: () => ipcRenderer.invoke("get-auto-launch"),
  setAutoLaunch: (enabled) => ipcRenderer.invoke("set-auto-launch", enabled),
  fetchTeacherClassConfig: (teacherIp) => ipcRenderer.invoke("fetch-teacher-class-config", teacherIp),
  startScreenShare: () => ipcRenderer.invoke("start-screen-share"),
  stopScreenShare: () => ipcRenderer.invoke("stop-screen-share"),
  openUrl: (url) => ipcRenderer.invoke("open-url", url),
  openStreamViewer: (url) => ipcRenderer.invoke("open-stream-viewer", url),
  openStreamViewerIp: (ip) => ipcRenderer.invoke("open-stream-viewer-ip", ip),
  sendChatMessage: (text) => ipcRenderer.invoke("send-chat-message", text),
  getChatHistory: () => ipcRenderer.invoke("get-chat-history"),
  verifyTeacherPassword: (password) => ipcRenderer.invoke("verify-teacher-password", password),
  getInstalledApps: () => ipcRenderer.invoke("get-installed-apps"),
  getAppIcon: (appPath) => ipcRenderer.invoke("get-app-icon", appPath),
  getAppIconsBatch: (paths) => ipcRenderer.invoke("get-app-icons-batch", paths),
  getPinnedApps: () => ipcRenderer.invoke("get-pinned-apps"),
  togglePinnedApp: (appPath) => ipcRenderer.invoke("toggle-pinned-app", appPath),
  launchApp: (appPath) => ipcRenderer.invoke("launch-app", appPath),
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
  onChatMessage: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on("chat-message", listener);
    return () => ipcRenderer.removeListener("chat-message", listener);
  },
});
