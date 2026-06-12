const http = require("http");
const { FILE_SERVER_PORT, SCREEN_SERVER_PORT } = require("./constants");

function probeHttpSource(ip, port = FILE_SERVER_PORT, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const request = http.get(`http://${ip}:${port}/api/info`, { timeout: timeoutMs }, (response) => {
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
          const info = JSON.parse(body);
          resolve({
            hostname: info.hostname || null,
            ip: info.ip || ip,
            httpPort: port,
            isSource: true,
            hasClassHub: true,
            classId: info.classId || null,
            className: info.className || null,
          });
        } catch {
          resolve({
            ip,
            httpPort: port,
            isSource: true,
            hasClassHub: true,
          });
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

function probeStreamHeaders(ip, port = SCREEN_SERVER_PORT, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const request = http.get(`http://${ip}:${port}/stream`, { timeout: timeoutMs }, (response) => {
      const contentType = String(response.headers["content-type"] || "");
      const isStream =
        response.statusCode === 200 && contentType.includes("multipart/x-mixed-replace");
      request.destroy();
      if (!isStream) {
        resolve(null);
        return;
      }
      resolve({
        ip,
        streamPort: port,
        isStreaming: true,
        hasClassHub: true,
      });
    });

    request.on("error", () => resolve(null));
    request.on("timeout", () => {
      request.destroy();
      resolve(null);
    });
  });
}

async function probeHttpStream(ip, port = SCREEN_SERVER_PORT, timeoutMs = 1200) {
  const statusResult = await new Promise((resolve) => {
    const request = http.get(`http://${ip}:${port}/status`, { timeout: timeoutMs }, (response) => {
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
          const info = JSON.parse(body);
          if (!info.streaming) {
            resolve(null);
            return;
          }

          resolve({
            hostname: info.hostname || null,
            ip: info.ip || ip,
            streamPort: info.port || port,
            isStreaming: true,
            hasClassHub: true,
          });
        } catch {
          resolve({
            ip,
            streamPort: port,
            isStreaming: true,
            hasClassHub: true,
          });
        }
      });
    });

    request.on("error", () => resolve(null));
    request.on("timeout", () => {
      request.destroy();
      resolve(null);
    });
  });

  if (statusResult) {
    return statusResult;
  }

  return probeStreamHeaders(ip, port, timeoutMs);
}

async function enrichDevicesWithNetworkServices(devices, batchSize = 16) {
  const enriched = [];

  for (let index = 0; index < devices.length; index += batchSize) {
    const batch = devices.slice(index, index + batchSize);
    const results = await Promise.all(
      batch.map(async (device) => {
        const [source, stream] = await Promise.all([
          probeHttpSource(device.ip),
          probeHttpStream(device.ip),
        ]);

        if (!source && !stream) {
          return device;
        }

        return {
          ...device,
          ...buildServiceHint(source, stream),
          hostname: source?.hostname || stream?.hostname || device.hostname,
          detectedViaHttp: true,
        };
      })
    );
    enriched.push(...results);
  }

  return enriched;
}

function buildServiceHint(source, stream) {
  if (!source && !stream) {
    return null;
  }

  return {
    hasClassHub: true,
    isSource: Boolean(source),
    httpPort: source?.httpPort || null,
    isStreaming: Boolean(stream),
    streamPort: stream?.streamPort || null,
    hostname: source?.hostname || stream?.hostname || null,
    classId: source?.classId || null,
    className: source?.className || null,
  };
}

module.exports = {
  probeHttpSource,
  probeHttpStream,
  enrichDevicesWithNetworkServices,
  buildServiceHint,
};
