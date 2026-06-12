const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const { MAX_SAVED_FOLDERS, MAX_PINNED_APPS } = require("./constants");

function getSettingsPath() {
  return path.join(app.getPath("userData"), "folders.json");
}

function defaultSettings() {
  return {
    savedFolders: [],
    lastSelectedFolder: null,
    pinnedApps: [],
  };
}

function normalizePinnedApps(pinnedApps) {
  if (!Array.isArray(pinnedApps)) {
    return [];
  }

  const unique = [];
  for (const item of pinnedApps) {
    const value = String(item || "").trim();
    if (!value || unique.includes(value)) {
      continue;
    }
    unique.push(value);
  }

  return unique.slice(0, MAX_PINNED_APPS);
}

function loadSettings() {
  const filePath = getSettingsPath();
  try {
    if (!fs.existsSync(filePath)) {
      return defaultSettings();
    }
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return {
      savedFolders: Array.isArray(data.savedFolders) ? data.savedFolders : [],
      lastSelectedFolder: data.lastSelectedFolder || null,
      pinnedApps: normalizePinnedApps(data.pinnedApps),
    };
  } catch {
    return defaultSettings();
  }
}

function saveSettings(settings) {
  const filePath = getSettingsPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), "utf8");
}

function normalizeFolder(folderPath) {
  return path.resolve(folderPath);
}

function folderExists(folderPath) {
  try {
    return fs.existsSync(folderPath) && fs.statSync(folderPath).isDirectory();
  } catch {
    return false;
  }
}

function pruneMissingFolders(folders) {
  return folders.filter((folder) => folderExists(folder));
}

function normalizeFolderState(settings) {
  const savedFolders = pruneMissingFolders(settings.savedFolders);
  let lastSelectedFolder = settings.lastSelectedFolder;

  if (lastSelectedFolder && !folderExists(lastSelectedFolder)) {
    lastSelectedFolder = savedFolders[0] || null;
  }

  return { savedFolders, lastSelectedFolder };
}

function readFolderState() {
  return normalizeFolderState(loadSettings());
}

function syncFolderState() {
  const stored = loadSettings();
  const normalized = normalizeFolderState(stored);

  if (
    JSON.stringify(normalized.savedFolders) !== JSON.stringify(stored.savedFolders) ||
    normalized.lastSelectedFolder !== stored.lastSelectedFolder
  ) {
    saveSettings(normalized);
  }

  return normalized;
}

function addSavedFolder(folderPath) {
  const normalized = normalizeFolder(folderPath);
  if (!folderExists(normalized)) {
    return loadSettings();
  }

  const settings = loadSettings();
  const others = settings.savedFolders.filter((folder) => folder !== normalized);
  settings.savedFolders = [normalized, ...others].slice(0, MAX_SAVED_FOLDERS);
  settings.lastSelectedFolder = normalized;
  saveSettings(settings);
  return settings;
}

function removeSavedFolder(folderPath) {
  const normalized = normalizeFolder(folderPath);
  const settings = loadSettings();
  settings.savedFolders = settings.savedFolders.filter((folder) => folder !== normalized);
  if (settings.lastSelectedFolder === normalized) {
    settings.lastSelectedFolder = settings.savedFolders[0] || null;
  }
  saveSettings(settings);
  return settings;
}

function setSelectedFolder(folderPath) {
  const normalized = normalizeFolder(folderPath);
  if (!folderExists(normalized)) {
    return { ok: false, message: "Папка не найдена на диске." };
  }

  const settings = addSavedFolder(normalized);
  return { ok: true, settings };
}

function getSelectedFolder() {
  return readFolderState().lastSelectedFolder;
}

function readPinnedApps() {
  return normalizePinnedApps(loadSettings().pinnedApps);
}

function togglePinnedApp(appPath) {
  const normalized = String(appPath || "").trim();
  if (!normalized) {
    return { ok: false, message: "Не указана программа.", pinnedApps: readPinnedApps() };
  }

  const settings = loadSettings();
  const pinnedApps = normalizePinnedApps(settings.pinnedApps);
  const index = pinnedApps.indexOf(normalized);

  if (index >= 0) {
    pinnedApps.splice(index, 1);
  } else {
    pinnedApps.unshift(normalized);
  }

  settings.pinnedApps = pinnedApps.slice(0, MAX_PINNED_APPS);
  saveSettings(settings);

  return { ok: true, pinnedApps: settings.pinnedApps };
}

module.exports = {
  addSavedFolder,
  removeSavedFolder,
  setSelectedFolder,
  readFolderState,
  syncFolderState,
  getSelectedFolder,
  folderExists,
  readPinnedApps,
  togglePinnedApp,
};
