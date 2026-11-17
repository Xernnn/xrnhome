import React, { memo, useMemo, useState } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { useTheme } from "../context/ThemeContext";
import {
  FONTS,
  OPENED_STEP,
  RADIUS,
  categoryColor,
  countText,
  getCategoryMeta,
  isExpiringSoon,
  isOnBuyList,
  isTrackingOpened,
  mixHex,
  unitFor,
} from "../utils/constants";
import ExpiryPill from "./ExpiryPill";
import { Stepper } from "./QuantityControl";
import { Pop } from "./ui";

// The card clips touches at its edge, which is only the stepper's padding (5)
// past the outer side of each button, so the rest of the 48 dp goes inwards: 17
// from each button still leaves the value between them free on a 360 dp phone.
// Downwards it reaches the card's edge; upwards it takes a strip of the name.
const STEPPER_SLOP = { top: 13, bottom: 11, outer: 5, inner: 17 };

// One item as a card in its category's colour, so everything in a category
// looks alike: the photo, or the category's icon on its tint; a green cart when
// it's on the shopping list and the date when it's close; the name; and − how
// much + under it. Between the buttons is what they change: the count, or for
// something used a bit at a time, what's left of the open one. Memoized, with
// stable callbacks from the screen, so a tap redraws this card and not the room.
function ItemCard({ item, width, onOpen, onStep, onBuy }) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [failed, setFailed] = useState(null);

  const meta = getCategoryMeta(item.category);
  const color = categoryColor(meta, isDark);
  const out = item.quantity <= 0;
  const tracking = isTrackingOpened(item) && !out;
  const listed = isOnBuyList(item);
  const showPhoto = !!item.imageUri && failed !== item.imageUri;
  const summary = [
    item.name,
    countText(item.quantity, item.unit),
    tracking ? `${item.openedPercent}% left in the open one` : null,
    listed ? "on the shopping list" : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <View style={[styles.card, { width }, out && styles.out]}>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => onOpen(item.id)}
        accessibilityRole="button"
        accessibilityLabel={summary}
        accessibilityHint="Opens the item"
      >
        <View
          style={[
            styles.art,
            {
              height: Math.round(width * 0.72),
              backgroundColor: mixHex(color, colors.surface, isDark ? 0.2 : 0.14),
            },
          ]}
        >
          {showPhoto ? (
            <Image
              source={{ uri: item.imageUri }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              onError={() => setFailed(item.imageUri)}
            />
          ) : (
            <MaterialCommunityIcons
              name={meta.icon}
              size={Math.round(Math.min(40, width * 0.3))}
              color={color}
            />
          )}
          {listed ? (
            <View style={styles.cart}>
              <MaterialCommunityIcons name="cart" size={12} color={colors.onAccent} />
            </View>
          ) : null}
          {isExpiringSoon(item) ? (
            <View style={styles.expiry}>
              <ExpiryPill item={item} />
            </View>
          ) : null}
        </View>
        <Text style={styles.name} numberOfLines={2} maxFontSizeMultiplier={1.2}>
          {item.name}
        </Text>
      </TouchableOpacity>

      <Stepper
        size={26}
        slop={STEPPER_SLOP}
        onMinus={() => onStep(item.id, -1)}
        onPlus={() => onStep(item.id, 1)}
        onPlusHold={() => onBuy(item.id)}
        minusDisabled={out}
        minusLabel={tracking ? `Use ${OPENED_STEP} percent of ${item.name}` : `Use one ${item.name}`}
        plusLabel={
          tracking && item.openedPercent < 100
            ? `Add ${OPENED_STEP} percent to ${item.name}. Hold to add a new one`
            : `Add one ${item.name}`
        }
        style={styles.stepper}
      >
        <Pop value={tracking ? item.openedPercent : item.quantity} style={styles.amount}>
          <Text style={styles.value} numberOfLines={1} maxFontSizeMultiplier={1.2}>
            {tracking ? `${item.openedPercent}%` : item.quantity}
          </Text>
          <Text style={styles.unit} numberOfLines={1} maxFontSizeMultiplier={1.2}>
            {tracking ? countText(item.quantity, item.unit) : unitFor(item.quantity, item.unit)}
          </Text>
        </Pop>
      </Stepper>
    </View>
  );
}

export default memo(ItemCard);

const createStyles = (colors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.tile - 2,
      overflow: "hidden",
    },
    out: {
      opacity: 0.6,
    },
    art: {
      width: "100%",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    cart: {
      position: "absolute",
      top: 6,
      left: 6,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    // The pill's tint is see-through, so it gets a solid backing over photos.
    expiry: {
      position: "absolute",
      top: 6,
      right: 6,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.surface,
    },
    name: {
      height: 34,
      marginTop: 6,
      marginHorizontal: 9,
      fontSize: 13,
      lineHeight: 17,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    stepper: {
      paddingHorizontal: 5,
      paddingTop: 2,
      paddingBottom: 7,
    },
    amount: {
      alignItems: "center",
    },
    value: {
      fontFamily: FONTS.mono,
      fontSize: 15,
      color: colors.textPrimary,
    },
    unit: {
      fontSize: 9.5,
      color: colors.textSecondary,
    },
  });
