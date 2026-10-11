import type { DataPoint } from "@embedding-atlas/component";
import * as SQL from "@uwdata/mosaic-sql";

import type { ChartContext, RowID } from "../chart.js";

let latest = 0;

export async function nearestTooltipPoint(
  context: ChartContext,
  data: { x: string; y: string; text?: string | null },
  id: RowID | null,
): Promise<DataPoint | null | undefined> {
  let token = ++latest;
  if (id == null) {
    return null;
  }
  let columns = (context.tables[context.table]?.columns ?? []).map((c) => c.name);
  let result = await context.coordinator.query(
    SQL.Query.from(context.table)
      .select({
        ...Object.fromEntries(columns.map((c) => [c, SQL.column(c)])),
        __x: SQL.column(data.x),
        __y: SQL.column(data.y),
        __id: SQL.column(context.id),
      })
      .where(SQL.eq(SQL.column(context.id), SQL.literal(id))),
  );
  if (token != latest) {
    return undefined;
  }
  let row = result.get(0);
  if (row == null) {
    return null;
  }
  return {
    x: row.__x,
    y: row.__y,
    identifier: row.__id,
    text: data.text != null ? row[data.text] : undefined,
    fields: Object.fromEntries(columns.map((c) => [c, row[c]])),
  };
}
