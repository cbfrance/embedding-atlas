<script lang="ts">
  import { imageToDataUrl } from "@embedding-atlas/utils";
  import { makeClient } from "@uwdata/mosaic-core";
  import * as SQL from "@uwdata/mosaic-sql";

  import type { ChartViewProps, RowID } from "../chart.js";
  import { hasNoteColumns } from "./notes_api.js";
  import type { PosterGridSpec } from "./types.js";

  let { context, width, height, spec }: ChartViewProps<PosterGridSpec, {}> = $props();

  interface Item {
    id: RowID;
    label: string | null;
    starred: boolean;
    status: string | null;
  }

  const GAP = 6;
  const LABEL_HEIGHT = 18;
  const IMAGE_BATCH = 48;

  // svelte-ignore state_referenced_locally
  let highlight = context.highlight;
  // svelte-ignore state_referenced_locally
  let withNotes = hasNoteColumns(context);

  let items = $state.raw<Item[]>([]);
  let total = $state(0);
  let images = $state.raw(new Map<RowID, string | null>());
  let pending = new Set<RowID>();

  let scroller = $state.raw<HTMLDivElement | undefined>(undefined);
  let scrollTop = $state(0);
  let viewWidth = $state(0);
  let viewHeight = $state(0);

  let cellWidth = $derived(spec.cellWidth ?? 96);
  let imageHeight = $derived(Math.round(cellWidth * 1.5));
  let rowHeight = $derived(imageHeight + LABEL_HEIGHT + GAP);
  let columns = $derived(Math.max(1, Math.floor((viewWidth - GAP) / (cellWidth + GAP))));
  let rowCount = $derived(Math.ceil(items.length / columns));
  let firstRow = $derived(Math.max(0, Math.floor(scrollTop / rowHeight) - 1));
  let lastRow = $derived(Math.min(rowCount, Math.ceil((scrollTop + viewHeight) / rowHeight) + 1));
  let visible = $derived(
    items.slice(firstRow * columns, lastRow * columns).map((item, i) => ({ item, index: firstRow * columns + i })),
  );
  let highlighted = $derived(new Set($highlight ?? []));

  function baseQuery(predicate: SQL.FilterExpr | null | undefined) {
    let q = SQL.Query.from(context.table);
    return predicate ? q.where(predicate) : q;
  }

  $effect(() => {
    let sort = spec.sort ?? [];
    let limit = spec.limit ?? 10000;
    let labelField = spec.labelField;
    let orderBy = sort.map((s) => (s.direction == "descending" ? SQL.desc(s.column) : SQL.asc(s.column)));

    let select: Record<string, any> = { id: SQL.column(context.id) };
    if (labelField != null) {
      select.label = SQL.column(labelField);
    }
    if (withNotes) {
      select.starred = SQL.column("starred");
      select.status = SQL.column("status");
    }

    let countClient = makeClient({
      coordinator: context.coordinator,
      selection: context.filter,
      query: (predicate) => baseQuery(predicate).select({ count: SQL.count() }),
      queryResult: (result: any) => {
        total = Number(result.get(0).count);
      },
    });
    let client = makeClient({
      coordinator: context.coordinator,
      selection: context.filter,
      query: (predicate) => baseQuery(predicate).select(select).orderby(orderBy).limit(limit),
      queryResult: (result: any) => {
        items = result.toArray().map((r: any) => ({
          id: r.id,
          label: r.label ?? null,
          starred: r.starred === true,
          status: r.status ?? null,
        }));
      },
    });
    return () => {
      countClient.destroy();
      client.destroy();
    };
  });

  async function loadImages(ids: RowID[]) {
    for (let id of ids) {
      pending.add(id);
    }
    try {
      let result = await context.coordinator.query(
        SQL.Query.from(context.table)
          .select({ id: SQL.column(context.id), image: SQL.column(spec.image) })
          .where(
            SQL.isIn(
              SQL.column(context.id),
              ids.map((id) => SQL.literal(id)),
            ),
          ),
      );
      let next = new Map(images);
      for (let r of result.toArray()) {
        next.set(r.id, r.image != null ? imageToDataUrl(r.image) : null);
      }
      for (let id of ids) {
        if (!next.has(id)) {
          next.set(id, null);
        }
      }
      images = next;
    } finally {
      for (let id of ids) {
        pending.delete(id);
      }
    }
  }

  $effect(() => {
    let missing = visible.map((v) => v.item.id).filter((id) => !images.has(id) && !pending.has(id));
    for (let i = 0; i < missing.length; i += IMAGE_BATCH) {
      loadImages(missing.slice(i, i + IMAGE_BATCH));
    }
  });

  $effect.pre(() => {
    let previous: RowID[] = [];
    return highlight.subscribe((ids) => {
      let next = ids ?? [];
      let entering = next.filter((x) => previous.indexOf(x) < 0);
      previous = next;
      if (entering.length != 1 || scroller == null) {
        return;
      }
      let index = items.findIndex((x) => x.id == entering[0]);
      if (index < 0) {
        return;
      }
      let top = Math.floor(index / columns) * rowHeight;
      if (top < scroller.scrollTop || top + rowHeight > scroller.scrollTop + scroller.clientHeight) {
        scroller.scrollTo({ top: Math.max(0, top - rowHeight), behavior: "smooth" });
      }
    });
  });
