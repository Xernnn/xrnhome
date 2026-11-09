// The inventory's rules, with nothing of React or the phone in them, so they can
// be tested on their own (test/inventory.test.js): what a stored item is allowed
// to look like, how two records of one item merge, what + and - do, and the
// reducer InventoryContext runs.
import {
  DEFAULT_ROOM,
  EXPIRING_SOON_DAYS,
  MAX_HISTORY_ENTRIES,
  MAX_QUANTITY,
  OPENED_STEP,
  QUANTITY_UNITS,
  categoryExists,
  countText,
  getRestockRule,
  getExpiryStatus,
  itemKey,
  isTrackingOpened,
  needsExpiryDate,
  roomExists,
  roundPercent,
  unitFor,
} from "./constants";

export const initialState = {
  items: [],
  loading: true,
  // What the toast offers: { type: "delete", item, index, label } and
  // { type: "change", id, before, label } can be undone; { type: "expiry", id,
  // label } asks for a new date; { type: "notice", label } only says something.
  undo: null,
  // null, or { type: "unreadable" } (the saved items couldn't be read, so nothing
  // may be written over them), or { type: "recovered", count } (they were
  // damaged and this much of them was saved).
  problem: null,
};

export const ACTIONS = {
  SET_ITEMS: "SET_ITEMS",
  ADD_ITEM: "ADD_ITEM",
  UPDATE_ITEM: "UPDATE_ITEM",
  STEP_ITEM: "STEP_ITEM",
  BUY_ITEM: "BUY_ITEM",
  MERGE_ITEMS: "MERGE_ITEMS",
  DELETE_ITEM: "DELETE_ITEM",
  RESTORE_ITEM: "RESTORE_ITEM",
  CLEAR_UNDO: "CLEAR_UNDO",
  NOTICE: "NOTICE",
  REPLACE_ALL: "REPLACE_ALL",
  MERGE_SERVER: "MERGE_SERVER",
  CLEAR_PROBLEM: "CLEAR_PROBLEM",
};

export const generateId = () =>
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

const cleanQuantity = (value) =>
  Math.min(Math.max(0, Math.ceil(value)), MAX_QUANTITY);

// What an item looks like after any change. Once it has run out a % item stays a
// % item, with its open unit reading 100% so whatever gets bought next starts
// out full, and the expiry date goes with the stock it belonged to, remembered
// only as "this item has one". `openCovered` ends once the open unit isn't low.
const settle = (item) => {
  let next = item;
  if (next.quantity <= 0) {
    next = {
      ...next,
      openedPercent: isTrackingOpened(next) ? 100 : next.openedPercent,
      expiryDate: null,
      expiryWanted: next.expiryWanted || !!next.expiryDate,
    };
  }
  if (next.openCovered) {
    const rule = getRestockRule(next);
    if (rule.percent === null || next.openedPercent > rule.percent) {
      next = { ...next, openCovered: false };
    }
  }
  return next;
};

