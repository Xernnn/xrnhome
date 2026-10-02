import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LIGHT_COLORS, DARK_COLORS } from "../utils/constants";
import { THEME_KEY, moveLegacyKeys } from "../utils/storage";

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState("system");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await moveLegacyKeys();
        const stored = await AsyncStorage.getItem(THEME_KEY);
        if (
          mounted &&
          (stored === "light" || stored === "dark" || stored === "system")
        ) {
          setModeState(stored);
        }
      } catch (error) {
        console.error("Failed to load theme mode:", error);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const persistMode = useCallback(async (nextMode) => {
    try {
      await AsyncStorage.setItem(THEME_KEY, nextMode);
    } catch (error) {
      console.error("Failed to save theme mode:", error);
    }
  }, []);

  const setMode = useCallback(
    (nextMode) => {
      setModeState(nextMode);
      persistMode(nextMode);
    },
    [persistMode]
  );

  const isDark =
    mode === "system" ? systemScheme === "dark" : mode === "dark";

  const toggleTheme = useCallback(() => {
    setMode(isDark ? "light" : "dark");
  }, [isDark, setMode]);

  const colors = isDark ? DARK_COLORS : LIGHT_COLORS;

  const value = useMemo(
    () => ({ mode, isDark, colors, setMode, toggleTheme }),
    [mode, isDark, colors, setMode, toggleTheme]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}

export default ThemeContext;
