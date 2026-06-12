const { execFile } = require("child_process");
const { getPhysicalNetworkInterfaces, getAllLocalIps } = require("./protocol");
const { resolveDeviceNames } = require("./deviceNames");
const {
  PING_TIMEOUT_MS,
  SUBNET_BATCH_SIZE,
  SUBNET_HOST_START,
  SUBNET_HOST_END,
} = require("./constants");
const { sortPeers } = require("./peers");

function pingHost(ip) {
  return new Promise((resolve) => {
    execFile("ping", ["-n", "1", "-w", String(PING_TIMEOUT_MS), ip], { windowsHide: true }, (error) => {
      resolve(!error);
    });
  });
}

function readArpTable() {
  return new Promise((resolve) => {
    execFile("arp", ["-a"], { windowsHide: true, encoding: "utf8" }, (error, stdout) => {
      if (error || !stdout) {
        resolve(new Map());
        return;
      }

      const entries = new Map();
      for (const line of stdout.split(/\r?\n/)) {
        const match = line.match(/^\s*(\d+\.\d+\.\d+\.\d+)\s+([0-9a-f-]+)\s+(\S+)/i);
        if (!match) {
          continue;
        }
        const ip = match[1];
        const mac = match[2];
        if (mac === "ff-ff-ff-ff-ff-ff" || mac.startsWith("00-00-00")) {
          continue;
        }
        entries.set(ip, { mac, label: match[3] });
      }
      resolve(entries);
    });
  });
}

async function scanSubnet(prefix, localIps, batchSize = SUBNET_BATCH_SIZE) {
  const targets = [];
  for (let host = SUBNET_HOST_START; host <= SUBNET_HOST_END; host += 1) {
    const ip = `${prefix}.${host}`;
    if (!localIps.has(ip)) {
      targets.push(ip);
    }
  }

  const alive = [];
  for (let index = 0; index < targets.length; index += batchSize) {
    const batch = targets.slice(index, index + batchSize);
    const results = await Promise.all(
      batch.map(async (ip) => ({
        ip,
        alive: await pingHost(ip),
      }))
    );
    for (const result of results) {
      if (result.alive) {
        alive.push(result.ip);
      }
    }
  }

  return alive;
}

function isConfirmedDevice(ip, arpEntry) {
  if (!arpEntry) {
    return false;
  }
  return Boolean(arpEntry.mac && arpEntry.mac !== "incomplete");
}

async function scanLocalNetwork(options = {}) {
  const localIps = getAllLocalIps();
  const interfaces = getPhysicalNetworkInterfaces();
  const prefixes = [...new Set(interfaces.map((item) => item.prefix))];

  if (!prefixes.length) {
    return [];
  }

  const aliveSet = new Set();
  for (const prefix of prefixes) {
    const alive = await scanSubnet(prefix, localIps, options.batchSize || SUBNET_BATCH_SIZE);
    for (const ip of alive) {
      aliveSet.add(ip);
    }
  }

  const arp = await readArpTable();
  const confirmedIps = Array.from(aliveSet).filter((ip) => isConfirmedDevice(ip, arp.get(ip)));
  const resolvedNames = await resolveDeviceNames(confirmedIps);

  return confirmedIps.map((ip) => {
    const arpEntry = arp.get(ip);
    const resolvedName = resolvedNames.get(ip);
    return {
      ip,
      hostname: resolvedName || guessDeviceName(ip, arpEntry?.label),
      hasClassHub: false,
      isSource: false,
      httpPort: null,
      isStreaming: false,
      streamPort: null,
      isSelf: false,
      isNetworkDevice: true,
    };
  });
}

function guessDeviceName(ip, arpHost) {
  if (!arpHost || arpHost === "dynamic" || arpHost === "static") {
    return `Устройство ${ip}`;
  }
  return arpHost;
}

function mergePeerLists(classHubPeers, networkDevices) {
  const merged = new Map();

  for (const peer of classHubPeers) {
    merged.set(peer.ip, {
      ...peer,
      hasClassHub: true,
      isNetworkDevice: false,
    });
  }

  for (const device of networkDevices) {
    if (merged.has(device.ip)) {
      continue;
    }
    merged.set(device.ip, device);
  }

  return sortPeers(Array.from(merged.values()));
}

function getNetworkSummary() {
  const interfaces = getPhysicalNetworkInterfaces();
  const prefixes = [...new Set(interfaces.map((item) => item.prefix))];
  return {
    interfaces,
    subnets: prefixes,
    usesPhysicalOnly: true,
  };
}

module.exports = {
  scanLocalNetwork,
  mergePeerLists,
  getNetworkSummary,
};
