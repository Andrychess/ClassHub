const { getLocalIp } = require("./protocol");

function normalizeHttpUrl(url) {
  let value = String(url || "").trim();
  if (!value) {
    return value;
  }

  if (/^https:\/\//i.test(value)) {
    value = value.replace(/^https:\/\//i, "http://");
  }

  if (!/^https?:\/\//i.test(value)) {
    value = `http://${value}`;
  }

  return value;
}

function buildSourceUrl(ip, port, { trailingSlash = true } = {}) {
  const suffix = trailingSlash ? "/" : "";
  return `http://${ip}:${port}${suffix}`;
}

function buildStreamUrl(ip, port) {
  return `http://${ip}:${port}/stream`;
}

function buildLocalSourceUrl(port) {
  return buildSourceUrl(getLocalIp(), port);
}

function buildLocalStreamUrl(port) {
  return buildStreamUrl(getLocalIp(), port);
}

module.exports = {
  normalizeHttpUrl,
  buildSourceUrl,
  buildStreamUrl,
  buildLocalSourceUrl,
  buildLocalStreamUrl,
};
