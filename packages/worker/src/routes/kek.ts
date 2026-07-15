import { Hono } from "hono";
import type { AppEnv } from "../http";
import { ensureAdmin } from "../auth";
import { loadKeyring } from "../crypto";
import { rotateKek } from "../secret-service";
import { writeAudit } from "../store/audit";

export const kek = new Hono<AppEnv>();

/**
 * Re-wrap all DEKs to the active KEK version. Run after setting a new
 * MASTER_KEK (with the old key kept as MASTER_KEK_V<old> and KEK_VERSION bumped).
 * Once this returns with 0 stragglers, the retired key can be removed.
 */
kek.post("/rotate", async (c) => {
  ensureAdmin(c.get("token"));
  const keyring = await loadKeyring(c.env);
  const rotated = await rotateKek(c.env.DB, keyring);
  await writeAudit(c.env.DB, {
    actorTokenId: c.get("token").id,
    action: "kek.rotate",
    targetType: "kek",
    targetId: String(keyring.active),
    metadata: { rotated, activeVersion: keyring.active },
    ip: c.req.header("cf-connecting-ip") ?? null
  });
  return c.json({ ok: true, rotated, activeVersion: keyring.active });
});
