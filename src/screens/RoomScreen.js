import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { useInventory, computeStep } from "../context/InventoryContext";
import { useTheme } from "../context/ThemeContext";
import SearchBar from "../components/SearchBar";
import ItemCard from "../components/ItemCard";
import CategoryBlobGrid, { BLOB_HALF_GAP } from "../components/CategoryBlobGrid";
import EmptyState from "../components/EmptyState";
import {
  SPACING,
  getRoomCategories,
  getRoomMeta,
  isInStock,
} from "../utils/constants";

// Blobs reach out to the usual screen margin; their inner gap sits inside it.
const GRID_SIDE_PADDING = SPACING.screen - BLOB_HALF_GAP;

export default function RoomScreen({ navigation, route }) {
  const room = getRoomMeta(route.params && route.params.room);
  const { items, updateItem } = useInventory();
  const { colors, isDark, toggleTheme } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { width: windowWidth } = useWindowDimensions();

  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  const roomItems = useMemo(
    () => items.filter((item) => item.room === room.key && isInStock(item)),
    [items, room.key]
  );

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (query.length === 0) {
      return roomItems;
    }
    return roomItems.filter((item) =>
      item.name.toLowerCase().includes(query)
    );
  }, [roomItems, search]);

  const groupedByCategory = useMemo(() => {
    const categories = getRoomCategories(room.key);
    const byLabel = new Map(categories.map((cat) => [cat.label, []]));
    filteredItems.forEach((item) => {
      (byLabel.get(item.category) || byLabel.get("Other")).push(item);
    });
    return categories
      .map((cat) => ({ meta: cat, items: byLabel.get(cat.label) }))
      .filter((group) => group.items.length > 0);
  }, [filteredItems, room.key]);

  const openAddItem = () => navigation.navigate("AddItem", { room: room.key });
  const openDetail = (id) => navigation.navigate("ItemDetail", { itemId: id });

  const toggleSearch = () => {
    setSearchOpen((prev) => {
      if (prev) {
        setSearch("");
      }
      return !prev;
    });
  };

  const handleStep = (item, dir) => {
    const result = computeStep(item, dir);
    if (result.changes) {
      updateItem(item.id, result.changes, result.historyEntry);
    }
  };

  const hasAnyItems = roomItems.length > 0;
  const totalFiltered = filteredItems.length;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.logo}>{room.label}</Text>
          <Text style={styles.subtitle}>
            {roomItems.length} {roomItems.length === 1 ? "item" : "items"} in
            your {room.label.toLowerCase()}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            activeOpacity={0.7}
            style={[styles.iconButton, searchOpen && styles.iconButtonActive]}
            onPress={toggleSearch}
          >
            <MaterialCommunityIcons
              name={searchOpen ? "close" : "magnify"}
              size={22}
              color={searchOpen ? colors.accent : colors.textPrimary}
            />
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.7}
            style={styles.iconButton}
            onPress={toggleTheme}
          >
            <MaterialCommunityIcons
              name={isDark ? "white-balance-sunny" : "weather-night"}
              size={22}
              color={colors.textPrimary}
            />
          </TouchableOpacity>
        </View>
      </View>

      {!hasAnyItems ? (
        <EmptyState
          icon={room.emptyIcon}
          title={`Your ${room.label.toLowerCase()} is empty`}
          actionLabel="Add your first item"
          onAction={openAddItem}
        />
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {searchOpen ? (
            <View style={styles.searchWrap}>
              <SearchBar value={search} onChangeText={setSearch} autoFocus />
            </View>
          ) : null}

          {groupedByCategory.length === 0 ? (
            <EmptyState icon="magnify" title="No matches found" />
          ) : (
            <>
              {searchOpen ? (
                <Text style={styles.resultCount}>
                  Showing {totalFiltered}{" "}
                  {totalFiltered === 1 ? "item" : "items"}
                </Text>
              ) : null}
              <View style={styles.grid}>
                <CategoryBlobGrid
                  groups={groupedByCategory}
                  width={windowWidth - GRID_SIDE_PADDING * 2}
                  renderItem={(item, cardWidth) => (
                    <ItemCard
                      item={item}
                      width={cardWidth}
                      onPress={() => openDetail(item.id)}
                      onStep={handleStep}
                    />
                  )}
                />
              </View>
            </>
          )}
          <View style={styles.bottomSpacer} />
        </ScrollView>
      )}

      <TouchableOpacity
        activeOpacity={0.8}
        style={styles.fab}
        onPress={openAddItem}
      >
        <MaterialCommunityIcons name="plus" size={30} color={colors.white} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: SPACING.screen,
      paddingVertical: 12,
    },
    headerLeft: {
      flex: 1,
    },
    logo: {
      fontSize: 24,
      fontWeight: "800",
      color: colors.accent,
    },
    subtitle: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 2,
    },
    headerActions: {
      flexDirection: "row",
      alignItems: "center",
    },
    iconButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.surfaceAlt,
      alignItems: "center",
      justifyContent: "center",
      marginRight: SPACING.inner,
    },
    iconButtonActive: {
      backgroundColor: colors.accentLight,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: 8,
    },
    searchWrap: {
      paddingHorizontal: SPACING.screen,
      marginBottom: SPACING.inner,
    },
    resultCount: {
      fontSize: 13,
      color: colors.textSecondary,
      paddingHorizontal: SPACING.screen,
      marginBottom: 4,
    },
    grid: {
      paddingHorizontal: GRID_SIDE_PADDING,
      paddingTop: SPACING.inner,
    },
    bottomSpacer: {
      height: 96,
    },
    fab: {
      position: "absolute",
      right: SPACING.screen,
      bottom: SPACING.screen,
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 6,
    },
  });
