import * as Haptics from "expo-haptics";

// Thin wrapper so a failing/unsupported haptics call never crashes the UI.
const safe = (fn) => {
  try {
    const result = fn();
    if (result && typeof result.catch === "function") {
      result.catch(() => {});
    }
  } catch (e) {
    // Haptics are a nice-to-have; ignore failures (e.g. on web).
  }
};

export const haptics = {
  light: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  medium: () =>
    safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  success: () =>
    safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () =>
    safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  selection: () => safe(() => Haptics.selectionAsync()),
};
