import { cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const outputDir = "public";
const staticEntries = [
  "index.html",
  "styles.css",
  "script.js",
  "manifest.json",
  "service-worker.js",
  "icons"
];

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

for (const entry of staticEntries) {
  await cp(entry, join(outputDir, entry), { recursive: true });
}

console.log("Prepared Vercel static output in public/.");
