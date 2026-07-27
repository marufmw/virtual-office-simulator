import * as THREE from "three";

const SIZE = 128;

/**
 * A speech-bubble sprite shown floating between two characters who are
 * close enough to talk. Clicking it (or pressing E) opens the chat.
 * The bubble bobs gently so it reads as interactive.
 */
export function createInteractIndicator() {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");

  const cx = SIZE / 2;
  const cy = SIZE / 2 - 8;
  const r = 40;

  // Bubble body with a tail pointing down
  ctx.beginPath();
  ctx.roundRect(cx - r, cy - r * 0.75, r * 2, r * 1.5, 18);
  ctx.moveTo(cx - 12, cy + r * 0.7);
  ctx.lineTo(cx, cy + r * 1.25);
  ctx.lineTo(cx + 12, cy + r * 0.7);
  ctx.closePath();

  ctx.fillStyle = "#f8fafc";
  ctx.fill();
  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 6;
  ctx.stroke();

  // Three dots, like a pending conversation
  ctx.fillStyle = "#0f172a";
  for (const dx of [-16, 0, 16]) {
    ctx.beginPath();
    ctx.arc(cx + dx, cy, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });

  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.1, 1.1, 1);
  sprite.renderOrder = 10000;
  sprite.visible = false;

  let elapsed = 0;
  let baseY = 0;

  // Places the bubble above the midpoint between two characters
  function placeBetween(a, b) {
    baseY = (a.y + b.y) / 2 + 1.5;
    sprite.position.set((a.x + b.x) / 2, baseY, 0.5);
  }

  function update(delta) {
    if (!sprite.visible) return;
    elapsed += delta;
    sprite.position.y = baseY + Math.sin(elapsed * 3) * 0.1;
  }

  function dispose() {
    material.dispose();
    texture.dispose();
  }

  return { sprite, placeBetween, update, dispose };
}
