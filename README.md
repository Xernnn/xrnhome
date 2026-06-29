# PantryPal

A clean, fast **kitchen inventory tracker** built with React Native + Expo. Keep
track of what's in your pantry, fridge and freezer, see at a glance what's
running low or about to expire, and build a smart shopping list — all stored
locally on your device, no account required.

Built for **Expo SDK 54** and runs in **Expo Go**.

---

## Features

- **Inventory tracking** – add items with a photo, category, storage location,
  quantity, an optional opened-unit percentage, an optional expiry date and notes.
- **Smart quantity model** – track full sealed units *and* the remaining
  percentage of one open unit at the same time (see [Quantity & depletion](#quantity--depletion-logic)).
- **One-tap depletion** – `+` / `−` controls on every card and on the detail
  screen step the item down (and roll over from an open unit to the next sealed
  one) or back up.
- **Expiration tracking** – optional expiry date with visual **“expiring soon”**
  and **“expired”** indicators on cards and the detail screen, plus an
  **Expiring Soon** section pinned to the top of the Home screen. (Purely
  in-app/visual — no push notifications.)
- **Shopping list** – mark items as *re-buy when empty* and they appear under
  **Buy Now** when they run low, or **Saved Foods** while still in stock.
- **Undo delete** – deleting an item shows a brief **“Item deleted — Undo”**
  toast so accidental deletes are recoverable.
- **Dark mode** – Light / Dark / System theme, chosen from the **Settings** tab
  and persisted across launches.
- **Backup & restore** – export your whole kitchen to a JSON file (share/save it)
  and import it back later, from the Settings tab.
- **Haptic feedback** on key actions (depleting, saving, deleting, undo…).
- **History** – each item keeps a capped log (last 20 changes) shown as a timeline.
- **Search & filter** by name and storage location, grouped by category.

---

## How to run

```bash
# 1. Install dependencies
npm install

# 2. Start the Expo dev server
npx expo start
```

Then open the project in **Expo Go (SDK 54)**:

- Scan the QR code from the terminal with the Expo Go app (Android), or the
  Camera app (iOS), **or**
- press `a` / `i` in the terminal to launch an Android emulator / iOS simulator.

> Requires Node.js and the Expo Go app on your phone. Everything is stored
> locally with AsyncStorage — there's nothing to configure.

---

## Data model

Each inventory item has the following shape:

```js
{
  id: string,              // unique id
  name: string,
  category: string,        // one of CATEGORIES (see src/utils/constants.js)
  storageLocation: string, // "Pantry" | "Fridge" | "Freezer" | "Counter"
  imageUri: string | null, // persistent file:// path (copied into app storage)
  quantity: number,        // count of FULL, UNOPENED units
  unit: string,            // "pcs", "cans", "bottles", ...
  openedPercent: number | null, // remaining % (0..100, in 10% steps) of ONE open unit; null = nothing open
  expiryDate: string | null,    // ISO date, or null
  recurring: boolean,      // show on the Shopping list when low
  neverRecommend: boolean, // never suggest for shopping again
  note: string,
  createdAt: string,       // ISO timestamp
  updatedAt: string,       // ISO timestamp
  history: [               // capped at the last 20 entries
    { date, action, quantityBefore, quantityAfter }
  ]
}
```

Items are persisted to **AsyncStorage** and migrated forward on load
(`normalizeItem` in `src/context/InventoryContext.js`), so older/partial data
keeps working. Saving is driven by a single effect on the current items array,
which avoids any stale-snapshot race when several updates happen quickly.

Picked images are **copied into a persistent app directory**
(`FileSystem.documentDirectory/pantrypal_images/`) and that stable path is
stored, so photos survive app restarts (the OS can purge the original picker
cache).

---

## Quantity & depletion logic

PantryPal separates **sealed units** from **the one unit you've opened**, which
makes the count unambiguous:

- `quantity` = number of **full, unopened** units.
- `openedPercent` = remaining **percentage of a single currently-open unit**
  (`null` means nothing is open).
- **Physical total** = `quantity + (openedPercent != null ? 1 : 0)`.

> Example: *“2 corn cans, one is 40% left”* is stored as
> `quantity: 1, openedPercent: 40` — one sealed can plus one open can at 40%.

The Add/Edit forms show a live summary line (e.g. *“2 cans total · 1 sealed + 1
open at 40%”*) so this is always clear.

**Stepping with `+` / `−`** (see `computeStep` in `InventoryContext.js`):

- **Opened tracking ON**
  - `−` reduces the open unit by 10%. When it reaches 0%, if there are sealed
    units left, one is consumed and a fresh unit opens at 100%. If none are
    left, the item is finished (you're asked whether to remove it).
  - `+` tops the open unit back up by 10% (max 100%).
- **Opened tracking OFF**
  - `−` / `+` simply decrease / increase `quantity` by one whole unit. Hitting 0
    finishes the item (with a remove prompt).

Opened percentages are always rounded/clamped to 10% steps, including when
migrating legacy data.

---

## Dark mode

Theme is managed by `src/context/ThemeContext.js`:

- Three modes — **Light**, **Dark**, **System** (follows the OS).
- Chosen from the **Settings** tab and persisted to AsyncStorage.
- All colors come from `LIGHT_COLORS` / `DARK_COLORS` in
  `src/utils/constants.js`; components build their styles from the active
  palette. Selected category chips compute a readable text color from the chip
  background (`getContrastText`) for proper contrast in both themes.

---

## Shopping tab logic

The **Shopping** tab is driven by two item flags, `recurring` and
`neverRecommend`:

- **Buy Now** – recurring items that are *almost out*: `quantity === 0` and
  either no open unit, or the open unit is at/under 20% (`ALMOST_OUT_PERCENT`).
  Tapping the cart button restocks one unit.
- **Saved Foods** – recurring items you still have in stock; they wait here
  until they run low.
- The “don't recommend” action sets `recurring: false, neverRecommend: true` so
  the item stops appearing; you can re-enable *Re-buy when empty* from the
  item's Edit screen.

---

## Project structure

```
App.js                       # navigation (tabs + stacks), providers, undo toast
src/
  context/
    InventoryContext.js      # items state, persistence, depletion, undo, import
    ThemeContext.js          # light/dark/system theme
  screens/
    HomeScreen.js            # "My Kitchen" — search, filters, expiring-soon, grid
    ShoppingScreen.js        # Buy Now / Saved Foods
    AddItemScreen.js         # add form
    EditItemScreen.js        # edit form
    ItemDetailScreen.js      # detail, quick update, history
    SettingsScreen.js        # theme, backup/restore, about
  components/
    ItemCard.js              # item tile with inline +/- and expiry pill
    ExpiryPill.js            # colored expiry status pill
    UndoToast.js             # global "undo delete" snackbar
    CategoryBadge.js, QuantityControl.js, SearchBar.js, EmptyState.js
  utils/
    constants.js             # palette, categories, model + expiry/contrast helpers
    storage.js               # AsyncStorage load/save
    images.js                # persist/delete picked images
    backup.js                # export/import JSON
    haptics.js               # safe haptics wrapper
```

---

## Tech stack

- React Native + Expo SDK 54
- React Navigation (bottom tabs + stack)
- React Context + `useReducer`
- AsyncStorage (persistence)
- expo-image-picker, expo-file-system, expo-haptics, expo-sharing,
  expo-document-picker, `@react-native-community/datetimepicker`
- `@expo/vector-icons` (MaterialCommunityIcons), pure `StyleSheet` (no UI kit)
