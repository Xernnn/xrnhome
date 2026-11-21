// The smaller rules of how the screens look: the tile in place of the name, the
// shopping rule in figures, and pages that keep to the browser window.
const fs = require("fs");
const path = require("path");
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { Image } from "react-native";

import { Logo } from "../src/components/ui";
import { ThemeProvider } from "../src/context/ThemeContext";
import { restockFigures } from "../src/utils/constants";
import { formPage } from "../src/utils/webPages";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

const root = path.join(__dirname, "..");

describe("the logo", () => {
  it("is the launcher's tile, read out as the app's name", async () => {
    let renderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <ThemeProvider>
          <Logo size={30} />
        </ThemeProvider>
      );
    });
    const image = renderer.root.findByType(Image);
    expect(image.props.accessibilityLabel).toBe("xrnhome");
    expect(image.props.style).toMatchObject({ width: 30, height: 30 });
  });

  it("has the colour of the Android icon's background", () => {
    const svg = fs.readFileSync(path.join(root, "assets/icon.svg"), "utf8");
    const { adaptiveIcon } = require(path.join(root, "app.json")).expo.android;
    expect(svg).toContain(`fill="${adaptiveIcon.backgroundColor}"`);
  });

  it("tints notifications with that colour too", () => {
    const { expo } = require(path.join(root, "app.json"));
    const notifications = expo.plugins.find((plugin) => plugin[0] === "expo-notifications")[1];
    expect(notifications.color).toBe(expo.android.adaptiveIcon.backgroundColor);
  });

  it("replaces the old wordmark everywhere", () => {
    const files = ["src/components/ui.js", "src/screens/SettingsScreen.js", "src/desktop/DesktopApp.web.js"];
    for (const file of files) {
      expect([file, /Wordmark|home-variant/.test(fs.readFileSync(path.join(root, file), "utf8"))]).toEqual([file, false]);
    }
  });
});

describe("the shopping rule in figures", () => {
  it.each([
    [{ units: 2, percent: null, match: "all" }, "2 left"],
    [{ units: 0, percent: null, match: "all" }, "0 left"],
    [{ units: 1, percent: 20, match: "all" }, "1 left + 20%"],
    [{ units: 0, percent: 20, match: "all" }, "0 left"],
    [{ units: 2, percent: 30, match: "any" }, "2 left or 30%"],
    [{ units: 0, percent: 30, match: "any" }, "0 left or 30%"],
  ])("%j reads %s", (rule, text) => {
    expect(restockFigures(rule)).toBe(text);
  });
});

describe("a form's page in the browser", () => {
  it("keeps to the window's height, so its end can be scrolled to", () => {
    expect(formPage("web").cardStyle).toMatchObject({ flex: 1, overflow: "hidden" });
  });

  it("is left alone on the phone", () => {
    expect(formPage("android")).toEqual({});
  });
});
