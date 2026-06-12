const { execFile } = require("child_process");

function addFirewallRule({ name, protocol, port }) {
  return new Promise((resolve) => {
    const args = [
      "advfirewall",
      "firewall",
      "add",
      "rule",
      `name=${name}`,
      "dir=in",
      "action=allow",
      `protocol=${protocol}`,
      `localport=${port}`,
    ];

    execFile("netsh", args, { windowsHide: true }, (error) => {
      resolve({ ok: !error });
    });
  });
}

async function ensureClassHubFirewallRules() {
  await addFirewallRule({ name: "ClassHub Discovery UDP", protocol: "UDP", port: 49500 });
  await addFirewallRule({ name: "ClassHub HTTP", protocol: "TCP", port: 8765 });
  await addFirewallRule({ name: "ClassHub Screen TCP", protocol: "TCP", port: 8766 });
}

module.exports = { ensureClassHubFirewallRules };
