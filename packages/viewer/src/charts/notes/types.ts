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
