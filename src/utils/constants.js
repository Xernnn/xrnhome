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
  { label: "Other", icon: "dots-horizontal", color: "#BDBDBD" },
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
];

export const MAX_HISTORY_ENTRIES = 20;
export const OPENED_STEP = 10;
export const ALMOST_OUT_PERCENT = 20;

export const getCategoryMeta = (label) =>
  CATEGORIES.find((c) => c.label === label) || CATEGORIES[CATEGORIES.length - 1];

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
  if (item.quantity <= 0) {
    return true;
  }
  // On the last unit, a nearly-empty open one still counts as running out.
  if (item.quantity === 1 && isTrackingOpened(item)) {
    return item.openedPercent <= ALMOST_OUT_PERCENT;
  }
  return false;
};

// Items with stock show in My Kitchen.
export const isInKitchen = (item) => !!item && item.quantity > 0;

// Ran out and not on the shopping list — shown under Previously Had.
// Every out-of-stock item lands either here or in Buy Now, so nothing is
// left stranded with no screen to reach it from.
export const isPreviouslyHad = (item) =>
  !!item && item.quantity <= 0 && !item.recurring;

// Key used to decide whether two entries describe the same item.
export const normalizeName = (name) =>
  typeof name === "string" ? name.trim().toLowerCase() : "";

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
