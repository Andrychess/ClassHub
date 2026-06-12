const http = require("http");
const { FILE_SERVER_PORT } = require("./constants");

function fetchTeacherClassConfig(teacherIp, port = FILE_SERVER_PORT, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const request = http.get(`http://${teacherIp}:${port}/api/class`, { timeout: timeoutMs }, (response) => {
      let body = "";
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        if (response.statusCode !== 200) {
          resolve(null);
          return;
        }

        try {
          resolve(JSON.parse(body));
        } catch {
          resolve(null);
        }
      });
    });

    request.on("error", () => resolve(null));
    request.on("timeout", () => {
      request.destroy();
      resolve(null);
    });
  });
}

module.exports = { fetchTeacherClassConfig };
