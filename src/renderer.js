const peersBody = document.getElementById("peers-body");
const peerCount = document.getElementById("peer-count");
const screenCount = document.getElementById("screen-count");
const screenGrid = document.getElementById("screen-grid");
const statusEl = document.getElementById("status");
const localName = document.getElementById("local-name");
const localIp = document.getElementById("local-ip");
const localNetworks = document.getElementById("local-networks");
const studentClassGate = document.getElementById("student-class-gate");
const classPickerList = document.getElementById("class-picker-list");
const teacherClassGate = document.getElementById("teacher-class-gate");
const teacherGateListView = document.getElementById("teacher-gate-list-view");
const teacherGateClassList = document.getElementById("teacher-gate-class-list");
const teacherGateFormView = document.getElementById("teacher-gate-form-view");
const teacherGateFormTitle = document.getElementById("teacher-gate-form-title");
const teacherGateFormNameInput = document.getElementById("teacher-gate-form-name");
const teacherGateFormFolderEl = document.getElementById("teacher-gate-form-folder");
const teacherGateFormApps = document.getElementById("teacher-gate-form-apps");
const teacherGateAppsSearch = document.getElementById("teacher-gate-apps-search");
const teacherGateAppsEmpty = document.getElementById("teacher-gate-apps-empty");
const classEditorNameInput = document.getElementById("class-editor-name");
const btnSwitchClass = document.getElementById("btn-switch-class");
const classesListEl = document.getElementById("classes-list");
const classesCountEl = document.getElementById("classes-count");
const classEditor = document.getElementById("class-editor");
const classEditorPlaceholder = document.getElementById("class-editor-placeholder");
const classEditorTitle = document.getElementById("class-editor-title");
const classEditorFolder = document.getElementById("class-editor-folder");
const classAppsList = document.getElementById("class-apps-list");
const classAppsSearch = document.getElementById("class-apps-search");
const classAppsEmpty = document.getElementById("class-apps-empty");
const sharingClassLabel = document.getElementById("sharing-class-label");
const sourceLinkBox = document.getElementById("source-link-box");
const sourceLinkInput = document.getElementById("source-link");
const streamLinkBox = document.getElementById("stream-link-box");
const streamLinkInput = document.getElementById("stream-link");
const watchIpInput = document.getElementById("watch-ip-input");
const chatMessagesEl = document.getElementById("chat-messages");
const chatCountEl = document.getElementById("chat-count");
const chatInput = document.getElementById("chat-input");
const chatForm = document.getElementById("chat-form");
const appVersionEl = document.getElementById("app-version");
const roleGate = document.getElementById("role-gate");
const teacherAuth = document.getElementById("teacher-auth");
const teacherPasswordInput = document.getElementById("teacher-password");
const teacherAuthError = document.getElementById("teacher-auth-error");
const teacherAuthForm = document.getElementById("teacher-auth-form");
const appContent = document.getElementById("app-content");
const roleBadge = document.getElementById("role-badge");
const workspacePage = document.getElementById("workspace-page");
const classSettingsPage = document.getElementById("class-settings-page");
const broadcastsPage = document.getElementById("broadcasts-page");
const networkPage = document.getElementById("network-page");
const btnPageWorkspace = document.getElementById("btn-page-workspace");
const btnPageClassSettings = document.getElementById("btn-page-class-settings");
const btnPageBroadcasts = document.getElementById("btn-page-broadcasts");
const btnPageNetwork = document.getElementById("btn-page-network");
const btnBroadcastsFullscreen = document.getElementById("btn-broadcasts-fullscreen");
const watchIpForm = document.getElementById("watch-ip-form");
const appsGrid = document.getElementById("apps-grid");
const appsSearch = document.getElementById("apps-search");
const sourceFrame = document.getElementById("source-frame");
const sourceEmpty = document.getElementById("source-empty");
const sourceSelect = document.getElementById("source-select");
const btnScreenStart = document.getElementById("btn-screen-start");
const btnScreenStop = document.getElementById("btn-screen-stop");

const ROLES = {
  STUDENT: "student",
  TEACHER: "teacher",
};

const NEW_CLASS_ID = "__new__";

let currentRole = null;
let currentPage = "workspace";
let installedApps = [];
let pinnedApps = [];
let appIconCache = new Map();
let appIconLoadGeneration = 0;
let classes = [];
let activeClassId = null;
let editingClassId = null;
let joinedClass = null;
let studentVisibleApps = [];
let discoveredClassCatalog = [];
let teacherGateFormMode = "create";
let teacherGateFormClassId = null;
let teacherGateDraftFolder = null;
let classFormDraftFolder = null;
let selectedSourceUrl = null;
let peers = [];
let lastAppState = null;
let chatMessages = [];
let selectedIp = null;
let activeSourceUrl = null;
let activeStreamUrl = null;
let manualWatchIps = [];
let classPickerRefreshTimer = null;

function confirmAction(message) {
  return window.confirm(message);
}

function filterChatForLocalClass(messages) {
  const localClassId = getLocalClassId();
  if (!localClassId) {
    return messages || [];
  }

  return (messages || []).filter((message) => message.classId === localClassId);
}

function setStatus(message) {
  if (statusEl) {
    const full = message || "";
    statusEl.textContent = formatStatusShort(full);
    statusEl.title = full;
  }
}

function formatStatusShort(message) {
  const text = String(message || "").trim();
  if (!text) {
    return "Готово к работе";
  }

  if (text.startsWith("Источник активен:")) {
    return "Раздача материалов активна";
  }

  if (text.startsWith("Ваш экран транслируется:")) {
    return "Экран транслируется";
  }

  const withoutFirewall = text.split(" | ")[0].trim();
  if (withoutFirewall.length <= 72) {
    return withoutFirewall;
  }

  return `${withoutFirewall.slice(0, 69)}...`;
}

function showPage(page) {
  if (page !== "broadcasts") {
    setBroadcastsFullscreen(false);
  }

  currentPage = page;
  workspacePage?.classList.toggle("hidden", page !== "workspace");
  classSettingsPage?.classList.toggle("hidden", page !== "class-settings");
  broadcastsPage?.classList.toggle("hidden", page !== "broadcasts");
  networkPage?.classList.toggle("hidden", page !== "network");
  btnPageWorkspace?.classList.toggle("active", page === "workspace");
  btnPageClassSettings?.classList.toggle("active", page === "class-settings");
  btnPageBroadcasts?.classList.toggle("active", page === "broadcasts");
  btnPageNetwork?.classList.toggle("active", page === "network");

  const isAdminPage = page === "class-settings" || page === "network";
  appContent?.classList.toggle("is-admin-view", isAdminPage);
  appContent?.classList.toggle("is-lesson-view", !isAdminPage);
}

function setBroadcastsFullscreen(enabled) {
  const active = Boolean(enabled);
  document.body.classList.toggle("broadcasts-fullscreen", active);
  btnBroadcastsFullscreen?.setAttribute("aria-pressed", active ? "true" : "false");
  if (btnBroadcastsFullscreen) {
    btnBroadcastsFullscreen.textContent = active ? "Свернуть" : "На весь экран";
  }
}

function updateStreamShareButtons(isScreenSharing) {
  btnScreenStart?.classList.toggle("hidden", Boolean(isScreenSharing));
  btnScreenStop?.classList.toggle("hidden", !isScreenSharing);
}

function filterApps(query) {
  const normalized = String(query || "")
    .trim()
    .toLowerCase();
  if (!normalized) {
    return installedApps;
  }
  return installedApps.filter((app) => app.name.toLowerCase().includes(normalized));
}

function sortAppsForDisplay(apps) {
  const pinnedSet = new Set(pinnedApps);
  const pinned = [];
  const regular = [];

  for (const app of apps) {
    if (pinnedSet.has(app.path)) {
      pinned.push(app);
    } else {
      regular.push(app);
    }
  }

  pinned.sort((left, right) => pinnedApps.indexOf(left.path) - pinnedApps.indexOf(right.path));
  return [...pinned, ...regular];
}

