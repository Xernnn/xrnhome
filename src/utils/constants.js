// The xrn family's look, taken from xrnrule: graphite cards with a thin border
// on a near-black ground (or white cards on a pale grey one), one green for
// "go", and a colour per kind of thing. `border` is the hairline every card and
// divider draws; `outline` is the stronger one for outlined buttons. `onAccent`
// is what goes on top of the green. Text colours here keep to at least 4.5:1,
// so the light theme's green, amber and red are a shade darker than xrnrule's.
export const LIGHT_COLORS = {
  background: "#F2F2F4",
  surface: "#FFFFFF",
  surfaceAlt: "#EBEBEF",
  accent: "#15803D",
  accentLight: "#DCFCE7",
  onAccent: "#FFFFFF",
  onAccentLight: "#14532D",
  textPrimary: "#1B1B1E",
  textSecondary: "#6B6B73",
  border: "#E3E3E8",
  outline: "#C9C9CF",
  danger: "#B91C1C",
  dangerLight: "#FDE3E3",
  warning: "#854D0E",
  warningLight: "#FEF3C7",
  inverseSurface: "#2B2B30",
  inverseText: "#F4F4F5",
  inverseAccent: "#22C55E",
  white: "#FFFFFF",
  shadow: "#000000",
  tabBar: "#FFFFFF",
};

export const DARK_COLORS = {
  background: "#1F1F23",
  surface: "#2B2B30",
  surfaceAlt: "#3A3A40",
  accent: "#22C55E",
  accentLight: "#1F3A2A",
  onAccent: "#06240F",
  onAccentLight: "#BBF7D0",
  textPrimary: "#F4F4F5",
  textSecondary: "#AAAAAC",
  border: "#37373C",
  outline: "#4A4A50",
  danger: "#F87171",
  dangerLight: "#4A1F1F",
  warning: "#FFD60A",
  warningLight: "#423814",
  inverseSurface: "#F4F4F5",
  inverseText: "#1F1F23",
  inverseAccent: "#15803D",
  white: "#FFFFFF",
  shadow: "#000000",
  tabBar: "#2B2B30",
};

// The launcher icon's tile, for the small mark before the wordmark.
export const BRAND = "#B8860B";

// Cards use a border, not a shadow. Kept for the few things that float (the
// undo toast).
export const SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.18,
  shadowRadius: 12,
  elevation: 6,
};

// How wide a page gets in a browser window: the grids, and everything read or
// typed into, which goes unreadable stretched across a whole screen.
export const PAGE_WIDTH = 1200;
// From this wide a browser gets the laptop layout (src/desktop); narrower, the
// phone's screens fit it better.
export const DESKTOP_WIDTH = 1000;
export const FORM_WIDTH = 720;

export const RADIUS = {
  card: 24, // full-width cards
  tile: 18, // the item cards in a room's grid, photo tiles
  button: 14, // inputs and small buttons
  pill: 99,
};

export const SPACING = {
  screen: 20,
  card: 20,
  inner: 8,
};

// The text is the phone's own font, which on the Redmi is MiSans, the face
// xrnrule bundles. MiSans draws heavier than its weight names, so (as in
// xrnrule) each style asks for one step lighter than it looks. Geist Mono (OFL,
// assets/fonts) is for the wordmark and the big numbers.
// On a card in its pack's colour, in both themes. packShade keeps every card dark
// enough for PACK_INK; PACK_OUT is the card of something that has run out.
export const PACK_INK = "#FFFFFF";
export const PACK_BUTTON_INK = "#1B1B1E";
export const PACK_OUT = "#4B4B52";

export const FONTS = {
  mono: "GeistMono-Bold",
  monoMedium: "GeistMono-Medium",
};

export const TYPE = {
  pageTitle: { fontSize: 23, fontWeight: "700", letterSpacing: -0.2 },
  bigName: { fontSize: 24, fontWeight: "800" },
  barTitle: { fontSize: 18, fontWeight: "400" },
  title: { fontSize: 17, fontWeight: "600" },
  question: { fontSize: 14, fontWeight: "600" },
  body: { fontSize: 16, fontWeight: "400" },
  bodySmall: { fontSize: 13.5, fontWeight: "400" },
  caption: { fontSize: 12, fontWeight: "400" },
  button: { fontSize: 15, fontWeight: "600" },
  tab: { fontSize: 11.5, fontWeight: "500" },
  section: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.9,
    textTransform: "uppercase",
  },
};

