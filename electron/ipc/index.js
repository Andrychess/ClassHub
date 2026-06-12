const { ipcMain, dialog, shell, clipboard } = require("electron");
const { getLocalIp, getHostname, getPhysicalNetworkInterfaces } = require("../protocol");
const { getNetworkSummary } = require("../networkScan");
const {
  addSavedFolder,
  removeSavedFolder,
  setSelectedFolder,
  readFolderState,
  getSelectedFolder,
  readPinnedApps,
  togglePinnedApp,
} = require("../settings");
const { normalizeHttpUrl } = require("../urls");
const { openLinkTarget } = require("../linkUtils");
const { checkForUpdates } = require("../updater");
const { verifyTeacherPassword } = require("../teacherAuth");
const { listInstalledApps, getAppIcon, getAppIconsBatch, launchInstalledApp } = require("../installedApps");
const { fetchTeacherClassConfig } = require("../classConfig");
const { readDeviceSession } = require("../deviceSession");
const { getAutoLaunchSettings, setAutoLaunch } = require("../autoLaunch");
const {
  readClassesState,
  getActiveClass,
  getSharingClass,
  getJoinedClass,
  setActiveClass,
  setSharingClass,
  createClass,
  updateClass,
  deleteClass,
  joinClass,
  leaveClass,
  buildDiscoveredClasses,
  getClassById,
} = require("../classes");

