import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SPACING, TYPE } from "../utils/constants";
import { useTheme } from "../context/ThemeContext";

export default function EmptyState({
  icon = "fridge-outline",
  title = "Nothing here yet",
  subtitle = "",
  actionLabel = null,
  onAction = null,
  actionIcon = "plus",
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <MaterialCommunityIcons name={icon} size={48} color={colors.textSecondary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {actionLabel && onAction ? (
        <TouchableOpacity
          activeOpacity={0.7}
          style={styles.button}
          onPress={onAction}
          accessibilityRole="button"
        >
          <MaterialCommunityIcons
            name={actionIcon}
            size={18}
            color={colors.onAccent}
            style={styles.buttonIcon}
          />
          <Text style={styles.buttonText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: SPACING.screen * 2,
      paddingVertical: 48,
    },
    iconCircle: {
      width: 96,
      height: 96,
      borderRadius: 48,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: SPACING.screen,
    },
    title: {
      ...TYPE.title,
      color: colors.textPrimary,
      textAlign: "center",
      marginBottom: SPACING.inner,
    },
    subtitle: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: "center",
      lineHeight: 20,
      marginBottom: SPACING.screen,
    },
    button: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.accent,
      minHeight: 50,
      paddingHorizontal: 24,
      borderRadius: 25,
      marginTop: SPACING.inner,
    },
    buttonIcon: {
      marginRight: 6,
    },
    buttonText: {
      ...TYPE.button,
      color: colors.onAccent,
    },
  });
