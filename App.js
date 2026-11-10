import "react-native-gesture-handler";
import React, { useEffect } from "react";
import { Alert, Platform, View, StyleSheet, useWindowDimensions } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
  getFocusedRouteNameFromRoute,
} from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createStackNavigator } from "@react-navigation/stack";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { ThemeProvider, useTheme } from "./src/context/ThemeContext";
import { InventoryProvider, useInventory } from "./src/context/InventoryContext";
import { RemindersProvider } from "./src/context/RemindersContext";
import { SyncProvider, useSync } from "./src/context/SyncContext";
import RoomScreen from "./src/screens/RoomScreen";
import ShoppingScreen from "./src/screens/ShoppingScreen";
import AddItemScreen from "./src/screens/AddItemScreen";
import ItemDetailScreen from "./src/screens/ItemDetailScreen";
import EditItemScreen from "./src/screens/EditItemScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import HomeServerScreen from "./src/screens/HomeServerScreen";
import CategoriesScreen from "./src/screens/CategoriesScreen";
import DataProblemScreen from "./src/screens/DataProblemScreen";
import ErrorBoundary from "./src/components/ErrorBoundary";
import UndoToast from "./src/components/UndoToast";
import WebDialogs, { installWebDialogs } from "./src/components/WebDialogs";
import DesktopApp from "./src/desktop/DesktopApp";
import {
  DESKTOP_WIDTH,
  FORM_WIDTH,
  PAGE_WIDTH,
  ROOMS,
  TYPE,
  itemCount,
} from "./src/utils/constants";

installWebDialogs();

// Kept up until the fonts are in, so the app never opens on a blank frame.
SplashScreen.preventAutoHideAsync().catch(() => {});

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// Pages of things to read or fill in stay a readable width in a browser window.
const FORM_PAGE =
  Platform.OS === "web"
    ? { cardStyle: { width: "100%", maxWidth: FORM_WIDTH, alignSelf: "center" } }
    : {};

// Every tab is its own stack with the same pushed screens on top of its main one.
function TabStack({ mainName, mainComponent, mainParams }) {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name={mainName}
        component={mainComponent}
        initialParams={mainParams}
      />
      <Stack.Screen
        name="ItemDetail"
        component={ItemDetailScreen}
        options={FORM_PAGE}
      />
      <Stack.Screen name="EditItem" component={EditItemScreen} options={FORM_PAGE} />
      <Stack.Screen
        name="AddItem"
        component={AddItemScreen}
        options={{ ...FORM_PAGE, presentation: "modal" }}
      />
    </Stack.Navigator>
  );
}

// A named function per room, created once. React Navigation warns about screen
// components whose function is called "component", as an object key would make it.
const makeRoomStack = (room) =>
  function RoomStack() {
    return (
      <TabStack
        mainName={`${room.label}Main`}
        mainComponent={RoomScreen}
        mainParams={{ room: room.key }}
      />
    );
  };

const ROOM_STACKS = ROOMS.map((room) => ({
  room,
  component: makeRoomStack(room),
}));

function ShoppingStack() {
  return <TabStack mainName="ShoppingMain" mainComponent={ShoppingScreen} />;
}

function SettingsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, ...FORM_PAGE }}>
      <Stack.Screen name="SettingsMain" component={SettingsScreen} />
      <Stack.Screen name="HomeServer" component={HomeServerScreen} />
      <Stack.Screen name="Categories" component={CategoriesScreen} />
    </Stack.Navigator>
  );
}

// Full-screen forms have their own Cancel and Save, and need the room.
const FORM_SCREENS = ["AddItem", "EditItem"];

// In a browser the whole page keeps to a width and sits in the middle.
const PAGE =
  Platform.OS === "web"
    ? { width: "100%", maxWidth: PAGE_WIDTH, alignSelf: "center" }
    : undefined;

// Outline icons, filled when the tab is the one showing.
const TAB_ICONS = {
  ...Object.fromEntries(
    ROOMS.map((room) => [room.label, [room.icon, room.iconFilled]])
  ),
  Shopping: ["cart-outline", "cart"],
  Settings: ["cog-outline", "cog"],
};

