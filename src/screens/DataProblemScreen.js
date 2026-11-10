// Shown instead of the app when the saved items couldn't be read at all. Nothing
// has been written over them, and nothing will be until the person chooses:
// showing an empty app here is how a damaged list becomes a lost one.
import React, { useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useInventory } from "../context/InventoryContext";
import { useTheme } from "../context/ThemeContext";
import { deviceName } from "../utils/homeServer";
import { useSync } from "../context/SyncContext";
import { Card, OutlinePill, PillButton, TextButton } from "../components/ui";
import { SPACING, TYPE, itemCount } from "../utils/constants";

export default function DataProblemScreen() {
  const { reload, replaceAllItems } = useInventory();
  const sync = useSync();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
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

  const restore = () =>
    run(async () => {
      const { count } = await sync.restore();
      Alert.alert("Restored", `${itemCount(count)} from the home server.`);
    });

  const startOver = () => {
    Alert.alert(
      "Start with an empty list?",
      `Use this only if the items can't be brought back. The unreadable copy stays set aside on this ${deviceName}.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Start over",
          style: "destructive",
          onPress: () => replaceAllItems([], undefined),
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <Card>
          <Text style={styles.title}>Your items couldn't be read</Text>
          <Text style={styles.body}>
            Nothing has been deleted or overwritten. Try again first: this is
            sometimes just the {deviceName} being busy.
          </Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <PillButton
            label={busy ? "Working" : "Try again"}
            icon="refresh"
            onPress={() => run(reload)}
            disabled={busy}
            style={styles.button}
          />
          {sync.server ? (
            <OutlinePill
              label="Restore from the home server"
              icon="cloud-download-outline"
              onPress={restore}
              disabled={busy}
              style={styles.button}
            />
          ) : null}
          <View style={styles.last}>
            <TextButton label="Start over" danger onPress={startOver} disabled={busy} />
          </View>
        </Card>
      </View>
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
      flex: 1,
      justifyContent: "center",
      paddingHorizontal: SPACING.screen,
    },
    title: {
      ...TYPE.title,
      color: colors.textPrimary,
      marginBottom: 8,
    },
    body: {
      ...TYPE.bodySmall,
      color: colors.textPrimary,
      lineHeight: 20,
    },
    error: {
      ...TYPE.caption,
      color: colors.danger,
      marginTop: 10,
    },
    button: {
      marginTop: 14,
    },
    last: {
      alignItems: "center",
      marginTop: 14,
    },
  });
