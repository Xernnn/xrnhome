import {
  ACTIONS,
  computeStep,
  findDuplicate,
  formChanges,
  initialState,
  mergeDuplicates,
  normalizeItem,
  prepareItems,
  reducer,
  reminderPlan,
  salvageItems,
  untickChanges,
} from "../src/utils/inventoryLogic";
import {
  countText,
  getRoomCategories,
  isOnBuyList,
  isPreviouslyHad,
  isStillStocked,
  needsExpiryDate,
  setCustomCategories,
  categoryExists,
  getCategoryMeta,
} from "../src/utils/constants";

const NOW = "2026-11-05T10:00:00.000Z";
const dayFromNow = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
};

const make = (over = {}) =>
  normalizeItem({
    id: "a",
    name: "Milk",
    room: "food",
    category: "Fridge",
    quantity: 2,
    unit: "bottles",
    openedPercent: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
  });

const start = (...items) => ({ ...initialState, items, loading: false });
const update = (state, id, changes, extra = {}) =>
  reducer(state, {
    type: ACTIONS.UPDATE_ITEM,
    payload: { id, changes, now: NOW, ...extra },
  });
const step = (state, id, dir) =>
  reducer(state, { type: ACTIONS.STEP_ITEM, payload: { id, dir, now: NOW } });

describe("counting", () => {
  it("counts every tap, even when they come faster than a render", () => {
    let state = start(make({ quantity: 50 }));
    for (let i = 0; i < 8; i++) state = step(state, "a", 1);
    expect(state.items[0].quantity).toBe(58);
    expect(state.items[0].history).toHaveLength(8);
  });

  it("writes history in the item's own unit, singular when it's one", () => {
    const { historyEntry } = computeStep(make({ quantity: 2 }), 1);
    expect(historyEntry.action).toBe("Added 1 bottle (3 total)");
    expect(countText(1, "boxes")).toBe("1 box");
    expect(countText(2, "boxes")).toBe("2 boxes");
    expect(countText(1, "kg")).toBe("1 kg");
  });

  it("repairs a fractional quantity instead of going negative", () => {
    const item = make({ quantity: 0.5 });
    expect(item.quantity).toBe(1);
    expect(step(start(item), "a", -1).items[0].quantity).toBe(0);
  });

  it("offers Undo when minus finishes the last unit, and Undo brings it all back", () => {
    const expiry = dayFromNow(10);
    let state = start(make({ quantity: 1, expiryDate: expiry, wanted: false }));
    state = step(state, "a", -1);
    expect(state.items[0].quantity).toBe(0);
    expect(state.items[0].expiryDate).toBeNull();
    expect(state.undo.type).toBe("change");
    state = reducer(state, { type: ACTIONS.RESTORE_ITEM });
    expect(state.items[0].quantity).toBe(1);
    expect(state.items[0].expiryDate).toBe(new Date(expiry).toISOString());
  });

  it("offers Undo when minus finishes an open unit, so 10% isn't lost to a slip", () => {
    let state = start(make({ quantity: 2, openedPercent: 10 }));
    state = step(state, "a", -1);
    expect(state.items[0]).toMatchObject({ quantity: 1, openedPercent: 100 });
    state = reducer(state, { type: ACTIONS.RESTORE_ITEM });
    expect(state.items[0]).toMatchObject({ quantity: 2, openedPercent: 10 });
  });

  it("doesn't let Undo bring back a second copy of an item a sync brought back", () => {
    const milk = make({ quantity: 3 });
    let state = start(milk);
    state = reducer(state, { type: ACTIONS.DELETE_ITEM, payload: "a" });
    // The laptop had used one meanwhile, and that edit outlives the deletion.
    const theirs = [{ ...milk, quantity: 2, updatedAt: NOW }];
    state = reducer(state, { type: ACTIONS.MERGE_SERVER, payload: { base: [milk], theirs } });
    state = reducer(state, { type: ACTIONS.RESTORE_ITEM });
    expect(state.items).toHaveLength(1);
    expect(state.items[0].quantity).toBe(2);
    expect(state.undo).toBeNull();
    expect(prepareItems(state.items, false)[0].quantity).toBe(2);
  });

  it("nor one that's back folded into another record", () => {
    let state = start(make({ quantity: 3 }));
    state = reducer(state, { type: ACTIONS.DELETE_ITEM, payload: "a" });
    state = { ...state, items: [make({ id: "b", quantity: 5, mergedFrom: ["a"] })] };
    state = reducer(state, { type: ACTIONS.RESTORE_ITEM });
    expect(state.items.map((item) => item.id)).toEqual(["b"]);
  });
});

