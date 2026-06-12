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
const streamLinkBox = document.getElementById("stream-link-box");
const streamLinkInput = document.getElementById("stream-link");
const appVersionEl = document.getElementById("app-version");

let peers = [];
let selectedIp = null;
let shareFolder = null;
let savedFolders = [];
let activeSourceUrl = null;
let activeStreamUrl = null;
let screenRefreshTimers = [];

function clearScreenRefreshTimers() {
  for (const timerId of screenRefreshTimers) {
    clearInterval(timerId);
  }
  screenRefreshTimers = [];
}

function setStatus(message) {
  statusEl.textContent = message;
}

function peerIsOnAir(peer) {
  return Boolean(peer.isStreaming) || Boolean(peer.streamPort);
}

function peerStreamPort(peer) {
  return peer.streamPort || 8766;
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
      renderPeers(peers);
    });
  });
}

function renderScreenGrid(list) {
  clearScreenRefreshTimers();
  const streaming = list.filter((peer) => peerIsOnAir(peer) && !peer.isSelf);
  screenCount.textContent = String(streaming.length);

  if (!streaming.length) {
    screenGrid.innerHTML = '<div class="screen-empty muted">Пока никто не транслирует экран</div>';
    return;
  }

  screenGrid.innerHTML = streaming
    .map((peer) => {
      const frameUrl = buildFrameUrl(peer.ip, peerStreamPort(peer));
      const streamUrl = buildStreamUrl(peer.ip, peerStreamPort(peer));
      return `
        <article class="screen-card">
          <div class="screen-card-head">
            <strong>${escapeHtml(peer.hostname)}</strong>
            <span class="muted">${escapeHtml(peer.ip)}</span>
            <button class="btn linkish screen-open-btn" data-stream-url="${escapeHtml(streamUrl)}" type="button">
              Открыть в браузере
            </button>
          </div>
          <img
            class="screen-preview"
            data-frame-url="${escapeHtml(frameUrl)}"
            src="${escapeHtml(`${frameUrl}?t=${Date.now()}`)}"
            alt="Экран ${escapeHtml(peer.hostname)}"
          />
          <p class="screen-fallback muted hidden">
            Кадры не приходят. Проверьте брандмауэр на ПК ученика (порт 8766) и нажмите «Обновить список».
          </p>
        </article>
      `;
    })
    .join("");

  screenGrid.querySelectorAll(".screen-open-btn").forEach((button) => {
    button.addEventListener("click", () => {
      window.classHub.openUrl(button.dataset.streamUrl);
    });
  });

  screenGrid.querySelectorAll(".screen-preview").forEach((image) => {
    const frameBase = image.dataset.frameUrl;
    const timerId = setInterval(() => {
      image.src = `${frameBase}?t=${Date.now()}`;
    }, 400);
    screenRefreshTimers.push(timerId);

    image.addEventListener("error", () => {
      image.classList.add("hidden");
      image.parentElement.querySelector(".screen-fallback")?.classList.remove("hidden");
    });
  });
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
  updateStreamLinkBox(state.streamUrl, state.isScreenSharing);
  if (state.isSource && state.sourceUrl) {
    return `Источник активен: ${state.sourceUrl}`;
  }
  if (state.isScreenSharing && state.streamUrl) {
    return `Ваш экран транслируется: ${state.streamUrl}`;
  }
  return "Поиск компьютеров в сети...";
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
  if (options.updateFolders !== false) {
    applyFolderState(state.shareFolder, state.savedFolders);
  }
  if (options.updatePeers !== false) {
    renderPeers(state.peers);
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

document.getElementById("btn-source").addEventListener("click", () =>
  runServiceAction(() => window.classHub.startSource(shareFolder), { updatePeers: false })
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

document.getElementById("btn-copy-stream").addEventListener("click", async () => {
  if (!activeStreamUrl) {
    setStatus("Сначала включите трансляцию экрана.");
    return;
  }
  await window.classHub.copyToClipboard(activeStreamUrl);
  setStatus("Ссылка на трансляцию скопирована.");
});

document.getElementById("btn-open-stream").addEventListener("click", async () => {
  if (!activeStreamUrl) {
    return;
  }
  await window.classHub.openUrl(activeStreamUrl);
});

window.classHub.onPeersUpdated((list) => {
  renderPeers(list);
});

window.classHub.onStatus((message) => {
  setStatus(message);
});

loadState();
