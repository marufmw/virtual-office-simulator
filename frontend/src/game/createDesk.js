import * as THREE from "three";
import { createNameLabel } from "./createNameLabel";
import { createPropMesh } from "./props";

export const DESK_WIDTH = 2;
export const DESK_HEIGHT = (30 / 32) * DESK_WIDTH; // keep the sprite's aspect ratio

/**
 * Creates a desk with office clutter on top: a "monitor" (the
 * calculator sprite rotated 90°) in front of the keyboard, papers,
 * and a coffee mug — plus its number label.
 * `id` looks like "desk-3" — the label shows just the number.
 */
export function createDesk(id, x, y) {
  const group = new THREE.Group();
  group.position.set(x, y, 0);

  const desk = createPropMesh("desk", DESK_WIDTH);
  group.add(desk);

  // Clutter on the desk surface, slightly raised to avoid z-fighting.
  // Offsets stay inside the desk sprite (surface on the top half)
  const items = [
    ["papers", 0.5, -0.55, 0.5],
    ["calculator", 0.32, 0.2, 0.6, Math.PI / 2], // rotated: stands in as the monitor
    ["keyboard", 0.5, 0.2, 0.25],
    ["mug", 0.26, 0.68, 0.55],
  ];
  let z = 0.01;
  for (const [name, width, ox, oy, rotation = 0] of items) {
    const item = createPropMesh(name, width);
    item.position.set(ox, oy, z);
    item.rotation.z = rotation;
    z += 0.01;
    group.add(item);
  }

  const label = createNameLabel(id.replace("desk-", "#"));
  label.sprite.position.y = DESK_HEIGHT / 2 + 0.4;
  group.add(label.sprite);

  function dispose() {
    group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
    label.dispose();
  }

  return { group, dispose };
}