describe("restock rule", () => {
  const sauce = () =>
    make({
      quantity: 1,
      openedPercent: 10,
      recurring: true,
      restockUnits: 1,
      restockPercent: 20,
      restockMatch: "any",
    });

  it("takes an Either item off the list once more has been bought", () => {
    let state = start(sauce());
    expect(isOnBuyList(state.items[0])).toBe(true);
    state = reducer(state, {
      type: ACTIONS.BUY_ITEM,
      payload: { id: "a", amount: 1, now: NOW },
    });
    expect(state.items[0].quantity).toBe(2);
    expect(isOnBuyList(state.items[0])).toBe(false);
  });

  it("puts it back when the next open unit gets low", () => {
    let state = start(sauce());
    state = reducer(state, {
      type: ACTIONS.BUY_ITEM,
      payload: { id: "a", amount: 3, now: NOW },
    });
    expect(isOnBuyList(state.items[0])).toBe(false);
    state = step(state, "a", -1); // the open one is finished, the next opens
    expect(state.items[0]).toMatchObject({ quantity: 3, openedPercent: 100 });
    for (let i = 0; i < 8; i++) state = step(state, "a", -1);
    expect(state.items[0].openedPercent).toBe(20);
    expect(isOnBuyList(state.items[0])).toBe(true);
  });

  it("keeps a Both item on the list while both are still true", () => {
    let state = start({ ...sauce(), restockUnits: 5, restockMatch: "all" });
    state = reducer(state, {
      type: ACTIONS.BUY_ITEM,
      payload: { id: "a", amount: 1, now: NOW },
    });
    expect(isOnBuyList(state.items[0])).toBe(true);
  });

  it("keeps an existing rule when the Add form tops the item up", () => {
    let state = start(make({ recurring: true, restockUnits: 5 }));
    const candidate = make({
      id: "b",
      quantity: 1,
      recurring: true,
      restockUnits: 0,
    });
    state = reducer(state, {
      type: ACTIONS.ADD_ITEM,
      payload: { candidate, now: NOW },
    });
    expect(state.items).toHaveLength(1);
    expect(state.items[0]).toMatchObject({ quantity: 3, restockUnits: 5 });
    expect(state.items[0].history.pop().action).toBe("Added 1 bottle (3 total)");
    expect(state.undo.type).toBe("change");
  });

  it("puts a re-buy item with expired stock on the list", () => {
    const off = make({ recurring: true, quantity: 3, expiryDate: dayFromNow(-2) });
    expect(isOnBuyList(off)).toBe(true);
    expect(isOnBuyList({ ...off, recurring: false })).toBe(false);
  });
});

describe("expiry dates", () => {
  it("asks for a new date when stock that had one is bought again", () => {
    let state = start(make({ quantity: 1, expiryDate: dayFromNow(5) }));
    state = step(state, "a", -1);
    expect(state.items[0].expiryWanted).toBe(true);
    state = step(state, "a", 1);
    expect(needsExpiryDate(state.items[0])).toBe(true);
    expect(state.undo.type).toBe("expiry");
    state = update(state, "a", { expiryDate: dayFromNow(9) });
    expect(needsExpiryDate(state.items[0])).toBe(false);
  });

  it("drops a date that has passed once more is bought", () => {
    let state = start(make({ quantity: 1, expiryDate: dayFromNow(-3) }));
    state = reducer(state, {
      type: ACTIONS.BUY_ITEM,
      payload: { id: "a", amount: 1, now: NOW },
    });
    expect(state.items[0].expiryDate).toBeNull();
    expect(needsExpiryDate(state.items[0])).toBe(true);
  });

  it("makes one notification per day, naming everything due", () => {
    const now = new Date();
    now.setHours(6, 0, 0, 0);
    const plan = reminderPlan(
      [
        make({ id: "1", name: "Milk", expiryDate: dayFromNow(1) }),
        make({ id: "2", name: "Eggs", expiryDate: dayFromNow(1) }),
        make({ id: "3", name: "Gone", quantity: 0, expiryDate: dayFromNow(1) }),
      ],
      now
    );
    expect(plan).toHaveLength(1);
    expect(plan[0].title).toBe("Expires today");
    expect(plan[0].body).toBe("Milk, Eggs");
  });

  it("warns ahead of time as well as on the day", () => {
    const now = new Date();
    now.setHours(6, 0, 0, 0);
    const plan = reminderPlan([make({ expiryDate: dayFromNow(10) })], now);
    expect(plan.map((p) => p.title)).toEqual(["Expiring soon", "Expires today"]);
  });
});

