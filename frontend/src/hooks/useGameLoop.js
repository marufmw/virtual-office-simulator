import { useEffect } from "react";
import * as THREE from "three";
import {
  SPEED,
  SEND_INTERVAL,
  CAMERA_LERP,
  ARRIVE_DISTANCE,
  WAYPOINT_DISTANCE,
  STUCK_TIMEOUT,
  STRANDED_CHECK,
} from "../config";

/**
 * Runs the game loop: WASD movement, position broadcasting,
 * camera follow and rendering.
 *
 * `stickRef` is the on-screen joystick's `{ x, y }`, zero when nobody is
 * touching it. It's optional — with a keyboard there is no stick.
 */
export function useGameLoop(world, keysRef, sendMoveRef, stickRef) {
  useEffect(() => {
    const clock = new THREE.Clock();
    let sendTimer = 0;
    let positionDirty = false;
    let stuckTimer = 0; // how long an auto-walk has made no progress
    let lastDistance = Infinity;
    let strandedTimer = 0;

    function updateMovement(delta) {
      const keys = keysRef.current;
      let dx = 0;
      let dy = 0;
      if (keys.has("w")) dy += 1;
      if (keys.has("s")) dy -= 1;
      if (keys.has("a")) dx -= 1;
      if (keys.has("d")) dx += 1;

      // A thumb on the stick overrides the keys, and unlike them carries a
      // magnitude: a small push is a slow walk
      const stick = stickRef?.current;
      if (stick && (stick.x !== 0 || stick.y !== 0)) {
        dx = stick.x;
        dy = stick.y;
      }

      // Manual input cancels any auto-walk
      if (dx !== 0 || dy !== 0) world.cancelPath();

      // Follow the plotted route waypoint by waypoint (e.g. "Go to desk")
      if ((dx === 0 && dy === 0) && world.moveTarget && world.myId !== null) {
        const tx = world.moveTarget.x - world.myPos.x;
        const ty = world.moveTarget.y - world.myPos.y;
        const dist = Math.hypot(tx, ty);
        const isLastLeg = !world.path || world.path.length <= 1;
        const reached = dist < (isLastLeg ? ARRIVE_DISTANCE : WAYPOINT_DISTANCE);
        // Too long without progress — a desk dropped on the route, or
        // someone standing on the spot. Walk through everything instead
        // of giving up, so the desk is always reachable.
        if (stuckTimer > STUCK_TIMEOUT && !world.phasing) {
          world.setPhasing(true);
          // Head straight for the desk; the plotted detour is moot now
          world.path = [world.path[world.path.length - 1]];
          world.moveTarget = world.path[0];
        }

        if (reached) {
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
        // Direction from the vector, pace from how far it reaches. Keys are
        // always at full stretch; a half-pushed stick walks at half speed.
        const throttle = Math.min(1, length);
        const stepX = (dx / length) * SPEED * throttle * delta;
        const stepY = (dy / length) * SPEED * throttle * delta;
        const { x, y } = world.myPos;

        // Client-side collision prediction; the server re-validates.
        // Try the full step, then slide along each axis so obstacles
        // (desks, other people) are walked around instead of stopping us.
        let nextX = x;
        let nextY = y;
        if (world.phasing) {
          // Nothing blocks a phasing walk — that's the point of it
          nextX = x + stepX;
          nextY = y + stepY;
        } else if (!world.collidesAt(x + stepX, y + stepY, world.myId)) {
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
        sendMoveRef.current(world.myPos.x, world.myPos.y, world.phasing);
        sendTimer = 0;
      }
    }

    /**
     * Someone can end up inside a desk or outside the walls when the floor
     * plan is edited around them. Send them back to their own desk; if the
     * way is blocked, the stuck timer above eventually lets them phase
     * through, so they always get out.
     */
    function rescueIfStranded(delta) {
      strandedTimer += delta;
      if (strandedTimer < STRANDED_CHECK) return;
      strandedTimer = 0;

      if (world.myId === null || world.moveTarget) return;
      if (!world.isStranded(world.myPos.x, world.myPos.y)) return;

      const desk = world.deskStandPosition(world.myDeskId);
      if (desk) world.walkTo(desk);
    }

    function updateCamera(delta) {
      if (world.myId === null) return;
      const t = 1 - Math.exp(-CAMERA_LERP * delta); // frame-rate independent smoothing
      world.camera.position.x += (world.myPos.x - world.camera.position.x) * t;
      world.camera.position.y += (world.myPos.y - world.camera.position.y) * t;
    }

    function tick() {
      // Always consume the clock, or the first frame back is a huge step
      const delta = clock.getDelta();
      // A full-screen overlay is up: the office is hidden behind it, and
      // rendering it anyway just takes the GPU away from whatever is on top
      if (world.paused) return;
      rescueIfStranded(delta);
      updateMovement(delta);
      updateCamera(delta);
      world.updateAnimations(delta);
      world.updateProximity(delta);
      world.renderer.render(world.scene, world.camera);
    }

    world.renderer.setAnimationLoop(tick);

    const onResize = () => world.resize();
    window.addEventListener("resize", onResize);

    // A phone's viewport changes size when the address bar slides away or
    // the keyboard opens, and neither fires a plain resize on every browser
    window.visualViewport?.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);

    return () => {
      world.renderer.setAnimationLoop(null);
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, [world, keysRef, sendMoveRef, stickRef]);
}
