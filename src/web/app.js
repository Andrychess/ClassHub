const filesBody = document.getElementById("files-body");
const breadcrumbs = document.getElementById("breadcrumbs");
const itemCount = document.getElementById("item-count");
const sourceName = document.getElementById("source-name");
const sourceHost = document.getElementById("source-host");
const searchInput = document.getElementById("search");

let currentPath = "";
let allItems = [];

async function loadInfo() {
  const response = await fetch("/api/info");
  if (!response.ok) {
    throw new Error("Не удалось получить информацию об источнике");
  }
  const info = await response.json();
  sourceName.textContent = info.rootName;
  sourceHost.textContent = `${info.hostname} · ${info.ip}`;
}

async function loadDirectory(path = "") {
  currentPath = path;
  setState("Загрузка...");

  const query = path ? `?path=${encodeURIComponent(path)}` : "";
  const response = await fetch(`/api/browse${query}`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Ошибка загрузки" }));
    setState(error.message || "Не удалось открыть папку", true);
    return;
  }

  const data = await response.json();
  allItems = data.items;
  renderBreadcrumbs(data.segments);
  renderFiles(filterItems(allItems));
  itemCount.textContent = String(allItems.length);
}

function filterItems(items) {
  const query = searchInput.value.trim().toLowerCase();
  if (!query) {
    return items;
  }
  return items.filter((item) => item.name.toLowerCase().includes(query));
}

function renderBreadcrumbs(segments) {
  const parts = [
    `<button class="crumb-btn" data-path="">Корень</button>`,
    ...segments.map(
      (segment) =>
        `<span class="crumb-sep">/</span><button class="crumb-btn" data-path="${escapeHtml(
          segment.path
        )}">${escapeHtml(segment.name)}</button>`
    ),
  ];

  breadcrumbs.innerHTML = parts.join("");
  breadcrumbs.querySelectorAll(".crumb-btn").forEach((button) => {
    button.addEventListener("click", () => {
      loadDirectory(button.dataset.path || "");
    });
  });
}

function renderFiles(items) {
  if (items.length === 0) {
    setState("В этой папке нет файлов");
    return;
  }

  filesBody.innerHTML = items
    .map((item) => {
      const isFolder = item.type === "dir";
      const iconClass = isFolder ? "folder" : "file";
      const iconLabel = isFolder ? "DIR" : extLabel(item.name);
      const size = isFolder ? "—" : formatSize(item.size);
      const modified = formatDate(item.modified);
      const action = isFolder
        ? `<button class="btn linkish" data-open="${escapeHtml(item.path)}">Открыть</button>`
        : `<a class="btn download" href="${escapeHtml(item.downloadUrl)}" download>Скачать</a>`;

      return `
        <tr>
          <td>
            <div class="name-cell">
              <div class="file-icon ${iconClass}">${iconLabel}</div>
              <div>
                <span class="file-name">${escapeHtml(item.name)}</span>
                <span class="file-meta">${isFolder ? "Папка" : "Файл"}</span>
              </div>
            </div>
          </td>
          <td>${size}</td>
          <td>${modified}</td>
          <td>${action}</td>
        </tr>
      `;
    })
    .join("");

  filesBody.querySelectorAll("[data-open]").forEach((button) => {
    button.addEventListener("click", () => {
      loadDirectory(button.dataset.open);
    });
  });

  filesBody.querySelectorAll("tr").forEach((row, index) => {
    const item = items[index];
    if (item?.type === "dir") {
      row.style.cursor = "pointer";
      row.addEventListener("dblclick", () => loadDirectory(item.path));
    }
  });
}

function setState(message, isError = false) {
  filesBody.innerHTML = `
    <tr class="state-row">
      <td colspan="4" class="${isError ? "state-error" : ""}">${escapeHtml(message)}</td>
    </tr>
  `;
}

function extLabel(filename) {
  const parts = filename.split(".");
  if (parts.length < 2) {
    return "FILE";
  }
  return parts.pop().slice(0, 4).toUpperCase();
}

function formatSize(bytes) {
  if (!bytes) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDate(value) {
  if (!value) {
    return "—";
  }
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function parentPath(path) {
  if (!path) {
    return "";
  }
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

document.getElementById("btn-refresh").addEventListener("click", () => {
  loadDirectory(currentPath);
});

document.getElementById("btn-up").addEventListener("click", () => {
  loadDirectory(parentPath(currentPath));
});

searchInput.addEventListener("input", () => {
  renderFiles(filterItems(allItems));
});

async function init() {
  try {
    await loadInfo();
    await loadDirectory("");
  } catch (error) {
    setState(error.message || "Сервер недоступен", true);
  }
}

init();
