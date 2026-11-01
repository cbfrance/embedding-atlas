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

- `packages/viewer/src/charts/notes/Detail.svelte`: chart type `detail` shows the last clicked point in full. Spec: `{type: "detail", titleField?, quoteField?, bodyField, metaFields?, sections?, linkFields?}`. `quoteField` renders as a large pull quote under the title. Link fields render as anchors; `zed://` and `obsidian://` links open the file in that app.
- Click anywhere on the map with `nearestTooltip` on selects the nearest point (the one the dashed line points at), so the Detail and Notes panes follow it (`MapOverlay.svelte` `onPick`, one prop in `Embedding.svelte`).
- Map scrolling: a two-finger trackpad scroll pans the map; pinch (or Ctrl/Cmd + scroll) zooms. Upstream zooms on every scroll. Change in `packages/component/src/lib/embedding_view/EmbeddingViewImpl.svelte` (`onWheel`, `onPan`).
- Color scheme: the Light/Dark choice from the side bar is saved in localStorage (`embedding-atlas-color-scheme`) and restored on load; with no saved choice the default is Dark (`utils/color_scheme.ts`, one line in `EmbeddingAtlas.svelte`).
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
- Panel resize handles sit in the gap between panels (`DashboardChartPanel.svelte`, `RESIZER_OFFSET = -4`, `RESIZER_SIZE = 6`), so they no longer cover a panel's bottom controls such as the map's selection buttons.
- The add-widget menu shows a name under each icon (`name` on `ChartBuilderDescription`). Builder fields can list `preferred` column names, picked by default when present: Detail picks `text` and `doc_text`, Notes picks `id` and `doc_title`.
- Tables show `columns` in the order the spec lists them (upstream used dataset order).
- Detail and Notes have a Pin button (`PinButton.svelte`). A pinned panel keeps its point while the selection changes; unpinning jumps to the current selection.
- Detail `similar: {vectorField, textField, metaField?, limit?}` lists the nearest rows by `list_cosine_similarity` in DuckDB. Clicking one selects it. An exact scan over 8,826 rows takes about 7 ms, so no vss index is used.
- Map config `pointOpacity` (0 to 1) draws points at a fixed opacity instead of fading with density; `pointSizeZoomMax` grows `pointSize` as the view zooms in, up to that factor. Chart specs pass `config` through to the map.
- Category colors use a palette validated for color-blind separation, eight slots per mode, with a neutral Other color; maps fold past eight categories into Other.
- Map spec `pointTitles: true` writes each point's tooltip title beside it once points are far enough apart to read, skipping titles that would overlap (`MapOverlay.svelte`). Per-point labels through `--labels` do not scale: placement compares every pair of labels.
