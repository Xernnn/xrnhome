import React, { useMemo } from "react";
import { View, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { RADIUS, SPACING } from "../utils/constants";
import { useTheme } from "../context/ThemeContext";

export default function SearchBar({
  value,
  onChangeText,
  placeholder = "Search items...",
  autoFocus = false,
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
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
      />
      {value && value.length > 0 ? (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => onChangeText("")}
          style={styles.clearButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
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
      backgroundColor: colors.surfaceAlt,
      borderRadius: RADIUS.pill,
      paddingHorizontal: SPACING.card,
      height: 44,
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
