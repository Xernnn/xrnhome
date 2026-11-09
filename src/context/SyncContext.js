// The home server, seen from the app: whether one is connected, how the last
// sync went, and whether a newer build is waiting. Changes go up on their own
// a few seconds after they settle, and right away when the app is put away, and
// the other device's come down while the app is open. Updates are looked for
// when the app opens and every few hours after; one
// that's found downloads by itself on Wi-Fi and then asks to be installed; on
// mobile data it waits to be asked.
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Alert, AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useInventory } from "./InventoryContext";
import {
  ServerError,
  call,
  clearServer,
  deviceName,
  failureText,
  isValidUrl,
  loadServer,
  normalizeUrl,
  saveServer,
  syncAvailable,
} from "../utils/homeServer";
import {
  categoryList,
  clearSyncMeta,
  fetchServerCopy,
  itemsHash,
  loadSyncBase,
  loadSyncMeta,
  pushItems,
  saveSyncMeta,
  saveSyncState,
  withLocalPhotos,
} from "../utils/sync";
import {
  mergeCategories,
  mergeCopies,
  prepareItems,
  tooManyGone,
} from "../utils/inventoryLogic";
import { CURRENT_SCHEMA_VERSION, saveItems } from "../utils/storage";
import {
  clearOldDownloads,
  downloadRelease,
  fetchRelease,
  installedBuild,
  onMobileData,
  openInstaller,
  updatesSupported,
} from "../utils/updates";

const PUSH_DELAY_MS = 15000;
const CHECK_EVERY_MS = 30000; // for the other device's changes, while the app is open
// Rounds of "fetch, merge, send" before giving up until the next check: more than
// that means the other device is writing just as fast.
const MAX_ROUNDS = 5;
const UPDATE_EVERY_MS = 6 * 3600 * 1000;
const ASKED_KEY = "xrnhome_update_asked"; // the build we last offered to install

const SyncContext = createContext(null);

const messageOf = (error) =>
  error instanceof ServerError ? error.message : error?.message || failureText(0);

