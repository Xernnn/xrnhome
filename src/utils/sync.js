// Keeping this device and the home server's copy of the inventory level. The
// phone and the laptop both write: each sends all its items (and, from the phone,
// any photo the server hasn't got yet). The server only takes a write made on top
// of the copy the device last saw (If-Match). So a device that loses that race
// fetches what's there, merges it into its own items (mergeCopies) and tries
// again, and a phone that never synced, or was reinstalled, can't wipe what's
// there: it has to restore it, merge with it, or say on purpose that its own
// items replace it.
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";

import {
  ServerError,
  authHeaders,
  call,
  errorFrom,
  etagVersion,
  failureText,
} from "./homeServer";
import { canonical } from "./inventoryLogic";
import { CURRENT_SCHEMA_VERSION } from "./storage";
import {
  ensureImageDir,
  isSafePhotoName,
  photoFileName,
  photoPath,
} from "./images";

const META_KEY = "xrnhome_sync_meta";
// The server copy `version` names, in this device's own shape: what a merge
// compares both sides against to tell who changed what.
const BASE_KEY = "xrnhome_sync_base";
// A photo that takes longer than this isn't coming. Without a limit a dead
// connection would leave the app saying "Syncing…" for good.
const PHOTO_TIMEOUT_MS = 90000;

const withinTime = (work, ms = PHOTO_TIMEOUT_MS) => {
  let timer;
  const expired = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new ServerError(0, failureText(0))), ms);
  });
  return Promise.race([work, expired]).finally(() => clearTimeout(timer));
};

// { version: the server copy this phone's items match, or null; syncedAt;
//   hash: of the items that copy holds, so an unchanged list isn't sent again }.
export async function loadSyncMeta() {
  try {
    const raw = await AsyncStorage.getItem(META_KEY);
    const meta = raw ? JSON.parse(raw) : null;
    return {
      version: Number.isFinite(meta?.version) ? meta.version : null,
      syncedAt: typeof meta?.syncedAt === "string" ? meta.syncedAt : null,
      hash: typeof meta?.hash === "string" ? meta.hash : null,
    };
  } catch (error) {
    return { version: null, syncedAt: null, hash: null };
  }
}

export async function saveSyncMeta(meta) {
  try {
    await AsyncStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch (error) {
    console.error("Failed to save the sync state:", error);
  }
}

// { items, categories }, or null: a merge without one keeps everything.
export async function loadSyncBase() {
  try {
    const raw = await AsyncStorage.getItem(BASE_KEY);
    const base = raw ? JSON.parse(raw) : null;
    return Array.isArray(base?.items) ? base : null;
  } catch (error) {
    return null;
  }
}

// Saved as one, so the version never names a different copy from the base.
export async function saveSyncState(meta, base) {
  try {
    await AsyncStorage.multiSet([
      [META_KEY, JSON.stringify(meta)],
      [BASE_KEY, JSON.stringify(base)],
    ]);
  } catch (error) {
    console.error("Failed to save the sync state:", error);
  }
}

export async function clearSyncMeta() {
  try {
    await AsyncStorage.multiRemove([META_KEY, BASE_KEY]);
  } catch (error) {
    // nothing to forget
  }
}

const forServer = (items) =>
  items.map(({ imageUri, ...rest }) => ({
    ...rest,
    photo: photoFileName(imageUri),
  }));

export const categoryList = (categories) =>
  (categories || []).map(({ label, room }) => ({ label, room }));

// The backup file's shape, with each photo named by its file instead of this
// phone's path to it.
export const snapshot = (items, categories) => ({
  app: "xrnhome",
  schemaVersion: CURRENT_SCHEMA_VERSION,
  savedAt: new Date().toISOString(),
  categories: categoryList(categories),
  items: forServer(items),
});

// A short fingerprint of what would be sent (FNV-1a over the JSON). The order of
// the list and of an item's fields don't count: two devices that hold the same
// items would otherwise each keep sending them to the other.
export const itemsHash = (items, categories) => {
  const byId = (a, b) => String(a.id).localeCompare(String(b.id));
  const text = JSON.stringify(
    canonical([[...forServer(items)].sort(byId), categoryList(categories)])
  );
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${text.length}-${(h >>> 0).toString(16)}`;
};

async function uploadPhotos(server, items) {
  const res = await call(server, "/photos");
  if (!res.ok) {
    throw errorFrom(res);
  }
  const have = new Set(await res.json());
  for (const item of items) {
    const name = photoFileName(item.imageUri);
    if (!name || have.has(name)) {
      continue;
    }
    const info = await FileSystem.getInfoAsync(item.imageUri);
    if (!info.exists) {
      continue;
    }
    let up;
    try {
      up = await withinTime(
        FileSystem.uploadAsync(`${server.url}/photos/${name}`, item.imageUri, {
          httpMethod: "PUT",
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          headers: { ...authHeaders(server), "Content-Type": "application/octet-stream" },
        })
      );
    } catch (error) {
      throw new ServerError(0, failureText(0));
    }
    // A photo the server won't take (too big, say) stays off it; the items still go.
    if (up.status === 400 || up.status === 413) {
      console.warn(`The home server didn't take photo ${name} (${up.status}).`);
      continue;
    }
    if (up.status < 200 || up.status >= 300) {
      throw new ServerError(up.status, failureText(up.status));
    }
    have.add(name);
  }
}

