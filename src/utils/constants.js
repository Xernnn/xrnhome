// ---------------------------------------------------------------------------
// PantryPal data model (v2) — quantity semantics (read this!)
//
//   quantity      : number  -> count of FULL, UNOPENED units you have.
//   openedPercent : number|null -> remaining percentage (0..100, in 10% steps)
//                                   of ONE currently-open unit. `null` means
//                                   nothing is currently open.
//
//   Physical total = quantity + (openedPercent != null ? 1 : 0)
//
//   Example: "2 corn cans, one is 40% left" -> quantity: 1, openedPercent: 40
//            (1 sealed/unopened can + 1 open can at 40%).
//
//   expiryDate    : string|null -> ISO date of expiry (null = no expiry set).
//   recurring     : boolean     -> show on the Shopping list when low.
//   neverRecommend: boolean     -> never suggest for shopping again.
// ---------------------------------------------------------------------------

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

export const COLORS = LIGHT_COLORS;

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

export const CATEGORIES = [
  { label: "Vegetables", icon: "carrot", color: "#4CAF50" },
  { label: "Fruits", icon: "food-apple", color: "#FF9800" },
  { label: "Meat & Seafood", icon: "food-steak", color: "#F44336" },
  { label: "Dairy", icon: "cheese", color: "#FFD54F" },
  { label: "Bakery", icon: "bread-slice", color: "#D7A86E" },
  { label: "Drinks", icon: "cup", color: "#29B6F6" },
  { label: "Frozen", icon: "snowflake", color: "#80DEEA" },
  { label: "Canned Foods", icon: "food-variant", color: "#78909C" },
  { label: "Condiments", icon: "bottle-soda", color: "#9C27B0" },
  { label: "Spices & Herbs", icon: "shaker", color: "#FF7043" },
  { label: "Grains & Pasta", icon: "grain", color: "#A1887F" },
  { label: "Snacks", icon: "cookie", color: "#FFCA28" },
  { label: "Food Cupboard", icon: "cupboard", color: "#8D6E63" },
  { label: "Dessert", icon: "cupcake", color: "#F48FB1" },
  { label: "Non Food Items", icon: "spray-bottle", color: "#90A4AE" },
  { label: "Other", icon: "dots-horizontal", color: "#BDBDBD" },
];

export const STORAGE_LOCATIONS = ["Pantry", "Fridge", "Freezer", "Counter"];

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
];

export const STORAGE_LOCATION_META = {
  Pantry: { icon: "cupboard", color: "#A1887F" },
  Fridge: { icon: "fridge", color: "#29B6F6" },
  Freezer: { icon: "snowflake", color: "#80DEEA" },
  Counter: { icon: "countertop", color: "#FF9800" },
};

export const MAX_HISTORY_ENTRIES = 20;
export const OPENED_STEP = 10;
export const ALMOST_OUT_PERCENT = 20;
export const EXPIRING_SOON_DAYS = 4;

export const getCategoryMeta = (label) =>
  CATEGORIES.find((c) => c.label === label) || CATEGORIES[CATEGORIES.length - 1];

export const getStorageMeta = (label) =>
  STORAGE_LOCATION_META[label] || { icon: "help-circle-outline", color: "#BDBDBD" };

export const categoryExists = (label) =>
  CATEGORIES.some((c) => c.label === label);

export const isTrackingOpened = (item) =>
  item &&
  item.openedPercent !== null &&
  item.openedPercent !== undefined &&
  !Number.isNaN(item.openedPercent);

export const isAlmostOut = (item) => {
  if (!item) {
    return false;
  }
  if (item.quantity > 0) {
    return false;
  }
  if (!isTrackingOpened(item)) {
    return true;
  }
  return item.openedPercent <= ALMOST_OUT_PERCENT;
};

// Total physical units = sealed units + (1 if a unit is currently open).
export const getTotalUnits = (item) =>
  (item?.quantity || 0) + (isTrackingOpened(item) ? 1 : 0);

// Human-readable breakdown used in the forms so the model is never ambiguous.
export const summarizeUnits = (quantity, unit, openedPercent) => {
  const tracking =
    openedPercent !== null && openedPercent !== undefined && !Number.isNaN(openedPercent);
  const total = (quantity || 0) + (tracking ? 1 : 0);
  const unitLabel = unit || "units";
  if (tracking) {
    return `${total} ${unitLabel} total · ${quantity} sealed + 1 open at ${openedPercent}%`;
  }
  return `${total} ${unitLabel} total · all sealed`;
};

// Rounds a value to the nearest OPENED_STEP and clamps to 0..100.
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
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
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

// ----- Color helpers --------------------------------------------------------

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
