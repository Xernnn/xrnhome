import React, { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Text,
  TouchableOpacity,
  StyleSheet,
  AccessibilityInfo,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { useInventory } from "../context/InventoryContext";
import { useTheme } from "../context/ThemeContext";
import { haptics } from "../utils/haptics";
import { SPACING, RADIUS } from "../utils/constants";

const UNDO_DURATION = 4500;

export default function UndoToast() {
  const { undo, undoDelete, clearUndo } = useInventory();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;
  const timerRef = useRef(null);

  const visible = !!undo;
  const itemName = undo?.item?.name;

  useEffect(() => {
    if (visible) {
      AccessibilityInfo.announceForAccessibility?.(
        `${itemName || "Item"} deleted. Undo available.`
      );
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
        }),
      ]).start();

      timerRef.current = setTimeout(() => {
        clearUndo();
      }, UNDO_DURATION);
    } else {
      opacity.setValue(0);
      translateY.setValue(20);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [visible, itemName, clearUndo, opacity, translateY]);

  if (!visible) {
    return null;
  }

  const handleUndo = () => {
    haptics.light();
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    undoDelete();
  };

  return (
    <Animated.View
      style={[
        styles.container,
        { bottom: insets.bottom + 72, opacity, transform: [{ translateY }] },
      ]}
      pointerEvents="box-none"
    >
      <Animated.View style={styles.toast}>
        <MaterialCommunityIcons
          name="trash-can-outline"
          size={18}
          color={colors.white}
        />
        <Text style={styles.text} numberOfLines={1}>
          {itemName ? `"${itemName}" deleted` : "Item deleted"}
        </Text>
        <TouchableOpacity
          onPress={handleUndo}
          activeOpacity={0.7}
          style={styles.undoButton}
          accessibilityRole="button"
          accessibilityLabel="Undo delete"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.undoText}>UNDO</Text>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    container: {
      position: "absolute",
      left: SPACING.screen,
      right: SPACING.screen,
      alignItems: "center",
    },
    toast: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "#323232",
      borderRadius: RADIUS.button,
      paddingVertical: 12,
      paddingHorizontal: SPACING.card,
      width: "100%",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 6,
    },
    text: {
      flex: 1,
      color: colors.white,
      fontSize: 14,
      fontWeight: "600",
      marginLeft: SPACING.inner,
    },
    undoButton: {
      paddingHorizontal: SPACING.inner,
      paddingVertical: 4,
    },
    undoText: {
      color: "#80CBC4",
      fontSize: 14,
      fontWeight: "800",
      letterSpacing: 0.5,
    },
  });
