const path = require("path");
const { app } = require("electron");

function isSupported() {
  return process.platform === "win32" || process.platform === "darwin" || process.platform === "linux";
}

function getAutoLaunchSettings() {
  if (!isSupported()) {
    return { ok: true, enabled: false, supported: false };
  }

  try {
    const settings = app.getLoginItemSettings();
    return {
      ok: true,
      enabled: Boolean(settings.openAtLogin),
      supported: true,
    };
  } catch (error) {
    return {
      ok: false,
      enabled: false,
      supported: true,
      message: error.message,
    };
  }
}

function setAutoLaunch(enabled) {
  if (!isSupported()) {
    return {
      ok: false,
      supported: false,
      message: "Автозапуск не поддерживается на этой платформе.",
    };
  }

  try {
    const options = {
      openAtLogin: Boolean(enabled),
      openAsHidden: false,
    };

    if (!app.isPackaged) {
      options.path = process.execPath;
      options.args = [path.resolve(__dirname, "..")];
    }

    app.setLoginItemSettings(options);
    return getAutoLaunchSettings();
  } catch (error) {
    return {
      ok: false,
      supported: true,
      message: error.message || "Не удалось изменить автозапуск.",
    };
  }
}

module.exports = {
  getAutoLaunchSettings,
  setAutoLaunch,
};
