const express = require("express");
const { CHAT_SERVER_PORT, MAX_CHAT_MESSAGES } = require("./constants");
const { tryAddChatFirewallRule } = require("./firewall");
const { listenOn, closeServer } = require("./serverUtils");
const { getLocalIp, getHostname } = require("./protocol");

class ChatServer {
  constructor() {
    this.port = CHAT_SERVER_PORT;
    this.server = null;
    this.messages = [];
    this.onMessage = null;
  }

  get isRunning() {
    return Boolean(this.server);
  }

  setMessageHandler(handler) {
    this.onMessage = handler;
  }

  setTeacherInfoProvider(provider) {
    this.getTeacherPayload = provider;
  }

  addMessage(message, { notify = true } = {}) {
    const normalized = {
      id: message.id || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      hostname: String(message.hostname || "Unknown").slice(0, 64),
      ip: String(message.ip || "").slice(0, 45),
      text: String(message.text || "").trim().slice(0, 2000),
      ts: Number(message.ts) || Date.now(),
    };

    if (!normalized.text) {
      return null;
    }

    if (this.messages.some((item) => item.id === normalized.id)) {
      return normalized;
    }

    this.messages.push(normalized);
    if (this.messages.length > MAX_CHAT_MESSAGES) {
      this.messages.splice(0, this.messages.length - MAX_CHAT_MESSAGES);
    }

    if (notify && typeof this.onMessage === "function") {
      this.onMessage(normalized);
    }

    return normalized;
  }

  getHistory() {
    return [...this.messages];
  }

  async start() {
    if (this.server) {
      return { ok: true, port: this.port };
    }

    const app = express();
    app.use(express.json({ limit: "16kb" }));

    app.get("/api/chat/status", (_req, res) => {
      res.json({
        ok: true,
        hostname: getHostname(),
        ip: getLocalIp(),
        port: this.port,
      });
    });

    app.get("/api/teacher/classes", (_req, res) => {
      const payload =
        typeof this.getTeacherPayload === "function" ? this.getTeacherPayload() : null;

      if (!payload) {
        res.status(404).json({ message: "Преподаватель не активен." });
        return;
      }

      res.json({
        ...payload,
        hostname: getHostname(),
        ip: getLocalIp(),
      });
    });

    app.get("/api/chat", (_req, res) => {
      res.json({ messages: this.getHistory() });
    });

    app.post("/api/chat", (req, res) => {
      const message = this.addMessage(req.body || {});
      if (!message) {
        res.status(400).json({ ok: false, message: "Пустое сообщение." });
        return;
      }

      res.json({ ok: true, message });
    });

    this.server = await listenOn(app, this.port);
    const firewall = await tryAddChatFirewallRule(this.port);

    return { ok: true, port: this.port, firewall };
  }

  async stop() {
    await closeServer(this.server);
    this.server = null;
  }
}

module.exports = { ChatServer };