function registerIpcHandlers(appContext) {
  ipcMain.handle("get-state", () => {
    const folderState = readFolderState();
    const classState = readClassesState();
    const { fileServer, screenServer, getMergedPeers, isScreenSharing } = appContext;

    return {
      hostname: getHostname(),
      localIp: getLocalIp(),
      networkInterfaces: getPhysicalNetworkInterfaces(),
      networkSummary: getNetworkSummary(),
      shareFolder: folderState.lastSelectedFolder,
      savedFolders: folderState.savedFolders,
      isSource: fileServer?.isRunning ?? false,
      sourceUrl: fileServer?.isRunning ? fileServer.url : null,
      isScreenSharing,
      streamUrl: isScreenSharing ? screenServer?.url : null,
      peers: getMergedPeers(),
      classes: classState.classes,
      activeClassId: classState.activeClassId,
      sharingClassId: classState.sharingClassId,
      activeClass: getActiveClass(),
      sharingClass: getSharingClass(),
      joinedClass: getJoinedClass(),
      discoveredClasses: buildDiscoveredClasses(getMergedPeers()),
      chatMessages: (appContext.chatServer?.getHistory() ?? []).map((message) => ({
        ...message,
        self: message.ip === getLocalIp(),
      })),
    };
  });

  ipcMain.handle("scan", async () => {
    appContext.discovery?.scan();
    return appContext.scanNetworkDevices();
  });

  ipcMain.handle("pick-folder", async () => {
    const result = await dialog.showOpenDialog(appContext.getMainWindow(), {
      title: "Папка для раздачи по сети",
      properties: ["openDirectory"],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const folder = result.filePaths[0];
    addSavedFolder(folder);
    return folder;
  });

  ipcMain.handle("select-folder", (_event, folderPath) => {
    const result = setSelectedFolder(folderPath);
    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      shareFolder: result.settings.lastSelectedFolder,
      savedFolders: result.settings.savedFolders,
    };
  });

  ipcMain.handle("remove-saved-folder", (_event, folderPath) => {
    const settings = removeSavedFolder(folderPath);
    return {
      ok: true,
      shareFolder: settings.lastSelectedFolder,
      savedFolders: settings.savedFolders,
    };
  });

  ipcMain.handle("start-source", async (_event, payload) => {
    const classId = typeof payload === "string" ? null : payload?.classId;
    const folderPath = typeof payload === "string" ? payload : payload?.folderPath;
    const targetClass = classId ? getClassById(classId) : getActiveClass();
    const folder = folderPath || targetClass?.shareFolder || getSelectedFolder();

    if (!folder) {
      return { ok: false, message: "Сначала выберите папку для класса." };
    }

    if (!targetClass) {
      return { ok: false, message: "Сначала создайте или выберите класс." };
    }

    if (appContext.fileServer.isRunning) {
      const sharingClass = getSharingClass();
      if (sharingClass?.id === targetClass.id) {
        return {
          ok: true,
          url: appContext.fileServer.url,
          classId: targetClass.id,
          className: targetClass.name,
          alreadyRunning: true,
        };
      }

      await appContext.fileServer.stop();
      setSharingClass(null);
      appContext.discovery.announceStopSource();
    }

    try {
      const classMeta = {
        classId: targetClass.id,
        className: targetClass.name,
        visibleApps: targetClass.visibleApps || [],
        customLinks: targetClass.customLinks || [],
      };
      const result = await appContext.fileServer.start(folder, classMeta);
      addSavedFolder(folder);
      setSharingClass(targetClass.id);
      appContext.syncDiscoveryClassContext();
      appContext.discovery.announceSource(result.port, classMeta);
      appContext.sendStatus(`Класс «${targetClass.name}» активен: ${result.url}`);

      return {
        ok: true,
        url: result.url,
        classId: targetClass.id,
        className: targetClass.name,
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
    await appContext.fileServer.stop();
    setSharingClass(null);
    appContext.syncDiscoveryClassContext();
    appContext.discovery.announceStopSource();
    appContext.sendStatus("Раздача остановлена");
    return { ok: true };
  });

  ipcMain.handle("start-screen-share", async () => {
    if (appContext.isScreenSharing) {
      return { ok: false, message: "Трансляция экрана уже запущена." };
    }

    try {
      const captureSourceId = await appContext.pickScreenSourceId();
      if (!captureSourceId) {
        return { ok: false, message: "Не удалось найти экран для трансляции." };
      }

      const result = await appContext.screenServer.start();
      appContext.setCaptureSourceId(captureSourceId);
      appContext.setScreenSharing(true);
      appContext.createCaptureWindow();
      appContext.discovery.announceScreen(result.port);
      appContext.refreshServiceHints().catch(() => {});
      appContext.sendStatus(`Трансляция экрана: ${result.url}. У учителя в списке появится «В эфире» в течение нескольких секунд.`);

      return {
        ok: true,
        url: result.url,
        firewall: result.firewall,
      };
    } catch (error) {
      await appContext.stopScreenShare();
      return {
        ok: false,
        message: `Не удалось запустить трансляцию: ${error.message}`,
      };
    }
  });

  ipcMain.handle("stop-screen-share", async () => {
    await appContext.stopScreenShare();
    appContext.sendStatus("Трансляция экрана остановлена");
    return { ok: true };
  });

  ipcMain.handle("capture-get-source-id", () => appContext.getCaptureSourceId());

  ipcMain.on("capture-frame", (_event, buffer) => {
    if (!appContext.screenServer?.isRunning) {
      return;
    }
    appContext.screenServer.setFrame(Buffer.from(buffer));
  });

  ipcMain.on("capture-ready", () => {
    appContext.sendStatus("Экран передаётся учителю");
  });

  ipcMain.on("capture-error", async (_event, message) => {
    await appContext.stopScreenShare();
    appContext.sendStatus(message || "Ошибка захвата экрана");
  });

  ipcMain.handle("open-url", async (_event, url) => openLinkTarget(url));

  ipcMain.handle("open-stream-viewer", (_event, url) => appContext.openStreamViewer(url));

  ipcMain.handle("open-stream-viewer-ip", (_event, ip) => {
    if (!ip) {
      return { ok: false, message: "Укажите IP-адрес устройства." };
    }
    return appContext.openStreamViewerForIp(String(ip).trim());
  });

  ipcMain.handle("copy-to-clipboard", (_event, text) => {
    clipboard.writeText(normalizeHttpUrl(text));
    return { ok: true };
  });

  ipcMain.handle("check-updates", async () => {
    appContext.sendStatus("Проверка обновлений на GitHub...");
    const result = await checkForUpdates(appContext.getMainWindow());
    if (result.message) {
      appContext.sendStatus(result.message);
    }
    return result;
  });

  ipcMain.handle("get-app-version", () => appContext.getAppVersion());

  ipcMain.handle("send-chat-message", async (_event, text) => appContext.sendChatMessage(text));

  ipcMain.handle("get-chat-history", () => {
    const localIp = getLocalIp();
    return (appContext.chatServer?.getHistory() ?? []).map((message) => ({
      ...message,
      self: message.ip === localIp,
    }));
  });

  ipcMain.handle("verify-teacher-password", (_event, password) => {
    const ok = verifyTeacherPassword(password);
    return {
      ok,
      message: ok ? null : "Неверный пароль преподавателя.",
    };
  });

  ipcMain.handle("get-installed-apps", () => {
    try {
      const apps = listInstalledApps();
      return { ok: true, apps, pinnedApps: readPinnedApps() };
    } catch (error) {
      return {
        ok: false,
        apps: [],
        pinnedApps: readPinnedApps(),
        message: `Не удалось загрузить список программ: ${error.message}`,
      };
    }
  });

  ipcMain.handle("get-app-icon", async (_event, appPath) => {
    const icon = await getAppIcon(appPath);
    return { ok: Boolean(icon), icon };
  });

  ipcMain.handle("get-app-icons-batch", async (_event, paths) => {
    try {
      const icons = await getAppIconsBatch(paths);
      return { ok: true, icons };
    } catch (error) {
      return { ok: false, icons: {}, message: error.message };
    }
  });

  ipcMain.handle("get-pinned-apps", () => readPinnedApps());

  ipcMain.handle("toggle-pinned-app", (_event, appPath) => togglePinnedApp(appPath));

  ipcMain.handle("launch-app", async (_event, appPath) => launchInstalledApp(appPath));

  ipcMain.handle("get-classes", () => {
    const state = readClassesState();
    return {
      classes: state.classes,
      activeClassId: state.activeClassId,
      sharingClassId: state.sharingClassId,
      activeClass: getActiveClass(),
      sharingClass: getSharingClass(),
      joinedClass: getJoinedClass(),
      discoveredClasses: buildDiscoveredClasses(appContext.getMergedPeers()),
    };
  });

  ipcMain.handle("create-class", (_event, payload) => {
    const result = createClass(payload || {});
    if (result.ok) {
      appContext.syncDiscoveryClassContext();
    }
    return result;
  });

  ipcMain.handle("update-class", (_event, classId, patch) => {
    const result = updateClass(classId, patch || {});
    if (result.ok) {
      appContext.syncDiscoveryClassContext();
      const sharing = getSharingClass();
      if (sharing?.id === classId && appContext.fileServer?.isRunning) {
        appContext.fileServer.updateClassMeta({
          classId: result.classItem.id,
          className: result.classItem.name,
          visibleApps: result.classItem.visibleApps || [],
          customLinks: result.classItem.customLinks || [],
        });
      }
    }
    return result;
  });

  ipcMain.handle("delete-class", (_event, classId) => deleteClass(classId));

  ipcMain.handle("set-active-class", (_event, classId) => {
    const result = setActiveClass(classId);
    appContext.syncDiscoveryClassContext();
    return result;
  });

  ipcMain.handle("join-class", (_event, payload) => {
    const result = joinClass(payload || {});
    appContext.syncDiscoveryClassContext();
    return result;
  });

  ipcMain.handle("leave-class", () => {
    const result = leaveClass();
    appContext.syncDiscoveryClassContext();
    return result;
  });

  ipcMain.handle("get-discovered-classes", () =>
    buildDiscoveredClasses(appContext.getMergedPeers())
  );

  ipcMain.handle("discover-teacher-classes", async () => {
    try {
      const result = await appContext.discoverTeacherClassesInNetwork();
      return result;
    } catch (error) {
      return {
        ok: false,
        teachers: [],
        classes: [],
        teacherCount: 0,
        classCount: 0,
        message: error.message || "Не удалось найти преподавателей.",
      };
    }
  });

  ipcMain.handle("set-app-role", (_event, role) => {
    appContext.setAppRole(role);
    return { ok: true, role: appContext.getAppRole() };
  });

  ipcMain.handle("get-device-session", () => readDeviceSession());

  ipcMain.handle("get-auto-launch", () => getAutoLaunchSettings());

  ipcMain.handle("set-auto-launch", (_event, enabled) => setAutoLaunch(Boolean(enabled)));

  ipcMain.handle("fetch-teacher-class-config", async (_event, teacherIp) => {
    const config = await fetchTeacherClassConfig(teacherIp);
    return { ok: Boolean(config), config };
  });
}

module.exports = { registerIpcHandlers };
