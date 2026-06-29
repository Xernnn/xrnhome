import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { RADIUS, getCategoryMeta, hexToRgba } from "../utils/constants";

export default function CategoryBadge({ category, size = "medium" }) {
  const meta = getCategoryMeta(category);
  const isSmall = size === "small";

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: hexToRgba(meta.color, 0.18),
          paddingVertical: isSmall ? 3 : 5,
          paddingHorizontal: isSmall ? 8 : 10,
        },
      ]}
    >
      <MaterialCommunityIcons
        name={meta.icon}
        size={isSmall ? 12 : 15}
        color={meta.color}
        style={styles.icon}
      />
      <Text
        style={[
          styles.label,
          { color: meta.color, fontSize: isSmall ? 11 : 13 },
        ]}
        numberOfLines={1}
      >
        {meta.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: RADIUS.pill,
    alignSelf: "flex-start",
  },
  icon: {
    marginRight: 4,
  },
  label: {
    fontWeight: "600",
  },
});
