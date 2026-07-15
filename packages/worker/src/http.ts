import type { Token } from "./types";

export interface Bindings {
  DB: D1Database;
  MASTER_KEK: string;
  ALLOW_BOOTSTRAP: string;
}

export interface Variables {
  token: Token;
}

export type AppEnv = { Bindings: Bindings; Variables: Variables };
