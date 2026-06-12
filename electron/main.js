const { app, BrowserWindow, dialog, desktopCapturer } = require("electron");
const fs = require("fs");
const path = require("path");
const { DiscoveryService } = require("./discovery");
const { FileServer } = require("./fileServer");
const { ScreenServer } = require("./screenServer");
const { scanLocalNetwork, mergePeerLists } = require("./networkScan");
const { syncFolderState } = require("./settings");
const { ensureClassHubFirewallRules } = require("./firewall");
const { setStatusHandler } = require("./updater");
const { registerIpcHandlers } = require("./ipc");
const {
  MAIN_WINDOW,
  CAPTURE_WINDOW,
  APP_BACKGROUND,
  NETWORK_SCAN_DELAY_MS,
} = require("./constants");

let mainWindow = null;
let captureWindow = null;
let discovery = null;
let fileServer = null;
let screenServer = null;
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
    ...MAIN_WINDOW,
    title: "ClassHub",
    backgroundColor: APP_BACKGROUND,
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
    ...CAPTURE_WINDOW,
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

const appContext = {
  getMainWindow: () => mainWindow,
  get discovery() {
    return discovery;
  },
  get fileServer() {
    return fileServer;
  },
  get screenServer() {
    return screenServer;
  },
  get isScreenSharing() {
    return isScreenSharing;
  },
  setScreenSharing(value) {
    isScreenSharing = value;
  },
  getCaptureSourceId: () => captureSourceId,
  setCaptureSourceId(value) {
    captureSourceId = value;
  },
  sendStatus,
  getMergedPeers,
  scanNetworkDevices,
  createCaptureWindow,
  stopScreenShare,
  pickScreenSourceId,
  getAppVersion: () => app.getVersion(),
};

registerIpcHandlers(appContext);

app.whenReady().then(async () => {
  setStatusHandler(sendStatus);
  await ensureClassHubFirewallRules();
  syncFolderState();
  fileServer = new FileServer();
  screenServer = new ScreenServer();
  setupDiscovery();
  createWindow();
  setTimeout(() => {
    scanNetworkDevices().catch(() => {});
  }, NETWORK_SCAN_DELAY_MS);

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
