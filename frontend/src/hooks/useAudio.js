import { useEffect, useState } from "react";
import {
  getAudioSettings,
  onAudioSettings,
  setAudioSettings,
  sfxEnabled,
  unlockAudio,
} from "../audio/audioBus";
import { loadSamples } from "../audio/samples";
import { sfx } from "../audio/sfx";

/** The music/effects settings, as React state. */
export function useAudioSettings() {
  const [settings, setSettings] = useState(getAudioSettings);
  useEffect(() => onAudioSettings(setSettings), []);
  return [settings, setAudioSettings];
}

/**
 * Starts the audio graph on the first thing the person does.
 *
 * Browsers won't let a page make noise until it has been interacted with,
 * and a context built before then stays suspended — so the graph is built
 * on the first click or key, whatever that click happened to be for.
 */
export function useAudioUnlock() {
  useEffect(() => {
    const unlock = () => {
      unlockAudio();
      // Any sound files are read once the context exists; until they are
      // decoded the effects fall back to synthesis, which is the point of
      // having a fallback
      loadSamples();
    };
    // Capture phase, so a handler calling stopPropagation can't hide the
    // one gesture we get
    window.addEventListener("pointerdown", unlock, { capture: true });
    window.addEventListener("keydown", unlock, { capture: true });
    return () => {
      window.removeEventListener("pointerdown", unlock, { capture: true });
      window.removeEventListener("keydown", unlock, { capture: true });
    };
  }, []);
}

/**
 * A click for anything clickable, without threading a callback through
 * every button in the app. One listener, and it only speaks up for real
 * controls — clicking the floor of the office is not an action.
 */
export function useClickSounds() {
  useEffect(() => {
    const onDown = (event) => {
      if (!sfxEnabled()) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("button, [role='button'], select, summary, a[href]")) sfx.click();
    };
    window.addEventListener("pointerdown", onDown, { capture: true });
    return () => window.removeEventListener("pointerdown", onDown, { capture: true });
  }, []);
}
