import React, { useMemo, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Alert, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useInventory } from "../context/InventoryContext";
import { useTheme } from "../context/ThemeContext";
import { describeSync, useSync } from "../context/SyncContext";
import { useReminders } from "../context/RemindersContext";
import {
  FootNote,
  GroupCard,
  GroupRow,
  PageTitle,
  SectionLabel,
  Segmented,
  SwitchRow,
  Wordmark,
} from "../components/ui";
import { haptics } from "../utils/haptics";
import { exportData, importData } from "../utils/backup";
import { installedBuild, installedVersion, updatesSupported } from "../utils/updates";
import { FONTS, SPACING, TYPE, itemCount as plural } from "../utils/constants";

const THEME_OPTIONS = [
  { value: "system", label: "System", icon: "theme-light-dark" },
  { value: "light", label: "Light", icon: "white-balance-sunny" },
  { value: "dark", label: "Dark", icon: "weather-night" },
];

const updateLine = (update) => {
  switch (update.state) {
    case "checking":
      return "Looking for a new build…";
    case "downloading":
      return `Downloading build ${update.info.versionCode}… ${Math.round(
        (update.progress || 0) * 100
      )}%`;
    case "available":
      return `Build ${update.info.versionCode} is out${
        Number.isFinite(update.info.size)
          ? ` (${Math.round(update.info.size / 1000000)} MB)`
          : ""
      }. It waits for Wi-Fi, or tap to download`;
    case "ready":
      return `Build ${update.info.versionCode} is ready to install`;
    case "none":
      return "Up to date";
    case "error":
      return update.message;
    default:
      return "Checks the home server every few hours";
  }
};

export default function SettingsScreen({ navigation }) {
  const { items, categories, replaceAllItems } = useInventory();
  const { colors, mode, setMode } = useTheme();
  const sync = useSync();
  const reminders = useReminders();
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
      await exportData(items, categories);
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
      const backup = await importData();
      if (backup === null) {
        return;
      }
      const imported = backup.items;
      Alert.alert(
        "Replace all data?",
        `This will replace your current ${plural(items.length)} with ${plural(
          imported.length
        )} from the backup. This can't be undone.${
          sync.server
            ? " The home server's copy follows in a few seconds, though it keeps older copies."
            : ""
        }`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Replace",
            style: "destructive",
            onPress: () => {
              const count = replaceAllItems(
                imported,
                backup.schemaVersion,
                backup.categories
              );
              haptics.success();
              Alert.alert("Import complete", `Restored ${plural(count)}.`);
            },
          },
        ]
      );
    } catch (error) {
      console.error("Import failed:", error);
      Alert.alert(
        "Import failed",
        "That file couldn't be read as an xrnhome backup."
      );
    } finally {
      setBusy(false);
    }
  };

  const handleReminders = async (value) => {
    haptics.selection();
    const on = await reminders.setEnabled(value);
    if (value && !on) {
      Alert.alert(
        "Notifications are off",
        "Allow notifications for xrnhome in the phone's settings, then try again."
      );
    }
  };

  const update = sync.update;
  const updateBusy = update.state === "checking" || update.state === "downloading";
  const build = installedBuild();
  const version = installedVersion();

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <PageTitle title="settings" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <SectionLabel top={4}>Appearance</SectionLabel>
        <Segmented
          options={THEME_OPTIONS}
          value={mode}
          onChange={handleSelectTheme}
        />

        <SectionLabel>Home server</SectionLabel>
        <GroupCard>
          <GroupRow
            first
            icon={
              sync.status.state === "error" || sync.status.state === "conflict"
                ? "cloud-alert-outline"
                : sync.server
                ? "cloud-check-outline"
                : "cloud-off-outline"
            }
            iconColor={
              sync.status.state === "error"
                ? colors.danger
                : sync.status.state === "conflict"
                ? colors.warning
                : sync.server
                ? colors.accent
                : undefined
            }
            title="Sync"
            subtitle={
              sync.available
                ? describeSync(sync.status, sync.meta)
                : "Works in the phone app"
            }
            onPress={() => navigation.navigate("HomeServer")}
          />
          {sync.server && updatesSupported ? (
            <GroupRow
              icon={update.state === "ready" ? "download-circle" : "download-circle-outline"}
              iconColor={update.state === "ready" ? colors.accent : undefined}
              title={
                update.state === "ready"
                  ? "Install the update"
                  : update.state === "available"
                  ? "Download the update"
                  : "Check for updates"
              }
              subtitle={updateLine(update)}
              onPress={() => sync.installUpdate()}
              disabled={updateBusy}
              chevron={false}
            />
          ) : null}
        </GroupCard>
        <FootNote>
          The home server keeps a copy of your items and photos, shares them
          between your phone and laptop, and hands out new builds of the app.
        </FootNote>

        <SectionLabel>Items</SectionLabel>
        <GroupCard>
          {reminders.supported ? (
            <SwitchRow
              first
              icon="bell-outline"
              title="Expiry reminders"
              subtitle="A notification before things expire, and on the day"
              value={reminders.enabled}
              onValueChange={handleReminders}
            />
          ) : null}
          <GroupRow
            first={!reminders.supported}
            icon="tag-multiple-outline"
            title="Your categories"
            subtitle={
              categories.length > 0
                ? `${categories.length} of your own`
                : "Add your own next to the built-in ones"
            }
            onPress={() => navigation.navigate("Categories")}
          />
        </GroupCard>

        {/* A backup names files on the phone that made it, which a browser can't
            read: imported here, its photos would be dropped from the server too. */}
        {Platform.OS === "web" ? null : (
          <>
            <SectionLabel>Data</SectionLabel>
            <GroupCard>
              <GroupRow
                first
                icon="export-variant"
                title="Export data"
                subtitle="Save everything to a JSON file"
                onPress={handleExport}
                disabled={busy}
              />
              <GroupRow
                icon="import"
                title="Import data"
                subtitle="Replace everything with a backup"
                onPress={handleImport}
                disabled={busy}
              />
            </GroupCard>
            <FootNote>
              {sync.server
                ? "Backup files have no photos. The home server keeps those."
                : "Backup files have no photos, so they only live on this phone until you connect a home server."}
            </FootNote>
          </>
        )}

        <SectionLabel>About</SectionLabel>
        <GroupCard>
          <View style={styles.about}>
            <Wordmark size={20} />
            <Text style={styles.aboutLine}>
              {plural(items.length)}
              {version ? ` · version ${version}` : ""}
              {build ? ` · build ${build}` : ""}
            </Text>
          </View>
        </GroupCard>
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
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: SPACING.screen,
      paddingTop: 8,
    },
    about: {
      padding: 16,
    },
    aboutLine: {
      ...TYPE.caption,
      fontFamily: FONTS.monoMedium,
      color: colors.textSecondary,
      marginTop: 8,
    },
    bottomSpacer: {
      height: 24,
    },
  });
