import type { Token } from "./types";

export interface Bindings {
  DB: D1Database;
  /** Active 256-bit KEK, base64 (Worker secret). */
  MASTER_KEK: string;
  /** HMAC pepper for token hashing (Worker secret). */
  TOKEN_PEPPER: string;
  /** Active KEK version number (var, default "1"). */
  KEK_VERSION?: string;
  /** "true" enables the one-time bootstrap endpoint. */
  ALLOW_BOOTSTRAP: string;
  /** Retired KEKs for rotation appear as MASTER_KEK_V1, MASTER_KEK_V2, ... */
  [key: string]: string | D1Database | undefined;
}

export interface Variables {
  token: Token;
}

export type AppEnv = { Bindings: Bindings; Variables: Variables };
