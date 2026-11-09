import React, {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useMemo,
  useCallback,
  useRef,
  useState,
} from "react";
import { View, ActivityIndicator, StyleSheet, Alert } from "react-native";
import {
  clearRecoveredMark,
  loadCategories,
  loadItems,
  saveCategories,
  saveItems,
  saveSafeCopy,
  loadSchemaVersion,
  saveSchemaVersion,
  CURRENT_SCHEMA_VERSION,
} from "../utils/storage";
import { deleteImage } from "../utils/images";
import { deviceName } from "../utils/homeServer";
import {
  DEFAULT_ROOM,
  QUANTITY_UNITS,
  categoryExists,
  cleanCustomCategories,
  getCustomCategories,
  isOnBuyList,
  roomExists,
  roundPercent,
  setCustomCategories,
} from "../utils/constants";
import {
  ACTIONS,
  cleanRestockRule,
  generateId,
  initialState,
  mergeRecords,
  prepareItems,
  reducer,
  takeOffList,
} from "../utils/inventoryLogic";
import { readPackColours } from "../utils/packColourCache";
import { useTheme } from "./ThemeContext";

const InventoryContext = createContext(null);

export function InventoryProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [categories, setCategories] = useState([]);
  const { colors } = useTheme();
  const saveWarned = useRef(false);

  // Reads everything saved. Custom categories come first: an item in one that
  // isn't known yet would be filed under "Other".
  const load = useCallback(async () => {
    const list = setCustomCategories(await loadCategories());
    setCategories(list);
    const [stored, version] = await Promise.all([
      loadItems(),
      loadSchemaVersion(),
      readPackColours(),
    ]);
    if (stored.status === "unreadable") {
      dispatch({
        type: ACTIONS.SET_ITEMS,
        payload: { items: [], problem: { type: "unreadable" } },
      });
      return;
    }
    const migrate = version < CURRENT_SCHEMA_VERSION;
    const items = prepareItems(stored.items, migrate);
    dispatch({
      type: ACTIONS.SET_ITEMS,
      payload: {
        items,
        problem:
          stored.status === "recovered"
            ? { type: "recovered", count: items.length }
            : null,
      },
    });
    if (stored.status === "ok" && items.length > 0) {
      saveSafeCopy(items);
    }
    if (migrate) {
      saveSchemaVersion(CURRENT_SCHEMA_VERSION);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Persist whatever the reducer produced, so no caller can write a stale list.
  // Never over items that couldn't be read: an empty store then means "don't
  // know", not "nothing".
  const unreadable = state.problem?.type === "unreadable";
  useEffect(() => {
    if (state.loading || unreadable) {
      return;
    }
    saveItems(state.items).then((saved) => {
      if (!saved && !saveWarned.current) {
        saveWarned.current = true;
        Alert.alert(
          "Couldn't save",
          `Your latest changes couldn't be saved on this ${deviceName}. Check it has free space.`
        );
      } else if (saved) {
        saveWarned.current = false;
      }
    });
  }, [state.items, state.loading, unreadable]);

  // A recovered list stays one from launch to launch (storage.js keeps a note of
  // it) until the problem goes: the person has answered, or other items took the
  // list's place.
  const hadProblem = useRef(false);
  useEffect(() => {
    if (state.loading) {
      return;
    }
    if (state.problem) {
      hadProblem.current = true;
    } else if (hadProblem.current) {
      hadProblem.current = false;
      clearRecoveredMark();
    }
  }, [state.problem, state.loading]);

  // A deleted item's photo is kept while Undo can still bring the item back:
  // it goes once the offer has ended, and the item didn't come back.
  const lastUndo = useRef(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    const previous = lastUndo.current;
    lastUndo.current = state.undo;
    if (
      previous?.type === "delete" &&
      previous !== state.undo &&
      !state.items.some((item) => item.id === previous.item.id)
    ) {
      deleteImage(previous.item.imageUri);
    }
  }, [state.undo, state.items]);

  // `announce`: say where the item went when that isn't obvious from where the
  // person is (with none in stock it's on the Shopping tab, not the one they're on).
  const addItem = useCallback((itemData, { announce = false } = {}) => {
    const now = new Date().toISOString();
    const quantity =
      typeof itemData.quantity === "number" && !Number.isNaN(itemData.quantity)
        ? Math.max(0, itemData.quantity)
        : 0;
    const openedPercent =
      itemData.openedPercent === null || itemData.openedPercent === undefined
        ? null
        : roundPercent(Number(itemData.openedPercent));

    const room = roomExists(itemData.room) ? itemData.room : DEFAULT_ROOM;

    const candidate = {
      id: generateId(),
      name: itemData.name,
      room,
      category: categoryExists(itemData.category, room)
        ? itemData.category
        : "Other",
      imageUri: itemData.imageUri ?? null,
      quantity,
      unit: itemData.unit || QUANTITY_UNITS[0],
      openedPercent,
      expiryDate: itemData.expiryDate ?? null,
      expiryWanted: !!itemData.expiryDate,
      recurring: !!itemData.recurring,
      neverRecommend: false,
      // Adding something with none in stock means it has to be bought.
      wanted: !!itemData.wanted || quantity <= 0,
      snoozed: false,
      openCovered: false,
      ...cleanRestockRule(itemData),
      note: itemData.note ?? "",
      createdAt: now,
      updatedAt: now,
      history: [
        {
          date: now,
          action: "Item added",
          quantityBefore: 0,
          quantityAfter: quantity,
        },
      ],
    };

    dispatch({ type: ACTIONS.ADD_ITEM, payload: { candidate, now, announce } });
  }, []);

  // `undoLabel`: offer this change back in the toast, with that text.
  const updateItem = useCallback(
    (id, changes = {}, historyEntry = null, undoLabel = null) => {
      dispatch({
        type: ACTIONS.UPDATE_ITEM,
        payload: {
          id,
          changes,
          historyEntry,
          undoLabel,
          now: new Date().toISOString(),
        },
      });
    },
    []
  );

  const stepItem = useCallback((id, dir) => {
    dispatch({
      type: ACTIONS.STEP_ITEM,
      payload: { id, dir, now: new Date().toISOString() },
    });
  }, []);

  const buyItem = useCallback((id, amount) => {
    dispatch({
      type: ACTIONS.BUY_ITEM,
      payload: { id, amount, now: new Date().toISOString() },
    });
  }, []);

  const mergeItems = useCallback((sourceId, targetId, changes) => {
    // There's room for one photo. The other file would stay on disk forever.
    const all = stateRef.current.items;
    const source = all.find((item) => item.id === sourceId);
    const target = all.find((item) => item.id === targetId);
    if (source && target) {
      const edited = { ...source, ...changes };
      const kept = mergeRecords(target, edited).imageUri;
      [source.imageUri, edited.imageUri, target.imageUri]
        .filter((uri) => uri && uri !== kept)
        .forEach(deleteImage);
    }
    dispatch({
      type: ACTIONS.MERGE_ITEMS,
      payload: { sourceId, targetId, changes, now: new Date().toISOString() },
    });
  }, []);

  const deleteItem = useCallback((id) => {
    dispatch({ type: ACTIONS.DELETE_ITEM, payload: id });
  }, []);

  const undoDelete = useCallback(() => {
    dispatch({ type: ACTIONS.RESTORE_ITEM });
  }, []);

  const clearUndo = useCallback(() => {
    dispatch({ type: ACTIONS.CLEAR_UNDO });
  }, []);

  const showNotice = useCallback((label) => {
    dispatch({ type: ACTIONS.NOTICE, payload: label });
  }, []);

  const clearProblem = useCallback(() => {
    dispatch({ type: ACTIONS.CLEAR_PROBLEM });
  }, []);

  const applyCategories = useCallback((raw) => {
    const list = setCustomCategories(raw);
    setCategories(list);
    saveCategories(list.map(({ label, room }) => ({ label, room })));
    return list;
  }, []);

  // Returns the new category's label, or null when the name can't be used.
  const addCategory = useCallback(
    (label, room) => {
      const name = label.trim();
      const next = cleanCustomCategories([
        ...getCustomCategories(),
        { label: name, room },
      ]);
      if (next.length === getCustomCategories().length) {
        return null;
      }
      applyCategories(next);
      return name;
    },
    [applyCategories]
  );

  // The category's items move to "Other" in the same room.
  const removeCategory = useCallback(
    (label) => {
      const now = new Date().toISOString();
      stateRef.current.items
        .filter((item) => item.category === label)
        .forEach((item) => {
          dispatch({
            type: ACTIONS.UPDATE_ITEM,
            payload: {
              id: item.id,
              changes: { category: "Other" },
              historyEntry: { action: `Moved to Other (${label} was removed)` },
              now,
            },
          });
        });
      applyCategories(getCustomCategories().filter((c) => c.label !== label));
    },
    [applyCategories]
  );

  // Swaps every item for the ones in a backup or the home server's copy,
  // migrated the same way stored data is on load.
  const replaceAllItems = useCallback(
    (rawItems, schemaVersion, rawCategories) => {
      if (Array.isArray(rawCategories)) {
        applyCategories(rawCategories);
      }
      const migrate = schemaVersion < CURRENT_SCHEMA_VERSION;
      const items = prepareItems(rawItems, migrate);
      dispatch({ type: ACTIONS.REPLACE_ALL, payload: items });
      return items.length;
    },
    [applyCategories]
  );

  // The server's copy, merged into the items as they stand by then.
  const mergeServerItems = useCallback((base, theirs) => {
    dispatch({ type: ACTIONS.MERGE_SERVER, payload: { base, theirs } });
  }, []);

  // True if it went on the list. Taking it off offers an Undo, as the X there does.
  const toggleOnList = useCallback(
    (id) => {
      const item = stateRef.current.items.find((entry) => entry.id === id);
      if (!item) {
        return false;
      }
      if (isOnBuyList(item)) {
        updateItem(
          id,
          takeOffList(item),
          { action: "Taken off the shopping list" },
          `${item.name} is off the list`
        );
        return false;
      }
      updateItem(
        id,
        { wanted: true, snoozed: false },
        { action: "Added to the shopping list" }
      );
      return true;
    },
    [updateItem]
  );

  const getItemById = useCallback(
    (id) => state.items.find((item) => item.id === id) || null,
    [state.items]
  );

  const value = useMemo(
    () => ({
      items: state.items,
      loading: state.loading,
      undo: state.undo,
      problem: state.problem,
      categories,
      addItem,
      updateItem,
      stepItem,
      buyItem,
      toggleOnList,
      mergeItems,
      deleteItem,
      undoDelete,
      clearUndo,
      showNotice,
      clearProblem,
      getItemById,
      replaceAllItems,
      mergeServerItems,
      applyCategories,
      addCategory,
      removeCategory,
      reload: load,
    }),
    [
      state.items,
      state.loading,
      state.undo,
      state.problem,
      categories,
      addItem,
      updateItem,
      stepItem,
      buyItem,
      toggleOnList,
      mergeItems,
      deleteItem,
      undoDelete,
      clearUndo,
      showNotice,
      clearProblem,
      getItemById,
      replaceAllItems,
      mergeServerItems,
      applyCategories,
      addCategory,
      removeCategory,
      load,
    ]
  );

  if (state.loading) {
    return (
      <View
        style={[
          styles.loadingContainer,
          { backgroundColor: colors.background },
        ]}
      >
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <InventoryContext.Provider value={value}>
      {children}
    </InventoryContext.Provider>
  );
}

export function useInventory() {
  const ctx = useContext(InventoryContext);
  if (!ctx) {
    throw new Error("useInventory must be used within an InventoryProvider");
  }
  return ctx;
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default InventoryContext;
