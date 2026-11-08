import { Image, Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";

import { WEB_ROOT, syncAvailable } from "./homeServer";

// A card shows a photo at a few hundred pixels, and every byte also goes to the
// home server, so a 12 megapixel original isn't worth keeping.
const MAX_PHOTO_SIDE = 1280;

const IN_BROWSER = Platform.OS === "web";

// Picked images live in a temporary cache that the OS can purge. We copy them
// into a persistent app directory and store that stable path instead. A browser
// has no such folder: its photos live on the home server that served the page.
const IMAGE_DIR = IN_BROWSER
  ? `${WEB_ROOT}/photos/`
  : FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}xrnhome_images/`
  : null;

// Where photos went before the app was renamed. They stay where they are (items
// keep their full path) but still count as ours when it is time to delete them.
const LEGACY_IMAGE_DIR = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}pantrypal_images/`
  : null;

const ensureDir = async () => {
  if (!IMAGE_DIR || IN_BROWSER) {
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
  !!uri &&
  !!IMAGE_DIR &&
  (uri.startsWith(IMAGE_DIR) || uri.startsWith(LEGACY_IMAGE_DIR));

// A smaller JPEG of the picked image, or null when it's small enough already or
// can't be read that way (the original is copied as it is then).
const shrunken = async (uri) => {
  try {
    const { width, height } = await Image.getSize(uri);
    const side = Math.max(width, height);
    if (!side || side <= MAX_PHOTO_SIDE) {
      return null;
    }
    const resize =
      width >= height ? { width: MAX_PHOTO_SIDE } : { height: MAX_PHOTO_SIDE };
    const result = await ImageManipulator.manipulateAsync(uri, [{ resize }], {
      compress: 0.75,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    return result.uri;
  } catch (e) {
    return null;
  }
};

const newPhotoName = (ext) =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

const WEB_EXTENSIONS = {
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

// Sends a picked image to the home server and returns where it now lives. Throws
// when that fails, so the form stays open with the photo instead of saving an
// item whose photo exists only in this tab.
const uploadFromBrowser = async (uri) => {
  const source = (await shrunken(uri)) || uri;
  const picked = await fetch(source);
  const blob = await picked.blob();
  const name = newPhotoName(WEB_EXTENSIONS[blob.type] || "jpg");
  const res = await fetch(`${IMAGE_DIR}${name}`, {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream" },
    body: blob,
  });
  if (!res.ok) {
    throw new Error(`The home server didn't take the photo (${res.status}).`);
  }
  return `${IMAGE_DIR}${name}`;
};

// Copies a picked image URI into persistent storage, shrinking it if it's large;
// returns the new stable URI.
export const persistImage = async (uri) => {
  if (!uri || !IMAGE_DIR) {
    return uri ?? null;
  }
  if (isPersistedImage(uri)) {
    return uri;
  }
  if (IN_BROWSER) {
    return syncAvailable ? uploadFromBrowser(uri) : uri;
  }
  try {
    await ensureDir();
    const source = (await shrunken(uri)) || uri;
    const rawExt = source.split(".").pop() || "jpg";
    const ext =
      rawExt.split("?")[0].slice(0, 4).replace(/[^a-zA-Z0-9]/g, "") || "jpg";
    const dest = `${IMAGE_DIR}${newPhotoName(ext)}`;
    await FileSystem.copyAsync({ from: source, to: dest });
    return dest;
  } catch (e) {
    console.error("Failed to persist image, using original URI:", e);
    return uri;
  }
};

// A name from the server's copy is untrusted: it becomes a path on this phone.
export const isSafePhotoName = (name) =>
  typeof name === "string" &&
  /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(name) &&
  !name.includes("..");

// A photo's file name, which is how the home server knows it. Only for files in
// our own folders; anything else isn't ours to send.
export const photoFileName = (uri) => {
  const name = isPersistedImage(uri) ? uri.split("/").pop() : null;
  return isSafePhotoName(name) ? name : null;
};

// Where a photo with this name lives on this phone (null on web).
export const photoPath = (name) =>
  IMAGE_DIR && isSafePhotoName(name) ? `${IMAGE_DIR}${name}` : null;

export const ensureImageDir = ensureDir;

// Best-effort delete of a persisted image (ignores anything we don't own). The
// server sweeps its own photos once no kept copy names them.
export const deleteImage = async (uri) => {
  if (IN_BROWSER || !isPersistedImage(uri)) {
    return;
  }
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch (e) {
    // best effort
  }
};
