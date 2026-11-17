import { normalizeItem } from "../src/utils/inventoryLogic";
import { rowStatus } from "../src/utils/constants";

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

describe("the line under an item's name in a list", () => {
  it("is empty when there is nothing to notice", () => {
    expect(rowStatus(make())).toEqual([]);
    // A date far off isn't news.
    expect(rowStatus(make({ expiryDate: dayFromNow(30) }))).toEqual([]);
  });

  it("says Expired in red", () => {
    expect(rowStatus(make({ expiryDate: dayFromNow(-2) }))).toEqual([
      { text: "Expired", tone: "danger" },
    ]);
  });

  it("says when a date is close, in amber", () => {
    expect(rowStatus(make({ expiryDate: dayFromNow(2) }))).toEqual([
      { text: "Expires in 2 days", tone: "warning" },
    ]);
  });

  it("says when it's on the shopping list, after the date", () => {
    expect(
      rowStatus(make({ expiryDate: dayFromNow(-1), wanted: true }))
    ).toEqual([
      { text: "Expired", tone: "danger" },
      { text: "On the list", tone: "accent" },
    ]);
    // Running low with "When it's running low" on puts it on the list too.
    expect(rowStatus(make({ quantity: 1, recurring: true, restockUnits: 1 }))).toEqual([
      { text: "On the list", tone: "accent" },
    ]);
  });

  it("says Ran out, and nothing about a date stock that's gone had", () => {
    expect(rowStatus(make({ quantity: 0, expiryDate: dayFromNow(-3) }))).toEqual([
      { text: "Ran out", tone: "muted" },
    ]);
  });
});
