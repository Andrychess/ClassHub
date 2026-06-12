function normalizeAppName(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "";
  }

  if (/[\\/]/.test(trimmed) || /\.lnk$/i.test(trimmed)) {
    const base = trimmed.replace(/\\/g, "/").split("/").pop() || trimmed;
    return base.replace(/\.lnk$/i, "").trim().toLowerCase();
  }

  return trimmed.toLowerCase();
}

function resolveVisibleAppDisplayName(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "";
  }

  if (/[\\/]/.test(trimmed) || /\.lnk$/i.test(trimmed)) {
    const base = trimmed.replace(/\\/g, "/").split("/").pop() || trimmed;
    return base.replace(/\.lnk$/i, "").trim();
  }

  return trimmed;
}

function normalizeVisibleAppNames(values) {
  const seen = new Set();
  const unique = [];

  for (const item of values || []) {
    const displayName = resolveVisibleAppDisplayName(item);
    const key = normalizeAppName(displayName);
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(displayName);
  }

  return unique;
}
