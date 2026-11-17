import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  StyleSheet,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { useInventory } from "../context/InventoryContext";
import { useTheme } from "../context/ThemeContext";
import EmptyState from "../components/EmptyState";
import { Stepper } from "../components/QuantityControl";
import {
  FormSection,
  GroupCard,
  GroupRow,
  Hairline,
  ItemThumb,
  OutlinePill,
  PillButton,
  RoundIconButton,
  SectionLabel,
  SwitchRow,
  TagButton,
  TopBar,
} from "../components/ui";
import { haptics } from "../utils/haptics";
import { pickDate } from "../utils/datePicker";
import {
  FONTS,
  OPENED_STEP,
  RADIUS,
  SPACING,
  TYPE,
  describeRestockRule,
  formatExpiryDate,
  getExpiryColor,
  getExpiryLabel,
  getExpiryStatus,
  getRestockRule,
  getRoomMeta,
  isOnBuyList,
  isTrackingOpened,
  needsExpiryDate,
  unitFor,
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

// The top of the page: the item's picture beside its name and where it lives.
function Header({ item, where }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.header}>
      <ItemThumb item={item} size={64} radius={18} iconSize={30} />
      <View style={styles.headerText}>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.where}>{where}</Text>
      </View>
    </View>
  );
}

export default function ItemDetailScreen({ navigation, route }) {
  const { itemId } = route.params || {};
  const { getItemById, updateItem, stepItem, buyItem, toggleOnList } = useInventory();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const item = getItemById(itemId);

  const [restockOpen, setRestockOpen] = useState(false);
  const [restockValue, setRestockValue] = useState("1");

  const back = (
    <RoundIconButton
      icon="arrow-left"
      label="Back"
      onPress={() => navigation.goBack()}
    />
  );

  if (!item) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <TopBar left={back} />
        <EmptyState
          icon="alert-circle-outline"
          title="Item not found"
          subtitle="This item may have been deleted."
        />
      </SafeAreaView>
    );
  }

  const room = getRoomMeta(item.room);
  const tracking = isTrackingOpened(item);
  // An empty % item has no open unit to show, but it is still a % item.
  const showOpenUnit = tracking && item.quantity > 0;
  const expiryStatus = getExpiryStatus(item);
  const expiryColor = getExpiryColor(expiryStatus, colors);

  const onList = isOnBuyList(item);

  const handleStep = (dir) => {
    haptics.light();
    stepItem(item.id, dir);
  };

  const handleRestock = () => {
    const amount = parseInt(restockValue, 10);
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert("How many?", "Enter how many you bought.");
      return;
    }
    haptics.success();
    buyItem(item.id, amount);
    setRestockValue("1");
    setRestockOpen(false);
  };

  const handleList = () => {
    haptics.light();
    toggleOnList(item.id);
  };

  const setExpiry = async () => {
    const picked = await pickDate(new Date());
    if (picked) {
      updateItem(
        item.id,
        { expiryDate: picked.toISOString() },
        { action: "Set the expiry date" }
      );
    }
  };

  const toggleRecurring = (value) => {
    haptics.selection();
    updateItem(
      item.id,
      { recurring: value, neverRecommend: value ? false : item.neverRecommend },
      { action: value ? "Added to shopping list" : "Removed from shopping list" }
    );
  };

  const recentHistory = (item.history || []).slice(-10).reverse();

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <TopBar
        left={back}
        right={
          <RoundIconButton
            icon="pencil-outline"
            label="Edit"
            outlined
            onPress={() => navigation.navigate("EditItem", { itemId: item.id })}
          />
        }
      />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Header item={item} where={`${item.category} · ${room.label}`} />

        {item.expiryDate ? (
          <View style={styles.expiryRow}>
            <Text style={[styles.expiryStatusText, { color: expiryColor }]}>
              {getExpiryLabel(item)}
            </Text>
            <Text style={styles.expiryDateText}>
              {formatExpiryDate(item.expiryDate)}
            </Text>
          </View>
        ) : null}

        {needsExpiryDate(item) ? (
          <View style={styles.dateMissing}>
            <MaterialCommunityIcons
              name="calendar-alert"
              size={20}
              color={colors.textSecondary}
            />
            <Text style={styles.dateMissingText}>
              This stock has no expiry date yet
            </Text>
            <TagButton label="Set date" onPress={setExpiry} />
          </View>
        ) : null}

        <FormSection title="How much is left?">
          <View style={styles.stockRow}>
            <View style={styles.stockCell}>
              <Text style={styles.stockValue}>{item.quantity}</Text>
              <Text style={styles.stockLabel}>{unitFor(item.quantity, item.unit)}</Text>
            </View>
            {showOpenUnit ? (
              <View style={styles.stockCell}>
                <Text style={styles.stockValue}>{item.openedPercent}%</Text>
                <Text style={styles.stockLabel}>left in the open one</Text>
              </View>
            ) : null}
          </View>
          <Hairline inset={0} />
          <View style={styles.stepLine}>
            <Text style={[styles.lineTitle, styles.flex]}>
              {tracking ? `Use or top up ${OPENED_STEP}%` : "Use or add one"}
            </Text>
            <Stepper
              onMinus={() => handleStep(-1)}
              onPlus={() => handleStep(1)}
              minusDisabled={item.quantity <= 0}
              minusLabel={tracking ? `Use ${OPENED_STEP} percent` : "Use one"}
              plusLabel={tracking ? `Add ${OPENED_STEP} percent` : "Add one"}
            />
          </View>
          {restockOpen ? (
            <View style={styles.inlineInputRow}>
              <TextInput
                style={styles.inlineInput}
                value={restockValue}
                onChangeText={setRestockValue}
                keyboardType="number-pad"
                placeholder={`How many ${item.unit}`}
                placeholderTextColor={colors.textSecondary}
                accessibilityLabel={`How many ${item.unit}`}
                selectTextOnFocus
                autoFocus
              />
              <PillButton
                label="Add"
                onPress={handleRestock}
                style={styles.confirmButton}
              />
            </View>
          ) : (
            <OutlinePill
              label="Bought more"
              icon="plus-circle-outline"
              onPress={() => setRestockOpen(true)}
              style={styles.restockButton}
            />
          )}
        </FormSection>

        <SectionLabel>Shopping list</SectionLabel>
        <GroupCard>
          <GroupRow
            first
            icon={onList ? "cart" : "cart-plus"}
            iconColor={onList ? colors.accent : undefined}
            title={onList ? "On your shopping list" : "Add to the shopping list"}
            subtitle={onList ? "Tap to take it off for now" : "Just this once"}
            chevron={false}
            onPress={handleList}
          />
          <SwitchRow
            icon="autorenew"
            title="When it's running low"
            subtitle={
              item.recurring
                ? `Goes on the list ${describeRestockRule(getRestockRule(item))}`
                : "Off. When it runs out it waits under Ran out."
            }
            value={!!item.recurring}
            onValueChange={toggleRecurring}
          />
        </GroupCard>

        {item.note && item.note.trim().length > 0 ? (
          <FormSection title="Note">
            <Text style={styles.noteText}>{item.note}</Text>
          </FormSection>
        ) : null}

        <SectionLabel>History</SectionLabel>
        {recentHistory.length === 0 ? (
          <Text style={styles.emptyHistory}>No history yet.</Text>
        ) : (
          <GroupCard>
            {recentHistory.map((entry, index) => (
              <GroupRow
                key={`${entry.date}-${index}`}
                first={index === 0}
                title={entry.action}
                subtitle={formatDate(entry.date)}
              />
            ))}
          </GroupCard>
        )}

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
      paddingTop: 4,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingTop: 4,
      paddingBottom: 6,
    },
    headerText: {
      flex: 1,
      marginLeft: 16,
    },
    name: {
      ...TYPE.bigName,
      color: colors.textPrimary,
    },
    where: {
      ...TYPE.bodySmall,
      marginTop: 2,
      color: colors.textSecondary,
    },
    expiryRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.surface,
      borderRadius: RADIUS.card,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: SPACING.card,
      paddingVertical: 16,
      marginTop: 14,
    },
    expiryStatusText: {
      ...TYPE.body,
      fontWeight: "600",
    },
    expiryDateText: {
      ...TYPE.bodySmall,
      color: colors.textSecondary,
    },
    stockRow: {
      flexDirection: "row",
      paddingBottom: 14,
    },
    stockCell: {
      flex: 1,
    },
    stockValue: {
      fontFamily: FONTS.mono,
      fontSize: 30,
      color: colors.textPrimary,
    },
    stockLabel: {
      ...TYPE.caption,
      color: colors.textSecondary,
      marginTop: 2,
    },
    stepLine: {
      flexDirection: "row",
      alignItems: "center",
      minHeight: 60,
    },
    dateMissing: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: RADIUS.card,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: SPACING.card,
      paddingVertical: 12,
      marginTop: 14,
    },
    dateMissingText: {
      ...TYPE.bodySmall,
      flex: 1,
      color: colors.textPrimary,
      marginLeft: 12,
    },
    lineTitle: {
      ...TYPE.body,
      color: colors.textPrimary,
    },
    restockButton: {
      marginTop: 6,
    },
    inlineInputRow: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 6,
    },
    inlineInput: {
      ...TYPE.body,
      flex: 1,
      height: 50,
      backgroundColor: colors.surfaceAlt,
      borderRadius: RADIUS.button,
      paddingHorizontal: 14,
      color: colors.textPrimary,
    },
    confirmButton: {
      height: 50,
      marginLeft: 10,
      paddingHorizontal: 24,
    },
    noteText: {
      ...TYPE.body,
      color: colors.textPrimary,
      lineHeight: 22,
    },
    emptyHistory: {
      ...TYPE.bodySmall,
      color: colors.textSecondary,
      marginLeft: 4,
    },
    bottomSpacer: {
      height: 32,
    },
  });
