import * as THREE from "three";

/**
 * Shared loader for the static office props (Pixel Life pack).
 * Textures are cached; each prop is a transparent plane mesh whose
 * height follows the sprite's aspect ratio.
 */
const PROP_SIZES = {
  desk: [32, 30],
  mug: [10, 12],
  keyboard: [16, 9],
  calculator: [8, 11],
  mouse: [6, 6],
  pencil: [3, 10],
  sticky: [6, 6],
  penholder: [10, 12],
  extinguisher: [11, 17],
  chart: [23, 17],
  papers: [20, 16],
  bookshelf: [32, 32],
  brick: [32, 32],
  door: [32, 64],
};

const textures = new Map();

function getTexture(name) {
  if (!textures.has(name)) {
    const texture = new THREE.TextureLoader().load(`/sprites/office/${name}.png`);
    texture.magFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    textures.set(name, texture);
  }
  return textures.get(name);
}

export function propHeight(name, width) {
  const [w, h] = PROP_SIZES[name];
  return (h / w) * width;
}

export function createPropMesh(name, width) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, propHeight(name, width)),
    new THREE.MeshBasicMaterial({ map: getTexture(name), transparent: true })
  );
  return mesh;
}
