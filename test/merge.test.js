import {
  ACTIONS,
  initialState,
  mergeCategories,
  mergeCopies,
  normalizeItem,
  reducer,
  sameItems,
  tooManyGone,
} from "../src/utils/inventoryLogic";

const item = (id, fields = {}) =>
  normalizeItem({
    id,
    name: `Item ${id}`,
    room: "food",
    category: "Cupboard",
    quantity: 5,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...fields,
  });

const at = (minute) => `2026-02-01T00:${String(minute).padStart(2, "0")}:00.000Z`;
const find = (list, id) => list.find((i) => i.id === id);

describe("merging two devices' lists", () => {
  it("takes the other side's change to an item only it touched", () => {
    const base = [item("1")];
    const theirs = [item("1", { note: "top shelf", updatedAt: at(1) })];
    expect(mergeCopies(base, base, theirs)[0].note).toBe("top shelf");
  });

  it("keeps this side's change when the other side left the item alone", () => {
    const base = [item("1")];
    const mine = [item("1", { note: "mine", updatedAt: at(1) })];
    expect(mergeCopies(base, mine, base)[0].note).toBe("mine");
  });

  it("adds what each side added", () => {
    const base = [item("1")];
    const mine = [...base, item("2")];
    const theirs = [...base, item("3")];
    expect(mergeCopies(base, mine, theirs).map((i) => i.id).sort()).toEqual(["1", "2", "3"]);
  });

  it("deletes what the other side deleted", () => {
    const base = [item("1"), item("2")];
    expect(mergeCopies(base, base, [item("2")]).map((i) => i.id)).toEqual(["2"]);
  });

  it("keeps something deleted here gone", () => {
    const base = [item("1"), item("2")];
    expect(mergeCopies(base, [item("2")], base).map((i) => i.id)).toEqual(["2"]);
  });

  it("lets an edit outlive the other side deleting the item", () => {
    const base = [item("1")];
    const mine = [item("1", { note: "still here", updatedAt: at(1) })];
    expect(mergeCopies(base, mine, [])).toHaveLength(1);
    expect(mergeCopies(base, [], mine)).toHaveLength(1);
  });

  it("keeps both sides' edits to different fields of one item", () => {
    const base = [item("1")];
    const mine = [item("1", { note: "from the phone", updatedAt: at(1) })];
    const theirs = [item("1", { name: "Renamed", updatedAt: at(2) })];
    const [merged] = mergeCopies(base, mine, theirs);
    expect(merged.note).toBe("from the phone");
    expect(merged.name).toBe("Renamed");
  });

  it("lets the later edit win when both changed the same field", () => {
    const base = [item("1")];
    const early = [item("1", { note: "earlier", updatedAt: at(1) })];
    const late = [item("1", { note: "later", updatedAt: at(2) })];
    expect(mergeCopies(base, early, late)[0].note).toBe("later");
    expect(mergeCopies(base, late, early)[0].note).toBe("later");
  });

  it("counts both sides' stock changes: one used one, the other bought three", () => {
    const base = [item("1", { quantity: 5 })];
    const used = [item("1", { quantity: 4, updatedAt: at(1) })];
    const bought = [item("1", { quantity: 8, updatedAt: at(2) })];
    expect(mergeCopies(base, used, bought)[0].quantity).toBe(7);
    expect(mergeCopies(base, bought, used)[0].quantity).toBe(7);
  });

  it("never counts below zero", () => {
    const base = [item("1", { quantity: 1 })];
    const a = [item("1", { quantity: 0, updatedAt: at(1) })];
    const b = [item("1", { quantity: 0, updatedAt: at(2), note: "x" })];
    expect(mergeCopies(base, a, b)[0].quantity).toBe(0);
  });

  it("clears the date of stock that both sides' changes used up", () => {
    const expiryDate = "2026-06-01T00:00:00.000Z";
    const base = [item("1", { quantity: 2, expiryDate })];
    const a = [item("1", { quantity: 1, expiryDate, updatedAt: at(1) })];
    const b = [item("1", { quantity: 1, expiryDate, updatedAt: at(2) })];
    const [merged] = mergeCopies(base, a, b);
    expect(merged.quantity).toBe(0);
    expect(merged.expiryDate).toBeNull();
    expect(merged.expiryWanted).toBe(true);
  });

  it("keeps the history of both sides, once each", () => {
    const shared = { date: at(0), action: "Item added" };
    const base = [item("1", { history: [shared] })];
    const a = [
      item("1", { updatedAt: at(1), note: "a", history: [shared, { date: at(1), action: "Used one" }] }),
    ];
    const b = [
      item("1", { updatedAt: at(2), name: "b", history: [shared, { date: at(2), action: "Bought one" }] }),
    ];
    expect(mergeCopies(base, a, b)[0].history.map((h) => h.action)).toEqual([
      "Item added",
      "Used one",
      "Bought one",
    ]);
  });

  it("folds the same item added on both devices into one", () => {
    const mine = [item("a", { name: "Milk", quantity: 1 })];
    const theirs = [item("b", { name: "milk ", quantity: 2 })];
    const merged = mergeCopies([], mine, theirs);
    expect(merged).toHaveLength(1);
    expect(merged[0].quantity).toBe(3);
  });

  it("drops nothing when there's no base to compare with", () => {
    const merged = mergeCopies(null, [item("1"), item("2")], [item("2"), item("3")]);
    expect(merged.map((i) => i.id).sort()).toEqual(["1", "2", "3"]);
  });

  it("settles: the device that merges second sends nothing new", () => {
    const base = [item("1"), item("2")];
    const phone = [item("1", { note: "phone", updatedAt: at(1) }), item("2")];
    const laptop = [item("1"), item("2", { note: "laptop", updatedAt: at(2) })];
    // The laptop pushes first, the phone merges on top of it and pushes...
    const atServer = mergeCopies(base, phone, laptop);
    // ...and the laptop, unchanged since, ends up with exactly that.
    const back = mergeCopies(laptop, laptop, atServer);
    expect(sameItems(back, atServer)).toBe(true);
  });

  it("doesn't care what order the two lists are in, or the order of an item's fields", () => {
    const a = item("1");
    const shuffled = Object.fromEntries(Object.entries(a).reverse());
    expect(sameItems([a, item("2")], [item("2"), shuffled])).toBe(true);
    expect(sameItems([a], [item("1", { note: "x" })])).toBe(false);
  });
});

