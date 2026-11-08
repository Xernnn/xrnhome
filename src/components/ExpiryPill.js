import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { useTheme } from "../context/ThemeContext";
import {
  getExpiryStatus,
  getExpiryShortLabel,
  getExpiryLabel,
  getExpiryColor,
  RADIUS,
} from "../utils/constants";

// A small line saying how an item's date stands, on the status's own tint.
// Renders nothing for an item with no date or one that's far off.
export default function ExpiryPill({ item }) {
  const { colors } = useTheme();
  const status = getExpiryStatus(item);
  const styles = useMemo(() => createStyles(), []);

  if (status !== "expired" && status !== "soon") {
    return null;
  }

  const expired = status === "expired";
  const color = getExpiryColor(status, colors);

  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: expired ? colors.dangerLight : colors.warningLight },
      ]}
      accessible
      accessibilityLabel={getExpiryLabel(item)}
    >
      <MaterialCommunityIcons
        name={expired ? "alert-circle" : "clock-alert-outline"}
        size={12}
        color={color}
      />
      <Text style={[styles.text, { color }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>
        {getExpiryShortLabel(item)}
      </Text>
    </View>
  );
}

const createStyles = () =>
  StyleSheet.create({
    pill: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      paddingVertical: 2,
      paddingHorizontal: 6,
      borderRadius: RADIUS.pill,
    },
    text: {
      flexShrink: 1,
      fontSize: 11,
      fontWeight: "700",
      marginLeft: 3,
    },
  });
