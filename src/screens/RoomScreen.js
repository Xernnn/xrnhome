import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Platform,
  Text,
  TouchableOpacity,
  View,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { useInventory } from "../context/InventoryContext";
import { useTheme } from "../context/ThemeContext";
import SearchBar from "../components/SearchBar";
import ItemRow from "../components/ItemRow";
import EmptyState from "../components/EmptyState";
import { PageTitle, RoundIconButton } from "../components/ui";
import { haptics } from "../utils/haptics";
import {
  FORM_WIDTH,
  RADIUS,
  ROOMS,
  SPACING,
  TYPE,
  daysUntilExpiry,
  getExpiryStatus,
  getRoomCategories,
  getRoomMeta,
  isExpiringSoon,
  isInStock,
  itemCount,
} from "../utils/constants";

// In a browser window the list keeps to a readable width, as a phone shows it.
const COLUMN =
  Platform.OS === "web"
    ? { width: "100%", maxWidth: FORM_WIDTH, alignSelf: "center" }
    : null;

const groupByCategory = (list, room) => {
  const categories = getRoomCategories(room);
  const byLabel = new Map(categories.map((cat) => [cat.label, []]));
  list.forEach((item) => {
    (byLabel.get(item.category) || byLabel.get("Other")).push(item);
  });
  return categories
    .map((cat) => ({ meta: cat, items: byLabel.get(cat.label) }))
    .filter((group) => group.items.length > 0);
};

// A room's page is one flat list, so that only what's on screen gets drawn: for
// each group a heading, then its items as the rows of one card.
export const buildRows = (groups) =>
  groups.flatMap((group) => [
    {
      type: "header",
      key: `header-${group.label}`,
      label: group.label,
      count: group.items.length,
    },
    ...group.items.map((item, index) => ({
      type: "item",
      key: item.id,
      item,
      first: index === 0,
      last: index === group.items.length - 1,
    })),
  ]);

