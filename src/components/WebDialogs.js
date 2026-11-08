// Alert.alert does nothing in the browser, and every question the app asks
// (discard your changes? merge these? delete it?) goes through it. On web this
// puts up the same dialog, so those questions exist there too and no caller has
// to know. Esc presses Cancel. Enter presses the main button, unless pressing it
// destroys something: that takes a click, as on the phone it takes a tap.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Modal, Platform, StyleSheet, Text, View } from "react-native";

import { useTheme } from "../context/ThemeContext";
import { TextButton } from "./ui";
import { RADIUS, SPACING, TYPE, hexToRgba } from "../utils/constants";

const waiting = [];
let wake = null;

export const installWebDialogs = () => {
  if (Platform.OS !== "web") {
    return;
  }
  Alert.alert = (title, message, buttons) => {
    waiting.push({
      title,
      message,
      buttons: buttons && buttons.length > 0 ? buttons : [{ text: "OK" }],
    });
    if (wake) {
      wake();
    }
  };
};

export default function WebDialogs() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [dialog, setDialog] = useState(null);

  useEffect(() => {
    wake = () => setDialog((current) => current || waiting.shift() || null);
    wake();
    return () => {
      wake = null;
    };
  }, []);

  const press = (button) => {
    setDialog(waiting.shift() || null);
    if (button && button.onPress) {
      button.onPress();
    }
  };
  const pressRef = useRef(press);
  pressRef.current = press;

  useEffect(() => {
    if (!dialog) {
      return undefined;
    }
    const { buttons } = dialog;
    const cancel =
      buttons.find((b) => b.style === "cancel") ||
      (buttons.length === 1 ? buttons[0] : null);
    const main = [...buttons].reverse().find((b) => b.style !== "cancel");
    // The keyboard is the dialog's while it's up. Focus would otherwise stay on
    // whatever opened it, and Enter would press that again behind the dialog.
    if (document.activeElement) {
      document.activeElement.blur();
    }
    const onKey = (event) => {
      if (event.key !== "Enter" && event.key !== "Escape" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape" && cancel) {
        pressRef.current(cancel);
      } else if (event.key === "Enter" && main && main.style !== "destructive") {
        pressRef.current(main);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [dialog]);

  if (!dialog) {
    return null;
  }
  return (
    <Modal visible transparent animationType="none">
      <View
        style={[styles.scrim, { backgroundColor: hexToRgba(colors.shadow, 0.45) }]}
        accessibilityRole="alert"
      >
        <View style={styles.dialog}>
          {dialog.title ? <Text style={styles.title}>{dialog.title}</Text> : null}
          {dialog.message ? <Text style={styles.message}>{dialog.message}</Text> : null}
          <View style={styles.buttons}>
            {dialog.buttons.map((button) => (
              <TextButton
                key={button.text}
                label={button.text}
                strong={button.style !== "cancel"}
                danger={button.style === "destructive"}
                onPress={() => press(button)}
              />
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    scrim: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: SPACING.screen,
    },
    dialog: {
      width: "100%",
      maxWidth: 440,
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: RADIUS.card,
      padding: SPACING.screen,
    },
    title: {
      ...TYPE.title,
      color: colors.textPrimary,
      marginBottom: 8,
    },
    message: {
      ...TYPE.bodySmall,
      color: colors.textPrimary,
      lineHeight: 20,
    },
    buttons: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "flex-end",
      alignItems: "center",
      marginTop: 16,
    },
  });
