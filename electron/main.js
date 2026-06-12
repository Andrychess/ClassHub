const { app, BrowserWindow, dialog, desktopCapturer, session } = require("electron");
const fs = require("fs");
const path = require("path");
const { DiscoveryService } = require("./discovery");
const { FileServer } = require("./fileServer");
const { ScreenServer } = require("./screenServer");
const { ChatServer } = require("./chatServer");
const { postChatMessage } = require("./chatDelivery");
const { scanLocalNetwork, mergePeerLists } = require("./networkScan");
const { probeHttpSource, probeHttpStream, buildServiceHint } = require("./sourceProbe");
const { getLocalIp, getHostname } = require("./protocol");
const { syncFolderState } = require("./settings");
const {
  getActiveClass,
  getSharingClass,
  getJoinedClass,
  readClassesState,
} = require("./classes");
const { ensureClassHubFirewallRules } = require("./firewall");
const { setStatusHandler } = require("./updater");
const { registerIpcHandlers } = require("./ipc");
const { normalizeHttpUrl, buildStreamUrl } = require("./urls");
const { buildTeacherApiPayload, discoverTeacherClasses } = require("./teacherDiscovery");
const { saveLastRole, clearLastRole } = require("./deviceSession");
const {
  MAIN_WINDOW,
  CAPTURE_WINDOW,
  APP_BACKGROUND,
  NETWORK_SCAN_DELAY_MS,
  SERVICE_PROBE_INTERVAL_MS,
  FILE_SERVER_PORT,
  SCREEN_SERVER_PORT,
} = require("./constants");

let mainWindow = null;
let captureWindow = null;
let streamViewerWindow = null;
let discovery = null;
let fileServer = null;
let screenServer = null;
let chatServer = null;
let captureSourceId = null;
let isScreenSharing = false;
let networkDevices = [];
let screenCaptureTimer = null;
let serviceHints = new Map();
let serviceProbeRunning = false;
let appRole = null;

function getHtmlPath() {
  return path.join(app.getAppPath(), "src", "index.html");
}

function getCaptureHtmlPath() {
  return path.join(app.getAppPath(), "src", "capture.html");
}

function openStreamViewer(url) {
  const normalized = normalizeHttpUrl(url);
  if (!normalized) {
    return { ok: false, message: "Не указана ссылка на трансляцию." };
  }

  if (streamViewerWindow && !streamViewerWindow.isDestroyed()) {
    streamViewerWindow.loadFile(path.join(__dirname, "stream-viewer.html"), {
      query: { url: normalized },
    });
    streamViewerWindow.focus();
    return { ok: true, url: normalized };
  }

  streamViewerWindow = new BrowserWindow({
    width: 960,
    height: 620,
    title: "ClassHub — трансляция экрана",
    backgroundColor: "#000000",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  streamViewerWindow.loadFile(path.join(__dirname, "stream-viewer.html"), {
    query: { url: normalized },
  });
  streamViewerWindow.on("closed", () => {
    streamViewerWindow = null;
  });

  return { ok: true, url: normalized };
}

function openStreamViewerForIp(ip, port = SCREEN_SERVER_PORT) {
  return openStreamViewer(buildStreamUrl(ip, port));
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
      backgroundThrottling: false,
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

function setupScreenCapture() {
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: { width: 1, height: 1 },
      });

      if (!sources.length) {
        callback(null);
        return;
      }

      const entireScreen = sources.find((source) => /screen|экран|display/i.test(source.name));
      callback({ video: entireScreen || sources[0], audio: false });
    } catch {
      callback(null);
    }
  });
}

function stopScreenCaptureLoop() {
  if (screenCaptureTimer) {
    clearInterval(screenCaptureTimer);
    screenCaptureTimer = null;
  }
}

async function captureScreenFrame() {
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: 960, height: 540 },
  });

  if (!sources.length) {
    return;
  }

  const entireScreen = sources.find((source) => /screen|экран|display/i.test(source.name));
  const source = entireScreen || sources[0];
  if (!source?.thumbnail || source.thumbnail.isEmpty()) {
    return;
  }

  screenServer.setFrame(source.thumbnail.toJPEG(55));
}

function startScreenCaptureLoop() {
  stopScreenCaptureLoop();
  captureScreenFrame().catch(() => {});
  screenCaptureTimer = setInterval(() => {
    captureScreenFrame().catch(() => {});
  }, 250);
}

async function stopScreenShare() {
  isScreenSharing = false;
  captureSourceId = null;
  stopScreenCaptureLoop();

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

function pushChatMessage(message, { self = false } = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("chat-message", { ...message, self });
  }
}

function getAppRole() {
  return appRole;
}

function setAppRole(role) {
  appRole = role === "teacher" || role === "student" ? role : null;
  if (appRole) {
    saveLastRole(appRole);
  } else {
    clearLastRole();
  }
  syncDiscoveryClassContext();
}

function syncDiscoveryClassContext() {
  if (!discovery) {
    return;
  }

  discovery.setRoleContext(appRole);

  const sharingClass = getSharingClass();
  const joinedClass = getJoinedClass();
  const activeClass = getActiveClass();

  if (sharingClass) {
    discovery.setClassContext({
      classId: sharingClass.id,
      className: sharingClass.name,
    });
    return;
  }

  if (joinedClass?.classId) {
    discovery.setClassContext({
      classId: joinedClass.classId,
      className: joinedClass.className,
    });
    return;
  }

  if (activeClass) {
    discovery.setClassContext({
      classId: activeClass.id,
      className: activeClass.name,
    });
    return;
  }

  discovery.setClassContext({ classId: null, className: null });
}

