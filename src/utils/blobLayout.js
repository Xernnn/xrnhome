// A phone gets three cards a row; a wider window fits more of the same size.
export const MIN_CELL_WIDTH = 150;

export const columnsFor = (width) => Math.max(3, Math.floor(width / MIN_CELL_WIDTH));

/**
 * Lays every item out in one grid, group after group, so a row can hold the end
 * of one category and the start of the next and no row is left half empty. Each
 * group sits on a blob tinted in its own colour, labelled with its name.
 * Same-group cells that touch merge into one blob; a group that wraps onto the
 * next row and no longer touches its first part gets its own label there too.
 *
 * `groups` is [{ meta: { label, icon, color }, items }] in display order. Each
 * row comes back as { key, cells, joins, labels }: for every cell, which of its
 * eight neighbours belong to the same group, and the labels that start in it.
 */
export const blobRows = (groups, columns) => {
  const cells = groups.flatMap((group) =>
    group.items.map((item) => ({ item, meta: group.meta, count: group.items.length }))
  );
  const rows = [];
  for (let i = 0; i < cells.length; i += columns) {
    rows.push(cells.slice(i, i + columns));
  }
  const groupAt = (r, c) => (rows[r] && rows[r][c] ? rows[r][c].meta.label : null);

  return rows.map((row, r) => {
    const joins = row.map((cell, c) => {
      const label = cell.meta.label;
      const left = c > 0 && groupAt(r, c - 1) === label;
      const right = c < columns - 1 && groupAt(r, c + 1) === label;
      const up = groupAt(r - 1, c) === label;
      const down = groupAt(r + 1, c) === label;
      return {
        left,
        right,
        up,
        down,
        upLeft: left && up && groupAt(r - 1, c - 1) === label,
        upRight: right && up && groupAt(r - 1, c + 1) === label,
        downLeft: left && down && groupAt(r + 1, c - 1) === label,
        downRight: right && down && groupAt(r + 1, c + 1) === label,
      };
    });

    // Runs of one group across this row. A run that touches its own group in
    // the row above is part of a blob that already has its label.
    const runs = [];
    row.forEach((cell, c) => {
      if (joins[c].left) {
        const run = runs[runs.length - 1];
        run.span += 1;
        run.continues = run.continues || joins[c].up;
      } else {
        runs.push({ meta: cell.meta, count: cell.count, start: c, span: 1, continues: joins[c].up });
      }
    });
    const labels = runs
      .filter((run) => !run.continues)
      .map(({ meta, count, start, span }) => ({ meta, count, start, span }));

    return { key: `row-${row[0].item.id}`, cells: row, joins, labels };
  });
};