const ago = (iso) => {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "";
  const min = Math.round(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString();
};

// One line on how syncing is going, for Settings.
export const describeSync = (status, meta) => {
  switch (status.state) {
    case "off":
      return "Not connected";
    case "syncing":
      return "Syncing…";
    case "error":
      return status.message || "Couldn't sync";
    case "conflict":
      return "Waiting for you to pick a copy";
    default:
      return meta && meta.syncedAt ? `Synced ${ago(meta.syncedAt)}` : "Connected";
  }
};

export function SyncProvider({ children }) {
  const {
    items,
    categories,
    problem,
    replaceAllItems,
    mergeServerItems,
    applyCategories,
    clearProblem,
  } = useInventory();
  const [server, setServer] = useState(null);
  const [ready, setReady] = useState(false);
  const [meta, setMeta] = useState({ version: null, syncedAt: null, hash: null });
  // off | idle | syncing | error | conflict. A conflict has a `reason`: "other"
  // (the server holds a copy this device isn't built on), "empty" (this device has
  // no items left but the server does), "damaged" (this device's list had to be
  // recovered, so it may be short) or "shrink" (merging would take away most of
  // the items here). None of them send anything until the person picks.
  const [status, setStatus] = useState({ state: "off" });
  // idle | checking | none | available | downloading | ready | error
  const [update, setUpdate] = useState({ state: "idle" });

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const categoriesRef = useRef(categories);
  categoriesRef.current = categories;
  const problemRef = useRef(problem);
  problemRef.current = problem;
  const serverRef = useRef(server);
  serverRef.current = server;
  const metaRef = useRef(meta);
  metaRef.current = meta;
  // The server copy `meta.version` names: { items, categories }, or null.
  const baseRef = useRef(null);
  const statusRef = useRef(status);
  statusRef.current = status;
  const timer = useRef(null);
  const restoreRef = useRef(null);
  const pushing = useRef(false);
  const again = useRef(false);
  const skipNext = useRef(false);
  const lastUpdateCheck = useRef(0);
  const updateBusy = useRef(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [saved, savedMeta, savedBase] = await Promise.all([
        loadServer(),
        loadSyncMeta(),
        loadSyncBase(),
      ]);
      if (!mounted) return;
      baseRef.current = savedBase;
      setServer(saved);
      setMeta(savedMeta);
      setStatus({ state: saved ? "idle" : "off" });
      setReady(true);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const storeMeta = useCallback((next) => {
    setMeta(next);
    saveSyncMeta(next);
  }, []);

  // What this device now stands on. The refs change at once, not on the next
  // render, because the round that called this reads them straight after.
  const storeSynced = useCallback(async (next, base) => {
    metaRef.current = next;
    baseRef.current = base;
    setMeta(next);
    await saveSyncState(next, base);
  }, []);

  // The server has a copy this device's items aren't built on: say what it holds.
  const enterConflict = useCallback(async (target, reason = "other") => {
    try {
      const copy = await fetchServerCopy(target);
      setStatus({
        state: "conflict",
        reason,
        serverCount: copy.items.length,
        serverSavedAt: copy.savedAt,
      });
    } catch (error) {
      setStatus((prev) => ({ ...prev, state: "conflict", reason }));
    }
  }, []);

  // A question waiting for the person stays true to what the server holds now,
  // because the choices it offers depend on that. Only ever updates the counts:
  // an answer given while this was on its way stands.
  const refreshConflict = useCallback(async (target) => {
    try {
      const copy = await fetchServerCopy(target);
      setStatus((prev) =>
        prev.state === "conflict"
          ? { ...prev, serverCount: copy.items.length, serverSavedAt: copy.savedAt }
          : prev
      );
    } catch (error) {
      // Offline: what's on screen is the best there is.
    }
  }, []);

  // Merges the server's copy into this device's items. Returns false if it didn't
  // because that's for the person to decide (the status says so by then).
  //
  // From here on this device stands on `copy`, whether or not sending the merged
  // list then works. Otherwise a retry would merge the same changes a second time,
  // and quantities, which add up, would count them twice. For the same reason the
  // merged items are saved before the new base: dying between the two then only
  // means merging again, never reading the other side's changes as undone here.
  const takeServerCopy = useCallback(
    async (target, copy) => {
      const known = metaRef.current;
      const mine = itemsRef.current;
      const refuse = (reason) =>
        setStatus({
          state: "conflict",
          reason,
          serverCount: copy.items.length,
          serverSavedAt: copy.savedAt,
        });
      // A copy older than the one this device saw, or an empty one, isn't anyone
      // editing. The server was reset or put back, and that's not to be followed.
      if (
        (known.version !== null && copy.version < known.version) ||
        (copy.items.length === 0 && mine.length > 0)
      ) {
        refuse("other");
        return false;
      }
      setStatus((prev) => ({ ...prev, state: "syncing" }));
      const { items: withPhotos } = await withLocalPhotos(target, copy.items);
      const base = baseRef.current;
      const mineCategories = categoryList(categoriesRef.current);
      const theirCategories = copy.categories
        ? categoryList(copy.categories)
        : mineCategories;
      const nextCategories = mergeCategories(
        base?.categories,
        mineCategories,
        theirCategories
      );
      // First: an item in a category that isn't known yet would be filed under Other.
      const nextList = applyCategories(nextCategories);
      const theirs = prepareItems(
        withPhotos,
        copy.schemaVersion < CURRENT_SCHEMA_VERSION
      );
      const merged = mergeCopies(base?.items, mine, theirs);
      if (tooManyGone(mine, merged)) {
        refuse("shrink");
        return false;
      }
      await saveItems(merged);
      mergeServerItems(base?.items, theirs);
      itemsRef.current = merged;
      categoriesRef.current = nextList;
      await storeSynced(
        {
          version: copy.version,
          syncedAt: new Date().toISOString(),
          hash: itemsHash(theirs, theirCategories),
        },
        { items: theirs, categories: theirCategories }
      );
      return true;
    },
    [applyCategories, mergeServerItems, storeSynced]
  );

  // Brings this device and the server level: takes whatever the server has that's
  // new, then sends whatever this device has that's new, and starts over if
  // another device got its write in first.
  const exchange = useCallback(
    async (target) => {
      for (let round = 0; round < MAX_ROUNDS; round += 1) {
        const copy = await fetchServerCopy(target, metaRef.current.version);
        if (copy && !(await takeServerCopy(target, copy))) {
          return;
        }
        const list = itemsRef.current;
        const own = categoryList(categoriesRef.current);
        const hash = itemsHash(list, own);
        if (metaRef.current.hash === hash) {
          if (!baseRef.current) {
            await storeSynced(metaRef.current, { items: list, categories: own });
          }
          const syncedAt = new Date().toISOString();
          metaRef.current = { ...metaRef.current, syncedAt };
          setMeta(metaRef.current);
          setStatus((prev) => (prev.state === "idle" ? prev : { state: "idle" }));
          return;
        }
        setStatus((prev) => ({ ...prev, state: "syncing" }));
        const result = await pushItems(target, list, metaRef.current.version, own);
        if (!result.conflict) {
          await storeSynced(
            {
              version: result.version,
              syncedAt: new Date().toISOString(),
              hash: result.hash,
            },
            { items: list, categories: own }
          );
          setStatus({ state: "idle" });
          return;
        }
      }
      throw new Error("The other device keeps changing things. Trying again soon.");
    },
    [storeSynced, takeServerCopy]
  );

  // `base`: nothing for a routine sync, null to send this device's items as a
  // first sync, "*" to replace the server's copy, "merge" to keep both sides.
  const push = useCallback(
    async (base) => {
      const target = serverRef.current;
      if (!target) return;
      if (base === undefined && statusRef.current.state === "conflict") return;
      if (pushing.current) {
        again.current = true;
        return;
      }
      const replacing = base === "*";
      // A list that had to be recovered may be missing items. It doesn't go over
      // the server's copy unless the person says so.
      if (problemRef.current && !replacing) {
        await enterConflict(target, "damaged");
        return;
      }
      // Nothing that merely happened to this phone may empty the server's copy:
      // losing everything at once looks just like deleting everything.
      if (itemsRef.current.length === 0 && !replacing) {
        try {
          const copy = await fetchServerCopy(target);
          const fresh = metaRef.current.version === null;
          if (fresh && target.browser && copy.items.length > 0) {
            // A browser opening for the first time has nothing of its own to lose.
            await restoreRef.current();
            return;
          }
          setStatus(
            copy.items.length === 0
              ? { state: "idle" }
              : {
                  state: "conflict",
                  // Never synced: a new or reinstalled phone, come to restore.
                  reason: fresh ? "other" : "empty",
                  serverCount: copy.items.length,
                  serverSavedAt: copy.savedAt,
                }
          );
        } catch (error) {
          setStatus({ state: "error", message: messageOf(error) });
        }
        return;
      }
      pushing.current = true;
      try {
        if (base === "merge" || (base === undefined && metaRef.current.version !== null)) {
          await exchange(target);
          return;
        }
        setStatus((prev) => ({ ...prev, state: "syncing" }));
        const list = itemsRef.current;
        const own = categoryList(categoriesRef.current);
        const result = await pushItems(
          target,
          list,
          base !== undefined ? base : metaRef.current.version,
          own
        );
        if (result.conflict) {
          again.current = false;
          await enterConflict(target);
          return;
        }
        await storeSynced(
          {
            version: result.version,
            syncedAt: new Date().toISOString(),
            hash: result.hash,
          },
          { items: list, categories: own }
        );
        setStatus({ state: "idle" });
        if (replacing && problemRef.current) {
          clearProblem();
        }
      } catch (error) {
        setStatus({ state: "error", message: messageOf(error) });
      } finally {
        pushing.current = false;
        if (again.current) {
          again.current = false;
          push();
        }
      }
    },
    [clearProblem, enterConflict, exchange, storeSynced]
  );

  const schedulePush = useCallback(
    (delay = PUSH_DELAY_MS) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        push();
      }, delay);
    },
    [push]
  );

  // Every change to the items, once they've been still for a moment.
  useEffect(() => {
    if (!ready || !server) return;
    const current = statusRef.current;
    if (current.state === "conflict") {
      // Items are back, so "this phone is empty" no longer stands in the way.
      if (current.reason === "empty" && items.length > 0) {
        setStatus({ state: "idle" });
        schedulePush();
      }
      return;
    }
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    schedulePush();
  }, [items, categories, ready, server, schedulePush]);

  // A damaged list on a connected phone: ask before anything else happens.
  useEffect(() => {
    if (ready && server && problem) {
      enterConflict(server, "damaged");
    }
  }, [ready, server, problem, enterConflict]);

  // --- updates -------------------------------------------------------------

  const offerInstall = useCallback(async (info, file) => {
    try {
      const asked = Number(await AsyncStorage.getItem(ASKED_KEY));
      if (asked === info.versionCode) return;
      await AsyncStorage.setItem(ASKED_KEY, String(info.versionCode));
    } catch (error) {
      // ask anyway
    }
    Alert.alert(
      "Update ready",
      `xrnhome ${info.versionName || ""} (build ${info.versionCode}) has downloaded. Install it now?`,
      [
        { text: "Later", style: "cancel" },
        { text: "Install", onPress: () => openInstaller(file).catch(() => {}) },
      ]
    );
  }, []);

  const checkForUpdate = useCallback(
    async ({ manual = false } = {}) => {
      const target = serverRef.current;
      if (!target || !updatesSupported || updateBusy.current) return;
      updateBusy.current = true;
      lastUpdateCheck.current = Date.now();
      setUpdate({ state: "checking" });
      try {
        const info = await fetchRelease(target);
        if (!info || info.versionCode <= installedBuild()) {
          setUpdate({ state: "none", checkedAt: new Date().toISOString() });
          clearOldDownloads();
          return;
        }
        // An update runs to tens of megabytes, which isn't for the phone to spend
        // on its own on mobile data.
        if (!manual && (await onMobileData())) {
          setUpdate({ state: "available", info });
          return;
        }
        setUpdate({ state: "downloading", info, progress: 0 });
        const file = await downloadRelease(target, info, (progress) =>
          setUpdate({ state: "downloading", info, progress })
        );
        setUpdate({ state: "ready", info, file });
        if (manual) {
          await openInstaller(file);
        } else {
          offerInstall(info, file);
        }
      } catch (error) {
        setUpdate({ state: "error", message: messageOf(error) });
      } finally {
        updateBusy.current = false;
      }
    },
    [offerInstall]
  );

  const installUpdate = useCallback(async () => {
    if (update.state === "ready") {
      try {
        await openInstaller(update.file);
      } catch (error) {
        setUpdate({ state: "error", message: messageOf(error) });
      }
    } else {
      checkForUpdate({ manual: true });
    }
  }, [update, checkForUpdate]);

  // On open, and when the app comes back after a while.
  useEffect(() => {
    if (!ready || !server || !updatesSupported) return undefined;
    const first = setTimeout(() => checkForUpdate(), 4000);
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active" && Date.now() - lastUpdateCheck.current > UPDATE_EVERY_MS) {
        checkForUpdate();
      }
    });
    return () => {
      clearTimeout(first);
      sub.remove();
    };
  }, [ready, server, checkForUpdate]);

  // The other device's changes: on opening, on coming back, and every so often
  // while the app is in front. An unchanged server answers in a few bytes. A
  // change still waiting to go up goes as soon as the app is put away, on every
  // platform: a laptop's lid can shut before the delay is up, and its photo is on
  // the server already, unnamed, until the item that names it gets there.
  useEffect(() => {
    if (!ready || !server) return undefined;
    const check = () => {
      if (AppState.currentState !== "active") return;
      if (statusRef.current.state === "conflict") {
        refreshConflict(serverRef.current);
      } else {
        push();
      }
    };
    const first = setTimeout(check, 1000);
    const every = setInterval(check, CHECK_EVERY_MS);
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        check();
      } else if (next === "background" && timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        push();
      }
    });
    return () => {
      clearTimeout(first);
      clearInterval(every);
      sub.remove();
    };
  }, [ready, server, push, refreshConflict]);

  // --- what Settings does ----------------------------------------------------

  // Checks the login, saves it, and makes the first sync: straight up when the
  // server is empty, else it stops and asks (restore, or replace).
  const connect = useCallback(
    async ({ url, user, password }) => {
      const target = { url: normalizeUrl(url), user: user.trim(), password };
      if (!isValidUrl(target.url)) {
        throw new Error("The address has to start with https://");
      }
      if (!target.user || !target.password) {
        throw new Error("Enter the user name and the password.");
      }
      const res = await call(target, "/state");
      if (!res.ok) {
        throw new ServerError(res.status, failureText(res.status));
      }
      if (res.status === 200 && !res.headers.get("ETag")) {
        throw new Error("That address answers, but it isn't an xrnhome server.");
      }
      await saveServer(target);
      const fresh = { version: null, syncedAt: null, hash: null };
      storeMeta(fresh);
      metaRef.current = fresh;
      baseRef.current = null;
      serverRef.current = target;
      // The push below is the first sync; the change of server needn't add one.
      skipNext.current = true;
      setServer(target);
      setStatus({ state: "idle" });
      await push(null);
    },
    [push, storeMeta]
  );

  const disconnect = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    await clearServer();
    await clearSyncMeta();
    baseRef.current = null;
    setServer(null);
    setMeta({ version: null, syncedAt: null, hash: null });
    setStatus({ state: "off" });
    setUpdate({ state: "idle" });
  }, []);

  const syncNow = useCallback(() => push(), [push]);

  // Keeps everything from both sides, for a device whose items aren't built on the
  // server's copy (a phone connecting with items of its own, say). With no base,
  // nothing can be read as deleted, so nothing goes.
  const keepBoth = useCallback(async () => {
    metaRef.current = { ...metaRef.current, version: null, hash: null };
    baseRef.current = null;
    setStatus({ state: "idle" });
    statusRef.current = { state: "idle" };
    await push("merge");
  }, [push]);

  // Puts the server's copy on this device, photos and all, in place of what's
  // here. All or nothing: the photos come first, and the items are only swapped
  // once they're all here. Returns { count, missing }.
  const restore = useCallback(async () => {
    const target = serverRef.current;
    if (!target) return { count: 0, missing: 0 };
    const before = statusRef.current;
    setStatus((prev) => ({ ...prev, state: "syncing" }));
    let copy;
    try {
      copy = await fetchServerCopy(target);
    } catch (error) {
      setStatus({ state: "error", message: messageOf(error) });
      throw error;
    }
    // An empty copy would only empty this device.
    if (copy.items.length === 0) {
      setStatus(before);
      throw new Error("The home server has no items to restore.");
    }
    try {
      const local = await withLocalPhotos(target, copy.items);
      skipNext.current = true;
      const count = replaceAllItems(local.items, copy.schemaVersion, copy.categories);
      const restored = prepareItems(
        local.items,
        copy.schemaVersion < CURRENT_SCHEMA_VERSION
      );
      const own = categoryList(copy.categories);
      await storeSynced(
        {
          version: copy.version,
          syncedAt: new Date().toISOString(),
          hash: itemsHash(restored, own),
        },
        { items: restored, categories: own }
      );
      setStatus({ state: "idle" });
      return { count, missing: local.missing };
    } catch (error) {
      setStatus(before);
      throw new Error(
        `${messageOf(error)} Nothing on this ${deviceName} changed, so you can try again.`
      );
    }
  }, [replaceAllItems, storeSynced]);
  restoreRef.current = restore;

  // Sends this device's items over whatever the server has. `allowEmpty` is for
  // the one case that means it: the person deleted everything and says so.
  const replaceServer = useCallback(
    async ({ allowEmpty = false } = {}) => {
      if (itemsRef.current.length === 0 && !allowEmpty) {
        throw new Error(`This ${deviceName} has no items to send.`);
      }
      if (problemRef.current?.type === "unreadable") {
        throw new Error(
          `This ${deviceName}'s items couldn't be read, so there's nothing safe to send.`
        );
      }
      await push("*");
    },
    [push]
  );

  const value = useMemo(
    () => ({
      available: syncAvailable,
      server,
      status,
      meta,
      update,
      connect,
      disconnect,
      syncNow,
      restore,
      keepBoth,
      replaceServer,
      checkForUpdate,
      installUpdate,
    }),
    [server, status, meta, update, connect, disconnect, syncNow, restore, keepBoth, replaceServer, checkForUpdate, installUpdate]
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) {
    throw new Error("useSync must be used within a SyncProvider");
  }
  return ctx;
}
