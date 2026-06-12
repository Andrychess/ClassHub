const peersBody = document.getElementById("peers-body");
const peerCount = document.getElementById("peer-count");
const screenCount = document.getElementById("screen-count");
const screenGrid = document.getElementById("screen-grid");
const statusEl = document.getElementById("status");
const localName = document.getElementById("local-name");
const localIp = document.getElementById("local-ip");
const localNetworks = document.getElementById("local-networks");
const folderSelect = document.getElementById("folder-select");
const folderPath = document.getElementById("folder-path");
const sourceLinkBox = document.getElementById("source-link-box");
const sourceLinkInput = document.getElementById("source-link");
const appVersionEl = document.getElementById("app-version");

let peers = [];
let selectedIp = null;
let shareFolder = null;
let savedFolders = [];
let activeSourceUrl = null;

function setStatus(message) {
  statusEl.textContent = message;
}

function renderPeers(list) {
  peers = list;
  peerCount.textContent = String(list.length);
  renderScreenGrid(list);

  if (list.length === 0) {
    peersBody.innerHTML =
      '<tr class="empty-row"><td colspan="5">Компьютеры не найдены. Нажмите «Обновить список».</td></tr>';
    return;
  }

  peersBody.innerHTML = list
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
      const screen =
        peer.isStreaming && peer.streamPort
          ? '<span class="role-source">В эфире</span>'
          : '<span class="role-client">—</span>';
      const url =
        peer.isSource && peer.httpPort
          ? `<span class="url-link">http://${escapeHtml(peer.ip)}:${peer.httpPort}/</span>`
          : "—";

      return `
        <tr data-ip="${escapeHtml(peer.ip)}" class="${selected}">
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
      renderPeers(peers);
    });
  });
}

function renderScreenGrid(list) {
  const streaming = list.filter((peer) => peer.isStreaming && peer.streamPort && !peer.isSelf);
  screenCount.textContent = String(streaming.length);

  if (!streaming.length) {
    screenGrid.innerHTML = '<div class="screen-empty muted">Пока никто не транслирует экран</div>';
    return;
  }

  screenGrid.innerHTML = streaming
    .map((peer) => {
      const streamUrl = `http://${peer.ip}:${peer.streamPort}/stream`;
      return `
        <article class="screen-card">
          <div class="screen-card-head">
            <strong>${escapeHtml(peer.hostname)}</strong>
            <span class="muted">${escapeHtml(peer.ip)}</span>
          </div>
          <img
            class="screen-preview"
            src="${escapeHtml(streamUrl)}"
            alt="Экран ${escapeHtml(peer.hostname)}"
          />
        </article>
      `;
    })
    .join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function folderLabel(folder) {
  const parts = folder.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] || folder;
}

function updateFolderUi() {
  folderSelect.innerHTML = '<option value="">Выберите сохранённую папку...</option>';
  for (const folder of savedFolders) {
    const option = document.createElement("option");
    option.value = folder;
    option.textContent = folderLabel(folder);
    option.title = folder;
    folderSelect.appendChild(option);
  }

  folderSelect.value = shareFolder || "";
  folderPath.textContent = shareFolder || "Папка не выбрана";
}

function applyFolderState(nextShareFolder, nextSavedFolders) {
  shareFolder = nextShareFolder || null;
  savedFolders = nextSavedFolders || [];
  updateFolderUi();
}

function getSelectedPeer() {
  return peers.find((peer) => peer.ip === selectedIp) || null;
}

function buildStatusMessage(state) {
  updateSourceLinkBox(state.sourceUrl, state.isSource);
  if (state.isSource && state.sourceUrl) {
    return `Источник активен: ${state.sourceUrl}`;
  }
  if (state.isScreenSharing && state.streamUrl) {
    return `Ваш экран транслируется: ${state.streamUrl}`;
  }
  return "Поиск компьютеров в сети...";
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

async function loadState() {
  const state = await window.classHub.getState();
  const version = await window.classHub.getAppVersion();
  if (appVersionEl) {
    appVersionEl.textContent = `v${version}`;
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

  applyFolderState(state.shareFolder, state.savedFolders);
  renderPeers(state.peers);
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
  renderPeers(list);
});

document.getElementById("btn-folder").addEventListener("click", async () => {
  const folder = await window.classHub.pickFolder();
  if (!folder) {
    return;
  }
  const state = await window.classHub.getState();
  applyFolderState(folder, state.savedFolders);
});

folderSelect.addEventListener("change", async () => {
  const folder = folderSelect.value;
  if (!folder) {
    shareFolder = null;
    folderPath.textContent = "Папка не выбрана";
    return;
  }

  const result = await window.classHub.selectFolder(folder);
  if (!result.ok) {
    setStatus(result.message);
    await loadState();
    return;
  }

  applyFolderState(result.shareFolder, result.savedFolders);
});

document.getElementById("btn-remove-folder").addEventListener("click", async () => {
  if (!shareFolder) {
    setStatus("Сначала выберите папку для удаления из списка.");
    return;
  }

  const result = await window.classHub.removeSavedFolder(shareFolder);
  applyFolderState(result.shareFolder, result.savedFolders);
  setStatus("Папка удалена из списка.");
});

document.getElementById("btn-source").addEventListener("click", async () => {
  const result = await window.classHub.startSource(shareFolder);
  if (!result.ok) {
    setStatus(result.message);
    return;
  }

  const state = await window.classHub.getState();
  applyFolderState(state.shareFolder, state.savedFolders);
  setStatus(buildStatusMessage(state));

  if (result.firewall && !result.firewall.ok) {
    setStatus(`${buildStatusMessage(state)} | ${result.firewall.message}`);
  }
});

document.getElementById("btn-stop").addEventListener("click", async () => {
  await window.classHub.stopSource();
  const state = await window.classHub.getState();
  setStatus(buildStatusMessage(state));
});

document.getElementById("btn-screen-start").addEventListener("click", async () => {
  const result = await window.classHub.startScreenShare();
  if (!result.ok) {
    setStatus(result.message);
    return;
  }

  const state = await window.classHub.getState();
  renderPeers(state.peers);
  setStatus(buildStatusMessage(state));

  if (result.firewall && !result.firewall.ok) {
    setStatus(`${buildStatusMessage(state)} | ${result.firewall.message}`);
  }
});

document.getElementById("btn-screen-stop").addEventListener("click", async () => {
  await window.classHub.stopScreenShare();
  const state = await window.classHub.getState();
  renderPeers(state.peers);
  setStatus(buildStatusMessage(state));
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
  await window.classHub.openUrl(`http://${peer.ip}:${peer.httpPort}/`);
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

window.classHub.onPeersUpdated((list) => {
  renderPeers(list);
});

window.classHub.onStatus((message) => {
  setStatus(message);
});

loadState();
