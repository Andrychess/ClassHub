const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { app } = require("electron");
const { readFolderState, folderExists } = require("./settings");
const { MAX_CLASSES, MAX_VISIBLE_APPS_PER_CLASS } = require("./constants");

function getClassesPath() {
  return path.join(app.getPath("userData"), "classes.json");
}

function defaultState() {
  return {
    classes: [],
    activeClassId: null,
    sharingClassId: null,
    student: {
      joinedClassId: null,
      joinedTeacherIp: null,
      joinedClassName: null,
    },
  };
}

function visibleAppEntryToName(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return null;
  }

  if (/[\\/]/.test(trimmed) || /\.lnk$/i.test(trimmed)) {
    const base = path.basename(trimmed, path.extname(trimmed)).trim();
    return base || null;
  }

  return trimmed;
}

function normalizeVisibleApps(visibleApps) {
  if (!Array.isArray(visibleApps)) {
    return [];
  }

  const seen = new Set();
  const unique = [];

  for (const item of visibleApps) {
    const name = visibleAppEntryToName(item);
    if (!name) {
      continue;
    }

    const key = name.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(name);
  }

  return unique.slice(0, MAX_VISIBLE_APPS_PER_CLASS);
}

function normalizeClass(item) {
  if (!item || !item.id || !item.name) {
    return null;
  }

  return {
    id: String(item.id),
    name: String(item.name).trim().slice(0, 80),
    shareFolder: item.shareFolder && folderExists(item.shareFolder) ? path.resolve(item.shareFolder) : null,
    visibleApps: normalizeVisibleApps(item.visibleApps),
    createdAt: Number(item.createdAt) || Date.now(),
    updatedAt: Number(item.updatedAt) || Date.now(),
  };
}

function loadState() {
  const filePath = getClassesPath();
  try {
    if (!fs.existsSync(filePath)) {
      return migrateFromLegacy(defaultState());
    }

    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const state = {
      ...defaultState(),
      ...data,
      classes: Array.isArray(data.classes)
        ? data.classes.map(normalizeClass).filter(Boolean).slice(0, MAX_CLASSES)
        : [],
      student: {
        ...defaultState().student,
        ...(data.student || {}),
      },
    };

    if (!state.classes.some((item) => item.id === state.activeClassId)) {
      state.activeClassId = state.classes[0]?.id || null;
    }

    if (!state.classes.some((item) => item.id === state.sharingClassId)) {
      state.sharingClassId = null;
    }

    return state;
  } catch {
    return migrateFromLegacy(defaultState());
  }
}

function saveState(state) {
  const filePath = getClassesPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf8");
}

