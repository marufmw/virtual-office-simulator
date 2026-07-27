import * as THREE from "three";

/**
 * Creates a large text sprite used as a name label above a character.
 */
export function createNameLabel(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;

  const ctx = canvas.getContext("2d");
  ctx.font = "bold 64px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Dark outline for readability
  ctx.strokeStyle = "rgba(0, 0, 0, 0.9)";
  ctx.lineWidth = 10;
  ctx.strokeText(text, 256, 64);

  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, 256, 64);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,  // Ignore depth buffer
    depthWrite: false, // Don't write to depth buffer
  });

  
  
  const sprite = new THREE.Sprite(material);
  // Render after everything else
  sprite.renderOrder = 9999;
  
  // Make the label much larger in the world
  sprite.scale.set(4, 1, 1);

  function dispose() {
    material.dispose();
    texture.dispose();
  }

  return { sprite, dispose };
}