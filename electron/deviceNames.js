const dns = require("dns").promises;
const { execFile } = require("child_process");

function execText(file, args, timeoutMs = 1500) {
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true, encoding: "utf8", timeout: timeoutMs }, (error, stdout) => {
      if (error) {
        resolve("");
        return;
      }
      resolve(stdout || "");
    });
  });
}

function cleanHostName(value) {
  if (!value) {
    return null;
  }

  let name = String(value).trim();
  if (!name || name === "." || /^\d+\.\d+\.\d+\.\d+$/.test(name)) {
    return null;
  }

  name = name.split(".")[0];
  return name || null;
}

async function resolveViaDns(ip) {
  try {
    const names = await dns.reverse(ip);
    return cleanHostName(names[0]);
  } catch {
    return null;
  }
}

async function resolveViaPing(ip) {
  const output = await execText("ping", ["-a", "-n", "1", "-w", "400", ip]);
  const patterns = [
    /Pinging ([^\[]+) \[/i,
    /Обмен пакетами с ([^\[]+) \[/i,
    /Ping wird ausgeführt für ([^\[]+) \[/i,
  ];

  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match) {
      const name = cleanHostName(match[1]);
      if (name) {
        return name;
      }
    }
  }

  return null;
}

async function resolveViaNetBios(ip) {
  const output = await execText("nbtstat", ["-A", ip], 2000);
  const lines = output.split(/\r?\n/);

  for (const line of lines) {
    const match = line.match(/^\s*([A-Z0-9_-]+)\s+<00>\s+UNIQUE/i);
    if (match) {
      const name = cleanHostName(match[1]);
      if (name) {
        return name;
      }
    }
  }

  return null;
}

async function resolveDeviceName(ip) {
  const methods = [resolveViaDns, resolveViaPing, resolveViaNetBios];

  for (const method of methods) {
    const name = await method(ip);
    if (name) {
      return name;
    }
  }

  return null;
}

async function resolveDeviceNames(ips, concurrency = 8) {
  const names = new Map();
  const queue = [...ips];

  async function worker() {
    while (queue.length) {
      const ip = queue.shift();
      if (!ip) {
        return;
      }
      const name = await resolveDeviceName(ip);
      if (name) {
        names.set(ip, name);
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, ips.length || 1) }, () => worker());
  await Promise.all(workers);
  return names;
}

module.exports = {
  resolveDeviceName,
  resolveDeviceNames,
};
