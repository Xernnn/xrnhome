// The Add and Edit form: everything in the order it's looked for, one Save, Delete
// last and only on Edit, and no sentences explaining it.
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { StyleSheet, Text as RNText } from "react-native";

import { ThemeProvider } from "../src/context/ThemeContext";
import ItemForm from "../src/components/ItemForm";
import { Stepper } from "../src/components/QuantityControl";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("expo-image-picker", () => ({}));
jest.mock("@react-native-community/datetimepicker", () => ({
  __esModule: true,
  default: () => null,
  DateTimePickerAndroid: { open: jest.fn() },
}));
jest.mock("react-native-safe-area-context", () =>
  require("react-native-safe-area-context/jest/mock").default
);
jest.mock("../src/context/InventoryContext", () => ({
  useInventory: () => ({ items: [], addCategory: jest.fn() }),
}));

const navigation = { addListener: jest.fn(() => () => {}), dispatch: jest.fn() };

const soySauce = {
  id: "1",
  name: "Soy sauce",
  room: "food",
  category: "Spices & Sauces",
  quantity: 2,
  unit: "bottles",
  openedPercent: 30,
  recurring: true,
  restockUnits: 1,
  restockPercent: 20,
  restockMatch: "all",
  expiryDate: "2026-12-01T12:00:00.000Z",
  note: "",
};

// The switches animate; their timers mustn't outlive the test.
jest.useFakeTimers();
const rendered = [];
afterEach(async () => {
  await act(async () => {
    rendered.splice(0).forEach((renderer) => renderer.unmount());
    jest.runOnlyPendingTimers();
  });
});

const render = async (props) => {
  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <ThemeProvider>
        <ItemForm navigation={navigation} onSave={jest.fn()} onCancel={jest.fn()} {...props} />
      </ThemeProvider>
    );
  });
  rendered.push(renderer);
  return renderer;
};

// Every string on the page, top to bottom.
const words = (renderer) =>
  renderer.root
    .findAll((node) => node.type === RNText)
    .map((node) => [].concat(node.props.children).filter((c) => typeof c === "string").join(""))
    .filter(Boolean);

const saveButton = (renderer) =>
  renderer.root.find((node) => node.props.label === "Save" && "disabled" in node.props);

describe("the item form", () => {
  it("goes photo, name, category, amount, expiry, shopping list, note, then Delete", async () => {
    const renderer = await render({ mode: "edit", initial: soySauce, onDelete: jest.fn() });
    const all = renderer.root.findAll((node) => typeof node.props.accessibilityLabel === "string");
    const labels = all.map((node) => node.props.accessibilityLabel);
    expect(labels.indexOf("Add a photo")).toBeLessThan(labels.indexOf("Item name"));

    const text = words(renderer);
    const order = [
      "Category",
      "Count",
      "Unit",
      "Track in %",
      "Expiry date",
      "When it's running low",
      "Note",
      "Delete item",
    ].map((word) => text.indexOf(word));
    expect(order).not.toContain(-1);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(labels.indexOf("Item name")).toBeLessThan(labels.indexOf("Note"));
  });

  it("explains nothing: no questions, hints or sentences", async () => {
    const renderer = await render({ mode: "add", initial: { room: "food", name: "" } });
    const edit = await render({ mode: "edit", initial: soySauce, onDelete: jest.fn() });
    for (const line of [...words(renderer), ...words(edit)]) {
      expect(line).not.toMatch(/[.?]$|Give it a name|Goes on the list|Anything to remember/);
      expect(line.split(" ").length).toBeLessThanOrEqual(4);
    }
  });

  it("has one Save, waiting for a name", async () => {
    const renderer = await render({ mode: "add", initial: { room: "food", name: "" } });
    expect(renderer.root.findAll((node) => node.props.label === "Save" && "disabled" in node.props)).toHaveLength(1);
    expect(saveButton(renderer).props.disabled).toBe(true);
    const name = renderer.root.findByProps({ accessibilityLabel: "Item name" });
    await act(async () => name.props.onChangeText("Oat milk"));
    expect(saveButton(renderer).props.disabled).toBe(false);
    expect(words(renderer)).not.toContain("Delete item");
  });

  it("lines its steppers up: each is as wide as the others", async () => {
    const renderer = await render({ mode: "edit", initial: soySauce, onDelete: jest.fn() });
    const steppers = renderer.root.findAllByType(Stepper);
    // Count, the open one, and the shopping list's two.
    expect(steppers).toHaveLength(4);
    const widths = steppers.map((stepper) => [stepper.props.size, stepper.props.valueWidth]);
    expect(new Set(widths.map(String)).size).toBe(1);
    expect(widths[0][1]).toBeGreaterThan(0);
  });

  it("keeps each row's label on the left of what sets it", async () => {
    const renderer = await render({ mode: "edit", initial: soySauce, onDelete: jest.fn() });
    const label = renderer.root.find(
      (node) => node.type === RNText && node.props.children === "Count"
    );
    const row = label.parent.parent;
    expect(StyleSheet.flatten(row.props.style).flexDirection).toBe("row");
  });
});
