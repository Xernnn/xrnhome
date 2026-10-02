import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { RADIUS, mixHex } from "../utils/constants";
import { useTheme } from "../context/ThemeContext";

// Gap between two different categories is twice this.
export const BLOB_HALF_GAP = 3;
const BLOB_PADDING = 5;
const CELL_PADDING = BLOB_HALF_GAP + BLOB_PADDING;
const LABEL_HEIGHT = 20;
const BLOB_RADIUS = RADIUS.card + 2;

const CORNERS = [
  { key: "upLeft", style: { top: 0, left: 0 } },
  { key: "upRight", style: { top: 0, right: 0 } },
  { key: "downLeft", style: { bottom: 0, left: 0 } },
  { key: "downRight", style: { bottom: 0, right: 0 } },
];

// A blob edge is pulled in by half the gap unless it meets the same category.
const edge = (isJoined) => (isJoined ? 0 : BLOB_HALF_GAP);
const radius = (isJoined) => (isJoined ? 0 : BLOB_RADIUS);

/**
 * Lays every item out in one grid, category after category, so a row can hold
 * the end of one category and the start of the next. Each category sits on a
 * tinted blob in its own color, labelled with its name. Same-category cells
 * that touch merge into one blob; a category that wraps onto the next row and
 * no longer touches its first part gets its own label there too.
 *
 * Each cell paints its share of the blob as a horizontal band and a vertical
 * band, which reach into a neighbouring cell's side only when that neighbour
 * belongs to the same category. Corner squares fill in only where all four
 * cells around a corner match, so inner corners of an L-shaped blob stay
 * clean instead of growing a notch. The pieces overlap, so the tint is mixed
 * into an opaque color rather than drawn with alpha.
 *
 * `groups` is [{ meta, items }] in display order. `width` is the grid's full
 * width; each blob's outer edge lands BLOB_HALF_GAP inside it.
 */
export default function CategoryBlobGrid({
  groups,
  width,
  columns = 3,
  renderItem,
}) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const rows = useMemo(() => {
    const cells = groups.flatMap((group) =>
      group.items.map((item) => ({
        item,
        meta: group.meta,
        count: group.items.length,
      }))
    );
    const out = [];
    for (let i = 0; i < cells.length; i += columns) {
      out.push(cells.slice(i, i + columns));
    }
    return out;
  }, [groups, columns]);

  const cellWidth = width / columns;
  const cardWidth = cellWidth - CELL_PADDING * 2;
  const tint = isDark ? 0.28 : 0.2;

  const categoryAt = (r, c) =>
    rows[r] && rows[r][c] ? rows[r][c].meta.label : null;

  return (
    <View style={{ width }}>
      {rows.map((row, r) => {
        const joined = row.map((cell, c) => {
          const label = cell.meta.label;
          const left = c > 0 && categoryAt(r, c - 1) === label;
          const right = c < columns - 1 && categoryAt(r, c + 1) === label;
          const up = categoryAt(r - 1, c) === label;
          const down = categoryAt(r + 1, c) === label;
          return {
            left,
            right,
            up,
            down,
            upLeft: left && up && categoryAt(r - 1, c - 1) === label,
            upRight: right && up && categoryAt(r - 1, c + 1) === label,
            downLeft: left && down && categoryAt(r + 1, c - 1) === label,
            downRight: right && down && categoryAt(r + 1, c + 1) === label,
          };
        });

        // Runs of one category across this row. A run that touches its own
        // category in the row above is part of an already-labelled blob.
        const labels = [];
        row.forEach((cell, c) => {
          if (joined[c].left) {
            const run = labels[labels.length - 1];
            run.span += 1;
            run.continues = run.continues || joined[c].up;
          } else {
            labels.push({
              ...cell,
              start: c,
              span: 1,
              continues: joined[c].up,
            });
          }
        });
        const shownLabels = labels.filter((run) => !run.continues);
        const topPadding =
          shownLabels.length > 0
            ? BLOB_HALF_GAP + LABEL_HEIGHT
            : CELL_PADDING;

        return (
          <View key={r} style={styles.row}>
            {row.map((cell, c) => {
              const j = joined[c];
              const color = mixHex(
                cell.meta.color,
                colors.background,
                tint
              );
              const corners = CORNERS.filter((corner) => j[corner.key]);
              return (
                <View
                  key={cell.item.id}
                  style={[
                    styles.cell,
                    {
                      width: cellWidth,
                      paddingTop: topPadding,
                      paddingHorizontal: CELL_PADDING,
                      paddingBottom: CELL_PADDING,
                    },
                  ]}
                >
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
                  {corners.map((corner) => (
                    <View
                      key={corner.key}
                      style={[
                        styles.corner,
                        corner.style,
                        { backgroundColor: color },
                      ]}
                    />
                  ))}
                  {renderItem(cell.item, cardWidth)}
                </View>
              );
            })}

            {shownLabels.map((run) => (
              <View
                key={`label-${run.item.id}`}
                style={[
                  styles.label,
                  {
                    left: run.start * cellWidth + CELL_PADDING,
                    width: run.span * cellWidth - CELL_PADDING * 2,
                  },
                ]}
              >
                <MaterialCommunityIcons
                  name={run.meta.icon}
                  size={12}
                  color={run.meta.color}
                />
                <Text
                  style={styles.labelText}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {run.meta.label}
                  {run.count > 1 ? (
                    <Text style={styles.labelCount}> · {run.count}</Text>
                  ) : null}
                </Text>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
    },
    cell: {
      alignItems: "center",
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
      pointerEvents: "none",
      top: BLOB_HALF_GAP,
      height: LABEL_HEIGHT,
      flexDirection: "row",
      alignItems: "center",
    },
    labelText: {
      flexShrink: 1,
      marginLeft: 4,
      fontSize: 11,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    labelCount: {
      fontWeight: "600",
      color: colors.textSecondary,
    },
  });