const parseExpiry = (value) => {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

// Topping up stock that is still there keeps whichever date comes first.
const mergedExpiry = (existing, incoming) => {
  if (existing.quantity <= 0 || !existing.expiryDate) {
    return incoming.expiryDate || null;
  }
  if (!incoming.expiryDate) {
    return existing.expiryDate;
  }
  return existing.expiryDate < incoming.expiryDate
    ? existing.expiryDate
    : incoming.expiryDate;
};

// When two records of one item merge, the open unit comes from whichever of
// them still has stock.
const mergedOpenedPercent = (a, b) => {
  if (isTrackingOpened(a) && a.quantity > 0) {
    return a.openedPercent;
  }
  return isTrackingOpened(b) ? b.openedPercent : a.openedPercent;
};

// Photos are files the app copied (file://), what the picker hands back on
// Android (content://) and web (data:, blob:), or, in the browser, a photo on the
// home server that served the page. Anything else, a web address in an imported
// backup above all, would have the app fetch it: keep it out.
const safeImageUri = (uri) =>
  typeof uri === "string" &&
  /^(file|content|blob):|^data:image\/|^\/xrnhome\/photos\/[A-Za-z0-9]/i.test(uri)
    ? uri
    : null;

// History entries are shown as text: an entry from a damaged or hand-made
// backup whose action isn't a string would crash the detail screen.
const cleanHistory = (history) =>
  capHistory(
    (Array.isArray(history) ? history : [])
      .filter((e) => e && typeof e === "object" && typeof e.date === "string")
      .map((e) => (typeof e.action === "string" ? e : { ...e, action: String(e.action ?? "") }))
  );

// Before Food and Household, items lived in a "kitchen" or "bedroom" room (or
// in no room at all, before rooms existed) under that era's categories. Each
// old category maps to where it belongs now. "Dessert" and "Non Food Items"
// come from PantryPal backups. Maps, not object literals, so a category named
// "constructor" in a hand-made backup can't match an Object built-in.
const LEGACY_CATEGORIES = new Map([
  ["Vegetables", ["food", "Fridge"]],
  ["Fruits", ["food", "Fridge"]],
  ["Meat & Seafood", ["food", "Fridge"]],
  ["Dairy", ["food", "Fridge"]],
  ["Frozen", ["food", "Fridge"]],
  ["Drinks", ["food", "Drinks"]],
  ["Condiments", ["food", "Spices & Sauces"]],
  ["Spices & Herbs", ["food", "Spices & Sauces"]],
  ["Bakery", ["food", "Cupboard"]],
  ["Canned Foods", ["food", "Cupboard"]],
  ["Grains & Pasta", ["food", "Cupboard"]],
  ["Snacks", ["food", "Cupboard"]],
  ["Food Cupboard", ["food", "Cupboard"]],
  ["Dessert", ["food", "Cupboard"]],
  ["Cleaning", ["household", "Kitchen"]],
  ["Paper & Wraps", ["household", "Kitchen"]],
  ["Kitchenware", ["household", "Kitchen"]],
  ["Non Food Items", ["household", "Kitchen"]],
  ["Clothing", ["household", "Bedroom"]],
  ["Bedding", ["household", "Bedroom"]],
  ["Toiletries", ["household", "Bedroom"]],
  ["Beauty", ["household", "Bedroom"]],
  ["Medicine", ["household", "Bedroom"]],
  ["Electronics", ["household", "Bedroom"]],
  ["Stationery", ["household", "Bedroom"]],
]);

// Where an old item with any other category goes, by its old room. Anything
// else, including items from before rooms, lands in DEFAULT_ROOM under "Other".
const LEGACY_ROOMS = new Map([
  ["kitchen", ["food", "Other"]],
  ["bedroom", ["household", "Bedroom"]],
]);

// Returns [room, category] for a stored item, moving items saved under the old
// rooms into the current ones.
const placeItem = (room, category) => {
  if (roomExists(room)) {
    return [room, categoryExists(category, room) ? category : "Other"];
  }
  return (
    LEGACY_CATEGORIES.get(category) ||
    LEGACY_ROOMS.get(room) || [DEFAULT_ROOM, "Other"]
  );
};

// The item's own "put it on the list" rule (see getRestockRule). Unset units
// mean the item never got one and keeps the default.
export const cleanRestockRule = (raw) => {
  if (!Number.isFinite(raw.restockUnits)) {
    return { restockUnits: null, restockPercent: null, restockMatch: "all" };
  }
  return {
    restockUnits: Math.max(0, Math.min(Math.round(raw.restockUnits), MAX_QUANTITY)),
    restockPercent: Number.isFinite(raw.restockPercent)
      ? roundPercent(raw.restockPercent)
      : null,
    restockMatch: raw.restockMatch === "any" ? "any" : "all",
  };
};

// Whichever of two records has a rule of its own lends it to the merge.
const ruleOf = (a, b) =>
  cleanRestockRule(Number.isFinite(a.restockUnits) ? a : b);

// `mergedFrom`: the ids of the records folded into this one (see mergeTwo), so a
// device that still has one of them under its old id can tell it's this item,
// whose count already includes it. An old id only matters until every device has
// caught up, so only the latest few are kept.
const MAX_MERGED_IDS = 20;

const cleanMergedIds = (ids, ownId) =>
  [
    ...new Set(
      (Array.isArray(ids) ? ids : []).filter(
        (id) => typeof id === "string" && id && id !== ownId
      )
    ),
  ]
    .sort()
    .slice(-MAX_MERGED_IDS);

// The `mergedFrom` of the record `id` names once it holds all of `records`.
const mergedFromOf = (id, records) => {
  const ids = cleanMergedIds(
    records.flatMap((record) => [record.id, ...(record.mergedFrom || [])]),
    id
  );
  return ids.length > 0 ? { mergedFrom: ids } : {};
};

/**
 * Normalizes any stored item (including legacy shapes) into the current model.
 * When migrateToV2 is set, quantity is rewritten from "sealed only" to a total
 * that includes the opened unit.
 */
export const normalizeItem = (raw, migrateToV2) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
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

  let quantity = Number.isFinite(raw.quantity) ? raw.quantity : 0;
  if (migrateToV2 && openedPercent !== null) {
    quantity += 1;
  }

  const now = new Date().toISOString();
  const id = typeof raw.id === "string" && raw.id ? raw.id : generateId();
  const [room, category] = placeItem(raw.room, raw.category);
  const expiryDate = parseExpiry(raw.expiryDate);
  const mergedFrom = cleanMergedIds(raw.mergedFrom, id);

  return settle({
    id,
    name: typeof raw.name === "string" ? raw.name : "Untitled item",
    room,
    category,
    imageUri: safeImageUri(raw.imageUri),
    quantity: cleanQuantity(quantity),
    unit: typeof raw.unit === "string" && raw.unit ? raw.unit : QUANTITY_UNITS[0],
    openedPercent,
    expiryDate,
    expiryWanted: !!raw.expiryWanted || !!expiryDate,
    recurring: !!raw.recurring,
    neverRecommend: !!raw.neverRecommend,
    wanted: !!raw.wanted,
    snoozed: !!raw.snoozed,
    openCovered: !!raw.openCovered,
    ...cleanRestockRule(raw),
    note: typeof raw.note === "string" ? raw.note : "",
    createdAt: typeof raw.createdAt === "string" && raw.createdAt ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === "string" && raw.updatedAt ? raw.updatedAt : now,
    history: cleanHistory(raw.history),
    ...(mergedFrom.length > 0 ? { mergedFrom } : {}),
  });
};

