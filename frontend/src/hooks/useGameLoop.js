import { useEffect } from "react";
import * as THREE from "three";
import {
  SPEED,
  SEND_INTERVAL,
  CAMERA_LERP,
  ARRIVE_DISTANCE,
  WAYPOINT_DISTANCE,
  STUCK_TIMEOUT,
} from "../config";

/**
 * Runs the game loop: WASD movement, position broadcasting,
 * camera follow and rendering.
 */
export function useGameLoop(world, keysRef, sendMoveRef) {
  useEffect(() => {
    const clock = new THREE.Clock();
    let sendTimer = 0;
    let positionDirty = false;
    let stuckTimer = 0; // how long an auto-walk has made no progress
    let lastDistance = Infinity;

    function updateMovement(delta) {
      const keys = keysRef.current;
      let dx = 0;
      let dy = 0;
      if (keys.has("w")) dy += 1;
      if (keys.has("s")) dy -= 1;
      if (keys.has("a")) dx -= 1;
      if (keys.has("d")) dx += 1;

      // Manual input cancels any auto-walk
      if (dx !== 0 || dy !== 0) world.cancelPath();

      // Follow the plotted route waypoint by waypoint (e.g. "Go to desk")
      if ((dx === 0 && dy === 0) && world.moveTarget && world.myId !== null) {
        const tx = world.moveTarget.x - world.myPos.x;
        const ty = world.moveTarget.y - world.myPos.y;
        const dist = Math.hypot(tx, ty);
        const isLastLeg = !world.path || world.path.length <= 1;
        const reached = dist < (isLastLeg ? ARRIVE_DISTANCE : WAYPOINT_DISTANCE);
        // Give up if we've spent too long without getting closer — e.g.
        // someone else is standing on the spot in front of the desk
        if (stuckTimer > STUCK_TIMEOUT) {
          world.cancelPath();
          stuckTimer = 0;
        } else if (reached) {
          world.advanceWaypoint();
          stuckTimer = 0;
          lastDistance = Infinity;
        } else {
          stuckTimer = dist < lastDistance - 0.001 ? 0 : stuckTimer + delta;
          lastDistance = dist;
          dx = tx / dist;
          dy = ty / dist;
        }
      } else {
        stuckTimer = 0;
        lastDistance = Infinity;
      }

      if ((dx !== 0 || dy !== 0) && world.myId !== null) {
        const length = Math.hypot(dx, dy);
        const stepX = (dx / length) * SPEED * delta;
        const stepY = (dy / length) * SPEED * delta;
        const { x, y } = world.myPos;

        // Client-side collision prediction; the server re-validates.
        // Try the full step, then slide along each axis so obstacles
        // (desks, other people) are walked around instead of stopping us.
        let nextX = x;
        let nextY = y;
        if (!world.collidesAt(x + stepX, y + stepY, world.myId)) {
          nextX = x + stepX;
          nextY = y + stepY;
        } else if (stepX !== 0 && !world.collidesAt(x + stepX, y, world.myId)) {
          nextX = x + stepX;
        } else if (stepY !== 0 && !world.collidesAt(x, y + stepY, world.myId)) {
          nextY = y + stepY;
        } else if (world.moveTarget) {
          // Fully boxed in: try detouring sideways relative to the target
          const sideX = -stepY;
          const sideY = stepX;
          if (!world.collidesAt(x + sideX, y + sideY, world.myId)) {
            nextX = x + sideX;
            nextY = y + sideY;
          } else if (!world.collidesAt(x - sideX, y - sideY, world.myId)) {
            nextX = x - sideX;
            nextY = y - sideY;
          }
        }

        if (nextX !== x || nextY !== y) {
          world.myPos.x = nextX;
          world.myPos.y = nextY;
          world.movePlayer(world.myId, world.myPos.x, world.myPos.y);
          world.refreshPathTrail();
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
      world.updateAnimations(delta);
      world.updateProximity(delta);
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
