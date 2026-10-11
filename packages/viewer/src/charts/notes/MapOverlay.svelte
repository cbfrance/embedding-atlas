<script lang="ts">
  import type { DataPoint, OverlayProxy } from "@embedding-atlas/component";
  import { makeClient } from "@uwdata/mosaic-core";
  import * as SQL from "@uwdata/mosaic-sql";
  import { Delaunay } from "d3";
  import { onMount } from "svelte";

  import Overlay from "../embedding/Overlay.svelte";

  import type { ChartContext, RowID } from "../chart.js";
  import { imageCache } from "./image_cache.js";

  interface Props {
    nodes?: DataPoint[];
    edges?: { start: DataPoint; end: DataPoint }[];
    proxy: OverlayProxy;
    context: ChartContext;
    x: string;
    y: string;
    image?: string | null;
    posters: boolean;
    nearest: boolean | { title?: string; details?: string[] } | null;
    onNearest: (id: RowID | null) => void;
  }

  let { nodes, edges, proxy, context, x, y, image, posters: showPosters, nearest, onNearest }: Props = $props();

  const MAX_POSTERS = 200;
  const MIN_POSTER_WIDTH = 22;
  const MAX_POSTER_WIDTH = 96;
  const CARD_WIDTH = 240;
  const CARD_IMAGE_WIDTH = 64;
  const CARD_OFFSET = 14;

  let ids = $state.raw<RowID[]>([]);
  let xs = $state.raw<Float64Array>(new Float64Array());
  let ys = $state.raw<Float64Array>(new Float64Array());
  let delaunay = $state.raw<Delaunay<number> | null>(null);
  let spacing = $state(0);
  let titles = $state.raw<(string | null)[]>([]);
  let details = $state.raw<string[][]>([]);

  let cardFields = $derived(typeof nearest == "object" && nearest != null ? nearest : {});

  let root = $state.raw<HTMLDivElement | undefined>(undefined);
  let cursor = $state.raw<{ x: number; y: number } | null>(null);
  let nearestIndex = $state<number | null>(null);

  // svelte-ignore state_referenced_locally
  let images = image != null ? imageCache(context, image) : null;
  let imagesVersion = images?.version;

  function imageFor(id: RowID, _version: number | undefined) {
    return images?.get(id);
  }

  $effect(() => {
    let client = makeClient({
      coordinator: context.coordinator,
      selection: context.filter,
      query: (predicate) => {
        let q = SQL.Query.from(context.table).select({
          id: SQL.column(context.id),
          x: SQL.column(x),
          y: SQL.column(y),
          ...(cardFields.title != null ? { __title: SQL.column(cardFields.title) } : {}),
          ...Object.fromEntries((cardFields.details ?? []).map((f, i) => [`__detail${i}`, SQL.column(f)])),
        });
        return predicate ? q.where(predicate) : q;
      },
      queryResult: (result: any) => {
        let rows = result.toArray();
        ids = rows.map((r: any) => r.id);
        xs = Float64Array.from(rows, (r: any) => r.x);
        ys = Float64Array.from(rows, (r: any) => r.y);
        titles = rows.map((r: any) => r.__title ?? null);
        details = rows.map((r: any) =>
          (cardFields.details ?? []).map((_, i) => formatValue(r[`__detail${i}`])).filter((v) => v != ""),
        );
        let d =
          rows.length >= 3
            ? Delaunay.from(
                rows,
                (r: any) => r.x,
                (r: any) => r.y,
              )
            : null;
        delaunay = d;
        spacing = d != null ? medianNeighborDistance(d) : 0;
        nearestIndex = null;
      },
    });
    return () => client.destroy();
  });

  function formatValue(value: any): string {
    if (value == null) {
      return "";
    }
    if (typeof value == "object" && typeof value[Symbol.iterator] == "function") {
      return Array.from(value as Iterable<any>).join(", ");
    }
    return String(value);
  }

  function medianNeighborDistance(d: Delaunay<number>): number {
    let { points, halfedges, triangles } = d;
    let lengths: number[] = [];
    for (let e = 0; e < halfedges.length; e++) {
      if (e < halfedges[e]) {
        continue;
      }
      let a = triangles[e];
      let b = triangles[e % 3 == 2 ? e - 2 : e + 1];
      lengths.push(Math.hypot(points[2 * a] - points[2 * b], points[2 * a + 1] - points[2 * b + 1]));
    }
    lengths.sort((a, b) => a - b);
    return lengths[Math.floor(lengths.length / 2)] ?? 0;
  }

  let transform = $derived.by(() => {
    let o = proxy.location(0, 0);
    let u = proxy.location(1, 1);
    return { ox: o.x, oy: o.y, kx: u.x - o.x, ky: u.y - o.y };
  });

  let posterWidth = $derived(Math.min(MAX_POSTER_WIDTH, Math.abs(transform.kx) * spacing * 1.1));

  let posters = $derived.by(() => {
    if (images == null || !showPosters || posterWidth < MIN_POSTER_WIDTH) {
      return [];
    }
    let { ox, oy, kx, ky } = transform;
    let w = proxy.width;
    let h = proxy.height;
    let margin = posterWidth;
    let visible: { index: number; sx: number; sy: number; d: number }[] = [];
    for (let i = 0; i < ids.length; i++) {
      let sx = ox + kx * xs[i];
      let sy = oy + ky * ys[i];
      if (sx < -margin || sx > w + margin || sy < -margin || sy > h + margin) {
        continue;
      }
      visible.push({ index: i, sx, sy, d: (sx - w / 2) ** 2 + (sy - h / 2) ** 2 });
    }
    if (visible.length > MAX_POSTERS) {
      visible.sort((a, b) => a.d - b.d);
      visible = visible.slice(0, MAX_POSTERS);
    }
    return visible;
  });

  $effect(() => {
    images?.request(posters.map((p) => ids[p.index]));
  });

  function updateNearest(clientX: number, clientY: number) {
    if (root == null || delaunay == null) {
      return;
    }
    let rect = root.getBoundingClientRect();
    let px = clientX - rect.left;
    let py = clientY - rect.top;
    if (px < 0 || py < 0 || px > rect.width || py > rect.height) {
      clearNearest();
      return;
    }
    let { ox, oy, kx, ky } = transform;
    let index = delaunay.find((px - ox) / kx, (py - oy) / ky, nearestIndex ?? undefined);
    cursor = { x: px, y: py };
    if (index != nearestIndex) {
      nearestIndex = index;
      onNearest(ids[index]);
      if (images != null && posters.length == 0) {
        images.request([ids[index]]);
      }
    }
  }

  function clearNearest() {
    if (cursor != null || nearestIndex != null) {
      cursor = null;
      nearestIndex = null;
      onNearest(null);
    }
  }

  onMount(() => {
    if (!nearest) {
      return;
    }
    let onMove = (e: PointerEvent) => {
      let map = root?.parentElement?.parentElement?.parentElement;
      let target = e.target as Element | null;
      if (map == null || target == null || !map.contains(target) || e.buttons != 0) {
        clearNearest();
        return;
      }
      if (target.closest("svg")?.parentElement !== map) {
        return;
      }
      updateNearest(e.clientX, e.clientY);
    };
    let onLeave = () => clearNearest();
    window.addEventListener("pointermove", onMove);
    document.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  });

  let target = $derived.by(() => {
    if (cursor == null || nearestIndex == null || nearestIndex >= ids.length) {
      return null;
    }
    return proxy.location(xs[nearestIndex], ys[nearestIndex]);
  });

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      },
    };
  }

  let card = $derived.by(() => {
    if (cursor == null || nearestIndex == null || nearestIndex >= ids.length) {
      return null;
    }
    let withImage = images != null && posters.length == 0;
    let height = withImage ? CARD_IMAGE_WIDTH * 1.5 + 16 : 16 + 18 * (1 + details[nearestIndex].length);
    let left = cursor.x + CARD_OFFSET;
    let top = cursor.y + CARD_OFFSET;
    if (left + CARD_WIDTH > proxy.width) {
      left = cursor.x - CARD_OFFSET - CARD_WIDTH;
    }
    if (top + height > proxy.height) {
      top = Math.max(4, cursor.y - CARD_OFFSET - height);
    }
    let rect = root?.getBoundingClientRect();
    return {
      id: ids[nearestIndex],
      pageLeft: (rect?.left ?? 0) + left,
      pageTop: (rect?.top ?? 0) + top,
      title: titles[nearestIndex],
      details: details[nearestIndex],
      withImage,
      left,
      top,
    };
  });
