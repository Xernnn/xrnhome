// Settings → Home server: connect, see how syncing goes, restore, and decide
// what happens when the server holds items this device's aren't built on.
import React, { useMemo, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useInventory } from "../context/InventoryContext";
import { useTheme } from "../context/ThemeContext";
import { describeSync, useSync } from "../context/SyncContext";
import {
  Card,
  FootNote,
  GroupCard,
  GroupRow,
  OutlinePill,
  PillButton,
  RoundIconButton,
  SectionLabel,
  TextButton,
  TopBar,
} from "../components/ui";
import { haptics } from "../utils/haptics";
import { deviceName } from "../utils/homeServer";
import { RADIUS, SPACING, TYPE, itemCount as plural } from "../utils/constants";

const CONFLICT_TITLES = {
  other: "The home server has other items",
  empty: `This ${deviceName} has no items left`,
  damaged: `This ${deviceName}'s list was damaged`,
  shrink: "Syncing would remove most of your items",
};

export default function HomeServerScreen({ navigation }) {
  const { items } = useInventory();
  const sync = useSync();
  const status = sync.status;
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [url, setUrl] = useState("");
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = async (work) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const connect = () =>
    run(async () => {
      await sync.connect({ url, user, password });
      setPassword("");
      haptics.success();
    });

  const restore = () =>
    run(async () => {
      const { count, missing } = await sync.restore();
      haptics.success();
      Alert.alert(
        "Restored",
        `${plural(count)} from the home server.${
          missing > 0
            ? ` ${missing} ${missing === 1 ? "photo wasn't" : "photos weren't"} on the server.`
            : ""
        }`
      );
    });

  const confirmRestore = () => {
    Alert.alert(
      "Restore from the home server?",
      `The ${plural(items.length)} on this ${deviceName} are replaced by the server's copy.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Restore", style: "destructive", onPress: restore },
      ]
    );
  };

  const confirmReplace = () => {
    const known = Number.isFinite(status.serverCount);
    const fewer = known && status.serverCount > items.length;
    Alert.alert(
      "Replace the server's copy?",
      `The home server's ${
        known ? plural(status.serverCount) : "items"
      } will be replaced by the ${plural(items.length)} on this ${deviceName}.${
        fewer ? " That's fewer than the server has." : ""
      }`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Replace",
          style: "destructive",
          onPress: () => run(() => sync.replaceServer()),
        },
      ]
    );
  };

  const confirmEmpty = () => {
    Alert.alert(
      "Empty the server's copy too?",
      `Its ${plural(status.serverCount || 0)} will go from the current copy. The server keeps older copies for a while, but getting them back means going to the server.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Empty it",
          style: "destructive",
          onPress: () => run(() => sync.replaceServer({ allowEmpty: true })),
        },
      ]
    );
  };

  const confirmDisconnect = () => {
    Alert.alert(
      "Disconnect?",
      `This ${deviceName} stops syncing and forgets the login. The server keeps its copy.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Disconnect", style: "destructive", onPress: sync.disconnect },
      ]
    );
  };

  const syncing = status.state === "syncing";
  // Only with something on both sides, and not for a list that came out damaged:
  // that one wants the server's copy, not to be mixed into it.
  const canKeepBoth =
    (status.reason === "other" || status.reason === "shrink") &&
    items.length > 0 &&
    status.serverCount > 0;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <TopBar
        left={
          <RoundIconButton
            icon="arrow-left"
            label="Back"
            onPress={() => navigation.goBack()}
          />
        }
        title="Home server"
      />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {!sync.available ? (
          <Card>
            <Text style={styles.body}>
              Syncing works in the phone app, and on the page your home server
              serves.
            </Text>
          </Card>
        ) : !sync.server ? (
          <>
            <Card>
              <Text style={styles.fieldLabel}>Address</Text>
              <TextInput
                style={styles.input}
                value={url}
                onChangeText={setUrl}
                placeholder="https://…/xrnhome"
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
              <Text style={styles.fieldLabel}>User name</Text>
              <TextInput
                style={styles.input}
                value={user}
                onChangeText={setUser}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={styles.fieldLabel}>Password</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <PillButton
                label={busy ? "Connecting" : "Connect"}
                icon="server-network"
                onPress={connect}
                disabled={busy || !url.trim() || !user.trim() || !password}
                style={styles.mainButton}
              />
            </Card>
            <FootNote>
              The home server keeps a copy of every item and its photo, and
              hands out new builds of the app. The login is the one your other
              xrn apps sync with.
            </FootNote>
          </>
        ) : (
          <>
            {status.state === "conflict" ? (
              <Card style={styles.conflict}>
                <Text style={styles.conflictTitle}>
                  {CONFLICT_TITLES[status.reason] || CONFLICT_TITLES.other}
                </Text>
                <Text style={styles.body}>
                  {Number.isFinite(status.serverCount)
                    ? `The server holds ${plural(status.serverCount)}${
                        status.serverSavedAt
                          ? ` from ${new Date(status.serverSavedAt).toLocaleString()}`
                          : ""
                      }. `
                    : ""}
                  This {deviceName} has {plural(items.length)}. Nothing syncs until
                  you pick what to keep.
                </Text>
                {error ? <Text style={styles.error}>{error}</Text> : null}
                {canKeepBoth ? (
                  <PillButton
                    label="Keep everything from both"
                    icon="set-merge"
                    onPress={() => run(sync.keepBoth)}
                    disabled={busy}
                    style={styles.mainButton}
                  />
                ) : null}
                <PillButton
                  label="Use the server's items"
                  icon="cloud-download-outline"
                  tone={canKeepBoth ? "neutral" : "accent"}
                  onPress={confirmRestore}
                  disabled={busy || status.serverCount === 0}
                  style={canKeepBoth ? styles.secondButton : styles.mainButton}
                />
                <View style={styles.otherChoice}>
                  {items.length > 0 ? (
                    <TextButton
                      label={`Replace the server's copy with this ${deviceName}'s`}
                      danger
                      onPress={confirmReplace}
                      disabled={busy}
                    />
                  ) : status.reason === "empty" ? (
                    <TextButton
                      label="I meant to delete everything"
                      danger
                      onPress={confirmEmpty}
                      disabled={busy}
                    />
                  ) : null}
                </View>
              </Card>
            ) : null}

            <SectionLabel top={status.state === "conflict" ? 20 : 4}>Sync</SectionLabel>
            <GroupCard>
              <GroupRow
                first
                icon={
                  status.state === "error" || status.state === "conflict"
                    ? "cloud-alert-outline"
                    : syncing
                    ? "cloud-sync-outline"
                    : "cloud-check-outline"
                }
                iconColor={
                  status.state === "error"
                    ? colors.danger
                    : status.state === "conflict"
                    ? colors.warning
                    : colors.accent
                }
                title={describeSync(status, sync.meta)}
                subtitle={
                  sync.server.browser
                    ? "This page comes from your home server"
                    : `${sync.server.user} · ${sync.server.url.replace(/^https:\/\//, "")}`
                }
              />
            </GroupCard>
            {error && status.state !== "conflict" ? (
              <Text style={styles.error}>{error}</Text>
            ) : null}
            <PillButton
              label={syncing ? "Syncing" : "Sync now"}
              icon="sync"
              onPress={() => sync.syncNow()}
              disabled={busy || syncing || status.state === "conflict"}
              style={styles.mainButton}
            />
            <OutlinePill
              label="Restore from the home server"
              icon="cloud-download-outline"
              onPress={confirmRestore}
              disabled={busy || syncing}
              style={styles.secondButton}
            />
            <FootNote>
              Changes go up a few seconds after you make them, and when you
              leave the app. Changes from your other device come down while
              the app is open, and the two are merged. Restoring brings the server's copy
              and its photos to this {deviceName}, in place of what's here.
            </FootNote>
            {sync.server.browser ? null : (
              <View style={styles.disconnect}>
                <TextButton label="Disconnect" danger onPress={confirmDisconnect} />
              </View>
            )}
          </>
        )}
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
    content: {
      paddingHorizontal: SPACING.screen,
      paddingBottom: 32,
    },
    body: {
      ...TYPE.bodySmall,
      color: colors.textPrimary,
      lineHeight: 20,
    },
    fieldLabel: {
      ...TYPE.question,
      color: colors.textSecondary,
      marginBottom: 8,
      marginTop: 4,
    },
    input: {
      ...TYPE.body,
      backgroundColor: colors.surfaceAlt,
      borderRadius: RADIUS.button,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: colors.textPrimary,
      marginBottom: 14,
    },
    error: {
      ...TYPE.caption,
      color: colors.danger,
      marginTop: 10,
      marginLeft: 4,
    },
    mainButton: {
      marginTop: 16,
    },
    secondButton: {
      marginTop: 10,
    },
    otherChoice: {
      alignItems: "center",
      marginTop: 18,
    },
    conflict: {
      borderColor: colors.warning,
    },
    conflictTitle: {
      ...TYPE.title,
      color: colors.textPrimary,
      marginBottom: 8,
    },
    disconnect: {
      alignItems: "center",
      marginTop: 20,
    },
  });
