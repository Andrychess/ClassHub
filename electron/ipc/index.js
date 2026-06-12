const { ipcMain, dialog, shell, clipboard } = require("electron");
const { getLocalIp, getHostname, getPhysicalNetworkInterfaces } = require("../protocol");
const { getNetworkSummary } = require("../networkScan");
const {
  addSavedFolder,
  removeSavedFolder,
  setSelectedFolder,
  readFolderState,
  getSelectedFolder,
} = require("../settings");
const { normalizeHttpUrl } = require("../urls");
const { checkForUpdates } = require("../updater");

function registerIpcHandlers(appContext) {
  ipcMain.handle("get-state", () => {
    const folderState = readFolderState();
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

  ipcMain.handle("start-source", async (_event, folderPath) => {
    const folder = folderPath || getSelectedFolder();
    if (!folder) {
      return { ok: false, message: "Сначала выберите папку с файлами или образом." };
    }

    if (appContext.fileServer.isRunning) {
      return { ok: false, message: "Раздача уже запущена на этом ПК." };
    }

    try {
      const result = await appContext.fileServer.start(folder);
      addSavedFolder(folder);
      appContext.discovery.announceSource(result.port);
      appContext.sendStatus(`Источник активен: ${result.url}`);

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
    await appContext.fileServer.stop();
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
      appContext.startScreenCaptureLoop();
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

  ipcMain.handle("open-url", async (_event, url) => {
    if (url) {
      await shell.openExternal(normalizeHttpUrl(url));
    }
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
}

module.exports = { registerIpcHandlers };
