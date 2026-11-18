// The laptop version has a box for adding things above the room's page, so the
// page's own + goes there; the phone keeps it.
import React from "react";
import TestRenderer, { act } from "react-test-renderer";

import { ThemeProvider } from "../src/context/ThemeContext";
import RoomScreen from "../src/screens/RoomScreen";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("expo-haptics", () => ({}));
jest.mock("react-native-safe-area-context", () =>
  require("react-native-safe-area-context/jest/mock").default
);
jest.mock("../src/context/InventoryContext", () => ({
  useInventory: () => ({ items: [], stepItem: jest.fn(), buyItem: jest.fn() }),
}));

const render = async (params) => {
  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <ThemeProvider>
        <RoomScreen navigation={{ navigate: jest.fn() }} route={{ params }} />
      </ThemeProvider>
    );
  });
  return renderer;
};

// The round button's label, once per button however deep it's drawn.
const addButtons = (renderer) =>
  renderer.root.findAll((node) => node.props.label === "Add to Food" && node.props.icon === "plus");

it("has its own + on the phone", async () => {
  expect(addButtons(await render({ room: "food" }))).toHaveLength(1);
});

it("leaves adding to the laptop's box", async () => {
  expect(addButtons(await render({ room: "food", quickAdd: true }))).toHaveLength(0);
});
