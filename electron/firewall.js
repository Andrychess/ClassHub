const { execFile } = require("child_process");
const {
  DISCOVERY_PORT,
  FILE_SERVER_PORT,
  SCREEN_SERVER_PORT,
  CHAT_SERVER_PORT,
} = require("./constants");

function tryAddFirewallRule({ name, protocol, port, failureMessage, successMessage }) {
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
      if (error) {
        resolve({
          ok: false,
          message:
            failureMessage ||
            "Не удалось открыть порт в брандмауэре. Запустите приложение от администратора.",
        });
        return;
      }

      resolve({
        ok: true,
        message: successMessage || `Порт ${port} открыт в брандмауэре`,
      });
    });
  });
}

async function ensureClassHubFirewallRules() {
  await tryAddFirewallRule({
    name: "ClassHub Discovery UDP",
    protocol: "UDP",
    port: DISCOVERY_PORT,
  });
  await tryAddFirewallRule({
    name: "ClassHub HTTP",
    protocol: "TCP",
    port: FILE_SERVER_PORT,
  });
  await tryAddFirewallRule({
    name: "ClassHub Screen TCP",
    protocol: "TCP",
    port: SCREEN_SERVER_PORT,
  });
  await tryAddFirewallRule({
    name: "ClassHub Chat TCP",
    protocol: "TCP",
    port: CHAT_SERVER_PORT,
  });
}

function tryAddHttpFirewallRule(port = FILE_SERVER_PORT) {
  return tryAddFirewallRule({
    name: `ClassHub HTTP ${port}`,
    protocol: "TCP",
    port,
    failureMessage:
      "Не удалось открыть порт в брандмауэре. Запустите приложение от администратора.",
    successMessage: `Порт ${port} открыт в брандмауэре`,
  });
}

function tryAddScreenFirewallRule(port = SCREEN_SERVER_PORT) {
  return tryAddFirewallRule({
    name: `ClassHub Screen ${port}`,
    protocol: "TCP",
    port,
    failureMessage: "Не удалось открыть порт трансляции в брандмауэре.",
    successMessage: `Порт трансляции ${port} открыт`,
  });
}

function tryAddChatFirewallRule(port = CHAT_SERVER_PORT) {
  return tryAddFirewallRule({
    name: `ClassHub Chat ${port}`,
    protocol: "TCP",
    port,
    failureMessage: "Не удалось открыть порт чата в брандмауэре.",
    successMessage: `Порт чата ${port} открыт`,
  });
}

module.exports = {
  ensureClassHubFirewallRules,
  tryAddHttpFirewallRule,
  tryAddScreenFirewallRule,
  tryAddChatFirewallRule,
};
