const http = require("http");
const path = require("path");
const { CHAT_SERVER_PORT } = require("./constants");

const TEACHER_DISCOVERY_WAIT_MS = 2500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchTeacherClassesCatalog(teacherIp, port = CHAT_SERVER_PORT, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const request = http.get(
      `http://${teacherIp}:${port}/api/teacher/classes`,
      { timeout: timeoutMs },
      (response) => {
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
            const payload = JSON.parse(body);
            if (payload?.role !== "teacher" || !Array.isArray(payload.classes)) {
              resolve(null);
              return;
            }

            resolve({
              ...payload,
              ip: payload.ip || teacherIp,
            });
          } catch {
            resolve(null);
          }
        });
      }
    );

    request.on("error", () => resolve(null));
    request.on("timeout", () => {
      request.destroy();
      resolve(null);
    });
  });
}

function collectTeacherCandidateIps(peers) {
  const ips = new Set();

  for (const peer of peers || []) {
    if (!peer?.ip || peer.isSelf) {
      continue;
    }

    ips.add(peer.ip);
  }

  return [...ips];
}

function buildStudentClassCatalog(teacherPayloads, peers) {
  const peerByIp = new Map((peers || []).map((peer) => [peer.ip, peer]));
  const catalog = [];

  for (const teacher of teacherPayloads || []) {
    const peer = peerByIp.get(teacher.ip);
    const sharingClassId = teacher.sharingClassId || null;
    const teacherIsSharing = Boolean(peer?.isSource);

    for (const classItem of teacher.classes || []) {
      const isLive = teacherIsSharing && sharingClassId === classItem.id;
      catalog.push({
        classId: classItem.id,
        className: classItem.name,
        teacherHostname: teacher.hostname || peer?.hostname || teacher.ip,
        teacherIp: teacher.ip,
        visibleApps: classItem.visibleApps || [],
        customLinks: classItem.customLinks || [],
        hasShareFolder: Boolean(classItem.hasShareFolder),
        shareFolder: classItem.shareFolder || null,
        isLive,
        isSharing: Boolean(classItem.isSharing) || isLive,
      });
    }
  }

  return catalog.sort((left, right) => {
    if (left.isLive !== right.isLive) {
      return left.isLive ? -1 : 1;
    }
    if (left.teacherHostname !== right.teacherHostname) {
      return left.teacherHostname.localeCompare(right.teacherHostname, "ru");
    }
    return left.className.localeCompare(right.className, "ru");
  });
}

async function discoverTeacherClasses({ scanNetwork, discoveryScan, getPeers, waitMs = TEACHER_DISCOVERY_WAIT_MS }) {
  if (typeof scanNetwork === "function") {
    await scanNetwork({ quiet: true });
  }

  if (typeof discoveryScan === "function") {
    discoveryScan();
  }

  await sleep(waitMs);

  const peers = typeof getPeers === "function" ? getPeers() : [];
  const candidateIps = collectTeacherCandidateIps(peers);
  const teacherPayloads = [];

  const results = await Promise.all(
    candidateIps.map(async (ip) => ({
      ip,
      payload: await fetchTeacherClassesCatalog(ip),
    }))
  );

  for (const result of results) {
    if (result.payload) {
      teacherPayloads.push(result.payload);
    }
  }

  const classes = buildStudentClassCatalog(teacherPayloads, peers);

  return {
    ok: true,
    teachers: teacherPayloads.map((teacher) => ({
      hostname: teacher.hostname,
      ip: teacher.ip,
      classCount: teacher.classes?.length || 0,
      sharingClassId: teacher.sharingClassId || null,
    })),
    classes,
    teacherCount: teacherPayloads.length,
    classCount: classes.length,
  };
}

function buildTeacherApiPayload(state, appRole) {
  if (appRole !== "teacher") {
    return null;
  }

  const sharingClassId = state.sharingClassId || null;

  return {
    role: "teacher",
    activeClassId: state.activeClassId || null,
    sharingClassId,
    classes: (state.classes || []).map((classItem) => ({
      id: classItem.id,
      name: classItem.name,
      shareFolder: classItem.shareFolder ? path.basename(classItem.shareFolder) : null,
      hasShareFolder: Boolean(classItem.shareFolder),
      visibleApps: classItem.visibleApps || [],
      customLinks: classItem.customLinks || [],
      isSharing: sharingClassId === classItem.id,
    })),
  };
}

module.exports = {
  TEACHER_DISCOVERY_WAIT_MS,
  fetchTeacherClassesCatalog,
  discoverTeacherClasses,
  buildStudentClassCatalog,
  buildTeacherApiPayload,
};