</script>

<div bind:this={root} style:width="{proxy.width}px" style:height="{proxy.height}px" style:position="relative">
  {#if posters.length > 0}
    <div style:position="absolute" style:inset="0" style:overflow="hidden">
      {#each posters as p (ids[p.index])}
        {@const src = imageFor(ids[p.index], $imagesVersion)}
        {#if src}
          <img
            src={src}
            alt=""
            draggable="false"
            class="absolute left-0 top-0 rounded-sm shadow-sm"
            style:width="{posterWidth}px"
            style:height="{posterWidth * 1.5}px"
            style:transform="translate({p.sx - posterWidth / 2}px, {p.sy - posterWidth * 0.75}px)"
          />
        {/if}
      {/each}
    </div>
  {/if}
  <div style:position="absolute" style:inset="0">
    <Overlay nodes={nodes} edges={edges} proxy={proxy} />
  </div>
  {#if target != null && cursor != null}
    <svg width={proxy.width} height={proxy.height} style:position="absolute" style:inset="0">
      <line
        x1={cursor.x}
        y1={cursor.y}
        x2={target.x}
        y2={target.y}
        class="stroke-slate-500 dark:stroke-slate-400"
        stroke-width="1"
        stroke-dasharray="3 3"
      />
    </svg>
  {/if}
  {#if card != null && (card.title != null || card.details.length > 0)}
    {@const src = card.withImage ? imageFor(card.id, $imagesVersion) : null}
    <div
      use:portal
      class="fixed z-50 flex gap-2 p-2 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-md text-xs text-slate-500 dark:text-slate-400 pointer-events-none"
      style:width="{CARD_WIDTH}px"
      style:transform="translate({card.pageLeft}px, {card.pageTop}px)"
      style:left="0"
      style:top="0"
    >
      {#if card.withImage}
        <div
          class="shrink-0 rounded-sm overflow-hidden bg-slate-200 dark:bg-slate-700"
          style:width="{CARD_IMAGE_WIDTH}px"
          style:height="{CARD_IMAGE_WIDTH * 1.5}px"
        >
          {#if src}
            <img src={src} alt="" class="w-full h-full object-cover" />
          {/if}
        </div>
      {/if}
      <div class="flex flex-col gap-0.5 min-w-0">
        {#if card.title != null}
          <div class="font-medium text-sm leading-tight text-slate-900 dark:text-slate-100">{card.title}</div>
        {/if}
        {#each card.details as line}
          <div class="leading-snug line-clamp-2">{line}</div>
        {/each}
      </div>
    </div>
  {/if}
</div>
