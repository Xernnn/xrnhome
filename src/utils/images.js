import * as FileSystem from "expo-file-system/legacy";

// Picked images live in a temporary cache that the OS can purge. We copy them
// into a persistent app directory and store that stable path instead.
const IMAGE_DIR = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}pantrypal_images/`
  : null;

const ensureDir = async () => {
  if (!IMAGE_DIR) {
    return;
  }
  try {
    const info = await FileSystem.getInfoAsync(IMAGE_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(IMAGE_DIR, { intermediates: true });
    }
  } catch (e) {
    // best effort
  }
};

export const isPersistedImage = (uri) =>
  !!uri && !!IMAGE_DIR && uri.startsWith(IMAGE_DIR);

// Copies a picked image URI into persistent storage; returns the new stable URI.
export const persistImage = async (uri) => {
  if (!uri || !IMAGE_DIR) {
    return uri ?? null;
  }
  if (isPersistedImage(uri)) {
    return uri;
  }
  try {
    await ensureDir();
    const rawExt = uri.split(".").pop() || "jpg";
    const ext = rawExt.split("?")[0].slice(0, 4).replace(/[^a-zA-Z0-9]/g, "") || "jpg";
    const dest = `${IMAGE_DIR}${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.${ext}`;
    await FileSystem.copyAsync({ from: uri, to: dest });
    return dest;
  } catch (e) {
    console.error("Failed to persist image, using original URI:", e);
    return uri;
  }
};

// Best-effort delete of a persisted image (ignores anything we don't own).
export const deleteImage = async (uri) => {
  if (!isPersistedImage(uri)) {
    return;
  }
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch (e) {
    // best effort
  }
};
