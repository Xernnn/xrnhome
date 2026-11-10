// Expiry notifications. They're scheduled on the phone, so they arrive with no
// server and no connection. reminderPlan (inventoryLogic.js) decides what gets
// said when; this file hands that to the system.
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

export const remindersSupported = Platform.OS !== "web";

const CHANNEL = "expiry";

if (remindersSupported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

export async function askForReminders() {
  if (!remindersSupported) {
    return false;
  }
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) {
      return true;
    }
    const asked = await Notifications.requestPermissionsAsync();
    return !!asked.granted;
  } catch (error) {
    console.error("Failed to ask for notifications:", error);
    return false;
  }
}

export async function clearReminders() {
  if (!remindersSupported) {
    return;
  }
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (error) {
    console.error("Failed to clear reminders:", error);
  }
}

export async function scheduleReminders(plan) {
  if (!remindersSupported) {
    return;
  }
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: "Expiry reminders",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    for (const { at, title, body } of plan) {
      await Notifications.scheduleNotificationAsync({
        content: { title, body },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(at),
          channelId: CHANNEL,
        },
      });
    }
  } catch (error) {
    console.error("Failed to schedule reminders:", error);
  }
}
