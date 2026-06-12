const fs = require("fs");
const path = require("path");

const bumpType = (process.argv[2] || "patch").toLowerCase();
const root = path.join(__dirname, "..");
const packagePath = path.join(root, "package.json");
const lockPath = path.join(root, "package-lock.json");

function parseVersion(value) {
  const match = String(value || "0.0.0").match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    throw new Error(`Invalid version: ${value}`);
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function bumpVersion(current, type) {
  const parts = parseVersion(current);

  if (type === "major") {
    parts.major += 1;
    parts.minor = 0;
    parts.patch = 0;
  } else if (type === "minor") {
    parts.minor += 1;
    parts.patch = 0;
  } else if (type === "patch") {
    parts.patch += 1;
  } else {
    throw new Error(`Unknown bump type: ${type}. Use patch, minor, or major.`);
  }

  return `${parts.major}.${parts.minor}.${parts.patch}`;
}

const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
const nextVersion = bumpVersion(pkg.version, bumpType);
pkg.version = nextVersion;
fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");

if (fs.existsSync(lockPath)) {
  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  lock.version = nextVersion;
  if (lock.packages && lock.packages[""]) {
    lock.packages[""].version = nextVersion;
  }
  fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
}

console.log(nextVersion);
