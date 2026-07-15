import pc from "picocolors";
import { ApiError } from "@agentic-keyvault/shared";

export function ok(msg: string): void {
  console.log(`${pc.green("✓")} ${msg}`);
}

export function info(msg: string): void {
  console.log(msg);
}

export function warn(msg: string): void {
  console.error(pc.yellow(msg));
}

export function fail(err: unknown): never {
  if (err instanceof ApiError) {
    console.error(pc.red(`✗ API error ${err.status}: ${err.message}`));
  } else if (err instanceof Error) {
    console.error(pc.red(`✗ ${err.message}`));
  } else {
    console.error(pc.red(`✗ ${String(err)}`));
  }
  process.exit(1);
}

/** Minimal fixed-width table for scannable CLI output. */
export function table(rows: Record<string, string>[], columns: string[]): void {
  if (rows.length === 0) {
    console.log(pc.dim("(none)"));
    return;
  }
  const widths = columns.map((col) =>
    Math.max(col.length, ...rows.map((r) => (r[col] ?? "").length))
  );
  const header = columns.map((c, i) => pc.bold(c.padEnd(widths[i]!))).join("  ");
  console.log(header);
  for (const row of rows) {
    console.log(columns.map((c, i) => (row[c] ?? "").padEnd(widths[i]!)).join("  "));
  }
}

export function fmtDate(ms: number): string {
  return new Date(ms).toISOString().replace("T", " ").slice(0, 19);
}
