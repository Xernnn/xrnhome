import { DARK_COLORS, LIGHT_COLORS } from "../src/utils/constants";

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// What sits on what. `warning` and `danger` are text on the card and on the page.
describe.each([
  ["light", LIGHT_COLORS],
  ["dark", DARK_COLORS],
])("%s theme", (_, c) => {
  it.each([
    ["onAccent on accent", c.onAccent, c.accent],
    ["accent text on the card", c.accent, c.surface],
    ["warning text on the card", c.warning, c.surface],
    ["warning text on the page", c.warning, c.background],
    ["warning text on its tint", c.warning, c.warningLight],
    ["danger text on the card", c.danger, c.surface],
    ["danger text on the page", c.danger, c.background],
    ["danger text on its tint", c.danger, c.dangerLight],
    ["secondary text on the card", c.textSecondary, c.surface],
    ["secondary text on the page", c.textSecondary, c.background],
    ["undo on the toast", c.inverseAccent, c.inverseSurface],
  ])("%s reads at 4.5:1", (_label, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
});
