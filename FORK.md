# cbfrance/embedding-atlas

A fork of [apple/embedding-atlas](https://github.com/apple/embedding-atlas) that adds personal notes and a poster grid. It backs the media browser (`cbfrance/media-browser`, `make atlas-serve`).

## Additions

- `packages/backend/embedding_atlas/notes.py`: `--notes PATH --notes-key COLUMN`.
  - Adds `starred`, `status` (`watched` or `skip`), `comment` and `labels` columns to the dataset, filled from a JSON file.
  - `GET /data/notes` and `PUT /data/notes/{key}` (full record). A PUT writes the file, then updates the server DuckDB table, so every chart can filter on notes.
  - Requires `--duckdb server`.
- `packages/viewer/src/charts/notes/`: two chart types, registered from `chart_types.ts`.
  - `notes`: edits the notes of the last selected point. Spec: `{type: "notes", key, labelField?, endpoint?}`.
  - `poster-grid`: a virtualized image grid of the filtered rows. Spec: `{type: "poster-grid", image, labelField?, sort?, cellWidth?, limit?}`. Images load for the visible rows only.

- `packages/viewer/src/charts/notes/MapOverlay.svelte`: replaces the map overlay (it still draws Atlas's neighbor overlay).
  - `posters: true` on an `embedding` spec draws `data.image` at each point once zoomed in far enough to fit it (up to 200 posters, nearest to the center).
  - `nearestTooltip: true` shows the tooltip for the nearest point anywhere on the map, with a dashed line from the cursor. The lookup is a client-side Delaunay index over the filtered points.

Changes to upstream files are kept to a few lines: `cli.py` (options), `server.py` (mount), `chart_types.ts` (one register call), `embedding/Embedding.svelte` (overlay props and tooltip handling) and `embedding/types.ts` (two spec options).

## Sync with upstream

```bash
git fetch upstream
git merge upstream/main
```

## Build

Prerequisites are in `packages/docs/develop.md`, except that the `wasm-bindgen-cli` version must match `wasm-bindgen` in `Cargo.lock` (0.2.121 at the time of the fork).

```bash
npm ci
(cd packages/density-clustering && npm run build)
(cd packages/umap/umap-wasm && npm run build)
(cd packages/utils && npm run build)
(cd packages/component && npm run build)
(cd packages/viewer && npm run build)
rm -rf packages/backend/embedding_atlas/static && cp -r packages/viewer/dist packages/backend/embedding_atlas/static
```