function getLocalClassId() {
  if (isTeacherRole()) {
    return activeClassId || null;
  }

  return joinedClass?.classId || null;
}

function peerMatchesLocalClass(peer) {
  const localClassId = getLocalClassId();
  if (!localClassId || !peer?.classId) {
    return true;
  }

  return peer.classId === localClassId;
}

function filterPeersForRole(list) {
  return (list || []).filter(peerMatchesLocalClass);
}

function getWorkspaceVisibleApps() {
  if (isStudentRole()) {
    return normalizeVisibleAppNames(studentVisibleApps);
  }

  if (isTeacherRole() && activeClassId) {
    const classItem = classes.find((item) => item.id === activeClassId);
    return normalizeVisibleAppNames(classItem?.visibleApps || []);
  }

  return [];
}

function getWorkspaceClassContext(state) {
  if (isStudentRole() && joinedClass?.classId) {
    return {
      classId: joinedClass.classId,
      className: joinedClass.className,
      teacherIp: joinedClass.teacherIp,
    };
  }

  if (isTeacherRole() && activeClassId) {
    const active = classes.find((item) => item.id === activeClassId);
    return {
      classId: activeClassId,
      className: active?.name || "Класс",
      teacherIp: state?.localIp || null,
    };
  }

  return null;
}

function getAppsForDisplay() {
  const searchQuery = String(appsSearch?.value || "")
    .trim()
    .toLowerCase();
  const visibleApps = getWorkspaceVisibleApps();

  if (!visibleApps.length) {
    return sortAppsForDisplay(filterApps(appsSearch?.value || "")).map((app) => ({
      ...app,
      missing: false,
    }));
  }

  const result = [];

  for (const storedName of visibleApps) {
    const displayName = resolveVisibleAppDisplayName(storedName);
    if (searchQuery && !displayName.toLowerCase().includes(searchQuery)) {
      continue;
    }

    const local = installedApps.find((app) => normalizeAppName(app.name) === normalizeAppName(storedName));
    if (local) {
      result.push({ ...local, missing: false });
    } else {
      result.push({ name: displayName, path: null, missing: true });
    }
  }

  return result;
}

function applyClassState(state) {
  classes = state.classes || [];
  activeClassId = state.activeClassId || null;
  joinedClass = state.joinedClass || null;
  renderClassesUi(state);
  updateClassBadges();

  if (isTeacherRole() && currentPage === "workspace" && appContent && !appContent.classList.contains("hidden")) {
    refreshAppsGrid();
    if (lastAppState) {
      updateSourceDisplay(lastAppState);
    }
  }
}

function updateClassBadges() {
  if (roleBadge) {
    if (isTeacherRole()) {
      const active = classes.find((item) => item.id === activeClassId);
      roleBadge.innerHTML = active
        ? `<span class="role-chip-dot"></span><span class="role-chip-text">Преподаватель</span><span class="role-chip-sep">·</span><span class="role-chip-class">${escapeHtml(active.name)}</span>`
        : `<span class="role-chip-dot"></span><span class="role-chip-text">Преподаватель</span>`;
      roleBadge.className = "role-chip role-badge-teacher";
    } else if (isStudentRole() && joinedClass?.className) {
      roleBadge.innerHTML = `<span class="role-chip-dot"></span><span class="role-chip-text">Ученик</span><span class="role-chip-sep">·</span><span class="role-chip-class">${escapeHtml(joinedClass.className)}</span>`;
      roleBadge.className = "role-chip role-badge-student";
    } else {
      roleBadge.innerHTML = `<span class="role-chip-dot"></span><span class="role-chip-text">${isTeacherRole() ? "Преподаватель" : "Ученик"}</span>`;
      roleBadge.className = `role-chip ${isTeacherRole() ? "role-badge-teacher" : "role-badge-student"}`;
    }
  }

  btnSwitchClass?.classList.toggle(
    "hidden",
    !((isStudentRole() && joinedClass) || (isTeacherRole() && activeClassId))
  );
}

function formatClassFolderLabel(shareFolder) {
  if (!shareFolder) {
    return "Папка не выбрана";
  }

  const parts = String(shareFolder).replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || shareFolder;
}

async function showTeacherClassGate() {
  currentRole = ROLES.TEACHER;
  document.body.dataset.role = ROLES.TEACHER;
  roleGate?.classList.add("hidden");
  teacherAuth?.classList.add("hidden");
  studentClassGate?.classList.add("hidden");
  teacherClassGate?.classList.remove("hidden");
  appContent?.classList.add("hidden");
  await window.classHub.setAppRole(ROLES.TEACHER);
  await renderTeacherClassGate();
}

async function renderTeacherClassGate() {
  showTeacherGateListView();

  if (!teacherGateClassList) {
    return;
  }

  teacherGateClassList.innerHTML = '<div class="class-picker-empty muted">Загрузка классов...</div>';
  const data = await window.classHub.getClasses();
  classes = data.classes || [];
  activeClassId = data.activeClassId || null;

  if (!classes.length) {
    teacherGateClassList.innerHTML =
      '<div class="class-picker-empty muted">Классов пока нет. Нажмите «Создать новый класс», чтобы настроить папку и программы.</div>';
    return;
  }

  teacherGateClassList.innerHTML = classes
    .map((item) => {
      const sharing = item.id === data.sharingClassId ? " · раздаётся" : "";
      const appsCount = item.visibleApps?.length
        ? `${item.visibleApps.length} программ`
        : "все программы";
      return `
        <article class="class-picker-card">
          <div class="class-picker-card-body">
            <strong>${escapeHtml(item.name)}</strong>
            <span class="muted">${escapeHtml(formatClassFolderLabel(item.shareFolder))}${sharing}</span>
            <span class="muted">${escapeHtml(appsCount)}</span>
          </div>
          <div class="class-picker-card-actions">
            <button
              class="btn teacher-class-edit-btn"
              data-class-id="${escapeHtml(item.id)}"
              type="button"
            >
              Настроить
            </button>
            <button
              class="btn primary teacher-class-select-btn"
              data-class-id="${escapeHtml(item.id)}"
              type="button"
            >
              Войти
            </button>
          </div>
        </article>
      `;
    })
    .join("");

  teacherGateClassList.querySelectorAll(".teacher-class-select-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      await enterTeacherClass(button.dataset.classId);
    });
  });

  teacherGateClassList.querySelectorAll(".teacher-class-edit-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      await showTeacherGateForm("edit", button.dataset.classId);
    });
  });
}

function showTeacherGateListView() {
  teacherGateListView?.classList.remove("hidden");
  teacherGateFormView?.classList.add("hidden");
}

async function showTeacherGateForm(mode, classId = null) {
  teacherGateFormMode = mode;
  teacherGateFormClassId = classId;

  const classItem = mode === "edit" ? classes.find((item) => item.id === classId) : null;
  teacherGateDraftFolder = classItem?.shareFolder || null;

  teacherGateListView?.classList.add("hidden");
  teacherGateFormView?.classList.remove("hidden");

  if (teacherGateFormTitle) {
    teacherGateFormTitle.textContent = mode === "create" ? "Новый класс" : `Настройка: ${classItem?.name || ""}`;
  }

  if (teacherGateFormNameInput) {
    teacherGateFormNameInput.value = classItem?.name || "";
  }

  if (teacherGateFormFolderEl) {
    teacherGateFormFolderEl.textContent = teacherGateDraftFolder || "Папка не выбрана";
  }

  const saveEnterBtn = document.getElementById("btn-teacher-gate-form-save-enter");
  saveEnterBtn?.classList.toggle("hidden", mode !== "create");

  await ensureInstalledAppsLoaded();
  if (teacherGateAppsSearch) {
    teacherGateAppsSearch.value = "";
  }
  renderAppsChecklist(
    teacherGateFormApps,
    classItem?.visibleApps || [],
    teacherGateAppsSearch,
    teacherGateAppsEmpty
  );
  teacherGateFormNameInput?.focus();
}

