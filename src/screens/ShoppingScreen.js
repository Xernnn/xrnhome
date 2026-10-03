import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { useInventory } from "../context/InventoryContext";
import { useTheme } from "../context/ThemeContext";
import { haptics } from "../utils/haptics";
import {
  DEFAULT_ROOM,
  SPACING,
  RADIUS,
  SHADOW,
  getCategoryMeta,
  getRoomMeta,
  hexToRgba,
  isTrackingOpened,
  isOnBuyList,
  isPreviouslyHad,
  isStillStocked,
  normalizeName,
} from "../utils/constants";

export default function ShoppingScreen({ navigation }) {
  const { items, addItem, updateItem, deleteItem } = useInventory();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [newName, setNewName] = useState("");
  // Items ticked off this trip: id -> { count, before }. They stay on screen,
  // ticked, so a wrong tap can be undone and more can be added. Lives only as
  // long as the tab does.
  const [inCart, setInCart] = useState({});
  const [open, setOpen] = useState({ stocked: false, ranOut: false });

  const { toBuy, cart, stocked, ranOut } = useMemo(
    () => ({
      toBuy: items.filter((item) => isOnBuyList(item) && !inCart[item.id]),
      cart: items.filter((item) => inCart[item.id]),
      stocked: items.filter(
        (item) => isStillStocked(item) && !inCart[item.id]
      ),
      ranOut: items.filter((item) => isPreviouslyHad(item)),
    }),
    [items, inCart]
  );

  const openDetail = (id) => navigation.navigate("ItemDetail", { itemId: id });

  const stockText = (item) => {
    if (item.quantity <= 0) {
      return "out of stock";
    }
    if (item.quantity === 1 && isTrackingOpened(item)) {
      return `last one at ${item.openedPercent}%`;
    }
    return `${item.quantity} ${item.unit} left`;
  };

  const addToList = () => {
    const name = newName.trim();
    if (!name) {
      return;
    }
    const key = normalizeName(name);
    const existing = items.find((item) => normalizeName(item.name) === key);
    if (existing) {
      if (!isOnBuyList(existing)) {
        updateItem(
          existing.id,
          { wanted: true },
          { action: "Added to the shopping list" }
        );
      }
    } else {
      addItem({
        name,
        room: DEFAULT_ROOM,
        category: "Other",
        quantity: 0,
        wanted: true,
      });
    }
    haptics.light();
    setNewName("");
  };

  const tick = (item) => {
    const q = item.quantity + 1;
    haptics.success();
    setInCart((prev) => ({
      ...prev,
      [item.id]: {
        count: 1,
        before: {
          quantity: item.quantity,
          openedPercent: item.openedPercent,
          wanted: !!item.wanted,
        },
      },
    }));
    updateItem(
      item.id,
      { quantity: q },
      {
        action: `Bought 1 ${item.unit} (${q} in stock)`,
        quantityBefore: item.quantity,
        quantityAfter: q,
      }
    );
  };

  // Puts the item back exactly as it was before it was ticked.
  const untick = (item) => {
    const entry = inCart[item.id];
    haptics.light();
    setInCart((prev) => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
    if (entry) {
      updateItem(item.id, entry.before, {
        action: "Unticked on the shopping list",
        quantityBefore: item.quantity,
        quantityAfter: entry.before.quantity,
      });
    }
  };

  const changeCount = (item, delta) => {
    const entry = inCart[item.id];
    if (!entry) {
      return;
    }
    const count = entry.count + delta;
    if (count <= 0) {
      untick(item);
      return;
    }
    haptics.selection();
    const q = entry.before.quantity + count;
    setInCart((prev) => ({ ...prev, [item.id]: { ...entry, count } }));
    updateItem(
      item.id,
      { quantity: q },
      {
        action:
          delta > 0
            ? `Bought 1 more ${item.unit} (${q} in stock)`
            : `Put 1 ${item.unit} back (${q} in stock)`,
        quantityBefore: item.quantity,
        quantityAfter: q,
      }
    );
  };

  const removeFromList = (item) => {
    haptics.light();
    updateItem(
      item.id,
      { recurring: false, neverRecommend: true, wanted: false },
      { action: "Removed from the shopping list" }
    );
  };

  const needIt = (item) => {
    haptics.light();
    updateItem(
      item.id,
      { wanted: true },
      { action: "Added to the shopping list" }
    );
  };

  const confirmDelete = (item) => {
    Alert.alert(
      "Delete item?",
      `"${item.name}" will be deleted. You'll get a few seconds to undo.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            haptics.warning();
            deleteItem(item.id);
          },
        },
      ]
    );
  };

  const renderThumb = (item) => {
    const meta = getCategoryMeta(item.category);
    return item.imageUri ? (
      <Image source={{ uri: item.imageUri }} style={styles.thumb} />
    ) : (
      <View
        style={[
          styles.thumb,
          styles.thumbPlaceholder,
          { backgroundColor: hexToRgba(meta.color, 0.18) },
        ]}
      >
        <MaterialCommunityIcons name={meta.icon} size={22} color={meta.color} />
      </View>
    );
  };

  const renderInfo = (item, status, done = false) => (
    <TouchableOpacity
      activeOpacity={0.7}
      style={styles.rowMain}
      onPress={() => openDetail(item.id)}
    >
      {renderThumb(item)}
      <View style={styles.rowInfo}>
        <Text
          style={[styles.rowName, done && styles.rowNameDone]}
          numberOfLines={1}
        >
          {item.name}
        </Text>
        <Text style={styles.rowStatus} numberOfLines={1}>
          {getRoomMeta(item.room).label} · {status}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const renderCheckbox = (item, checked) => (
    <TouchableOpacity
      activeOpacity={0.7}
      style={[styles.checkbox, checked && styles.checkboxChecked]}
      onPress={() => (checked ? untick(item) : tick(item))}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={
        checked ? `Untick ${item.name}` : `Bought ${item.name}`
      }
    >
      {checked ? (
        <MaterialCommunityIcons name="check" size={20} color={colors.white} />
      ) : null}
    </TouchableOpacity>
  );

  const renderTextButton = (label, onPress, tone = "neutral") => (
    <TouchableOpacity
      activeOpacity={0.7}
      style={[
        styles.textButton,
        tone === "accent" && styles.textButtonAccent,
        tone === "danger" && styles.textButtonDanger,
      ]}
      onPress={onPress}
      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
    >
      <Text
        style={[
          styles.textButtonLabel,
          tone === "accent" && styles.textButtonLabelAccent,
          tone === "danger" && styles.textButtonLabelDanger,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  const renderToBuyRow = (item) => (
    <View key={item.id} style={styles.row}>
      {renderCheckbox(item, false)}
      {renderInfo(item, stockText(item))}
      <TouchableOpacity
        activeOpacity={0.7}
        style={styles.iconButton}
        onPress={() => removeFromList(item)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${item.name} from the list`}
      >
        <MaterialCommunityIcons
          name="close"
          size={20}
          color={colors.textSecondary}
        />
      </TouchableOpacity>
    </View>
  );

  const renderCartRow = (item) => {
    const count = inCart[item.id].count;
    return (
      <View key={item.id} style={[styles.row, styles.rowDone]}>
        {renderCheckbox(item, true)}
        {renderInfo(item, `bought ${count} ${item.unit}`, true)}
        <View style={styles.stepper}>
          <TouchableOpacity
            activeOpacity={0.7}
            style={styles.stepButton}
            onPress={() => changeCount(item, -1)}
            accessibilityRole="button"
            accessibilityLabel="Bought one fewer"
          >
            <MaterialCommunityIcons
              name="minus"
              size={16}
              color={colors.accent}
            />
          </TouchableOpacity>
          <Text style={styles.stepValue}>{count}</Text>
          <TouchableOpacity
            activeOpacity={0.7}
            style={styles.stepButton}
            onPress={() => changeCount(item, 1)}
            accessibilityRole="button"
            accessibilityLabel="Bought one more"
          >
            <MaterialCommunityIcons
              name="plus"
              size={16}
              color={colors.accent}
            />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderSectionToggle = (key, icon, title, count) => (
    <TouchableOpacity
      activeOpacity={0.7}
      style={[styles.sectionHeaderRow, styles.sectionSpacer]}
      onPress={() => setOpen((prev) => ({ ...prev, [key]: !prev[key] }))}
      accessibilityRole="button"
      accessibilityState={{ expanded: open[key] }}
    >
      <MaterialCommunityIcons
        name={icon}
        size={20}
        color={colors.textSecondary}
      />
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCount}>
        <Text style={styles.sectionCountText}>{count}</Text>
      </View>
      <View style={styles.flex} />
      <MaterialCommunityIcons
        name={open[key] ? "chevron-up" : "chevron-down"}
        size={22}
        color={colors.textSecondary}
      />
    </TouchableOpacity>
  );

  const cartCount = cart.length;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Shopping</Text>
        <Text style={styles.subtitle}>
          {toBuy.length === 0 && cartCount === 0
            ? "Nothing to buy right now"
            : `${toBuy.length} to buy${
                cartCount > 0 ? ` · ${cartCount} in the cart` : ""
              }`}
        </Text>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.addBar}>
          <TextInput
            style={styles.addInput}
            value={newName}
            onChangeText={setNewName}
            placeholder="Add something to buy"
            placeholderTextColor={colors.textSecondary}
            returnKeyType="done"
            onSubmitEditing={addToList}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            activeOpacity={0.7}
            style={[styles.addButton, !newName.trim() && styles.addButtonOff]}
            onPress={addToList}
            disabled={!newName.trim()}
            accessibilityRole="button"
            accessibilityLabel="Add to the shopping list"
          >
            <MaterialCommunityIcons name="plus" size={22} color={colors.white} />
          </TouchableOpacity>
        </View>

        <View style={styles.sectionHeaderRow}>
          <MaterialCommunityIcons
            name="cart-outline"
            size={20}
            color={colors.accent}
          />
          <Text style={styles.sectionTitle}>To buy</Text>
          <View style={styles.sectionCount}>
            <Text style={styles.sectionCountText}>{toBuy.length}</Text>
          </View>
        </View>
        {toBuy.length === 0 && cartCount === 0 ? (
          <Text style={styles.emptySection}>
            Nothing to buy. Items on your list show up here when they run low.
          </Text>
        ) : null}
        {toBuy.map(renderToBuyRow)}

        {cartCount > 0 ? (
          <>
            <View style={styles.cartHeader}>
              <Text style={styles.cartTitle}>In the cart</Text>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setInCart({})}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.cartClear}>Clear</Text>
              </TouchableOpacity>
            </View>
            {cart.map(renderCartRow)}
          </>
        ) : null}

        {renderSectionToggle(
          "stocked",
          "check-circle-outline",
          "Still in stock",
          stocked.length
        )}
        {open.stocked
          ? stocked.map((item) => (
              <View key={item.id} style={styles.row}>
                {renderInfo(item, stockText(item))}
                {renderTextButton("Need it", () => needIt(item), "accent")}
                <TouchableOpacity
                  activeOpacity={0.7}
                  style={styles.iconButton}
                  onPress={() => removeFromList(item)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${item.name} from the list`}
                >
                  <MaterialCommunityIcons
                    name="close"
                    size={20}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>
            ))
          : null}
        {open.stocked && stocked.length === 0 ? (
          <Text style={styles.emptySection}>
            Turn on "Shopping list" for an item and it waits here until it runs
            low.
          </Text>
        ) : null}

        {renderSectionToggle("ranOut", "history", "Ran out", ranOut.length)}
        {open.ranOut
          ? ranOut.map((item) => (
              <View key={item.id} style={styles.row}>
                {renderInfo(item, "ran out")}
                {renderTextButton("Buy again", () => needIt(item), "accent")}
                {renderTextButton("Delete", () => confirmDelete(item), "danger")}
              </View>
            ))
          : null}
        {open.ranOut && ranOut.length === 0 ? (
          <Text style={styles.emptySection}>Nothing has run out.</Text>
        ) : null}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.background,
    },
    flex: {
      flex: 1,
    },
    header: {
      paddingHorizontal: SPACING.screen,
      paddingVertical: 12,
    },
    title: {
      fontSize: 24,
      fontWeight: "800",
      color: colors.textPrimary,
    },
    subtitle: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 2,
    },
    scrollContent: {
      paddingHorizontal: SPACING.screen,
      paddingTop: 4,
    },
    addBar: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: RADIUS.pill,
      paddingLeft: SPACING.screen,
      paddingRight: 6,
      height: 52,
      marginBottom: SPACING.screen,
      ...SHADOW,
    },
    addInput: {
      flex: 1,
      fontSize: 16,
      color: colors.textPrimary,
      paddingVertical: 0,
    },
    addButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    addButtonOff: {
      opacity: 0.4,
    },
    sectionHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: SPACING.card,
    },
    sectionSpacer: {
      marginTop: SPACING.inner,
      paddingVertical: SPACING.inner,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.textPrimary,
      marginLeft: SPACING.inner,
    },
    sectionCount: {
      marginLeft: SPACING.inner,
      minWidth: 22,
      height: 22,
      paddingHorizontal: 6,
      borderRadius: 11,
      backgroundColor: colors.surfaceAlt,
      alignItems: "center",
      justifyContent: "center",
    },
    sectionCountText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.textSecondary,
    },
    emptySection: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 20,
      marginBottom: SPACING.card,
    },
    cartHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: SPACING.inner,
      marginBottom: SPACING.inner,
    },
    cartTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.textSecondary,
    },
    cartClear: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.accent,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: RADIUS.card,
      paddingVertical: 10,
      paddingHorizontal: SPACING.card,
      marginBottom: SPACING.inner,
      ...SHADOW,
    },
    rowDone: {
      opacity: 0.75,
    },
    rowMain: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
    },
    checkbox: {
      width: 30,
      height: 30,
      borderRadius: 8,
      borderWidth: 2,
      borderColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
      marginRight: SPACING.card,
    },
    checkboxChecked: {
      backgroundColor: colors.accent,
    },
    thumb: {
      width: 44,
      height: 44,
      borderRadius: RADIUS.button,
      backgroundColor: colors.surfaceAlt,
    },
    thumbPlaceholder: {
      alignItems: "center",
      justifyContent: "center",
    },
    rowInfo: {
      flex: 1,
      marginLeft: SPACING.card,
    },
    rowName: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    rowNameDone: {
      textDecorationLine: "line-through",
      color: colors.textSecondary,
    },
    rowStatus: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 2,
    },
    iconButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      marginLeft: 4,
    },
    textButton: {
      paddingVertical: 7,
      paddingHorizontal: 12,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.surfaceAlt,
      marginLeft: 6,
    },
    textButtonAccent: {
      backgroundColor: colors.accentLight,
    },
    textButtonDanger: {
      backgroundColor: hexToRgba(colors.danger, 0.14),
    },
    textButtonLabel: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    textButtonLabelAccent: {
      color: colors.accent,
    },
    textButtonLabelDanger: {
      color: colors.danger,
    },
    stepper: {
      flexDirection: "row",
      alignItems: "center",
    },
    stepButton: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: colors.accentLight,
      alignItems: "center",
      justifyContent: "center",
    },
    stepValue: {
      minWidth: 26,
      textAlign: "center",
      fontSize: 15,
      fontWeight: "800",
      color: colors.textPrimary,
    },
    bottomSpacer: {
      height: 24,
    },
  });
