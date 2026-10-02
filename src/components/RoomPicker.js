import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { RADIUS, ROOMS } from "../utils/constants";
import { useTheme } from "../context/ThemeContext";

export default function RoomPicker({ value, onChange }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      {ROOMS.map((room) => {
        const active = room.key === value;
        return (
          <TouchableOpacity
            key={room.key}
            activeOpacity={0.7}
            style={[styles.option, active && styles.optionActive]}
            onPress={() => onChange(room.key)}
          >
            <MaterialCommunityIcons
              name={room.icon}
              size={18}
              color={active ? colors.white : colors.textSecondary}
            />
            <Text style={[styles.optionText, active && styles.optionTextActive]}>
              {room.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    container: {
      flexDirection: "row",
      backgroundColor: colors.surfaceAlt,
      borderRadius: RADIUS.button,
      padding: 4,
    },
    option: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 10,
      borderRadius: RADIUS.button - 2,
    },
    optionActive: {
      backgroundColor: colors.accent,
    },
    optionText: {
      marginLeft: 6,
      fontSize: 15,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    optionTextActive: {
      color: colors.white,
    },
  });
