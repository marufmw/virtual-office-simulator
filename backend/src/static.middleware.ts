import * as fs from "node:fs";
import * as path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

// The built frontend, when there is one. In development Vite serves those
// files itself and PUBLIC_DIR simply won't exist, so this whole thing sits
// out of the way.
export const PUBLIC_DIR = process.env.PUBLIC_DIR || path.join(__dirname, "..", "public");

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

const exists = (file: string) => {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
};

/**
 * Serves a file from the build, falling back to index.html so a deep link
 * still lands in the app.
 *
 * Mounted after Nest's router, so it only ever sees what no controller
 * answered; anything it can't serve either is left to Nest's own 404.
 */
export function staticFallback(
  req: IncomingMessage,
  res: ServerResponse,
  next: (error?: unknown) => void
): void {
  const urlPath = new URL(req.url ?? "/", "http://localhost").pathname;
  if ((req.method !== "GET" && req.method !== "HEAD") || urlPath.startsWith("/api/")) {
    return next();
  }

  // Anything that climbs out of the build directory is not ours to serve
  const requested = path.join(PUBLIC_DIR, path.normalize(decodeURIComponent(urlPath)));
  if (!requested.startsWith(PUBLIC_DIR)) return next();

  const index = path.join(PUBLIC_DIR, "index.html");
  const file = exists(requested) ? requested : exists(index) ? index : null;
  if (!file) return next();

  res.writeHead(200, {
    "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream",
    // Vite fingerprints its assets; index.html must never be held onto
    "Cache-Control": file === index ? "no-cache" : "public, max-age=31536000, immutable",
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  fs.createReadStream(file).pipe(res);
}
