/**
 * The one audio graph the office has.
 *
 * Two buses hang off the master gain — music and effects — so either can be
 * turned down without touching the other, and the whole thing is behind a
 * gesture: browsers refuse to start an AudioContext until somebody has
 * clicked, and starting one anyway leaves a suspended context that silently
 * swallows everything played into it.
 *
 *   master ── music ── (the loop, or a file if one was dropped in)
 *          └─ sfx   ── (footsteps, clicks, chimes)
 */

const STORAGE_KEY = "office.audio";

const DEFAULTS = { music: true, sfx: true, musicVolume: 0.5, sfxVolume: 0.7 };

function readSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}

let settings = readSettings();
let ctx = null;
let master = null;
let musicBus = null;
let sfxBus = null;
let ducked = false;
const listeners = new Set();

// A gain applied on top of the music setting, for pulling the music down
// while somebody is concentrating on something else
const DUCK = 0.25;

const musicLevel = () => (settings.music ? settings.musicVolume * (ducked ? DUCK : 1) : 0);
const sfxLevel = () => (settings.sfx ? settings.sfxVolume : 0);

/**
 * Builds the graph on first use. Returns null before the browser has seen a
 * gesture, so callers can simply not play anything yet.
 */
export function audio() {
  if (ctx) return ctx.state === "running" ? ctx : null;
  return null;
}

/** Called from the first click or keypress; safe to call repeatedly. */
export function unlockAudio() {
  if (!ctx) {
    const Ctor = window.AudioContext ?? window.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();

    master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);

    musicBus = ctx.createGain();
    musicBus.gain.value = musicLevel();
    musicBus.connect(master);

    sfxBus = ctx.createGain();
    sfxBus.gain.value = sfxLevel();
    sfxBus.connect(master);
  }
  // Autoplay policy: a context created outside a gesture starts suspended
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

export const musicOutput = () => musicBus;
export const sfxOutput = () => sfxBus;

/** Ramps rather than jumps: a step in gain is an audible click. */
function ride(node, value) {
  if (!node || !ctx) return;
  const now = ctx.currentTime;
  node.gain.cancelScheduledValues(now);
  node.gain.setTargetAtTime(value, now, 0.05);
}

export function getAudioSettings() {
  return { ...settings };
}

export function setAudioSettings(next) {
  settings = { ...settings, ...next };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  ride(musicBus, musicLevel());
  ride(sfxBus, sfxLevel());
  for (const listener of listeners) listener(getAudioSettings());
}

export function onAudioSettings(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Pulls the music down while something else has the person's attention —
 * the whiteboard, mainly, where a backing track is the last thing anybody
 * wants while they're thinking.
 */
export function duckMusic(on) {
  ducked = on;
  ride(musicBus, musicLevel());
}

/** Whether anything at all should be scheduled right now. */
export const musicEnabled = () => settings.music;
export const sfxEnabled = () => settings.sfx;
