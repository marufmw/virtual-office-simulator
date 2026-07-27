import * as THREE from "three";
import { createNameLabel } from "./createNameLabel";

export const DESK_WIDTH = 2;
export const DESK_HEIGHT = (30 / 52) * DESK_WIDTH; // keep the sprite's aspect ratio

const texture = new THREE.TextureLoader().load("/sprites/desk.png");
texture.magFilter = THREE.NearestFilter;
texture.colorSpace = THREE.SRGBColorSpace;

/**
 * Creates a desk sprite with its number label above it.
 * `id` looks like "desk-3" — the label shows just the number.
 */
export function createDesk(id, x, y) {
  const group = new THREE.Group();
  group.position.set(x, y, 0);

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(DESK_WIDTH, DESK_HEIGHT),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true })
  );
  group.add(mesh);

  const label = createNameLabel(id.replace("desk-", "#"));
  label.sprite.position.y = DESK_HEIGHT / 2 + 0.4;
  group.add(label.sprite);

  function dispose() {
    mesh.geometry.dispose();
    mesh.material.dispose();
    label.dispose();
  }

  return { group, dispose };
}
