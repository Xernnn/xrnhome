import { blobRows, columnsFor } from "../src/utils/blobLayout";

const group = (label, n) => ({
  meta: { label, icon: "cup", color: "#0891B2" },
  items: Array.from({ length: n }, (_, i) => ({ id: `${label}${i}` })),
});
const labelsOf = (row) => row.labels.map((l) => [l.meta.label, l.start, l.span, l.count]);

describe("the category grid", () => {
  it("fits three cards a row on a phone, and more only when they'd stay as wide", () => {
    expect(columnsFor(366)).toBe(3);
    expect(columnsFor(200)).toBe(3);
    expect(columnsFor(1100)).toBe(7);
  });

  it("runs groups on from one another, so no row is left half empty", () => {
    const rows = blobRows([group("Cereal", 2), group("Drinks", 4), group("Fridge", 1)], 3);
    expect(rows.map((row) => row.cells.map((cell) => cell.item.id))).toEqual([
      ["Cereal0", "Cereal1", "Drinks0"],
      ["Drinks1", "Drinks2", "Drinks3"],
      ["Fridge0"],
    ]);
  });

  it("labels a group once where its blob starts, with its count", () => {
    const rows = blobRows([group("Cereal", 2), group("Drinks", 4), group("Fridge", 1)], 3);
    expect(labelsOf(rows[0])).toEqual([
      ["Cereal", 0, 2, 2],
      ["Drinks", 2, 1, 4],
    ]);
    // The rest of Drinks touches its first card from below: one L-shaped blob.
    expect(labelsOf(rows[1])).toEqual([]);
    expect(labelsOf(rows[2])).toEqual([["Fridge", 0, 1, 1]]);
  });

  it("joins touching cards of a group and keeps the inside corner of an L clean", () => {
    const [top, middle] = blobRows([group("Cereal", 2), group("Drinks", 4)], 3);
    expect(top.joins[0]).toMatchObject({ right: true, down: false });
    expect(top.joins[2]).toMatchObject({ left: false, down: true });
    expect(middle.joins[2]).toMatchObject({ up: true, left: true, upLeft: false });
    expect(middle.joins[1]).toMatchObject({ up: false, upRight: false });
  });

  it("labels a group again where it wraps and no longer touches its first part", () => {
    const rows = blobRows([group("Cereal", 1), group("Noodles", 1), group("Drinks", 2)], 3);
    expect(labelsOf(rows[0]).map(([label]) => label)).toEqual(["Cereal", "Noodles", "Drinks"]);
    expect(labelsOf(rows[1])).toEqual([["Drinks", 0, 1, 2]]);
  });
});
