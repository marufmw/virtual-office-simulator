/**
 * A desk's footprint in world units, shared by the 3D office and the
 * floor-plan editor so the plan is drawn to the same scale as the room.
 * The height keeps the desk sprite's 32x30 aspect ratio.
 */
export const DESK_UNITS = { width: 2, height: (30 / 32) * 2 };