describe("shopping list", () => {
  it("every out-of-stock item stays reachable", () => {
    [
      make({ quantity: 0 }),
      make({ quantity: 0, wanted: true }),
      make({ quantity: 0, recurring: true }),
      make({ quantity: 0, recurring: true, snoozed: true }),
    ].forEach((item) => {
      expect(
        isOnBuyList(item) || isStillStocked(item) || isPreviouslyHad(item)
      ).toBe(true);
    });
  });

  it("a skipped item keeps its re-buy setting and comes back after buying", () => {
    let state = start(make({ quantity: 0, recurring: true }));
    state = update(state, "a", { snoozed: true, wanted: false }, { undoLabel: "x" });
    expect(isOnBuyList(state.items[0])).toBe(false);
    expect(state.items[0].recurring).toBe(true);
    state = reducer(state, { type: ACTIONS.RESTORE_ITEM });
    expect(isOnBuyList(state.items[0])).toBe(true);

    state = update(state, "a", { snoozed: true });
    state = update(state, "a", { quantity: 1 });
    expect(state.items[0].snoozed).toBe(false);
  });

  it("unticking leaves a later restock alone", () => {
    const item = make({ quantity: 0, wanted: true });
    const entry = {
      count: 1,
      before: { quantity: 0, wanted: true, snoozed: false, openCovered: false },
    };
    let state = start(item);
    state = update(state, "a", { quantity: 1 }); // the tick
    state = update(state, "a", { quantity: 7 }); // Restock 6 on its page
    state = update(state, "a", untickChanges(state.items[0], entry));
    expect(state.items[0].quantity).toBe(6);
  });

  it("unticking right away puts the item back exactly", () => {
    const expiry = dayFromNow(-1);
    const item = make({ quantity: 1, wanted: true, expiryDate: expiry });
    const entry = {
      count: 1,
      before: {
        quantity: 1,
        wanted: true,
        snoozed: false,
        openCovered: false,
        expiryDate: item.expiryDate,
      },
    };
    let state = start(item);
    state = update(state, "a", { quantity: 2 });
    expect(state.items[0].expiryDate).toBeNull();
    state = update(state, "a", untickChanges(state.items[0], entry));
    expect(state.items[0]).toMatchObject({
      quantity: 1,
      wanted: true,
      expiryDate: item.expiryDate,
    });
  });
});

describe("merging", () => {
  const first = () => make({ id: "a", quantity: 2, note: "top shelf", imageUri: "file:///a.jpg" });
  const second = () =>
    make({
      id: "b",
      quantity: 3,
      note: "from the market",
      imageUri: "file:///b.jpg",
      createdAt: "2026-02-01T00:00:00.000Z",
    });

  it("keeps both notes when two records of an item merge on load", () => {
    const [merged, ...rest] = mergeDuplicates([first(), second()]);
    expect(rest).toHaveLength(0);
    expect(merged.quantity).toBe(5);
    expect(merged.note).toBe("top shelf\nfrom the market");
    expect(merged.imageUri).toBe("file:///a.jpg");
  });

  it("finds the record an edit would collide with", () => {
    const items = [first(), make({ id: "c", name: "Oats", category: "Cereal" })];
    expect(findDuplicate(items, { ...items[1], name: " milk ", category: "Fridge" }, "c").id).toBe("a");
    expect(findDuplicate(items, items[1], "c")).toBeNull();
  });

  it("merges on request and keeps the target's id", () => {
    let state = start(first(), { ...second(), name: "Whole milk" });
    state = reducer(state, {
      type: ACTIONS.MERGE_ITEMS,
      payload: { sourceId: "b", targetId: "a", changes: { name: "Milk" }, now: NOW },
    });
    expect(state.items).toHaveLength(1);
    expect(state.items[0]).toMatchObject({ id: "a", quantity: 5 });
    expect(state.items[0].note).toContain("from the market");
  });
});

