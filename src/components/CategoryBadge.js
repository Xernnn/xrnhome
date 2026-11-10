import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import {
  RADIUS,
  categoryColor,
  getCategoryMeta,
  mixHex,
} from "../utils/constants";

export default function CategoryBadge({ category, size = "medium" }) {
  const { colors, isDark } = useTheme();
  const meta = getCategoryMeta(category);
  const color = categoryColor(meta, isDark);
  const isSmall = size === "small";

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: mixHex(color, colors.surface, isDark ? 0.16 : 0.1),
          borderColor: mixHex(color, colors.surface, isDark ? 0.55 : 0.45),
          paddingVertical: isSmall ? 3 : 5,
          paddingHorizontal: isSmall ? 8 : 10,
        },
      ]}
    >
      <MaterialCommunityIcons
        name={meta.icon}
        size={isSmall ? 12 : 15}
        color={color}
        style={styles.icon}
      />
      <Text
        style={[
          styles.label,
          { color: colors.textPrimary, fontSize: isSmall ? 11 : 13 },
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
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  icon: {
    marginRight: 4,
  },
  label: {
    fontWeight: "600",
  },
});
