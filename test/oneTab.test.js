// Two tabs of the laptop version share one browser's storage: each saved its
// whole list over the other's, and a reload then sent the stale one to the
// server on top of the newer copy, undoing a change with no question asked.
// Only one tab runs the app; another says so, and takes over when the first
// one closes, reading the list afresh. A Web Locks stand-in here, shared by
// both "tabs" as the browser's is.
import React from "react";
import TestRenderer, { act } from "react-test-renderer";

import { ThemeProvider } from "../src/context/ThemeContext";
import OneTab from "../src/components/OneTab";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

// navigator.locks, as much of it as OneTab uses: exclusive locks, ifAvailable,
// a queue of waiters, and a signal that takes a waiter out of the queue.
function fakeLocks() {
  const held = new Set();
  const waiting = [];
  const grant = (name, callback) => {
    held.add(name);
    return Promise.resolve(callback({ name })).finally(() => {
      held.delete(name);
      const next = waiting.findIndex((w) => w.name === name);
      if (next >= 0) {
        const [w] = waiting.splice(next, 1);
        grant(name, w.callback).then(w.resolve, w.reject);
      }
    });
  };
  return {
    held,
    waiting,
    request(name, options, callback) {
      if (typeof options === "function") [callback, options] = [options, {}];
      if (!held.has(name)) return grant(name, callback);
      if (options.ifAvailable) return Promise.resolve(callback(null));
      return new Promise((resolve, reject) => {
        const w = { name, callback, resolve, reject };
        waiting.push(w);
        options.signal?.addEventListener("abort", () => {
          const at = waiting.indexOf(w);
          if (at >= 0) waiting.splice(at, 1);
          reject(new Error("AbortError"));
        });
      });
    },
  };
}

const mounted = [];
function App({ name }) {
  React.useEffect(() => {
    mounted.push(name);
  }, [name]);
  return null;
}

const tab = (name) =>
  TestRenderer.create(
    <ThemeProvider>
      <OneTab>
        <App name={name} />
      </OneTab>
    </ThemeProvider>
  );
const said = (renderer) =>
  renderer.root.findAll((n) => typeof n.props.children === "string").map((n) => n.props.children);
const settle = () => act(async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
});

let original;
beforeEach(() => {
  original = global.navigator;
  mounted.length = 0;
});
afterEach(() => {
  global.navigator = original;
});

test("a second tab doesn't run the app, and takes over when the first closes", async () => {
  global.navigator = { ...original, locks: fakeLocks() };
  let first;
  let second;
  await act(async () => {
    first = tab("first");
  });
  await settle();
  await act(async () => {
    second = tab("second");
  });
  await settle();
  expect(mounted).toEqual(["first"]);
  expect(said(second)).toContain("Open in another tab");

  await act(async () => first.unmount());
  await settle();
  expect(mounted).toEqual(["first", "second"]);
  expect(said(second)).not.toContain("Open in another tab");
  await act(async () => second.unmount());
});

test("a tab closed while it waits leaves no claim behind", async () => {
  const locks = fakeLocks();
  global.navigator = { ...original, locks };
  let first;
  await act(async () => {
    first = tab("first");
  });
  await settle();
  let second;
  await act(async () => {
    second = tab("second");
  });
  await settle();
  await act(async () => second.unmount());
  await settle();
  expect(locks.waiting).toHaveLength(0);
  await act(async () => first.unmount());
  await settle();
  expect(locks.held.size).toBe(0);
  expect(mounted).toEqual(["first"]);
});

test("without Web Locks (the phone app), the app runs as before", async () => {
  global.navigator = { ...original, locks: undefined };
  let only;
  await act(async () => {
    only = tab("only");
  });
  expect(mounted).toEqual(["only"]);
  await act(async () => only.unmount());
});