const byDate = (a, b) => String(a.date).localeCompare(String(b.date));

// Every update, delete and list key goes by id, so two items sharing one (a
// backup edited by hand, or one merged from two phones) would act as one.
const uniqueIds = (items) => {
  const seen = new Set();
  return items.map((item) => {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      return item;
    }
    let id = generateId();
    while (seen.has(id)) id = generateId();
    seen.add(id);
    return { ...item, id };
  });
};

const joinNotes = (a, b) => {
  const first = (a || "").trim();
  const second = (b || "").trim();
  if (!first || !second || first === second) {
    return first || second;
  }
  return `${first}\n${second}`;
};

// One record out of two that describe the same item. Nothing either of them
// knows is dropped except a second photo: there's room for one. The id that goes
// is remembered in `mergedFrom`: a device that hasn't seen this yet still has
// that record, and without it would count its stock a second time.
const mergeTwo = (a, b) => {
  const [keep, drop] =
    String(a.createdAt) <= String(b.createdAt) ? [a, b] : [b, a];
  return settle({
    ...keep,
    quantity: cleanQuantity((keep.quantity || 0) + (drop.quantity || 0)),
    openedPercent: mergedOpenedPercent(keep, drop),
    expiryDate: mergedExpiry(keep, drop),
    expiryWanted: !!keep.expiryWanted || !!drop.expiryWanted,
    imageUri: keep.imageUri || drop.imageUri,
    note: joinNotes(keep.note, drop.note),
    recurring: keep.recurring || drop.recurring,
    neverRecommend: keep.neverRecommend && drop.neverRecommend,
    wanted: keep.wanted || drop.wanted,
    snoozed: keep.snoozed && drop.snoozed,
    openCovered: keep.openCovered && drop.openCovered,
    ...ruleOf(keep, drop),
    history: capHistory(
      [...(keep.history || []), ...(drop.history || [])].sort(byDate)
    ),
    ...mergedFromOf(keep.id, [keep, drop]),
  });
};

export const mergeRecords = mergeTwo;

// Folds entries that describe the same item into a single record.
export const mergeDuplicates = (items) => {
  const byKey = new Map();
  items.forEach((item) => {
    const key = itemKey(item);
    const seen = byKey.get(key);
    byKey.set(key, seen ? mergeTwo(seen, item) : item);
  });
  return Array.from(byKey.values());
};

// Raw stored or restored items, ready for the store.
export const prepareItems = (rawItems, migrate) =>
  mergeDuplicates(
    uniqueIds(
      Array.isArray(rawItems)
        ? rawItems.map((raw) => normalizeItem(raw, migrate)).filter(Boolean)
        : []
    )
  );

