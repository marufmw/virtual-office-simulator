import * as THREE from "three";

const FONT = "bold 64px system-ui, sans-serif";
const PADDING = 24; // room for the outline, either side
const HEIGHT = 128;
const WORLD_HEIGHT = 1; // the sprite's height in world units; width follows
const MAX_WORLD_WIDTH = 6; // beyond this a name is shortened rather than shrunk

/**
 * A text sprite, used for the name above a character and the code on a
 * desk.
 *
 * The canvas is measured to the text rather than fixed: names run from
 * "Ada" to "Maruf Bin Salim Bhuiyan", and a fixed 512px canvas cropped the
 * long ones. The sprite's world width is then set from the same
 * measurement, so every label is drawn at one size per pixel — a longer
 * name is wider, not squashed.
 */
export function createNameLabel(text) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  // Measuring needs the font set, and setting the canvas size resets the
  // context — so it is measured on a throwaway pass first
  ctx.font = FONT;
  let label = String(text ?? "");
  let width = ctx.measureText(label).width;

  // A very long name is trimmed to keep the label from spanning the room
  const maxTextWidth = (MAX_WORLD_WIDTH / WORLD_HEIGHT) * HEIGHT - PADDING * 2;
  if (width > maxTextWidth) {
    while (label.length > 1 && ctx.measureText(`${label}…`).width > maxTextWidth) {
      label = label.slice(0, -1);
    }
    label = `${label}…`;
    width = ctx.measureText(label).width;
  }

  canvas.width = Math.ceil(width + PADDING * 2);
  canvas.height = HEIGHT;

  ctx.font = FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Dark outline for readability against a light floor
  ctx.strokeStyle = "rgba(0, 0, 0, 0.9)";
  ctx.lineWidth = 10;
  ctx.strokeText(label, canvas.width / 2, HEIGHT / 2);

  ctx.fillStyle = "#ffffff";
  ctx.fillText(label, canvas.width / 2, HEIGHT / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false, // ignore the depth buffer
    depthWrite: false, // and don't write to it
  });

  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 9999; // drawn after everything else
  sprite.scale.set((canvas.width / HEIGHT) * WORLD_HEIGHT, WORLD_HEIGHT, 1);

  function dispose() {
    material.dispose();
    texture.dispose();
  }

  return { sprite, dispose };
}