async function saveTeacherGateForm({ enterAfterSave = false } = {}) {
  const name = teacherGateFormNameInput?.value.trim();
  if (!name) {
    setStatus("Укажите название класса.");
    teacherGateFormNameInput?.focus();
    return;
  }

  const visibleApps = normalizeVisibleAppNames(getSelectedAppsFromContainer(teacherGateFormApps));

  if (teacherGateFormMode === "create") {
    const result = await window.classHub.createClass({
      name,
      shareFolder: teacherGateDraftFolder,
      visibleApps,
    });

    if (!result.ok) {
      setStatus(result.message);
      return;
    }

    classes = result.classes;
    activeClassId = result.activeClassId;

    if (enterAfterSave) {
      await enterTeacherClass(result.classItem.id);
      setStatus(`Класс «${result.classItem.name}» создан.`);
      return;
    }

    showTeacherGateListView();
    await renderTeacherClassGate();
    setStatus(`Класс «${result.classItem.name}» создан.`);
    return;
  }

  const result = await window.classHub.updateClass(teacherGateFormClassId, {
    name,
    shareFolder: teacherGateDraftFolder,
    visibleApps,
  });

  if (!result.ok) {
    setStatus(result.message);
    return;
  }

  classes = result.classes;
  showTeacherGateListView();
  await renderTeacherClassGate();
  setStatus("Настройки класса сохранены.");
}

async function enterTeacherClass(classId) {
  const result = await window.classHub.setActiveClass(classId);
  if (!result.ok) {
    setStatus(result.message || "Не удалось выбрать класс.");
    return;
  }

  await window.classHub.setAppRole(ROLES.TEACHER);
  activeClassId = classId;
  editingClassId = classId;
  teacherClassGate?.classList.add("hidden");
  enterAppContent(ROLES.TEACHER, { skipClassGate: true, skipTeacherClassGate: true });
  refreshAppsGrid();
  await ensureClassSourceStarted();
}

async function ensureClassSourceStarted(options = {}) {
  if (!isTeacherRole() || !activeClassId) {
    return null;
  }

  const state = lastAppState || (await window.classHub.getState());
  const activeClass = classes.find((item) => item.id === activeClassId);

  if (!activeClass?.shareFolder) {
    if (!options.quiet) {
      setStatus("Папка для класса не выбрана. Укажите её в «Настройки класса».");
    }
    return null;
  }

  if (state.isSource && state.sharingClassId === activeClassId && !options.forceRestart) {
    return state;
  }

  if (state.isSource) {
    await window.classHub.stopSource();
    lastAppState = await refreshState({ updatePeers: false });
  }

  return runServiceAction(() => window.classHub.startSource({ classId: activeClassId }), {
    updatePeers: false,
  });
}

async function ensureStudentScreenShareStarted() {
  if (!isStudentRole()) {
    return null;
  }

  const state = lastAppState || (await window.classHub.getState());
  if (state.isScreenSharing) {
    return state;
  }

  return runServiceAction(() => window.classHub.startScreenShare());
}

async function ensureInstalledAppsLoaded() {
  if (installedApps.length) {
    return;
  }

  await loadInstalledApps();
}

function renderAppsChecklist(container, selectedNames, searchInput, emptyEl) {
  if (!container) {
    return;
  }

  const selected = new Set((selectedNames || []).map(normalizeAppName));
  container.innerHTML = installedApps
    .map((app) => {
      const checked = selected.has(normalizeAppName(app.name)) ? "checked" : "";
      return `
        <label class="class-app-option" data-app-name="${escapeHtml(app.name.toLowerCase())}">
          <input type="checkbox" value="${escapeHtml(app.name)}" ${checked} />
          <span>${escapeHtml(app.name)}</span>
        </label>
      `;
    })
    .join("");

  filterClassAppsList(container, emptyEl, searchInput?.value || "");
}

function filterClassAppsList(container, emptyEl, query) {
  if (!container) {
    return;
  }

  const normalized = String(query || "")
    .trim()
    .toLowerCase();
  let visibleCount = 0;

  container.querySelectorAll(".class-app-option").forEach((label) => {
    const name = label.dataset.appName || "";
    const visible = !normalized || name.includes(normalized);
    label.classList.toggle("hidden", !visible);
    if (visible) {
      visibleCount += 1;
    }
  });

  emptyEl?.classList.toggle("hidden", visibleCount > 0);
}

function resetClassAppsSearch(searchInput, container, emptyEl) {
  if (searchInput) {
    searchInput.value = "";
  }
  filterClassAppsList(container, emptyEl, "");
}

function getSelectedAppsFromContainer(container) {
  if (!container) {
    return [];
  }

  return [...container.querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value);
}

async function showStudentClassGate() {
  currentRole = ROLES.STUDENT;
  document.body.dataset.role = ROLES.STUDENT;
  roleGate?.classList.add("hidden");
  teacherAuth?.classList.add("hidden");
  studentClassGate?.classList.remove("hidden");
  teacherClassGate?.classList.add("hidden");
  appContent?.classList.add("hidden");

  await window.classHub.setAppRole(ROLES.STUDENT);

  if (classPickerList) {
    classPickerList.innerHTML =
      '<div class="class-picker-empty muted">Поиск преподавателей в локальной сети...</div>';
  }

  await renderClassPicker();
}

function findDiscoveredClassEntry(classId, teacherIp) {
  return discoveredClassCatalog.find(
    (item) => item.classId === classId && item.teacherIp === teacherIp
  );
}

function applyClassConfigFromCatalog(classId, teacherIp) {
  const entry = findDiscoveredClassEntry(classId, teacherIp);
  if (!entry) {
    return false;
  }

  studentVisibleApps = entry.visibleApps || [];
  return true;
}

async function renderClassPicker(options = {}) {
  if (!classPickerList) {
    return;
  }

  if (!options.quiet) {
    classPickerList.innerHTML =
      '<div class="class-picker-empty muted class-picker-loading">Поиск преподавателей в локальной сети...</div>';
  }

  const result = await window.classHub.discoverTeacherClasses();
  discoveredClassCatalog = result.classes || [];

  if (!result.ok) {
    classPickerList.innerHTML = `<div class="class-picker-empty muted">${escapeHtml(
      result.message || "Не удалось выполнить поиск преподавателей."
    )}</div>`;
    return;
  }

  if (!result.teacherCount) {
    classPickerList.innerHTML =
      '<div class="class-picker-empty muted">Преподаватели не найдены. Попросите преподавателя войти в режим «Преподаватель» и нажмите «Обновить список».</div>';
    return;
  }

  if (!discoveredClassCatalog.length) {
    classPickerList.innerHTML =
      '<div class="class-picker-empty muted">Преподаватель найден, но классы ещё не созданы. Попросите преподавателя добавить класс в «Мои классы».</div>';
    return;
  }

  classPickerList.innerHTML = discoveredClassCatalog
    .map((item) => {
      const liveBadge = item.isLive
        ? '<span class="class-live-badge">Материалы доступны</span>'
        : '<span class="class-offline-badge muted">Ожидание раздачи</span>';
      return `
        <article class="class-picker-card">
          <div class="class-picker-card-body">
            <strong>${escapeHtml(item.className)}</strong>
            <span class="muted">${escapeHtml(item.teacherHostname)} · ${escapeHtml(item.teacherIp)}</span>
            ${liveBadge}
          </div>
          <button
            class="btn primary class-join-btn"
            data-class-id="${escapeHtml(item.classId)}"
            data-class-name="${escapeHtml(item.className)}"
            data-teacher-ip="${escapeHtml(item.teacherIp)}"
            type="button"
          >
            Войти
          </button>
        </article>
      `;
    })
    .join("");

  classPickerList.querySelectorAll(".class-join-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      await joinSelectedClass({
        classId: button.dataset.classId,
        className: button.dataset.className,
        teacherIp: button.dataset.teacherIp,
      });
    });
  });
}