// A value with its object keys in order, for comparing what's stored on two
// devices: the same item can have its fields in a different order on each.
export const canonical = (value) => {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((out, key) => {
        if (value[key] !== undefined) {
          out[key] = canonical(value[key]);
        }
        return out;
      }, {});
  }
  return value;
};

const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

// Fields that only mean something together, so they travel as one when two edits
// of an item meet. `quantity` isn't here: see mergeEdits.
const FIELD_GROUPS = [
  ["name"],
  ["room", "category"],
  ["imageUri"],
  ["unit"],
  ["note"],
  ["recurring", "neverRecommend", "restockUnits", "restockPercent", "restockMatch"],
  ["openedPercent", "openCovered", "expiryDate", "expiryWanted", "wanted", "snoozed"],
];

const groupChanged = (group, item, base) =>
  group.some((field) => !same(item[field], base[field]));

const allHistory = (a, b) => {
  const seen = new Set();
  return capHistory(
    [...(a.history || []), ...(b.history || [])]
      .filter((entry) => {
        const key = `${entry.date}|${entry.action}`;
        return seen.has(key) ? false : !!seen.add(key);
      })
      .sort(byDate)
  );
};

// One item changed on both devices. What only one side changed is kept from that
// side, and the later edit wins where both changed the same thing. Quantities add
// up instead, because each is something that really happened: one used a can
// while the other bought three, so that's two more than there were.
const mergeEdits = (base, mine, theirs) => {
  if (same(mine, theirs)) {
    return mine;
  }
  if (base && same(mine, base)) {
    return theirs;
  }
  if (base && same(theirs, base)) {
    return mine;
  }
  const [newer, older] =
    String(mine.updatedAt) >= String(theirs.updatedAt)
      ? [mine, theirs]
      : [theirs, mine];
  // The two only differ in when they began, or what they took in, when one side
  // folded another record into this one (see mergeCopies).
  const merged = {
    ...newer,
    createdAt:
      String(mine.createdAt) <= String(theirs.createdAt) ? mine.createdAt : theirs.createdAt,
    history: allHistory(mine, theirs),
    ...mergedFromOf(newer.id, [mine, theirs]),
  };
  if (base) {
    FIELD_GROUPS.forEach((group) => {
      if (groupChanged(group, older, base) && !groupChanged(group, newer, base)) {
        group.forEach((field) => {
          merged[field] = older[field];
        });
      }
    });
    merged.quantity = cleanQuantity(mine.quantity + theirs.quantity - base.quantity);
  }
  return settle(merged);
};

// Where each id that was folded into another record went (see mergeTwo), from
// all three copies: the device that folded two records needn't be this one.
const foldedInto = (lists) => {
  const into = new Map();
  lists.forEach((list) =>
    (list || []).forEach((item) =>
      (item.mergedFrom || []).forEach((id) => {
        if (id !== item.id && !into.has(id)) {
          into.set(id, item.id);
        }
      })
    )
  );
  return into;
};

// The id a record goes by now: the one it was folded into, or the one that one
// was folded into, and so on. Two devices that each folded a pair the other way
// make a loop, which every copy settles the same way.
const currentId = (into, id) => {
  const path = [id];
  let at = id;
  while (into.has(at)) {
    at = into.get(at);
    const loop = path.indexOf(at);
    if (loop !== -1) {
      return path.slice(loop).sort()[0];
    }
    path.push(at);
  }
  return at;
};

const byAge = (a, b) =>
  String(a.createdAt).localeCompare(String(b.createdAt)) ||
  String(a.id).localeCompare(String(b.id));

// `list` with each record under the id it goes by now, and records that turn
// out to be one item folded together as the device that folded them did.
const underCurrentIds = (list, into) => {
  if (!list || into.size === 0) {
    return list;
  }
  const groups = new Map();
  list.forEach((item) => {
    const id = currentId(into, item.id);
    groups.set(id, [...(groups.get(id) || []), item]);
  });
  return Array.from(groups, ([id, records]) => {
    if (records.length === 1 && records[0].id === id) {
      return records[0];
    }
    const folded = [...records].sort(byAge).reduce((a, b) => mergeTwo(a, b));
    return { ...folded, id, ...mergedFromOf(id, records) };
  });
};

