const dgram = require("dgram");
const { DISCOVERY_SCAN_INTERVAL_MS, SOURCE_ANNOUNCE_INTERVAL_MS } = require("./constants");
const { sortPeers } = require("./peers");
const {
  PORT,
  MSG_DISCOVER,
  MSG_HELLO,
  MSG_SOURCE,
  MSG_SCREEN,
  MSG_SCREEN_STOP,
  getLocalIp,
  getHostname,
  isLocalIp,
  parseMessage,
  toHello,
  toSource,
  toScreen,
  toStopSource,
  toStopScreen,
  toDiscover,
  sendBroadcast,
} = require("./protocol");

class DiscoveryService {
  constructor(onPeersChanged) {
    this.onPeersChanged = onPeersChanged;
    this.hostname = getHostname();
    this.localIp = getLocalIp();
    this.isSource = false;
    this.httpPort = null;
    this.isStreaming = false;
    this.streamPort = null;
    this.classId = null;
    this.className = null;
    this.role = null;
    this.peers = new Map();
    this.socket = null;
    this.scanTimer = null;
    this.sourceAnnounceTimer = null;
    this.screenAnnounceTimer = null;
  }

  refreshNetworkIdentity() {
    this.hostname = getHostname();
    this.localIp = getLocalIp();
  }

  start() {
    this.socket = dgram.createSocket("udp4");
    this.socket.on("error", () => {});

    this.socket.on("message", (data, rinfo) => {
      const { type, peer } = parseMessage(data);
      if (!type) {
        return;
      }

      if (type === MSG_DISCOVER) {
        this.replyHello(rinfo.address);
        return;
      }

      if (
        (type === MSG_HELLO ||
          type === MSG_SOURCE ||
          type === MSG_SCREEN ||
          type === MSG_SCREEN_STOP) &&
        peer
      ) {
        if (isLocalIp(peer.ip)) {
          return;
        }
        this.upsertPeer(peer, type);
      }
    });

    this.socket.bind(PORT, () => {
      this.upsertPeer(this.getSelfPeer(), MSG_HELLO);
      this.scan();
      this.scanTimer = setInterval(() => this.scan(), DISCOVERY_SCAN_INTERVAL_MS);
    });
  }

