import * as THREE from "three";
import { VIEW_SIZE } from "../config";

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

  const grid = new THREE.GridHelper(40, 40, 0x444466, 0x333344);
  grid.rotation.x = Math.PI / 2;
  scene.add(grid);

  const players = new Map(); // id -> THREE.Mesh

  const world = {
    scene,
    camera,
    renderer,
    players,
    myId: null,
    myPos: { x: 0, y: 0 },

    addPlayer(id, x, y, color) {
      const geometry = new THREE.PlaneGeometry(1, 1);
      const material = new THREE.MeshBasicMaterial({ color });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, 0);
      scene.add(mesh);
      players.set(id, mesh);
    },

    movePlayer(id, x, y) {
      const mesh = players.get(id);
      if (mesh) mesh.position.set(x, y, 0);
    },

    removePlayer(id) {
      const mesh = players.get(id);
      if (mesh) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
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
