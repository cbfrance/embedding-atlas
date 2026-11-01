<script lang="ts">
  import { IconPin, IconPinRegular } from "../../assets/icons.js";

  let { pinned, onToggle }: { pinned: boolean; onToggle: () => void } = $props();
</script>

<button
  class="flex items-center gap-1 text-xs rounded px-1.5 py-0.5 border border-slate-300 dark:border-slate-600"
  class:!bg-slate-200={pinned}
  class:dark:!bg-slate-700={pinned}
  title={pinned ? "Unpin: follow the selected point again" : "Pin: keep showing this point"}
  onclick={onToggle}
>
  {#if pinned}
    <IconPin class="w-3.5 h-3.5" /> Pinned
  {:else}
    <IconPinRegular class="w-3.5 h-3.5" /> Pin
  {/if}
</button>
