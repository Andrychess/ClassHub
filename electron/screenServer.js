const express = require("express");
const { SCREEN_SERVER_PORT } = require("./constants");
const { buildLocalStreamUrl } = require("./urls");
const { tryAddScreenFirewallRule } = require("./firewall");
const { listenOn, closeServer } = require("./serverUtils");

const BOUNDARY = "classhub-frame";

class ScreenServer {
  constructor() {
    this.port = SCREEN_SERVER_PORT;
    this.server = null;
    this.clients = new Set();
    this.latestFrame = null;
  }

  get isRunning() {
    return Boolean(this.server);
  }

  get url() {
    return buildLocalStreamUrl(this.port);
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

    this.server = await listenOn(app, this.port);
    const firewall = await tryAddScreenFirewallRule(this.port);

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
    await closeServer(this.server);
    this.server = null;
  }
}

module.exports = { ScreenServer, SCREEN_SERVER_PORT };
