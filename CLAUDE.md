# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

xrnhome is a home inventory app (kitchen and bedroom) built with React Native and Expo SDK 54, written in plain JavaScript. It has no backend: all data lives in AsyncStorage on the device. There are no custom native modules, so Expo Go is enough for development.

## Commands

```bash
npm install
npm start                      # Expo dev server; scan the QR code with Expo Go, or press a / i
npm run android | ios | web    # start the dev server and open that target
npx expo start --tunnel        # use when the phone can't reach the dev server over LAN
eas build --profile preview --platform android   # installable APK (see eas.json)
```

There is no lint, test, or typecheck setup. To check a change, run the app. The web target (react-native-web) is how the README screenshots were captured. `CI=1 npx expo export --platform web --output-dir <dir>` bundles without a device, which catches syntax and import errors. On web, AsyncStorage is `localStorage`, so test data can be seeded under the keys below.

## Architecture

**Providers and navigation (`App.js`).** The tree is `SafeAreaProvider > ThemeProvider > InventoryProvider > NavigationContainer`. `InventoryProvider` calls `useTheme()` for its loading spinner, so it must stay inside `ThemeProvider`. There is one bottom tab per entry in `ROOMS`, each showing `RoomScreen` with a `room` route param, plus a Shopping tab. Every tab is a `TabStack` that puts the same `ItemDetail`, `EditItem`, and `AddItem` (modal) routes on top of its main screen. Add new pushed screens to `TabStack`. `AddItem` takes an optional `room` param to preselect the room.

**Inventory state (`src/context/InventoryContext.js`).** This file holds the core logic:
- A `useReducer` store. One effect persists `state.items` to AsyncStorage after every change. Callers never save directly.
- `computeStep(item, dir)` is a pure function that holds all of the +/- counting rules. It returns `{ changes, historyEntry, willEmpty }`. Screens call it and then pass the result to `updateItem(id, changes, historyEntry)`.
- Items are deduplicated by `itemKey` (room plus trimmed, lowercased name), so the same name in two rooms gives two items. `ADD_ITEM` with an existing key tops up the existing item instead of creating a second card. `mergeDuplicates` also runs on load.
- Each item keeps a `history` array, capped at `MAX_HISTORY_ENTRIES`. `updateItem` appends the given `historyEntry` and stamps `updatedAt`.

**Item model and counting.** Every item has a `room` (a key from `ROOMS`) and a `category` that must belong to that room. `quantity` is the total number of units *including* the opened one. `openedPercent` is `null` when the item isn't counted in % (eggs, cans, and similar). Otherwise it is 0–100 for the open unit. Pressing minus removes `OPENED_STEP`% from the open unit. When the open unit runs out, `quantity` drops by one and the next unit opens at 100%. A % item stays a % item: `openedPercent` is never set back to `null` when stock runs out. An empty % item holds `openedPercent: 100` (enforced by `settleOpened` in the reducer), so restocking it from anywhere opens a full unit. Only the "Track in %" switch on Add/Edit turns % counting off. See the README section "How the counting works".

**Schema migrations (`src/utils/storage.js`).** Data is stored under the `xrnhome_items` key, and `xrnhome_schema_version` records the schema version. The app used to be called PantryPal. `moveLegacyKeys` copies anything saved under the old `pantrypal_*` keys to the new keys once, before the first read, so every loader (including the theme) awaits it. On load, every stored item goes through `normalizeItem(raw, migrate)`, which fills defaults and upgrades legacy shapes. v1→v2 changed `quantity` from counting only sealed units to including the opened one. A new field only needs a default in `normalizeItem` (that is how pre-room items become `room: "kitchen"`). Bump `CURRENT_SCHEMA_VERSION` only when the meaning of an existing field changes. Renaming a category label also needs a mapping there, or stored items fall back to "Other". Real users have data on their phones.

**Derived lists (`src/utils/constants.js`).** The rules that decide which screen shows an item live here: `isInStock` (filtered by room on the room tabs), `isAlmostOut`, and `isPreviouslyHad`. Shopping covers all rooms. The Shopping screen shows `recurring && !neverRecommend` items, split into Buy Now (`isAlmostOut`) and saved. Out-of-stock items that aren't recurring go to Previously Had. Every out-of-stock item must land in Buy Now or Previously Had, so nothing becomes unreachable. Keep that invariant if you change these rules. This file also holds `ROOMS`, `CATEGORIES` (each tagged with a `room`; `room: null` means every room, used only by "Other", which must stay last as the fallback), `QUANTITY_UNITS`, and the color, shadow, and radius tokens.

**Room grid (`src/components/CategoryBlobGrid.js`).** A room's items flow into one 3-column grid in category order, so a row can hold items from several categories. Each category is drawn as a tinted blob behind its cards. Every cell paints its part of the blob as a horizontal band, a vertical band, and corner squares. A band reaches into the neighboring cell only when that neighbor has the same category, which keeps the inner corners of L-shaped blobs clean. The pieces overlap, so colors are mixed to opaque with `mixHex` instead of being drawn with alpha. A row of cells in one category gets a label unless it touches the same category in the row above. `ItemCard` takes its `width` from the grid.

**Theming.** `ThemeContext` follows the system theme by default and saves a manual override under `THEME_KEY` (`xrnhome_theme_mode`, defined in `storage.js`). Screens and components get `colors` from `useTheme()` and build their styles with `const styles = useMemo(() => createStyles(colors), [colors])`. New UI should do the same and should not hardcode colors.

## Notes

- `app.json` bundles everything (`assetBundlePatterns: **/*`). Keep non-app files such as screenshots in `docs/`, not `assets/`.
- The `expo-image-picker` plugin in `app.json` sets `microphonePermission: false` on purpose. Don't add Android permissions the app doesn't use.
- Photos are stored only as the URI returned by the image picker. Nothing is copied into app storage.
