<script lang="ts">
  import * as SQL from "@uwdata/mosaic-sql";

  import Container from "../common/Container.svelte";

  import type { ChartViewProps, RowID } from "../chart.js";
  import type { DetailSpec } from "./types.js";

  let { context, width, height, spec }: ChartViewProps<DetailSpec, {}> = $props();

  const LINK_LABELS: Record<string, string> = { zed: "Open in Zed", obsidian: "Open in Obsidian", url: "Open Link" };

  let row = $state.raw<Record<string, any> | null>(null);
  let error = $state<string | null>(null);

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
    error = null;
  }

  $effect.pre(() =>
    context.highlight.subscribe((ids) => {
      let id = ids != null && ids.length > 0 ? ids[ids.length - 1] : null;
      if (id == null) {
        return;
      }
      load(id).catch((e) => {
        error = String(e);
      });
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
      {#if spec.titleField != null && show(row[spec.titleField]) != null}
        <div class="font-semibold leading-snug">{show(row[spec.titleField])}</div>
      {/if}
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
      {#if show(row[spec.bodyField]) != null}
        <div class="border-t border-slate-300 dark:border-slate-600 pt-3 whitespace-pre-wrap leading-relaxed">
          {show(row[spec.bodyField])}
        </div>
      {/if}
    </div>
  {/if}
</Container>
