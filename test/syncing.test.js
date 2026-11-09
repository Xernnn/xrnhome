// The app's own providers (InventoryProvider and SyncProvider) against a home
// server made up here: what goes up and what comes down across launches, with
// the clock run by Jest so the sync's timers can be stepped through.
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { Alert, AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

import { ThemeProvider } from "../src/context/ThemeContext";
import { InventoryProvider, useInventory } from "../src/context/InventoryContext";
import { SyncProvider, useSync } from "../src/context/SyncContext";
import EditItemScreen from "../src/screens/EditItemScreen";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));
jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///docs/",
  cacheDirectory: "file:///cache/",
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  makeDirectoryAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
  copyAsync: jest.fn(async () => {}),
  moveAsync: jest.fn(async () => {}),
  uploadAsync: jest.fn(async () => ({ status: 201 })),
  downloadAsync: jest.fn(async () => ({ status: 404 })),
  FileSystemUploadType: { BINARY_CONTENT: 0 },
}));
jest.mock("expo-image-manipulator", () => ({}));
jest.mock("expo-application", () => ({ nativeBuildVersion: "1" }));
jest.mock("expo-intent-launcher", () => ({}));
jest.mock("expo-network", () => ({}));
jest.mock("expo-image-picker", () => ({}));
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  selectionAsync: jest.fn(async () => {}),
  ImpactFeedbackStyle: {},
  NotificationFeedbackType: {},
}));
jest.mock("@react-native-community/datetimepicker", () => ({
  __esModule: true,
  default: () => null,
  DateTimePickerAndroid: { open: jest.fn() },
}));
jest.mock("react-native-safe-area-context", () =>
  require("react-native-safe-area-context/jest/mock").default
);

const URL = "https://home.test/xrnhome";
const ITEMS_KEY = "xrnhome_items";

// The parts of server/xrnhome-sync.py the app talks to. `refuse` answers every
// request with that status instead.
const makeServer = () => {
  const s = { version: 0, doc: {}, puts: 0, refuse: 0 };
  const reply = (status, json, headers = {}) => ({
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (key) => headers[key] ?? null },
    json: async () => json,
  });
  s.fetch = jest.fn(async (url, { method = "GET", headers = {}, body } = {}) => {
    const path = url.slice(URL.length);
    if (s.refuse) {
      return reply(s.refuse);
    }
    const etag = { ETag: `"${s.version}"` };
    if (path === "/photos") {
      return reply(200, []);
    }
    if (path === "/state" && method === "GET") {
      return headers["If-None-Match"] === `"${s.version}"`
        ? reply(304, null, etag)
        : reply(200, s.doc, etag);
    }
    if (path === "/state" && method === "PUT") {
      const want = headers["If-Match"];
      if (want !== "*" && want !== `"${s.version}"`) {
        return reply(412, null, etag);
      }
      s.puts += 1;
      s.version += 1;
      s.doc = JSON.parse(body);
      return reply(200, { ok: true }, { ETag: `"${s.version}"` });
    }
    return reply(404);
  });
  return s;
};

let app;
let showScreen;
// Reads both providers for the tests, and shows whatever screen a test puts up.
function Probe() {
  app = { inventory: useInventory(), sync: useSync() };
  const [screen, setScreen] = React.useState(null);
  showScreen = setScreen;
  return screen;
}

let renderer = null;
const wait = async (ms) => {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
};
// Opens the app as a launch would, on whatever is in storage by then.
const launch = async () => {
  await act(async () => {
    renderer = TestRenderer.create(
      <ThemeProvider>
        <InventoryProvider>
          <SyncProvider>
            <Probe />
          </SyncProvider>
        </InventoryProvider>
      </ThemeProvider>
    );
  });
  await wait(0);
};
const quit = async () => {
  await act(async () => renderer.unmount());
  renderer = null;
};
const add = (name) =>
  act(async () => {
    app.inventory.addItem({ name, room: "food", category: "Cupboard", quantity: 1 });
  });
// The app put away (another app, a laptop's lid or its tab hidden) or brought back.
let appStateListeners;
const appState = async (next) => {
  AppState.currentState = next;
  await act(async () => appStateListeners.forEach((listener) => listener(next)));
};

