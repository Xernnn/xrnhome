import React, { memo, useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { useTheme } from "../context/ThemeContext";
import {
  FONTS,
  OPENED_STEP,
  RADIUS,
  TYPE,
  countText,
  isTrackingOpened,
  rowStatus,
  unitFor,
} from "../utils/constants";
import { Stepper } from "./QuantityControl";
import { ItemThumb, Pop } from "./ui";

// One item as a row of a list card: its picture, its name with a line under it
// only when there's something to notice, and − how much + on the right. Between
// the buttons is what they change: the count, or for something used a bit at a
// time, what's left of the open one. `first` and `last` round the card's corners,
// so a list can draw a category's card one row at a time. Memoized, with stable
// callbacks from the screen, so a tap redraws this row and not the whole room.
function ItemRow({ item, first, last, onOpen, onStep, onBuy }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const out = item.quantity <= 0;
  const tracking = isTrackingOpened(item) && !out;
  const status = rowStatus(item);
  const tones = {
    danger: colors.danger,
    warning: colors.warning,
    accent: colors.accent,
    muted: colors.textSecondary,
  };
  const summary = [
    item.name,
    countText(item.quantity, item.unit),
    tracking ? `${item.openedPercent}% left in the open one` : null,
    ...status.map((part) => part.text),
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <View
      style={[
        styles.row,
        first && styles.first,
        last && styles.last,
      ]}
    >
      {first ? null : <View style={styles.hairline} />}
      <TouchableOpacity
        activeOpacity={0.6}
        style={styles.main}
        onPress={() => onOpen(item.id)}
        accessibilityRole="button"
        accessibilityLabel={summary}
        accessibilityHint="Opens the item"
      >
        <ItemThumb item={item} size={40} radius={12} iconSize={20} />
        <View style={styles.text}>
          <Text
            style={[styles.name, out && styles.nameOut]}
            numberOfLines={1}
            maxFontSizeMultiplier={1.3}
          >
            {item.name}
          </Text>
          {status.length > 0 ? (
            <Text style={styles.status} numberOfLines={1} maxFontSizeMultiplier={1.3}>
              {status.map((part, index) => (
                <Text key={part.text} style={{ color: tones[part.tone] }}>
                  {index > 0 ? " · " : ""}
                  {part.text}
                </Text>
              ))}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
      <Stepper
        size={32}
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

export default memo(ItemRow);

const createStyles = (colors) =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      minHeight: 64,
      paddingLeft: 14,
      paddingRight: 10,
      backgroundColor: colors.surface,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: colors.border,
    },
    first: {
      borderTopWidth: 1,
      borderTopLeftRadius: RADIUS.tile,
      borderTopRightRadius: RADIUS.tile,
    },
    last: {
      borderBottomWidth: 1,
      borderBottomLeftRadius: RADIUS.tile,
      borderBottomRightRadius: RADIUS.tile,
    },
    hairline: {
      position: "absolute",
      top: 0,
      left: 68,
      right: 0,
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
    },
    main: {
      flex: 1,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "stretch",
      paddingVertical: 10,
    },
    text: {
      flex: 1,
      minWidth: 0,
      marginLeft: 14,
    },
    name: {
      ...TYPE.body,
      fontWeight: "500",
      color: colors.textPrimary,
    },
    nameOut: {
      color: colors.textSecondary,
    },
    status: {
      ...TYPE.caption,
      marginTop: 2,
    },
    stepper: {
      marginLeft: 8,
    },
    amount: {
      minWidth: 52,
      alignItems: "center",
    },
    value: {
      fontFamily: FONTS.mono,
      fontSize: 16,
      color: colors.textPrimary,
    },
    unit: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 1,
    },
  });
