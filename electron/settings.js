const fs = require("fs");
const path = require("path");
const { app } = require("electron");

const MAX_FOLDERS = 20;

function getSettingsPath() {
  return path.join(app.getPath("userData"), "folders.json");
}

function defaultSettings() {
  return {
    savedFolders: [],
    lastSelectedFolder: null,
  };
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

function addSavedFolder(folderPath) {
  const normalized = normalizeFolder(folderPath);
  if (!folderExists(normalized)) {
    return loadSettings();
  }

  const settings = loadSettings();
  const others = settings.savedFolders.filter((folder) => folder !== normalized);
  settings.savedFolders = [normalized, ...others].slice(0, MAX_FOLDERS);
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

function getFolderState() {
  const settings = loadSettings();
  settings.savedFolders = pruneMissingFolders(settings.savedFolders);
  if (settings.lastSelectedFolder && !folderExists(settings.lastSelectedFolder)) {
    settings.lastSelectedFolder = settings.savedFolders[0] || null;
  }
  saveSettings(settings);
  return settings;
}

module.exports = {
  addSavedFolder,
  removeSavedFolder,
  setSelectedFolder,
  getFolderState,
  folderExists,
};
