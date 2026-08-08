import { audio, sfxEnabled, sfxOutput } from "./audioBus";
import { playSample } from "./samples";

/**
 * The office's sound effects.
 *
 * Each one plays a file from `public/audio/sfx` if you have put one there —
 * see the README in that folder — and synthesises itself if you haven't, so
 * the office is never silent and never needs an asset to run. The
 * synthesised versions are a fallback, not the goal: real recordings sound
 * like an office, and these sound like a modem.
 */

/** Shared noise, made once: a second of it loops without anyone noticing. */
let noiseBuffer = null;

function noise(ctx) {
  if (noiseBuffer?.sampleRate === ctx.sampleRate) return noiseBuffer;
  const length = ctx.sampleRate;
  noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const channel = noiseBuffer.getChannelData(0);
  for (let i = 0; i < length; i++) channel[i] = Math.random() * 2 - 1;
  return noiseBuffer;
}

/** Everything below ends up here: gain envelope, optional pan, then out. */
function voice(ctx, { pan = 0, gain = 1 }) {
  const envelope = ctx.createGain();
  envelope.gain.value = 0;

  if (pan !== 0 && ctx.createStereoPanner) {
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    envelope.connect(panner);
    panner.connect(sfxOutput());
  } else {
    envelope.connect(sfxOutput());
  }

  return { envelope, gain };
}

/** A short burst of filtered noise: shoe on carpet. */
function thud(ctx, { frequency, q, duration, gain, pan }) {
  const source = ctx.createBufferSource();
  source.buffer = noise(ctx);
  source.loop = true;

  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = frequency;
  band.Q.value = q;

  const { envelope } = voice(ctx, { pan });
  const now = ctx.currentTime;
  envelope.gain.setValueAtTime(0, now);
  envelope.gain.linearRampToValueAtTime(gain, now + 0.005);
  envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  source.connect(band);
  band.connect(envelope);
  source.start(now);
  source.stop(now + duration + 0.02);
}

/** A pitched blip, for anything a person did on purpose. */
function blip(ctx, { frequency, duration = 0.08, gain = 0.18, type = "sine", slideTo = null }) {
  const osc = ctx.createOscillator();
  osc.type = type;

  const { envelope } = voice(ctx, {});
  const now = ctx.currentTime;
  osc.frequency.setValueAtTime(frequency, now);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + duration);

  envelope.gain.setValueAtTime(0, now);
  envelope.gain.linearRampToValueAtTime(gain, now + 0.008);
  envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(envelope);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

/**
 * Wraps one effect: nothing happens without a context and the effects
 * switch, a file wins if there is one, and `play` is the fallback.
 *
 * `sample` turns the effect's arguments into playback options — how loud,
 * how far left or right, at what speed — so a recorded footstep gets the
 * same distance falloff as the synthesised one.
 */
function effect(play, name = null, sample = () => ({})) {
  return (...args) => {
    const ctx = audio();
    if (!ctx || !sfxEnabled() || !sfxOutput()) return;
    if (name) {
      const options = sample(...args);
      if (options === null) return; // too far away to bother playing
      if (playSample(name, options)) return;
    }
    play(ctx, ...args);
  };
}

let leftFoot = false;

/** How far away a sound stops being worth playing, and how it fades. */
const falloffOf = (distance) => Math.max(0, 1 - distance / 9);

export const sfx = {
  /**
   * One step. `distance` is how far away the walker is, in world units —
   * your own steps are at 0, somebody crossing the room is quieter and
   * off to one side.
   */
  step: effect(
    (ctx, { distance = 0, pan = 0 } = {}) => {
      const falloff = falloffOf(distance);
      if (falloff <= 0.02) return;
      leftFoot = !leftFoot;
      const jitter = 0.85 + Math.random() * 0.3;

      // A footstep is two things at once: the scuff of the sole, which is
      // noise, and the weight landing, which is a short low thump. The
      // noise alone was almost inaudible — a narrow band of it carries very
      // little energy, however far the gain is turned up.
      thud(ctx, {
        // Alternating feet, plus a little jitter, so a walk doesn't tick
        frequency: (leftFoot ? 520 : 440) * (0.92 + Math.random() * 0.16),
        q: 0.7, // wide: more of the noise gets through
        duration: 0.09,
        gain: 0.4 * falloff * jitter,
        pan: pan * 0.7,
      });
      blip(ctx, {
        frequency: leftFoot ? 116 : 104,
        slideTo: 68,
        duration: 0.075,
        gain: 0.22 * falloff * jitter,
        type: "sine",
      });
    },
    "step",
    ({ distance = 0, pan = 0 } = {}) => {
      const falloff = falloffOf(distance);
      if (falloff <= 0.02) return null; // out of earshot; don't play at all
      return {
        gain: falloff,
        pan: pan * 0.7,
        // A recorded step is one pair of shoes; nudging the speed each time
        // keeps a walk from sounding like a loop of itself
        rate: 0.94 + Math.random() * 0.12,
      };
    }
  ),

  /** Any button, anywhere. Deliberately dry and quiet. */
  click: effect((ctx) => {
    blip(ctx, { frequency: 880, duration: 0.045, gain: 0.09, type: "triangle" });
  }, "click"),

  /** Something opened: a panel, the map, the board. */
  open: effect((ctx) => {
    blip(ctx, { frequency: 520, slideTo: 880, duration: 0.12, gain: 0.1, type: "triangle" });
  }, "open"),

  close: effect((ctx) => {
    blip(ctx, { frequency: 760, slideTo: 420, duration: 0.11, gain: 0.09, type: "triangle" });
  }, "close"),

  /** Somebody walked into the office. */
  arrive: effect((ctx) => {
    blip(ctx, { frequency: 659.25, duration: 0.16, gain: 0.09 }); // E5
    setTimeout(() => blip(ctx, { frequency: 987.77, duration: 0.22, gain: 0.08 }), 90); // B5
  }, "arrive"),

  /** And out again. */
  depart: effect((ctx) => {
    blip(ctx, { frequency: 493.88, duration: 0.14, gain: 0.07 }); // B4
    setTimeout(() => blip(ctx, { frequency: 329.63, duration: 0.2, gain: 0.06 }), 90); // E4
  }, "depart"),

  /** A message arrived from someone else. */
  message: effect((ctx) => {
    blip(ctx, { frequency: 1174.66, duration: 0.09, gain: 0.09 }); // D6
  }, "message"),

  /** Somebody came close enough to talk to. */
  nearby: effect((ctx) => {
    blip(ctx, { frequency: 783.99, duration: 0.1, gain: 0.055, type: "sine" }); // G5
  }, "nearby"),

  /** The server said no. */
  refused: effect((ctx) => {
    blip(ctx, { frequency: 220, slideTo: 160, duration: 0.16, gain: 0.1, type: "square" });
  }, "refused"),
};