// The top-level split: things you eat or drink, and the physical things you
// own. Code and stored items call this the item's `room` (each one has its own
// tab); the Add and Edit screens call it the item's type.
export const ROOMS = [
  {
    key: "food",
    label: "Food",
    icon: "food-apple-outline",
    iconFilled: "food-apple",
    emptyIcon: "fridge-outline",
    emptyTitle: "No food yet",
  },
  {
    key: "household",
    label: "Household",
    icon: "home-outline",
    iconFilled: "home",
    emptyIcon: "package-variant",
    emptyTitle: "No household items yet",
  },
];

export const DEFAULT_ROOM = ROOMS[0].key;

export const getRoomMeta = (key) =>
  ROOMS.find((r) => r.key === key) || ROOMS[0];

export const roomExists = (key) => ROOMS.some((r) => r.key === key);

// `room: null` marks a category offered in every room. Keep "Other" last: it is
// the fallback for unknown labels. Each colour is one of xrnrule's kind
// colours, in its light-theme and dark-theme shade (read it with
// `categoryColor`).
export const CATEGORIES = [
  { label: "Cereal", icon: "barley", light: "#CA8A04", dark: "#FFD60A", room: "food" },
  { label: "Noodles", icon: "noodles", light: "#EA580C", dark: "#FF8C1A", room: "food" },
  { label: "Drinks", icon: "cup", light: "#0891B2", dark: "#40C8E0", room: "food" },
  { label: "Spices & Sauces", icon: "shaker", light: "#DC2626", dark: "#E0473A", room: "food" },
  { label: "Fridge", icon: "fridge-outline", light: "#2563EB", dark: "#4A9EFF", room: "food" },
  { label: "Cupboard", icon: "cupboard", light: "#8D6E63", dark: "#BCAAA4", room: "food" },
  { label: "Kitchen", icon: "pot-mix", light: "#16A34A", dark: "#22C55E", room: "household" },
  { label: "Bedroom", icon: "bed", light: "#7C3AED", dark: "#A78BFA", room: "household" },
  { label: "Storage", icon: "archive-outline", light: "#DB2777", dark: "#F472B6", room: "household" },
  { label: "Other", icon: "dots-horizontal", light: "#757575", dark: "#9E9E9E", room: null },
];

const OTHER = CATEGORIES[CATEGORIES.length - 1];

// Colours for categories the person adds, picked in turn.
const CUSTOM_COLORS = [
  { light: "#0F766E", dark: "#2DD4BF" },
  { light: "#4F46E5", dark: "#818CF8" },
  { light: "#BE185D", dark: "#F9A8D4" },
  { light: "#4D7C0F", dark: "#A3E635" },
  { light: "#B45309", dark: "#FBBF24" },
  { light: "#0369A1", dark: "#7DD3FC" },
];

// The person's own categories: [{ label, room }]. Every lookup below reads this,
// so it has to be set before stored items are normalized (a category that isn't
// known falls back to "Other"). InventoryContext does that.
let customCategories = [];

const sameLabel = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

// Keeps the entries that make a usable category: a short name in a real room,
// unique across all categories so a label is enough to find one.
export const cleanCustomCategories = (raw) => {
  const out = [];
  (Array.isArray(raw) ? raw : []).forEach((entry) => {
    const label = typeof entry?.label === "string" ? entry.label.trim() : "";
    if (!label || label.length > 24 || !roomExists(entry.room)) {
      return;
    }
    if ([...CATEGORIES, ...out].some((c) => sameLabel(c.label, label))) {
      return;
    }
    const color = CUSTOM_COLORS[out.length % CUSTOM_COLORS.length];
    out.push({ label, room: entry.room, icon: "tag-outline", ...color });
  });
  return out;
};

export const setCustomCategories = (list) => {
  customCategories = cleanCustomCategories(list);
  return customCategories;
};

export const getCustomCategories = () => customCategories;

// A category's colour in the current theme. Anything else with a plain
// `color` passes through.
export const categoryColor = (meta, isDark) =>
  (meta && (isDark ? meta.dark : meta.light)) || (meta && meta.color) || "#9E9E9E";

export const QUANTITY_UNITS = [
  "pcs",
  "bottles",
  "cans",
  "bags",
  "boxes",
  "jars",
  "packs",
  "rolls",
  "bunches",
  "tubes",
  "pairs",
  "kg",
  "g",
  "L",
  "ml",
];

