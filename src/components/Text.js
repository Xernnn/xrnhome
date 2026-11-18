// React Native's Text and TextInput in the family font. Every screen imports
// them from here rather than from react-native (test/font.test.js checks), since
// React Native has no app-wide default font: MiSans is registered on Android with
// one file per weight (app.json, expo-font), and in the browser by
// src/desktop/fonts.css, so `fontWeight` picks the right file in both.
import React from "react";
import { Text as RNText, TextInput as RNTextInput } from "react-native";

import { FONT_FAMILY } from "../utils/constants";

const FAMILY = { fontFamily: FONT_FAMILY };

export function Text({ style, ...props }) {
  return <RNText {...props} style={[FAMILY, style]} />;
}

export const TextInput = React.forwardRef(function TextInput({ style, ...props }, ref) {
  return <RNTextInput ref={ref} {...props} style={[FAMILY, style]} />;
});
