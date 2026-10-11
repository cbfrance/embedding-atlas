import { imageToDataUrl } from "@embedding-atlas/utils";
import * as SQL from "@uwdata/mosaic-sql";
import { writable, type Readable } from "svelte/store";

import type { ChartContext, RowID } from "../chart.js";

const BATCH = 48;

export interface ImageCache {
  get(id: RowID): string | null | undefined;
  request(ids: RowID[]): void;
  version: Readable<number>;
}

function createImageCache(context: ChartContext, column: string): ImageCache {
  let images = new Map<RowID, string | null>();
  let pending = new Set<RowID>();
  let version = writable(0);

  async function load(ids: RowID[]) {
    for (let id of ids) {
      pending.add(id);
    }
    try {
      let result = await context.coordinator.query(
        SQL.Query.from(context.table)
          .select({ id: SQL.column(context.id), image: SQL.column(column) })
          .where(
            SQL.isIn(
              SQL.column(context.id),
              ids.map((id) => SQL.literal(id)),
            ),
          ),
      );
      for (let r of result.toArray()) {
        images.set(r.id, r.image != null ? imageToDataUrl(r.image) : null);
      }
      for (let id of ids) {
        if (!images.has(id)) {
          images.set(id, null);
        }
      }
      version.update((v) => v + 1);
    } finally {
      for (let id of ids) {
        pending.delete(id);
      }
    }
  }

  return {
    get: (id) => images.get(id),
    request: (ids) => {
      let missing = ids.filter((id) => !images.has(id) && !pending.has(id));
      for (let i = 0; i < missing.length; i += BATCH) {
        load(missing.slice(i, i + BATCH));
      }
    },
    version,
  };
}

export function imageCache(context: ChartContext, column: string): ImageCache {
  return context.cache.value(`notes.images.${context.table}.${column}`, () => createImageCache(context, column));
}