const SINGULAR_UNITS = {
  pcs: "pc",
  bottles: "bottle",
  cans: "can",
  bags: "bag",
  boxes: "box",
  jars: "jar",
  packs: "pack",
  rolls: "roll",
  bunches: "bunch",
  tubes: "tube",
  pairs: "pair",
};

// The unit as it reads next to a count: "1 bottle", "2 bottles".
export const unitFor = (count, unit) =>
  count === 1 ? SINGULAR_UNITS[unit] || unit : unit;

export const countText = (count, unit) => `${count} ${unitFor(count, unit)}`;

export const MAX_HISTORY_ENTRIES = 20;
export const MAX_QUANTITY = 1000000;
export const OPENED_STEP = 10;
export const ALMOST_OUT_PERCENT = 20;
export const EXPIRING_SOON_DAYS = 4;

export const getCategoryMeta = (label) =>
  CATEGORIES.find((c) => c.label === label) ||
  customCategories.find((c) => c.label === label) ||
  OTHER;

// The room's categories with "Other" last, the person's own just before it.
export const getRoomCategories = (room) => [
  ...CATEGORIES.filter((c) => c.room === room),
  ...customCategories.filter((c) => c.room === room),
  OTHER,
];

export const categoryExists = (label, room) =>
  getRoomCategories(room).some((c) => c.label === label);

export const isTrackingOpened = (item) =>
  item &&
  item.openedPercent !== null &&
  item.openedPercent !== undefined &&
  !Number.isNaN(item.openedPercent);

// When a re-buy item goes on the list: once it's down to `units` (the count
// includes the open one), and/or once the open one is down to `percent`. With
// `match: "all"` both have to be true, with "any" either one. An item that never
// got a rule of its own keeps the original one: when it runs out, or, for a %
// item, when the last unit is down to ALMOST_OUT_PERCENT.
export const getRestockRule = (item) => {
  const tracking = isTrackingOpened(item);
  if (!item || !Number.isFinite(item.restockUnits)) {
    return tracking
      ? { units: 1, percent: ALMOST_OUT_PERCENT, match: "all" }
      : { units: 0, percent: null, match: "all" };
  }
  return {
    units: item.restockUnits,
    percent:
      tracking && Number.isFinite(item.restockPercent)
        ? item.restockPercent
        : null,
    match: item.restockMatch === "any" ? "any" : "all",
  };
};

export const isAlmostOut = (item) => {
  if (!item) {
    return false;
  }
  // Running out always counts, so every finished re-buy item lands on the list.
  if (item.quantity <= 0) {
    return true;
  }
  const rule = getRestockRule(item);
  const low = item.quantity <= rule.units;
  if (rule.percent === null) {
    return low;
  }
  const openLow = item.openedPercent <= rule.percent;
  if (rule.match === "any") {
    // `openCovered`: more was bought while the open one was low, so that open
    // one has been dealt with until the next one is opened.
    return low || (openLow && !item.openCovered);
  }
  return low && openLow;
};

const leftText = (n) =>
  n <= 0 ? "it runs out" : n === 1 ? "there's 1 left" : `there are ${n} left`;

// "when there are 2 left and the open one is at 20% or less": the rule as the
// item's screens say it.
export const describeRestockRule = (rule) => {
  const units = leftText(rule.units);
  if (rule.percent === null) {
    return `when ${units}`;
  }
  const open = `the open one is at ${rule.percent}% or less`;
  if (rule.match === "any") {
    return rule.units <= 0
      ? `when ${open}, or when it runs out`
      : `when ${units}, or when ${open}`;
  }
  return rule.units <= 0 ? "when it runs out" : `when ${units} and ${open}`;
};

// Items with stock show on their room's tab.
export const isInStock = (item) => !!item && item.quantity > 0;

// What a re-buy item says about itself: it's low, or what's left has expired.
// `snoozed` is "not this trip": the item stays out of the way until more is
// bought.
export const needsRebuy = (item) =>
  !!item &&
  !!item.recurring &&
  !item.neverRecommend &&
  !item.snoozed &&
  (isAlmostOut(item) ||
    (item.quantity > 0 && getExpiryStatus(item) === "expired"));

// Shopping list sections. "To buy" holds anything put on the list by hand
// (`wanted`) plus re-buy items that need buying. Other re-buy items are "Not
// needed yet". Whatever ran out and is on neither list is under "Ran out". Every
// out-of-stock item lands in one of the three, so nothing is left stranded with
// no screen to reach it from.
export const isOnBuyList = (item) =>
  !!item && (!!item.wanted || needsRebuy(item));