function getLocalClassId() {
  const sharingClass = getSharingClass();
  if (sharingClass) {
    return sharingClass.id;
  }

  const joinedClass = getJoinedClass();
  return joinedClass?.classId || null;
}

function getChatPeerIps() {
  const localClassId = getLocalClassId();
  const ips = new Set();

  for (const peer of getMergedPeers()) {
    if (peer.isSelf || !peer.ip) {
      continue;
    }

    if (localClassId && peer.classId && peer.classId !== localClassId) {
      continue;
    }

    ips.add(peer.ip);
  }

  return [...ips];
}

async function sendChatMessage(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    return { ok: false, message: "Введите текст сообщения." };
  }

  if (!chatServer?.isRunning) {
    return { ok: false, message: "Чат не запущен на этом ПК." };
  }

  const message = chatServer.addMessage(
    {
      hostname: getHostname(),
      ip: getLocalIp(),
      text: trimmed,
      ts: Date.now(),
      classId: getLocalClassId(),
    },
    { notify: false }
  );

  if (!message) {
    return { ok: false, message: "Не удалось отправить сообщение." };
  }

  pushChatMessage(message, { self: true });

  const targets = getChatPeerIps();
  const results = await Promise.allSettled(
    targets.map((ip) => postChatMessage(ip, message))
  );
  const delivered = results.filter((result) => result.status === "fulfilled" && result.value).length;

  return {
    ok: true,
    message,
    delivered,
    targets: targets.length,
  };
}

function setupChatServer() {
  chatServer = new ChatServer();
  chatServer.setMessageHandler((message) => {
    pushChatMessage(message, { self: false });
  });
  chatServer.setTeacherInfoProvider(() => {
    const state = readClassesState();
    return buildTeacherApiPayload(state, appRole);
  });
}

async function discoverTeacherClassesInNetwork() {
  return discoverTeacherClasses({
    scanNetwork: scanNetworkDevices,
    discoveryScan: () => discovery?.scan(),
    getPeers: getMergedPeers,
  });
}

function collectPeerIps() {
  const ips = new Set();
  for (const peer of discovery?.getPeerList() ?? []) {
    if (!peer.isSelf && peer.ip) {
      ips.add(peer.ip);
    }
  }
  for (const device of networkDevices) {
    if (device.ip) {
      ips.add(device.ip);
    }
  }
  return ips;
}

async function refreshServiceHints() {
  if (serviceProbeRunning) {
    return;
  }

  serviceProbeRunning = true;
  try {
    const ips = collectPeerIps();
    const nextHints = new Map();

    await Promise.all(
      Array.from(ips).map(async (ip) => {
        const [source, stream] = await Promise.all([
          probeHttpSource(ip, FILE_SERVER_PORT, 800),
          probeHttpStream(ip, SCREEN_SERVER_PORT, 800),
        ]);
        const hint = buildServiceHint(source, stream);
        if (hint) {
          nextHints.set(ip, hint);
        }
      })
    );

    serviceHints = nextHints;
    broadcastMergedPeers();
  } finally {
    serviceProbeRunning = false;
  }
}

function getMergedPeers() {
  const classHubPeers = discovery?.getPeerList() ?? [];
  return mergePeerLists(classHubPeers, networkDevices, serviceHints);
}

function broadcastMergedPeers() {
  broadcastPeers(getMergedPeers());
}

function setupDiscovery() {
  let probeDebounce = null;
  discovery = new DiscoveryService(() => {
    broadcastMergedPeers();
    if (probeDebounce) {
      clearTimeout(probeDebounce);
    }
    probeDebounce = setTimeout(() => {
      refreshServiceHints().catch(() => {});
    }, 500);
  });
  discovery.start();
}

async function scanNetworkDevices(options = {}) {
  if (!options.quiet) {
    sendStatus("Сканирование локальной сети...");
  }
  networkDevices = await scanLocalNetwork();
  await refreshServiceHints();
  if (!options.quiet) {
    sendStatus(`Найдено устройств в сети: ${getMergedPeers().length}`);
  }
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
  get chatServer() {
    return chatServer;
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
  refreshServiceHints,
  openStreamViewer,
  openStreamViewerForIp,
  sendChatMessage,
  syncDiscoveryClassContext,
  getLocalClassId,
  getAppRole,
  setAppRole,
  discoverTeacherClassesInNetwork,
  createCaptureWindow,
  stopScreenShare,
  pickScreenSourceId,
  startScreenCaptureLoop,
  stopScreenCaptureLoop,
  getAppVersion: () => app.getVersion(),
};

registerIpcHandlers(appContext);

app.whenReady().then(async () => {
  setupScreenCapture();
  setStatusHandler(sendStatus);
  await ensureClassHubFirewallRules();
  syncFolderState();
  fileServer = new FileServer();
  screenServer = new ScreenServer();
  setupChatServer();
  try {
    await chatServer.start();
  } catch (error) {
    sendStatus(`Чат недоступен: ${error.message}`);
  }
  setupDiscovery();
  syncDiscoveryClassContext();
  createWindow();
  setTimeout(() => {
    scanNetworkDevices().catch(() => {});
  }, NETWORK_SCAN_DELAY_MS);
  setInterval(() => {
    refreshServiceHints().catch(() => {});
  }, SERVICE_PROBE_INTERVAL_MS);
  setInterval(() => {
    scanNetworkDevices({ quiet: true }).catch(() => {});
  }, 20000);

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
  if (chatServer) {
    await chatServer.stop();
  }
  if (discovery) {
    discovery.stop();
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});