  stop() {
    this.stopSourceAnnounceTimer();
    this.stopScreenAnnounceTimer();
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  getSelfPeer() {
    return {
      hostname: this.hostname,
      ip: this.localIp,
      isSource: this.isSource,
      httpPort: this.httpPort,
      isStreaming: this.isStreaming,
      streamPort: this.streamPort,
      classId: this.classId,
      className: this.className,
      role: this.role,
      isSelf: true,
    };
  }

  setRoleContext(role) {
    this.role = role || null;
    this.upsertPeer(this.getSelfPeer(), MSG_HELLO);
  }

  setClassContext({ classId, className } = {}) {
    this.classId = classId || null;
    this.className = className || null;
    this.upsertPeer(this.getSelfPeer(), MSG_HELLO);
  }

  scan() {
    sendBroadcast(toDiscover());
  }

  announceSource(httpPort, classMeta = {}) {
    this.refreshNetworkIdentity();
    this.isSource = true;
    this.httpPort = httpPort;
    if (classMeta.classId) {
      this.classId = classMeta.classId;
      this.className = classMeta.className || null;
    }
    this.upsertPeer(this.getSelfPeer(), MSG_SOURCE);
    this.broadcastSource(httpPort);
    this.startSourceAnnounceTimer(httpPort);
  }

  broadcastSource(httpPort) {
    sendBroadcast(
      toSource({
        hostname: this.hostname,
        ip: this.localIp,
        httpPort: httpPort || this.httpPort,
        classId: this.classId,
        className: this.className,
      })
    );
  }

  startSourceAnnounceTimer(httpPort) {
    this.stopSourceAnnounceTimer();
    this.sourceAnnounceTimer = setInterval(() => {
      if (!this.isSource) {
        return;
      }
      this.refreshNetworkIdentity();
      this.upsertPeer(this.getSelfPeer(), MSG_SOURCE);
      this.broadcastSource(httpPort || this.httpPort);
    }, SOURCE_ANNOUNCE_INTERVAL_MS);
  }

  stopSourceAnnounceTimer() {
    if (this.sourceAnnounceTimer) {
      clearInterval(this.sourceAnnounceTimer);
      this.sourceAnnounceTimer = null;
    }
  }

  announceStopSource() {
    this.stopSourceAnnounceTimer();
    this.isSource = false;
    this.httpPort = null;
    this.upsertPeer(this.getSelfPeer(), MSG_HELLO);
    sendBroadcast(toStopSource());
  }

  announceScreen(streamPort) {
    this.refreshNetworkIdentity();
    this.isStreaming = true;
    this.streamPort = streamPort;
    this.upsertPeer(this.getSelfPeer(), MSG_SCREEN);
    this.broadcastScreen(streamPort);
    this.startScreenAnnounceTimer(streamPort);
  }

  broadcastScreen(streamPort) {
    sendBroadcast(
      toScreen({
        hostname: this.hostname,
        ip: this.localIp,
        streamPort: streamPort || this.streamPort,
      })
    );
  }

  startScreenAnnounceTimer(streamPort) {
    this.stopScreenAnnounceTimer();
    this.screenAnnounceTimer = setInterval(() => {
      if (!this.isStreaming) {
        return;
      }
      this.refreshNetworkIdentity();
      this.upsertPeer(this.getSelfPeer(), MSG_SCREEN);
      this.broadcastScreen(streamPort || this.streamPort);
    }, SOURCE_ANNOUNCE_INTERVAL_MS);
  }

  stopScreenAnnounceTimer() {
    if (this.screenAnnounceTimer) {
      clearInterval(this.screenAnnounceTimer);
      this.screenAnnounceTimer = null;
    }
  }

  announceStopScreen() {
    this.stopScreenAnnounceTimer();
    this.isStreaming = false;
    this.streamPort = null;
    this.upsertPeer(this.getSelfPeer(), MSG_SCREEN_STOP);
    sendBroadcast(toStopScreen());
  }

  replyHello(targetIp) {
    if (!this.socket) {
      return;
    }

    this.refreshNetworkIdentity();
    const payload = toHello(this.getSelfPeer());
    this.socket.send(Buffer.from(payload, "utf8"), PORT, targetIp, () => {});
  }

  upsertPeer(peer, messageType = MSG_HELLO) {
    const key = peer.ip;
    const existing = this.peers.get(key) || {};

    if (messageType === MSG_SOURCE) {
      peer = { ...existing, ...peer, isSource: true };
    } else if (messageType === MSG_SCREEN) {
      peer = { ...existing, ...peer, isStreaming: true };
    } else if (messageType === MSG_SCREEN_STOP) {
      peer = { ...existing, ...peer, isStreaming: false, streamPort: null };
    } else if (messageType === MSG_HELLO) {
      peer = {
        ...existing,
        ...peer,
        isSource: peer.isSource ?? existing.isSource ?? false,
        httpPort: peer.httpPort ?? existing.httpPort ?? null,
        isStreaming: Boolean(peer.isStreaming) || Boolean(existing.isStreaming),
        streamPort: peer.streamPort ?? existing.streamPort ?? null,
        classId: peer.classId ?? existing.classId ?? null,
        className: peer.className ?? existing.className ?? null,
        role: peer.role ?? existing.role ?? null,
      };
    }

    if (existing.isSelf) {
      peer = { ...peer, isSelf: true };
    }

    this.peers.set(key, peer);
    this.onPeersChanged(this.getPeerList());
  }

  getPeerList() {
    return sortPeers(Array.from(this.peers.values()));
  }
}

module.exports = { DiscoveryService };
