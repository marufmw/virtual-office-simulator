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
  ".mp3": "audio/mpeg",
};

const exists = (file: string) => {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
};

// What the server answers itself. Nest ends its router with a catch-all
// 404, so this middleware has to sit in front of it — which means naming
// the paths that are never the frontend's to serve.
const SERVER_PATHS = ["/api/", "/healthz"];

/**
 * Serves a file from the build, falling back to index.html so a deep link
 * still lands in the app. Anything it can't serve is passed along to Nest,
 * which is the whole of it in development: Vite serves those files itself
 * and PUBLIC_DIR won't exist.
 */
export function staticFallback(
  req: IncomingMessage,
  res: ServerResponse,
  next: (error?: unknown) => void
): void {
  const urlPath = new URL(req.url ?? "/", "http://localhost").pathname;
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  if (SERVER_PATHS.some((prefix) => urlPath.startsWith(prefix))) return next();

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
