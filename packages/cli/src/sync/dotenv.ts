import { writeFileSync } from "node:fs";
import type { KeyValue } from "./collect";

function quote(value: string): string {
  return /[\s"'#=]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

/** Write secrets to a local .env file (0600). */
export function syncDotenv(secrets: KeyValue[], out: string): void {
  const body = secrets.map((s) => `${s.name}=${quote(s.value)}`).join("\n");
  writeFileSync(out, body + (secrets.length ? "\n" : ""), { mode: 0o600 });
}
