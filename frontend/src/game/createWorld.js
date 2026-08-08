import * as THREE from "three";
import { VIEW_SIZE, INTERACT_DISTANCE } from "../config";
import { createAnimatedPlayer } from "./createAnimatedPlayer";
import { createInteractIndicator } from "./createInteractIndicator";
import { createNameLabel } from "./createNameLabel";
import { createDesk, DESK_WIDTH, DESK_HEIGHT } from "./createDesk";
import { createPathDots } from "./createPathDots";
import { DEFAULT_ROOM } from "./roomBounds";
import { findPath } from "./findPath";
import { createPropMesh } from "./props";
import {
  BOARD_WIDTH,
  BOARD_ASPECT,
  boardStandPosition,
} from "./boardPlacement";

function makeTiledTexture(path) {
  const texture = new THREE.TextureLoader().load(path);
  texture.magFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

const CELL_PX = 16; // texture pixels per floor tile
const GROUT_PX = 1; // and how many of them the seam between tiles takes

/**
 * The office floor: one flat colour, seamed into tiles by a slightly darker
 * line along each one's edge. Drawn rather than loaded, so the tone is
 * exactly what it says it is.
 *
 * Only the top and left edge of each tile is drawn. The texture repeats, so
 * every tile's right and bottom edge is its neighbour's left and top — one
 * line between any two tiles, and no double-width seam at the joins.
 */
function makeFloorTexture(fill = "#aba7a4", grout = "#969390", tiles = 4) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = tiles * CELL_PX;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = grout;
  for (let i = 0; i < tiles; i++) {
    const at = i * CELL_PX;
    ctx.fillRect(at, 0, GROUT_PX, canvas.height); // left edge
    ctx.fillRect(0, at, canvas.width, GROUT_PX); // top edge
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/**
 * The whiteboard that hangs on the back wall. Drawn rather than loaded, so
 * it can be as wide as it needs to be without a sprite to match: a dark
 * frame, a white surface, and enough of a scribble on it to read as a
 * whiteboard from across the room.
 */
function makeWhiteboardTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 160;
  canvas.height = 100;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#20242f"; // frame
  ctx.fillRect(0, 0, 160, 100);
  ctx.fillStyle = "#f2f5fb"; // the board itself
  ctx.fillRect(5, 5, 150, 82);
  ctx.fillStyle = "#39405a"; // the pen tray along the bottom
  ctx.fillRect(5, 87, 150, 8);

  // A scribble, so it doesn't read as a blank rectangle
  ctx.lineCap = "round";
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#38bdf8";
  ctx.beginPath();
  ctx.moveTo(20, 30);
  ctx.lineTo(58, 30);
  ctx.moveTo(20, 45);
  ctx.lineTo(44, 45);
  ctx.stroke();

  ctx.strokeStyle = "#f5b544";
  ctx.beginPath();
  ctx.arc(112, 42, 18, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "#4ade80";
  ctx.beginPath();
  ctx.moveTo(20, 64);
  ctx.lineTo(84, 64);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const PORTRAIT_PULLBACK = 1.35; // how much wider a portrait screen sees
const BRICK = 2; // world units per brick tile
// Courses of brick on the top wall. The door is 4 units tall and stands on
// the wall's base, so three courses (6 units) clear it comfortably.
const TOP_WALL_COURSES = 3;
const TILE = 10; // world units per checker tile

// Solid rectangles for collision: [centerX, centerY, halfWidth, halfHeight]
const wallCollidersFor = (room) => {
  const midX = (room.minX + room.maxX) / 2;
  const midY = (room.minY + room.maxY) / 2;
  const halfW = (room.maxX - room.minX) / 2 + 1;
  const halfH = (room.maxY - room.minY) / 2;
  return [
    [midX, room.maxY, halfW, 1], // top
    [midX, room.minY, halfW, 1], // bottom
    [room.minX, midY, 1, halfH], // left
    [room.maxX, midY, 1, halfH], // right
  ];
};

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

  // Floor, walls and their fittings. Rebuilt whenever the room grows, so
  // they live in one group that can be emptied wholesale.
  const floorTexture = makeFloorTexture();
  const whiteboardTexture = makeWhiteboardTexture();
  const roomGroup = new THREE.Group();
  scene.add(roomGroup);
  let room = DEFAULT_ROOM;
  let wallColliders = wallCollidersFor(room);
  let boardMesh = null; // the whiteboard, rebuilt with the room

  function buildRoom(bounds) {
    roomGroup.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      // The shared floor texture must outlive the rebuild
      if (obj.material && obj.material !== floorMaterial) obj.material.dispose();
    });
    roomGroup.clear();

    // Checker tiles only inside the room, tucked under the walls
    const roomW = bounds.maxX - bounds.minX + BRICK;
    const roomH = bounds.maxY - bounds.minY + BRICK;
    floorTexture.repeat.set(roomW / TILE, roomH / TILE);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(roomW, roomH), floorMaterial);
    floor.position.set((bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2, -0.9);
    roomGroup.add(floor);

    // Brick walls enclosing the office. The top one is the only wall seen
    // face-on, so it is laid several courses high — tall enough to hold the
    // door rather than have it poke out over the top. The other three are
    // seen edge-on and a single course reads as a wall just fine.
    const wallTop = bounds.maxY + (TOP_WALL_COURSES - 1) * BRICK;

    for (let x = bounds.minX; x <= bounds.maxX; x += BRICK) {
      for (let y = bounds.maxY; y <= wallTop; y += BRICK) {
        const brick = createPropMesh("brick", BRICK);
        brick.position.set(x, y, -0.4);
        roomGroup.add(brick);
      }
      const bottom = createPropMesh("brick", BRICK);
      bottom.position.set(x, bounds.minY, -0.4);
      roomGroup.add(bottom);
    }
    // The sides run all the way up the top wall, so the corners are filled
    for (let y = bounds.minY; y <= wallTop; y += BRICK) {
      for (const x of [bounds.minX, bounds.maxX]) {
        const brick = createPropMesh("brick", BRICK);
        brick.position.set(x, y, -0.4);
        roomGroup.add(brick);
      }
    }

    // The whiteboard, hung in the middle of the back wall where there's
    // floor in front of it to stand on. The server works out the same spot
    // from the same room, so walking up to what you see is walking into the
    // session.
    boardMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(BOARD_WIDTH, BOARD_WIDTH * BOARD_ASPECT),
      new THREE.MeshBasicMaterial({ map: whiteboardTexture, transparent: true })
    );
    boardMesh.position.set((bounds.minX + bounds.maxX) / 2, bounds.maxY + 0.6, -0.3);
    roomGroup.add(boardMesh);

    // Fittings on the top wall, kept a fixed distance in from its corners
    const wallProps = [
      ["door", 2, bounds.maxX - 10, bounds.maxY + 1], // embedded in the wall
      ["chart", 1.5, bounds.minX + 8, bounds.maxY], // hanging on the bricks
      ["extinguisher", 0.5, bounds.maxX - 8.2, bounds.maxY], // standing at the wall base
    ];
    for (const [name, width, x, y] of wallProps) {
      const prop = createPropMesh(name, width);
      prop.position.set(x, y, -0.3);
      roomGroup.add(prop);
    }
  }

  const floorMaterial = new THREE.MeshBasicMaterial({ map: floorTexture });
  buildRoom(room);

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
    phasing: false, // walking through obstacles after being stuck too long
    paused: false, // true while a full-screen overlay is covering the office

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

    /**
     * The inverse of screenToWorld: where a spot in the office shows up on
     * screen, in CSS pixels, so a label can be pinned to it.
     */
    worldToScreen(x, y) {
      const ndcX = (x - camera.position.x) / ((camera.right - camera.left) / 2);
      const ndcY = (y - camera.position.y) / ((camera.top - camera.bottom) / 2);
      return {
        left: ((ndcX + 1) / 2) * window.innerWidth,
        top: ((1 - ndcY) / 2) * window.innerHeight,
      };
    },

    // The whiteboard's own position, and the floor in front of it where
    // you have to be standing to draw. BOARD_INSET mirrors the backend.
    boardPosition() {
      return { x: (room.minX + room.maxX) / 2, y: room.maxY + 0.6 };
    },

    boardStandPosition() {
      return boardStandPosition(room);
    },

    // True if the given normalized device coords land on the whiteboard
    boardHit(ndcX, ndcY) {
      if (!boardMesh) return false;
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
      return raycaster.intersectObject(boardMesh).length > 0;
    },

    /**
     * Where on the floor a point on the screen lands. The camera looks
     * straight down an orthographic frustum at the z = 0 plane the whole
     * world sits on, so this is the camera's own offset plus the fraction
     * of the view the point sits at — no raycast needed.
     */
    screenToWorld(ndcX, ndcY) {
      return {
        x: camera.position.x + (ndcX * (camera.right - camera.left)) / 2,
        y: camera.position.y + (ndcY * (camera.top - camera.bottom)) / 2,
      };
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
      world.setPhasing(false);
      pathDots.clear();
    },

    // Walking through furniture, shown by fading the character
    setPhasing(on) {
      if (world.phasing === on) return;
      world.phasing = on;
      const me = players.get(world.myId);
      if (!me) return;
      me.sprite.material.transparent = true;
      me.sprite.material.opacity = on ? 0.45 : 1;
    },

    // True where a player can't stand: inside a desk or beyond the walls
    isStranded(x, y) {
      const inset = 1.5; // half a desk plus the player's own half-width
      if (
        x < room.minX + inset ||
        x > room.maxX - inset ||
        y < room.minY + inset ||
        y > room.maxY - inset
      ) {
        return true;
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
      return false;
    },

    // Desks are keyed by their id, but labelled with the code written on
    // them — the two have been different since offices grew owners
    addDesk(id, x, y, code) {
      const desk = createDesk(code ?? id, x, y);
      desk.code = code ?? id;
      scene.add(desk.group);
      desks.set(id, desk);
    },

    // The office grew: rebuild the floor, walls and their collision boxes
    setRoom(bounds) {
      if (!bounds) return;
      room = bounds;
      wallColliders = wallCollidersFor(bounds);
      buildRoom(bounds);
    },

    get room() {
      return room;
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

    /**
     * Plain snapshots of where the furniture and the people are, for the
     * map overlay — it draws its own plan in the DOM rather than sharing
     * the scene, so it wants numbers, not meshes.
     */
    deskList() {
      return [...desks].map(([id, desk]) => ({
        id,
        code: desk.code ?? id,
        x: desk.group.position.x,
        y: desk.group.position.y,
      }));
    },

    playerList() {
      return [...players].map(([id, player]) => ({
        id,
        name: player.name,
        x: player.group.position.x,
        y: player.group.position.y,
      }));
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
      // Kept so the character picker can show which one is already yours
      player.character = character;
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
      const inset = 1.5;

      // Outside the playable room is always blocked.
      if (
        x < room.minX + inset ||
        x > room.maxX - inset ||
        y < room.minY + inset ||
        y > room.maxY - inset
      ) {
        return true;
      }

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
      for (const [cx, cy, hw, hh] of wallColliders) {
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
      const width = window.innerWidth;
      const height = window.innerHeight;
      const aspect = width / height;
      // A portrait screen sees a narrow strip of the room at the desk
      // spacing the camera was tuned for, so it pulls back a little —
      // enough to take in the neighbouring desks without shrinking anyone
      // to a smudge.
      const halfHeight = VIEW_SIZE * (aspect < 1 ? PORTRAIT_PULLBACK : 1);
      camera.left = -halfHeight * aspect;
      camera.right = halfHeight * aspect;
      camera.top = halfHeight;
      camera.bottom = -halfHeight;
      camera.updateProjectionMatrix();
      // Phones report device pixel ratios of 3 and up; rendering every one
      // of them costs far more than it shows, so cap it at 2
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height);
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
      scene.remove(roomGroup);
      roomGroup.traverse((obj) => obj.geometry?.dispose());
      floorMaterial.dispose();
      floorTexture.dispose();
      whiteboardTexture.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    },
  };

  world.resize();
  return world;
}
