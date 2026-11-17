import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Text,
  TouchableOpacity,
  View,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { useInventory } from "../context/InventoryContext";
import { useTheme } from "../context/ThemeContext";
import SearchBar from "../components/SearchBar";
import ItemCard from "../components/ItemCard";
import { BLOB_HALF_GAP, BlobGridRow } from "../components/CategoryBlobGrid";
import { blobRows, columnsFor } from "../utils/blobLayout";
import EmptyState from "../components/EmptyState";
import { PageTitle, RoundIconButton } from "../components/ui";
import { haptics } from "../utils/haptics";
import {
  PAGE_WIDTH,
  RADIUS,
  ROOMS,
  SPACING,
  TYPE,
  categoryColor,
  daysUntilExpiry,
  getExpiryStatus,
  getRoomCategories,
  getRoomMeta,
  isExpiringSoon,
  isInStock,
  itemCount,
} from "../utils/constants";

// Less than a page's margin, so the cards get the room.
const GRID_GUTTER = 12;

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

export default function RoomScreen({ navigation, route }) {
  const room = getRoomMeta(route.params && route.params.room);
  const { items, stepItem, buyItem } = useInventory();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { width } = useWindowDimensions();
  // What the page was given, which on a laptop is less than the window.
  const [measured, setMeasured] = useState(0);
  const gridWidth = (measured || Math.min(width, PAGE_WIDTH)) - GRID_GUTTER * 2;
  const columns = columnsFor(gridWidth);
  const cellWidth = Math.floor(gridWidth / columns);

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
        meta: { label: entry.label, icon: entry.icon, color: colors.textSecondary },
        items: matches.filter((item) => item.room === entry.key),
      })).filter((group) => group.items.length > 0);
    }
    if (showingExpiring) {
      return [
        {
          meta: { label: "Expiring soon", icon: "clock-alert-outline", color: colors.warning },
          items: expiring,
        },
      ];
    }
    return groupByCategory(inStock, room.key).map((group) => ({
      meta: {
        label: group.meta.label,
        icon: group.meta.icon,
        color: categoryColor(group.meta, isDark),
      },
      items: group.items,
    }));
  }, [searching, query, items, showingExpiring, expiring, inStock, room.key, colors, isDark]);

  const rows = useMemo(() => blobRows(groups, columns), [groups, columns]);
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

  const renderCard = useCallback(
    (item, cardWidth) => (
      <ItemCard
        item={item}
        width={cardWidth}
        onOpen={openDetail}
        onStep={handleStep}
        onBuy={handleBuy}
      />
    ),
    [openDetail, handleStep, handleBuy]
  );

  const renderRow = useCallback(
    ({ item: row }) => (
      <BlobGridRow
        row={row}
        columns={columns}
        cellWidth={cellWidth}
        renderCard={renderCard}
      />
    ),
    [columns, cellWidth, renderCard]
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
    <SafeAreaView
      style={styles.safe}
      edges={["top"]}
      onLayout={(event) => setMeasured(event.nativeEvent.layout.width)}
    >
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
          contentContainerStyle={styles.grid}
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
    grid: {
      paddingHorizontal: GRID_GUTTER,
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
      marginHorizontal: BLOB_HALF_GAP,
      marginTop: 4,
      marginBottom: 6,
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