export default function RoomScreen({ navigation, route }) {
  const room = getRoomMeta(route.params && route.params.room);
  const { items, stepItem, buyItem } = useInventory();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [expiringOnly, setExpiringOnly] = useState(false);

  const allInRoom = useMemo(
    () => items.filter((item) => item.room === room.key),
    [items, room.key]
  );
  const inStock = useMemo(() => allInRoom.filter(isInStock), [allInRoom]);
  const query = search.trim().toLowerCase();
  const searching = query.length > 0;

  // Soonest first. Tapping the banner narrows the page to these, so nothing on
  // the page is ever shown twice.
  const expiring = useMemo(
    () =>
      inStock
        .filter(isExpiringSoon)
        .sort((a, b) => daysUntilExpiry(a) - daysUntilExpiry(b)),
    [inStock]
  );
  const showingExpiring = expiringOnly && expiring.length > 0 && !searching;

  // A search looks through everything, in every room, in stock or not.
  const groups = useMemo(() => {
    if (searching) {
      const matches = items.filter((item) =>
        item.name.toLowerCase().includes(query)
      );
      return ROOMS.map((entry) => ({
        label: entry.label,
        items: matches.filter((item) => item.room === entry.key),
      })).filter((group) => group.items.length > 0);
    }
    if (showingExpiring) {
      return [{ label: "Expiring soon", items: expiring }];
    }
    return groupByCategory(inStock, room.key).map((group) => ({
      label: group.meta.label,
      items: group.items,
    }));
  }, [searching, query, items, showingExpiring, expiring, inStock, room.key]);

  const rows = useMemo(() => buildRows(groups), [groups]);
  const shownCount = groups.reduce((sum, group) => sum + group.items.length, 0);

  const openAddItem = useCallback(
    () => navigation.navigate("AddItem", { room: room.key }),
    [navigation, room.key]
  );
  const openDetail = useCallback(
    (id) => navigation.navigate("ItemDetail", { itemId: id }),
    [navigation]
  );
  const handleStep = useCallback(
    (id, dir) => {
      haptics.light();
      stepItem(id, dir);
    },
    [stepItem]
  );
  const handleBuy = useCallback(
    (id) => {
      haptics.success();
      buyItem(id, 1);
    },
    [buyItem]
  );

  const renderRow = useCallback(
    ({ item: row }) =>
      row.type === "header" ? (
        <View style={styles.header} accessibilityRole="header">
          <Text style={styles.headerLabel} numberOfLines={1}>
            {row.label}
          </Text>
          <Text style={styles.headerCount}>{row.count}</Text>
        </View>
      ) : (
        <View style={styles.rowWrap}>
          <ItemRow
            item={row.item}
            first={row.first}
            last={row.last}
            onOpen={openDetail}
            onStep={handleStep}
            onBuy={handleBuy}
          />
        </View>
      ),
    [styles, openDetail, handleStep, handleBuy]
  );

  const toggleSearch = () => {
    setSearchOpen((prev) => {
      if (prev) {
        setSearch("");
      }
      return !prev;
    });
  };

  // A list that shrinks while scrolled down would otherwise be left looking at
  // nothing, below its new end.
  const list = useRef(null);
  const offset = useRef(0);
  const viewport = useRef(0);
  const onContentSize = (_, contentHeight) => {
    const end = Math.max(0, contentHeight - viewport.current);
    if (offset.current > end) {
      list.current?.scrollToOffset({ offset: end, animated: false });
    }
  };

  const banner =
    !searching && expiring.length > 0 ? (
      <TouchableOpacity
        activeOpacity={0.7}
        style={[styles.banner, showingExpiring && styles.bannerActive]}
        onPress={() => setExpiringOnly((prev) => !prev)}
        accessibilityRole="button"
        accessibilityState={{ selected: showingExpiring }}
      >
        <MaterialCommunityIcons
          name={
            expiring.some((item) => getExpiryStatus(item) === "expired")
              ? "alert-circle"
              : "clock-alert-outline"
          }
          size={20}
          color={colors.warning}
        />
        <View style={styles.bannerText}>
          <Text style={styles.bannerTitle} numberOfLines={1}>
            {expiring.length} expiring soon
          </Text>
          <Text style={styles.bannerNames} numberOfLines={1}>
            {expiring.map((item) => item.name).join(", ")}
          </Text>
        </View>
        <Text style={styles.bannerAction}>{showingExpiring ? "Show all" : "Show"}</Text>
      </TouchableOpacity>
    ) : null;

  const outOfStock = allInRoom.length - inStock.length;

  const empty = searching ? (
    <EmptyState
      icon="magnify"
      title="Nothing by that name"
      subtitle="Search looks through both types of item, in stock or not."
    />
  ) : allInRoom.length > 0 ? (
    <EmptyState
      icon="cart-outline"
      title="Nothing in stock"
      subtitle={`${itemCount(outOfStock)} ran out. You'll find them on the Shopping tab.`}
      actionLabel="Open Shopping"
      actionIcon="cart-outline"
      onAction={() => navigation.navigate("Shopping")}
    />
  ) : (
    <EmptyState
      icon={room.emptyIcon}
      title={room.emptyTitle}
      actionLabel="Add your first item"
      onAction={openAddItem}
    />
  );

  return (
    <SafeAreaView style={[styles.safe, COLUMN]} edges={["top"]}>
      <PageTitle
        title={room.label}
        subtitle={itemCount(inStock.length)}
        actions={
          <>
            <RoundIconButton
              icon={searchOpen ? "close" : "magnify"}
              label={searchOpen ? "Close search" : "Search"}
              outlined
              active={searchOpen}
              onPress={toggleSearch}
            />
            <RoundIconButton
              icon="plus"
              label={`Add to ${room.label}`}
              outlined
              onPress={openAddItem}
            />
          </>
        }
      />

      {searchOpen ? (
        <View style={styles.searchWrap}>
          <SearchBar value={search} onChangeText={setSearch} autoFocus />
          {searching && shownCount > 0 ? (
            <Text style={styles.resultCount}>Found {itemCount(shownCount)}</Text>
          ) : null}
        </View>
      ) : null}

      {rows.length === 0 ? (
        empty
      ) : (
        <FlatList
          ref={list}
          style={styles.list}
          data={rows}
          keyExtractor={(row) => row.key}
          renderItem={renderRow}
          ListHeaderComponent={banner}
          ListFooterComponent={<View style={styles.bottomSpacer} />}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          initialNumToRender={10}
          maxToRenderPerBatch={8}
          windowSize={7}
          onLayout={(event) => {
            viewport.current = event.nativeEvent.layout.height;
          }}
          onScroll={(event) => {
            offset.current = event.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={64}
          onContentSizeChange={onContentSize}
        />
      )}
    </SafeAreaView>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.background,
    },
    list: {
      flex: 1,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      marginHorizontal: SPACING.screen + 4,
      marginTop: 18,
      marginBottom: 8,
    },
    headerLabel: {
      ...TYPE.section,
      flexShrink: 1,
      color: colors.textSecondary,
    },
    headerCount: {
      ...TYPE.section,
      marginLeft: 8,
      color: colors.textSecondary,
      opacity: 0.7,
    },
    rowWrap: {
      marginHorizontal: SPACING.screen,
    },
    searchWrap: {
      paddingHorizontal: SPACING.screen,
      paddingTop: 2,
      paddingBottom: 6,
    },
    resultCount: {
      ...TYPE.caption,
      color: colors.textSecondary,
      marginTop: 8,
      marginLeft: 6,
    },
    banner: {
      flexDirection: "row",
      alignItems: "center",
      marginHorizontal: SPACING.screen,
      marginTop: 6,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: colors.surface,
      borderRadius: RADIUS.tile,
      borderWidth: 1,
      borderColor: colors.border,
    },
    bannerActive: {
      borderColor: colors.warning,
    },
    bannerText: {
      flex: 1,
      marginLeft: 12,
    },
    bannerTitle: {
      ...TYPE.bodySmall,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    bannerNames: {
      ...TYPE.caption,
      color: colors.textSecondary,
      marginTop: 1,
    },
    bannerAction: {
      ...TYPE.bodySmall,
      fontWeight: "600",
      color: colors.textPrimary,
      marginLeft: 10,
    },
    bottomSpacer: {
      height: 24,
    },
  });
