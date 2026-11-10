import AsyncStorage from "@react-native-async-storage/async-storage";

import { clearRecoveredMark, loadItems, saveItems } from "../src/utils/storage";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

const KEY = "xrnhome_items";

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe("reading the saved items", () => {
  it("reads a healthy list", async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify([{ id: "1" }]));
    expect(await loadItems()).toEqual({ status: "ok", items: [{ id: "1" }] });
  });

  it("treats nothing saved as an empty list", async () => {
    expect(await loadItems()).toEqual({ status: "ok", items: [] });
  });

  it("recovers what it can from a damaged list and keeps the damaged text", async () => {
    const text = JSON.stringify([{ id: "1" }, { id: "2" }, { id: "3" }]);
    const cut = text.slice(0, text.length - 5);
    await AsyncStorage.setItem(KEY, cut);
    const result = await loadItems();
    expect(result.status).toBe("recovered");
    expect(result.items.map((i) => i.id)).toEqual(["1", "2"]);
    expect(await AsyncStorage.getItem("xrnhome_items_damaged")).toBe(cut);
  });

  it("prefers the safe copy when it holds more", async () => {
    await AsyncStorage.setItem(KEY, "[{broken");
    await AsyncStorage.setItem(
      "xrnhome_items_safe",
      JSON.stringify([{ id: "1" }, { id: "2" }])
    );
    const result = await loadItems();
    expect(result.status).toBe("recovered");
    expect(result.items).toHaveLength(2);
  });

  it("still calls a recovered list recovered on the next launch, until it's dealt with", async () => {
    const text = JSON.stringify([{ id: "1" }, { id: "2" }, { id: "3" }]);
    await AsyncStorage.setItem(KEY, text.slice(0, text.length - 5));
    const { items } = await loadItems();
    // The app saves what came back over the damaged copy straight away.
    await saveItems(items);
    expect(await loadItems()).toEqual({ status: "recovered", items });
    await clearRecoveredMark();
    expect(await loadItems()).toEqual({ status: "ok", items });
  });

  it("calls it unreadable rather than empty when nothing can be got back", async () => {
    await AsyncStorage.setItem(KEY, "complete rubbish");
    expect((await loadItems()).status).toBe("unreadable");
  });

  it("calls it unreadable when the read itself fails", async () => {
    AsyncStorage.getItem.mockImplementationOnce(async () => {
      throw new Error("disk trouble");
    });
    expect((await loadItems()).status).toBe("unreadable");
  });

  it("reports a failed save", async () => {
    AsyncStorage.setItem.mockImplementationOnce(async () => {
      throw new Error("no space");
    });
    expect(await saveItems([])).toBe(false);
  });
});
