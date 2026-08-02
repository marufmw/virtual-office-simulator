// Excalidraw fetches its fonts at runtime, from unpkg unless it is told
// otherwise. The office should not depend on a CDN being reachable to draw
// text on a whiteboard, so the fonts are copied into public/ and
// EXCALIDRAW_ASSET_PATH (set in main.jsx) points at them.
//
// Copied rather than committed: they belong to the package, and the version
// that lands here should always be the one that's installed.

import { cp, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const from = resolve(here, "../node_modules/@excalidraw/excalidraw/dist/prod/fonts");
const to = resolve(here, "../public/excalidraw/fonts");

await mkdir(dirname(to), { recursive: true });
await cp(from, to, { recursive: true });
console.log(`Excalidraw fonts copied to ${to}`);
