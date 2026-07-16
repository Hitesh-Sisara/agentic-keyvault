import { z } from "zod";
import { HTTPException } from "hono/http-exception";
import type { Context } from "hono";

const MAX_VALUE_BYTES = 256 * 1024;

// Names may be anything printable and bounded — general secrets aren't only env vars.
const secretName = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[^\u0000-\u001f]+$/, "name must not contain control characters");

export const upsertSecretSchema = z.object({
  projectId: z.string().min(1).max(64),
  name: secretName,
  value: z.string().max(MAX_VALUE_BYTES),
  repoId: z.string().max(64).optional(),
  origin: z.string().max(500).optional(),
  isEnv: z.boolean().optional(),
  description: z.string().max(1000).optional(),
  comment: z.string().max(1000).optional()
});

export const rotateSchema = z.object({
  value: z.string().max(MAX_VALUE_BYTES),
  comment: z.string().max(1000).optional()
});

export const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional()
});

export const bindRepoSchema = z.object({
  origin: z.string().min(1).max(500)
});

export const bulkSecretsSchema = z.object({
  projectId: z.string().min(1).max(64),
  repoId: z.string().max(64).optional(),
  origin: z.string().max(500).optional(),
  items: z
    .array(
      z.object({
        name: secretName,
        value: z.string().max(MAX_VALUE_BYTES),
        isEnv: z.boolean().optional(),
        description: z.string().max(1000).optional()
      })
    )
    .min(1)
    .max(200)
});

export const exchangeSchema = z.object({
  project: z.string().max(64).optional(),
  canWrite: z.boolean().optional(),
  ttlSeconds: z.number().int().min(60).max(900).optional()
});

export const mintTokenSchema = z.object({
  name: z.string().min(1).max(100),
  scope: z.enum(["admin", "project"]).optional(),
  projectId: z.string().max(64).optional(),
  canWrite: z.boolean().optional(),
  expiresAt: z.number().int().positive().optional()
});

/** Parse and validate a JSON request body, throwing a 400 with a clear message. */
export async function parseBody<T>(c: Context, schema: z.ZodSchema<T>): Promise<T> {
  const raw = await c.req.json().catch(() => {
    throw new HTTPException(400, { message: "invalid JSON body" });
  });
  const result = schema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first?.path.join(".");
    throw new HTTPException(400, {
      message: `validation error${path ? ` at "${path}"` : ""}: ${first?.message ?? "invalid input"}`
    });
  }
  return result.data;
}
