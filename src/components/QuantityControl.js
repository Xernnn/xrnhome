import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";

export default function QuantityControl({
  value,
  onChange,
  min = 0,
  max = 9999,
  step = 1,
  unitLabel = "",
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const decrease = () => {
    const next = value - step;
    if (next >= min) {
      onChange(next);
    } else if (value > min) {
      onChange(min);
    }
  };

  const increase = () => {
    const next = value + step;
    if (next <= max) {
      onChange(next);
    } else if (value < max) {
      onChange(max);
    }
  };

  const atMin = value <= min;
  const atMax = value >= max;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={decrease}
        disabled={atMin}
        style={[styles.button, atMin && styles.buttonDisabled]}
      >
        <MaterialCommunityIcons
          name="minus"
          size={20}
          color={atMin ? colors.textSecondary : colors.accent}
        />
      </TouchableOpacity>

      <View style={styles.valueWrap}>
        <Text style={styles.value}>
          {value}
          {unitLabel}
        </Text>
      </View>

      <TouchableOpacity
        activeOpacity={0.7}
        onPress={increase}
        disabled={atMax}
        style={[styles.button, atMax && styles.buttonDisabled]}
      >
        <MaterialCommunityIcons
          name="plus"
          size={20}
          color={atMax ? colors.textSecondary : colors.accent}
        />
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    container: {
      flexDirection: "row",
      alignItems: "center",
    },
    button: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.accentLight,
      alignItems: "center",
      justifyContent: "center",
    },
    buttonDisabled: {
      backgroundColor: colors.surfaceAlt,
    },
    valueWrap: {
      minWidth: 70,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 12,
    },
    value: {
      fontSize: 20,
      fontWeight: "700",
      color: colors.textPrimary,
    },
  });
