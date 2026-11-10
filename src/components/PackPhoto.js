import React, { useMemo, useState } from "react";
import { Image, Platform, StyleSheet, Text, View } from "react-native";

import {
  FONTS,
  PACK_INK,
  hexToRgba,
  isTrackingOpened,
} from "../utils/constants";
import { Pop } from "./ui";

export const ARCH_RATIO = 0.84; // height over width
const LABEL_FLIP = 86; // from here up the % sits under the line, clear of the arch
const LEVEL_WEB = Platform.OS === "web" ? { dataSet: { level: "1" } } : null;

// The photo in its arch. Something counted in % shows what's left of the open one
// as a line across the photo, so a half-empty bottle looks half empty. An item
// with no photo shows its first letter instead, unless the line needs the room.
// `children` sit on top.
//
// `width` is for lists, which know it already. Without it the arch measures itself.
export default function PackPhoto({ item, width, photoRef, style, children }) {
  const [measured, setMeasured] = useState(0);
  const [failed, setFailed] = useState(null);
  const side = width || measured;
  const styles = useMemo(() => createStyles(side), [side]);

  const open =
    isTrackingOpened(item) && item.quantity > 0 && item.openedPercent < 100
      ? item.openedPercent
      : null;
  const showPhoto = !!item.imageUri && failed !== item.imageUri;

  return (
    <View
      ref={photoRef}
      style={[styles.arch, style]}
      onLayout={
        width ? undefined : (event) => setMeasured(event.nativeEvent.layout.width)
      }
    >
      {showPhoto ? (
        <Image
          source={{ uri: item.imageUri }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onError={() => setFailed(item.imageUri)}
        />
      ) : open === null ? (
        <Text style={styles.letter} maxFontSizeMultiplier={1}>
          {item.name.trim().charAt(0).toUpperCase()}
        </Text>
      ) : null}
      {open !== null ? (
        <>
          <View style={[styles.empty, { height: `${100 - open}%` }]} {...LEVEL_WEB} />
          <View style={[styles.line, { top: `${100 - open}%` }]} {...LEVEL_WEB}>
            <Pop
              value={open}
              style={[styles.percent, open >= LABEL_FLIP ? styles.percentBelow : null]}
            >
              <Text style={styles.percentText} maxFontSizeMultiplier={1.2}>
                {open}%
              </Text>
            </Pop>
          </View>
        </>
      ) : null}
      {children}
    </View>
  );
}

const createStyles = (side) =>
  StyleSheet.create({
    arch: {
      width: "100%",
      aspectRatio: 1 / ARCH_RATIO,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      backgroundColor: hexToRgba(PACK_INK, 0.16),
      borderTopLeftRadius: side / 2,
      borderTopRightRadius: side / 2,
      borderBottomLeftRadius: 16,
      borderBottomRightRadius: 16,
    },
    letter: {
      fontFamily: FONTS.mono,
      fontSize: Math.max(side * 0.34, 20),
      color: PACK_INK,
    },
    empty: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      backgroundColor: "rgba(0,0,0,0.5)",
    },
    line: {
      position: "absolute",
      left: 0,
      right: 0,
      height: 2,
      alignItems: "center",
      backgroundColor: PACK_INK,
    },
    percent: {
      position: "absolute",
      bottom: 4,
    },
    percentBelow: {
      bottom: undefined,
      top: 6,
    },
    percentText: {
      fontFamily: FONTS.mono,
      fontSize: Math.max(13, side * 0.075),
      color: PACK_INK,
      textShadowColor: "rgba(0,0,0,0.6)",
      textShadowRadius: 3,
      textShadowOffset: { width: 0, height: 1 },
    },
  });
