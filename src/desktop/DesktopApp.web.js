import "./desktop.css";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { describeSync, useSync } from "../context/SyncContext";
import ThemeContext, { useTheme } from "../context/ThemeContext";
import AddItemScreen from "../screens/AddItemScreen";
import CategoriesScreen from "../screens/CategoriesScreen";
import EditItemScreen from "../screens/EditItemScreen";
import HomeServerScreen from "../screens/HomeServerScreen";
import ItemDetailScreen from "../screens/ItemDetailScreen";
import RoomScreen from "../screens/RoomScreen";
import SettingsScreen from "../screens/SettingsScreen";
import ShoppingScreen from "../screens/ShoppingScreen";
import UndoToast from "../components/UndoToast";
import { Wordmark } from "../components/ui";
import { DARK_COLORS, ROOMS } from "../utils/constants";
import flyToBasket from "./fly";
import { Icon } from "./parts";
import QuickAdd from "./QuickAdd";
import { useHashRoute, useScreenStack } from "./useScreenStack";

// The same app as on the phone with room to breathe: the room's page, the
// shopping list beside it as the basket, and the item's screens taking the
// basket's place while they're open. They're the width they were made for there,
// and keep every rule they hold: duplicates, photos, unsaved changes.
const PANEL_SCREENS = {
  ItemDetail: ItemDetailScreen,
  EditItem: EditItemScreen,
  AddItem: AddItemScreen,
};

const SETTINGS_PAGES = { HomeServer: "server", Categories: "categories" };

const themeVars = (colors, isDark) => ({
  "--bg": colors.background,
  "--surface": colors.surface,
  "--text": colors.textPrimary,
  "--text2": colors.textSecondary,
  "--line": colors.border,
  "--line2": colors.outline,
  "--accent": colors.accent,
  "--on-accent": colors.onAccent,
  "--danger": colors.danger,
  "--warn": colors.warning,
  colorScheme: isDark ? "dark" : "light",
});

function SyncLine({ onOpen }) {
  const { available, status, meta } = useSync();
  // "Synced 2 min ago" stays true while nothing else on the page changes.
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(timer);
  }, []);
  if (!available) {
    return null;
  }
  return (
    <button type="button" className="dk-sync" onClick={onOpen} data-state={status.state}>
      <i aria-hidden="true" />
      <span>{describeSync(status, meta)}</span>
    </button>
  );
}

export default function DesktopApp() {
  const theme = useTheme();
  const { colors, isDark } = theme;
  const [route, go] = useHashRoute();
  const panel = useScreenStack();
  const nameRef = useRef(null);

  const room = ROOMS.find((r) => r.key === route.page) || null;
  const onSettings = route.page === "settings";
  const PanelScreen = panel.top ? PANEL_SCREENS[panel.top.name] : null;

  const settingsNavigation = useMemo(
    () => ({
      navigate: (name) => go(`settings/${SETTINGS_PAGES[name]}`),
      goBack: () => go("settings"),
      addListener: () => () => {},
    }),
    [go]
  );

  const { guard, clear, show, navigation } = panel;
  const leaveTo = useCallback(
    (path) =>
      guard(() => {
        clear();
        go(path);
      }),
    [guard, clear, go]
  );
  // What the room's page and the basket open replaces what's in the panel, with
  // the same question as Back if that's a form with changes. Anything that isn't a
  // panel screen is the basket itself, which is what closing the panel shows.
  const pageNavigation = useMemo(
    () => ({
      ...navigation,
      navigate: (name, params) =>
        PANEL_SCREENS[name] ? show([name, params]) : navigation.popToTop(),
    }),
    [navigation, show]
  );
  const addWithDetails = useCallback((params) => show(["AddItem", params]), [show]);
  const roomRoute = useMemo(() => ({ params: { room: room?.key } }), [room?.key]);
  const basketTheme = useMemo(
    () => ({ ...theme, isDark: true, colors: DARK_COLORS }),
    [theme]
  );

  const panelOpen = !!panel.top;
  useEffect(() => {
    const onKey = (event) => {
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName);
      if (typing || document.querySelector('[aria-modal="true"]')) {
        return;
      }
      if (event.key === "Escape" && panelOpen) {
        navigation.goBack();
      } else if (event.key === "/" && nameRef.current) {
        event.preventDefault();
        nameRef.current.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panelOpen, navigation]);

  let page;
  if (room) {
    page = (
      <RoomScreen
        key={room.key}
        navigation={pageNavigation}
        route={roomRoute}
        onListed={flyToBasket}
      />
    );
  } else {
    const Settings =
      route.sub === "server"
        ? HomeServerScreen
        : route.sub === "categories"
        ? CategoriesScreen
        : SettingsScreen;
    page = (
      <div className="dk-page">
        <Settings navigation={settingsNavigation} />
      </div>
    );
  }

  return (
    <div
      className={`dk${onSettings ? " no-panel" : ""}`}
      style={themeVars(colors, isDark)}
    >
      <header className="dk-top">
        <Wordmark size={19} />
        <nav className="dk-tabs" aria-label="Pages">
          {ROOMS.map((r) => (
            <button
              key={r.key}
              type="button"
              aria-current={route.page === r.key ? "page" : undefined}
              onClick={() => leaveTo(r.key)}
            >
              {r.label}
            </button>
          ))}
        </nav>
        {room ? (
          <QuickAdd
            key={room.key}
            room={room.key}
            nameRef={nameRef}
            onMore={addWithDetails}
          />
        ) : (
          <span className="dk-gap" />
        )}
        <SyncLine onOpen={() => leaveTo("settings/server")} />
        <button
          type="button"
          className="dk-gear"
          aria-label="Settings"
          aria-current={onSettings ? "page" : undefined}
          onClick={() => leaveTo("settings")}
        >
          <Icon name={onSettings ? "cog" : "cog-outline"} size={20} />
        </button>
      </header>
      <main className="dk-main">{page}</main>
      {onSettings ? null : (
        <aside className="dk-panel" aria-label="Shopping list and details">
          {PanelScreen ? (
            <PanelScreen
              key={panel.top.key}
              navigation={panel.navigation}
              route={{ params: panel.top.params }}
            />
          ) : (
            <div className="dk-basket">
              <ThemeContext.Provider value={basketTheme}>
                <ShoppingScreen navigation={pageNavigation} />
              </ThemeContext.Provider>
            </div>
          )}
        </aside>
      )}
      <div className="dk-toast">
        <UndoToast />
      </div>
    </div>
  );
}
