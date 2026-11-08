import { useEffect, useMemo, useState } from "react";

import { categoryColor, getCategoryMeta } from "./constants";
import { photoFileName } from "./images";
import { packShade, pickPackColour } from "./packColour";
import { photoPixels } from "./photoPixels";
import { loadPackColours, savePackColours } from "./storage";

const SAVE_DELAY_MS = 1000;

// A colour is worked out from the photo once per device and kept by the photo's
// file name, which is the same everywhere. It isn't part of the item: it can
// always be worked out again, and a field every device filled in for itself would
// be a change to sync. Null means the photo has no colour in it.
const known = new Map();
const waiting = new Map();
let queue = Promise.resolve();
let saveTimer = null;

// Before the first card draws, so cards don't start in the wrong colour and change.
export const readPackColours = async () => {
  const saved = await loadPackColours();
  Object.entries(saved).forEach(([name, colour]) => known.set(name, colour));
};

const saveSoon = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(
    () => savePackColours(Object.fromEntries(known)),
    SAVE_DELAY_MS
  );
};

// One photo at a time: a first open of a big list shouldn't load them all at once.
const workOut = (name, uri) => {
  queue = queue.then(async () => {
    try {
      const pixels = await photoPixels(uri);
      known.set(name, pixels ? pickPackColour(pixels) : null);
      saveSoon();
    } catch (error) {
      // Left unknown, so it's tried again the next time the card appears.
    }
    const listeners = waiting.get(name) || new Set();
    waiting.delete(name);
    listeners.forEach((listener) => listener());
  });
};

const whenWorkedOut = (name, uri, listener) => {
  if (!waiting.has(name)) {
    waiting.set(name, new Set());
    workOut(name, uri);
  }
  const listeners = waiting.get(name);
  listeners.add(listener);
  return () => listeners.delete(listener);
};

// The item's card colour: its photo's, or its category's until there is one.
export function usePackShade(item) {
  const name = photoFileName(item.imageUri);
  const [, redraw] = useState(0);
  useEffect(() => {
    if (!name || known.has(name)) {
      return undefined;
    }
    return whenWorkedOut(name, item.imageUri, () => redraw((n) => n + 1));
  }, [name, item.imageUri]);
  const colour =
    (name && known.get(name)) || categoryColor(getCategoryMeta(item.category), false);
  return useMemo(() => packShade(colour), [colour]);
}
