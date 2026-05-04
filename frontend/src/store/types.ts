import type { StoreApi } from "zustand";

export type Setter = StoreApi<Record<string, unknown>>["setState"];
export type Getter = StoreApi<Record<string, unknown>>["getState"];
