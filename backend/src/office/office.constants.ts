import { Room } from "./layout";

// Players appear just in front of their desk
export const SPAWN_OFFSET_Y = -1.6;

export const DEFAULT_CHARACTER = "office_man_white_shirt";

// The walls as they currently stand
export const DEFAULT_ROOM: Room = { minX: -22, maxX: 26, minY: -14, maxY: 12 };

export interface Seat {
  deskId: string;
  x: number;
  y: number;
  name?: string;
  character?: string;
}

/**
 * The office as it stands: every desk where it actually sits, and who sits
 * at it. Captured from the live floor plan rather than described by a grid,
 * because the plan has been rearranged by hand since and a grid can no
 * longer express it.
 *
 * A seat with a name belongs to that person and is recreated with them on
 * it; the rest are free for whoever walks in first. This is also what
 * `resetLayout` puts the office back to.
 */
export const SEED: Seat[] = [
  // back row
  { deskId: "TB-046", x: -17, y: 5 },
  { deskId: "TB-137", x: -13, y: 5 },
  { deskId: "TB-113", x: -5, y: 5, name: "Sidul", character: "office_man_green" },
  { deskId: "TB-057", x: -1, y: 5, name: "Siam", character: "office_man_gray" },
  { deskId: "TB-110", x: 3, y: 5, name: "Maruf", character: "office_man_white_shirt" },
  { deskId: "TB-109", x: 7, y: 5, name: "Rashed", character: "office_man_green" },
  { deskId: "TB-108", x: 11, y: 5, name: "Sidul", character: "office_man_green" },
  { deskId: "TB-107", x: 15, y: 5, name: "Asad", character: "office_man_white_shirt" },
  // middle row
  { deskId: "TB-042", x: -9, y: -3 },
  { deskId: "TB-073", x: -5, y: -3 },
  { deskId: "TB-043", x: -1, y: -3 },
  { deskId: "TB-136", x: 3, y: -3 },
  { deskId: "TB-112", x: 7, y: -3 },
  { deskId: "TB-111", x: 11, y: -3 },
  { deskId: "TB-045", x: 17, y: -3 },
  { deskId: "TB-142", x: 21, y: -3 },
  // front row
  { deskId: "TB-114", x: -17, y: -7 },
  { deskId: "TB-105", x: -7, y: -7 },
  { deskId: "TB-041", x: -3, y: -7 },
  { deskId: "TB-040", x: 1, y: -7 },
  { deskId: "TB-005", x: 5, y: -7 },
  { deskId: "TB-044", x: 17, y: -7 },
];
