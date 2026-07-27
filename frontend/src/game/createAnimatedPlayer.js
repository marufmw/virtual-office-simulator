import * as THREE from "three";

const COLS = 4;
const ROWS = 4;
const FRAME_ROWS = { down: 0, up: 1, left: 2, right: 3 };
const ANIM_FPS = 8;
const SPRITE_SCALE = 1.5;

// Load the shared sprite sheet once; each player gets its own clone
// so frames can animate independently.
const sheet = new THREE.TextureLoader().load("/sprites/ch003_0.png");
sheet.magFilter = THREE.NearestFilter;
sheet.colorSpace = THREE.SRGBColorSpace;

/**
 * Creates an animated character sprite from the shared sheet.
 * Returns { sprite, update(delta, moving, dirX, dirY) }.
 */
export function createAnimatedPlayer() {
  const texture = sheet.clone();
  texture.repeat.set(1 / COLS, 1 / ROWS);
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({ map: texture });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(SPRITE_SCALE, SPRITE_SCALE, 1);

  let frame = 0;
  let row = FRAME_ROWS.down;
  let timer = 0;

  function setFrame() {
    // Texture v=0 is the bottom of the image, so flip the row index
    texture.offset.set(frame / COLS, 1 - (row + 1) / ROWS);
  }
  setFrame();

  function update(delta, moving, dirX, dirY) {
    // Pick the row from the dominant movement direction
    if (moving && (dirX !== 0 || dirY !== 0)) {
      row =
        Math.abs(dirX) > Math.abs(dirY)
          ? dirX > 0
            ? FRAME_ROWS.right
            : FRAME_ROWS.left
          : dirY > 0
            ? FRAME_ROWS.up
            : FRAME_ROWS.down;
    }

    if (moving) {
      timer += delta;
      if (timer >= 1 / ANIM_FPS) {
        frame = (frame + 1) % COLS;
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
