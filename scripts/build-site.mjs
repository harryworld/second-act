import { build } from "esbuild";
import { readFile, readdir, mkdir, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const publicDir = join(root, "public");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
};
const assets = {};
async function collect(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      await collect(path);
      continue;
    }
    if (!entry.isFile()) throw Error("Unsupported public file");
    const type = mime[entry.name.slice(entry.name.lastIndexOf("."))];
    if (!type) throw Error("Missing content type for " + entry.name);
    const bytes = await readFile(path);
    assets["/" + relative(publicDir, path)] = {
      mime: type,
      base64: bytes.toString("base64"),
      etag: '"' + createHash("sha256").update(bytes).digest("hex") + '"',
    };
  }
}
await collect(publicDir);
await build({
  absWorkingDir: root,
  entryPoints: ["sites/worker.ts"],
  outfile: "dist/server/index.js",
  bundle: true,
  target: "es2022",
  format: "esm",
  platform: "browser",
  plugins: [
    {
      name: "public-assets",
      setup(b) {
        b.onResolve({ filter: /^site:assets$/ }, () => ({
          path: "public",
          namespace: "assets",
        }));
        b.onLoad({ filter: /.*/, namespace: "assets" }, () => ({
          contents: JSON.stringify(assets),
          loader: "json",
        }));
      },
    },
  ],
});
await mkdir(join(root, "dist/.openai"), { recursive: true });
await copyFile(
  join(root, ".openai/hosting.json"),
  join(root, "dist/.openai/hosting.json"),
);
console.log(
  "Built Second Act Worker with " +
    Object.keys(assets).length +
    " public assets.",
);
