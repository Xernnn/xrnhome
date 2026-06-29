import React, { useMemo } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  RADIUS,
  SHADOW,
  getCategoryMeta,
  hexToRgba,
  isTrackingOpened,
} from "../utils/constants";
import { useTheme } from "../context/ThemeContext";

export const ITEM_CARD_WIDTH = 172;

export default function ItemCard({ item, onPress, onStep }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const meta = getCategoryMeta(item.category);
  const hasImage = !!item.imageUri;
  const tracking = isTrackingOpened(item);

  const bigValue = tracking ? `${item.openedPercent}%` : `${item.quantity}`;
  const controlCaption = tracking ? "opened unit" : item.unit;

  const handleStep = (dir) => {
    if (onStep) {
      onStep(item, dir);
    }
  };

  return (
    <TouchableOpacity activeOpacity={0.7} style={styles.card} onPress={onPress}>
      <View style={styles.imageWrap}>
        {hasImage ? (
          <Image source={{ uri: item.imageUri }} style={styles.image} />
        ) : (
          <View
            style={[
              styles.placeholder,
              { backgroundColor: hexToRgba(meta.color, 0.18) },
            ]}
          >
            <MaterialCommunityIcons
              name={meta.icon}
              size={44}
              color={meta.color}
            />
          </View>
        )}

        {item.recurring ? (
          <View style={styles.recurringBadge}>
            <MaterialCommunityIcons
              name="cart"
              size={13}
              color={colors.white}
            />
          </View>
        ) : null}

        {tracking ? (
          <View style={styles.openedBadge}>
            <Text style={styles.openedBadgeText}>{item.openedPercent}%</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {item.quantity} {item.unit}
          {tracking ? " sealed" : ""}
        </Text>
      </View>

      <View style={styles.controlRow}>
        <TouchableOpacity
          activeOpacity={0.7}
          style={styles.stepButton}
          onPress={() => handleStep(-1)}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <MaterialCommunityIcons name="minus" size={18} color={colors.accent} />
        </TouchableOpacity>

        <View style={styles.valueWrap}>
          <Text style={styles.value}>{bigValue}</Text>
          <Text style={styles.valueCaption} numberOfLines={1}>
            {controlCaption}
          </Text>
        </View>

        <TouchableOpacity
          activeOpacity={0.7}
          style={styles.stepButton}
          onPress={() => handleStep(1)}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <MaterialCommunityIcons name="plus" size={18} color={colors.accent} />
        </TouchableOpacity>
      </View>

      <View style={[styles.colorStrip, { backgroundColor: meta.color }]} />
    </TouchableOpacity>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    card: {
      width: ITEM_CARD_WIDTH,
      backgroundColor: colors.surface,
      borderRadius: RADIUS.card,
      overflow: "hidden",
      ...SHADOW,
    },
    imageWrap: {
      width: "100%",
      height: 130,
      backgroundColor: colors.surfaceAlt,
    },
    image: {
      width: "100%",
      height: "100%",
      resizeMode: "cover",
    },
    placeholder: {
      width: "100%",
      height: "100%",
      alignItems: "center",
      justifyContent: "center",
    },
    recurringBadge: {
      position: "absolute",
      top: 8,
      left: 8,
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
      ...SHADOW,
    },
    openedBadge: {
      position: "absolute",
      top: 8,
      right: 8,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.surface,
      ...SHADOW,
    },
    openedBadgeText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.accent,
    },
    body: {
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: 6,
    },
    name: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.textPrimary,
      lineHeight: 19,
      minHeight: 38,
    },
    subtitle: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 4,
    },
    controlRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 10,
      paddingBottom: 10,
      paddingTop: 2,
    },
    stepButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.accentLight,
      alignItems: "center",
      justifyContent: "center",
    },
    valueWrap: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    value: {
      fontSize: 18,
      fontWeight: "800",
      color: colors.textPrimary,
    },
    valueCaption: {
      fontSize: 10,
      color: colors.textSecondary,
      marginTop: 1,
    },
    colorStrip: {
      height: 4,
      width: "100%",
    },
  });
