const https = require("https");
const { app, dialog, shell } = require("electron");
const { autoUpdater } = require("electron-updater");

const GITHUB_OWNER = "Andrychess";
const GITHUB_REPO = "ClassHub";
const GITHUB_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
const GITHUB_RELEASES_PAGE = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`;

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "ClassHub-Updater",
        },
      },
      (response) => {
        let body = "";
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          if (response.statusCode && response.statusCode >= 400) {
            reject(new Error(`GitHub API ${response.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    request.on("error", reject);
    request.setTimeout(15000, () => {
      request.destroy(new Error("Превышено время ожидания GitHub"));
    });
  });
}

function normalizeVersion(value) {
  const cleaned = String(value || "0.0.0")
    .trim()
    .replace(/^v/i, "")
    .split("-")[0];

  const parts = cleaned.split(".").map((part) => Number(part) || 0);
  while (parts.length < 3) {
    parts.push(0);
  }
  return parts.slice(0, 3);
}

function isNewerVersion(latest, current) {
  const next = normalizeVersion(latest);
  const now = normalizeVersion(current);

  for (let index = 0; index < 3; index += 1) {
    if (next[index] > now[index]) {
      return true;
    }
    if (next[index] < now[index]) {
      return false;
    }
  }

  return false;
}

function pickWindowsAsset(assets = []) {
  const preferred = assets.find((asset) => /setup.*\.exe$/i.test(asset.name));
  if (preferred) {
    return preferred;
  }

  return assets.find((asset) => asset.name.toLowerCase().endsWith(".exe")) || null;
}

async function checkViaGitHubApi(parentWindow) {
  const currentVersion = app.getVersion();

  try {
    const release = await fetchJson(GITHUB_API);
    const latestVersion = String(release.tag_name || release.name || "").replace(/^v/i, "");

    if (!latestVersion) {
      return {
        ok: false,
        message: "Не удалось определить номер версии на GitHub.",
      };
    }

    if (!isNewerVersion(latestVersion, currentVersion)) {
      return {
        ok: true,
        upToDate: true,
        currentVersion,
        latestVersion,
        message: `У вас актуальная версия ClassHub ${currentVersion}.`,
      };
    }

    const asset = pickWindowsAsset(release.assets);
    const downloadUrl = asset?.browser_download_url || release.html_url || GITHUB_RELEASES_PAGE;
    const releaseNotes = String(release.body || "").trim().slice(0, 800);

    const choice = await dialog.showMessageBox(parentWindow, {
      type: "info",
      title: "ClassHub — доступно обновление",
      message: `Найдена версия ${latestVersion}`,
      detail: `Сейчас установлена: ${currentVersion}\n\n${releaseNotes || "Откроется страница загрузки с GitHub."}`,
      buttons: ["Скачать обновление", "Позже"],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });

    if (choice.response === 0) {
      await shell.openExternal(downloadUrl);
      return {
        ok: true,
        updateAvailable: true,
        currentVersion,
        latestVersion,
        downloadUrl,
        message: `Открыта загрузка версии ${latestVersion}.`,
      };
    }

    return {
      ok: true,
      updateAvailable: true,
      currentVersion,
      latestVersion,
      message: `Доступна версия ${latestVersion}.`,
    };
  } catch (error) {
    if (String(error.message).includes("404") || String(error.message).includes("GitHub API 404")) {
      return {
        ok: false,
        message: "На GitHub пока нет опубликованных релизов.",
      };
    }

    return {
      ok: false,
      message: `Не удалось проверить обновления: ${error.message}`,
    };
  }
}

async function checkViaAutoUpdater(parentWindow) {
  const currentVersion = app.getVersion();

  return new Promise((resolve) => {
    const cleanup = () => {
      autoUpdater.removeListener("update-available", onAvailable);
      autoUpdater.removeListener("update-not-available", onNotAvailable);
      autoUpdater.removeListener("error", onError);
      autoUpdater.removeListener("download-progress", onProgress);
      autoUpdater.removeListener("update-downloaded", onDownloaded);
    };

    const onProgress = (_progress) => {
      sendStatus?.("Загрузка обновления...");
    };

    const onDownloaded = async () => {
      cleanup();
      const choice = await dialog.showMessageBox(parentWindow, {
        type: "info",
        title: "ClassHub — обновление готово",
        message: "Новая версия загружена",
        detail: "Перезапустить ClassHub и установить обновление?",
        buttons: ["Перезапустить", "Позже"],
        defaultId: 0,
        cancelId: 1,
      });

      if (choice.response === 0) {
        autoUpdater.quitAndInstall(false, true);
      }

      resolve({
        ok: true,
        updateAvailable: true,
        currentVersion,
        message: "Обновление загружено. Можно перезапустить приложение.",
      });
    };

    const onAvailable = async (info) => {
      const latestVersion = info.version;
      const choice = await dialog.showMessageBox(parentWindow, {
        type: "info",
        title: "ClassHub — доступно обновление",
        message: `Найдена версия ${latestVersion}`,
        detail: `Сейчас установлена: ${currentVersion}\n\nСкачать и установить автоматически?`,
        buttons: ["Скачать", "Позже"],
        defaultId: 0,
        cancelId: 1,
      });

      if (choice.response !== 0) {
        cleanup();
        resolve({
          ok: true,
          updateAvailable: true,
          currentVersion,
          latestVersion,
          message: `Доступна версия ${latestVersion}.`,
        });
        return;
      }

      autoUpdater.downloadUpdate().catch(async (error) => {
        cleanup();
        resolve({
          ok: false,
          message: `Не удалось скачать обновление: ${error.message}`,
        });
      });
    };

    const onNotAvailable = () => {
      cleanup();
      resolve({
        ok: true,
        upToDate: true,
        currentVersion,
        message: `У вас актуальная версия ClassHub ${currentVersion}.`,
      });
    };

    const onError = async (error) => {
      cleanup();
      const fallback = await checkViaGitHubApi(parentWindow);
      if (fallback.ok || !String(error.message).includes("404")) {
        resolve(fallback);
        return;
      }
      resolve({
        ok: false,
        message: `Не удалось проверить обновления: ${error.message}`,
      });
    };

    autoUpdater.on("update-available", onAvailable);
    autoUpdater.on("update-not-available", onNotAvailable);
    autoUpdater.on("error", onError);
    autoUpdater.on("download-progress", onProgress);
    autoUpdater.on("update-downloaded", onDownloaded);

    autoUpdater.checkForUpdates().catch(onError);
  });
}

let sendStatus = null;

function setStatusHandler(handler) {
  sendStatus = handler;
}

async function checkForUpdates(parentWindow) {
  if (app.isPackaged) {
    return checkViaAutoUpdater(parentWindow);
  }

  return checkViaGitHubApi(parentWindow);
}

module.exports = {
  checkForUpdates,
  setStatusHandler,
  GITHUB_RELEASES_PAGE,
};
