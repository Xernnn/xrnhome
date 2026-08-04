import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "pantrypal_items";
const SCHEMA_VERSION_KEY = "pantrypal_schema_version";

// v1: quantity counted sealed units only, opened unit tracked separately.
// v2: quantity is the total and includes the opened unit.
export const CURRENT_SCHEMA_VERSION = 2;

export const loadItems = async () => {
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
