const http = require("http");
const { CHAT_SERVER_PORT } = require("./constants");

function postChatMessage(ip, message, port = CHAT_SERVER_PORT, timeoutMs = 1500) {
  const payload = JSON.stringify(message);

  return new Promise((resolve) => {
    const request = http.request(
      {
        hostname: ip,
        port,
        path: "/api/chat",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
        timeout: timeoutMs,
      },
      (response) => {
        response.resume();
        resolve(response.statusCode >= 200 && response.statusCode < 300);
      }
    );

    request.on("error", () => resolve(false));
    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });

    request.write(payload);
    request.end();
  });
}

module.exports = { postChatMessage };
