import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "xrnhome_items";
const SCHEMA_VERSION_KEY = "xrnhome_schema_version";
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

export const loadItems = async () => {
  await moveLegacyKeys();
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw == null) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed;
  } catch (error) {
    console.error("Failed to load items from AsyncStorage:", error);
    return [];
  }
};

export const saveItems = async (items) => {
  try {
    const payload = JSON.stringify(Array.isArray(items) ? items : []);
    await AsyncStorage.setItem(STORAGE_KEY, payload);
    return true;
  } catch (error) {
    console.error("Failed to save items to AsyncStorage:", error);
    return false;
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
