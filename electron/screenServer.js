const express = require("express");
const { execFile } = require("child_process");
const { getLocalIp } = require("./protocol");

const DEFAULT_PORT = 8766;
const BOUNDARY = "classhub-frame";

class ScreenServer {
  constructor() {
    this.port = DEFAULT_PORT;
    this.server = null;
    this.clients = new Set();
    this.latestFrame = null;
  }

  get isRunning() {
    return Boolean(this.server);
  }

  get url() {
    return `http://${getLocalIp()}:${this.port}/stream`;
  }

  setFrame(buffer) {
    if (!buffer || !buffer.length) {
      return;
    }
    this.latestFrame = buffer;
    for (const client of this.clients) {
      this.writeFrame(client, buffer);
    }
  }

  writeFrame(response, buffer) {
    try {
      response.write(
        `--${BOUNDARY}\r\nContent-Type: image/jpeg\r\nContent-Length: ${buffer.length}\r\n\r\n`
      );
      response.write(buffer);
      response.write("\r\n");
    } catch {
      this.clients.delete(response);
    }
  }

  async start() {
    if (this.server) {
      return { ok: true, url: this.url, port: this.port };
    }

    const app = express();
    app.get("/stream", (req, res) => {
      res.writeHead(200, {
        "Content-Type": `multipart/x-mixed-replace; boundary=${BOUNDARY}`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Connection: "close",
      });

      this.clients.add(res);
      if (this.latestFrame) {
        this.writeFrame(res, this.latestFrame);
      }

      req.on("close", () => {
        this.clients.delete(res);
      });
    });

    await new Promise((resolve, reject) => {
      this.server = app.listen(this.port, "0.0.0.0", () => resolve());
      this.server.on("error", reject);
    });

    const firewall = await tryAddFirewallRule(this.port);
    return { ok: true, url: this.url, port: this.port, firewall };
  }

  async stop() {
    for (const client of this.clients) {
      try {
        client.end();
      } catch {
        // ignore
      }
    }
    this.clients.clear();
    this.latestFrame = null;

    if (!this.server) {
      return;
    }

    await new Promise((resolve) => {
      this.server.close(() => resolve());
    });
    this.server = null;
  }
}

function tryAddFirewallRule(port) {
  return new Promise((resolve) => {
    const ruleName = `ClassHub Screen ${port}`;
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
          message: "Не удалось открыть порт трансляции в брандмауэре.",
        });
        return;
      }
      resolve({ ok: true, message: `Порт трансляции ${port} открыт` });
    });
  });
}

module.exports = { ScreenServer, DEFAULT_PORT };
