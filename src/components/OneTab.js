// The laptop version keeps the list in the browser's storage, one copy for all
// of its tabs. Two tabs of it each saved their whole list over the other's, and
// the next load sent the stale one to the server on top of the newer copy: a
// change made in one tab was undone with no question asked. So one tab runs the
// app, holding a Web Lock while it's open; another says so and waits, and when
// the first one closes it starts the app, which reads the list afresh. Where
// there are no Web Locks (the phone app), the app just runs.
import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { Text } from "./Text";
import { useTheme } from "../context/ThemeContext";
import { TYPE } from "../utils/constants";

const LOCK = "xrnhome-app";

const locksHere = () =>
  typeof navigator !== "undefined" && navigator.locks && typeof navigator.locks.request === "function"
    ? navigator.locks
    : null;

export default function OneTab({ children }) {
  const { colors } = useTheme();
  const [locks] = useState(locksHere);
  const [state, setState] = useState(locks ? "asking" : "mine");

  useEffect(() => {
    if (!locks) return undefined;
    let closed = false;
    let release;
    const open = new Promise((resolve) => {
      release = resolve;
    });
    const waiting = typeof AbortController === "function" ? new AbortController() : null;
    // Held until this tab closes (or this component goes).
    const hold = () => {
      if (!closed) setState("mine");
      return open;
    };
    locks
      .request(LOCK, { ifAvailable: true }, (lock) => {
        if (lock) return hold();
        if (!closed) setState("elsewhere");
        locks.request(LOCK, waiting ? { signal: waiting.signal } : {}, hold).catch(() => {});
        return undefined;
      })
      .catch(() => {
        if (!closed) setState("mine"); // a browser that refuses the lock still gets the app
      });
    return () => {
      closed = true;
      waiting?.abort();
      release();
    };
  }, [locks]);

  if (state === "mine") return children;
  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      {state === "elsewhere" ? (
        <Text style={[TYPE.title, { color: colors.textSecondary }]}>Open in another tab</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: "center", justifyContent: "center" },
});