// This device's items and the server's, as one list. `base` is the server copy
// this device last built on (null when there isn't one), which is what tells
// "they deleted it" from "I just added it". A deletion only wins over an item
// nobody has touched since: an edit outlives it, because putting back something
// deleted is easy and getting back something lost isn't. Without a base nothing
// can be read as deleted, so everything on either side stays.
//
// A record one side folded into another (the same item added on both devices,
// or two merged in the Edit form) is first folded the same way in the other two
// copies. Otherwise the side that still has it would see it as an edit outliving
// a deletion, keep it, and count its stock again on top of the record that took
// it in.
export const mergeCopies = (baseCopy, mineCopy, theirsCopy) => {
  const copies = [baseCopy, mineCopy, theirsCopy];
  const into = foldedInto(copies);
  const [base, mine, theirs] = copies.map((list) => underCurrentIds(list, into));
  const before = new Map((base || []).map((item) => [item.id, item]));
  const incoming = new Map(theirs.map((item) => [item.id, item]));
  const here = new Set(mine.map((item) => item.id));
  const stillWanted = (item) =>
    !before.has(item.id) || !same(item, before.get(item.id));

  const kept = [];
  mine.forEach((item) => {
    const other = incoming.get(item.id);
    if (other) {
      kept.push(mergeEdits(before.get(item.id), item, other));
    } else if (stillWanted(item)) {
      kept.push(item);
    }
  });
  const arrived = theirs.filter((item) => !here.has(item.id) && stillWanted(item));
  return mergeDuplicates([...arrived, ...kept]);
};

// Both lists are the same, whatever order they're in.
export const sameItems = (a, b) => {
  const byId = (x, y) => String(x.id).localeCompare(String(y.id));
  return same([...a].sort(byId), [...b].sort(byId));
};

// A merge taking away most of what's here is more likely a mistake somewhere than
// a lot of deleting, so it waits for the person. A few deletions never count, nor
// does a record folded into another one, which holds it now.
export const tooManyGone = (mine, merged) => {
  const kept = new Set(merged.flatMap((item) => [item.id, ...(item.mergedFrom || [])]));
  const gone = mine.filter((item) => !kept.has(item.id)).length;
  return gone > 3 && gone > mine.length / 2;
};

// The same three-way idea for the person's own categories. Their order counts
// too, since it's sent and it picks each one's colour, so it's the server's, with
// each category only this device added put back after the one it follows here.
// With each device keeping its own order, two that had added theirs in turn never
// agreed, and sent their lists back and forth for as long as both were open.
export const mergeCategories = (base, mine, theirs) => {
  const key = (category) => `${category.room}|${category.label}`;
  const before = new Set((base || []).map(key));
  const here = new Set(mine.map(key));
  const there = new Set(theirs.map(key));
  const merged = theirs.filter((c) => here.has(key(c)) || !before.has(key(c)));
  let at = 0;
  mine.forEach((c) => {
    if (there.has(key(c))) {
      at = merged.findIndex((m) => key(m) === key(c)) + 1;
    } else if (!before.has(key(c))) {
      merged.splice(at, 0, c);
      at += 1;
    }
  });
  return merged;
};

/**
 * Pure helper that computes the result of a +/- step on an item.
 * dir > 0 increases, dir < 0 decreases.
 * `willEmpty` reports that the change leaves the item at zero units,
 * `finishedUnit` that it used up an open unit. Plus can't put either back (the
 * percent and any expiry date are gone), so those steps get an Undo.
 */
