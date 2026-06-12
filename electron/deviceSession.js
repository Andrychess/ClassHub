const fs = require("fs");
const path = require("path");
const { app } = require("electron");

function getSessionPath() {
  return path.join(app.getPath("userData"), "device-session.json");
}

function defaultSession() {
  return {
    lastRole: null,
  };
}

function readDeviceSession() {
  const filePath = getSessionPath();
  try {
    if (!fs.existsSync(filePath)) {
      return defaultSession();
    }

    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const lastRole = data.lastRole;
    return {
      lastRole: lastRole === "teacher" || lastRole === "student" ? lastRole : null,
    };
  } catch {
    return defaultSession();
  }
}

function saveLastRole(role) {
  if (role !== "teacher" && role !== "student") {
    return readDeviceSession();
  }

  const session = {
    lastRole: role,
  };
  const filePath = getSessionPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(session, null, 2), "utf8");
  return session;
}

function clearLastRole() {
  const filePath = getSessionPath();
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // ignore
  }
  return defaultSession();
}

module.exports = {
  readDeviceSession,
  saveLastRole,
  clearLastRole,
};
