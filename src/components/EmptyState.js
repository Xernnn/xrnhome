import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { RADIUS, SPACING } from "../utils/constants";
import { useTheme } from "../context/ThemeContext";

export default function EmptyState({
  icon = "fridge-outline",
  title = "Nothing here yet",
  subtitle = "",
  actionLabel = null,
  onAction = null,
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <MaterialCommunityIcons name={icon} size={56} color={colors.accent} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {actionLabel && onAction ? (
        <TouchableOpacity
          activeOpacity={0.7}
          style={styles.button}
          onPress={onAction}
        >
          <MaterialCommunityIcons
            name="plus"
            size={18}
            color={colors.white}
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
      width: 110,
      height: 110,
      borderRadius: 55,
      backgroundColor: colors.accentLight,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: SPACING.screen,
    },
    title: {
      fontSize: 18,
      fontWeight: "700",
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
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: RADIUS.button,
      marginTop: SPACING.inner,
    },
    buttonIcon: {
      marginRight: 6,
    },
    buttonText: {
      color: colors.white,
      fontSize: 16,
      fontWeight: "600",
    },
  });
