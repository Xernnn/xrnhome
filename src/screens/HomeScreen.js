import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { useInventory, computeStep } from "../context/InventoryContext";
import { useTheme } from "../context/ThemeContext";
import SearchBar from "../components/SearchBar";
import ItemCard, { ITEM_CARD_WIDTH } from "../components/ItemCard";
import EmptyState from "../components/EmptyState";
import {
  SPACING,
  CATEGORIES,
  getCategoryMeta,
  isInKitchen,
} from "../utils/constants";

export default function HomeScreen({ navigation }) {
  const { items, updateItem } = useInventory();
  const { colors, isDark, toggleTheme } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => new Set());

  const kitchenItems = useMemo(() => items.filter(isInKitchen), [items]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (query.length === 0) {
      return kitchenItems;
    }
    return kitchenItems.filter((item) =>
      item.name.toLowerCase().includes(query)
    );
  }, [kitchenItems, search]);

  const groupedByCategory = useMemo(() => {
    return CATEGORIES.map((cat) => ({
      category: cat,
      items: filteredItems.filter((item) => item.category === cat.label),
    })).filter((group) => group.items.length > 0);
  }, [filteredItems]);

  const openAddItem = () => navigation.navigate("AddItem");
  const openDetail = (id) => navigation.navigate("ItemDetail", { itemId: id });

  const toggleSearch = () => {
    setSearchOpen((prev) => {
      if (prev) {
        setSearch("");
      }
      return !prev;
    });
  };

  const toggleCategory = (label) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  };

  const handleStep = (item, dir) => {
    const result = computeStep(item, dir);
    if (result.changes) {
      updateItem(item.id, result.changes, result.historyEntry);
    }
  };

  const hasAnyItems = kitchenItems.length > 0;
  const totalFiltered = filteredItems.length;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.logo}>PantryPal</Text>
          <Text style={styles.subtitle}>
            {kitchenItems.length}{" "}
            {kitchenItems.length === 1 ? "item" : "items"} in your
            kitchen
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
          icon="fridge-outline"
          title="Your kitchen is empty"
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
              {groupedByCategory.map((group) => {
                const meta = getCategoryMeta(group.category.label);
                const isCollapsed = collapsed.has(group.category.label);
                return (
                  <View key={group.category.label} style={styles.categoryBlock}>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      style={styles.categoryHeader}
                      onPress={() => toggleCategory(group.category.label)}
                    >
                      <MaterialCommunityIcons
                        name={meta.icon}
                        size={20}
                        color={meta.color}
                      />
                      <Text style={styles.categoryName}>
                        {group.category.label}
                      </Text>
                      <View style={styles.countBadge}>
                        <Text style={styles.countBadgeText}>
                          {group.items.length}
                        </Text>
                      </View>
                      <View style={styles.headerSpacer} />
                      <MaterialCommunityIcons
                        name={isCollapsed ? "chevron-down" : "chevron-up"}
                        size={22}
                        color={colors.textSecondary}
                      />
                    </TouchableOpacity>
                    {isCollapsed ? null : (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.cardsRow}
                      >
                        {group.items.map((item) => (
                          <View key={item.id} style={styles.cardWrap}>
                            <ItemCard
                              item={item}
                              onPress={() => openDetail(item.id)}
                              onStep={handleStep}
                            />
                          </View>
                        ))}
                      </ScrollView>
                    )}
                  </View>
                );
              })}
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
    categoryBlock: {
      marginTop: SPACING.card,
    },
    categoryHeader: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: SPACING.screen,
      paddingVertical: 4,
      marginBottom: SPACING.inner,
    },
    categoryName: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.textPrimary,
      marginLeft: SPACING.inner,
    },
    countBadge: {
      marginLeft: SPACING.inner,
      minWidth: 22,
      height: 22,
      paddingHorizontal: 6,
      borderRadius: 11,
      backgroundColor: colors.surfaceAlt,
      alignItems: "center",
      justifyContent: "center",
    },
    countBadgeText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.textSecondary,
    },
    headerSpacer: {
      flex: 1,
    },
    cardsRow: {
      paddingHorizontal: SPACING.screen,
      paddingVertical: 4,
    },
    cardWrap: {
      marginRight: SPACING.card,
      width: ITEM_CARD_WIDTH,
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
