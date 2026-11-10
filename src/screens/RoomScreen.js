import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  FlatList,
  ScrollView,
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
import {
  GRID_GAP,
  GRID_GUTTER,
  GridHeader,
  GridRow,
  buildRows,
  cardWidthFor,
} from "../components/CategoryGrid";
import EmptyState from "../components/EmptyState";
import { Chip, PageTitle, RoundIconButton } from "../components/ui";
import { haptics } from "../utils/haptics";
import {
  RADIUS,
  ROOMS,
  PAGE_WIDTH,
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

// The narrowest a card can be before its words and buttons run out of room. A
// window with space to spare keeps its cards at the larger size.
const MIN_CARD_WIDTH = 150;
const MIN_ROOMY_CARD_WIDTH = 230;
const ROOMY_FROM = 640;

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

// `onListed` hears about what went on the shopping list, and from which photo.
export default function RoomScreen({ navigation, route, onListed }) {
  const room = getRoomMeta(route.params && route.params.room);
  const { items, stepItem, buyItem, toggleOnList } = useInventory();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { width, fontScale } = useWindowDimensions();
  // What the page was given, which on a laptop is less than the window.
  const [measured, setMeasured] = useState(0);
  const pageWidth = measured || Math.min(width, PAGE_WIDTH);
  const shown = pageWidth / fontScale;
  const smallest = shown >= ROOMY_FROM ? MIN_ROOMY_CARD_WIDTH : MIN_CARD_WIDTH;
  const columns = Math.max(
    2,
    Math.floor((shown - GRID_GUTTER * 2 + GRID_GAP) / (smallest + GRID_GAP))
  );
  const cardWidth = cardWidthFor(pageWidth, columns);

  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [expiringOnly, setExpiringOnly] = useState(false);
  const [chosen, setChosen] = useState(null);

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

  const byCategory = useMemo(
    () => groupByCategory(inStock, room.key),
    [inStock, room.key]
  );
  // A category that has just run out of items lets go of the filter.
  const category = byCategory.some((group) => group.meta.label === chosen)
    ? chosen
    : null;

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
          meta: {
            label: "Expiring soon",
            icon: "clock-alert-outline",
            color: colors.warning,
          },
          items: expiring,
        },
      ];
    }
    // The chips name the categories, so the cards run on with no heading between
    // them: a category of one would otherwise sit alone on its row.
    const shown = byCategory
      .filter((group) => !category || group.meta.label === category)
      .flatMap((group) => group.items);
    return shown.length > 0 ? [{ meta: null, items: shown }] : [];
  }, [searching, query, items, showingExpiring, expiring, byCategory, category, colors]);

  const rows = useMemo(() => buildRows(groups, columns), [groups, columns]);
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

  const handleList = useCallback(
    (id, photo) => {
      haptics.light();
      if (toggleOnList(id) && onListed) {
        onListed(photo);
      }
    },
    [toggleOnList, onListed]
  );

  const renderCard = useCallback(
    (item) => (
      <ItemCard
        item={item}
        width={cardWidth}
        onOpen={openDetail}
        onStep={handleStep}
        onBuy={handleBuy}
        onList={handleList}
      />
    ),
    [cardWidth, openDetail, handleStep, handleBuy, handleList]
  );

  const renderRow = useCallback(
    ({ item: row }) =>
      row.type === "header" ? (
        <GridHeader meta={row.meta} count={row.count} />
      ) : (
        <GridRow row={row} columns={columns} renderCard={renderCard} />
      ),
    [columns, renderCard]
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

  const chips =
    !searching && !showingExpiring && byCategory.length > 1 ? (
      <ScrollView
        horizontal
        style={styles.chips}
        contentContainerStyle={styles.chipsInner}
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Chip
          label="All"
          count={inStock.length}
          selected={!category}
          onPress={() => setChosen(null)}
        />
        {byCategory.map(({ meta, items: inCategory }) => (
          <Chip
            key={meta.label}
            label={meta.label}
            count={inCategory.length}
            selected={category === meta.label}
            onPress={() => setChosen(category === meta.label ? null : meta.label)}
          />
        ))}
      </ScrollView>
    ) : null;

  return (
    <SafeAreaView
      style={styles.safe}
      edges={["top"]}
      onLayout={(event) => setMeasured(event.nativeEvent.layout.width)}
    >
      <PageTitle
        title={room.label.toLowerCase()}
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

      {chips}

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
    chips: {
      flexGrow: 0,
      flexShrink: 0,
    },
    chipsInner: {
      paddingHorizontal: SPACING.screen,
      paddingTop: 4,
      paddingBottom: 10,
      gap: 6,
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
      marginHorizontal: GRID_GUTTER,
      marginBottom: GRID_GAP,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: colors.surface,
      borderRadius: RADIUS.tile + 4,
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
