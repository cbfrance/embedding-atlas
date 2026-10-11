<script lang="ts">
  import * as SQL from "@uwdata/mosaic-sql";

  import Input from "../../widgets/Input.svelte";
  import SegmentedControl from "../../widgets/SegmentedControl.svelte";
  import Container from "../common/Container.svelte";

  import type { ChartViewProps, RowID } from "../chart.js";
  import { DEFAULT_NOTES_ENDPOINT, hasNoteColumns, noteFromRow, saveNote, type Note } from "./notes_api.js";
  import type { NotesSpec } from "./types.js";

  let { context, width, height, spec }: ChartViewProps<NotesSpec, {}> = $props();

  interface Row {
    id: RowID;
    key: string;
    label: string | null;
    note: Note;
  }

  // svelte-ignore state_referenced_locally
  let available = hasNoteColumns(context);

  let row = $state.raw<Row | null>(null);
  let labelsText = $state("");
  let commentText = $state("");
  let saving = $state(false);
  let error = $state<string | null>(null);

  async function load(id: RowID) {
    let select: Record<string, any> = {
      key: SQL.column(spec.key),
      starred: SQL.column("starred"),
      status: SQL.column("status"),
      comment: SQL.column("comment"),
      labels: SQL.column("labels"),
    };
    if (spec.labelField != null) {
      select.label = SQL.column(spec.labelField);
    }
    let r = await context.coordinator.query(
      SQL.Query.from(context.table)
        .select(select)
        .where(SQL.eq(SQL.column(context.id), SQL.literal(id))),
    );
    let item = r.get(0);
    if (item == null) {
      row = null;
      return;
    }
    let note = noteFromRow(item);
    row = { id, key: String(item.key), label: item.label ?? null, note };
    labelsText = note.labels.join(", ");
    commentText = note.comment ?? "";
    error = null;
  }

  $effect.pre(() =>
    context.highlight.subscribe((ids) => {
      let id = ids != null && ids.length > 0 ? ids[ids.length - 1] : null;
      if (id == null || !available) {
        return;
      }
      load(id).catch((e) => {
        error = String(e);
      });
    }),
  );

  let queue: Promise<void> = Promise.resolve();

  function update(patch: Partial<Note>) {
    if (row == null) {
      return;
    }
    let target = row;
    queue = queue.then(async () => {
      let base = row != null && row.key == target.key ? row : target;
      saving = true;
      try {
        let saved = await saveNote(
          context,
          { endpoint: spec.endpoint ?? DEFAULT_NOTES_ENDPOINT, key: base.key },
          { ...base.note, ...patch },
        );
        if (row != null && row.key == base.key) {
          row = { ...row, note: saved };
        }
        error = null;
      } catch (e) {
        error = String(e);
      } finally {
        saving = false;
      }
    });
  }

  function commitLabels() {
    if (row == null) {
      return;
    }
    let labels = labelsText
      .split(",")
      .map((x) => x.trim())
      .filter((x) => x != "");
    if (labels.join(",") != row.note.labels.join(",")) {
      update({ labels });
    }
  }

  function commitComment() {
    if (row == null) {
      return;
    }
    let comment = commentText.trim() == "" ? null : commentText;
    if (comment != row.note.comment) {
      update({ comment });
    }
  }
</script>

<Container width={width} height={height} scrollY={true}>
  {#if !available}
    <div class="text-slate-500 dark:text-slate-400">
      Notes need the starred, status, comment and labels columns. Start the server with --notes and --notes-key.
    </div>
  {:else if row == null}
    <div class="text-slate-500 dark:text-slate-400">Select a point to add notes.</div>
  {:else}
    {@const note = row.note}
    <div class="flex flex-col gap-2">
      {#if row.label != null}
        <div class="font-medium truncate" title={row.label}>{row.label}</div>
      {/if}
      <div class="flex items-center gap-2">
        <button
          class="rounded-md px-2 h-[28px] border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 select-none
            {note.starred ? 'text-amber-500' : 'text-slate-400 dark:text-slate-500'}"
          title={note.starred ? "Unstar" : "Star"}
          onclick={() => update({ starred: !note.starred })}
        >
          {note.starred ? "★ Starred" : "☆ Star"}
        </button>
        <SegmentedControl
          value={note.status ?? ""}
          options={[
            { value: "", label: "None" },
            { value: "watched", label: "Watched" },
            { value: "skip", label: "Skip" },
          ]}
          onChange={(v) => update({ status: v == "" ? null : (v as Note["status"]) })}
        />
        {#if saving}
          <span class="text-slate-400 text-sm">Saving</span>
        {/if}
      </div>
      <label class="flex flex-col gap-1 text-sm text-slate-500 dark:text-slate-400">
        Labels
        <Input
          bind:value={labelsText}
          placeholder="Comma-separated, e.g. weekend, with kids"
          className="text-slate-900 dark:text-slate-100"
          onEnter={commitLabels}
          onBlur={commitLabels}
        />
      </label>
      <label class="flex flex-col gap-1 text-sm text-slate-500 dark:text-slate-400">
        Comment
        <textarea
          class="form-textarea block w-full h-24 rounded-md text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600"
          bind:value={commentText}
          onblur={commitComment}
        ></textarea>
      </label>
      {#if error != null}
        <div class="text-red-600 text-sm">{error}</div>
      {/if}
    </div>
  {/if}
</Container>
