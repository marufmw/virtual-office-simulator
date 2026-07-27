import * as THREE from "three";

/**
 * Character sheet registry. Each entry describes the sheet layout as
 * explicit [col, row] cells per direction:
 * - idle: single cell shown when standing still
 * - walk: cells cycled through while moving
 */
const OFFICE_SHEET = {
  cols: 3,
  rows: 4,
  idle: { down: [0, 0], up: [1, 0], left: [0, 0], right: [0, 0] },
  walk: {
    down: [[0, 1], [1, 1], [0, 2], [1, 2]],
    up: [[0, 3], [1, 3]],
    // These sheets have no side-view art — reuse the front view
    left: [[0, 1], [1, 1], [0, 2], [1, 2]],
    right: [[0, 1], [1, 1], [0, 2], [1, 2]],
  },
};

function officeCharacter(name) {
  return { path: `/sprites/${name}.png`, ...OFFICE_SHEET };
}

const CHARACTERS = {
  character_1: {
    path: "/sprites/character_1.png",
    cols: 4,
    rows: 4,
    idle: { down: [0, 0], up: [0, 1], left: [0, 2], right: [0, 3] },
    walk: {
      down: [[0, 0], [1, 0], [2, 0], [3, 0]],
      up: [[0, 1], [1, 1], [2, 1], [3, 1]],
      left: [[0, 2], [1, 2], [2, 2], [3, 2]],
      right: [[0, 3], [1, 3], [2, 3], [3, 3]],
    },
  },
  office_blonde_man_red: officeCharacter("office_blonde_man_red"),
  office_blonde_man_blue: officeCharacter("office_blonde_man_blue"),
  office_man_white_shirt: officeCharacter("office_man_white_shirt"),
  office_man_dark_red: officeCharacter("office_man_dark_red"),
  office_blonde_woman_teal: officeCharacter("office_blonde_woman_teal"),
  office_woman_red: officeCharacter("office_woman_red"),
  office_man_green: officeCharacter("office_man_green"),
  office_man_gray: officeCharacter("office_man_gray"),
  office_woman_pink: officeCharacter("office_woman_pink"),
  office_man_black_suit: officeCharacter("office_man_black_suit"),
  office_man_lavender: officeCharacter("office_man_lavender"),
  office_woman_blue: officeCharacter("office_woman_blue"),
};

export const CHARACTER_NAMES = Object.keys(CHARACTERS);
export const CHARACTER_CONFIGS = CHARACTERS;

const ANIM_FPS = 8;
const SPRITE_SCALE = 1.5;

// Load each sheet once; every player gets a clone so frames
// can animate independently.
const sheets = new Map();
function getSheet(path) {
  if (!sheets.has(path)) {
    const texture = new THREE.TextureLoader().load(path);
    texture.magFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    sheets.set(path, texture);
  }
  return sheets.get(path);
}

/**
 * Creates an animated character sprite from one of the registered
 * sheets. Returns { sprite, update(delta, moving, dirX, dirY), dispose }.
 */
export function createAnimatedPlayer(character = "character_1") {
  const config = CHARACTERS[character] ?? CHARACTERS.character_1;

  const texture = getSheet(config.path).clone();
  texture.repeat.set(1 / config.cols, 1 / config.rows);
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({ map: texture });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(SPRITE_SCALE, SPRITE_SCALE, 1);

  let direction = "down";
  let frame = 0;
  let timer = 0;

  function setCell([col, row]) {
    // Texture v=0 is the bottom of the image, so flip the row index
    texture.offset.set(col / config.cols, 1 - (row + 1) / config.rows);
  }
  setCell(config.idle.down);

  function update(delta, moving, dirX, dirY) {
    if (moving && (dirX !== 0 || dirY !== 0)) {
      // Pick the direction from the dominant movement axis
      const next =
        Math.abs(dirX) > Math.abs(dirY) ? (dirX > 0 ? "right" : "left") : dirY > 0 ? "up" : "down";
      if (next !== direction) {
        direction = next;
        frame = 0; // walk cycles differ in length between directions
        timer = 0;
      }
    }

    if (moving) {
      timer += delta;
      const cells = config.walk[direction];
      if (timer >= 1 / ANIM_FPS) {
        frame = (frame + 1) % cells.length;
        timer = 0;
      }
      setCell(cells[frame % cells.length]);
    } else {
      frame = 0;
      timer = 0;
      setCell(config.idle[direction]);
    }
  }

  function dispose() {
    material.dispose();
    texture.dispose();
  }

  return { sprite, update, dispose };
}