</script>

<div class="flex flex-col" style:width={width != null ? `${width}px` : undefined} style:height="{height ?? 600}px">
  <div class="px-2 pb-1 text-sm text-slate-500 dark:text-slate-400 select-none">
    {#if items.length < total}
      Showing {items.length.toLocaleString()} of {total.toLocaleString()}
    {:else}
      {total.toLocaleString()} items
    {/if}
  </div>
  <div
    class="flex-1 min-h-0 overflow-y-auto"
    bind:this={scroller}
    bind:clientWidth={viewWidth}
    bind:clientHeight={viewHeight}
    onscroll={(e) => (scrollTop = e.currentTarget.scrollTop)}
  >
    <div class="relative" style:height="{rowCount * rowHeight + GAP}px">
      {#each visible as { item, index } (item.id)}
        {@const src = images.get(item.id)}
        <button
          class="absolute flex flex-col text-left rounded-md focus-visible:outline-2 outline-blue-600"
          style:left="{GAP + (index % columns) * (cellWidth + GAP)}px"
          style:top="{GAP + Math.floor(index / columns) * rowHeight}px"
          style:width="{cellWidth}px"
          title={item.label ?? ""}
          onclick={() => highlight.set([item.id])}
        >
          <div
            class="relative w-full rounded-md overflow-hidden bg-slate-200 dark:bg-slate-800
              {highlighted.has(item.id) ? 'ring-2 ring-blue-600 ring-offset-1 dark:ring-offset-slate-900' : ''}"
            style:height="{imageHeight}px"
          >
            {#if src != null}
              <img
                src={src}
                alt={item.label ?? ""}
                class="w-full h-full object-cover
                  {item.status == 'watched' ? 'opacity-40' : ''}
                  {item.status == 'skip' ? 'opacity-30 grayscale' : ''}"
                draggable="false"
              />
            {:else if images.has(item.id)}
              <div class="p-1 text-xs text-slate-500 dark:text-slate-400">{item.label ?? ""}</div>
            {/if}
            {#if item.starred}
              <div class="absolute top-0.5 right-1 text-amber-400 text-base drop-shadow">★</div>
            {/if}
            {#if item.status != null}
              <div class="absolute bottom-0.5 left-0.5 px-1 rounded text-[10px] bg-black/60 text-white">
                {item.status == "watched" ? "Watched" : "Skip"}
              </div>
            {/if}
          </div>
          <div class="w-full truncate text-xs leading-[18px] text-slate-700 dark:text-slate-300">
            {item.label ?? ""}
          </div>
        </button>
      {/each}
    </div>
  </div>
</div>
