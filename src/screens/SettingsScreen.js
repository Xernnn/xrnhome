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

import { useInventory } from "../context/InventoryContext";
import { useTheme } from "../context/ThemeContext";
import { haptics } from "../utils/haptics";
import { exportData, importData } from "../utils/backup";
import { SPACING, RADIUS, SHADOW } from "../utils/constants";

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: "white-balance-sunny" },
  { value: "dark", label: "Dark", icon: "weather-night" },
  { value: "system", label: "System", icon: "theme-light-dark" },
];

export default function SettingsScreen() {
  const { items, replaceAllItems } = useInventory();
  const { colors, mode, setMode } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [busy, setBusy] = useState(false);

  const handleSelectTheme = (value) => {
    haptics.selection();
    setMode(value);
  };

  const handleExport = async () => {
    if (busy) {
      return;
    }
    if (items.length === 0) {
      Alert.alert("Nothing to export", "Add some items first.");
      return;
    }
    setBusy(true);
    try {
      await exportData(items);
      haptics.success();
    } catch (error) {
      console.error("Export failed:", error);
      Alert.alert("Export failed", "Couldn't export your data. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      const imported = await importData();
      if (imported === null) {
        return;
      }
      Alert.alert(
        "Replace all data?",
        `This will replace your current ${items.length} item${
          items.length === 1 ? "" : "s"
        } with ${imported.length} item${
          imported.length === 1 ? "" : "s"
        } from the backup. This can't be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Replace",
            style: "destructive",
            onPress: () => {
              const count = replaceAllItems(imported);
              haptics.success();
              Alert.alert("Import complete", `Restored ${count} items.`);
            },
          },
        ]
      );
    } catch (error) {
      console.error("Import failed:", error);
      Alert.alert(
        "Import failed",
        "That file couldn't be read as a PantryPal backup."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionLabel}>Appearance</Text>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Theme</Text>
          <Text style={styles.cardHint}>
            Choose how PantryPal looks, or follow your device setting.
          </Text>
          <View style={styles.segmented}>
            {THEME_OPTIONS.map((option) => {
              const active = mode === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  activeOpacity={0.7}
                  onPress={() => handleSelectTheme(option.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={[styles.segment, active && styles.segmentActive]}
                >
                  <MaterialCommunityIcons
                    name={option.icon}
                    size={18}
                    color={active ? colors.white : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.segmentText,
                      active && styles.segmentTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <Text style={styles.sectionLabel}>Data</Text>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Backup &amp; restore</Text>
          <Text style={styles.cardHint}>
            Export your kitchen to a JSON file you can save or share, or import a
            previous backup. Importing replaces everything.
          </Text>

          <TouchableOpacity
            activeOpacity={0.7}
            style={styles.actionButton}
            onPress={handleExport}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Export data"
          >
            <MaterialCommunityIcons
              name="export-variant"
              size={20}
              color={colors.accent}
            />
            <Text style={styles.actionButtonText}>Export data</Text>
            <MaterialCommunityIcons
              name="chevron-right"
              size={20}
              color={colors.textSecondary}
            />
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            style={styles.actionButton}
            onPress={handleImport}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Import data"
          >
            <MaterialCommunityIcons
              name="import"
              size={20}
              color={colors.accent}
            />
            <Text style={styles.actionButtonText}>Import data</Text>
            <MaterialCommunityIcons
              name="chevron-right"
              size={20}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>About</Text>
        <View style={styles.card}>
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>Items tracked</Text>
            <Text style={styles.aboutValue}>{items.length}</Text>
          </View>
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>App</Text>
            <Text style={styles.aboutValue}>PantryPal v2</Text>
          </View>
        </View>

        <Text style={styles.footerNote}>
          PantryPal keeps everything on your device. No account, no cloud.
        </Text>
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
    header: {
      paddingHorizontal: SPACING.screen,
      paddingVertical: 12,
    },
    title: {
      fontSize: 24,
      fontWeight: "800",
      color: colors.textPrimary,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: SPACING.screen,
      paddingTop: 4,
    },
    sectionLabel: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.textSecondary,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginTop: SPACING.screen,
      marginBottom: SPACING.inner,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.card,
      padding: SPACING.card,
      ...SHADOW,
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    cardHint: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 4,
      lineHeight: 18,
    },
    segmented: {
      flexDirection: "row",
      backgroundColor: colors.surfaceAlt,
      borderRadius: RADIUS.button,
      padding: 4,
      marginTop: SPACING.card,
    },
    segment: {
      flex: 1,
      flexDirection: "row",
      paddingVertical: 10,
      borderRadius: RADIUS.button - 2,
      alignItems: "center",
      justifyContent: "center",
    },
    segmentActive: {
      backgroundColor: colors.accent,
    },
    segmentText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.textSecondary,
      marginLeft: 6,
    },
    segmentTextActive: {
      color: colors.white,
    },
    actionButton: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 14,
      marginTop: SPACING.inner,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    actionButtonText: {
      flex: 1,
      fontSize: 15,
      fontWeight: "600",
      color: colors.textPrimary,
      marginLeft: SPACING.card,
    },
    aboutRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 8,
    },
    aboutLabel: {
      fontSize: 15,
      color: colors.textSecondary,
    },
    aboutValue: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    footerNote: {
      fontSize: 12,
      color: colors.textSecondary,
      textAlign: "center",
      marginTop: SPACING.screen,
      fontStyle: "italic",
    },
    bottomSpacer: {
      height: 24,
    },
  });