async function joinSelectedClass({ classId, className, teacherIp }) {
  const result = await window.classHub.joinClass({ classId, className, teacherIp });
  if (!result.ok) {
    setStatus(result.message || "Не удалось войти в класс.");
    return;
  }

  joinedClass = result.joinedClass;
  applyClassConfigFromCatalog(classId, teacherIp);
  studentClassGate?.classList.add("hidden");
  await loadStudentClassConfig();
  enterAppContent(ROLES.STUDENT, { skipClassGate: true });
  await ensureStudentScreenShareStarted();
}

async function loadStudentClassConfig() {
  if (!joinedClass?.teacherIp) {
    studentVisibleApps = [];
    return;
  }

  if (applyClassConfigFromCatalog(joinedClass.classId, joinedClass.teacherIp)) {
    return;
  }

  const result = await window.classHub.fetchTeacherClassConfig(joinedClass.teacherIp);
  studentVisibleApps = result.ok ? result.config?.visibleApps || [] : [];
}

function renderClassesUi(state) {
  if (!classesListEl || !isTeacherRole()) {
    return;
  }

  classesCountEl.textContent = String(classes.length);

  if (!classes.length) {
    classesListEl.innerHTML = '<div class="classes-empty muted">Классы ещё не созданы.</div>';
    updateClassEditorVisibility(false);
    sharingClassLabel.textContent = "Активный класс не выбран";
    return;
  }

  classesListEl.innerHTML = classes
    .map((item) => {
      const active = item.id === activeClassId ? "active" : "";
      const sharing = item.id === state.sharingClassId ? " · раздаётся" : "";
      return `
        <button class="class-list-item ${active}" data-class-id="${escapeHtml(item.id)}" type="button">
          <strong>${escapeHtml(item.name)}</strong>
          <span class="muted">${escapeHtml(item.shareFolder || "Папка не выбрана")}${sharing}</span>
        </button>
      `;
    })
    .join("");

  classesListEl.querySelectorAll(".class-list-item").forEach((button) => {
    button.addEventListener("click", async () => {
      editingClassId = button.dataset.classId;
      classFormDraftFolder = null;
      await window.classHub.setActiveClass(editingClassId);
      activeClassId = editingClassId;
      renderClassEditor();
      renderClassesUi(await window.classHub.getClasses());
      await ensureClassSourceStarted({ quiet: true });
    });
  });

  const active = classes.find((item) => item.id === activeClassId) || classes[0];
  sharingClassLabel.textContent = active
    ? `Активный класс: ${active.name}${active.shareFolder ? "" : " · выберите папку"}`
    : "Активный класс не выбран";

  if (editingClassId !== NEW_CLASS_ID) {
    if (!editingClassId && active) {
      editingClassId = active.id;
    }
  }

  renderClassEditor();
}

function updateClassEditorVisibility(showEditor) {
  classEditor?.classList.toggle("hidden", !showEditor);
  classEditorPlaceholder?.classList.toggle("hidden", showEditor);
}

async function renderClassEditor() {
  if (!classEditor) {
    return;
  }

  const isNew = editingClassId === NEW_CLASS_ID;
  const classItem = isNew ? null : classes.find((item) => item.id === editingClassId);

  if (!isNew && !classItem) {
    updateClassEditorVisibility(false);
    return;
  }

  updateClassEditorVisibility(true);
  classEditorTitle.textContent = isNew ? "Новый класс" : `Настройка: ${classItem.name}`;
  classEditorNameInput.value = isNew ? "" : classItem.name;

  const folderPath = isNew ? classFormDraftFolder : classItem.shareFolder;
  classEditorFolder.textContent = folderPath || "Папка не выбрана";

  document.getElementById("btn-class-delete")?.classList.toggle("hidden", isNew);

  await ensureInstalledAppsLoaded();
  resetClassAppsSearch(classAppsSearch, classAppsList, classAppsEmpty);
  renderAppsChecklist(
    classAppsList,
    isNew ? [] : classItem.visibleApps,
    classAppsSearch,
    classAppsEmpty
  );
}

function getSelectedVisibleApps() {
  return normalizeVisibleAppNames(getSelectedAppsFromContainer(classAppsList));
}

function normalizeAppPath(value) {
  return String(value || "")
    .trim()
    .replace(/\//g, "\\")
    .toLowerCase();
}

function getCachedIcon(appPath) {
  return appIconCache.get(normalizeAppPath(appPath));
}

function setCachedIcon(appPath, icon) {
  appIconCache.set(normalizeAppPath(appPath), icon);
}

function findAppTileWrap(appPath) {
  if (!appsGrid) {
    return null;
  }

  const targetPath = normalizeAppPath(appPath);
  for (const wrap of appsGrid.querySelectorAll(".app-tile-wrap")) {
    if (normalizeAppPath(wrap.dataset.appPath) === targetPath) {
      return wrap;
    }
  }

  return null;
}

function updateAppTileIcon(appPath, iconSrc) {
  const wrap = findAppTileWrap(appPath);
  const slot = wrap?.querySelector(".app-icon-slot");
  if (!slot || !iconSrc) {
    return;
  }

  slot.innerHTML = `<img class="app-icon" src="${iconSrc}" alt="" />`;
}

function buildAppTileMarkup(app) {
  if (app.missing) {
    return `
      <div class="app-tile-wrap is-missing" data-app-name="${escapeHtml(app.name)}">
        <div class="app-tile app-tile-missing" title="Программа «${escapeHtml(app.name)}» не найдена на этом компьютере">
          <div class="app-icon-slot">
            <span class="app-icon-fallback">${escapeHtml(app.name.charAt(0).toUpperCase())}</span>
          </div>
          <span class="app-name">${escapeHtml(app.name)}</span>
          <span class="app-missing-label">Не установлена</span>
        </div>
      </div>
    `;
  }

  const isPinned = pinnedApps.includes(app.path);
  const cachedIcon = getCachedIcon(app.path);
  const iconMarkup = cachedIcon
    ? `<img class="app-icon" src="${cachedIcon}" alt="" />`
    : `<span class="app-icon-fallback">${escapeHtml(app.name.charAt(0).toUpperCase())}</span>`;

  return `
    <div class="app-tile-wrap ${isPinned ? "is-pinned" : ""}" data-app-path="${escapeHtml(app.path)}">
      <button
        class="app-pin ${isPinned ? "active" : ""}"
        type="button"
        title="${isPinned ? "Открепить" : "Закрепить"}"
        aria-label="${isPinned ? "Открепить" : "Закрепить"}"
      >
        ${isPinned ? "★" : "☆"}
      </button>
      <button class="app-tile" data-app-path="${escapeHtml(app.path)}" type="button" title="${escapeHtml(app.name)}">
        <div class="app-icon-slot">${iconMarkup}</div>
        <span class="app-name">${escapeHtml(app.name)}</span>
      </button>
    </div>
  `;
}

function renderAppsGrid(apps) {
  if (!appsGrid) {
    return;
  }

  appIconLoadGeneration += 1;
  const generation = appIconLoadGeneration;

  if (!apps.length) {
    const visibleApps = getWorkspaceVisibleApps();
    appsGrid.innerHTML = visibleApps.length
      ? '<div class="apps-empty muted">Нет программ по фильтру.</div>'
      : '<div class="apps-empty muted">Программы не найдены.</div>';
    return;
  }

  appsGrid.innerHTML = apps.map((app) => buildAppTileMarkup(app)).join("");

  appsGrid.querySelectorAll(".app-tile:not(.app-tile-missing)").forEach((button) => {
    button.addEventListener("click", async () => {
      const result = await window.classHub.launchApp(button.dataset.appPath);
      if (!result.ok) {
        setStatus(result.message || "Не удалось запустить программу.");
      }
    });
  });

  appsGrid.querySelectorAll(".app-pin").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      const wrap = button.closest(".app-tile-wrap");
      const appPath = wrap?.dataset.appPath;
      if (!appPath) {
        return;
      }

      const result = await window.classHub.togglePinnedApp(appPath);
      if (!result.ok) {
        setStatus(result.message || "Не удалось изменить закрепление.");
        return;
      }

      pinnedApps = result.pinnedApps || [];
      renderAppsGrid(getAppsForDisplay());
    });
  });

  hydrateAppIcons(generation);
}

