// MiSans is the family's font, for every piece of text on the phone and in the
// browser. React Native has no default font of its own to set, so every screen
// takes Text and TextInput from src/components/Text.js, and each weight the app
// asks for has a file of its own on Android and in the stylesheet.
const fs = require("fs");
const path = require("path");
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { StyleSheet, Text as RNText } from "react-native";

import { Text } from "../src/components/Text";
import { FONT_FAMILY } from "../src/utils/constants";

const root = path.join(__dirname, "..");
const WEIGHTS = [400, 500, 600, 700];

const sources = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? sources(file) : /\.js$/.test(entry.name) ? [file] : [];
  });

test("no screen takes Text or TextInput straight from react-native", () => {
  const files = [path.join(root, "App.js"), ...sources(path.join(root, "src"))].filter(
    (file) => !file.endsWith(path.join("components", "Text.js"))
  );
  const offenders = files.filter((file) => {
    const text = fs.readFileSync(file, "utf8");
    return [...text.matchAll(/import\s*\{([^}]*)\}\s*from\s*"react-native"/g)].some((m) =>
      m[1].split(",").some((name) => ["Text", "TextInput"].includes(name.trim()))
    );
  });
  expect(offenders.map((file) => path.relative(root, file))).toEqual([]);
});

test("Text draws in MiSans, under whatever style the screen gives it", async () => {
  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(<Text style={{ fontWeight: "600", color: "red" }}>12</Text>);
  });
  const style = StyleSheet.flatten(renderer.root.findByType(RNText).props.style);
  expect(style).toEqual({ fontFamily: "MiSans", fontWeight: "600", color: "red" });
  expect(FONT_FAMILY).toBe("MiSans");
});

test("Android gets one MiSans file per weight, none of them the Bold or Heavy that draw @ as &", () => {
  const plugins = require(path.join(root, "app.json")).expo.plugins;
  const font = plugins.find((entry) => Array.isArray(entry) && entry[0] === "expo-font");
  const [family] = font[1].android.fonts;
  expect(family.fontFamily).toBe(FONT_FAMILY);
  expect(family.fontDefinitions.map((d) => d.weight)).toEqual(WEIGHTS);
  for (const { path: file } of family.fontDefinitions) {
    expect(fs.existsSync(path.join(root, file))).toBe(true);
    expect(file).not.toMatch(/Bold\.ttf|Heavy/);
  }
});

test("the browser gets the same file for each weight as Android", () => {
  const css = fs.readFileSync(path.join(root, "src/desktop/fonts.css"), "utf8");
  const faces = [...css.matchAll(/font-family: "MiSans";\s*src: url\("\/xrnhome\/fonts\/([^"]+)"\)[^}]*font-weight: ([\d ]+);/g)];
  const plugins = require(path.join(root, "app.json")).expo.plugins;
  const android = plugins.find((entry) => Array.isArray(entry) && entry[0] === "expo-font")[1]
    .android.fonts[0].fontDefinitions;
  expect(faces).toHaveLength(WEIGHTS.length);
  faces.forEach(([, file, weights], i) => {
    expect(fs.existsSync(path.join(root, "public/fonts", file))).toBe(true);
    expect(weights.split(" ").map(Number)).toContain(WEIGHTS[i]);
    expect(path.basename(android[i].path, ".ttf")).toBe(path.basename(file, ".woff2"));
  });
});

test("nothing asks for the font the app used before", () => {
  const files = [path.join(root, "App.js"), ...sources(path.join(root, "src"))];
  const css = path.join(root, "src/desktop/desktop.css");
  const mentions = [...files, css].filter((file) => /Geist/.test(fs.readFileSync(file, "utf8")));
  expect(mentions.map((file) => path.relative(root, file))).toEqual([]);
});
