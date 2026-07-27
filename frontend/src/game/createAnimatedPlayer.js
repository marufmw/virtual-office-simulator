import * as THREE from "three";

/**
 * Character sheet registry. Sheets differ in frame size and layout:
 * - "row" layout: direction picks the row, walk frame picks the column
 * - "col" layout: direction picks the column, walk frame picks the row
 */
const CHARACTERS = {
  character_1: {
    path: "/sprites/character_1.png",
    frames: 4,
    axis: "row",
    directions: { down: 0, up: 1, left: 2, right: 3 },
  },
  character_2: {
    path: "/sprites/character_2.png",
    frames: 4,
    axis: "col",
    directions: { down: 0, left: 1, up: 2, right: 3 },
  },
};

const ANIM_FPS = 8;
const SPRITE_SCALE = 1.5;

// Load each sheet once; every player gets a clone so frames
// can animate independently.
const sheets = new Map();
function getSheet(name) {
  if (!sheets.has(name)) {
    const texture = new THREE.TextureLoader().load(CHARACTERS[name].path);
    texture.magFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    sheets.set(name, texture);
  }
  return sheets.get(name);
}

/**
 * Creates an animated character sprite from one of the registered
 * sheets. Returns { sprite, update(delta, moving, dirX, dirY), dispose }.
 */
export function createAnimatedPlayer(character = "character_1") {
  const config = CHARACTERS[character] ?? CHARACTERS.character_1;

  const texture = getSheet(character in CHARACTERS ? character : "character_1").clone();
  texture.repeat.set(1 / config.frames, 1 / config.frames);
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({ map: texture });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(SPRITE_SCALE, SPRITE_SCALE, 1);

  let frame = 0;
  let direction = config.directions.down;
  let timer = 0;

  function setFrame() {
    // Texture v=0 is the bottom of the image, so flip the vertical index
    const col = config.axis === "row" ? frame : direction;
    const row = config.axis === "row" ? direction : frame;
    texture.offset.set(col / config.frames, 1 - (row + 1) / config.frames);
  }
  setFrame();

  function update(delta, moving, dirX, dirY) {
    // Pick the direction from the dominant movement axis
    if (moving && (dirX !== 0 || dirY !== 0)) {
      const name =
        Math.abs(dirX) > Math.abs(dirY) ? (dirX > 0 ? "right" : "left") : dirY > 0 ? "up" : "down";
      direction = config.directions[name];
    }

    if (moving) {
      timer += delta;
      if (timer >= 1 / ANIM_FPS) {
        frame = (frame + 1) % config.frames;
        timer = 0;
      }
    } else {
      frame = 0;
      timer = 0;
    }
    setFrame();
  }

  function dispose() {
    material.dispose();
    texture.dispose();
  }

  return { sprite, update, dispose };
}
