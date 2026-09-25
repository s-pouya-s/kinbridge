export type ID = string;

export interface GraveLocation {
  lat: number;
  lng: number;
}

export type Gender = 'male' | 'female';

export interface Person {
  id: ID;
  name: string;
  surname?: string;
  /** Optional on purpose — used only to color the card; unset renders neutrally. */
  gender?: Gender;
  /**
   * Gregorian ISO date ("YYYY-MM-DD"), always. The Shamsi calendar picker
   * (ShamsiDatePicker / src/utils/jalali.ts) is purely an editing/display
   * convenience — storing Gregorian keeps dates sortable, portable across a
   * JSON export/import, and calendar-agnostic everywhere else in the app.
   */
  born?: string;
  died?: string;
  /**
   * Known to have passed away, even when the date isn't known. Anyone with a
   * `died` date counts as deceased too, with or without this; use
   * isDeceased (src/model/people.ts) rather than checking either alone.
   */
  deceased?: boolean;
  birthPlace?: string;
  gravePlace?: string;
  /** Reserved for a future "show on map" pin. Free-text gravePlace is enough for v1. */
  graveLocation?: GraveLocation;
  notes?: string;
  /**
   * A `data:image/jpeg;base64,...` URI — never a bare `file://` path, which
   * would only ever resolve inside the app install that picked it. Set by
   * src/utils/photo.ts's pickPersonPhoto, which also resizes/compresses on
   * the way in so this stays reasonably sized in AsyncStorage and in a JSON
   * export (see storage.ts), which carries it along as plain text either way.
   */
  photoUri?: string;
  /**
   * The person's photo album, in the order added: shown on their info sheet
   * after the notes. Each entry is a file name in the app's album folder
   * (on a phone) or an inline data: URI (on web) — see src/utils/album.ts
   * for why, and albumPhotoUri to turn one into something an <Image> shows.
   */
  photos?: string[];
  /** A placeholder for a spouse whose identity was never recorded. */
  unknown?: boolean;
  /**
   * This person's position within their own generation row — think of the
   * row as a strip of numbered cells (each COL_SPACING wide, see layout.ts)
   * that a card can occupy. Unset means "let the automatic
   * chronological/adjacency rules decide," which assigns dense consecutive
   * numbers (0, 1, 2, ...) with no gaps — the default for everyone until a
   * card in that row is manually moved.
   *
   * Once set, it's an absolute cell number, not just a rank: the on-canvas
   * ‹ › arrows (edit mode) move a person exactly one cell earlier/later,
   * swapping with whoever already occupies that cell — or, if nobody does,
   * simply moving into it, which is how a row grows empty breathing-room
   * cells (see movePersonOneStep). Gaps between occupied numbers render as
   * blank space; nothing about the layout ever compacts them back out. See
   * layout/order.ts's applyManualOrder for how this also decides row order.
   */
  manualOrder?: number;
  /**
   * Overrides which generation (row) this person starts at — see
   * layout/generations.ts. Only actually moves anyone who isn't already
   * pinned lower by a blood parent (a child can never render above its own
   * parent; the relaxation pass still enforces that). Meant for a person
   * with no recorded parents — e.g. aligning a second, unconnected family's
   * root ancestor with the right generation row of the first one.
   */
  manualGeneration?: number;
}

export type MarriageStatus = 'current' | 'ended';

export interface Marriage {
  id: ID;
  spouseIds: [ID, ID];
  status: MarriageStatus;
  marriedYear?: number;
  endedYear?: number;
  childIds: ID[];
  /**
   * Set once someone has put this couple's children in order by hand (the
   * ↑/↓ buttons on the marriage's edit form) — for families who know who was
   * born first but not the dates. While set, childIds' own order is the
   * sibling order on the tree; unset, siblings are sorted by birth date. See
   * layout/siblings.ts.
   */
  manualChildOrder?: boolean;
}

export interface FamilyData {
  people: Person[];
  marriages: Marriage[];
}
