import { audio, sfxOutput } from "./audioBus";

/**
 * Sound files, if there are any.
 *
 * Every effect in `sfx.js` asks here first and falls back to synthesis, so
 * dropping `public/audio/sfx/click.mp3` into the project replaces the
 * synthesised click everywhere it plays — no code, no imports, no manifest
 * to keep in step.
 *
 * The files are looked for once, on the first gesture, and decoded into
 * memory. A footstep may have up to four variants (`step.mp3`, `step2.mp3`,
 * `step3.mp3`, `step4.mp3`); one is picked at random each time, which is
 * what stops a walk cycle from sounding like a typewriter.
 */

const BASE = "/audio/sfx";
const EXTENSIONS = ["mp3", "ogg", "wav"];

/** Every effect that can be replaced by a file, and how many variants. */
const EFFECTS = {
  step: 4,
  click: 2,
  open: 1,
  close: 1,
  arrive: 1,
  depart: 1,
  message: 1,
  nearby: 1,
  refused: 1,
};

const buffers = new Map(); // effect name -> decoded variants
let looked = false;

/** One file, or null if it isn't there. */
async function fetchBuffer(ctx, url) {
  try {
    const res = await fetch(url);
    // A missing file under the SPA fallback comes back as the index page,
    // so what came back is checked, not just the status
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("audio") && !type.includes("octet-stream")) return null;
    return await ctx.decodeAudioData(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/** `step`, `step2`, `step3`… — whichever of those files exist. */
function stems(name, variants) {
  return [name, ...Array.from({ length: variants - 1 }, (_, i) => `${name}${i + 2}`)];
}

/** One variant, whatever it was saved as. Stops at the first hit. */
async function findStem(ctx, stem) {
  for (const extension of EXTENSIONS) {
    const buffer = await fetchBuffer(ctx, `${BASE}/${stem}.${extension}`);
    if (buffer) return buffer;
  }
  return null;
}

/**
 * Looks for every replaceable sound, once. Cheap to be wrong about: the
 * misses are 404s that the browser caches, and they only happen on the
 * first gesture of a session.
 */
export async function loadSamples() {
  const ctx = audio();
  if (!ctx || looked) return;
  looked = true;

  await Promise.all(
    Object.entries(EFFECTS).map(async ([name, variants]) => {
      const found = (
        await Promise.all(stems(name, variants).map((stem) => findStem(ctx, stem)))
      ).filter(Boolean);
      if (found.length > 0) buffers.set(name, found);
    })
  );
}

/**
 * Plays a file for `name` if one was found. Returns false when there isn't
 * one, which is the caller's cue to synthesise it instead.
 */
export function playSample(name, { gain = 1, pan = 0, rate = 1 } = {}) {
  const ctx = audio();
  const variants = buffers.get(name);
  if (!ctx || !variants?.length || !sfxOutput()) return false;

  const source = ctx.createBufferSource();
  source.buffer = variants[Math.floor(Math.random() * variants.length)];
  source.playbackRate.value = rate;

  const level = ctx.createGain();
  level.gain.value = gain;

  let tail = level;
  if (pan !== 0 && ctx.createStereoPanner) {
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    level.connect(panner);
    tail = panner;
  }

  source.connect(level);
  tail.connect(sfxOutput());
  source.start();
  return true;
}

/** Whether a file was found for this effect — used only by the mixer UI. */
export const hasSample = (name) => (buffers.get(name)?.length ?? 0) > 0;
