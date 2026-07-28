import { useEffect, useRef, useState } from "react";
import { CHARACTER_CONFIGS, CHARACTER_NAMES } from "../game/createAnimatedPlayer";
import { API_URL } from "../config";

const PREVIEW_SIZE = 48;

function CharacterPreview({ name }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const config = CHARACTER_CONFIGS[name];
    const img = new Image();
    img.src = config.path;

    img.onload = () => {
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;

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

  return (
    <canvas
      ref={canvasRef}
      width={PREVIEW_SIZE}
      height={PREVIEW_SIZE}
    />
  );
}

/**
 * Shared profile form (name, desk ID, character picker)
 * used by both the join screen and the in-game settings modal.
 */
export function ProfileForm({
  title,
  initial,
  submitLabel,
  onSubmit,
  onClose,
}) {
  const [name, setName] = useState(initial.name ?? "");
  const [deskId, setDeskId] = useState(initial.deskId ?? "");
  const [character, setCharacter] = useState(
    initial.character ?? CHARACTER_NAMES[0]
  );
  const [desks, setDesks] = useState(null);

  function prefillFromDesk(id, list = desks) {
    const desk = list?.find((d) => d.id === id);

    if (desk?.occupant) {
      setName(desk.occupant);

      if (desk.occupant_character) {
        setCharacter(desk.occupant_character);
      }
    } else {
      // Clear the name if the selected desk is empty
      setName("");
      setCharacter(CHARACTER_NAMES[0]);
    }
  }

  useEffect(() => {
    fetch(`${API_URL}/api/desks`)
      .then((res) => res.json())
      .then((data) => {
        setDesks(data);

        // Only preselect when editing an existing profile
        if (initial.deskId) {
          setDeskId(initial.deskId);
          prefillFromDesk(initial.deskId, data);
        }
      })
      .catch(() => setDesks([]));
  }, [initial.deskId]);

  function handleDeskChange(e) {
    const value = e.target.value;
    setDeskId(value);
    prefillFromDesk(value);
  }

  const canSubmit = name.trim() !== "" && deskId.trim() !== "";

  function handleSubmit(e) {
    e.preventDefault();

    if (!canSubmit) return;

    onSubmit({
      name: name.trim(),
      deskId: deskId.trim(),
      character,
    });
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/60">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-md flex-col gap-5 rounded-xl bg-slate-800 p-8 shadow-2xl"
      >
        <h1 className="text-center text-xl font-bold text-slate-100">
          {title}
        </h1>

        <div className="flex flex-col gap-3">
          <input
            className="rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100 placeholder-slate-500 outline-none focus:border-emerald-500"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />

          <select
            className="rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-emerald-500 disabled:opacity-50"
            value={deskId}
            size={8}
            onChange={handleDeskChange}
            disabled={desks === null}
          >
            {desks === null && (
              <option value="">Loading desks...</option>
            )}

            {desks !== null && (
              <option value="" disabled>
                Select a desk
              </option>
            )}

            {desks?.length === 0 && (
              <option value="">No desks available</option>
            )}

            {desks?.map((d) => (
              <option key={d.id} value={d.id}>
                Desk {d.id.replace("desk-", "#")}
                {d.occupant ? ` — ${d.occupant}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-slate-400">
            Pick your character
          </p>

          <div className="grid max-h-56 grid-cols-4 gap-2 overflow-y-auto pr-1">
            {CHARACTER_NAMES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCharacter(c)}
                title={c.replaceAll("_", " ")}
                className={`flex items-center justify-center rounded-lg border-2 p-1 transition-colors ${character === c
                  ? "border-emerald-500 bg-slate-700"
                  : "border-transparent bg-slate-900 hover:border-slate-600"
                  }`}
              >
                <CharacterPreview name={c} />
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-md bg-slate-600 py-2 font-semibold text-white transition-colors hover:bg-slate-500"
            >
              Cancel
            </button>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="flex-1 rounded-md bg-emerald-600 py-2 font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-600"
          >
            {submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}