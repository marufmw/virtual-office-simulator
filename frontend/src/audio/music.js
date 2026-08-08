import { audio, musicEnabled, musicOutput, onAudioSettings, unlockAudio } from "./audioBus";

/**
 * The office's backing track.
 *
 * If `public/audio/office.mp3` exists it is played, looped, and nothing
 * below runs. Otherwise the music is generated here: a four-chord loop with
 * a pad, a bass, a plucked arpeggio and light percussion, scheduled a
 * fraction of a second ahead. It is deliberately cheap — a handful of
 * oscillators, started and stopped per note, no reverb — and deliberately
 * varied, because a two-bar loop that repeats exactly is unbearable within
 * ten minutes and this is meant to be left on.
 */

const TRACK_URL = "/audio/office.mp3";

const BPM = 100;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const EIGHTH = BEAT / 2;

const LOOKAHEAD = 0.2; // seconds of music scheduled in advance
const TICK_MS = 45; // how often the scheduler tops that up

// I–V–vi–IV in C, the friendliest progression there is. Roots as MIDI
// notes, with the shape of the triad above each.
const PROGRESSION = [
  { root: 60, minor: false }, // C
  { root: 67, minor: false }, // G
  { root: 69, minor: true }, // Am
  { root: 65, minor: false }, // F
];

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const triad = ({ root, minor }) => [root, root + (minor ? 3 : 4), root + 7];
const pick = (values) => values[Math.floor(Math.random() * values.length)];

let timer = null;
let nextBarAt = 0;
let bar = 0;
let wanted = false; // whether the office wants music at all
let track = null; // the dropped-in file, once decoded
let trackSource = null;
let trackChecked = false;
let noiseBuffer = null;

function noise(ctx) {
  if (noiseBuffer?.sampleRate === ctx.sampleRate) return noiseBuffer;
  const length = Math.floor(ctx.sampleRate * 0.5);
  noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const channel = noiseBuffer.getChannelData(0);
  for (let i = 0; i < length; i++) channel[i] = Math.random() * 2 - 1;
  return noiseBuffer;
}

/** A single tone with an attack and a decay, connected to the music bus. */
function tone(ctx, { frequency, at, duration, gain, type = "triangle", attack = 0.01, cutoff }) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = frequency;

  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0, at);
  envelope.gain.linearRampToValueAtTime(gain, at + attack);
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);

  let tail = envelope;
  if (cutoff) {
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    envelope.connect(filter);
    tail = filter;
  }

  osc.connect(envelope);
  tail.connect(musicOutput());
  osc.start(at);
  osc.stop(at + duration + 0.05);
}

/** Percussion: a band of noise, gone almost as soon as it arrives. */
function hit(ctx, { at, frequency, q, duration, gain }) {
  const source = ctx.createBufferSource();
  source.buffer = noise(ctx);
  source.loop = true;

  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = frequency;
  band.Q.value = q;

  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0, at);
  envelope.gain.linearRampToValueAtTime(gain, at + 0.004);
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);

  source.connect(band);
  band.connect(envelope);
  envelope.connect(musicOutput());
  source.start(at);
  source.stop(at + duration + 0.02);
}

/** The kick: a sine dropping in pitch, which is all a kick drum is. */
function kick(ctx, at) {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(140, at);
  osc.frequency.exponentialRampToValueAtTime(48, at + 0.11);

  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0, at);
  envelope.gain.linearRampToValueAtTime(0.16, at + 0.005);
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);

  osc.connect(envelope);
  envelope.connect(musicOutput());
  osc.start(at);
  osc.stop(at + 0.2);
}

/**
 * Lays down one bar. The chord walks the progression; everything above it
 * is rolled fresh each time, within bounds that keep it in key.
 */
