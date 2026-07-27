import { useEffect } from "react";
import * as THREE from "three";
import { SPEED, SEND_INTERVAL, CAMERA_LERP } from "../config";

/**
 * Runs the game loop: WASD movement, position broadcasting,
 * camera follow and rendering.
 */
export function useGameLoop(world, keysRef, sendMoveRef) {
  useEffect(() => {
    const clock = new THREE.Clock();
    let sendTimer = 0;
    let positionDirty = false;

    function updateMovement(delta) {
      const keys = keysRef.current;
      let dx = 0;
      let dy = 0;
      if (keys.has("w")) dy += 1;
      if (keys.has("s")) dy -= 1;
      if (keys.has("a")) dx -= 1;
      if (keys.has("d")) dx += 1;

      if ((dx !== 0 || dy !== 0) && world.myId !== null) {
        const length = Math.hypot(dx, dy);
        const nextX = world.myPos.x + (dx / length) * SPEED * delta;
        const nextY = world.myPos.y + (dy / length) * SPEED * delta;
        // Client-side collision prediction; the server re-validates
        if (!world.collidesAt(nextX, nextY, world.myId)) {
          world.myPos.x = nextX;
          world.myPos.y = nextY;
          world.movePlayer(world.myId, world.myPos.x, world.myPos.y);
          positionDirty = true;
        }
      }

      sendTimer += delta;
      if (positionDirty && sendTimer >= SEND_INTERVAL) {
        sendMoveRef.current(world.myPos.x, world.myPos.y);
        sendTimer = 0;
      }
    }

    function updateCamera(delta) {
      if (world.myId === null) return;
      const t = 1 - Math.exp(-CAMERA_LERP * delta); // frame-rate independent smoothing
      world.camera.position.x += (world.myPos.x - world.camera.position.x) * t;
      world.camera.position.y += (world.myPos.y - world.camera.position.y) * t;
    }

    function tick() {
      const delta = clock.getDelta();
      updateMovement(delta);
      updateCamera(delta);
      world.updateGrid();
      world.updateAnimations(delta);
      world.renderer.render(world.scene, world.camera);
    }

    world.renderer.setAnimationLoop(tick);

    const onResize = () => world.resize();
    window.addEventListener("resize", onResize);

    return () => {
      world.renderer.setAnimationLoop(null);
      window.removeEventListener("resize", onResize);
    };
  }, [world, keysRef, sendMoveRef]);
}
