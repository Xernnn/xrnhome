import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { useTheme } from "../context/ThemeContext";
import {
  getExpiryStatus,
  getExpiryShortLabel,
  getExpiryLabel,
  getExpiryColor,
  hexToRgba,
  RADIUS,
} from "../utils/constants";

// Small colored pill showing expiry status. Renders nothing for fresh/no-date
// unless `showFresh` is set. Pass `full` for the longer label (used on detail).
export default function ExpiryPill({ item, full = false, showFresh = false }) {
  const { colors } = useTheme();
  const status = getExpiryStatus(item);
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (!status || (status === "fresh" && !showFresh)) {
    return null;
  }

  const color = getExpiryColor(status, colors);
  const label = full ? getExpiryLabel(item) : getExpiryShortLabel(item);
  const icon =
    status === "expired"
      ? "alert-circle"
      : status === "soon"
      ? "clock-alert-outline"
      : "calendar-check-outline";

  return (
    <View
      style={[styles.pill, { backgroundColor: hexToRgba(color, 0.16) }]}
      accessible
      accessibilityLabel={getExpiryLabel(item)}
    >
      <MaterialCommunityIcons name={icon} size={12} color={color} />
      <Text style={[styles.text, { color }]} numberOfLines={1}>
        {label}
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
      paddingVertical: 3,
      paddingHorizontal: 7,
      borderRadius: RADIUS.pill,
    },
    text: {
      fontSize: 11,
      fontWeight: "700",
      marginLeft: 3,
    },
  });
