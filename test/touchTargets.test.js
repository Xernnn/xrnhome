// The − and + buttons take touches over Android's 48 dp, however small they're drawn.
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { StyleSheet, TouchableOpacity } from "react-native";

import { ThemeProvider } from "../src/context/ThemeContext";
import ItemCard from "../src/components/ItemCard";
import { Stepper } from "../src/components/QuantityControl";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

// The card's stepper sits 5 dp in from the card's edges, and the card clips
// touches there: slop past that never gets a touch.
const CARD_PADDING = 5;

const render = async (element) => {
  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(<ThemeProvider>{element}</ThemeProvider>);
  });
  return renderer;
};

// [across, down] in dp that a button takes touches over; `outerLimit` caps the
// slop on the side away from the other button.
const target = (button, side, outerLimit = Infinity) => {
  const { width, height } = StyleSheet.flatten(button.props.style);
  const { top, bottom, left, right } = button.props.hitSlop;
  const outer = side === "minus" ? left : right;
  const inner = side === "minus" ? right : left;
  return [width + Math.min(outer, outerLimit) + inner, height + top + bottom];
};

const buttons = (renderer) =>
  renderer.root.findAll(
    (node) => node.type === TouchableOpacity && /^(Use|Add|Less|More|Bought)/.test(node.props.accessibilityLabel || "")
  );

it("on an item card reach 48 dp each way inside the card, and leave the value between them", async () => {
  const item = { id: "1", name: "Milk", category: "Fridge", room: "food", quantity: 2, unit: "unit" };
  const renderer = await render(
    <ItemCard item={item} width={96} onOpen={() => {}} onStep={() => {}} onBuy={() => {}} />
  );
  const [minus, plus] = buttons(renderer);
  expect(target(minus, "minus", CARD_PADDING)).toEqual([48, 50]);
  expect(target(plus, "plus", CARD_PADDING)).toEqual([48, 50]);
  // A 96 dp card (a 360 dp phone) has 86 dp for both buttons and the value.
  const between = 96 - 2 * CARD_PADDING - 2 * StyleSheet.flatten(minus.props.style).width;
  expect(minus.props.hitSlop.right + plus.props.hitSlop.left).toBeLessThanOrEqual(between);
});

it.each([30, 38])("of a %i dp stepper reach 48 dp each way", async (size) => {
  const renderer = await render(
    <Stepper size={size} onMinus={() => {}} onPlus={() => {}}>
      {null}
    </Stepper>
  );
  const [minus, plus] = buttons(renderer);
  for (const [button, side] of [[minus, "minus"], [plus, "plus"]]) {
    const [across, down] = target(button, side);
    expect(across).toBeGreaterThanOrEqual(48);
    expect(down).toBeGreaterThanOrEqual(48);
  }
});
