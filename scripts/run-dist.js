const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const markerFile = path.join(root, ".build-output");
const extraArgs = process.argv.slice(2);

let outputDir = "build-output";
if (fs.existsSync(markerFile)) {
  const value = fs.readFileSync(markerFile, "utf8").trim();
  if (value) {
    outputDir = value;
  }
}

const args = ["electron-builder", `--config.directories.output=${outputDir}`, ...extraArgs];
const command = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(command, args, {
  cwd: root,
  stdio: "inherit",
  shell: true,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
