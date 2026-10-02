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
  isExpiringSoon,
  isTrackingOpened,
} from "../utils/constants";
import { useTheme } from "../context/ThemeContext";
import ExpiryPill from "./ExpiryPill";

export default function ItemCard({ item, width, onPress, onStep }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const meta = getCategoryMeta(item.category);
  const hasImage = !!item.imageUri;
  // A % item always shows its open unit, so the number on the card never
  // switches between a percentage and a count.
  const tracking = isTrackingOpened(item);

  const bigValue = tracking ? `${item.openedPercent}%` : `${item.quantity}`;
  const caption = tracking ? `${item.quantity} ${item.unit}` : item.unit;
  const decreaseLabel = tracking ? "Use 10 percent" : `Use one ${item.unit}`;
  const increaseLabel = tracking ? "Add 10 percent" : `Add one ${item.unit}`;

  const handleStep = (dir) => {
    if (onStep) {
      onStep(item, dir);
    }
  };

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      style={[styles.card, { width }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${item.quantity} ${item.unit}. Open details`}
    >
      <View style={[styles.imageWrap, { height: Math.round(width * 0.8) }]}>
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
              size={32}
              color={meta.color}
            />
          </View>
        )}

        {item.recurring ? (
          <View style={styles.recurringBadge}>
            <MaterialCommunityIcons
              name="cart"
              size={11}
              color={colors.white}
            />
          </View>
        ) : null}

        {isExpiringSoon(item) ? (
          <View style={styles.expiryBadge}>
            <ExpiryPill item={item} />
          </View>
        ) : null}
      </View>

      <Text style={styles.name} numberOfLines={2}>
        {item.name}
      </Text>

      <View style={styles.controlRow}>
        <TouchableOpacity
          activeOpacity={0.7}
          style={styles.stepButton}
          onPress={() => handleStep(-1)}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          accessibilityRole="button"
          accessibilityLabel={decreaseLabel}
        >
          <MaterialCommunityIcons name="minus" size={14} color={colors.accent} />
        </TouchableOpacity>

        <View style={styles.valueWrap}>
          <Text
            style={styles.value}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {bigValue}
          </Text>
          <Text
            style={styles.valueCaption}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {caption}
          </Text>
        </View>

        <TouchableOpacity
          activeOpacity={0.7}
          style={styles.stepButton}
          onPress={() => handleStep(1)}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          accessibilityRole="button"
          accessibilityLabel={increaseLabel}
        >
          <MaterialCommunityIcons name="plus" size={14} color={colors.accent} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.card,
      overflow: "hidden",
      ...SHADOW,
    },
    imageWrap: {
      width: "100%",
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
      top: 6,
      left: 6,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
      ...SHADOW,
    },
    // ExpiryPill's tint is see-through, so it gets a solid backing over photos.
    expiryBadge: {
      position: "absolute",
      top: 6,
      right: 6,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.surface,
      ...SHADOW,
    },
    name: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.textPrimary,
      lineHeight: 15,
      height: 30,
      marginHorizontal: 8,
      marginTop: 6,
    },
    controlRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 4,
      paddingBottom: 6,
      paddingTop: 2,
    },
    stepButton: {
      width: 24,
      height: 24,
      borderRadius: 12,
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
      fontSize: 14,
      fontWeight: "800",
      color: colors.textPrimary,
    },
    valueCaption: {
      fontSize: 9,
      color: colors.textSecondary,
    },
  });
