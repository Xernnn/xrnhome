import React, {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useMemo,
  useCallback,
} from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import {
  loadItems,
  saveItems,
  loadSchemaVersion,
  saveSchemaVersion,
  CURRENT_SCHEMA_VERSION,
} from "../utils/storage";
import {
  DEFAULT_ROOM,
  MAX_HISTORY_ENTRIES,
  OPENED_STEP,
  QUANTITY_UNITS,
  categoryExists,
  isTrackingOpened,
  itemKey,
  roomExists,
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

// A % item stays a % item when it runs out. While it is empty its open unit
// reads 100%, so whatever gets bought next starts out full.
const settleOpened = (item) =>
  item.quantity <= 0 && isTrackingOpened(item)
    ? { ...item, openedPercent: 100 }
    : item;

// When two records of one item merge, the open unit comes from whichever of
// them still has stock.
const mergedOpenedPercent = (a, b) => {
  if (isTrackingOpened(a) && a.quantity > 0) {
    return a.openedPercent;
  }
  return isTrackingOpened(b) ? b.openedPercent : a.openedPercent;
};

/**
 * Normalizes any stored item (including legacy shapes) into the current model.
 * When migrateToV2 is set, quantity is rewritten from "sealed only" to a total
 * that includes the opened unit.
 */
const normalizeItem = (raw, migrateToV2) => {
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

  let quantity =
    typeof raw.quantity === "number" && !Number.isNaN(raw.quantity)
      ? raw.quantity
      : 0;
  if (migrateToV2 && openedPercent !== null) {
    quantity += 1;
  }

  const now = new Date().toISOString();
  const room = roomExists(raw.room) ? raw.room : DEFAULT_ROOM;

  return settleOpened({
    id: raw.id || generateId(),
    name: typeof raw.name === "string" ? raw.name : "Untitled item",
    room,
    category: categoryExists(raw.category, room) ? raw.category : "Other",
    imageUri: raw.imageUri ?? null,
    quantity: Math.max(0, quantity),
    unit: typeof raw.unit === "string" && raw.unit ? raw.unit : QUANTITY_UNITS[0],
    openedPercent,
    recurring: !!raw.recurring,
    neverRecommend: !!raw.neverRecommend,
    note: typeof raw.note === "string" ? raw.note : "",
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || now,
    history: Array.isArray(raw.history) ? raw.history : [],
  });
};

const byDate = (a, b) => String(a.date).localeCompare(String(b.date));

// Folds entries that describe the same item into a single record.
const mergeDuplicates = (items) => {
  const byKey = new Map();

  items.forEach((item) => {
    const key = itemKey(item);
    const seen = byKey.get(key);
    if (!seen) {
      byKey.set(key, item);
      return;
    }

    const [keep, drop] =
      String(seen.createdAt) <= String(item.createdAt)
        ? [seen, item]
        : [item, seen];

    byKey.set(key, {
      ...keep,
      quantity: (keep.quantity || 0) + (drop.quantity || 0),
      openedPercent: mergedOpenedPercent(keep, drop),
      imageUri: keep.imageUri || drop.imageUri,
      note: keep.note || drop.note,
      recurring: keep.recurring || drop.recurring,
      neverRecommend: keep.neverRecommend && drop.neverRecommend,
      history: capHistory(
        [...(keep.history || []), ...(drop.history || [])].sort(byDate)
      ),
    });
  });

  return Array.from(byKey.values());
};

/**
 * Pure helper that computes the result of a +/- step on an item.
 * dir > 0 increases, dir < 0 decreases.
 * `willEmpty` reports that the change leaves the item at zero units; the caller
 * decides whether that means a prompt or a quiet move to the shopping list.
 */
export function computeStep(item, dir) {
  const noop = { changes: null, historyEntry: null, willEmpty: false };
  if (!item) {
    return noop;
  }
  const tracking = isTrackingOpened(item);

  if (dir > 0) {
    if (tracking && item.quantity > 0 && item.openedPercent < 100) {
      const next = clampPercent(item.openedPercent + OPENED_STEP);
      return {
        changes: { openedPercent: next },
        historyEntry: {
          action: `Topped the open unit up to ${next}%`,
          quantityBefore: item.quantity,
          quantityAfter: item.quantity,
        },
        willEmpty: false,
      };
    }

    const q = item.quantity + 1;
    return {
      changes: { quantity: q },
      historyEntry: {
        action: `Added 1 ${item.unit} (${q} total)`,
        quantityBefore: item.quantity,
        quantityAfter: q,
      },
      willEmpty: false,
    };
  }

  if (item.quantity <= 0) {
    return noop;
  }

  if (tracking) {
    const nextPercent = item.openedPercent - OPENED_STEP;
    if (nextPercent > 0) {
      return {
        changes: { openedPercent: nextPercent },
        historyEntry: {
          action: `Used 10% (${nextPercent}% left)`,
          quantityBefore: item.quantity,
          quantityAfter: item.quantity,
        },
        willEmpty: false,
      };
    }

    // The open unit is spent, so it leaves the count. The item keeps counting
    // in % even when that was the last unit.
    const q = item.quantity - 1;
    return {
      changes: { quantity: q, openedPercent: 100 },
      historyEntry: {
        action:
          q === 0
            ? "Used the last unit"
            : `Finished a unit, opened the next (${q} left)`,
        quantityBefore: item.quantity,
        quantityAfter: q,
      },
      willEmpty: q === 0,
    };
  }

  const q = item.quantity - 1;
  return {
    changes: { quantity: q },
    historyEntry: {
      action: q === 0 ? "Used the last unit" : `Used 1 ${item.unit} (${q} left)`,
      quantityBefore: item.quantity,
      quantityAfter: q,
    },
    willEmpty: q === 0,
  };
}

function reducer(state, action) {
  switch (action.type) {
    case ACTIONS.SET_ITEMS:
      return { ...state, items: action.payload, loading: false };

    case ACTIONS.ADD_ITEM: {
      const { candidate, now } = action.payload;
      const key = itemKey(candidate);
      const index = state.items.findIndex((item) => itemKey(item) === key);

      if (index === -1) {
        return { ...state, items: [settleOpened(candidate), ...state.items] };
      }

      // Same item already tracked, so top it up instead of adding a second card.
      const existing = state.items[index];
      const quantity = (existing.quantity || 0) + (candidate.quantity || 0);
      const items = [...state.items];
      items[index] = settleOpened({
        ...existing,
        quantity,
        imageUri: existing.imageUri || candidate.imageUri,
        note: candidate.note || existing.note,
        recurring: candidate.recurring || existing.recurring,
        neverRecommend: candidate.recurring ? false : existing.neverRecommend,
        openedPercent: mergedOpenedPercent(existing, candidate),
        updatedAt: now,
        history: capHistory([
          ...(existing.history || []),
          {
            date: now,
            action: `Added ${candidate.quantity} ${candidate.unit} (${quantity} total)`,
            quantityBefore: existing.quantity || 0,
            quantityAfter: quantity,
          },
        ]),
      });
      return { ...state, items };
    }

    case ACTIONS.UPDATE_ITEM: {
      const { id, changes, historyEntry, now } = action.payload;
      const index = state.items.findIndex((item) => item.id === id);
      if (index === -1) {
        return state;
      }

      const existing = state.items[index];
      const history = existing.history ? [...existing.history] : [];

      if (historyEntry) {
        history.push({
          date: now,
          action: historyEntry.action ?? "Updated item",
          quantityBefore: historyEntry.quantityBefore ?? existing.quantity ?? 0,
          quantityAfter:
            historyEntry.quantityAfter ??
            (changes.quantity != null ? changes.quantity : existing.quantity) ??
            0,
        });
      }

      const items = [...state.items];
      items[index] = settleOpened({
        ...existing,
        ...changes,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: now,
        history: capHistory(history),
      });
      return { ...state, items };
    }

    case ACTIONS.DELETE_ITEM:
      return {
        ...state,
        items: state.items.filter((item) => item.id !== action.payload),
      };

    default:
      return state;
  }
}

export function InventoryProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { colors } = useTheme();

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [stored, version] = await Promise.all([
        loadItems(),
        loadSchemaVersion(),
      ]);
      const migrate = version < CURRENT_SCHEMA_VERSION;
      const normalized = Array.isArray(stored)
        ? stored.map((raw) => normalizeItem(raw, migrate)).filter(Boolean)
        : [];

      if (mounted) {
        dispatch({
          type: ACTIONS.SET_ITEMS,
          payload: mergeDuplicates(normalized),
        });
      }
      if (migrate) {
        saveSchemaVersion(CURRENT_SCHEMA_VERSION);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Persist whatever the reducer produced, so no caller can write a stale list.
  useEffect(() => {
    if (state.loading) {
      return;
    }
    saveItems(state.items);
  }, [state.items, state.loading]);

  const addItem = useCallback((itemData) => {
    const now = new Date().toISOString();
    const quantity =
      typeof itemData.quantity === "number" && !Number.isNaN(itemData.quantity)
        ? Math.max(0, itemData.quantity)
        : 0;
    const openedPercent =
      itemData.openedPercent === null || itemData.openedPercent === undefined
        ? null
        : clampPercent(Number(itemData.openedPercent));

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

    dispatch({ type: ACTIONS.ADD_ITEM, payload: { candidate, now } });
  }, []);

  const updateItem = useCallback((id, changes = {}, historyEntry = null) => {
    dispatch({
      type: ACTIONS.UPDATE_ITEM,
      payload: { id, changes, historyEntry, now: new Date().toISOString() },
    });
  }, []);

  const deleteItem = useCallback((id) => {
    dispatch({ type: ACTIONS.DELETE_ITEM, payload: id });
  }, []);

  const getItemById = useCallback(
    (id) => state.items.find((item) => item.id === id) || null,
    [state.items]
  );

  const value = useMemo(
    () => ({
      items: state.items,
      loading: state.loading,
      addItem,
      updateItem,
      deleteItem,
      getItemById,
    }),
    [
      state.items,
      state.loading,
      addItem,
      updateItem,
      deleteItem,
      getItemById,
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
