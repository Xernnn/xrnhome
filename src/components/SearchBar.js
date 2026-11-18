import React, { useMemo, useState } from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import { TextInput } from "./Text";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { RADIUS, SPACING } from "../utils/constants";
import { useTheme } from "../context/ThemeContext";

export default function SearchBar({
  value,
  onChangeText,
  placeholder = "Search",
  autoFocus = false,
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.container, focused && { borderColor: colors.accent }]}>
      <MaterialCommunityIcons
        name="magnify"
        size={20}
        color={colors.textSecondary}
        style={styles.leftIcon}
      />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        returnKeyType="search"
        autoCorrect={false}
        autoFocus={autoFocus}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityLabel="Search"
      />
      {value && value.length > 0 ? (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => onChangeText("")}
          style={styles.clearButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Clear the search"
        >
          <MaterialCommunityIcons
            name="close-circle"
            size={18}
            color={colors.textSecondary}
          />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    container: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 16,
      minHeight: 46,
    },
    leftIcon: {
      marginRight: SPACING.inner,
    },
    input: {
      flex: 1,
      fontSize: 16,
      color: colors.textPrimary,
      paddingVertical: 0,
    },
    clearButton: {
      marginLeft: SPACING.inner,
    },
  });