async function hydrateAppIcons(generation) {
  const apps = getAppsForDisplay();
  const paths = [];

  for (const appPath of pinnedApps) {
    if (
      apps.some((app) => !app.missing && normalizeAppPath(app.path) === normalizeAppPath(appPath)) &&
      !getCachedIcon(appPath)
    ) {
      paths.push(appPath);
    }
  }

  for (const app of apps) {
    if (app.missing || !app.path) {
      continue;
    }

    if (!getCachedIcon(app.path) && !paths.some((item) => normalizeAppPath(item) === normalizeAppPath(app.path))) {
      paths.push(app.path);
    }
  }

  for (let offset = 0; offset < paths.length; offset += 16) {
    if (generation !== appIconLoadGeneration) {
      return;
    }

    const batch = paths.slice(offset, offset + 16).filter((appPath) => !getCachedIcon(appPath));
    if (!batch.length) {
      continue;
    }

    const result = await window.classHub.getAppIconsBatch(batch);
    if (generation !== appIconLoadGeneration || !result.ok) {
      continue;
    }

    for (const [appPath, icon] of Object.entries(result.icons || {})) {
      if (!icon) {
        continue;
      }

      setCachedIcon(appPath, icon);
      updateAppTileIcon(appPath, icon);
    }
  }
}

function refreshAppsGrid() {
  renderAppsGrid(getAppsForDisplay());
}

async function loadInstalledApps() {
  if (!appsGrid) {
    return;
  }

  appsGrid.innerHTML = '<div class="apps-empty muted">Загрузка списка программ...</div>';
  const result = await window.classHub.getInstalledApps();
  if (!result.ok) {
    appsGrid.innerHTML = `<div class="apps-empty muted">${escapeHtml(result.message || "Не удалось загрузить программы.")}</div>`;
    return;
  }

  installedApps = result.apps || [];
  pinnedApps = (result.pinnedApps || []).filter((appPath) =>
    installedApps.some((app) => app.path === appPath)
  );
  refreshAppsGrid();
}

function collectMaterialSources(state) {
  const ctx = getWorkspaceClassContext(state);
  if (!ctx?.classId) {
    return [];
  }

  const sources = [];

  for (const peer of peers) {
    if (!peer.isSource || !peer.httpPort) {
      continue;
    }

    if (peer.classId && peer.classId !== ctx.classId) {
      continue;
    }

    if (ctx.teacherIp && peer.ip !== ctx.teacherIp) {
      continue;
    }

    const url = buildSourceUrl(peer.ip, peer.httpPort);
    if (!sources.some((item) => item.url === url)) {
      sources.push({
        label: peer.className || ctx.className || peer.hostname,
        url,
        classId: peer.classId || ctx.classId,
      });
    }
  }

  if (
    isTeacherRole() &&
    ctx &&
    state?.isSource &&
    state?.sourceUrl &&
    state?.sharingClassId === ctx.classId &&
    !sources.some((item) => item.url === state.sourceUrl)
  ) {
    sources.unshift({
      label: ctx.className,
      url: state.sourceUrl,
      classId: ctx.classId,
    });
  }

  return sources;
}

function appendEmbedParam(url) {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("embed", "1");
    return parsed.toString();
  } catch {
    return url;
  }
}

function updateSourceDisplay(state) {
  const sources = collectMaterialSources(state);
  const activeUrl =
    selectedSourceUrl && sources.some((source) => source.url === selectedSourceUrl)
      ? selectedSourceUrl
      : sources[0]?.url || null;

  if (sourceSelect) {
    if (sources.length > 1) {
      sourceSelect.classList.remove("hidden");
      sourceSelect.innerHTML = sources
        .map((source) => {
          const selected = source.url === activeUrl ? "selected" : "";
          return `<option value="${escapeHtml(source.url)}" ${selected}>${escapeHtml(source.label)}</option>`;
        })
        .join("");
    } else {
      sourceSelect.classList.add("hidden");
      sourceSelect.innerHTML = "";
    }
  }

  if (!activeUrl) {
    selectedSourceUrl = null;
    sourceFrame?.classList.add("hidden");
    sourceEmpty?.classList.remove("hidden");
    if (sourceFrame) {
      sourceFrame.src = "about:blank";
    }
    if (sourceEmpty) {
      sourceEmpty.textContent = "Материалы пока недоступны. Нажмите «Обновить материалы».";
    }
    return;
  }

  selectedSourceUrl = activeUrl;
  sourceEmpty?.classList.add("hidden");
  sourceFrame?.classList.remove("hidden");
  const frameUrl = appendEmbedParam(activeUrl);
  if (sourceFrame && sourceFrame.src !== frameUrl) {
    sourceFrame.src = frameUrl;
  }
}

function isTeacherRole() {
  return currentRole === ROLES.TEACHER;
}

function isStudentRole() {
  return currentRole === ROLES.STUDENT;
}

function applyRoleVisibility() {
  document.body.dataset.role = currentRole || "";
  updateClassBadges();
}

function showRoleGate() {
  const leavePromise = joinedClass ? window.classHub.leaveClass().catch(() => {}) : Promise.resolve();

  leavePromise.finally(() => {
    currentRole = null;
    currentPage = "workspace";
    selectedSourceUrl = null;
    joinedClass = null;
    studentVisibleApps = [];
    discoveredClassCatalog = [];
    document.body.dataset.role = "";
    window.classHub.setAppRole(null);
    window.classHub.stopSource().catch(() => {});
    window.classHub.stopScreenShare().catch(() => {});
    roleGate?.classList.remove("hidden");
    teacherAuth?.classList.add("hidden");
    studentClassGate?.classList.add("hidden");
    teacherClassGate?.classList.add("hidden");
    appContent?.classList.add("hidden");
    if (teacherPasswordInput) {
      teacherPasswordInput.value = "";
    }
    hideTeacherAuthError();
  });
}

function showTeacherAuth() {
  roleGate?.classList.add("hidden");
  teacherAuth?.classList.remove("hidden");
  studentClassGate?.classList.add("hidden");
  teacherClassGate?.classList.add("hidden");
  appContent?.classList.add("hidden");
  hideTeacherAuthError();
  teacherPasswordInput?.focus();
}

function hideTeacherAuthError() {
  if (!teacherAuthError) {
    return;
  }
  teacherAuthError.textContent = "";
  teacherAuthError.classList.add("hidden");
}

function showTeacherAuthError(message) {
  if (!teacherAuthError) {
    return;
  }
  teacherAuthError.textContent = message;
  teacherAuthError.classList.remove("hidden");
}

function enterAppContent(role, options = {}) {
  currentRole = role;
  roleGate?.classList.add("hidden");
  teacherAuth?.classList.add("hidden");
  if (!options.skipClassGate) {
    studentClassGate?.classList.add("hidden");
  }
  if (!options.skipTeacherClassGate) {
    teacherClassGate?.classList.add("hidden");
  }
  appContent?.classList.remove("hidden");
  applyRoleVisibility();
  showPage("workspace");
  loadInstalledApps();
  loadAppState();
}

async function enterStudentMode() {
  showStudentClassGate();
}

async function enterTeacherMode() {
  const data = await window.classHub.getClasses();
  classes = data.classes || [];
  activeClassId = data.activeClassId || null;

  if (activeClassId && classes.some((item) => item.id === activeClassId)) {
    await enterTeacherClass(activeClassId);
    return;
  }

  await showTeacherClassGate();
}

