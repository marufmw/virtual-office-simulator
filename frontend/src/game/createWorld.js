import * as THREE from "three";
import { VIEW_SIZE, INTERACT_DISTANCE } from "../config";
import { createAnimatedPlayer } from "./createAnimatedPlayer";
import { createInteractIndicator } from "./createInteractIndicator";
import { createNameLabel } from "./createNameLabel";
import { createDesk, DESK_WIDTH, DESK_HEIGHT } from "./createDesk";
import { createPathDots } from "./createPathDots";
import { findPath } from "./findPath";
import { createPropMesh } from "./props";

function makeTiledTexture(path) {
  const texture = new THREE.TextureLoader().load(path);
  texture.magFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

// Office room bounds (wall centerlines; walls are 2 units thick)
const ROOM = { minX: -22, maxX: 22, minY: -15, maxY: 18 };
const BRICK = 2; // world units per brick tile
const TILE = 2; // world units per checker tile

// Solid rectangles used for collision: [centerX, centerY, halfWidth, halfHeight]
const WALL_COLLIDERS = [
  [0, ROOM.maxY, Math.abs(ROOM.maxX) + 1, 1], // top
  [0, ROOM.minY, Math.abs(ROOM.minX) + 1, 1], // bottom
  [ROOM.minX, (ROOM.minY + ROOM.maxY) / 2, 1, (ROOM.maxY - ROOM.minY) / 2], // left
  [ROOM.maxX, (ROOM.minY + ROOM.maxY) / 2, 1, (ROOM.maxY - ROOM.minY) / 2], // right
];

/**
 * Creates the game world: Three.js scene, camera, renderer and the
 * player mesh store. All mutable game state lives here, outside of
 * React, so hooks can share it without re-rendering.
 */
export function createWorld(container) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2b2b3d);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.z = 10;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  container.appendChild(renderer.domElement);

  // Brick ground everywhere outside the room (large static plane)
  const brickTexture = makeTiledTexture("/sprites/office/brick.png");
  brickTexture.repeat.set(120 / BRICK, 120 / BRICK);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120),
    new THREE.MeshBasicMaterial({ map: brickTexture, color: 0x777777 })
  );
  ground.position.z = -1;
  scene.add(ground);

  // Checker tiles only inside the room
  const floorTexture = makeTiledTexture("/sprites/office/floor_tile.png");
  const roomW = ROOM.maxX - ROOM.minX + BRICK; // tuck under the walls
  const roomH = ROOM.maxY - ROOM.minY + BRICK;
  floorTexture.repeat.set(roomW / TILE, roomH / TILE);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(roomW, roomH),
    new THREE.MeshBasicMaterial({ map: floorTexture })
  );
  floor.position.set((ROOM.minX + ROOM.maxX) / 2, (ROOM.minY + ROOM.maxY) / 2, -0.9);
  scene.add(floor);

  // Brick walls enclosing the office
  for (let x = ROOM.minX; x <= ROOM.maxX; x += BRICK) {
    for (const y of [ROOM.minY, ROOM.maxY]) {
      const brick = createPropMesh("brick", BRICK);
      brick.position.set(x, y, -0.4);
      scene.add(brick);
    }
  }
  for (let y = ROOM.minY; y <= ROOM.maxY; y += BRICK) {
    for (const x of [ROOM.minX, ROOM.maxX]) {
      const brick = createPropMesh("brick", BRICK);
      brick.position.set(x, y, -0.4);
      scene.add(brick);
    }
  }

  // Wall-mounted decorations on the top wall
  const wallProps = [
    ["door", 2, 12, ROOM.maxY + 1], // embedded in the wall
    ["chart", 1.5, 0, ROOM.maxY], // hanging on the bricks
    ["extinguisher", 0.5, 13.8, ROOM.maxY], // standing at the wall base
  ];
  for (const [name, width, x, y] of wallProps) {
    const prop = createPropMesh(name, width);
    prop.position.set(x, y, -0.3);
    scene.add(prop);
  }

  const players = new Map(); // id -> { group, update, dispose, prevX, prevY }
  const desks = new Map(); // id -> { dispose }

  const indicator = createInteractIndicator();
  scene.add(indicator.sprite);

  const pathDots = createPathDots();
  scene.add(pathDots.group);

  const world = {
    scene,
    camera,
    renderer,
    players,
    myId: null,
    myDeskId: null,
    myPos: { x: 0, y: 0 },
    moveTarget: null, // { x, y } the waypoint currently being walked toward
    path: null, // remaining waypoints of the active route, moveTarget first

    // Session id of the closest player within interaction range, or null.
    // `onNearbyChange` is set by React so the UI can follow it.
    nearbyId: null,
    onNearbyChange: null,

    /**
     * Finds the closest other player within INTERACT_DISTANCE and parks the
     * speech-bubble indicator between the two of us. Called every frame.
     */
    updateProximity(delta) {
      const me = players.get(world.myId);
      if (!me) return;
      const mine = me.group.position;

      let closestId = null;
      let closestDistance = INTERACT_DISTANCE;
      for (const [pid, player] of players) {
        if (pid === world.myId) continue;
        const pos = player.group.position;
        const distance = Math.hypot(pos.x - mine.x, pos.y - mine.y);
        if (distance <= closestDistance) {
          closestDistance = distance;
          closestId = pid;
        }
      }

      indicator.sprite.visible = closestId !== null;
      if (closestId !== null) {
        indicator.placeBetween(mine, players.get(closestId).group.position);
      }
      indicator.update(delta);

      if (closestId !== world.nearbyId) {
        world.nearbyId = closestId;
        world.onNearbyChange?.(closestId);
      }
    },

    // True if the given normalized device coords land on the indicator
    indicatorHit(ndcX, ndcY) {
      if (!indicator.sprite.visible) return false;
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
      return raycaster.intersectObject(indicator.sprite).length > 0;
    },

    // Position of a desk plus the standing spot in front of it
    deskStandPosition(id) {
      const desk = desks.get(id);
      if (!desk) return null;
      const { x, y } = desk.group.position;
      return { x, y: y - 1.6 };
    },

    /**
     * Plots the shortest walkable route from where I stand to `goal`,
     * draws it on the floor and starts following it. Falls back to a
     * straight line if no route can be found (the game loop's
     * obstacle-sliding then does its best).
     */
    walkTo(goal) {
      if (!goal) return false;
      const blocked = (x, y) => world.collidesAt(x, y, world.myId);
      const route = findPath(world.myPos, goal, blocked);
      // findPath includes my current position as the first point
      const waypoints = route ? route.slice(1) : [{ x: goal.x, y: goal.y }];

      world.path = waypoints;
      world.moveTarget = waypoints[0];
      pathDots.setPath([{ x: world.myPos.x, y: world.myPos.y }, ...waypoints]);
      return route !== null;
    },

    // Redraws the trail from where I am now, so walked-over dots vanish
    refreshPathTrail() {
      if (!world.path) return;
      pathDots.setPath([{ x: world.myPos.x, y: world.myPos.y }, ...world.path]);
    },

    // Marks the current waypoint reached; returns true if more remain
    advanceWaypoint() {
      const remaining = world.path ? world.path.slice(1) : [];
      if (remaining.length === 0) {
        world.cancelPath();
        return false;
      }
      world.path = remaining;
      world.moveTarget = remaining[0];
      pathDots.setPath([{ x: world.myPos.x, y: world.myPos.y }, ...remaining]);
      return true;
    },

    cancelPath() {
      world.path = null;
      world.moveTarget = null;
      pathDots.clear();
    },

    addDesk(id, x, y) {
      const desk = createDesk(id, x, y);
      scene.add(desk.group);
      desks.set(id, desk);
    },

    // Live floor-plan edits from the layout editor
    moveDesk(id, x, y) {
      desks.get(id)?.group.position.set(x, y, 0);
    },

    removeDesk(id) {
      const desk = desks.get(id);
      if (!desk) return;
      scene.remove(desk.group);
      desk.dispose();
      desks.delete(id);
    },

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
      player.name = name;
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

    // AABB check against every other player and every desk
    // (client-side prediction; the server stays authoritative)
    collidesAt(x, y, exceptId = null) {
      for (const [pid, player] of players) {
        const pos = player.group.position;
        if (pid !== exceptId && Math.abs(pos.x - x) < 1 && Math.abs(pos.y - y) < 1) {
          return true;
        }
      }
      for (const desk of desks.values()) {
        const pos = desk.group.position;
        if (
          Math.abs(pos.x - x) < DESK_WIDTH / 2 + 0.5 &&
          Math.abs(pos.y - y) < DESK_HEIGHT / 2 + 0.5
        ) {
          return true;
        }
      }
      for (const [cx, cy, hw, hh] of WALL_COLLIDERS) {
        if (Math.abs(cx - x) < hw + 0.5 && Math.abs(cy - y) < hh + 0.5) {
          return true;
        }
      }
      return false;
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

    // Rebuilds a player's visuals (name label, character) in place,
    // keeping their current position
    updatePlayer(id, { x, y, character, name }) {
      const player = players.get(id);
      if (!player) return;
      const { x: px, y: py } = player.group.position;
      world.removePlayer(id);
      world.addPlayer(id, x ?? px, y ?? py, character, name);
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
      for (const desk of desks.values()) {
        scene.remove(desk.group);
        desk.dispose();
      }
      desks.clear();
      scene.remove(indicator.sprite);
      indicator.dispose();
      scene.remove(pathDots.group);
      pathDots.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    },
  };

  world.resize();
  return world;
}