let server;
beforeEach(async () => {
  jest.useFakeTimers();
  await AsyncStorage.clear();
  server = makeServer();
  global.fetch = server.fetch;
  SecureStore.getItemAsync.mockResolvedValue(
    JSON.stringify({ url: URL, user: "sonn", password: "secret" })
  );
  AppState.currentState = "active";
  appStateListeners = new Set();
  AppState.addEventListener.mockImplementation((type, listener) => {
    appStateListeners.add(listener);
    return { remove: () => appStateListeners.delete(listener) };
  });
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  if (renderer) {
    await quit();
  }
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("a list that had to be recovered", () => {
  // Ten items on the phone and the server, of which the safe copy (written when
  // the app opened) knows five, and then the saved list gets cut off after six.
  const damageAfterSix = async () => {
    await launch();
    for (let i = 0; i < 5; i++) await add(`Item ${i}`);
    await wait(16000);
    await quit();
    await launch();
    for (let i = 5; i < 10; i++) await add(`Item ${i}`);
    await wait(16000);
    await quit();
    const saved = JSON.parse(await AsyncStorage.getItem(ITEMS_KEY));
    expect(saved).toHaveLength(10);
    await AsyncStorage.setItem(
      ITEMS_KEY,
      `${JSON.stringify(saved.slice(0, 6)).slice(0, -1)},{"id":"cut off`
    );
  };

  it("is still waiting for the person on the next launch, and sends nothing", async () => {
    await damageAfterSix();
    expect(server.doc.items).toHaveLength(10);
    await launch();
    expect(app.inventory.problem).toEqual({ type: "recovered", count: 6 });
    await wait(40000);
    await quit();

    // Nobody answered the question. The list now reads fine, but it's the same six.
    await launch();
    await wait(40000);
    expect(app.inventory.problem?.type).toBe("recovered");
    expect(app.sync.status).toMatchObject({ state: "conflict", reason: "damaged" });
    expect(server.doc.items).toHaveLength(10);
  });

  it("syncs as before once the person has answered", async () => {
    await damageAfterSix();
    await launch();
    await act(async () => {
      await app.sync.restore();
    });
    expect(app.inventory.problem).toBeNull();
    await wait(0);
    await quit();

    await launch();
    expect(app.inventory.problem).toBeNull();
    expect(app.inventory.items).toHaveLength(10);
    await add("Item 10");
    await wait(16000);
    expect(server.doc.items).toHaveLength(11);
  });

  it("stops asking once it's been looked at on a phone with no server", async () => {
    SecureStore.getItemAsync.mockResolvedValue(null);
    await damageAfterSix();
    await launch();
    expect(app.inventory.problem?.type).toBe("recovered");
    await act(async () => app.inventory.clearProblem());
    await wait(0);
    await quit();

    await launch();
    expect(app.inventory.problem).toBeNull();
    expect(app.inventory.items).toHaveLength(6);
  });
});

describe("the person's own categories", () => {
  const baby = { label: "Baby", room: "household" };
  const pets = { label: "Pets", room: "household" };

  it("aren't sent back only to put them in this device's order", async () => {
    await launch();
    await act(async () => {
      app.inventory.addCategory("Baby", "household");
    });
    await add("Milk");
    await wait(16000);
    expect(server.doc.categories).toEqual([baby]);

    // The laptop made Pets before Baby reached it, so its list starts with Pets.
    server.doc = { ...server.doc, categories: [pets, baby] };
    server.version += 1;
    const puts = server.puts;
    await wait(5 * 30000);
    expect(server.puts).toBe(puts);
    expect(app.inventory.categories.map(({ label, room }) => ({ label, room }))).toEqual([
      pets,
      baby,
    ]);
  });
});


describe("the Edit form", () => {
  it("keeps a date the laptop set while it was open, here and on the server", async () => {
    await launch();
    await add("Milk");
    await wait(16000);
    const navigation = {
      goBack: jest.fn(),
      navigate: jest.fn(),
      popToTop: jest.fn(),
      dispatch: jest.fn(),
      addListener: jest.fn(() => () => {}),
    };
    const itemId = app.inventory.items[0].id;
    await act(async () => {
      showScreen(<EditItemScreen navigation={navigation} route={{ params: { itemId } }} />);
    });

    // The laptop gives Milk an expiry date, which comes down while the form is open.
    const expiryDate = "2026-12-01T12:00:00.000Z";
    const updatedAt = new Date(Date.now() + 1000).toISOString();
    server.doc = {
      ...server.doc,
      items: server.doc.items.map((item) => ({ ...item, expiryDate, expiryWanted: true, updatedAt })),
    };
    server.version += 1;
    await wait(31000);
    expect(app.inventory.items[0].expiryDate).toBe(expiryDate);

    // Here only the note changes.
    const note = renderer.root.findByProps({ accessibilityLabel: "Note" });
    await act(async () => note.props.onChangeText("top shelf"));
    const [save] = renderer.root.findAll(
      (node) => node.props.label === "Save" && typeof node.props.onPress === "function"
    );
    await act(async () => {
      await save.props.onPress();
    });
    expect(navigation.goBack).toHaveBeenCalled();
    await wait(16000);
    expect(app.inventory.items[0]).toMatchObject({ note: "top shelf", expiryDate, expiryWanted: true });
    expect(server.doc.items[0]).toMatchObject({ note: "top shelf", expiryDate, expiryWanted: true });
  });
});

describe("leaving the app", () => {
  // Jest runs as iOS, which like the laptop isn't Android.
  it("sends a change that was waiting straight away, on any platform", async () => {
    await launch();
    await wait(2000);
    await add("Milk");
    await wait(1000);
    expect(server.puts).toBe(0);
    await appState("background");
    await wait(0);
    expect(server.puts).toBe(1);
    expect(server.doc.items.map((item) => item.name)).toEqual(["Milk"]);
  });
});
