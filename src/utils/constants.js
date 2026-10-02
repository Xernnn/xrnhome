export const LIGHT_COLORS = {
  background: "#FAFAFA",
  surface: "#FFFFFF",
  surfaceAlt: "#F0F0F0",
  accent: "#2E7D32",
  accentLight: "#E8F5E9",
  textPrimary: "#212121",
  textSecondary: "#757575",
  border: "#E0E0E0",
  danger: "#F44336",
  warning: "#E67E00",
  white: "#FFFFFF",
  shadow: "#000000",
  tabBar: "#FFFFFF",
};

export const DARK_COLORS = {
  background: "#121212",
  surface: "#1E1E1E",
  surfaceAlt: "#2A2A2A",
  accent: "#66BB6A",
  accentLight: "#1B3A1E",
  textPrimary: "#ECECEC",
  textSecondary: "#9E9E9E",
  border: "#3A3A3A",
  danger: "#EF5350",
  warning: "#FFB74D",
  white: "#FFFFFF",
  shadow: "#000000",
  tabBar: "#1A1A1A",
};

export const SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.08,
  shadowRadius: 8,
  elevation: 3,
};

export const RADIUS = {
  card: 12,
  button: 8,
  pill: 99,
};

export const SPACING = {
  screen: 16,
  card: 12,
  inner: 8,
};

export const ROOMS = [
  {
    key: "kitchen",
    label: "Kitchen",
    icon: "silverware-fork-knife",
    emptyIcon: "fridge-outline",
  },
  {
    key: "bedroom",
    label: "Bedroom",
    icon: "bed-outline",
    emptyIcon: "bed-empty",
  },
];

export const DEFAULT_ROOM = ROOMS[0].key;

export const getRoomMeta = (key) =>
  ROOMS.find((r) => r.key === key) || ROOMS[0];

export const roomExists = (key) => ROOMS.some((r) => r.key === key);

// `room: null` marks a category offered in every room. Keep "Other" last: it is
// the fallback for unknown labels.
export const CATEGORIES = [
  { label: "Vegetables", icon: "carrot", color: "#4CAF50", room: "kitchen" },
  { label: "Fruits", icon: "food-apple", color: "#FF9800", room: "kitchen" },
  { label: "Meat & Seafood", icon: "food-steak", color: "#F44336", room: "kitchen" },
  { label: "Dairy", icon: "cheese", color: "#FFD54F", room: "kitchen" },
  { label: "Bakery", icon: "bread-slice", color: "#D7A86E", room: "kitchen" },
  { label: "Drinks", icon: "cup", color: "#29B6F6", room: "kitchen" },
  { label: "Frozen", icon: "snowflake", color: "#80DEEA", room: "kitchen" },
  { label: "Canned Foods", icon: "food-variant", color: "#78909C", room: "kitchen" },
  { label: "Condiments", icon: "bottle-soda", color: "#9C27B0", room: "kitchen" },
  { label: "Spices & Herbs", icon: "shaker", color: "#FF7043", room: "kitchen" },
  { label: "Grains & Pasta", icon: "grain", color: "#A1887F", room: "kitchen" },
  { label: "Snacks", icon: "cookie", color: "#FFCA28", room: "kitchen" },
  { label: "Food Cupboard", icon: "cupboard", color: "#8D6E63", room: "kitchen" },
  { label: "Cleaning", icon: "spray-bottle", color: "#26A69A", room: "kitchen" },
  { label: "Paper & Wraps", icon: "paper-roll", color: "#F06292", room: "kitchen" },
  { label: "Kitchenware", icon: "pot-mix", color: "#5C6BC0", room: "kitchen" },
  { label: "Clothing", icon: "tshirt-crew", color: "#5C6BC0", room: "bedroom" },
  { label: "Bedding", icon: "bed", color: "#7E57C2", room: "bedroom" },
  { label: "Toiletries", icon: "toothbrush-paste", color: "#29B6F6", room: "bedroom" },
  { label: "Beauty", icon: "lipstick", color: "#EC407A", room: "bedroom" },
  { label: "Medicine", icon: "pill", color: "#EF5350", room: "bedroom" },
  { label: "Electronics", icon: "power-plug", color: "#78909C", room: "bedroom" },
  { label: "Stationery", icon: "book-open-variant", color: "#A1887F", room: "bedroom" },
  { label: "Other", icon: "dots-horizontal", color: "#BDBDBD", room: null },
];

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
];

export const MAX_HISTORY_ENTRIES = 20;
export const OPENED_STEP = 10;
export const ALMOST_OUT_PERCENT = 20;
export const EXPIRING_SOON_DAYS = 4;

export const getCategoryMeta = (label) =>
  CATEGORIES.find((c) => c.label === label) || CATEGORIES[CATEGORIES.length - 1];

export const getRoomCategories = (room) =>
  CATEGORIES.filter((c) => c.room === room || c.room === null);

export const categoryExists = (label, room) =>
  getRoomCategories(room).some((c) => c.label === label);

export const isTrackingOpened = (item) =>
  item &&
  item.openedPercent !== null &&
  item.openedPercent !== undefined &&
  !Number.isNaN(item.openedPercent);

export const isAlmostOut = (item) => {
  if (!item) {
    return false;
  }
  if (item.quantity <= 0) {
    return true;
  }
  // On the last unit, a nearly-empty open one still counts as running out.
  if (item.quantity === 1 && isTrackingOpened(item)) {
    return item.openedPercent <= ALMOST_OUT_PERCENT;
  }
  return false;
};

// Items with stock show on their room's tab.
export const isInStock = (item) => !!item && item.quantity > 0;

// Ran out and not on the shopping list — shown under Previously Had.
// Every out-of-stock item lands either here or in Buy Now, so nothing is
// left stranded with no screen to reach it from.
export const isPreviouslyHad = (item) =>
  !!item && item.quantity <= 0 && !item.recurring;

// Rounds a value to the nearest OPENED_STEP and clamps it to 0..100.
export const roundPercent = (value) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }
  const rounded = Math.round(value / OPENED_STEP) * OPENED_STEP;
  return Math.max(0, Math.min(100, rounded));
};

// ----- Expiry helpers (purely in-app/visual; no notifications) -------------

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
// in two rooms is two different things (tissues by the bed and in the kitchen).
export const itemKey = (item) => `${item.room}:${normalizeName(item.name)}`;

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

// Returns a readable text color (#212121 or #FFFFFF) for a given background hex.
export const getContrastText = (hex) => {
  if (!hex || typeof hex !== "string") {
    return "#FFFFFF";
  }
  let normalized = hex.replace("#", "");
  if (normalized.length === 3) {
    normalized = normalized
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const r = parseInt(normalized.substring(0, 2), 16) / 255;
  const g = parseInt(normalized.substring(2, 4), 16) / 255;
  const b = parseInt(normalized.substring(4, 6), 16) / 255;
  const toLinear = (c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const luminance =
    0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return luminance > 0.55 ? "#212121" : "#FFFFFF";
};
