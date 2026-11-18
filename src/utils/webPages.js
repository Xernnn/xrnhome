import { Platform } from "react-native";

import { FORM_WIDTH } from "./constants";

// The stack options for pages of things to read or fill in. In a browser they
// stay a readable width, and keep to the window's height: React Navigation lets a
// page as tall as the window (the form, which hides the tab bar) grow past it for
// the browser to scroll, which the page's own styles don't allow, so the end of
// the form couldn't be reached.
export const formPage = (os = Platform.OS) =>
  os === "web"
    ? {
        cardStyle: {
          width: "100%",
          maxWidth: FORM_WIDTH,
          alignSelf: "center",
          flex: 1,
          overflow: "hidden",
        },
      }
    : {};
