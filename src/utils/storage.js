import AsyncStorage from "@react-native-async-storage/async-storage";

import { salvageItems } from "./inventoryLogic";

const STORAGE_KEY = "xrnhome_items";
const SCHEMA_VERSION_KEY = "xrnhome_schema_version";
// A copy of the items from the last launch that read them fine, for the day the
// main copy can't be read.
const SAFE_COPY_KEY = "xrnhome_items_safe";
// The unreadable text itself. Kept, never overwritten, so it can still be looked
// at by hand.
const DAMAGED_KEY = "xrnhome_items_damaged";
// There from the launch that had to recover the items until the person has dealt
// with what came back. The recovered list is saved over the main copy at once, so
// that what's done next isn't lost too; without this the next launch would read
// it as whole, and the next sync would tell the other devices that the items it's
// missing were deleted.
const RECOVERED_KEY = "xrnhome_items_recovered";
const CATEGORIES_KEY = "xrnhome_categories";
const CART_KEY = "xrnhome_cart";
const REMINDERS_KEY = "xrnhome_reminders";
const PACK_COLOURS_KEY = "xrnhome_pack_colours";
export const THEME_KEY = "xrnhome_theme_mode";

// The app used to be called PantryPal. Whatever it saved under the old keys
// moves to the new ones the first time the renamed app starts.
const LEGACY_KEYS = {
  pantrypal_items: STORAGE_KEY,
  pantrypal_schema_version: SCHEMA_VERSION_KEY,
  pantrypal_theme_mode: THEME_KEY,
};

let legacyMove = null;

// Runs once per launch; every loader awaits it before reading.
export const moveLegacyKeys = () => {
  if (!legacyMove) {
    legacyMove = (async () => {
      try {
        const oldKeys = Object.keys(LEGACY_KEYS);
        const found = await AsyncStorage.multiGet([
          ...oldKeys,
          ...Object.values(LEGACY_KEYS),
        ]);
        const values = Object.fromEntries(found);
        const toCopy = oldKeys
          .filter(
            (key) => values[key] != null && values[LEGACY_KEYS[key]] == null
          )
          .map((key) => [LEGACY_KEYS[key], values[key]]);
        if (toCopy.length > 0) {
          await AsyncStorage.multiSet(toCopy);
        }
        const toRemove = oldKeys.filter((key) => values[key] != null);
        if (toRemove.length > 0) {
          await AsyncStorage.multiRemove(toRemove);
        }
      } catch (error) {
        console.error("Failed to move data from the old storage keys:", error);
      }
    })();
  }
  return legacyMove;
};

// v1: quantity counted sealed units only, opened unit tracked separately.
// v2: quantity is the total and includes the opened unit.
export const CURRENT_SCHEMA_VERSION = 2;

const readSafeCopy = async () => {
  try {
    const parsed = JSON.parse(await AsyncStorage.getItem(SAFE_COPY_KEY));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
};

// Whether a recovered list is still waiting for the person. When that can't be
// read it counts as yes: asking once too often costs a tap, not the items.
const stillRecovered = async () => {
  try {
    return (await AsyncStorage.getItem(RECOVERED_KEY)) != null;
  } catch (error) {
    return true;
  }
};

const markRecovered = async () => {
  try {
    await AsyncStorage.setItem(RECOVERED_KEY, new Date().toISOString());
  } catch (error) {
    console.error("Failed to note that the items were recovered:", error);
  }
};

// The person has dealt with the recovered list: kept it, or put other items in
// its place.
export const clearRecoveredMark = async () => {
  try {
    await AsyncStorage.removeItem(RECOVERED_KEY);
  } catch (error) {
    console.error("Failed to clear the recovered-items note:", error);
  }
};

// { status, items }. "ok": read fine (or there's nothing saved yet). "recovered":
// the saved list was damaged, on this launch or on one since which nobody has
// dealt with it, and `items` is as much of it as could be got back.
// "unreadable": nothing could be read, which says nothing about what's saved, so
// the caller must not write over it.
export const loadItems = async () => {
  await moveLegacyKeys();
  let raw;
  try {
    raw = await AsyncStorage.getItem(STORAGE_KEY);
  } catch (error) {
    console.error("Failed to load items from AsyncStorage:", error);
    return { status: "unreadable", items: [] };
  }
  if (raw == null) {
    return { status: "ok", items: [] };
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return { status: (await stillRecovered()) ? "recovered" : "ok", items: parsed };
    }
  } catch (error) {
    console.error("The saved items are damaged:", error);
  }

  try {
    if ((await AsyncStorage.getItem(DAMAGED_KEY)) == null) {
      await AsyncStorage.setItem(DAMAGED_KEY, raw);
    }
  } catch (error) {
    console.error("Failed to keep the damaged items:", error);
  }
  const salvaged = salvageItems(raw);
  const safe = await readSafeCopy();
  const items = safe.length > salvaged.length ? safe : salvaged;
  if (items.length === 0) {
    return { status: "unreadable", items: [] };
  }
  // Before the caller can save the recovered list over the damaged one.
  await markRecovered();
  return { status: "recovered", items };
};

// The items as saveItems saves them, for saving them in one go with something else.
export const itemsEntry = (items) => [
  STORAGE_KEY,
  JSON.stringify(Array.isArray(items) ? items : []),
];

export const saveItems = async (items) => {
  try {
    await AsyncStorage.setItem(...itemsEntry(items));
    return true;
  } catch (error) {
    console.error("Failed to save items to AsyncStorage:", error);
    return false;
  }
};

export const saveSafeCopy = async (items) => {
  try {
    await AsyncStorage.setItem(SAFE_COPY_KEY, JSON.stringify(items));
  } catch (error) {
    console.error("Failed to save the safe copy of the items:", error);
  }
};

export const loadSchemaVersion = async () => {
  await moveLegacyKeys();
  try {
    const raw = await AsyncStorage.getItem(SCHEMA_VERSION_KEY);
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : 1;
  } catch (error) {
    console.error("Failed to load schema version from AsyncStorage:", error);
    return 1;
  }
};

export const saveSchemaVersion = async (version) => {
  try {
    await AsyncStorage.setItem(SCHEMA_VERSION_KEY, String(version));
    return true;
  } catch (error) {
    console.error("Failed to save schema version to AsyncStorage:", error);
    return false;
  }
};

const readJson = async (key, fallback) => {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
};

const writeJson = async (key, value) => {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Failed to save ${key}:`, error);
  }
};

export const loadCategories = () => readJson(CATEGORIES_KEY, []);
export const saveCategories = (list) => writeJson(CATEGORIES_KEY, list);

// { photo file name: colour found in it, or null }, see packColourCache.js.
export const loadPackColours = () => readJson(PACK_COLOURS_KEY, {});
export const savePackColours = (colours) => writeJson(PACK_COLOURS_KEY, colours);

// { at, entries: { itemId: { count, before } } }, the trip in progress.
export const loadCart = () => readJson(CART_KEY, null);
export const saveCart = (cart) => writeJson(CART_KEY, cart);

// true, false, or null while the person hasn't been asked.
export const loadRemindersSetting = () => readJson(REMINDERS_KEY, null);
export const saveRemindersSetting = (value) => writeJson(REMINDERS_KEY, value);