describe("saving the Edit form", () => {
  // What ItemForm starts out holding for an item.
  const formOf = (item) => ({
    imageUri: item.imageUri,
    name: item.name,
    room: item.room,
    category: item.category,
    quantity: item.quantity,
    unit: item.unit,
    openedPercent: item.openedPercent,
    expiryDate: item.expiryDate,
    recurring: item.recurring,
    restockUnits: 0,
    restockPercent: null,
    restockMatch: "all",
    note: item.note,
  });

  it("writes only what was changed in it, over whatever happened meanwhile", () => {
    let state = start(make({ quantity: 3 }));
    const started = formOf(state.items[0]);
    // While the form is open the laptop sets a date and uses one.
    const expiryDate = dayFromNow(6);
    state = update(state, "a", { expiryDate, expiryWanted: true, quantity: 2 });
    const changes = formChanges(started, { ...started, note: "top shelf" }, state.items[0]);
    expect(changes).toEqual({ note: "top shelf" });
    state = update(state, "a", changes);
    expect(state.items[0]).toMatchObject({ note: "top shelf", quantity: 2, expiryWanted: true });
    expect(state.items[0].expiryDate).toBe(new Date(expiryDate).toISOString());
  });

  it("writes a group whole when one of its fields changed", () => {
    const item = make({ recurring: true });
    const started = { ...formOf(item), recurring: true };
    expect(formChanges(started, { ...started, restockUnits: 2 }, item)).toEqual({
      recurring: true,
      restockUnits: 2,
      restockPercent: null,
      restockMatch: "all",
    });
    expect(
      formChanges(started, { ...started, category: "Drinks" }, item)
    ).toEqual({ room: "food", category: "Drinks" });
  });

  it("forgets a date turned off in it, and keeps 'needs a new date' when not touched", () => {
    const dated = make({ expiryDate: dayFromNow(3) });
    const started = formOf(dated);
    expect(formChanges(started, { ...started, expiryDate: null }, dated)).toEqual({
      expiryDate: null,
      expiryWanted: false,
    });
    const ranOut = make({ quantity: 0, expiryWanted: true });
    expect(formChanges(formOf(ranOut), { ...formOf(ranOut), note: "x" }, ranOut)).toEqual({
      note: "x",
    });
  });
});

describe("custom categories", () => {
  afterEach(() => setCustomCategories([]));

  it("files items under the person's own category", () => {
    setCustomCategories([{ label: "Baby", room: "household" }]);
    expect(categoryExists("Baby", "household")).toBe(true);
    expect(categoryExists("Baby", "food")).toBe(false);
    expect(getCategoryMeta("Baby").icon).toBe("tag-outline");
    expect(make({ room: "household", category: "Baby" }).category).toBe("Baby");
    expect(getRoomCategories("household").pop().label).toBe("Other");
  });

  it("ignores duplicates and names of built-in categories", () => {
    const list = setCustomCategories([
      { label: "Baby", room: "household" },
      { label: " baby ", room: "food" },
      { label: "fridge", room: "food" },
      { label: "", room: "food" },
      { label: "Nowhere", room: "garage" },
    ]);
    expect(list.map((c) => c.label)).toEqual(["Baby"]);
  });
});

describe("damaged storage", () => {
  it("gets back every complete item from cut-off text", () => {
    const items = [make({ id: "1" }), make({ id: "2", name: 'Tricky "}{" name' }), make({ id: "3" })];
    const text = JSON.stringify(items);
    const found = salvageItems(text.slice(0, text.length - 40));
    expect(found.map((i) => i.id)).toEqual(["1", "2"]);
    expect(prepareItems(found, false).length).toBeGreaterThan(0);
  });

  it("finds nothing in rubbish", () => {
    expect(salvageItems("not json at all")).toEqual([]);
    expect(salvageItems(null)).toEqual([]);
  });
});
