const { app, BrowserWindow, dialog, ipcMain, shell, desktopCapturer } = require("electron");
const fs = require("fs");
const path = require("path");
const { DiscoveryService } = require("./discovery");
const { FileServer } = require("./fileServer");
const { ScreenServer } = require("./screenServer");
const { getLocalIp, getHostname, getPhysicalNetworkInterfaces } = require("./protocol");
const { scanLocalNetwork, mergePeerLists, getNetworkSummary } = require("./networkScan");
const {
  addSavedFolder,
  removeSavedFolder,
  setSelectedFolder,
  getFolderState,
} = require("./settings");
const { ensureClassHubFirewallRules } = require("./firewall");
const { checkForUpdates, setStatusHandler } = require("./updater");

let mainWindow = null;
let captureWindow = null;
let discovery = null;
let fileServer = null;
let screenServer = null;
let shareFolder = null;
let captureSourceId = null;
let isScreenSharing = false;
let networkDevices = [];

function getHtmlPath() {
  return path.join(app.getAppPath(), "src", "index.html");
}

function getCaptureHtmlPath() {
  return path.join(app.getAppPath(), "src", "capture.html");
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1040,
    height: 820,
    minWidth: 760,
    minHeight: 620,
    title: "ClassHub",
    backgroundColor: "#0f1117",
    icon: path.join(__dirname, "../assets/icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const htmlPath = getHtmlPath();
  if (!fs.existsSync(htmlPath)) {
    dialog.showErrorBox(
      "ClassHub",
      `Не найден файл интерфейса:\n${htmlPath}\n\nЗапустите приложение командой npm start.`
    );
    app.quit();
    return;
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
    stopScreenShare();
  });

  mainWindow.loadFile(htmlPath).catch((error) => {
    dialog.showErrorBox("ClassHub", `Ошибка загрузки интерфейса:\n${error.message}`);
  });
}

function createCaptureWindow() {
  if (captureWindow && !captureWindow.isDestroyed()) {
    return;
  }

  captureWindow = new BrowserWindow({
    show: false,
    width: 320,
    height: 240,
    skipTaskbar: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "capture-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  captureWindow.loadFile(getCaptureHtmlPath());
  captureWindow.on("closed", () => {
    captureWindow = null;
  });
}

async function pickScreenSourceId() {
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: 1, height: 1 },
  });

  if (!sources.length) {
    return null;
  }

  const entireScreen = sources.find((source) => /screen|экран|display/i.test(source.name));
  return (entireScreen || sources[0]).id;
}

async function stopScreenShare() {
  isScreenSharing = false;
  captureSourceId = null;

  if (captureWindow && !captureWindow.isDestroyed()) {
    captureWindow.close();
  }
  captureWindow = null;

  if (screenServer) {
    await screenServer.stop();
  }

  discovery?.announceStopScreen();
}

function sendStatus(message) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("status", message);
  }
}

function broadcastPeers(peers) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("peers-updated", peers);
  }
}

function getMergedPeers() {
  const classHubPeers = discovery?.getPeerList() ?? [];
  return mergePeerLists(classHubPeers, networkDevices);
}

function broadcastMergedPeers() {
  broadcastPeers(getMergedPeers());
}

function setupDiscovery() {
  discovery = new DiscoveryService(() => {
    broadcastMergedPeers();
  });
  discovery.start();
}

async function scanNetworkDevices() {
  sendStatus("Сканирование локальной сети...");
  networkDevices = await scanLocalNetwork();
  broadcastMergedPeers();
  sendStatus(`Найдено устройств в сети: ${getMergedPeers().length}`);
  return getMergedPeers();
}

