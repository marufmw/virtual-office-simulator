import * as THREE from "three";
import { PATH_DOT_SPACING } from "../config";

const DOT_COLOR = 0x38bdf8; // sky-400, same accent the UI uses
const DOT_SIZE = 0.22;
const MAX_DOTS = 512;
const Z = -0.8; // just above the floor, below everything else

/**
 * The breadcrumb trail drawn on the floor while auto-walking: evenly
 * spaced dots along the waypoint list, plus a ring on the destination.
 *
 * The dots are an InstancedMesh rather than THREE.Points because point
 * sizes are in pixels under an orthographic camera, which would make
 * them shrink to nothing.
 */
export function createPathDots() {
  const dotMaterial = new THREE.MeshBasicMaterial({
    color: DOT_COLOR,
    transparent: true,
    opacity: 0.85,
    depthTest: false,
  });
  const dots = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(DOT_SIZE, DOT_SIZE),
    dotMaterial,
    MAX_DOTS
  );
  dots.frustumCulled = false;
  dots.renderOrder = 1;
  dots.count = 0;

  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.3, 0.45, 20),
    new THREE.MeshBasicMaterial({
      color: DOT_COLOR,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
    })
  );
  marker.renderOrder = 1;
  marker.visible = false;

  const group = new THREE.Group();
  group.add(dots, marker);

  const matrix = new THREE.Matrix4();
  const placeDot = (index, x, y) => {
    matrix.makeTranslation(x, y, Z);
    dots.setMatrixAt(index, matrix);
  };

  return {
    group,

    // `path` is the full waypoint list, including the walker's position
    setPath(path) {
      let count = 0;
      for (let n = 0; n < path.length - 1 && count < MAX_DOTS; n++) {
        const from = path[n];
        const to = path[n + 1];
        const distance = Math.hypot(to.x - from.x, to.y - from.y);
        const steps = Math.max(1, Math.round(distance / PATH_DOT_SPACING));
        for (let s = 0; s < steps && count < MAX_DOTS; s++) {
          const t = s / steps;
          placeDot(count++, from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
        }
      }
      dots.count = count;
      dots.instanceMatrix.needsUpdate = true;

      const end = path[path.length - 1];
      marker.position.set(end.x, end.y, Z);
      marker.visible = true;
    },

    clear() {
      dots.count = 0;
      marker.visible = false;
    },

    dispose() {
      dots.geometry.dispose();
      dotMaterial.dispose();
      dots.dispose();
      marker.geometry.dispose();
      marker.material.dispose();
    },
  };
}