export function computeStep(item, dir) {
  const noop = { changes: null, historyEntry: null, willEmpty: false, finishedUnit: false };
  if (!item) {
    return noop;
  }
  const tracking = isTrackingOpened(item);

  if (dir > 0) {
    if (tracking && item.quantity > 0 && item.openedPercent < 100) {
      const next = clampPercent(item.openedPercent + OPENED_STEP);
      return {
        ...noop,
        changes: { openedPercent: next },
        historyEntry: {
          action: `Topped the open unit up to ${next}%`,
          quantityBefore: item.quantity,
          quantityAfter: item.quantity,
        },
      };
    }

    const q = item.quantity + 1;
    return {
      ...noop,
      changes: { quantity: q },
      historyEntry: {
        action: `Added ${countText(1, item.unit)} (${q} total)`,
        quantityBefore: item.quantity,
        quantityAfter: q,
      },
    };
  }

  if (item.quantity <= 0) {
    return noop;
  }

  if (tracking) {
    const nextPercent = item.openedPercent - OPENED_STEP;
    if (nextPercent > 0) {
      return {
        ...noop,
        changes: { openedPercent: nextPercent },
        historyEntry: {
          action: `Used ${OPENED_STEP}% (${nextPercent}% left)`,
          quantityBefore: item.quantity,
          quantityAfter: item.quantity,
        },
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
      finishedUnit: true,
    };
  }

  const q = item.quantity - 1;
  return {
    ...noop,
    changes: { quantity: q },
    historyEntry: {
      action:
        q === 0
          ? "Used the last unit"
          : `Used ${countText(1, item.unit)} (${q} left)`,
      quantityBefore: item.quantity,
      quantityAfter: q,
    },
    willEmpty: q === 0,
  };
}

// Applies a change to the item at `index`. `undoLabel` keeps a copy of the item
// as it was and offers it back.
const applyChange = (state, index, { changes, historyEntry, now, undoLabel }) => {
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

  // More stock means whatever was wanted has been bought, a skip is over, and a
  // low open unit has been taken care of, unless the caller says otherwise (as
  // un-ticking a purchase does).
  const restocked =
    changes.quantity != null && changes.quantity > existing.quantity;
  // A date that has passed belonged to the stock that went off, not to what was
  // just bought.
  const replacedExpired =
    restocked &&
    changes.expiryDate === undefined &&
    getExpiryStatus(existing) === "expired";
  const merged = {
    ...existing,
    ...(restocked ? { wanted: false, snoozed: false, openCovered: true } : {}),
    ...(replacedExpired ? { expiryDate: null, expiryWanted: true } : {}),
    ...changes,
  };
  const items = [...state.items];
  const next = settle({
    ...merged,
    quantity: cleanQuantity(merged.quantity),
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: now,
    history: capHistory(history),
  });
  items[index] = next;

  let undo = state.undo;
  if (restocked && needsExpiryDate(next)) {
    undo = {
      type: "expiry",
      id: existing.id,
      label: `${existing.name} needs a new expiry date`,
    };
  } else if (undoLabel) {
    undo = { type: "change", id: existing.id, before: existing, label: undoLabel };
  }
  return { ...state, items, undo };
};

export function reducer(state, action) {
  switch (action.type) {
    case ACTIONS.SET_ITEMS:
      return {
        ...state,
        items: action.payload.items,
        problem: action.payload.problem || null,
        loading: false,
      };

    case ACTIONS.ADD_ITEM: {
      const { candidate, now, announce } = action.payload;
      const key = itemKey(candidate);
      const index = state.items.findIndex((item) => itemKey(item) === key);

      if (index === -1) {
        return {
          ...state,
          items: [settle(candidate), ...state.items],
          undo:
            announce && candidate.quantity <= 0
              ? {
                  type: "notice",
                  label: `None in stock, so ${candidate.name} went on the shopping list`,
                }
              : state.undo,
        };
      }

      // Same item already tracked, so top it up instead of adding a second card.
      // Its count stays in its own unit and its rule stays unless it has none.
      const existing = state.items[index];
      const quantity = cleanQuantity(
        (existing.quantity || 0) + (candidate.quantity || 0)
      );
      const rule =
        existing.recurring || !candidate.recurring ? ruleOf(existing, candidate) : cleanRestockRule(candidate);
      const items = [...state.items];
      items[index] = settle({
        ...existing,
        quantity,
        imageUri: existing.imageUri || candidate.imageUri,
        note: candidate.note || existing.note,
        recurring: candidate.recurring || existing.recurring,
        neverRecommend: candidate.recurring ? false : existing.neverRecommend,
        // Adding stock means it has been bought; adding none keeps it wanted.
        wanted:
          candidate.quantity > 0 ? false : existing.wanted || candidate.wanted,
        snoozed: candidate.quantity > 0 ? false : existing.snoozed,
        openCovered: candidate.quantity > 0 ? true : existing.openCovered,
        ...rule,
        openedPercent: mergedOpenedPercent(existing, candidate),
        expiryDate: mergedExpiry(existing, candidate),
        expiryWanted: !!existing.expiryWanted || !!candidate.expiryDate,
        updatedAt: now,
        history: capHistory([
          ...(existing.history || []),
          {
            date: now,
            action: `Added ${countText(candidate.quantity, existing.unit)} (${quantity} total)`,
            quantityBefore: existing.quantity || 0,
            quantityAfter: quantity,
          },
        ]),
      });
      return {
        ...state,
        items,
        undo:
          candidate.quantity > 0
            ? {
                type: "change",
                id: existing.id,
                before: existing,
                label: `Added to ${existing.name}: ${countText(quantity, existing.unit)} now`,
              }
            : state.undo,
      };
    }

    case ACTIONS.UPDATE_ITEM: {
      const index = state.items.findIndex(
        (item) => item.id === action.payload.id
      );
      if (index === -1) {
        return state;
      }
      return applyChange(state, index, action.payload);
    }

    // The step is worked out here, from the item as it stands, because the
    // button's own copy can be a render behind when taps come quickly.
    case ACTIONS.STEP_ITEM: {
      const { id, dir, now } = action.payload;
      const index = state.items.findIndex((item) => item.id === id);
      if (index === -1) {
        return state;
      }
      const item = state.items[index];
      const { changes, historyEntry, willEmpty, finishedUnit } = computeStep(item, dir);
      if (!changes) {
        return state;
      }
      const undoLabel = willEmpty
        ? `${item.name} ran out`
        : finishedUnit
        ? `Finished a ${unitFor(1, item.unit)} of ${item.name}`
        : null;
      return applyChange(state, index, { changes, historyEntry, now, undoLabel });
    }

    case ACTIONS.BUY_ITEM: {
      const { id, amount, now } = action.payload;
      const index = state.items.findIndex((item) => item.id === id);
      if (index === -1 || !(amount > 0)) {
        return state;
      }
      const item = state.items[index];
      const quantity = cleanQuantity(item.quantity + amount);
      return applyChange(state, index, {
        changes: { quantity },
        historyEntry: {
          action: `Bought ${countText(amount, item.unit)} (${quantity} in stock)`,
          quantityBefore: item.quantity,
          quantityAfter: quantity,
        },
        now,
        undoLabel: `Bought ${countText(amount, item.unit)} of ${item.name}`,
      });
    }

    // `changes` go onto `sourceId` first (an edit that gave it the same name as
    // `targetId`), then the two become one record.
    case ACTIONS.MERGE_ITEMS: {
      const { sourceId, targetId, changes, now } = action.payload;
      const source = state.items.find((item) => item.id === sourceId);
      const target = state.items.find((item) => item.id === targetId);
      if (!source || !target) {
        return state;
      }
      const merged = mergeTwo(target, { ...source, ...changes });
      return {
        ...state,
        items: state.items
          .filter((item) => item.id !== sourceId)
          .map((item) =>
            item.id === targetId
              ? {
                  ...merged,
                  id: targetId,
                  ...mergedFromOf(targetId, [target, source]),
                  updatedAt: now,
                  history: capHistory([
                    ...merged.history,
                    {
                      date: now,
                      action: "Merged with another record",
                      quantityBefore: target.quantity,
                      quantityAfter: merged.quantity,
                    },
                  ]),
                }
              : item
          ),
        undo: { type: "notice", label: `Merged into ${merged.name}` },
      };
    }

    case ACTIONS.DELETE_ITEM: {
      const index = state.items.findIndex((item) => item.id === action.payload);
      if (index === -1) {
        return state;
      }
      const item = state.items[index];
      return {
        ...state,
        items: state.items.filter((entry) => entry.id !== action.payload),
        undo: { type: "delete", item, index, label: `"${item.name}" deleted` },
      };
    }

    case ACTIONS.RESTORE_ITEM: {
      const { undo } = state;
      if (!undo) {
        return state;
      }
      if (undo.type === "delete") {
        const items = [...state.items];
        items.splice(Math.max(0, Math.min(undo.index, items.length)), 0, undo.item);
        return { ...state, items, undo: null };
      }
      if (undo.type === "change") {
        return {
          ...state,
          items: state.items.map((item) =>
            item.id === undo.id ? undo.before : item
          ),
          undo: null,
        };
      }
      return { ...state, undo: null };
    }

    case ACTIONS.CLEAR_UNDO:
      return { ...state, undo: null };

    case ACTIONS.NOTICE:
      return { ...state, undo: { type: "notice", label: action.payload } };

    case ACTIONS.REPLACE_ALL:
      return { ...state, items: action.payload, undo: null, problem: null };

    // Worked out here, from the items as they stand, so a tap made while the
    // server's copy was on its way still counts.
    case ACTIONS.MERGE_SERVER:
      return {
        ...state,
        items: mergeCopies(action.payload.base, state.items, action.payload.theirs),
      };

    case ACTIONS.CLEAR_PROBLEM:
      return { ...state, problem: null };

    default:
      return state;
  }
}

// Taking a purchase back out of the cart removes what that tick added and leaves
// alone anything that happened since, like a restock on the item's own page.
export const untickChanges = (item, entry) => {
  const quantity = Math.max(0, item.quantity - entry.count);
  const before = entry.before || {};
  const nothingElseHappened = quantity === before.quantity;
  return {
    quantity,
    wanted: !!before.wanted,
    snoozed: !!before.snoozed,
    openCovered: !!before.openCovered,
    ...(nothingElseHappened && before.expiryDate
      ? { expiryDate: before.expiryDate }
      : {}),
  };
};

// Items that would be one record with `candidate`, for the Edit form to warn
// about instead of quietly merging on the next launch.
export const findDuplicate = (items, candidate, ownId) => {
  const key = itemKey(candidate);
  return items.find((item) => item.id !== ownId && itemKey(item) === key) || null;
};

// Off the list for this trip. A re-buy item keeps its setting and comes back
// after the next purchase; it's the item's own page that turns that off for good.
export const takeOffList = (item) => ({
  wanted: false,
  snoozed: !!item.recurring,
});

// The Edit form's fields, in the groups that only mean something together (as
// FIELD_GROUPS for a merge): changing one of them writes its whole group.
const FORM_GROUPS = [
  ["name"],
  ["room", "category"],
  ["imageUri"],
  ["unit"],
  ["note"],
  ["quantity", "openedPercent"],
  ["recurring", "restockUnits", "restockPercent", "restockMatch"],
  ["expiryDate"],
];

// What saving the Edit form writes onto `current` (the item as it is now): the
// groups changed in the form since it opened with `started`, and nothing else.
// The form holds a copy from when it opened, and the rest of the item may have
// moved on since (a sync, a click in the laptop's table beside the form), which
// writing the whole copy back would undo, here and then on the other device too.
export const formChanges = (started, values, current) => {
  const changes = {};
  FORM_GROUPS.forEach((group) => {
    if (group.some((field) => !same(values[field], started[field]))) {
      group.forEach((field) => {
        changes[field] = values[field];
      });
    }
  });
  if ("expiryDate" in changes) {
    changes.expiryWanted = !!changes.expiryDate;
  }
  if ((changes.recurring ?? current.recurring) && current.neverRecommend) {
    changes.neverRecommend = false;
  }
  return changes;
};

const MAX_REMINDERS = 30;

const nameList = (names) =>
  names.length <= 3
    ? names.join(", ")
    : `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;

// The notifications to schedule: one at 9:00 on any day something enters
// "expiring soon" or reaches its date, so several items make one notification.
export const reminderPlan = (items, now = new Date()) => {
  const days = new Map();
  const add = (date, kind, name) => {
    const at = new Date(date);
    at.setHours(9, 0, 0, 0);
    if (at.getTime() <= now.getTime()) {
      return;
    }
    const key = at.getTime();
    if (!days.has(key)) {
      days.set(key, { at, today: [], soon: [] });
    }
    days.get(key)[kind].push(name);
  };
  items.forEach((item) => {
    if (item.quantity <= 0 || !item.expiryDate) {
      return;
    }
    const expiry = new Date(item.expiryDate);
    if (Number.isNaN(expiry.getTime())) {
      return;
    }
    add(expiry, "today", item.name);
    const early = new Date(expiry);
    early.setDate(early.getDate() - EXPIRING_SOON_DAYS);
    add(early, "soon", item.name);
  });
  return Array.from(days.values())
    .sort((a, b) => a.at - b.at)
    .slice(0, MAX_REMINDERS)
    .map(({ at, today, soon }) => ({
      at: at.toISOString(),
      title: today.length > 0 ? "Expires today" : "Expiring soon",
      body: [
        today.length > 0 ? nameList(today) : null,
        soon.length > 0
          ? `${today.length > 0 ? "Soon: " : ""}${nameList(soon)}`
          : null,
      ]
        .filter(Boolean)
        .join(". "),
    }));
};

// The complete items in text that should be a JSON array of objects but doesn't
// parse: each `{...}` at the top level that does parse on its own.
export const salvageItems = (text) => {
  const found = [];
  if (typeof text !== "string") {
    return found;
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0) {
        try {
          found.push(JSON.parse(text.slice(start, i + 1)));
        } catch (error) {
          // that one is damaged too
        }
      }
    }
  }
  return found;
};
