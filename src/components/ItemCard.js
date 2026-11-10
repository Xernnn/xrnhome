import React, { memo, useMemo, useRef } from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import {
  FONTS,
  OPENED_STEP,
  PACK_BUTTON_INK,
  PACK_INK,
  PACK_OUT,
  RADIUS,
  countText,
  hexToRgba,
  isExpiringSoon,
  isOnBuyList,
  isTrackingOpened,
  unitFor,
} from "../utils/constants";
import { usePackShade } from "../utils/packColourCache";
import ExpiryPill from "./ExpiryPill";
import PackPhoto from "./PackPhoto";
import { Stepper } from "./QuantityControl";
import { Pop } from "./ui";

export const CARD_PADDING = 8;
const LARGE_FROM = 200; // a card this wide has room for bigger words and buttons

// On a laptop the cart button waits for the pointer. A touch screen has no pointer.
const CARD_WEB = Platform.OS === "web" ? { dataSet: { card: "1" } } : null;
const CART_WEB = Platform.OS === "web" ? { dataSet: { cart: "1" } } : null;

// One item, on a card in the colour of its pack: the photo in an arch, the name,
// how many are left and the buttons that change that. Memoized, with stable
// callbacks from the screen, so a tap redraws this card and not the whole room.
function ItemCard({ item, width, onOpen, onStep, onBuy, onList }) {
  const large = width >= LARGE_FROM;
  const styles = useMemo(() => createStyles(large), [large]);
  const shade = usePackShade(item);
  const photo = useRef(null);

  const tracking = isTrackingOpened(item);
  const listed = isOnBuyList(item);
  const expiring = isExpiringSoon(item);
  const out = item.quantity <= 0;
  const summary = `${item.name}, ${countText(item.quantity, item.unit)}${
    tracking && !out ? `, ${item.openedPercent}% left in the open one` : ""
  }${listed ? ", on the shopping list" : ""}`;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={[styles.card, { backgroundColor: out ? PACK_OUT : shade }]}
      onPress={() => onOpen(item.id)}
      accessibilityRole="button"
      accessibilityLabel={summary}
      accessibilityHint="Opens the item"
      {...CARD_WEB}
    >
      <PackPhoto item={item} width={width - CARD_PADDING * 2} photoRef={photo}>
        {out || listed ? (
          <View style={styles.tag}>
            <Text style={styles.tagText} numberOfLines={1} maxFontSizeMultiplier={1.2}>
              {out ? "Ran out" : "On the list"}
            </Text>
          </View>
        ) : null}
        <TouchableOpacity
          activeOpacity={0.7}
          style={[styles.cart, listed && styles.cartListed]}
          onPress={() => onList(item.id, photo.current)}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          accessibilityRole="button"
          accessibilityLabel={
            listed ? `Take ${item.name} off the shopping list` : `Put ${item.name} on the shopping list`
          }
          {...(listed ? null : CART_WEB)}
        >
          <MaterialCommunityIcons
            name={listed ? "cart" : "cart-plus"}
            size={large ? 20 : 17}
            color={listed ? PACK_BUTTON_INK : PACK_INK}
          />
        </TouchableOpacity>
      </PackPhoto>

      <Text style={styles.name} numberOfLines={2} maxFontSizeMultiplier={1.3}>
        {item.name}
      </Text>
      {expiring ? (
        <View style={styles.expiry}>
          <ExpiryPill item={item} />
        </View>
      ) : null}

      <View style={styles.spacer} />
      <View style={styles.foot}>
        <Pop value={item.quantity} style={styles.count}>
          <Text style={styles.number} numberOfLines={1} maxFontSizeMultiplier={1.2}>
            {item.quantity}
          </Text>
          <Text style={styles.unit} numberOfLines={1} maxFontSizeMultiplier={1.2}>
            {unitFor(item.quantity, item.unit)}
          </Text>
        </Pop>
        <Stepper
          onPack
          size={large ? 40 : 32}
          onMinus={() => onStep(item.id, -1)}
          onPlus={() => onStep(item.id, 1)}
          onPlusHold={() => onBuy(item.id)}
          minusDisabled={out}
          minusLabel={tracking ? `Use ${OPENED_STEP} percent of ${item.name}` : `Use one ${item.name}`}
          plusLabel={
            tracking && !out && item.openedPercent < 100
              ? `Add ${OPENED_STEP} percent to ${item.name}. Hold to add a new one`
              : `Add one ${item.name}`
          }
        />
      </View>
    </TouchableOpacity>
  );
}

export default memo(ItemCard);

const createStyles = (large) =>
  StyleSheet.create({
    card: {
      flex: 1,
      padding: CARD_PADDING,
      borderRadius: RADIUS.card,
    },
    tag: {
      position: "absolute",
      left: 8,
      bottom: 8,
      maxWidth: "70%",
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: RADIUS.pill,
      backgroundColor: PACK_INK,
    },
    tagText: {
      fontSize: 11.5,
      fontWeight: "700",
      color: PACK_BUTTON_INK,
    },
    cart: {
      position: "absolute",
      right: 8,
      bottom: 8,
      width: large ? 36 : 30,
      height: large ? 36 : 30,
      borderRadius: RADIUS.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(0,0,0,0.5)",
    },
    cartListed: {
      backgroundColor: PACK_INK,
    },
    name: {
      marginTop: 8,
      paddingHorizontal: 4,
      fontSize: large ? 20 : 15.5,
      lineHeight: large ? 25 : 20,
      fontWeight: "700",
      color: PACK_INK,
    },
    expiry: {
      marginTop: 4,
      paddingHorizontal: 4,
    },
    spacer: {
      flexGrow: 1,
      minHeight: 4,
    },
    foot: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      justifyContent: "space-between",
      paddingLeft: 4,
    },
    count: {
      flexDirection: "row",
      alignItems: "baseline",
      flexShrink: 1,
      minWidth: 0,
      marginRight: 4,
    },
    number: {
      fontFamily: FONTS.mono,
      fontSize: large ? 38 : 28,
      color: PACK_INK,
    },
    unit: {
      flexShrink: 1,
      marginLeft: 4,
      fontSize: large ? 14 : 12,
      fontWeight: "600",
      color: hexToRgba(PACK_INK, 0.85),
    },
  });
