import { execSync } from "node:child_process";

/** The current repo's `origin` remote URL, or null if not in a git repo. */
export function detectOrigin(): string | null {
  try {
    return execSync("git remote get-url origin", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return null;
  }
}
