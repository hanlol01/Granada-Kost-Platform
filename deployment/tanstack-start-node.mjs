import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { serve } from "srvx/node";

const appDirArg = process.argv[2];

if (!appDirArg) {
  console.error("Usage: node deployment/tanstack-start-node.mjs <app-dir>");
  process.exit(1);
}

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const appDir = resolve(rootDir, appDirArg);
const clientDir = join(appDir, "dist", "client");
const serverEntry = join(appDir, "dist", "server", "server.js");

if (!existsSync(serverEntry)) {
  console.error(`Server entry not found: ${serverEntry}`);
  process.exit(1);
}

const handlerModule = await import(pathToFileURL(serverEntry));
const handler = handlerModule.default;

if (!handler || typeof handler.fetch !== "function") {
  console.error(`Invalid TanStack Start handler: ${serverEntry}`);
  process.exit(1);
}

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function getStaticPath(url) {
  const pathname = decodeURIComponent(new URL(url).pathname);
  if (!pathname.startsWith("/assets/")) return undefined;

  const candidate = normalize(join(clientDir, pathname));
  if (!candidate.startsWith(clientDir + sep)) return undefined;
  return candidate;
}

async function serveStatic(request) {
  const filePath = getStaticPath(request.url);
  if (!filePath) return undefined;

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) return undefined;

    const file = await readFile(filePath);

    return new Response(file, {
      headers: {
        "cache-control": "public, max-age=31536000, immutable",
        "content-length": String(fileStat.size),
        "content-type": contentTypes[extname(filePath)] ?? "application/octet-stream",
      },
    });
  } catch {
    return undefined;
  }
}

serve({
  hostname: process.env.HOST ?? "127.0.0.1",
  port: process.env.PORT ?? 3000,
  async fetch(request) {
    const staticResponse = await serveStatic(request);
    if (staticResponse) return staticResponse;

    return handler.fetch(request, process.env, {
      waitUntil: (promise) => promise.catch((error) => console.error(error)),
    });
  },
});
