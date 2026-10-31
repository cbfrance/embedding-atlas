// Copyright (c) 2025 Apple Inc. Licensed under MIT License.

import { derived, writable } from "svelte/store";

export type ColorScheme = "light" | "dark";

let matcher = typeof window !== "undefined" ? window.matchMedia?.("(prefers-color-scheme: dark)") : null;

let systemColorScheme = writable<ColorScheme>(matcher?.matches ? "dark" : "light");
matcher?.addEventListener("change", (event) => {
  systemColorScheme.set(event.matches ? "dark" : "light");
});

export { systemColorScheme };

const STORAGE_KEY = "embedding-atlas-color-scheme";

function storedColorScheme(): ColorScheme | null {
  let v = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
  return v == "light" || v == "dark" ? v : null;
}

export function makeColorSchemeStore() {
  let userColorScheme = writable<ColorScheme | undefined | null>(storedColorScheme());
  userColorScheme.subscribe((v) => {
    if (typeof localStorage === "undefined") return;
    if (v == "light" || v == "dark") localStorage.setItem(STORAGE_KEY, v);
  });
  let colorScheme = derived([systemColorScheme, userColorScheme], ([system, user]) => user ?? system);
  return { colorScheme, userColorScheme };
}
