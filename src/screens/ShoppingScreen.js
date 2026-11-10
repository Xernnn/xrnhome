import React, { Fragment, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Share,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { useInventory } from "../context/InventoryContext";
import { useTheme } from "../context/ThemeContext";
import {
  GroupCard,
  Hairline,
  ItemThumb,
  PageTitle,
  RoundIconButton,
  Segmented,
  TagButton,
  TextButton,
} from "../components/ui";
import { Stepper } from "../components/QuantityControl";
import { haptics } from "../utils/haptics";
import { takeOffList, untickChanges } from "../utils/inventoryLogic";
import { loadCart, saveCart } from "../utils/storage";
import {
  DEFAULT_ROOM,
  FONTS,
  ROOMS,
  SPACING,
  RADIUS,
  TYPE,
  countText,
  getRoomCategories,
  getRoomMeta,
  isOnBuyList,
  isPreviouslyHad,
  isStillStocked,
  normalizeName,
  stockText,
  unitFor,
} from "../utils/constants";

const ROOM_OPTIONS = ROOMS.map((room) => ({
  value: room.key,
  label: room.label,
  icon: room.icon,
}));

// A cart nobody touched for this long was a shop that finished long ago.
const CART_KEEP_MS = 24 * 3600 * 1000;

// The list in the order of the rooms and their categories, which is roughly the
// order things are found in.
const inSections = (list) =>
  ROOMS.flatMap((room) =>
    getRoomCategories(room.key).map((category) => ({
      key: `${room.key}:${category.label}`,
      label: `${room.label} · ${category.label}`,
      items: list.filter(
        (item) =>
          item.room === room.key &&
          (item.category === category.label ||
            (category.label === "Other" &&
              !getRoomCategories(room.key).some((c) => c.label === item.category)))
      ),
    }))
  ).filter((section) => section.items.length > 0);

export default function ShoppingScreen({ navigation }) {
  const { items, addItem, updateItem, deleteItem, showNotice } = useInventory();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [newName, setNewName] = useState("");
  const [newRoom, setNewRoom] = useState(DEFAULT_ROOM);
  // Items ticked off this trip: id -> { count, before }. They stay on screen,
  // ticked, so a wrong tap can be undone and more can be added. Saved, so the
  // trip survives the app being killed halfway round the shop.
  const [inCart, setInCart] = useState({});
  const [cartLoaded, setCartLoaded] = useState(false);
  const [open, setOpen] = useState({ stocked: false, ranOut: false });

  useEffect(() => {
    loadCart().then((saved) => {
      if (
        saved &&
        saved.entries &&
        Date.now() - new Date(saved.at).getTime() < CART_KEEP_MS
      ) {
        const known = new Set(items.map((item) => item.id));
        setInCart(
          Object.fromEntries(
            Object.entries(saved.entries).filter(([id]) => known.has(id))
          )
        );
      }
      setCartLoaded(true);
    });
    // Once, with the items as they stand when the tab opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (cartLoaded) {
      saveCart({ at: new Date().toISOString(), entries: inCart });
    }
  }, [inCart, cartLoaded]);

  const { toBuy, cart, stocked, ranOut } = useMemo(
    () => ({
      toBuy: items.filter((item) => isOnBuyList(item) && !inCart[item.id]),
      cart: items.filter((item) => inCart[item.id]),
      stocked: items.filter(
        (item) => isStillStocked(item) && !inCart[item.id]
      ),
      ranOut: items.filter((item) => isPreviouslyHad(item) && !inCart[item.id]),
    }),
    [items, inCart]
  );
  const sections = useMemo(() => inSections(toBuy), [toBuy]);

  const openDetail = (id) => navigation.navigate("ItemDetail", { itemId: id });

  const addToList = () => {
    const name = newName.trim();
    if (!name) {
      return;
    }
    const key = normalizeName(name);
    const existing = items.find((item) => normalizeName(item.name) === key);
    if (existing && isOnBuyList(existing)) {
      showNotice(`${existing.name} is already on the list`);
    } else if (existing) {
      updateItem(
        existing.id,
        { wanted: true, snoozed: false },
        { action: "Added to the shopping list" }
      );
    } else {
      addItem({
        name,
        room: newRoom,
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
          wanted: !!item.wanted,
          snoozed: !!item.snoozed,
          openCovered: !!item.openCovered,
          expiryDate: item.expiryDate || null,
        },
      },
    }));
    updateItem(
      item.id,
      { quantity: q },
      {
        action: `Bought ${countText(1, item.unit)} (${q} in stock)`,
        quantityBefore: item.quantity,
        quantityAfter: q,
      }
    );
  };

  // Takes back what the tick added. Anything done to the item since stands.
  const untick = (item) => {
    const entry = inCart[item.id];
    haptics.light();
    setInCart((prev) => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
    if (entry) {
      const changes = untickChanges(item, entry);
      updateItem(item.id, changes, {
        action: "Unticked on the shopping list",
        quantityBefore: item.quantity,
        quantityAfter: changes.quantity,
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
    const q = Math.max(0, item.quantity + delta);
    setInCart((prev) => ({ ...prev, [item.id]: { ...entry, count } }));
    updateItem(
      item.id,
      { quantity: q },
      {
        action:
          delta > 0
            ? `Bought 1 more ${unitFor(1, item.unit)} (${q} in stock)`
            : `Put 1 ${unitFor(1, item.unit)} back (${q} in stock)`,
        quantityBefore: item.quantity,
        quantityAfter: q,
      }
    );
  };

  const skip = (item) => {
    haptics.light();
    updateItem(
      item.id,
      takeOffList(item),
      { action: "Taken off the shopping list" },
      `${item.name} is off the list`
    );
  };

  const putOnList = (item) => {
    haptics.light();
    updateItem(
      item.id,
      { wanted: true, snoozed: false },
      { action: "Added to the shopping list" }
    );
  };

  const remove = (item) => {
    haptics.warning();
    deleteItem(item.id);
  };

  const shareList = () => {
    const text = sections
      .map(
        (section) =>
          `${section.label}\n${section.items
            .map((item) => `- ${item.name}`)
            .join("\n")}`
      )
      .join("\n\n");
    Share.share({ message: `Shopping list\n\n${text}` });
  };

  // A section's rows in one card, a hairline between each.
  const renderGroup = (list, renderRow) =>
    list.length > 0 ? (
      <GroupCard style={styles.group}>
        {list.map((item, index) => (
          <Fragment key={item.id}>
            {index > 0 ? <Hairline /> : null}
            {renderRow(item)}
          </Fragment>
        ))}
      </GroupCard>
    ) : null;

  const renderInfo = (item, status, done = false) => (
    <TouchableOpacity
      activeOpacity={0.7}
      style={styles.rowMain}
      onPress={() => openDetail(item.id)}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${status}. Opens the item`}
    >
      <ItemThumb item={item} size={44} />
      <View style={styles.rowInfo}>
        <Text
          style={[styles.rowName, done && styles.rowNameDone]}
          numberOfLines={1}
        >
          {item.name}
        </Text>
        <Text style={styles.rowStatus} numberOfLines={1}>
          {status}
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
        <MaterialCommunityIcons name="check" size={18} color={colors.onAccent} />
      ) : null}
    </TouchableOpacity>
  );

  const renderIconButton = (icon, label, onPress) => (
    <TouchableOpacity
      activeOpacity={0.7}
      style={styles.iconButton}
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <MaterialCommunityIcons name={icon} size={20} color={colors.textSecondary} />
    </TouchableOpacity>
  );

  const renderToBuyRow = (item) => (
    <View style={styles.row}>
      {renderCheckbox(item, false)}
      {renderInfo(item, stockText(item))}
      {renderIconButton("close", `Take ${item.name} off the list`, () => skip(item))}
    </View>
  );

  const renderCartRow = (item) => {
    const count = inCart[item.id].count;
    return (
      <View style={styles.row}>
        {renderCheckbox(item, true)}
        {renderInfo(item, `bought ${countText(count, item.unit)}`, true)}
        <Stepper
          size={30}
          onMinus={() => changeCount(item, -1)}
          onPlus={() => changeCount(item, 1)}
          minusLabel="Bought one fewer"
          plusLabel="Bought one more"
        >
          <Text style={styles.stepValue}>{count}</Text>
        </Stepper>
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
        size={16}
        color={colors.textSecondary}
      />
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionCountText}>{count}</Text>
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
      <PageTitle
        title="shopping"
        subtitle={
          toBuy.length === 0 && cartCount === 0
            ? "Nothing to buy right now"
            : `${toBuy.length} to buy${
                cartCount > 0 ? ` · ${cartCount} in the cart` : ""
              }`
        }
        actions={
          toBuy.length > 0 ? (
            <RoundIconButton
              icon="share-variant-outline"
              label="Share the list"
              outlined
              onPress={shareList}
            />
          ) : null
        }
      />

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
            submitBehavior="submit"
            accessibilityLabel="Add something to buy"
          />
          <TouchableOpacity
            activeOpacity={0.7}
            style={[styles.addButton, !newName.trim() && styles.addButtonOff]}
            onPress={addToList}
            disabled={!newName.trim()}
            accessibilityRole="button"
            accessibilityLabel="Add to the shopping list"
          >
            <MaterialCommunityIcons name="plus" size={22} color={colors.onAccent} />
          </TouchableOpacity>
        </View>
        {newName.trim() ? (
          <Segmented
            options={ROOM_OPTIONS}
            value={newRoom}
            onChange={setNewRoom}
            style={styles.roomChoice}
          />
        ) : null}

        <View style={[styles.sectionHeaderRow, styles.toBuyHeader]}>
          <MaterialCommunityIcons
            name="cart-outline"
            size={16}
            color={colors.textSecondary}
          />
          <Text style={styles.sectionTitle}>To buy</Text>
          <Text style={styles.sectionCountText}>{toBuy.length}</Text>
        </View>
        {toBuy.length === 0 && cartCount === 0 ? (
          <Text style={styles.emptySection}>
            Nothing to buy. Items on your list show up here when they run low.
          </Text>
        ) : null}
        {sections.map((section) => (
          <Fragment key={section.key}>
            <Text style={styles.sectionLine}>{section.label}</Text>
            {renderGroup(section.items, renderToBuyRow)}
          </Fragment>
        ))}

        {cartCount > 0 ? (
          <>
            <View style={styles.cartHeader}>
              <Text style={styles.cartTitle}>In the cart</Text>
              <TextButton label="Done" strong onPress={() => setInCart({})} />
            </View>
            {renderGroup(cart, renderCartRow)}
          </>
        ) : null}

        {renderSectionToggle(
          "stocked",
          "check-circle-outline",
          "Not needed yet",
          stocked.length
        )}
        {open.stocked
          ? renderGroup(stocked, (item) => (
              <View style={styles.row}>
                {renderInfo(
                  item,
                  `${getRoomMeta(item.room).label} · ${stockText(item)}`
                )}
                <TagButton
                  label="Add to list"
                  onPress={() => putOnList(item)}
                  accessibilityLabel={`Add ${item.name} to the list`}
                />
              </View>
            ))
          : null}
        {open.stocked && stocked.length === 0 ? (
          <Text style={styles.emptySection}>
            Turn on "When it's running low" for an item and it waits here
            until it does.
          </Text>
        ) : null}

        {renderSectionToggle("ranOut", "history", "Ran out", ranOut.length)}
        {open.ranOut
          ? renderGroup(ranOut, (item) => (
              <View style={styles.row}>
                {renderInfo(
                  item,
                  `${getRoomMeta(item.room).label} · out of stock`
                )}
                <TagButton
                  label="Add to list"
                  onPress={() => putOnList(item)}
                  accessibilityLabel={`Add ${item.name} to the list`}
                />
                {renderIconButton("trash-can-outline", `Delete ${item.name}`, () =>
                  remove(item)
                )}
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
    scrollContent: {
      paddingHorizontal: SPACING.screen,
      paddingTop: 8,
    },
    addBar: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.pill,
      paddingLeft: 18,
      paddingRight: 6,
      minHeight: 54,
    },
    addInput: {
      ...TYPE.body,
      flex: 1,
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
    roomChoice: {
      marginTop: 10,
    },
    toBuyHeader: {
      marginTop: 22,
    },
    sectionHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 10,
      marginLeft: 4,
    },
    sectionSpacer: {
      marginTop: 12,
      paddingVertical: 6,
    },
    sectionTitle: {
      ...TYPE.section,
      color: colors.textSecondary,
      marginLeft: 8,
    },
    sectionCountText: {
      fontFamily: FONTS.monoMedium,
      fontSize: 12,
      color: colors.textSecondary,
      marginLeft: 8,
    },
    sectionLine: {
      ...TYPE.caption,
      fontWeight: "600",
      color: colors.textSecondary,
      marginLeft: 6,
      marginBottom: 6,
    },
    emptySection: {
      ...TYPE.bodySmall,
      color: colors.textSecondary,
      lineHeight: 20,
      marginHorizontal: 4,
      marginBottom: 16,
    },
    group: {
      marginBottom: 12,
    },
    cartHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 10,
      marginBottom: 6,
      marginHorizontal: 4,
    },
    cartTitle: {
      ...TYPE.section,
      color: colors.textSecondary,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 10,
      paddingHorizontal: 14,
      minHeight: 64,
    },
    rowMain: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
    },
    checkbox: {
      width: 26,
      height: 26,
      borderRadius: 8,
      borderWidth: 2,
      borderColor: colors.outline,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 14,
    },
    checkboxChecked: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    rowInfo: {
      flex: 1,
      marginLeft: 14,
    },
    rowName: {
      ...TYPE.body,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    rowNameDone: {
      textDecorationLine: "line-through",
      color: colors.textSecondary,
    },
    rowStatus: {
      ...TYPE.caption,
      color: colors.textSecondary,
      marginTop: 2,
    },
    iconButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      marginLeft: 4,
    },
    stepValue: {
      fontFamily: FONTS.mono,
      fontSize: 15,
      color: colors.textPrimary,
    },
    bottomSpacer: {
      height: 24,
    },
  });
