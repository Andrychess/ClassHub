const os = require("os");
const dgram = require("dgram");
const { DISCOVERY_PORT } = require("./constants");

const PORT = DISCOVERY_PORT;
const MAGIC = "MEGACLEANER";
const VERSION = "2";

const MSG_DISCOVER = "DISCOVER";
const MSG_HELLO = "HELLO";
const MSG_SOURCE = "SOURCE";
const MSG_STOP_SOURCE = "STOP_SOURCE";
const MSG_SCREEN = "SCREEN";
const MSG_SCREEN_STOP = "SCREEN_STOP";

function isVirtualInterface(name) {
  return /vethernet|hyper-v|wsl|docker|virtualbox|vmware|virtual|npcap|loopback|bluetooth|tap|tun|default switch|mobile broadband|hamachi|zerotier|tailscale/i.test(
    name
  );
}

function getNetworkInterfaces(options = {}) {
  const nets = os.networkInterfaces();
  const result = [];

  for (const [name, entries] of Object.entries(nets)) {
    if (!options.includeVirtual && isVirtualInterface(name)) {
      continue;
    }

    for (const net of entries || []) {
      if (net.family !== "IPv4" || net.internal) {
        continue;
      }

      const parts = net.address.split(".");
      if (parts.length !== 4) {
        continue;
      }

      result.push({
        name,
        address: net.address,
        prefix: `${parts[0]}.${parts[1]}.${parts[2]}`,
        broadcast: net.broadcast || `${parts[0]}.${parts[1]}.${parts[2]}.255`,
        isVirtual: isVirtualInterface(name),
      });
    }
  }

  return result;
}

function getPhysicalNetworkInterfaces() {
  return getNetworkInterfaces({ includeVirtual: false });
}

function getLocalIp() {
  const interfaces = getPhysicalNetworkInterfaces();
  const ethernet = interfaces.find((item) =>
    /ethernet|eth|lan|подключ|realtek|intel/i.test(item.name)
  );
  if (ethernet) {
    return ethernet.address;
  }
  const wifi = interfaces.find((item) => /wi-fi|wifi|wlan|беспровод/i.test(item.name));
  if (wifi) {
    return wifi.address;
  }
  return interfaces[0]?.address || "127.0.0.1";
}

function getAllLocalIps() {
  return new Set(getNetworkInterfaces({ includeVirtual: true }).map((item) => item.address));
}

function isLocalIp(ip) {
  return getAllLocalIps().has(ip);
}

function getUniqueSubnets() {
  const seen = new Set();
  return getNetworkInterfaces().filter((item) => {
    if (seen.has(item.prefix)) {
      return false;
    }
    seen.add(item.prefix);
    return true;
  });
}

function getBroadcastAddress() {
  const ip = getLocalIp();
  const octets = ip.split(".");
  if (octets.length === 4) {
    return `${octets[0]}.${octets[1]}.${octets[2]}.255`;
  }
  return "255.255.255.255";
}

function getHostname() {
  return os.hostname();
}

function buildPeer(parts) {
  const msgType = parts[2];
  const base = {
    hostname: parts[3],
    ip: parts[4],
    isSource: false,
    httpPort: null,
    isStreaming: false,
    streamPort: null,
  };

  if (msgType === MSG_HELLO && parts.length >= 7) {
    return {
      ...base,
      isSource: parts[5] === "1",
      httpPort: parts[6] !== "0" ? Number(parts[6]) : null,
      isStreaming: parts[7] === "1",
      streamPort: parts[8] && parts[8] !== "0" ? Number(parts[8]) : null,
    };
  }

  if (msgType === MSG_SOURCE && parts.length >= 6) {
    return {
      ...base,
      isSource: true,
      httpPort: parts[5] !== "0" ? Number(parts[5]) : null,
    };
  }

  if (msgType === MSG_SCREEN && parts.length >= 6) {
    return {
      ...base,
      isStreaming: true,
      streamPort: parts[5] !== "0" ? Number(parts[5]) : null,
    };
  }

  if (msgType === MSG_SCREEN_STOP) {
    return {
      ...base,
      isStreaming: false,
      streamPort: null,
    };
  }

  return null;
}

function parsePeer(message) {
  const parts = message.split("|");
  if (parts.length < 5 || parts[0] !== MAGIC) {
    return null;
  }
  return buildPeer(parts);
}

function parseMessage(data) {
  const text = data.toString("utf8").trim();
  const parts = text.split("|");
  if (parts.length < 3 || parts[0] !== MAGIC) {
    return { type: "", peer: null };
  }
  return { type: parts[2], peer: parsePeer(text) };
}

function toHello({ hostname, ip, isSource, httpPort, isStreaming, streamPort }) {
  return [
    MAGIC,
    VERSION,
    MSG_HELLO,
    hostname,
    ip,
    isSource ? "1" : "0",
    String(httpPort || 0),
    isStreaming ? "1" : "0",
    String(streamPort || 0),
  ].join("|");
}

function toSource({ hostname, ip, httpPort }) {
  return `${MAGIC}|${VERSION}|${MSG_SOURCE}|${hostname}|${ip}|${httpPort || 0}`;
}

function toScreen({ hostname, ip, streamPort }) {
  return `${MAGIC}|${VERSION}|${MSG_SCREEN}|${hostname}|${ip}|${streamPort || 0}`;
}

function toDiscover() {
  return `${MAGIC}|${VERSION}|${MSG_DISCOVER}`;
}

function toStopSource() {
  return `${MAGIC}|${VERSION}|${MSG_STOP_SOURCE}`;
}

function toStopScreen() {
  return `${MAGIC}|${VERSION}|${MSG_SCREEN_STOP}|${getHostname()}|${getLocalIp()}`;
}

function sendBroadcast(payload) {
  const message = Buffer.from(payload, "utf8");
  const interfaces = getPhysicalNetworkInterfaces();
  const targets = new Set(["255.255.255.255"]);

  for (const iface of interfaces) {
    targets.add(iface.broadcast);
  }

  if (!interfaces.length) {
    targets.add(getBroadcastAddress());
  }

  for (const iface of interfaces.length ? interfaces : [{ address: "0.0.0.0" }]) {
    const socket = dgram.createSocket("udp4");
    socket.on("error", () => {
      socket.close();
    });
    socket.bind({ address: iface.address || "0.0.0.0", port: 0 }, () => {
      socket.setBroadcast(true);
      for (const target of targets) {
        socket.send(message, PORT, target, () => {});
      }
      socket.close();
    });
  }
}

module.exports = {
  PORT,
  MSG_DISCOVER,
  MSG_HELLO,
  MSG_SOURCE,
  MSG_STOP_SOURCE,
  MSG_SCREEN,
  MSG_SCREEN_STOP,
  getNetworkInterfaces,
  getPhysicalNetworkInterfaces,
  getLocalIp,
  getAllLocalIps,
  isLocalIp,
  getUniqueSubnets,
  getHostname,
  parseMessage,
  toHello,
  toSource,
  toScreen,
  toDiscover,
  toStopSource,
  toStopScreen,
  sendBroadcast,
};
