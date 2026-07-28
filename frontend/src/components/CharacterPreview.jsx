import { useEffect, useRef } from "react";
import { CHARACTER_CONFIGS } from "../game/createAnimatedPlayer";

/**
 * Draws a character's idle frame from its sprite sheet, kept crisp at any
 * size. Used both in the picker grid and blown up on the desk badge.
 */
export function CharacterPreview({ name, size = 48, className = "" }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const config = CHARACTER_CONFIGS[name];
    if (!config) return;

    const img = new Image();
    img.src = config.path;
    img.onload = () => {
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;

      const frameW = img.width / config.cols;
      const frameH = img.height / config.rows;
      const [col, row] = config.idle.down;

      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, col * frameW, row * frameH, frameW, frameH, 0, 0, size, size);
    };
  }, [name, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      aria-hidden="true"
      className={className}
      style={{ imageRendering: "pixelated" }}
    />
  );
}