async function restoreSavedSession() {
  await loadLocalInfo();

  const session = await window.classHub.getDeviceSession();
  if (session.lastRole === ROLES.STUDENT) {
    const state = await window.classHub.getState();
    applyClassState(state);

    if (state.joinedClass?.classId) {
      joinedClass = state.joinedClass;
      await window.classHub.setAppRole(ROLES.STUDENT);
      await loadStudentClassConfig();
      enterAppContent(ROLES.STUDENT, { skipClassGate: true });
      await ensureStudentScreenShareStarted();
      return;
    }

    await enterStudentMode();
    return;
  }

  if (session.lastRole === ROLES.TEACHER) {
    showTeacherAuth();
    return;
  }

  showRoleGate();
}

function formatChatTime(ts) {
  return new Date(ts).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function appendChatMessage(message) {
  if (!message?.id) {
    return;
  }

  const localClassId = getLocalClassId();
  if (localClassId && message.classId !== localClassId) {
    return;
  }

  if (chatMessages.some((item) => item.id === message.id)) {
    return;
  }

  chatMessages.push(message);
  renderChatMessages();
}

function renderChatMessages() {
  if (!chatMessagesEl) {
    return;
  }

  if (chatCountEl) {
    chatCountEl.textContent = String(chatMessages.length);
  }

  if (!chatMessages.length) {
    chatMessagesEl.innerHTML = '<div class="chat-empty muted">Пока нет сообщений. Напишите первым.</div>';
    return;
  }

  chatMessagesEl.innerHTML = chatMessages
    .map((message) => {
      const selfClass = message.self ? "chat-message-self" : "";
      return `
        <article class="chat-message ${selfClass}">
          <div class="chat-message-meta">
            <strong>${escapeHtml(message.hostname || message.ip || "Unknown")}</strong>
            <span class="muted">${escapeHtml(formatChatTime(message.ts))}</span>
          </div>
          <p class="chat-message-text">${escapeHtml(message.text)}</p>
        </article>
      `;
    })
    .join("");

  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

async function sendChatMessage() {
  const text = chatInput?.value.trim();
  if (!text) {
    return;
  }

  const result = await window.classHub.sendChatMessage(text);
  if (!result.ok) {
    setStatus(result.message);
    return;
  }

  chatInput.value = "";
  appendChatMessage({ ...result.message, self: true });

  if (result.targets === 0) {
    setStatus("Сообщение сохранено локально. В сети пока нет других ClassHub.");
    return;
  }

  if (result.delivered === 0) {
    setStatus("Сообщение отправлено, но другие ClassHub не ответили. Проверьте порт 8767.");
    return;
  }

  setStatus(`Сообщение доставлено на ${result.delivered} из ${result.targets} ПК.`);
}

function peerIsOnAir(peer) {
  return Boolean(peer.isStreaming) || Boolean(peer.streamPort);
}

function peerStreamPort(peer) {
  return peer.streamPort || 8766;
}

function normalizeWatchIp(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/stream.*$/i, "")
    .replace(/:8766.*$/i, "")
    .split("/")[0];
}

function buildWatchEntries(list) {
  const fromPeers = list.filter(
    (peer) => peerIsOnAir(peer) && !peer.isSelf && peerMatchesLocalClass(peer)
  );
  const knownIps = new Set(fromPeers.map((peer) => peer.ip));
  const manual = manualWatchIps
    .filter((ip) => ip && !knownIps.has(ip))
    .map((ip) => ({
      ip,
      hostname: ip,
      streamPort: 8766,
      isManual: true,
    }));

  return [...fromPeers, ...manual];
}

async function openStreamInApp(url) {
  const result = await window.classHub.openStreamViewer(url);
  if (result?.ok) {
    setStatus(`Трансляция открыта: ${result.url}`);
    return true;
  }

  setStatus(result?.message || "Не удалось открыть трансляцию.");
  return false;
}

function addManualWatchIp(ip) {
  const cleanIp = normalizeWatchIp(ip);
  if (!cleanIp) {
    setStatus("Укажите IP-адрес устройства с трансляцией.");
    return;
  }

  if (!manualWatchIps.includes(cleanIp)) {
    manualWatchIps.push(cleanIp);
  }

  if (watchIpInput) {
    watchIpInput.value = cleanIp;
  }

  renderScreenGrid(peers);
  setStatus(`Экран ${cleanIp} добавлен. Нажмите на превью, чтобы открыть трансляцию.`);
}

function renderPeers(list, state) {
  peers = list;
  const visiblePeers = filterPeersForRole(list);

  if (isStudentRole()) {
    updateSourceDisplay(state);
    return;
  }

  if (!isTeacherRole() || !peersBody) {
    return;
  }

  peerCount.textContent = String(visiblePeers.length);
  renderScreenGrid(list);
  if (currentPage === "workspace") {
    updateSourceDisplay(state);
  }

  if (visiblePeers.length === 0) {
    peersBody.innerHTML =
      '<tr class="empty-row"><td colspan="5">Компьютеры не найдены. Нажмите «Обновить список».</td></tr>';
    return;
  }

  peersBody.innerHTML = visiblePeers
    .map((peer) => {
      const selected = peer.ip === selectedIp ? "selected" : "";
      const name = peer.isSelf
        ? `${escapeHtml(peer.hostname)}<span class="self-tag">этот ПК</span>`
        : escapeHtml(peer.hostname);
      const roleClass = peer.hasClassHub
        ? peer.isSource
          ? "role-source"
          : "role-client"
        : "role-network";
      const role = peer.hasClassHub
        ? peer.isSource
          ? "Источник"
          : "Клиент"
        : "В сети";
      const screen = peerIsOnAir(peer)
        ? '<span class="role-source">В эфире</span>'
        : '<span class="role-client">—</span>';
      const url =
        peer.isSource && peer.httpPort
          ? `<span class="url-link">${escapeHtml(buildSourceUrl(peer.ip, peer.httpPort))}</span>`
          : "—";

      const liveClass = peerIsOnAir(peer) && !peer.isSelf ? "peer-live" : "";

      return `
        <tr data-ip="${escapeHtml(peer.ip)}" class="${selected} ${liveClass}">
          <td>${name}</td>
          <td>${escapeHtml(peer.ip)}</td>
          <td class="${roleClass}">${role}</td>
          <td>${screen}</td>
          <td>${url}</td>
        </tr>
      `;
    })
    .join("");

  peersBody.querySelectorAll("tr[data-ip]").forEach((row) => {
    row.addEventListener("click", () => {
      selectedIp = row.dataset.ip;
      renderPeers(peers, lastAppState);
    });
  });
}

function renderScreenGrid(list) {
  if (!isTeacherRole() || !screenGrid) {
    return;
  }

  const streaming = buildWatchEntries(list);
  screenCount.textContent = String(streaming.length);

  if (!streaming.length) {
    screenGrid.innerHTML = '<div class="screen-empty muted">Пока никто не транслирует экран</div>';
    return;
  }

  screenGrid.innerHTML = streaming
    .map((peer) => {
      const streamUrl = buildStreamUrl(peer.ip, peerStreamPort(peer));
      const title = peer.isManual ? `IP ${peer.ip}` : peer.hostname;
      return `
        <article class="screen-card">
          <div class="screen-card-head">
            <div class="screen-card-title">
              <span class="live-dot" aria-hidden="true"></span>
              <div>
                <strong>${escapeHtml(title)}</strong>
                <span class="muted">${escapeHtml(peer.ip)}</span>
              </div>
            </div>
            <button
              class="btn screen-browser-btn"
              data-stream-url="${escapeHtml(streamUrl)}"
              type="button"
              title="Открыть в браузере"
            >
              Браузер
            </button>
          </div>
          <button class="screen-preview-btn" data-stream-url="${escapeHtml(streamUrl)}" type="button">
            <img
              class="screen-preview"
              src="${escapeHtml(streamUrl)}"
              alt="Экран ${escapeHtml(title)}"
            />
            <span class="screen-preview-overlay">Смотреть</span>
          </button>
          <p class="screen-fallback muted hidden">
            <button class="btn primary screen-fallback-btn" data-stream-url="${escapeHtml(streamUrl)}" type="button">
              Смотреть трансляцию
            </button>
          </p>
        </article>
      `;
    })
    .join("");

  screenGrid.querySelectorAll(".screen-preview-btn").forEach((button) => {
    button.addEventListener("click", () => {
      openStreamInApp(button.dataset.streamUrl);
    });

    const image = button.querySelector(".screen-preview");
    image?.addEventListener("error", () => {
      button.classList.add("hidden");
      button.parentElement.querySelector(".screen-fallback")?.classList.remove("hidden");
    });
  });

  screenGrid.querySelectorAll(".screen-browser-btn").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      window.classHub.openUrl(button.dataset.streamUrl);
    });
  });

  screenGrid.querySelectorAll(".screen-fallback-btn").forEach((button) => {
    button.addEventListener("click", () => {
      openStreamInApp(button.dataset.streamUrl);
    });
  });
}

