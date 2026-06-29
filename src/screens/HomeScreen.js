import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
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
  RADIUS,
  SHADOW,
  CATEGORIES,
  STORAGE_LOCATIONS,
  getCategoryMeta,
} from "../utils/constants";

const LOCATION_FILTERS = ["All", ...STORAGE_LOCATIONS];

export default function HomeScreen({ navigation }) {
  const { items, updateItem, deleteItem } = useInventory();
  const { colors, isDark, toggleTheme } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState("All");

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchesSearch =
        query.length === 0 || item.name.toLowerCase().includes(query);
      const matchesLocation =
        locationFilter === "All" || item.storageLocation === locationFilter;
      return matchesSearch && matchesLocation;
    });
  }, [items, search, locationFilter]);

  const groupedByCategory = useMemo(() => {
    return CATEGORIES.map((cat) => ({
      category: cat,
      items: filteredItems.filter((item) => item.category === cat.label),
    })).filter((group) => group.items.length > 0);
  }, [filteredItems]);

  const openAddItem = () => navigation.navigate("AddItem");
  const openDetail = (id) => navigation.navigate("ItemDetail", { itemId: id });

  const handleStep = (item, dir) => {
    const result = computeStep(item, dir);
    if (result.willRemove) {
      Alert.alert(
        "All gone",
        `"${item.name}" is finished. Remove it from your kitchen?`,
        [
          { text: "Keep", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: () => deleteItem(item.id),
          },
        ]
      );
    } else if (result.changes) {
      updateItem(item.id, result.changes, result.historyEntry);
    }
  };

  const hasAnyItems = items.length > 0;
  const totalFiltered = filteredItems.length;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.logo}>PantryPal</Text>
          <Text style={styles.subtitle}>
            {items.length} {items.length === 1 ? "item" : "items"} in your
            kitchen
          </Text>
        </View>
        <View style={styles.headerActions}>
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
          <TouchableOpacity
            activeOpacity={0.7}
            style={styles.addButton}
            onPress={openAddItem}
          >
            <MaterialCommunityIcons name="plus" size={24} color={colors.white} />
          </TouchableOpacity>
        </View>
      </View>

      {!hasAnyItems ? (
        <EmptyState
          icon="fridge-outline"
          title="Your kitchen is empty"
          subtitle="Start tracking your ingredients and never run out of the essentials again."
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
          <View style={styles.searchWrap}>
            <SearchBar value={search} onChangeText={setSearch} />
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsRow}
          >
            {LOCATION_FILTERS.map((loc) => {
              const active = loc === locationFilter;
              return (
                <TouchableOpacity
                  key={loc}
                  activeOpacity={0.7}
                  onPress={() => setLocationFilter(loc)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text
                    style={[styles.chipText, active && styles.chipTextActive]}
                  >
                    {loc}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {groupedByCategory.length === 0 ? (
            <EmptyState
              icon="magnify"
              title="No matches found"
              subtitle={`No items match your current search${
                locationFilter !== "All" ? ` in ${locationFilter}` : ""
              }.`}
            />
          ) : (
            <>
              <Text style={styles.resultCount}>
                Showing {totalFiltered} {totalFiltered === 1 ? "item" : "items"}
              </Text>
              {groupedByCategory.map((group) => {
                const meta = getCategoryMeta(group.category.label);
                return (
                  <View key={group.category.label} style={styles.categoryBlock}>
                    <View style={styles.categoryHeader}>
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
                    </View>
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
    addButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: 8,
    },
    searchWrap: {
      paddingHorizontal: SPACING.screen,
      marginBottom: SPACING.card,
    },
    chipsRow: {
      paddingHorizontal: SPACING.screen,
      paddingBottom: 4,
    },
    chip: {
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.surfaceAlt,
      marginRight: SPACING.inner,
    },
    chipActive: {
      backgroundColor: colors.accent,
    },
    chipText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    chipTextActive: {
      color: colors.white,
    },
    resultCount: {
      fontSize: 13,
      color: colors.textSecondary,
      paddingHorizontal: SPACING.screen,
      marginTop: SPACING.card,
      marginBottom: 4,
    },
    categoryBlock: {
      marginTop: SPACING.card,
    },
    categoryHeader: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: SPACING.screen,
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
