const fs = require("node:fs");
const path = require("node:path");

// The built frontend, when there is one. In development Vite serves those
// files itself and PUBLIC_DIR simply won't exist, so this whole thing sits
// out of the way.
const PUBLIC_DIR = process.env.PUBLIC_DIR || path.join(__dirname, "..", "public");

const TYPES = {
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

const exists = (file) => {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
};

/**
 * Serves a file from the build, falling back to index.html so a deep link
 * still lands in the app. Returns false when there is nothing to serve,
 * leaving the caller to answer with its own 404.
 */
function serveStatic(req, res, urlPath) {
  if (req.method !== "GET" && req.method !== "HEAD") return false;

  // Anything that climbs out of the build directory is not ours to serve
  const requested = path.join(PUBLIC_DIR, path.normalize(decodeURIComponent(urlPath)));
  if (!requested.startsWith(PUBLIC_DIR)) return false;

  const index = path.join(PUBLIC_DIR, "index.html");
  const file = exists(requested) ? requested : exists(index) ? index : null;
  if (!file) return false;

  const ext = path.extname(file);
  res.writeHead(200, {
    "Content-Type": TYPES[ext] ?? "application/octet-stream",
    // Vite fingerprints its assets; index.html must never be held onto
    "Cache-Control": file === index ? "no-cache" : "public, max-age=31536000, immutable",
  });
  if (req.method === "HEAD") return res.end(), true;
  fs.createReadStream(file).pipe(res);
  return true;
}

module.exports = { serveStatic, PUBLIC_DIR };