function getSelectedPeer() {
  return peers.find((peer) => peer.ip === selectedIp) || null;
}

function buildStatusMessage(state) {
  updateSourceLinkBox(state.sourceUrl, state.isSource);
  updateStreamLinkBox(state.streamUrl, state.isScreenSharing);
  updateStreamShareButtons(state.isScreenSharing);
  updateSourceDisplay(state);
  if (state.isSource && state.sourceUrl) {
    return `Источник активен: ${state.sourceUrl}`;
  }
  if (state.isScreenSharing && state.streamUrl) {
    return `Ваш экран транслируется: ${state.streamUrl}`;
  }
  return "Готов к работе";
}

function formatStatusWithFirewall(state, firewall) {
  const message = buildStatusMessage(state);
  if (firewall && !firewall.ok) {
    return `${message} | ${firewall.message}`;
  }
  return message;
}

function updateStreamLinkBox(streamUrl, isScreenSharing) {
  activeStreamUrl = isScreenSharing && streamUrl ? streamUrl : null;
  if (!streamLinkBox || !streamLinkInput) {
    return;
  }

  if (activeStreamUrl) {
    streamLinkBox.classList.remove("hidden");
    streamLinkInput.value = activeStreamUrl;
  } else {
    streamLinkBox.classList.add("hidden");
    streamLinkInput.value = "";
  }
}

function updateSourceLinkBox(sourceUrl, isSource) {
  activeSourceUrl = isSource && sourceUrl ? sourceUrl : null;
  if (!sourceLinkBox || !sourceLinkInput) {
    return;
  }

  if (activeSourceUrl) {
    sourceLinkBox.classList.remove("hidden");
    sourceLinkInput.value = activeSourceUrl;
  } else {
    sourceLinkBox.classList.add("hidden");
    sourceLinkInput.value = "";
  }
}

async function refreshState(options = {}) {
  const state = await window.classHub.getState();
  if (options.updatePeers !== false) {
    renderPeers(state.peers, state);
  }
  if (options.updateChat !== false) {
    chatMessages = filterChatForLocalClass(state.chatMessages || []);
    renderChatMessages();
  }
  setStatus(buildStatusMessage(state));
  return state;
}

async function runServiceAction(action, options = {}) {
  const result = await action();
  if (!result.ok) {
    setStatus(result.message);
    return null;
  }

  const state = await refreshState(options);
  setStatus(formatStatusWithFirewall(state, result.firewall));
  return state;
}

async function loadLocalInfo() {
  const state = await window.classHub.getState();
  const version = await window.classHub.getAppVersion();
  const versionLabel = `v${version}`;

  if (appVersionEl) {
    appVersionEl.textContent = versionLabel;
  }

  localName.textContent = state.hostname;
  localIp.textContent = state.localIp;

  if (state.networkInterfaces?.length) {
    const labels = state.networkInterfaces.map(
      (item) => `${formatInterfaceName(item.name)}: ${item.address}`
    );
    localNetworks.textContent = labels.join(" · ");
  } else {
    localNetworks.textContent = "";
  }
}

async function loadAppState() {
  const state = await window.classHub.getState();
  lastAppState = state;
  applyClassState(state);
  renderPeers(state.peers, state);
  chatMessages = filterChatForLocalClass(state.chatMessages || []);
  renderChatMessages();
  setStatus(buildStatusMessage(state));
}

function formatInterfaceName(name) {
  if (/wi-fi|wifi|wlan|беспровод/i.test(name)) {
    return "Wi‑Fi";
  }
  if (/ethernet|eth|lan|подключ/i.test(name)) {
    return "Кабель";
  }
  return name;
}

document.getElementById("btn-scan").addEventListener("click", async () => {
  const list = await window.classHub.scan();
  const state = await window.classHub.getState();
  lastAppState = state;
  renderPeers(list, state);
});

document.getElementById("btn-source")?.addEventListener("click", () =>
  runServiceAction(() => window.classHub.startSource({ classId: activeClassId }), { updatePeers: false })
);

document.getElementById("btn-stop").addEventListener("click", async () => {
  await window.classHub.stopSource();
  await refreshState({ updatePeers: false });
});

document.getElementById("btn-screen-start").addEventListener("click", () =>
  runServiceAction(() => window.classHub.startScreenShare())
);

document.getElementById("btn-screen-stop").addEventListener("click", async () => {
  await window.classHub.stopScreenShare();
  await refreshState();
});

document.getElementById("btn-open").addEventListener("click", async () => {
  const peer = getSelectedPeer();
  if (!peer) {
    setStatus("Выберите компьютер в списке.");
    return;
  }
  if (!peer.isSource || !peer.httpPort) {
    setStatus("Этот ПК не раздаёт файлы. Выберите источник.");
    return;
  }
  await window.classHub.openUrl(buildSourceUrl(peer.ip, peer.httpPort));
});

document.getElementById("btn-update").addEventListener("click", async () => {
  const updateButton = document.getElementById("btn-update");
  updateButton.disabled = true;
  try {
    const result = await window.classHub.checkUpdates();
    if (result.message) {
      setStatus(result.message);
    }
  } finally {
    updateButton.disabled = false;
  }
});

document.getElementById("btn-copy-link").addEventListener("click", async () => {
  if (!activeSourceUrl) {
    setStatus("Сначала запустите раздачу на этом ПК.");
    return;
  }
  await window.classHub.copyToClipboard(activeSourceUrl);
  setStatus("Ссылка скопирована. Вставьте в браузер на втором ноутбуке.");
});

document.getElementById("btn-open-source").addEventListener("click", async () => {
  if (!activeSourceUrl) {
    return;
  }
  await window.classHub.openUrl(activeSourceUrl);
});

btnPageWorkspace?.addEventListener("click", () => {
  showPage("workspace");
  if (lastAppState) {
    updateSourceDisplay(lastAppState);
  }
});

btnPageClassSettings?.addEventListener("click", () => {
  showPage("class-settings");
  renderClassEditor();
});

btnPageBroadcasts?.addEventListener("click", () => {
  showPage("broadcasts");
  if (lastAppState) {
    renderScreenGrid(lastAppState.peers || peers);
  }
});

btnBroadcastsFullscreen?.addEventListener("click", () => {
  setBroadcastsFullscreen(!document.body.classList.contains("broadcasts-fullscreen"));
});

watchIpForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  addManualWatchIp(watchIpInput?.value);
  if (watchIpInput) {
    watchIpInput.value = "";
  }
});

btnPageNetwork?.addEventListener("click", () => {
  showPage("network");
  if (lastAppState) {
    renderPeers(lastAppState.peers || peers, lastAppState);
  }
});

appsSearch?.addEventListener("input", () => {
  refreshAppsGrid();
});

sourceSelect?.addEventListener("change", () => {
  selectedSourceUrl = sourceSelect.value || null;
  if (lastAppState) {
    updateSourceDisplay(lastAppState);
  }
});

document.getElementById("btn-role-student")?.addEventListener("click", () => {
  enterStudentMode();
});

document.getElementById("btn-role-teacher")?.addEventListener("click", () => {
  showTeacherAuth();
});

