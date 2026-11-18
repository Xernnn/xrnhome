import React, { memo, useMemo } from "react";
import { View, StyleSheet } from "react-native";
import { Text } from "./Text";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { RADIUS, mixHex } from "../utils/constants";
import { useTheme } from "../context/ThemeContext";

// Gap between two different categories is twice this.
export const BLOB_HALF_GAP = 3;
const BLOB_PADDING = 5;
export const CELL_PADDING = BLOB_HALF_GAP + BLOB_PADDING;
const LABEL_HEIGHT = 20;
const BLOB_RADIUS = RADIUS.tile + 4;

const CORNERS = [
  { key: "upLeft", style: { top: 0, left: 0 } },
  { key: "upRight", style: { top: 0, right: 0 } },
  { key: "downLeft", style: { bottom: 0, left: 0 } },
  { key: "downRight", style: { bottom: 0, right: 0 } },
];

// A blob edge is pulled in by half the gap unless it meets the same category.
const edge = (isJoined) => (isJoined ? 0 : BLOB_HALF_GAP);
const radius = (isJoined) => (isJoined ? 0 : BLOB_RADIUS);

function BlobRow({ row, columns, cellWidth, renderCard }) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const cardWidth = cellWidth - CELL_PADDING * 2;
  const tint = isDark ? 0.22 : 0.16;
  const topPadding = row.labels.length > 0 ? BLOB_HALF_GAP + LABEL_HEIGHT : CELL_PADDING;

  return (
    <View style={[styles.row, { width: cellWidth * columns }]}>
      {row.cells.map((cell, c) => {
        const j = row.joins[c];
        const color = mixHex(cell.meta.color, colors.background, tint);
        return (
          <View
            key={cell.item.id}
            style={{
              width: cellWidth,
              paddingTop: topPadding,
              paddingHorizontal: CELL_PADDING,
              paddingBottom: CELL_PADDING,
            }}
          >
            {/* Its share of the blob: a band across and a band down, reaching
                into a neighbour only when that neighbour is the same group. The
                pieces overlap, so the tint is mixed to a solid colour. */}
            <View
              style={[
                styles.blob,
                {
                  backgroundColor: color,
                  top: BLOB_HALF_GAP,
                  bottom: BLOB_HALF_GAP,
                  left: edge(j.left),
                  right: edge(j.right),
                  borderTopLeftRadius: radius(j.left),
                  borderBottomLeftRadius: radius(j.left),
                  borderTopRightRadius: radius(j.right),
                  borderBottomRightRadius: radius(j.right),
                },
              ]}
            />
            <View
              style={[
                styles.blob,
                {
                  backgroundColor: color,
                  top: edge(j.up),
                  bottom: edge(j.down),
                  left: BLOB_HALF_GAP,
                  right: BLOB_HALF_GAP,
                  borderTopLeftRadius: radius(j.up),
                  borderTopRightRadius: radius(j.up),
                  borderBottomLeftRadius: radius(j.down),
                  borderBottomRightRadius: radius(j.down),
                },
              ]}
            />
            {/* Inner corners fill in only where all four cells round them match,
                so an L-shaped blob keeps a clean inside corner. */}
            {CORNERS.filter((corner) => j[corner.key]).map((corner) => (
              <View
                key={corner.key}
                style={[styles.corner, corner.style, { backgroundColor: color }]}
              />
            ))}
            {renderCard(cell.item, cardWidth)}
          </View>
        );
      })}

      {row.labels.map((run) => (
        <View
          key={`label-${run.meta.label}-${run.start}`}
          pointerEvents="none"
          style={[
            styles.label,
            {
              left: run.start * cellWidth + CELL_PADDING,
              width: run.span * cellWidth - CELL_PADDING * 2,
            },
          ]}
        >
          <MaterialCommunityIcons name={run.meta.icon} size={12} color={run.meta.color} />
          <Text style={styles.labelText} numberOfLines={1} maxFontSizeMultiplier={1.2}>
            {run.meta.label}
            {run.count > 1 ? <Text style={styles.labelCount}> · {run.count}</Text> : null}
          </Text>
        </View>
      ))}
    </View>
  );
}

const sameJoins = (a, b) =>
  a.length === b.length &&
  a.every((j, i) => Object.keys(j).every((key) => j[key] === b[i][key]));

const sameLabels = (a, b) =>
  a.length === b.length &&
  a.every(
    (l, i) =>
      l.meta.label === b[i].meta.label &&
      l.meta.color === b[i].meta.color &&
      l.count === b[i].count &&
      l.start === b[i].start &&
      l.span === b[i].span
  );

// The rows are worked out again whenever any item changes, but a row only needs
// drawing again if one of its own items, its blob or its labels did.
export const BlobGridRow = memo(
  BlobRow,
  (a, b) =>
    a.columns === b.columns &&
    a.cellWidth === b.cellWidth &&
    a.renderCard === b.renderCard &&
    a.row.cells.length === b.row.cells.length &&
    a.row.cells.every(
      (cell, i) => cell.item === b.row.cells[i].item && cell.meta.color === b.row.cells[i].meta.color
    ) &&
    sameJoins(a.row.joins, b.row.joins) &&
    sameLabels(a.row.labels, b.row.labels)
);

const createStyles = (colors) =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
    },
    blob: {
      position: "absolute",
    },
    corner: {
      position: "absolute",
      width: BLOB_HALF_GAP,
      height: BLOB_HALF_GAP,
    },
    label: {
      position: "absolute",
      top: BLOB_HALF_GAP,
      height: LABEL_HEIGHT,
      flexDirection: "row",
      alignItems: "center",
    },
    labelText: {
      flexShrink: 1,
      marginLeft: 4,
      fontSize: 11.5,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    labelCount: {
      fontWeight: "600",
      color: colors.textSecondary,
    },
  });
