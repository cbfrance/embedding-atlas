import type { Coordinator } from "@uwdata/mosaic-core";

import type { ChartContext } from "../chart.js";

export type NoteStatus = "watched" | "skip";

export interface Note {
  starred: boolean;
  status: NoteStatus | null;
  comment: string | null;
  labels: string[];
}

export const NOTE_COLUMNS = ["starred", "status", "comment", "labels"] as const;

export const DEFAULT_NOTES_ENDPOINT = "data/notes";

export function hasNoteColumns(context: ChartContext): boolean {
  let columns = new Set(context.tables[context.table]?.columns.map((c) => c.name) ?? []);
  return NOTE_COLUMNS.every((c) => columns.has(c));
}

export function noteFromRow(row: any): Note {
  return {
    starred: row.starred === true,
    status: row.status ?? null,
    comment: row.comment ?? null,
    labels: row.labels != null ? Array.from(row.labels as ArrayLike<string>) : [],
  };
}

function refresh(coordinator: Coordinator) {
  coordinator.preaggregator?.clear();
  coordinator.clear({ clients: false, cache: true });
  for (let client of coordinator.clients) {
    client.requestQuery();
  }
}

export async function saveNote(
  context: ChartContext,
  options: { endpoint: string; key: string },
  note: Note,
): Promise<Note> {
  let url = new URL(`${options.endpoint}/${encodeURIComponent(options.key)}`, document.baseURI);
  let resp = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(note),
  });
  if (!resp.ok) {
    throw new Error(`Save failed (${resp.status}): ${await resp.text()}`);
  }
  let saved: Note = await resp.json();
  refresh(context.coordinator);
  return saved;
}
