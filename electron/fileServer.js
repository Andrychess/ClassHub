const express = require("express");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { getLocalIp, getHostname } = require("./protocol");

const DEFAULT_PORT = 8765;
const WEB_ROOT = path.join(__dirname, "../src/web");

class FileServer {
  constructor() {
    this.port = DEFAULT_PORT;
    this.directory = null;
    this.server = null;
  }

  get isRunning() {
    return Boolean(this.server);
  }

  get url() {
    return `http://${getLocalIp()}:${this.port}/`;
  }

  async start(directory) {
    if (this.server) {
      return { ok: true, url: this.url, port: this.port };
    }

    this.directory = path.resolve(directory);
    const app = express();

    app.get("/api/info", (_req, res) => {
      res.json({
        rootName: path.basename(this.directory),
        hostname: getHostname(),
        ip: getLocalIp(),
      });
    });

    app.get("/api/browse", (req, res) => {
      const relativePath = normalizeRelativePath(req.query.path || "");
      const targetDir = resolveInsideRoot(this.directory, relativePath);

      if (!targetDir) {
        res.status(403).json({ message: "Доступ запрещён" });
        return;
      }

      fs.stat(targetDir, (error, stat) => {
        if (error || !stat.isDirectory()) {
          res.status(404).json({ message: "Папка не найдена" });
          return;
        }

        fs.readdir(targetDir, { withFileTypes: true }, (readError, entries) => {
          if (readError) {
            res.status(500).json({ message: "Не удалось прочитать папку" });
            return;
          }

          const items = entries
            .map((entry) => buildItem(this.directory, relativePath, entry))
            .sort((a, b) => {
              if (a.type !== b.type) {
                return a.type === "dir" ? -1 : 1;
              }
              return a.name.localeCompare(b.name, "ru");
            });

          res.json({
            path: relativePath,
            segments: buildSegments(relativePath),
            items,
          });
        });
      });
    });

    app.get("/dl/:file(*)", (req, res) => {
      const relativePath = normalizeRelativePath(req.params.file || "");
      const targetFile = resolveInsideRoot(this.directory, relativePath);

      if (!targetFile) {
        res.status(403).send("Forbidden");
        return;
      }

      fs.stat(targetFile, (error, stat) => {
        if (error || !stat.isFile()) {
          res.status(404).send("File not found");
          return;
        }
        res.download(targetFile, path.basename(targetFile));
      });
    });

    app.use(express.static(WEB_ROOT, { index: "index.html" }));

    app.get("*", (_req, res) => {
      res.sendFile(path.join(WEB_ROOT, "index.html"));
    });

    await new Promise((resolve, reject) => {
      this.server = app.listen(this.port, "0.0.0.0", () => resolve());
      this.server.on("error", reject);
    });

    const firewall = await tryAddFirewallRule(this.port);
    return {
      ok: true,
      url: this.url,
      port: this.port,
      firewall,
    };
  }

  async stop() {
    if (!this.server) {
      return;
    }

    await new Promise((resolve) => {
      this.server.close(() => resolve());
    });
    this.server = null;
    this.directory = null;
  }
}

function normalizeRelativePath(value) {
  return String(value)
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part && part !== ".")
    .join("/");
}

function resolveInsideRoot(rootDir, relativePath) {
  const target = path.resolve(rootDir, relativePath || ".");
  if (target !== rootDir && !target.startsWith(rootDir + path.sep)) {
    return null;
  }
  return target;
}

function buildSegments(relativePath) {
  if (!relativePath) {
    return [];
  }

  const parts = relativePath.split("/").filter(Boolean);
  return parts.map((part, index) => ({
    name: part,
    path: parts.slice(0, index + 1).join("/"),
  }));
}

function buildItem(rootDir, parentPath, entry) {
  const entryPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
  const fullPath = path.join(rootDir, entryPath);
  const isDir = entry.isDirectory();

  let size = 0;
  let modified = null;
  try {
    const stat = fs.statSync(fullPath);
    size = stat.size;
    modified = stat.mtime.toISOString();
  } catch {
    // ignore stat errors for individual entries
  }

  const urlPath = entryPath.split(path.sep).map(encodeURIComponent).join("/");

  return {
    name: entry.name,
    path: entryPath.replace(/\\/g, "/"),
    type: isDir ? "dir" : "file",
    size: isDir ? 0 : size,
    modified,
    downloadUrl: isDir ? null : `/dl/${urlPath}`,
  };
}

function tryAddFirewallRule(port) {
  return new Promise((resolve) => {
    const ruleName = `ClassHub HTTP ${port}`;
    const args = [
      "advfirewall",
      "firewall",
      "add",
      "rule",
      `name=${ruleName}`,
      "dir=in",
      "action=allow",
      "protocol=TCP",
      `localport=${port}`,
    ];

    execFile("netsh", args, { windowsHide: true }, (error) => {
      if (error) {
        resolve({
          ok: false,
          message:
            "Не удалось открыть порт в брандмауэре. Запустите приложение от администратора.",
        });
        return;
      }

      resolve({ ok: true, message: `Порт ${port} открыт в брандмауэре` });
    });
  });
}

module.exports = { FileServer, DEFAULT_PORT };