function migrateFromLegacy(state) {
  const folderState = readFolderState();
  if (!folderState.lastSelectedFolder) {
    return state;
  }

  const legacyClass = {
    id: crypto.randomUUID(),
    name: "Мой класс",
    shareFolder: folderState.lastSelectedFolder,
    visibleApps: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  state.classes = [legacyClass];
  state.activeClassId = legacyClass.id;
  saveState(state);
  return state;
}

function readClassesState() {
  return loadState();
}

function getClassById(classId) {
  return readClassesState().classes.find((item) => item.id === classId) || null;
}

function getActiveClass() {
  const state = readClassesState();
  return state.classes.find((item) => item.id === state.activeClassId) || state.classes[0] || null;
}

function getSharingClass() {
  const state = readClassesState();
  return state.classes.find((item) => item.id === state.sharingClassId) || null;
}

function getJoinedClass() {
  const state = readClassesState();
  if (!state.student.joinedClassId) {
    return null;
  }

  return {
    classId: state.student.joinedClassId,
    className: state.student.joinedClassName,
    teacherIp: state.student.joinedTeacherIp,
  };
}

function setActiveClass(classId) {
  const state = loadState();
  if (!state.classes.some((item) => item.id === classId)) {
    return { ok: false, message: "Класс не найден." };
  }

  state.activeClassId = classId;
  saveState(state);
  return { ok: true, activeClass: getClassById(classId) };
}

function setSharingClass(classId) {
  const state = loadState();
  state.sharingClassId = classId || null;
  saveState(state);
  return { ok: true, sharingClass: classId ? getClassById(classId) : null };
}

function createClass({ name, shareFolder, visibleApps }) {
  const trimmedName = String(name || "").trim();
  if (!trimmedName) {
    return { ok: false, message: "Укажите название класса." };
  }

  const state = loadState();
  if (state.classes.length >= MAX_CLASSES) {
    return { ok: false, message: `Можно создать не больше ${MAX_CLASSES} классов.` };
  }

  const nextClass = {
    id: crypto.randomUUID(),
    name: trimmedName,
    shareFolder: shareFolder && folderExists(shareFolder) ? path.resolve(shareFolder) : null,
    visibleApps: normalizeVisibleApps(visibleApps),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  state.classes.unshift(nextClass);
  if (!state.activeClassId) {
    state.activeClassId = nextClass.id;
  }
  saveState(state);

  return { ok: true, classItem: nextClass, classes: state.classes, activeClassId: state.activeClassId };
}

function updateClass(classId, patch) {
  const state = loadState();
  const index = state.classes.findIndex((item) => item.id === classId);
  if (index < 0) {
    return { ok: false, message: "Класс не найден." };
  }

  const current = state.classes[index];
  const next = {
    ...current,
    name: patch.name !== undefined ? String(patch.name).trim().slice(0, 80) : current.name,
    shareFolder:
      patch.shareFolder !== undefined
        ? patch.shareFolder && folderExists(patch.shareFolder)
          ? path.resolve(patch.shareFolder)
          : null
        : current.shareFolder,
    visibleApps: patch.visibleApps !== undefined ? normalizeVisibleApps(patch.visibleApps) : current.visibleApps,
    updatedAt: Date.now(),
  };

  if (!next.name) {
    return { ok: false, message: "Название класса не может быть пустым." };
  }

  state.classes[index] = next;
  saveState(state);
  return { ok: true, classItem: next, classes: state.classes };
}

function deleteClass(classId) {
  const state = loadState();
  const target = state.classes.find((item) => item.id === classId);
  if (!target) {
    return { ok: false, message: "Класс не найден." };
  }

  if (state.sharingClassId === classId) {
    return { ok: false, message: "Сначала остановите раздачу этого класса." };
  }

  state.classes = state.classes.filter((item) => item.id !== classId);
  if (state.activeClassId === classId) {
    state.activeClassId = state.classes[0]?.id || null;
  }
  saveState(state);

  return { ok: true, classes: state.classes, activeClassId: state.activeClassId };
}

function joinClass({ classId, className, teacherIp }) {
  if (!classId) {
    return { ok: false, message: "Выберите класс." };
  }

  const state = loadState();
  state.student = {
    joinedClassId: String(classId),
    joinedClassName: String(className || "").trim() || "Класс",
    joinedTeacherIp: teacherIp ? String(teacherIp).trim() : null,
  };
  saveState(state);

  return { ok: true, joinedClass: getJoinedClass() };
}

function leaveClass() {
  const state = loadState();
  state.student = defaultState().student;
  saveState(state);
  return { ok: true };
}

function buildDiscoveredClasses(peers) {
  const catalog = new Map();

  for (const peer of peers || []) {
    if (!peer.classId || !peer.className) {
      continue;
    }

    const key = `${peer.classId}:${peer.ip}`;
    catalog.set(key, {
      classId: peer.classId,
      className: peer.className,
      teacherHostname: peer.hostname,
      teacherIp: peer.ip,
      isLive: Boolean(peer.isSource),
      httpPort: peer.httpPort || null,
    });
  }

  return [...catalog.values()].sort((left, right) => {
    if (left.isLive !== right.isLive) {
      return left.isLive ? -1 : 1;
    }
    return left.className.localeCompare(right.className, "ru");
  });
}

module.exports = {
  readClassesState,
  getClassById,
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
};
