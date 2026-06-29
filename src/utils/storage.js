import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "pantrypal_items";

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
