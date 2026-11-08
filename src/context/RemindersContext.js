// Whether expiry reminders are on, and keeping what's scheduled in step with the
// items. The first item with an expiry date is what asks for the permission, so
// nobody who doesn't track dates ever sees the question.
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useInventory } from "./InventoryContext";
import { reminderPlan } from "../utils/inventoryLogic";
import {
  askForReminders,
  clearReminders,
  remindersSupported,
  scheduleReminders,
} from "../utils/reminders";
import { loadRemindersSetting, saveRemindersSetting } from "../utils/storage";

const SETTLE_MS = 1500;

const RemindersContext = createContext(null);

export function RemindersProvider({ children }) {
  const { items } = useInventory();
  const [enabled, setEnabledState] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const scheduled = useRef(null);

  useEffect(() => {
    loadRemindersSetting().then((saved) => {
      setEnabledState(typeof saved === "boolean" ? saved : null);
      setLoaded(true);
    });
  }, []);

  const hasDates = items.some((item) => item.quantity > 0 && item.expiryDate);

  // Asked once. A "no" is kept, and Settings can still turn them on.
  useEffect(() => {
    if (!loaded || enabled !== null || !hasDates || !remindersSupported) {
      return;
    }
    askForReminders().then((granted) => {
      setEnabledState(granted);
      saveRemindersSetting(granted);
    });
  }, [loaded, enabled, hasDates]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const plan = reminderPlan(items);
    const signature = JSON.stringify(plan);
    if (signature === scheduled.current) {
      return undefined;
    }
    const timer = setTimeout(() => {
      scheduled.current = signature;
      scheduleReminders(plan);
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [items, enabled]);

  // Returns whether they ended up on: the system can say no.
  const setEnabled = useCallback(async (value) => {
    const next = value ? await askForReminders() : false;
    setEnabledState(next);
    saveRemindersSetting(next);
    if (!next) {
      scheduled.current = null;
      clearReminders();
    }
    return next;
  }, []);

  const value = useMemo(
    () => ({ supported: remindersSupported, enabled: !!enabled, setEnabled }),
    [enabled, setEnabled]
  );

  return (
    <RemindersContext.Provider value={value}>
      {children}
    </RemindersContext.Provider>
  );
}

export function useReminders() {
  const ctx = useContext(RemindersContext);
  if (!ctx) {
    throw new Error("useReminders must be used within a RemindersProvider");
  }
  return ctx;
}