// Sends this phone's items on top of server copy `base` (null: this phone
// never synced, which only goes through while the server is empty; "*":
// replace whatever is there). Returns { version, hash } or { conflict: true }.
export async function pushItems(server, items, base, categories) {
  // A browser's photos went to the server the moment they were picked.
  if (!server.browser) {
    await uploadPhotos(server, items);
  }
  const res = await call(server, "/state", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "If-Match": base === "*" ? "*" : `"${base ?? 0}"`,
    },
    body: JSON.stringify(snapshot(items, categories)),
    timeoutMs: 60000,
  });
  if (res.status === 412) {
    return { conflict: true };
  }
  if (!res.ok) {
    throw errorFrom(res);
  }
  return {
    version: etagVersion(res.headers.get("ETag")),
    hash: itemsHash(items, categories),
    count: items.length,
  };
}

// The server's copy: { version (0 when it has none), items, categories,
// schemaVersion, savedAt }. The body is the snapshot; the version comes in the
// ETag. With `known`, returns null if that's still the version it holds, which
// costs next to nothing and so can be asked often.
export async function fetchServerCopy(server, known) {
  const res = await call(server, "/state", {
    timeoutMs: 60000,
    headers: Number.isFinite(known) ? { "If-None-Match": `"${known}"` } : {},
  });
  if (res.status === 304) {
    return null;
  }
  if (!res.ok) {
    throw errorFrom(res);
  }
  const data = await res.json();
  const doc = data && typeof data === "object" ? data : {};
  return {
    version: etagVersion(res.headers.get("ETag")) ?? 0,
    items: Array.isArray(doc.items) ? doc.items : [],
    categories: Array.isArray(doc.categories) ? doc.categories : null,
    schemaVersion: Number.isFinite(doc.schemaVersion) ? doc.schemaVersion : 1,
    savedAt:
      typeof doc.savedAt === "string" ? doc.savedAt : res.headers.get("X-Updated") || null,
  };
}

// Fetches one photo, through a temporary name so that a download cut short
// never passes for the photo. Returns false when the server doesn't have it.
async function fetchPhoto(server, name, path) {
  const part = `${path}.part`;
  let got;
  try {
    got = await withinTime(
      FileSystem.downloadAsync(`${server.url}/photos/${name}`, part, {
        headers: authHeaders(server),
      })
    );
  } catch (error) {
    await FileSystem.deleteAsync(part, { idempotent: true }).catch(() => {});
    throw new ServerError(0, failureText(0));
  }
  if (got.status === 404) {
    await FileSystem.deleteAsync(part, { idempotent: true }).catch(() => {});
    return false;
  }
  if (got.status !== 200) {
    await FileSystem.deleteAsync(part, { idempotent: true }).catch(() => {});
    throw new ServerError(got.status, failureText(got.status));
  }
  await FileSystem.moveAsync({ from: part, to: path });
  return true;
}

// Fetches the photos the server copy's items name and points each item at its
// local file. Returns { items, missing }, where `missing` counts photos the
// server doesn't have. Throws if a photo it does have can't be fetched, before
// anything on the phone has changed: going on would leave those items without
// their photo, and the next sync would tell the server to forget it too. What
// did download stays in the folder, so trying again picks up where this stopped.
export async function withLocalPhotos(server, items) {
  // A browser shows them straight from the server.
  if (server.browser) {
    return {
      items: (items || []).map(({ photo, ...rest }) => ({
        ...rest,
        imageUri: photoPath(photo),
      })),
      missing: 0,
    };
  }
  await ensureImageDir();
  const out = [];
  let missing = 0;
  for (const item of items) {
    const { photo, ...rest } = item || {};
    const path = isSafePhotoName(photo) ? photoPath(photo) : null;
    if (!path) {
      out.push({ ...rest, imageUri: null });
      continue;
    }
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists && !(await fetchPhoto(server, photo, path))) {
      missing += 1;
      out.push({ ...rest, imageUri: null });
      continue;
    }
    out.push({ ...rest, imageUri: path });
  }
  return { items: out, missing };
}
