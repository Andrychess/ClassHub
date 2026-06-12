const fs = require("fs");
const path = require("path");
const { shell } = require("electron");
const { normalizeHttpUrl } = require("./urls");

function normalizeLinkInput(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return { ok: false, message: "Укажите адрес ссылки." };
  }

  if (trimmed.length > 2048) {
    return { ok: false, message: "Адрес ссылки слишком длинный." };
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return { ok: true, url: normalizeHttpUrl(trimmed), kind: "web" };
  }

  if (/^[a-zA-Z]:[\\/]/.test(trimmed) || trimmed.startsWith("\\\\")) {
    return { ok: true, url: path.normalize(trimmed), kind: "path" };
  }

  if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}/i.test(trimmed) && !trimmed.includes("\\")) {
    return { ok: true, url: normalizeHttpUrl(trimmed), kind: "web" };
  }

  return { ok: false, message: "Укажите http(s):// адрес или путь к файлу." };
}

async function openLinkTarget(value) {
  const normalized = normalizeLinkInput(value);
  if (!normalized.ok) {
    return normalized;
  }

  if (normalized.kind === "web") {
    await shell.openExternal(normalized.url);
    return { ok: true, url: normalized.url };
  }

  if (!fs.existsSync(normalized.url)) {
    return { ok: false, message: "Файл или папка не найдены на этом компьютере." };
  }

  const errorMessage = await shell.openPath(normalized.url);
  if (errorMessage) {
    return { ok: false, message: errorMessage };
  }

  return { ok: true, url: normalized.url };
}

module.exports = {
  normalizeLinkInput,
  openLinkTarget,
};
