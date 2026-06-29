import React, {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useMemo,
  useCallback,
} from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { loadItems, saveItems } from "../utils/storage";
import {
  MAX_HISTORY_ENTRIES,
  OPENED_STEP,
  QUANTITY_UNITS,
  categoryExists,
  isTrackingOpened,
} from "../utils/constants";
import { useTheme } from "./ThemeContext";

const InventoryContext = createContext(null);

const initialState = {
  items: [],
  loading: true,
};

const ACTIONS = {
  SET_ITEMS: "SET_ITEMS",
  ADD_ITEM: "ADD_ITEM",
  UPDATE_ITEM: "UPDATE_ITEM",
  DELETE_ITEM: "DELETE_ITEM",
};

function reducer(state, action) {
  switch (action.type) {
    case ACTIONS.SET_ITEMS:
      return { ...state, items: action.payload, loading: false };
    case ACTIONS.ADD_ITEM:
      return { ...state, items: [action.payload, ...state.items] };
    case ACTIONS.UPDATE_ITEM:
      return {
        ...state,
        items: state.items.map((item) =>
          item.id === action.payload.id ? action.payload : item
        ),
      };
    case ACTIONS.DELETE_ITEM:
      return {
        ...state,
        items: state.items.filter((item) => item.id !== action.payload),
      };
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

const clampPercent = (value) => Math.max(0, Math.min(100, value));

// Normalizes any stored item (including legacy shapes) into the current model.
const normalizeItem = (raw) => {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  let openedPercent = null;
  if (typeof raw.openedPercent === "number" && !Number.isNaN(raw.openedPercent)) {
    openedPercent = clampPercent(raw.openedPercent);
  } else if (
    raw.openedAmount !== null &&
    raw.openedAmount !== undefined &&
    !Number.isNaN(Number(raw.openedAmount))
  ) {
    // Legacy item had an opened amount in g/ml — treat the open unit as full.
    openedPercent = 100;
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
 * Returns { changes, historyEntry, willRemove }.
 */
export function computeStep(item, dir) {
  if (!item) {
    return { changes: null, historyEntry: null, willRemove: false };
  }
  const tracking = isTrackingOpened(item);

  if (tracking) {
    if (dir > 0) {
      const next = clampPercent(item.openedPercent + OPENED_STEP);
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

    const next = item.openedPercent - OPENED_STEP;
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

  const persist = useCallback(async (items) => {
    await saveItems(items);
  }, []);

  const addItem = useCallback(
    (itemData) => {
      const now = new Date().toISOString();
      const quantity =
        typeof itemData.quantity === "number" ? itemData.quantity : 0;
      const openedPercent =
        itemData.openedPercent === null ||
        itemData.openedPercent === undefined
          ? null
          : clampPercent(Number(itemData.openedPercent));

      const newItem = {
        id: generateId(),
        name: itemData.name,
        category: categoryExists(itemData.category)
          ? itemData.category
          : "Other",
        storageLocation: itemData.storageLocation,
        imageUri: itemData.imageUri ?? null,
        quantity,
        unit: itemData.unit || QUANTITY_UNITS[0],
        openedPercent,
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
      persist([newItem, ...state.items]);
      return newItem;
    },
    [state.items, persist]
  );

  const updateItem = useCallback(
    (id, changes = {}, historyEntry = null) => {
      const existing = state.items.find((item) => item.id === id);
      if (!existing) {
        return null;
      }

      const now = new Date().toISOString();
      let nextHistory = existing.history ? [...existing.history] : [];

      if (historyEntry) {
        nextHistory.push({
          date: now,
          action: historyEntry.action ?? "Updated item",
          quantityBefore:
            historyEntry.quantityBefore ?? existing.quantity ?? 0,
          quantityAfter:
            historyEntry.quantityAfter ??
            (changes.quantity != null ? changes.quantity : existing.quantity) ??
            0,
        });
      }

      nextHistory = capHistory(nextHistory);

      const updated = {
        ...existing,
        ...changes,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: now,
        history: nextHistory,
      };

      dispatch({ type: ACTIONS.UPDATE_ITEM, payload: updated });
      persist(state.items.map((item) => (item.id === id ? updated : item)));
      return updated;
    },
    [state.items, persist]
  );

  const deleteItem = useCallback(
    (id) => {
      dispatch({ type: ACTIONS.DELETE_ITEM, payload: id });
      persist(state.items.filter((item) => item.id !== id));
    },
    [state.items, persist]
  );

  const getItemById = useCallback(
    (id) => state.items.find((item) => item.id === id) || null,
    [state.items]
  );

  // Applies a +/- step from a card. Returns { removed, willRemove } so the
  // caller can decide whether to confirm/remove a fully depleted item.
  const stepItem = useCallback(
    (id, dir) => {
      const existing = state.items.find((item) => item.id === id);
      if (!existing) {
        return { willRemove: false };
      }
      const result = computeStep(existing, dir);
      if (result.willRemove) {
        return { willRemove: true };
      }
      if (result.changes) {
        updateItem(id, result.changes, result.historyEntry);
      }
      return { willRemove: false };
    },
    [state.items, updateItem]
  );

  const value = useMemo(
    () => ({
      items: state.items,
      loading: state.loading,
      addItem,
      updateItem,
      deleteItem,
      getItemById,
      stepItem,
    }),
    [
      state.items,
      state.loading,
      addItem,
      updateItem,
      deleteItem,
      getItemById,
      stepItem,
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
