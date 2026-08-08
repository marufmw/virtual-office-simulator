import { Room } from "./layout";

/** Players stand just in front of their desk */
export const SPAWN_OFFSET_Y = -1.6;

/** The walls a brand new office starts with: small, and easy to grow */
export const DEFAULT_ROOM: Room = { minX: -12, maxX: 12, minY: -10, maxY: 10 };

/**
 * The desk an office is created with, so its admin has somewhere to sit
 * before they have laid anything out. Named plainly because it is a
 * placeholder — the editor renames desks to whatever the office calls them.
 */
export const FIRST_DESK_CODE = "Desk 1";

export const MAX_OFFICE_NAME_LENGTH = 60;

export const CHARACTERS = [
  "character_1",
  "office_blonde_man_red",
  "office_blonde_man_blue",
  "office_man_white_shirt",
  "office_man_dark_red",
  "office_blonde_woman_teal",
  "office_woman_red",
  "office_man_green",
  "office_man_gray",
  "office_woman_pink",
  "office_man_black_suit",
  "office_man_lavender",
  "office_woman_blue",
];

export const DEFAULT_CHARACTER = "office_man_white_shirt";

export const randomCharacter = () => CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];
