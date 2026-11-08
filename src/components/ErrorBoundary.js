import React from "react";
import { Appearance, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { DARK_COLORS, LIGHT_COLORS, TYPE } from "../utils/constants";

// The last resort when a screen throws. It sits outside every provider, so it
// reads the theme itself. Items are saved as they change, so nothing is lost by
// getting here, and that's worth saying.
export default class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("The app hit an error:", error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }
    const colors = Appearance.getColorScheme() === "dark" ? DARK_COLORS : LIGHT_COLORS;
    return (
      <View style={[styles.page, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          Something went wrong
        </Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          Your items are safe. They're saved as you change them.
        </Text>
        <TouchableOpacity
          activeOpacity={0.8}
          style={[styles.button, { backgroundColor: colors.accent }]}
          onPress={() => this.setState({ error: null })}
          accessibilityRole="button"
        >
          <Text style={[styles.buttonText, { color: colors.onAccent }]}>Try again</Text>
        </TouchableOpacity>
        <ScrollView style={styles.details}>
          <Text style={[styles.detailText, { color: colors.textSecondary }]}>
            {String(error?.message || error)}
          </Text>
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    justifyContent: "center",
    padding: 28,
  },
  title: {
    ...TYPE.title,
    marginBottom: 8,
  },
  body: {
    ...TYPE.body,
  },
  button: {
    minHeight: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },
  buttonText: {
    ...TYPE.button,
  },
  details: {
    maxHeight: 120,
    marginTop: 20,
  },
  detailText: {
    ...TYPE.caption,
  },
});
