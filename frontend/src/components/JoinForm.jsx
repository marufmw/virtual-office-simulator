import { useEffect, useRef, useState } from "react";
import { CHARACTER_CONFIGS, CHARACTER_NAMES } from "../game/createAnimatedPlayer";

const PREVIEW_SIZE = 48;

function CharacterPreview({ name }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const config = CHARACTER_CONFIGS[name];
    const img = new Image();
    img.src = config.path;
    img.onload = () => {
      const ctx = canvasRef.current.getContext("2d");
      const frameW = img.width / config.cols;
      const frameH = img.height / config.rows;
      const [col, row] = config.idle.down;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
      ctx.drawImage(
        img,
        col * frameW,
        row * frameH,
        frameW,
        frameH,
        0,
        0,
        PREVIEW_SIZE,
        PREVIEW_SIZE
      );
    };
  }, [name]);

  return <canvas ref={canvasRef} width={PREVIEW_SIZE} height={PREVIEW_SIZE} />;
}

export function JoinForm({ onJoin }) {
  const [name, setName] = useState("");
  const [deskId, setDeskId] = useState("");
  const [character, setCharacter] = useState(CHARACTER_NAMES[0]);

  const canSubmit = name.trim() !== "" && deskId.trim() !== "";

  function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    onJoin({ name: name.trim(), deskId: deskId.trim(), character });
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/60">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-md flex-col gap-5 rounded-xl bg-slate-800 p-8 shadow-2xl"
      >
        <h1 className="text-center text-xl font-bold text-slate-100">Join the office</h1>

        <div className="flex flex-col gap-3">
          <input
            className="rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100 placeholder-slate-500 outline-none focus:border-emerald-500"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <input
            className="rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100 placeholder-slate-500 outline-none focus:border-emerald-500"
            placeholder="Desk ID"
            value={deskId}
            onChange={(e) => setDeskId(e.target.value)}
          />
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-slate-400">Pick your character</p>
          <div className="grid max-h-56 grid-cols-4 gap-2 overflow-y-auto pr-1">
            {CHARACTER_NAMES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCharacter(c)}
                title={c.replaceAll("_", " ")}
                className={`flex items-center justify-center rounded-lg border-2 p-1 transition-colors ${
                  character === c
                    ? "border-emerald-500 bg-slate-700"
                    : "border-transparent bg-slate-900 hover:border-slate-600"
                }`}
              >
                <CharacterPreview name={c} />
              </button>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-md bg-emerald-600 py-2 font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-600"
        >
          Join
        </button>
      </form>
    </div>
  );
}
