import type { SortOrder } from "../instances/types.js";

export interface NotesSpec {
  type: "notes";
  title?: string;
  key: string;
  labelField?: string;
  endpoint?: string;
}

export interface PosterGridSpec {
  type: "poster-grid";
  title?: string;
  image: string;
  labelField?: string;
  sort?: SortOrder;
  cellWidth?: number;
  limit?: number;
}

export interface DetailSpec {
  type: "detail";
  title?: string;
  titleField?: string;
  quoteField?: string;
  bodyField: string;
  metaFields?: string[];
  sections?: string[];
  linkFields?: string[];
  /** Lists the rows nearest to the shown one by cosine similarity of a vector column. */
  similar?: { vectorField: string; textField: string; metaField?: string; limit?: number };
}