document.getElementById("btn-teacher-back")?.addEventListener("click", () => {
  showRoleGate();
});

teacherAuthForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideTeacherAuthError();

  const password = teacherPasswordInput?.value || "";
  const result = await window.classHub.verifyTeacherPassword(password);
  if (!result.ok) {
    showTeacherAuthError(result.message || "Неверный пароль преподавателя.");
    return;
  }

  await enterTeacherMode();
});

document.getElementById("btn-switch-role")?.addEventListener("click", async () => {
  const state = lastAppState || (await window.classHub.getState());
  let message = "Сменить роль? Текущая сессия будет завершена.";

  if (state.isSource) {
    message = "Активна раздача материалов. Сменить роль и остановить раздачу?";
  } else if (state.isScreenSharing) {
    message = "Экран транслируется. Сменить роль и остановить трансляцию?";
  } else if (isStudentRole() && joinedClass) {
    message = `Выйти из класса «${joinedClass.className}» и сменить роль?`;
  }

  if (!confirmAction(message)) {
    return;
  }

  showRoleGate();
});

document.getElementById("btn-switch-class")?.addEventListener("click", async () => {
  if (isStudentRole()) {
    await window.classHub.stopScreenShare().catch(() => {});
    await window.classHub.leaveClass();
    joinedClass = null;
    studentVisibleApps = [];
    discoveredClassCatalog = [];
    showStudentClassGate();
    return;
  }

  if (isTeacherRole()) {
    await showTeacherClassGate();
  }
});

document.getElementById("btn-teacher-gate-back")?.addEventListener("click", () => {
  showRoleGate();
});

document.getElementById("btn-teacher-gate-new")?.addEventListener("click", async () => {
  await showTeacherGateForm("create");
});

document.getElementById("btn-teacher-gate-form-folder")?.addEventListener("click", async () => {
  const folder = await window.classHub.pickFolder();
  if (!folder) {
    return;
  }

  teacherGateDraftFolder = folder;
  if (teacherGateFormFolderEl) {
    teacherGateFormFolderEl.textContent = folder;
  }
});

document.getElementById("btn-teacher-gate-form-save")?.addEventListener("click", async () => {
  await saveTeacherGateForm({ enterAfterSave: false });
});

document.getElementById("btn-teacher-gate-form-save-enter")?.addEventListener("click", async () => {
  await saveTeacherGateForm({ enterAfterSave: true });
});

document.getElementById("btn-teacher-gate-form-cancel")?.addEventListener("click", async () => {
  showTeacherGateListView();
  await renderTeacherClassGate();
});

classAppsSearch?.addEventListener("input", () => {
  filterClassAppsList(classAppsList, classAppsEmpty, classAppsSearch.value);
});

teacherGateAppsSearch?.addEventListener("input", () => {
  filterClassAppsList(teacherGateFormApps, teacherGateAppsEmpty, teacherGateAppsSearch.value);
});

document.getElementById("btn-class-back")?.addEventListener("click", () => {
  showRoleGate();
});

document.getElementById("btn-class-scan")?.addEventListener("click", async () => {
  const scanButton = document.getElementById("btn-class-scan");
  if (scanButton) {
    scanButton.disabled = true;
  }

  try {
    await renderClassPicker();
  } finally {
    if (scanButton) {
      scanButton.disabled = false;
    }
  }
});

document.getElementById("btn-class-new")?.addEventListener("click", async () => {
  editingClassId = NEW_CLASS_ID;
  classFormDraftFolder = null;
  await renderClassEditor();
  classEditor?.scrollIntoView({ behavior: "smooth", block: "nearest" });
});

document.getElementById("btn-class-folder")?.addEventListener("click", async () => {
  if (!editingClassId) {
    return;
  }

  const folder = await window.classHub.pickFolder();
  if (!folder) {
    return;
  }

  if (editingClassId === NEW_CLASS_ID) {
    classFormDraftFolder = folder;
    renderClassEditor();
    return;
  }

  const result = await window.classHub.updateClass(editingClassId, { shareFolder: folder });
  if (!result.ok) {
    setStatus(result.message);
    return;
  }

  classes = result.classes;
  renderClassEditor();
  applyClassState(await window.classHub.getClasses());
  if (editingClassId === activeClassId) {
    await ensureClassSourceStarted({ quiet: true, forceRestart: true });
  }
});

document.getElementById("btn-class-save")?.addEventListener("click", async () => {
  if (!editingClassId) {
    return;
  }

  const name = classEditorNameInput?.value.trim();
  if (!name) {
    setStatus("Укажите название класса.");
    classEditorNameInput?.focus();
    return;
  }

  const visibleApps = getSelectedVisibleApps();

  if (editingClassId === NEW_CLASS_ID) {
    const result = await window.classHub.createClass({
      name,
      shareFolder: classFormDraftFolder,
      visibleApps,
    });

    if (!result.ok) {
      setStatus(result.message);
      return;
    }

    classFormDraftFolder = null;
    classes = result.classes;
    activeClassId = result.activeClassId;
    editingClassId = result.classItem.id;
    applyClassState(await window.classHub.getClasses());
    setStatus(`Класс «${result.classItem.name}» создан.`);
    await ensureClassSourceStarted({ quiet: true });
    return;
  }

  const result = await window.classHub.updateClass(editingClassId, {
    name,
    visibleApps,
  });

  if (!result.ok) {
    setStatus(result.message);
    return;
  }

  classes = result.classes;
  applyClassState(await window.classHub.getClasses());
  setStatus("Настройки класса сохранены.");
  if (editingClassId === activeClassId) {
    await ensureClassSourceStarted({ quiet: true, forceRestart: true });
  }
});

document.getElementById("btn-class-delete")?.addEventListener("click", async () => {
  if (!editingClassId || editingClassId === NEW_CLASS_ID) {
    return;
  }

  const classItem = classes.find((item) => item.id === editingClassId);
  const className = classItem?.name || "этот класс";
  if (
    !confirmAction(`Удалить класс «${className}»? Это действие нельзя отменить.`)
  ) {
    return;
  }

  const result = await window.classHub.deleteClass(editingClassId);
  if (!result.ok) {
    setStatus(result.message);
    return;
  }

  classes = result.classes;
  activeClassId = result.activeClassId;
  editingClassId = activeClassId;
  applyClassState(await window.classHub.getClasses());
  setStatus("Класс удалён.");
});

document.getElementById("btn-student-scan")?.addEventListener("click", async () => {
  if (isStudentRole()) {
    const discovery = await window.classHub.discoverTeacherClasses();
    discoveredClassCatalog = discovery.classes || [];
    if (joinedClass) {
      applyClassConfigFromCatalog(joinedClass.classId, joinedClass.teacherIp);
    }
  }

  const list = await window.classHub.scan();
  const state = await window.classHub.getState();
  lastAppState = state;
  renderPeers(list, state);
  refreshAppsGrid();
  setStatus(`Материалы обновлены. Устройств в сети: ${list.length}`);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && document.body.classList.contains("broadcasts-fullscreen")) {
    setBroadcastsFullscreen(false);
  }
});

chatForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await sendChatMessage();
});

window.classHub.onPeersUpdated(async (list) => {
  if (studentClassGate && !studentClassGate.classList.contains("hidden")) {
    clearTimeout(classPickerRefreshTimer);
    classPickerRefreshTimer = setTimeout(() => {
      renderClassPicker({ quiet: true }).catch(() => {});
    }, 900);
    return;
  }

  if (!currentRole) {
    return;
  }

  const state = lastAppState || (await window.classHub.getState());
  lastAppState = { ...state, peers: list };
  renderPeers(list, lastAppState);
});

window.classHub.onChatMessage((message) => {
  if (!currentRole) {
    return;
  }
  appendChatMessage(message);
});

window.classHub.onStatus((message) => {
  if (!currentRole) {
    return;
  }
  setStatus(message);
});

restoreSavedSession();