describe("the safety check on a merge", () => {
  const list = (n) => Array.from({ length: n }, (_, i) => item(String(i)));

  it("lets a few deletions through, even from a short list", () => {
    expect(tooManyGone(list(4), list(1))).toBe(false);
  });

  it("stops when most of the items would go", () => {
    expect(tooManyGone(list(10), list(4))).toBe(true);
  });

  it("isn't bothered by half or less going", () => {
    expect(tooManyGone(list(10), list(5))).toBe(false);
  });
});

describe("merging the person's categories", () => {
  const baby = { label: "Baby", room: "household" };
  const pets = { label: "Pets", room: "household" };

  it("keeps one added on either side", () => {
    expect(mergeCategories([], [baby], [pets])).toEqual([baby, pets]);
  });

  it("settles: the device that merges second takes the order it gets", () => {
    // The laptop's Pets reached the server first, and the phone merged it in...
    const atServer = mergeCategories([], [baby], [pets]);
    // ...and the laptop, unchanged since, ends up with that list as it is.
    expect(mergeCategories([pets], [pets], atServer)).toEqual(atServer);
  });

  it("puts one added here back after the one it followed, and both sides agree", () => {
    const toys = { label: "Toys", room: "household" };
    const laptop = [baby, pets];
    const atServer = mergeCategories([baby], [baby, toys], laptop);
    expect(atServer).toEqual([baby, toys, pets]);
    expect(mergeCategories(laptop, laptop, atServer)).toEqual(atServer);
  });

  it("drops one removed on either side", () => {
    expect(mergeCategories([baby], [], [baby])).toEqual([]);
    expect(mergeCategories([baby], [baby], [])).toEqual([]);
  });

  it("keeps everything when there's no base", () => {
    expect(mergeCategories(null, [baby], [pets])).toEqual([baby, pets]);
  });
});

describe("what a photo may point at", () => {
  it("keeps a photo on the home server that served the page", () => {
    expect(item("1", { imageUri: "/xrnhome/photos/a.jpg" }).imageUri).toBe(
      "/xrnhome/photos/a.jpg"
    );
  });

  it("still refuses a web address", () => {
    expect(item("1", { imageUri: "https://example.com/a.jpg" }).imageUri).toBeNull();
    expect(item("1", { imageUri: "//example.com/xrnhome/photos/a.jpg" }).imageUri).toBeNull();
    expect(item("1", { imageUri: "/other/a.jpg" }).imageUri).toBeNull();
  });
});

describe("a merge arriving in the store", () => {
  it("doesn't lose a tap made while the server's copy was on its way", () => {
    const base = [item("1", { quantity: 5 }), item("2")];
    const theirs = [item("1", { quantity: 5 }), item("2", { note: "theirs", updatedAt: at(1) })];
    const tapped = [item("1", { quantity: 6, updatedAt: at(2) }), item("2")];
    const state = reducer(
      { ...initialState, items: tapped, loading: false },
      { type: ACTIONS.MERGE_SERVER, payload: { base, theirs } }
    );
    expect(find(state.items, "1").quantity).toBe(6);
    expect(find(state.items, "2").note).toBe("theirs");
  });

  it("leaves the undo offer alone", () => {
    const undo = { type: "notice", label: "x" };
    const state = reducer(
      { ...initialState, items: [], undo, loading: false },
      { type: ACTIONS.MERGE_SERVER, payload: { base: [], theirs: [] } }
    );
    expect(state.undo).toBe(undo);
  });
});

