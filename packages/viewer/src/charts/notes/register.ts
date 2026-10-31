import type { Component } from "svelte";

import type { UIElement } from "../builder/builder_description.js";
import type { ChartBuilderDescription, ChartViewProps } from "../chart.js";
import Detail from "./Detail.svelte";
import Notes from "./Notes.svelte";
import PosterGrid from "./PosterGrid.svelte";
import type { DetailSpec, NotesSpec, PosterGridSpec } from "./types.js";

type Register = (type: string, component: Component<ChartViewProps<any, any>, {}, "">) => void;
type RegisterBuilder = <Spec, T extends readonly UIElement[]>(builder: ChartBuilderDescription<Spec, T>) => void;

export function registerNotesCharts(registerChartType: Register, registerChartBuilder: RegisterBuilder) {
  registerChartType("notes", Notes);
  registerChartType("poster-grid", PosterGrid);
  registerChartType("detail", Detail);

  registerChartBuilder({
    icon: "chart-content-viewer",
    description: "Create a pane that shows the last selected point in full",
    preview: false,
    ui: [
      { label: "Title", field: { key: "title" } },
      { label: "Body", field: { key: "body", required: true } },
    ] as const,
    create: ({ title, body }): DetailSpec | undefined => ({
      type: "detail",
      title: "Detail",
      titleField: title?.name,
      bodyField: body.name,
    }),
  });

  registerChartBuilder({
    icon: "chart-cards",
    description: "Create a grid of images for the filtered rows",
    preview: false,
    ui: [
      { label: "Image", field: { key: "image", required: true } },
      { label: "Label", field: { key: "label" } },
    ] as const,
    create: ({ image, label }): PosterGridSpec | undefined => ({
      type: "poster-grid",
      title: "Posters",
      image: image.name,
      labelField: label?.name,
    }),
  });

  registerChartBuilder({
    icon: "chart-content-viewer",
    description: "Create a notes editor for the last selected point",
    preview: false,
    ui: [
      { label: "Key", field: { key: "key", required: true } },
      { label: "Label", field: { key: "label" } },
    ] as const,
    create: ({ key, label }): NotesSpec | undefined => ({
      type: "notes",
      title: "Notes",
      key: key.name,
      labelField: label?.name,
    }),
  });
}