function RootNavigation() {
  const { colors, isDark } = useTheme();
  const { update, server } = useSync();
  const { problem, items, clearProblem } = useInventory();
  // A fixed tab bar height overrides React Navigation's own inset handling, so
  // the system navigation bar's height has to be added back by hand.
  const { bottom } = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  // A damaged list on a phone with no server to ask: say so, once. With a server,
  // Settings → Home server asks which copy to keep.
  useEffect(() => {
    if (problem?.type === "recovered" && !server) {
      Alert.alert(
        "Your list was damaged",
        `${itemCount(items.length)} could be recovered. Check that nothing is missing.`,
        [{ text: "OK", onPress: clearProblem }]
      );
    }
    // Once per problem: `items` changes with every tap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problem, server, clearProblem]);

  const navTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme : DefaultTheme).colors,
      primary: colors.accent,
      background: colors.background,
      card: colors.surface,
      text: colors.textPrimary,
      border: colors.border,
      notification: colors.accent,
    },
  };

  if (problem?.type === "unreadable") {
    return <DataProblemScreen />;
  }

  if (Platform.OS === "web" && width >= DESKTOP_WIDTH) {
    return <DesktopApp />;
  }

  return (
    <NavigationContainer theme={navTheme}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          sceneContainerStyle: PAGE,
          // xrnrule's bar: on the card grey, a pill behind the picked tab's icon.
          tabBarActiveTintColor: colors.textPrimary,
          tabBarInactiveTintColor: colors.textSecondary,
          // Four labels fill the bar. Large system text is for the content,
          // where it fits; here it only cuts the words off.
          tabBarAllowFontScaling: false,
          tabBarHideOnKeyboard: true,
          tabBarLabelPosition: "below-icon", // wide windows would move them aside
          tabBarStyle: {
            backgroundColor: colors.tabBar,
            borderTopColor: colors.border,
            height: 68 + bottom,
            paddingBottom: 10 + bottom,
            paddingTop: 8,
            display: FORM_SCREENS.includes(getFocusedRouteNameFromRoute(route))
              ? "none"
              : "flex",
          },
          tabBarLabelStyle: {
            ...TYPE.tab,
            marginTop: 4,
          },
          tabBarIcon: ({ color, focused }) => (
            <View
              style={[
                styles.tabPill,
                focused && { backgroundColor: colors.surfaceAlt },
              ]}
            >
              <MaterialCommunityIcons
                name={TAB_ICONS[route.name][focused ? 1 : 0]}
                size={22}
                color={color}
              />
            </View>
          ),
        })}
      >
        {ROOM_STACKS.map(({ room, component }) => (
          <Tab.Screen key={room.key} name={room.label} component={component} />
        ))}
        <Tab.Screen name="Shopping" component={ShoppingStack} />
        <Tab.Screen
          name="Settings"
          component={SettingsStack}
          options={
            update.state === "ready"
              ? {
                  tabBarBadge: "",
                  tabBarBadgeStyle: {
                    backgroundColor: colors.accent,
                    minWidth: 10,
                    height: 10,
                    borderRadius: 5,
                    top: 2,
                  },
                }
              : undefined
          }
        />
      </Tab.Navigator>
      <UndoToast />
    </NavigationContainer>
  );
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    "GeistMono-Bold": require("./assets/fonts/GeistMono-Bold.ttf"),
    "GeistMono-Medium": require("./assets/fonts/GeistMono-Medium.ttf"),
  });
  const ready = fontsLoaded || !!fontError;
  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [ready]);
  if (!ready) {
    return null;
  }
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <ThemeProvider>
          <InventoryProvider>
            <RemindersProvider>
              <SyncProvider>
                <RootNavigation />
              </SyncProvider>
            </RemindersProvider>
          </InventoryProvider>
          {Platform.OS === "web" ? <WebDialogs /> : null}
        </ThemeProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  tabPill: {
    width: 58,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
});
