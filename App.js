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
import HomeScreen from "./src/screens/HomeScreen";
import ShoppingScreen from "./src/screens/ShoppingScreen";
import AddItemScreen from "./src/screens/AddItemScreen";
import ItemDetailScreen from "./src/screens/ItemDetailScreen";
import EditItemScreen from "./src/screens/EditItemScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import UndoToast from "./src/components/UndoToast";

const HomeStackNav = createStackNavigator();
const ShoppingStackNav = createStackNavigator();
const Tab = createBottomTabNavigator();

function HomeStack() {
  return (
    <HomeStackNav.Navigator screenOptions={{ headerShown: false }}>
      <HomeStackNav.Screen name="HomeMain" component={HomeScreen} />
      <HomeStackNav.Screen name="ItemDetail" component={ItemDetailScreen} />
      <HomeStackNav.Screen name="EditItem" component={EditItemScreen} />
      <HomeStackNav.Screen
        name="AddItem"
        component={AddItemScreen}
        options={{ presentation: "modal" }}
      />
    </HomeStackNav.Navigator>
  );
}

function ShoppingStack() {
  return (
    <ShoppingStackNav.Navigator screenOptions={{ headerShown: false }}>
      <ShoppingStackNav.Screen name="ShoppingMain" component={ShoppingScreen} />
      <ShoppingStackNav.Screen
        name="ItemDetail"
        component={ItemDetailScreen}
      />
      <ShoppingStackNav.Screen name="EditItem" component={EditItemScreen} />
      <ShoppingStackNav.Screen
        name="AddItem"
        component={AddItemScreen}
        options={{ presentation: "modal" }}
      />
    </ShoppingStackNav.Navigator>
  );
}

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
          tabBarIcon: ({ color, size }) => {
            let iconName = "silverware-fork-knife";
            if (route.name === "My Kitchen") {
              iconName = "silverware-fork-knife";
            } else if (route.name === "Shopping") {
              iconName = "cart-outline";
            } else if (route.name === "Settings") {
              iconName = "cog-outline";
            }
            return (
              <MaterialCommunityIcons
                name={iconName}
                size={size}
                color={color}
              />
            );
          },
        })}
      >
        <Tab.Screen name="My Kitchen" component={HomeStack} />
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
