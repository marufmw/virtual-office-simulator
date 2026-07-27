import * as THREE from "three";
import { VIEW_SIZE } from "../config";
import { createAnimatedPlayer } from "./createAnimatedPlayer";
import { createNameLabel } from "./createNameLabel";

/**
 * Creates the game world: Three.js scene, camera, renderer and the
 * player mesh store. All mutable game state lives here, outside of
 * React, so hooks can share it without re-rendering.
 */
export function createWorld(container) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1e1e2e);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.z = 10;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  container.appendChild(renderer.domElement);

  // Large enough to always cover the viewport; repositioned by updateGrid()
  const grid = new THREE.GridHelper(120, 120, 0x444466, 0x333344);
  grid.rotation.x = Math.PI / 2;
  scene.add(grid);

  const players = new Map(); // id -> { group, update, dispose, prevX, prevY }

  const world = {
    scene,
    camera,
    renderer,
    players,
    myId: null,
    myPos: { x: 0, y: 0 },

    addPlayer(id, x, y, character, name) {
      const player = createAnimatedPlayer(character);
      const group = new THREE.Group();
      group.position.set(x, y, 0);
      group.add(player.sprite);

      if (name) {
        const label = createNameLabel(name);
        label.sprite.position.y = 1.1; // above the character's head
        group.add(label.sprite);
        player.labelDispose = label.dispose;
      }

      player.group = group;
      player.prevX = x;
      player.prevY = y;
      scene.add(group);
      players.set(id, player);
    },

    movePlayer(id, x, y) {
      const player = players.get(id);
      if (player) player.group.position.set(x, y, 0);
    },

    // Advances every player's animation. Movement state for remote
    // players is derived from position changes since the last frame.
    updateAnimations(delta) {
      for (const [pid, player] of players) {
        const { x, y } = player.group.position;
        const dirX = x - player.prevX;
        const dirY = y - player.prevY;
        player.update(delta, dirX !== 0 || dirY !== 0, dirX, dirY);
        player.prevX = x;
        player.prevY = y;
      }
    },

    // AABB check against every other player (client-side prediction;
    // the server stays authoritative)
    collidesAt(x, y, exceptId = null) {
      for (const [pid, player] of players) {
        const pos = player.group.position;
        if (pid !== exceptId && Math.abs(pos.x - x) < 1 && Math.abs(pos.y - y) < 1) {
          return true;
        }
      }
      return false;
    },

    // Keeps the grid under the camera, snapped to whole units so the
    // lines stay aligned — makes the grid appear infinite
    updateGrid() {
      grid.position.x = Math.round(camera.position.x);
      grid.position.y = Math.round(camera.position.y);
    },

    removePlayer(id) {
      const player = players.get(id);
      if (player) {
        scene.remove(player.group);
        player.dispose();
        player.labelDispose?.();
        players.delete(id);
      }
    },

    resize() {
      const aspect = window.innerWidth / window.innerHeight;
      camera.left = -VIEW_SIZE * aspect;
      camera.right = VIEW_SIZE * aspect;
      camera.top = VIEW_SIZE;
      camera.bottom = -VIEW_SIZE;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    },

    dispose() {
      for (const id of [...players.keys()]) world.removePlayer(id);
      renderer.dispose();
      container.removeChild(renderer.domElement);
    },
  };

  world.resize();
  return world;
}
