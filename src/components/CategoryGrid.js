import React, { memo, useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SPACING, categoryColor } from "../utils/constants";
import { useTheme } from "../context/ThemeContext";

export const GRID_GAP = 8;
export const GRID_GUTTER = 12; // less than a page's, so photos get the room

export const cardWidthFor = (pageWidth, columns) =>
  (pageWidth - GRID_GUTTER * 2 - GRID_GAP * (columns - 1)) / columns;

// A room's page is one flat list so that only what's on screen gets drawn: for
// each category a header row, then rows of cards.
//
// `groups` is [{ meta, items }] in display order, and a group with no meta has no
// header. A group always starts on a new row, so its header's count is all of it.
export const buildRows = (groups, columns) => {
  const rows = [];
  groups.forEach((group) => {
    const label = group.meta ? group.meta.label : "all";
    if (group.meta) {
      rows.push({
        type: "header",
        key: `header-${label}`,
        meta: group.meta,
        count: group.items.length,
      });
    }
    for (let i = 0; i < group.items.length; i += columns) {
      const cells = group.items.slice(i, i + columns);
      rows.push({
        type: "row",
        key: `row-${label}-${cells[0].id}`,
        meta: group.meta,
        cells,
      });
    }
  });
  return rows;
};

export const GridHeader = memo(function GridHeader({ meta, count }) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.header} accessibilityRole="header">
      <MaterialCommunityIcons
        name={meta.icon}
        size={15}
        color={categoryColor(meta, isDark)}
      />
      <Text style={styles.label} numberOfLines={1}>
        {meta.label}
      </Text>
      <Text style={styles.count}>{count}</Text>
    </View>
  );
});

function Row({ row, columns, renderCard }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const blanks = Math.max(0, columns - row.cells.length);
  return (
    <View style={styles.row}>
      {row.cells.map((item) => (
        <View key={item.id} style={styles.cell}>
          {renderCard(item)}
        </View>
      ))}
      {Array.from({ length: blanks }, (_, index) => (
        <View key={index} style={styles.cell} />
      ))}
    </View>
  );
}

// A row is rebuilt whenever any item changes, but only needs drawing again if
// one of its own did.
export const GridRow = memo(
  Row,
  (a, b) =>
    a.columns === b.columns &&
    a.renderCard === b.renderCard &&
    a.row.meta === b.row.meta &&
    a.row.cells.length === b.row.cells.length &&
    a.row.cells.every((item, index) => item === b.row.cells[index])
);

const createStyles = (colors) =>
  StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "center",
      marginHorizontal: SPACING.screen,
      marginTop: 14,
      marginBottom: 8,
    },
    label: {
      flexShrink: 1,
      marginLeft: 6,
      fontSize: 14,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    count: {
      marginLeft: 6,
      fontSize: 13,
      fontWeight: "500",
      color: colors.textSecondary,
    },
    row: {
      flexDirection: "row",
      marginHorizontal: GRID_GUTTER,
      marginBottom: GRID_GAP,
      gap: GRID_GAP,
    },
    cell: {
      flex: 1,
      minWidth: 0,
    },
  });
