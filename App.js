import "react-native-gesture-handler";
import React from "react";
import { StatusBar } from "expo-status-bar";
import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
} from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createStackNavigator } from "@react-navigation/stack";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ThemeProvider, useTheme } from "./src/context/ThemeContext";
import { InventoryProvider } from "./src/context/InventoryContext";
import RoomScreen from "./src/screens/RoomScreen";
import ShoppingScreen from "./src/screens/ShoppingScreen";
import AddItemScreen from "./src/screens/AddItemScreen";
import ItemDetailScreen from "./src/screens/ItemDetailScreen";
import EditItemScreen from "./src/screens/EditItemScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import UndoToast from "./src/components/UndoToast";
import { ROOMS } from "./src/utils/constants";

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// Every tab is its own stack with the same pushed screens on top of its main one.
function TabStack({ mainName, mainComponent, mainParams }) {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name={mainName}
        component={mainComponent}
        initialParams={mainParams}
      />
      <Stack.Screen name="ItemDetail" component={ItemDetailScreen} />
      <Stack.Screen name="EditItem" component={EditItemScreen} />
      <Stack.Screen
        name="AddItem"
        component={AddItemScreen}
        options={{ presentation: "modal" }}
      />
    </Stack.Navigator>
  );
}

const ROOM_STACKS = ROOMS.map((room) => ({
  room,
  component: () => (
    <TabStack
      mainName={`${room.label}Main`}
      mainComponent={RoomScreen}
      mainParams={{ room: room.key }}
    />
  ),
}));

function ShoppingStack() {
  return <TabStack mainName="ShoppingMain" mainComponent={ShoppingScreen} />;
}

const TAB_ICONS = {
  ...Object.fromEntries(ROOMS.map((room) => [room.label, room.icon])),
  Shopping: "cart-outline",
  Settings: "cog-outline",
};

function RootNavigation() {
  const { colors, isDark } = useTheme();

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

  return (
    <NavigationContainer theme={navTheme}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.textSecondary,
          tabBarStyle: {
            backgroundColor: colors.tabBar,
            borderTopColor: colors.border,
            height: 60,
            paddingBottom: 8,
            paddingTop: 6,
          },
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: "600",
          },
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons
              name={TAB_ICONS[route.name]}
              size={size}
              color={color}
            />
          ),
        })}
      >
        {ROOM_STACKS.map(({ room, component }) => (
          <Tab.Screen key={room.key} name={room.label} component={component} />
        ))}
        <Tab.Screen name="Shopping" component={ShoppingStack} />
        <Tab.Screen name="Settings" component={SettingsScreen} />
      </Tab.Navigator>
      <UndoToast />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <InventoryProvider>
          <RootNavigation />
        </InventoryProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