app.whenReady().then(async () => {
  setStatusHandler(sendStatus);
  await ensureClassHubFirewallRules();
  const folderState = getFolderState();
  shareFolder = folderState.lastSelectedFolder;
  fileServer = new FileServer();
  screenServer = new ScreenServer();
  setupDiscovery();
  createWindow();
  setTimeout(() => {
    scanNetworkDevices().catch(() => {});
  }, 1500);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", async () => {
  await stopScreenShare();
  if (fileServer) {
    await fileServer.stop();
  }
  if (discovery) {
    discovery.stop();
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("get-state", () => {
  const folderState = getFolderState();
  if (!shareFolder) {
    shareFolder = folderState.lastSelectedFolder;
  }
  return {
    hostname: getHostname(),
    localIp: getLocalIp(),
    networkInterfaces: getPhysicalNetworkInterfaces(),
    networkSummary: getNetworkSummary(),
    shareFolder,
    savedFolders: folderState.savedFolders,
    isSource: fileServer?.isRunning ?? false,
    sourceUrl: fileServer?.isRunning ? fileServer.url : null,
    isScreenSharing,
    streamUrl: isScreenSharing ? screenServer?.url : null,
    peers: getMergedPeers(),
  };
});

ipcMain.handle("scan", async () => {
  discovery?.scan();
  return scanNetworkDevices();
});

ipcMain.handle("pick-folder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Папка для раздачи по сети",
    properties: ["openDirectory"],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  shareFolder = result.filePaths[0];
  addSavedFolder(shareFolder);
  return shareFolder;
});

ipcMain.handle("select-folder", (_event, folderPath) => {
  const result = setSelectedFolder(folderPath);
  if (!result.ok) {
    return result;
  }
  shareFolder = result.settings.lastSelectedFolder;
  return {
    ok: true,
    shareFolder,
    savedFolders: result.settings.savedFolders,
  };
});

ipcMain.handle("remove-saved-folder", (_event, folderPath) => {
  const settings = removeSavedFolder(folderPath);
  if (shareFolder && path.resolve(shareFolder) === path.resolve(folderPath)) {
    shareFolder = settings.lastSelectedFolder;
  }
  return {
    ok: true,
    shareFolder,
    savedFolders: settings.savedFolders,
  };
});

ipcMain.handle("start-source", async (_event, folderPath) => {
  const folder = folderPath || shareFolder;
  if (!folder) {
    return { ok: false, message: "Сначала выберите папку с файлами или образом." };
  }

  if (fileServer.isRunning) {
    return { ok: false, message: "Раздача уже запущена на этом ПК." };
  }

  try {
    const result = await fileServer.start(folder);
    shareFolder = folder;
    addSavedFolder(folder);
    discovery.announceSource(result.port);
    sendStatus(`Источник активен: ${result.url}`);

    return {
      ok: true,
      url: result.url,
      firewall: result.firewall,
    };
  } catch (error) {
    return {
      ok: false,
      message: `Не удалось запустить сервер: ${error.message}`,
    };
  }
});

ipcMain.handle("stop-source", async () => {
  await fileServer.stop();
  discovery.announceStopSource();
  sendStatus("Раздача остановлена");
  return { ok: true };
});

ipcMain.handle("start-screen-share", async () => {
  if (isScreenSharing) {
    return { ok: false, message: "Трансляция экрана уже запущена." };
  }

  try {
    captureSourceId = await pickScreenSourceId();
    if (!captureSourceId) {
      return { ok: false, message: "Не удалось найти экран для трансляции." };
    }

    const result = await screenServer.start();
    createCaptureWindow();
    isScreenSharing = true;
    discovery.announceScreen(result.port);
    sendStatus(`Трансляция экрана: ${result.url}`);

    return {
      ok: true,
      url: result.url,
      firewall: result.firewall,
    };
  } catch (error) {
    await stopScreenShare();
    return {
      ok: false,
      message: `Не удалось запустить трансляцию: ${error.message}`,
    };
  }
});

ipcMain.handle("stop-screen-share", async () => {
  await stopScreenShare();
  sendStatus("Трансляция экрана остановлена");
  return { ok: true };
});

ipcMain.handle("capture-get-source-id", () => captureSourceId);

ipcMain.on("capture-frame", (_event, buffer) => {
  if (!isScreenSharing || !screenServer) {
    return;
  }
  screenServer.setFrame(Buffer.from(buffer));
});

ipcMain.on("capture-ready", () => {
  sendStatus("Экран передаётся учителю");
});

ipcMain.on("capture-error", async (_event, message) => {
  await stopScreenShare();
  sendStatus(message || "Ошибка захвата экрана");
});

ipcMain.handle("open-url", async (_event, url) => {
  if (url) {
    const normalized = normalizeHttpUrl(url);
    await shell.openExternal(normalized);
  }
});

function normalizeHttpUrl(url) {
  let value = String(url || "").trim();
  if (!value) {
    return value;
  }

  if (/^https:\/\//i.test(value)) {
    value = value.replace(/^https:\/\//i, "http://");
  }

  if (!/^https?:\/\//i.test(value)) {
    value = `http://${value}`;
  }

  return value;
}

ipcMain.handle("copy-to-clipboard", (_event, text) => {
  const { clipboard } = require("electron");
  clipboard.writeText(normalizeHttpUrl(text));
  return { ok: true };
});

ipcMain.handle("check-updates", async () => {
  sendStatus("Проверка обновлений на GitHub...");
  const result = await checkForUpdates(mainWindow);
  if (result.message) {
    sendStatus(result.message);
  }
  return result;
});

ipcMain.handle("get-app-version", () => app.getVersion());
