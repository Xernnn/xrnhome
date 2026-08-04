import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  StyleSheet,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { useInventory, computeStep } from "../context/InventoryContext";
import { useTheme } from "../context/ThemeContext";
import CategoryBadge from "../components/CategoryBadge";
import EmptyState from "../components/EmptyState";
import {
  SPACING,
  RADIUS,
  SHADOW,
  getCategoryMeta,
  hexToRgba,
  isTrackingOpened,
} from "../utils/constants";

const formatDate = (iso) => {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (e) {
    return iso;
  }
};

export default function ItemDetailScreen({ navigation, route }) {
  const { itemId } = route.params || {};
  const { getItemById, updateItem, deleteItem } = useInventory();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const item = getItemById(itemId);

  const [restockOpen, setRestockOpen] = useState(false);
  const [restockValue, setRestockValue] = useState("");

  if (!item) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => navigation.goBack()}
            style={styles.headerButton}
          >
            <MaterialCommunityIcons
              name="arrow-left"
              size={24}
              color={colors.textPrimary}
            />
          </TouchableOpacity>
          <View style={styles.headerButton} />
        </View>
        <EmptyState
          icon="alert-circle-outline"
          title="Item not found"
          subtitle="This item may have been deleted."
        />
      </SafeAreaView>
    );
  }

  const meta = getCategoryMeta(item.category);
  const tracking = isTrackingOpened(item);
  // A full open unit reads the same as a sealed one, so it earns no summary card.
  const partiallyOpen = tracking && item.openedPercent < 100;

  const handleStep = (dir) => {
    const result = computeStep(item, dir);
    if (result.changes) {
      updateItem(item.id, result.changes, result.historyEntry);
      if (result.willEmpty) {
        navigation.goBack();
      }
    }
  };

  const handleRestock = () => {
    const amount = parseInt(restockValue, 10);
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert(
        "Invalid amount",
        "Please enter a valid number of units to add."
      );
      return;
    }
    const before = item.quantity;
    const after = before + amount;
    updateItem(
      item.id,
      { quantity: after },
      {
        action: `Restocked ${amount} ${item.unit}`,
        quantityBefore: before,
        quantityAfter: after,
      }
    );
    setRestockValue("");
    setRestockOpen(false);
  };

  const toggleRecurring = (value) => {
    updateItem(
      item.id,
      { recurring: value, neverRecommend: value ? false : item.neverRecommend },
      { action: value ? "Added to shopping list" : "Removed from shopping list" }
    );
  };

  const handleDelete = () => {
    Alert.alert(
      "Delete item",
      `Are you sure you want to delete "${item.name}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteItem(item.id);
            navigation.goBack();
          },
        },
      ]
    );
  };

  const recentHistory = (item.history || []).slice(-10).reverse();

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => navigation.goBack()}
          style={styles.headerButton}
        >
          <MaterialCommunityIcons
            name="arrow-left"
            size={24}
            color={colors.textPrimary}
          />
        </TouchableOpacity>
        <View style={styles.headerActions}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => navigation.navigate("EditItem", { itemId: item.id })}
            style={styles.headerButton}
          >
            <MaterialCommunityIcons
              name="pencil"
              size={22}
              color={colors.accent}
            />
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleDelete}
            style={styles.headerButton}
          >
            <MaterialCommunityIcons
              name="trash-can-outline"
              size={22}
              color={colors.danger}
            />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroWrap}>
          {item.imageUri ? (
            <Image source={{ uri: item.imageUri }} style={styles.hero} />
          ) : (
            <View
              style={[
                styles.heroPlaceholder,
                { backgroundColor: hexToRgba(meta.color, 0.18) },
              ]}
            >
              <MaterialCommunityIcons
                name={meta.icon}
                size={72}
                color={meta.color}
              />
            </View>
          )}
        </View>

        <View style={styles.content}>
          <Text style={styles.name}>{item.name}</Text>

          <View style={styles.badgeRow}>
            <CategoryBadge category={item.category} />
          </View>

          <View
            style={[
              styles.infoCardsRow,
              !partiallyOpen && styles.infoCardsRowSingle,
            ]}
          >
            <View
              style={[styles.infoCard, partiallyOpen && styles.infoCardWithGap]}
            >
              <Text style={styles.infoCardLabel}>Units</Text>
              <Text style={styles.infoCardValue}>
                {item.quantity} {item.unit}
              </Text>
            </View>
            {partiallyOpen ? (
              <View style={styles.infoCard}>
                <Text style={styles.infoCardLabel}>Open unit</Text>
                <Text style={styles.infoCardValue}>
                  {item.openedPercent}%
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.recurringRow}>
            <View style={styles.recurringTextWrap}>
              <MaterialCommunityIcons
                name="cart-outline"
                size={18}
                color={colors.accent}
              />
              <Text style={styles.recurringLabel}>Shopping list</Text>
            </View>
            <Switch
              value={!!item.recurring}
              onValueChange={toggleRecurring}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor={colors.white}
            />
          </View>

          {item.note && item.note.trim().length > 0 ? (
            <View style={styles.noteCard}>
              <Text style={styles.sectionTitle}>Note</Text>
              <Text style={styles.noteText}>{item.note}</Text>
            </View>
          ) : null}

          <Text style={styles.sectionTitle}>Quick Update</Text>

          {tracking ? (
            <View style={styles.openedControlCard}>
              <Text style={styles.openedControlLabel}>Open unit</Text>
              <View style={styles.openedControlRow}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  style={styles.openedStepButton}
                  onPress={() => handleStep(-1)}
                >
                  <MaterialCommunityIcons
                    name="minus"
                    size={22}
                    color={colors.accent}
                  />
                </TouchableOpacity>
                <Text style={styles.openedPercentValue}>
                  {item.openedPercent}%
                </Text>
                <TouchableOpacity
                  activeOpacity={0.7}
                  style={styles.openedStepButton}
                  onPress={() => handleStep(1)}
                >
                  <MaterialCommunityIcons
                    name="plus"
                    size={22}
                    color={colors.accent}
                  />
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          <View style={styles.quickRow}>
            {tracking ? null : (
              <TouchableOpacity
                activeOpacity={0.7}
                style={[styles.quickButton, styles.useButton]}
                onPress={() => handleStep(-1)}
              >
                <MaterialCommunityIcons
                  name="minus-circle-outline"
                  size={20}
                  color={colors.white}
                />
                <Text style={styles.quickButtonText}>Use 1</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              activeOpacity={0.7}
              style={[styles.quickButton, styles.restockButton]}
              onPress={() => setRestockOpen((prev) => !prev)}
            >
              <MaterialCommunityIcons
                name="plus-circle-outline"
                size={20}
                color={colors.accent}
              />
              <Text style={[styles.quickButtonText, styles.restockButtonText]}>
                Restock
              </Text>
            </TouchableOpacity>
          </View>

          {restockOpen ? (
            <View style={styles.inlineInputRow}>
              <TextInput
                style={styles.inlineInput}
                value={restockValue}
                onChangeText={setRestockValue}
                keyboardType="numeric"
                autoFocus
              />
              <TouchableOpacity
                activeOpacity={0.7}
                style={styles.confirmButton}
                onPress={handleRestock}
              >
                <Text style={styles.confirmButtonText}>Add</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <Text style={styles.sectionTitle}>History</Text>
          {recentHistory.length === 0 ? (
            <Text style={styles.emptyHistory}>No history yet.</Text>
          ) : (
            <View style={styles.timeline}>
              {recentHistory.map((entry, index) => (
                <View
                  key={`${entry.date}-${index}`}
                  style={styles.timelineItem}
                >
                  <View style={styles.timelineDotColumn}>
                    <View style={styles.timelineDot} />
                    {index < recentHistory.length - 1 ? (
                      <View style={styles.timelineLine} />
                    ) : null}
                  </View>
                  <View style={styles.timelineContent}>
                    <Text style={styles.timelineAction}>{entry.action}</Text>
                    <Text style={styles.timelineDate}>
                      {formatDate(entry.date)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          <View style={styles.bottomSpacer} />
        </View>
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
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: SPACING.inner,
      paddingVertical: 8,
    },
    headerActions: {
      flexDirection: "row",
    },
    headerButton: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
    },
    scrollContent: {
      paddingBottom: 8,
    },
    heroWrap: {
      width: "100%",
      aspectRatio: 1,
      backgroundColor: colors.surfaceAlt,
    },
    hero: {
      width: "100%",
      height: "100%",
      resizeMode: "cover",
    },
    heroPlaceholder: {
      width: "100%",
      height: "100%",
      alignItems: "center",
      justifyContent: "center",
    },
    content: {
      padding: SPACING.screen,
    },
    name: {
      fontSize: 26,
      fontWeight: "800",
      color: colors.textPrimary,
      marginBottom: SPACING.card,
    },
    badgeRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      marginBottom: SPACING.screen,
    },
    infoCardsRow: {
      flexDirection: "row",
      marginBottom: SPACING.card,
    },
    infoCardsRowSingle: {
      flexDirection: "column",
    },
    infoCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: RADIUS.card,
      padding: SPACING.card,
      ...SHADOW,
    },
    infoCardWithGap: {
      marginRight: SPACING.card,
    },
    infoCardLabel: {
      fontSize: 13,
      color: colors.textSecondary,
      marginBottom: 6,
    },
    infoCardValue: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    recurringRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.surface,
      borderRadius: RADIUS.card,
      paddingVertical: 10,
      paddingHorizontal: SPACING.card,
      marginBottom: SPACING.screen,
      ...SHADOW,
    },
    recurringTextWrap: {
      flexDirection: "row",
      alignItems: "center",
    },
    recurringLabel: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.textPrimary,
      marginLeft: SPACING.inner,
    },
    noteCard: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.card,
      padding: SPACING.card,
      marginBottom: SPACING.screen,
      ...SHADOW,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.textPrimary,
      marginBottom: SPACING.card,
    },
    noteText: {
      fontSize: 15,
      color: colors.textPrimary,
      lineHeight: 22,
    },
    quickRow: {
      flexDirection: "row",
      marginBottom: SPACING.card,
    },
    quickButton: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 13,
      borderRadius: RADIUS.button,
    },
    useButton: {
      backgroundColor: colors.accent,
      marginRight: SPACING.card,
    },
    restockButton: {
      backgroundColor: colors.accentLight,
    },
    quickButtonText: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.white,
      marginLeft: 6,
    },
    restockButtonText: {
      color: colors.accent,
    },
    inlineInputRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: SPACING.card,
    },
    inlineInput: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: RADIUS.button,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: SPACING.card,
      paddingVertical: 11,
      fontSize: 16,
      color: colors.textPrimary,
      marginRight: SPACING.inner,
    },
    confirmButton: {
      backgroundColor: colors.accent,
      paddingHorizontal: 18,
      paddingVertical: 12,
      borderRadius: RADIUS.button,
    },
    confirmButtonText: {
      color: colors.white,
      fontSize: 15,
      fontWeight: "700",
    },
    openedControlCard: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.card,
      padding: SPACING.card,
      marginBottom: SPACING.card,
      ...SHADOW,
    },
    openedControlLabel: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.textPrimary,
      marginBottom: SPACING.card,
    },
    openedControlRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
    },
    openedStepButton: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: colors.accentLight,
      alignItems: "center",
      justifyContent: "center",
    },
    openedPercentValue: {
      fontSize: 26,
      fontWeight: "800",
      color: colors.textPrimary,
      marginHorizontal: SPACING.screen,
      minWidth: 80,
      textAlign: "center",
    },
    emptyHistory: {
      fontSize: 14,
      color: colors.textSecondary,
      fontStyle: "italic",
      marginBottom: SPACING.card,
    },
    timeline: {
      marginTop: 4,
    },
    timelineItem: {
      flexDirection: "row",
    },
    timelineDotColumn: {
      width: 20,
      alignItems: "center",
    },
    timelineDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: colors.accent,
      marginTop: 4,
    },
    timelineLine: {
      flex: 1,
      width: 2,
      backgroundColor: colors.border,
      marginVertical: 2,
    },
    timelineContent: {
      flex: 1,
      paddingLeft: SPACING.card,
      paddingBottom: SPACING.screen,
    },
    timelineAction: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    timelineDate: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    bottomSpacer: {
      height: 24,
    },
  });
