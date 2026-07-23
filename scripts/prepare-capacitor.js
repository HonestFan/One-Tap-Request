import { cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const webDir = "www";
const entries = [
  "index.html",
  "styles.css",
  "script.js",
  "manifest.json",
  "service-worker.js",
  "icons"
];

await rm(webDir, { recursive: true, force: true });
await mkdir(webDir, { recursive: true });

for (const entry of entries) {
  await cp(entry, join(webDir, entry), { recursive: true });
}

console.log("Prepared Capacitor web assets.");
