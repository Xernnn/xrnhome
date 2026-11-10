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
import { pickDate } from "../utils/datePicker";
import { SPACING, SHADOW } from "../utils/constants";

const SHOW_FOR = { delete: 4500, change: 4500, expiry: 7000, notice: 3000 };
const ICONS = {
  delete: "trash-can-outline",
  change: "undo-variant",
  expiry: "calendar-alert",
  notice: "information-outline",
};
const ACTIONS = { delete: "Undo", change: "Undo", expiry: "Set date" };

// The one toast: a deletion or a costly step that can be undone, a new expiry
// date that's needed, or a word about what just happened.
export default function UndoToast() {
  const { undo, undoDelete, clearUndo, updateItem } = useInventory();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;
  const timerRef = useRef(null);

  useEffect(() => {
    if (undo) {
      AccessibilityInfo.announceForAccessibility?.(
        ACTIONS[undo.type] ? `${undo.label}. ${ACTIONS[undo.type]} available.` : undo.label
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

      timerRef.current = setTimeout(clearUndo, SHOW_FOR[undo.type] || 4500);
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
  }, [undo, clearUndo, opacity, translateY]);

  if (!undo) {
    return null;
  }

  const handleAction = async () => {
    haptics.light();
    if (undo.type !== "expiry") {
      undoDelete();
      return;
    }
    const { id } = undo;
    clearUndo();
    const picked = await pickDate(new Date());
    if (picked) {
      updateItem(id, { expiryDate: picked.toISOString() }, { action: "Set the expiry date" });
    }
  };

  const action = ACTIONS[undo.type];

  return (
    <Animated.View
      style={[
        styles.container,
        { bottom: insets.bottom + 82, opacity, transform: [{ translateY }] },
      ]}
      pointerEvents="box-none"
    >
      <Animated.View style={styles.toast}>
        <MaterialCommunityIcons
          name={ICONS[undo.type]}
          size={18}
          color={colors.inverseText}
        />
        <Text style={styles.text} numberOfLines={2}>
          {undo.label}
        </Text>
        {action ? (
          <TouchableOpacity
            onPress={handleAction}
            activeOpacity={0.7}
            style={styles.actionButton}
            accessibilityRole="button"
            accessibilityLabel={action}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.actionText}>{action}</Text>
          </TouchableOpacity>
        ) : null}
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
      backgroundColor: colors.inverseSurface,
      borderRadius: 16,
      paddingVertical: 14,
      paddingHorizontal: 16,
      width: "100%",
      ...SHADOW,
    },
    text: {
      flex: 1,
      color: colors.inverseText,
      fontSize: 14,
      fontWeight: "500",
      marginLeft: 10,
    },
    actionButton: {
      paddingHorizontal: SPACING.inner,
      paddingVertical: 4,
    },
    actionText: {
      color: colors.inverseAccent,
      fontSize: 15,
      fontWeight: "600",
    },
  });
