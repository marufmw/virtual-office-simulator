import { useEffect, useRef, useState } from "react";
import { Music, Volume2, VolumeX } from "lucide-react";
import { TopButton } from "./TopControls";
import { useAudioSettings } from "../hooks/useAudio";

/**
 * The speaker in the top corner: mute everything at a tap, or open the
 * panel to set music and effects separately. What you choose is remembered
 * for next time.
 */
export function SoundButton() {
  const [settings, update] = useAudioSettings();
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);

  const silent = !settings.music && !settings.sfx;

  // Clicking anywhere else puts the panel away
  useEffect(() => {
    if (!open) return;
    const onDown = (event) => {
      if (!panelRef.current?.contains(event.target)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  return (
    <div ref={panelRef} className="relative">
      <TopButton
        onClick={() => setOpen((was) => !was)}
        label={silent ? "Sound is off" : "Sound"}
      >
        {silent ? <VolumeX size={20} /> : <Volume2 size={20} />}
      </TopButton>

      {open && (
        <div className="absolute right-0 top-14 w-60 rounded-xl border border-line/70 bg-room p-4 shadow-2xl">
          <Row
            icon={<Music size={14} />}
            label="Music"
            on={settings.music}
            onToggle={() => update({ music: !settings.music })}
            value={settings.musicVolume}
            onChange={(musicVolume) => update({ musicVolume })}
          />
          <div className="my-3 h-px bg-line/60" />
          <Row
            icon={<Volume2 size={14} />}
            label="Effects"
            on={settings.sfx}
            onToggle={() => update({ sfx: !settings.sfx })}
            value={settings.sfxVolume}
            onChange={(sfxVolume) => update({ sfxVolume })}
          />
          <p className="mt-3 text-[11px] leading-relaxed text-muted/80">
            Footsteps, doors and the office&rsquo;s own backing track.
          </p>
        </div>
      )}
    </div>
  );
}

function Row({ icon, label, on, onToggle, value, onChange }) {
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={on}
        className="flex items-center gap-2 text-left text-sm text-paper"
      >
        <span className={on ? "text-pick" : "text-muted"}>{icon}</span>
        <span className="flex-1">{label}</span>
        {/* A switch, drawn rather than imported */}
        <span
          className={`relative h-5 w-9 rounded-full transition-colors ${
            on ? "bg-pick" : "bg-plate"
          }`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-ink transition-all ${
              on ? "left-4.5" : "left-0.5"
            }`}
          />
        </span>
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        disabled={!on}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={`${label} volume`}
        className="h-1 w-full cursor-pointer appearance-none rounded-full bg-plate accent-pick disabled:opacity-40"
      />
    </div>
  );
}
