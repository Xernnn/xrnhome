import React, { useMemo } from "react";
import {
  View,
  Text,
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
import EmptyState from "../components/EmptyState";
import {
  SPACING,
  RADIUS,
  SHADOW,
  getCategoryMeta,
  hexToRgba,
  isTrackingOpened,
  isAlmostOut,
} from "../utils/constants";

export default function ShoppingScreen({ navigation }) {
  const { items, updateItem } = useInventory();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { buyNow, saved } = useMemo(() => {
    const active = items.filter(
      (item) => item.recurring && !item.neverRecommend
    );
    return {
      buyNow: active.filter((item) => isAlmostOut(item)),
      saved: active.filter((item) => !isAlmostOut(item)),
    };
  }, [items]);

  const openDetail = (id) => navigation.navigate("ItemDetail", { itemId: id });

  const statusText = (item) => {
    if (item.quantity > 0) {
      return `${item.quantity} ${item.unit} in stock`;
    }
    if (isTrackingOpened(item)) {
      return `${item.openedPercent}% of opened unit left`;
    }
    return "Out of stock";
  };

  const markBought = (item) => {
    const q = item.quantity + 1;
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

  const neverRecommend = (item) => {
    Alert.alert(
      "Stop recommending?",
      `"${item.name}" will no longer appear in your shopping list. You can re-enable it from the item's edit screen.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Don't recommend",
          style: "destructive",
          onPress: () =>
            updateItem(
              item.id,
              { recurring: false, neverRecommend: true },
              { action: "Removed from shopping list" }
            ),
        },
      ]
    );
  };

  const renderRow = (item, { showBought }) => {
    const meta = getCategoryMeta(item.category);
    return (
      <TouchableOpacity
        key={item.id}
        activeOpacity={0.7}
        style={styles.row}
        onPress={() => openDetail(item.id)}
      >
        {item.imageUri ? (
          <Image source={{ uri: item.imageUri }} style={styles.thumb} />
        ) : (
          <View
            style={[
              styles.thumb,
              styles.thumbPlaceholder,
              { backgroundColor: hexToRgba(meta.color, 0.18) },
            ]}
          >
            <MaterialCommunityIcons
              name={meta.icon}
              size={24}
              color={meta.color}
            />
          </View>
        )}

        <View style={styles.rowInfo}>
          <Text style={styles.rowName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.rowStatus} numberOfLines={1}>
            {statusText(item)}
          </Text>
        </View>

        <View style={styles.rowActions}>
          {showBought ? (
            <TouchableOpacity
              activeOpacity={0.7}
              style={styles.boughtButton}
              onPress={() => markBought(item)}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <MaterialCommunityIcons
                name="cart-check"
                size={18}
                color={colors.white}
              />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            activeOpacity={0.7}
            style={styles.blockButton}
            onPress={() => neverRecommend(item)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <MaterialCommunityIcons
              name="cart-off"
              size={18}
              color={colors.danger}
            />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const nothingRecurring = buyNow.length === 0 && saved.length === 0;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Shopping</Text>
        <Text style={styles.subtitle}>
          {buyNow.length} to buy · {saved.length} saved
        </Text>
      </View>

      {nothingRecurring ? (
        <EmptyState
          icon="cart-outline"
          title="No shopping items yet"
          subtitle={
            'Turn on "Re-buy when empty" for an item (in Add or Edit) and it will show up here when it runs low.'
          }
        />
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.sectionHeaderRow}>
            <MaterialCommunityIcons
              name="cart-arrow-down"
              size={20}
              color={colors.accent}
            />
            <Text style={styles.sectionTitle}>Buy Now</Text>
            <View style={styles.sectionCount}>
              <Text style={styles.sectionCountText}>{buyNow.length}</Text>
            </View>
          </View>
          {buyNow.length === 0 ? (
            <Text style={styles.emptySection}>
              Nothing's running low right now. Nice and stocked!
            </Text>
          ) : (
            buyNow.map((item) => renderRow(item, { showBought: true }))
          )}

          <View style={[styles.sectionHeaderRow, styles.sectionSpacer]}>
            <MaterialCommunityIcons
              name="bookmark-outline"
              size={20}
              color={colors.textSecondary}
            />
            <Text style={styles.sectionTitle}>Saved Foods</Text>
            <View style={styles.sectionCount}>
              <Text style={styles.sectionCountText}>{saved.length}</Text>
            </View>
          </View>
          {saved.length === 0 ? (
            <Text style={styles.emptySection}>
              Recurring items you have in stock will be saved here.
            </Text>
          ) : (
            saved.map((item) => renderRow(item, { showBought: false }))
          )}

          <View style={styles.bottomSpacer} />
        </ScrollView>
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
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: SPACING.screen,
      paddingTop: 4,
    },
    sectionHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: SPACING.card,
    },
    sectionSpacer: {
      marginTop: SPACING.screen + 4,
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
      fontStyle: "italic",
      marginBottom: SPACING.inner,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: RADIUS.card,
      padding: SPACING.card,
      marginBottom: SPACING.card,
      ...SHADOW,
    },
    thumb: {
      width: 48,
      height: 48,
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
    rowStatus: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 2,
    },
    rowActions: {
      flexDirection: "row",
      alignItems: "center",
    },
    boughtButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
      marginRight: SPACING.inner,
    },
    blockButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: hexToRgba(colors.danger, 0.14),
      alignItems: "center",
      justifyContent: "center",
    },
    bottomSpacer: {
      height: 24,
    },
  });
