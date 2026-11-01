<script lang="ts">
  import * as SQL from "@uwdata/mosaic-sql";

  import { get } from "svelte/store";

  import Container from "../common/Container.svelte";
  import PinButton from "./PinButton.svelte";

  import type { ChartViewProps, RowID } from "../chart.js";
  import type { DetailSpec } from "./types.js";

  let { context, width, height, spec }: ChartViewProps<DetailSpec, {}> = $props();

  const LINK_LABELS: Record<string, string> = { zed: "Open in Zed", obsidian: "Open in Obsidian", url: "Open Link" };

  let row = $state.raw<Record<string, any> | null>(null);
  let rowId = $state.raw<RowID | null>(null);
  let similar = $state.raw<{ id: RowID; text: string; meta: string | null; score: number }[]>([]);
  let error = $state<string | null>(null);
  let pinned = $state(false);

  function fields(): string[] {
    return [
      ...new Set(
        [spec.titleField, spec.quoteField, ...(spec.metaFields ?? []), ...(spec.sections ?? []), spec.bodyField, ...(spec.linkFields ?? [])].filter(
          (f): f is string => f != null,
        ),
      ),
    ];
  }

  async function load(id: RowID) {
    let select: Record<string, any> = {};
    for (let f of fields()) {
      select[f] = SQL.column(f);
    }
    let r = await context.coordinator.query(
      SQL.Query.from(context.table)
        .select(select)
        .where(SQL.eq(SQL.column(context.id), SQL.literal(id))),
    );
    row = r.get(0) ?? null;
    rowId = id;
    error = null;
    similar = spec.similar != null ? await loadSimilar(id, spec.similar) : [];
  }

  async function loadSimilar(id: RowID, opts: NonNullable<DetailSpec["similar"]>) {
    let vector = SQL.column(opts.vectorField);
    let target = SQL.Query.from(context.table)
      .select({ v: vector })
      .where(SQL.eq(SQL.column(context.id), SQL.literal(id)));
    let score = SQL.sql`list_cosine_similarity(${vector}, (${target}))`;
    let r = await context.coordinator.query(
      SQL.Query.from(context.table)
        .select({
          id: SQL.column(context.id),
          text: SQL.column(opts.textField),
          meta: opts.metaField != null ? SQL.column(opts.metaField) : SQL.literal(null),
          score,
        })
        .where(SQL.neq(SQL.column(context.id), SQL.literal(id)))
        .orderby(SQL.desc(score))
        .limit(opts.limit ?? 8),
    );
    return r.toArray().map((x: any) => ({ id: x.id, text: String(x.text), meta: x.meta ?? null, score: Number(x.score) }));
  }

  function follow(ids: RowID[] | null) {
    let id = ids != null && ids.length > 0 ? ids[ids.length - 1] : null;
    if (id == null) {
      return;
    }
    load(id).catch((e) => {
      error = String(e);
    });
  }

  function togglePin() {
    pinned = !pinned;
    if (!pinned) {
      follow(get(context.highlight));
    }
  }

  $effect.pre(() =>
    context.highlight.subscribe((ids) => {
      if (!pinned) {
        follow(ids);
      }
    }),
  );

  function show(v: any): string | null {
    if (v == null || v === "") {
      return null;
    }
    if (v instanceof Date) {
      return v.toISOString().slice(0, 10);
    }
    return String(v);
  }

  function label(field: string): string {
    return field.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function isExternal(href: string): boolean {
    return href.startsWith("http://") || href.startsWith("https://");
  }
</script>

<Container width={width} height={height} scrollY={true}>
  {#if error != null}
    <div class="text-red-600 text-sm">{error}</div>
  {:else if row == null}
    <div class="text-slate-500 dark:text-slate-400">Click a point to see it here.</div>
  {:else}
    {@const meta = (spec.metaFields ?? []).map((f) => show(row?.[f])).filter((v) => v != null)}
    {@const links = (spec.linkFields ?? []).filter((f) => show(row?.[f]) != null)}
    <div class="flex flex-col gap-3 max-w-[70ch]">
      <div class="flex items-start gap-2">
        <div class="flex-1 font-semibold leading-snug">
          {#if spec.titleField != null}{show(row[spec.titleField]) ?? ""}{/if}
        </div>
        <PinButton pinned={pinned} onToggle={togglePin} />
      </div>
      {#if spec.quoteField != null && show(row[spec.quoteField]) != null}
        <blockquote class="text-2xl leading-snug font-serif border-l-4 border-slate-400 dark:border-slate-500 pl-4">
          “{show(row[spec.quoteField])}”
        </blockquote>
      {/if}
      {#if meta.length > 0}
        <div class="text-sm text-slate-500 dark:text-slate-400">{meta.join(", ")}</div>
      {/if}
      {#if links.length > 0}
        <div class="flex flex-wrap gap-3 text-sm">
          {#each links as f}
            {@const href = String(row[f])}
            <a
              class="text-blue-700 dark:text-blue-300 underline underline-offset-2"
              href={href}
              target={isExternal(href) ? "_blank" : undefined}
              rel={isExternal(href) ? "noreferrer" : undefined}>{LINK_LABELS[f] ?? label(f)}</a
            >
          {/each}
        </div>
      {/if}
      {#each spec.sections ?? [] as f}
        {#if show(row[f]) != null}
          <div class="flex flex-col gap-1">
            <div class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label(f)}</div>
            <div class="whitespace-pre-wrap leading-relaxed">{show(row[f])}</div>
          </div>
        {/if}
      {/each}
      {#if similar.length > 0}
        <div class="flex flex-col gap-1">
          <div class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Similar Ideas</div>
          {#each similar as item (item.id)}
            <button
              class="text-left flex gap-2 rounded px-1 -mx-1 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Show this idea"
              onclick={() => context.highlight.set([item.id])}
            >
              <span class="tabular-nums text-xs text-slate-500 dark:text-slate-400 pt-0.5">{item.score.toFixed(2)}</span>
              <span class="flex-1 flex flex-col leading-snug">
                <span>{item.text}</span>
                {#if item.meta != null}
                  <span class="text-sm text-slate-500 dark:text-slate-400">{item.meta}</span>
                {/if}
              </span>
            </button>
          {/each}
        </div>
      {/if}
      {#if show(row[spec.bodyField]) != null}
        <div class="border-t border-slate-300 dark:border-slate-600 pt-3 whitespace-pre-wrap leading-relaxed">
          {show(row[spec.bodyField])}
        </div>
      {/if}
    </div>
  {/if}
</Container>
