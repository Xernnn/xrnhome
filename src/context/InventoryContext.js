import React, {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { loadItems, saveItems } from "../utils/storage";
import { deleteImage } from "../utils/images";
import {
  MAX_HISTORY_ENTRIES,
  OPENED_STEP,
  QUANTITY_UNITS,
  categoryExists,
  isTrackingOpened,
  roundPercent,
} from "../utils/constants";
import { useTheme } from "./ThemeContext";

const InventoryContext = createContext(null);

const initialState = {
  items: [],
  loading: true,
  undo: null, // { item, index } — the most recently deleted item, for undo.
};

const ACTIONS = {
  SET_ITEMS: "SET_ITEMS",
  ADD_ITEM: "ADD_ITEM",
  UPDATE_ITEM: "UPDATE_ITEM",
  DELETE_ITEM: "DELETE_ITEM",
  RESTORE_ITEM: "RESTORE_ITEM",
  CLEAR_UNDO: "CLEAR_UNDO",
  REPLACE_ALL: "REPLACE_ALL",
};

function reducer(state, action) {
  switch (action.type) {
    case ACTIONS.SET_ITEMS:
      return { ...state, items: action.payload, loading: false };
    case ACTIONS.REPLACE_ALL:
      return { ...state, items: action.payload, undo: null };
    case ACTIONS.ADD_ITEM:
      return { ...state, items: [action.payload, ...state.items] };
    case ACTIONS.UPDATE_ITEM:
      return {
        ...state,
        items: state.items.map((item) =>
          item.id === action.payload.id ? action.payload : item
        ),
      };
    case ACTIONS.DELETE_ITEM: {
      const index = state.items.findIndex((i) => i.id === action.payload);
      if (index === -1) {
        return state;
      }
      const removed = state.items[index];
      return {
        ...state,
        items: state.items.filter((i) => i.id !== action.payload),
        undo: { item: removed, index },
      };
    }
    case ACTIONS.RESTORE_ITEM: {
      if (!state.undo) {
        return state;
      }
      const { item, index } = state.undo;
      const nextItems = [...state.items];
      const safeIndex = Math.max(0, Math.min(index, nextItems.length));
      nextItems.splice(safeIndex, 0, item);
      return { ...state, items: nextItems, undo: null };
    }
    case ACTIONS.CLEAR_UNDO:
      return { ...state, undo: null };
    default:
      return state;
  }
}

const generateId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

const capHistory = (history) => {
  if (!Array.isArray(history)) {
    return [];
  }
  if (history.length <= MAX_HISTORY_ENTRIES) {
    return history;
  }
  return history.slice(history.length - MAX_HISTORY_ENTRIES);
};

// Normalizes any stored item (including legacy v1 shapes) into the current model.
const normalizeItem = (raw) => {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  let openedPercent = null;
  if (typeof raw.openedPercent === "number" && !Number.isNaN(raw.openedPercent)) {
    openedPercent = roundPercent(raw.openedPercent);
  } else if (
    raw.openedAmount !== null &&
    raw.openedAmount !== undefined &&
    !Number.isNaN(Number(raw.openedAmount))
  ) {
    // Legacy item had an opened amount in g/ml — treat the open unit as full.
    openedPercent = 100;
  }

  let expiryDate = null;
  if (raw.expiryDate) {
    const parsed = new Date(raw.expiryDate);
    if (!Number.isNaN(parsed.getTime())) {
      expiryDate = parsed.toISOString();
    }
  }

  return {
    id: raw.id || generateId(),
    name: typeof raw.name === "string" ? raw.name : "Untitled item",
    category: categoryExists(raw.category) ? raw.category : "Other",
    storageLocation: raw.storageLocation || "Pantry",
    imageUri: raw.imageUri ?? null,
    quantity:
      typeof raw.quantity === "number" && !Number.isNaN(raw.quantity)
        ? raw.quantity
        : 0,
    unit: typeof raw.unit === "string" && raw.unit ? raw.unit : QUANTITY_UNITS[0],
    openedPercent,
    expiryDate,
    recurring: !!raw.recurring,
    neverRecommend: !!raw.neverRecommend,
    note: typeof raw.note === "string" ? raw.note : "",
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || new Date().toISOString(),
    history: Array.isArray(raw.history) ? raw.history : [],
  };
};

/**
 * Pure helper that computes the result of a +/- step on an item card.
 * dir > 0 increases, dir < 0 decreases.
 *
 * Semantics: `quantity` = sealed units, `openedPercent` = the one open unit's
 * remaining % (null = nothing open). See constants.js for the full model.
 *
 * Returns { changes, historyEntry, willRemove }.
 */
export function computeStep(item, dir) {
  if (!item) {
    return { changes: null, historyEntry: null, willRemove: false };
  }
  const tracking = isTrackingOpened(item);

  if (tracking) {
    if (dir > 0) {
      const next = roundPercent(item.openedPercent + OPENED_STEP);
      if (next === item.openedPercent) {
        return { changes: null, historyEntry: null, willRemove: false };
      }
      return {
        changes: { openedPercent: next },
        historyEntry: {
          action: `Topped up opened unit to ${next}%`,
          quantityBefore: item.quantity,
          quantityAfter: item.quantity,
        },
        willRemove: false,
      };
    }

    const next = roundPercent(item.openedPercent - OPENED_STEP);
    if (next > 0) {
      return {
        changes: { openedPercent: next },
        historyEntry: {
          action: `Used 10% (now ${next}% left)`,
          quantityBefore: item.quantity,
          quantityAfter: item.quantity,
        },
        willRemove: false,
      };
    }
    if (item.quantity >= 1) {
      const q = item.quantity - 1;
      return {
        changes: { quantity: q, openedPercent: 100 },
        historyEntry: {
          action: `Finished a unit, opened next (${q} sealed left)`,
          quantityBefore: item.quantity,
          quantityAfter: q,
        },
        willRemove: false,
      };
    }
    return { changes: null, historyEntry: null, willRemove: true };
  }

  // Whole-unit mode (no opened tracking).
  if (dir > 0) {
    const q = item.quantity + 1;
    return {
      changes: { quantity: q },
      historyEntry: {
        action: `Restocked 1 ${item.unit} (${q} total)`,
        quantityBefore: item.quantity,
        quantityAfter: q,
      },
      willRemove: false,
    };
  }

  const q = item.quantity - 1;
  if (q >= 1) {
    return {
      changes: { quantity: q },
      historyEntry: {
        action: `Used 1 ${item.unit} (${q} left)`,
        quantityBefore: item.quantity,
        quantityAfter: q,
      },
      willRemove: false,
    };
  }
  return { changes: null, historyEntry: null, willRemove: true };
}

export function InventoryProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { colors } = useTheme();

  useEffect(() => {
    let mounted = true;
    (async () => {
      const stored = await loadItems();
      const normalized = Array.isArray(stored)
        ? stored.map(normalizeItem).filter(Boolean)
        : [];
      if (mounted) {
        dispatch({ type: ACTIONS.SET_ITEMS, payload: normalized });
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Single source of truth for persistence: whenever items change (after the
  // initial load) we save the *current* array. This removes any stale-snapshot
  // race from individual add/update/delete callbacks.
  useEffect(() => {
    if (state.loading) {
      return;
    }
    saveItems(state.items);
  }, [state.items, state.loading]);

  const addItem = useCallback((itemData) => {
    const now = new Date().toISOString();
    const quantity =
      typeof itemData.quantity === "number" ? itemData.quantity : 0;
    const openedPercent =
      itemData.openedPercent === null || itemData.openedPercent === undefined
        ? null
        : roundPercent(Number(itemData.openedPercent));

    let expiryDate = null;
    if (itemData.expiryDate) {
      const parsed = new Date(itemData.expiryDate);
      if (!Number.isNaN(parsed.getTime())) {
        expiryDate = parsed.toISOString();
      }
    }

    const newItem = {
      id: generateId(),
      name: itemData.name,
      category: categoryExists(itemData.category) ? itemData.category : "Other",
      storageLocation: itemData.storageLocation,
      imageUri: itemData.imageUri ?? null,
      quantity,
      unit: itemData.unit || QUANTITY_UNITS[0],
      openedPercent,
      expiryDate,
      recurring: !!itemData.recurring,
      neverRecommend: false,
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

    dispatch({ type: ACTIONS.ADD_ITEM, payload: newItem });
    return newItem;
  }, []);

  // A ref mirror of state lets the action callbacks stay stable while always
  // reading the latest items (needed for history merges and undo cleanup).
  const stateRef = useRef(state);
  stateRef.current = state;

  const updateItem = useCallback((id, changes = {}, historyEntry = null) => {
    const existing = stateRef.current.items.find((item) => item.id === id);
    if (!existing) {
      return null;
    }

    const now = new Date().toISOString();
    let nextHistory = existing.history ? [...existing.history] : [];

    if (historyEntry) {
      nextHistory.push({
        date: now,
        action: historyEntry.action ?? "Updated item",
        quantityBefore: historyEntry.quantityBefore ?? existing.quantity ?? 0,
        quantityAfter:
          historyEntry.quantityAfter ??
          (changes.quantity != null ? changes.quantity : existing.quantity) ??
          0,
      });
    }

    nextHistory = capHistory(nextHistory);

    const merged = {
      ...existing,
      ...changes,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: now,
      history: nextHistory,
    };

    dispatch({ type: ACTIONS.UPDATE_ITEM, payload: merged });
    return merged;
  }, []);

  const deleteItem = useCallback((id) => {
    // Finalize any previously-pending undo (its image is now safe to remove).
    const prevUndo = stateRef.current.undo;
    if (prevUndo && prevUndo.item && prevUndo.item.id !== id) {
      deleteImage(prevUndo.item.imageUri);
    }
    dispatch({ type: ACTIONS.DELETE_ITEM, payload: id });
  }, []);

  const undoDelete = useCallback(() => {
    dispatch({ type: ACTIONS.RESTORE_ITEM });
  }, []);

  // Permanently drops the pending undo and cleans up that item's image file.
  const clearUndo = useCallback(() => {
    const pending = stateRef.current.undo;
    if (pending && pending.item) {
      deleteImage(pending.item.imageUri);
    }
    dispatch({ type: ACTIONS.CLEAR_UNDO });
  }, []);

  const getItemById = useCallback(
    (id) => stateRef.current.items.find((item) => item.id === id) || null,
    []
  );

  const replaceAllItems = useCallback((rawItems) => {
    const normalized = Array.isArray(rawItems)
      ? rawItems.map(normalizeItem).filter(Boolean)
      : [];
    dispatch({ type: ACTIONS.REPLACE_ALL, payload: normalized });
    return normalized.length;
  }, []);

  const value = useMemo(
    () => ({
      items: state.items,
      loading: state.loading,
      undo: state.undo,
      addItem,
      updateItem,
      deleteItem,
      undoDelete,
      clearUndo,
      getItemById,
      replaceAllItems,
    }),
    [
      state.items,
      state.loading,
      state.undo,
      addItem,
      updateItem,
      deleteItem,
      undoDelete,
      clearUndo,
      getItemById,
      replaceAllItems,
    ]
  );

  if (state.loading) {
    return (
      <View
        style={[styles.loadingContainer, { backgroundColor: colors.background }]}
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
