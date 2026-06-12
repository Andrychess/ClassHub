const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { app, shell } = require("electron");

const MAX_APPS = 160;
const ICON_BATCH_LIMIT = 32;
const shortcutTargetCache = new Map();

function getStartMenuDirs() {
  const dirs = [];

  if (process.env.APPDATA) {
    dirs.push(path.join(process.env.APPDATA, "Microsoft", "Windows", "Start Menu", "Programs"));
  }

  if (process.env.ProgramData) {
    dirs.push(path.join(process.env.ProgramData, "Microsoft", "Windows", "Start Menu", "Programs"));
  }

  return dirs.filter((dir) => fs.existsSync(dir));
}

function scanShortcuts(dir, apps, seen) {
  if (apps.length >= MAX_APPS) {
    return;
  }

  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (apps.length >= MAX_APPS) {
      break;
    }

    const fullPath = path.normalize(path.join(dir, entry.name));
    if (entry.isDirectory()) {
      scanShortcuts(fullPath, apps, seen);
      continue;
    }

    if (!entry.name.toLowerCase().endsWith(".lnk")) {
      continue;
    }

    const name = path.basename(entry.name, ".lnk").trim();
    if (!name) {
      continue;
    }

    const key = name.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    apps.push({ name, path: fullPath });
  }
}

function resolveShortcutTarget(lnkPath) {
  const normalized = path.normalize(String(lnkPath || "").trim());
  if (shortcutTargetCache.has(normalized)) {
    return Promise.resolve(shortcutTargetCache.get(normalized));
  }

  return new Promise((resolve) => {
    if (process.platform !== "win32" || !normalized.toLowerCase().endsWith(".lnk")) {
      shortcutTargetCache.set(normalized, normalized);
      resolve(normalized);
      return;
    }

    const escaped = normalized.replace(/'/g, "''");
    const command = `$s=(New-Object -ComObject WScript.Shell).CreateShortcut('${escaped}'); if ($s.TargetPath) { Write-Output $s.TargetPath }`;

    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", command],
      { windowsHide: true, timeout: 4000 },
      (error, stdout) => {
        let target = normalized;
        if (!error) {
          const resolved = path.normalize(String(stdout || "").trim());
          if (resolved && fs.existsSync(resolved)) {
            target = resolved;
          }
        }

        shortcutTargetCache.set(normalized, target);
        resolve(target);
      }
    );
  });
}

async function readIconDataUrl(iconPath) {
  try {
    const icon = await app.getFileIcon(iconPath, { size: "large" });
    if (!icon || icon.isEmpty()) {
      return null;
    }

    return icon.toDataURL();
  } catch {
    return null;
  }
}

async function getAppIcon(appPath) {
  const normalized = path.normalize(String(appPath || "").trim());
  if (!normalized || !fs.existsSync(normalized)) {
    return null;
  }

  const candidates = [];
  const shortcutTarget = await resolveShortcutTarget(normalized);
  candidates.push(shortcutTarget, normalized);

  const seen = new Set();
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);

    if (!fs.existsSync(candidate)) {
      continue;
    }

    const icon = await readIconDataUrl(candidate);
    if (icon) {
      return icon;
    }
  }

  return null;
}

async function getAppIconsBatch(paths, limit = ICON_BATCH_LIMIT) {
  const icons = {};
  const uniquePaths = [...new Set((paths || []).map((value) => path.normalize(String(value || "").trim())))].slice(
    0,
    limit
  );

  await Promise.all(
    uniquePaths.map(async (appPath) => {
      icons[appPath] = await getAppIcon(appPath);
    })
  );

  return icons;
}

function listInstalledApps() {
  if (process.platform !== "win32") {
    return [];
  }

  const apps = [];
  const seen = new Set();

  for (const dir of getStartMenuDirs()) {
    scanShortcuts(dir, apps, seen);
  }

  apps.sort((left, right) => left.name.localeCompare(right.name, "ru"));
  return apps;
}

async function launchInstalledApp(appPath) {
  const normalized = path.normalize(String(appPath || "").trim());
  if (!normalized || !fs.existsSync(normalized)) {
    return { ok: false, message: "Программа не найдена." };
  }

  const errorMessage = await shell.openPath(normalized);
  if (errorMessage) {
    return { ok: false, message: errorMessage };
  }

  return { ok: true };
}

module.exports = {
  listInstalledApps,
  getAppIcon,
  getAppIconsBatch,
  launchInstalledApp,
};