export const isStillStocked = (item) =>
  !!item && !!item.recurring && !item.neverRecommend && !isOnBuyList(item);

export const isPreviouslyHad = (item) =>
  !!item && item.quantity <= 0 && !item.recurring && !item.wanted;

// How much of an item is left, in words, for the lists.
export const stockText = (item) => {
  if (item.quantity <= 0) {
    return "out of stock";
  }
  if (item.quantity === 1 && isTrackingOpened(item)) {
    return `last one at ${item.openedPercent}%`;
  }
  return `${countText(item.quantity, item.unit)} left`;
};

// Rounds a value to the nearest OPENED_STEP and clamps it to 0..100.
export const roundPercent = (value) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }
  const rounded = Math.round(value / OPENED_STEP) * OPENED_STEP;
  return Math.max(0, Math.min(100, rounded));
};

// "1 item", "2 items".
export const itemCount = (n) => `${n} ${n === 1 ? "item" : "items"}`;

// ----- Expiry helpers ------------------------------------------------------

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

export const daysUntilExpiry = (item) => {
  if (!item || !item.expiryDate) {
    return null;
  }
  const expiry = new Date(item.expiryDate);
  if (Number.isNaN(expiry.getTime())) {
    return null;
  }
  const today = startOfDay(new Date());
  const target = startOfDay(expiry);
  return Math.round(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
};

// Returns "expired" | "soon" | "fresh" | null.
export const getExpiryStatus = (item) => {
  const days = daysUntilExpiry(item);
  if (days === null) {
    return null;
  }
  if (days < 0) {
    return "expired";
  }
  if (days <= EXPIRING_SOON_DAYS) {
    return "soon";
  }
  return "fresh";
};

export const isExpiringSoon = (item) => {
  const status = getExpiryStatus(item);
  return status === "expired" || status === "soon";
};

export const getExpiryLabel = (item) => {
  const days = daysUntilExpiry(item);
  if (days === null) {
    return "";
  }
  if (days < 0) {
    const ago = Math.abs(days);
    return ago === 1 ? "Expired 1 day ago" : `Expired ${ago} days ago`;
  }
  if (days === 0) {
    return "Expires today";
  }
  if (days === 1) {
    return "Expires tomorrow";
  }
  return `Expires in ${days} days`;
};

export const getExpiryShortLabel = (item) => {
  const days = daysUntilExpiry(item);
  if (days === null) {
    return "";
  }
  if (days < 0) {
    return "Expired";
  }
  if (days === 0) {
    return "Today";
  }
  return `${days}d`;
};

export const formatExpiryDate = (iso) => {
  if (!iso) {
    return "";
  }
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch (e) {
    return iso;
  }
};

// The stock that had a date ran out or expired, and what was bought since has
// none yet.
export const needsExpiryDate = (item) =>
  !!item && item.quantity > 0 && !!item.expiryWanted && !item.expiryDate;

export const getExpiryColor = (status, colors) => {
  if (status === "expired") {
    return colors.danger;
  }
  if (status === "soon") {
    return colors.warning;
  }
  return colors.textSecondary;
};

export const normalizeName = (name) =>
  typeof name === "string" ? name.trim().toLowerCase() : "";

// Key used to decide whether two entries describe the same item. The same name
// under two categories is two different things (tissues by the bed and in the
// kitchen). The room is part of the key because "Other" is in every room.
export const itemKey = (item) =>
  `${item.room}:${item.category}:${normalizeName(item.name)}`;

export const hexToRgba = (hex, alpha) => {
  if (!hex || typeof hex !== "string") {
    return `rgba(0,0,0,${alpha})`;
  }
  let normalized = hex.replace("#", "");
  if (normalized.length === 3) {
    normalized = normalized
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const r = parseInt(normalized.substring(0, 2), 16);
  const g = parseInt(normalized.substring(2, 4), 16);
  const b = parseInt(normalized.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// Opaque equivalent of drawing `hex` at `alpha` over `backgroundHex`.
export const mixHex = (hex, backgroundHex, alpha) => {
  const channels = (value) => {
    let normalized = value.replace("#", "");
    if (normalized.length === 3) {
      normalized = normalized
        .split("")
        .map((c) => c + c)
        .join("");
    }
    return [0, 2, 4].map((i) => parseInt(normalized.substring(i, i + 2), 16));
  };
  const fg = channels(hex);
  const bg = channels(backgroundHex);
  const mixed = fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha)));
  return `rgb(${mixed.join(", ")})`;
};
