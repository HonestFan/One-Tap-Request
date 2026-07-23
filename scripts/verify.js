import { access, readFile } from "node:fs/promises";

const requiredFiles = [
  "index.html",
  "styles.css",
  "script.js",
  "manifest.json",
  "service-worker.js",
  "api/request.js",
  "package.json",
  "vercel.json",
  "capacitor.config.ts",
  ".env.example",
  "README.md",
  "icons/icon.svg",
  "icons/maskable-icon.svg",
  "scripts/prepare-capacitor.js"
];

await Promise.all(requiredFiles.map((file) => access(file)));

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
if (packageJson.type !== "module") {
  throw new Error("package.json must use ES Modules.");
}

console.log("One Tap Request verification passed.");