function scheduleBar(ctx, at, index) {
  const chord = PROGRESSION[index % PROGRESSION.length];
  const notes = triad(chord);

  // Pad: the triad an octave down, soft and slow, holding the whole bar
  for (const note of notes) {
    tone(ctx, {
      frequency: hz(note - 12) * (1 + (Math.random() - 0.5) * 0.004), // gentle detune
      at,
      duration: BAR * 0.95,
      gain: 0.035,
      type: "triangle",
      attack: 0.35,
      cutoff: 1400,
    });
  }

  // Bass: root on one and three, with the fifth as an occasional pickup
  kick(ctx, at);
  kick(ctx, at + BEAT * 2);
  tone(ctx, { frequency: hz(chord.root - 24), at, duration: 0.42, gain: 0.16, type: "sine" });
  tone(ctx, {
    frequency: hz(chord.root - 24 + (Math.random() < 0.3 ? 7 : 0)),
    at: at + BEAT * 2,
    duration: 0.42,
    gain: 0.14,
    type: "sine",
  });

  // Backbeat, and a hat on every eighth to keep it moving
  for (const beat of [1, 3]) {
    hit(ctx, { at: at + BEAT * beat, frequency: 1900, q: 0.9, duration: 0.09, gain: 0.05 });
  }
  for (let eighth = 0; eighth < 8; eighth++) {
    hit(ctx, {
      at: at + EIGHTH * eighth,
      frequency: 8200,
      q: 1.4,
      duration: 0.025,
      // Offbeats a touch louder: that's where the bounce lives
      gain: eighth % 2 ? 0.03 : 0.018,
    });
  }

  // Arpeggio: the chord tones plus the ninth, wandering up and down, with
  // a quarter of the steps left out so it breathes rather than chatters
  const pool = [...notes, chord.root + 12, chord.root + 14, notes[1] + 12];
  let last = pick(pool);
  for (let eighth = 0; eighth < 8; eighth++) {
    if (Math.random() < 0.25) continue;
    // Step to a neighbour of the last note more often than jumping
    const near = pool.filter((n) => Math.abs(n - last) <= 5);
    last = Math.random() < 0.7 && near.length ? pick(near) : pick(pool);
    tone(ctx, {
      frequency: hz(last + (Math.random() < 0.15 ? 12 : 0)),
      at: at + EIGHTH * eighth,
      duration: 0.22,
      gain: 0.055,
      type: "triangle",
      cutoff: 3200,
    });
  }
}

function runScheduler(ctx) {
  if (timer) return;
  nextBarAt = ctx.currentTime + 0.1;
  timer = setInterval(() => {
    if (!musicEnabled() || !musicOutput()) return;
    while (nextBarAt < ctx.currentTime + LOOKAHEAD) {
      scheduleBar(ctx, nextBarAt, bar++);
      nextBarAt += BAR;
    }
  }, TICK_MS);
}

/** Looks for a dropped-in track once, and remembers if there isn't one. */
async function loadTrack(ctx) {
  if (trackChecked) return track;
  trackChecked = true;
  try {
    const res = await fetch(TRACK_URL);
    // A missing file under a SPA fallback comes back as the index page, so
    // the content type is checked rather than just the status
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("audio")) return null;
    track = await ctx.decodeAudioData(await res.arrayBuffer());
  } catch {
    track = null;
  }
  return track;
}

function playTrack(ctx, buffer) {
  if (trackSource) return;
  trackSource = ctx.createBufferSource();
  trackSource.buffer = buffer;
  trackSource.loop = true;
  trackSource.connect(musicOutput());
  trackSource.start();
}

function stopSound() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (trackSource) {
    try {
      trackSource.stop();
    } catch {
      // already stopped; nothing to do
    }
    trackSource.disconnect();
    trackSource = null;
  }
}

async function begin() {
  const ctx = unlockAudio() && audio();
  if (!ctx || !wanted || !musicEnabled()) return;

  const file = await loadTrack(ctx);
  if (!wanted || !musicEnabled()) return; // switched off while decoding
  if (file) playTrack(ctx, file);
  else runScheduler(ctx);
}

/** Starts the music, if it is switched on. Safe to call more than once. */
export function startMusic() {
  wanted = true;
  begin();
}

export function stopMusic() {
  wanted = false;
  stopSound();
}

// Turning music off should cost nothing, so the scheduler stops rather than
// playing to a silent bus
onAudioSettings(({ music }) => {
  if (!wanted) return;
  if (music) begin();
  else stopSound();
});
