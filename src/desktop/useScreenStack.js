import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DEFAULT_ROOM, ROOMS } from "../utils/constants";

const PAGES = [...ROOMS.map((room) => room.key), "settings"];

let nextKey = 0;
const screen = (name, params) => ({
  key: `${name}-${nextKey++}`,
  name,
  params: params || {},
});

// A stack of screens for the side panel, with the parts of React Navigation's
// `navigation` the phone screens use, so they run here unchanged. `beforeRemove`
// is what stops a form with unsaved changes from being closed without asking, and
// anything else that would close one goes through `guard` to get the same question.
export function useScreenStack() {
  const [stack, setStack] = useState([]);
  const stackRef = useRef(stack);
  stackRef.current = stack;
  const listeners = useRef(new Set());

  const guard = useCallback((action) => {
    let stopped = false;
    const event = {
      preventDefault: () => {
        stopped = true;
      },
      data: { action },
    };
    listeners.current.forEach((listener) => listener(event));
    if (!stopped) {
      action();
    }
  }, []);

  const navigation = useMemo(
    () => ({
      addListener: (type, listener) => {
        if (type !== "beforeRemove") {
          return () => {};
        }
        listeners.current.add(listener);
        return () => listeners.current.delete(listener);
      },
      dispatch: (action) => action(),
      // A screen further down: what's above it goes. A new one: on top, and
      // nothing is removed, as when the item page opens its form.
      navigate: (name, params) => {
        const at = stackRef.current.findIndex((entry) => entry.name === name);
        if (at < 0) {
          setStack((prev) => [...prev, screen(name, params)]);
        } else {
          guard(() => setStack((prev) => [...prev.slice(0, at), screen(name, params)]));
        }
      },
      goBack: () => guard(() => setStack((prev) => prev.slice(0, -1))),
      popToTop: () => guard(() => setStack([])),
      replace: (name, params) =>
        guard(() => setStack((prev) => [...prev.slice(0, -1), screen(name, params)])),
    }),
    [guard]
  );

  const show = useCallback(
    (...entries) =>
      guard(() => setStack(entries.map(([name, params]) => screen(name, params)))),
    [guard]
  );
  const clear = useCallback(() => setStack([]), []);

  return {
    top: stack[stack.length - 1] || null,
    itemId: stack.length ? stack[0].params.itemId || null : null,
    navigation,
    guard,
    show,
    clear,
  };
}

const read = () => {
  const [page, rest] = window.location.hash.replace(/^#\/?/, "").split("/");
  let sub = "";
  try {
    sub = decodeURIComponent(rest || "");
  } catch (error) {
    // A hand-typed address: treat it as nothing.
  }
  return { page: PAGES.includes(page) ? page : DEFAULT_ROOM, sub };
};

// The page lives in the address, so Back, reload and bookmarks work.
export function useHashRoute() {
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => setRoute(read());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const go = useCallback((path) => {
    window.location.hash = `/${path}`;
  }, []);
  return [route, go];
}
