import { q, tx } from "./db";
import { decryptValue, encryptValue, validateEnvName } from "./crypto";

export type EnvListItem = { name: string; note: string; is_public: boolean; updated_at: string; broken: boolean };
export type EnvInput = { name: string; value?: string | null; note?: string; is_public?: boolean };

const MAX_VARS = 100;
const MAX_VALUE = 16 * 1024;

type Row = { name: string; value_enc: string; note: string; is_public: boolean; updated_at: string };

function tryDecrypt(projectId: number, row: Pick<Row, "name" | "value_enc">): string | null {
  try { return decryptValue(projectId, row.name, row.value_enc); } catch { return null; }
}

/** Names, notes and flags only. Values never leave the server through this. */
export async function listEnv(projectId: number): Promise<EnvListItem[]> {
  const rows = await q<Row>("SELECT name, value_enc, note, is_public, updated_at FROM nuke_env_vars WHERE project_id=$1 ORDER BY name", [projectId]);
  return rows.map((r) => ({ name: r.name, note: r.note, is_public: r.is_public, updated_at: r.updated_at, broken: tryDecrypt(projectId, r) === null }));
}

export async function revealEnv(projectId: number, name: string): Promise<string | null> {
  const row = (await q<Row>("SELECT name, value_enc FROM nuke_env_vars WHERE project_id=$1 AND name=$2", [projectId, name]))[0];
  return row ? tryDecrypt(projectId, row) : null;
}

/** All variables, decrypted. Used only by the function runtime. */
export async function allEnv(projectId: number): Promise<Record<string, string>> {
  const rows = await q<Row>("SELECT name, value_enc FROM nuke_env_vars WHERE project_id=$1", [projectId]);
  const out: Record<string, string> = {};
  for (const r of rows) { const v = tryDecrypt(projectId, r); if (v !== null) out[r.name] = v; }
  return out;
}

/** Only the variables marked public. These end up in the page as window.NUKE_ENV. */
export async function publicEnv(projectId: number): Promise<Record<string, string>> {
  const rows = await q<Row>("SELECT name, value_enc FROM nuke_env_vars WHERE project_id=$1 AND is_public", [projectId]);
  const out: Record<string, string> = {};
  for (const r of rows) { const v = tryDecrypt(projectId, r); if (v !== null) out[r.name] = v; }
  return out;
}

export async function privateEnvNames(projectId: number): Promise<string[]> {
  return (await q<{ name: string }>("SELECT name FROM nuke_env_vars WHERE project_id=$1 AND NOT is_public ORDER BY name", [projectId])).map((r) => r.name);
}

export function parseEnvInput(input: unknown): EnvInput[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw new Error("Environment variables must be a list.");
  if (input.length > MAX_VARS) throw new Error(`A project can have up to ${MAX_VARS} environment variables.`);
  const seen = new Set<string>();
  const out: EnvInput[] = [];
  for (const item of input) {
    const rawName = typeof item?.name === "string" ? item.name.trim() : "";
    const value = typeof item?.value === "string" ? item.value : null;
    if (!rawName && !value) continue; // blank row
    const name = validateEnvName(rawName);
    if (seen.has(name)) throw new Error(`${name} is listed twice.`);
    seen.add(name);
    if (value !== null && Buffer.byteLength(value) > MAX_VALUE) throw new Error(`${name} is too large (16 KB max).`);
    const note = typeof item?.note === "string" ? item.note.trim().slice(0, 200) : "";
    out.push({ name, value, note, is_public: item?.is_public === true });
  }
  return out;
}

/**
 * Replaces the project's variables with the given list.
 * value = null/undefined keeps the stored value (the browser never has it).
 */
export async function saveEnv(projectId: number, rows: EnvInput[]): Promise<{ publicChanged: boolean }> {
  const before = await publicEnv(projectId);
  await tx(async (c) => {
    const existing = new Map<string, Row>(
      (await c.query("SELECT name, value_enc, note, is_public, updated_at FROM nuke_env_vars WHERE project_id=$1", [projectId])).rows.map((r: Row) => [r.name, r]),
    );
    for (const r of rows) {
      const prev = existing.get(r.name);
      if (r.value === null || r.value === undefined) {
        if (!prev) throw new Error(`Enter a value for ${r.name}.`);
        await c.query("UPDATE nuke_env_vars SET note=$3, is_public=$4, updated_at=NOW() WHERE project_id=$1 AND name=$2", [projectId, r.name, r.note ?? "", !!r.is_public]);
      } else {
        await c.query(
          `INSERT INTO nuke_env_vars (project_id, name, value_enc, note, is_public) VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (project_id, name) DO UPDATE SET value_enc=EXCLUDED.value_enc, note=EXCLUDED.note, is_public=EXCLUDED.is_public, updated_at=NOW()`,
          [projectId, r.name, encryptValue(projectId, r.name, r.value), r.note ?? "", !!r.is_public],
        );
      }
    }
    await c.query("DELETE FROM nuke_env_vars WHERE project_id=$1 AND NOT (name = ANY($2::text[]))", [projectId, rows.map((r) => r.name)]);
  });
  const after = await publicEnv(projectId);
  const key = (o: Record<string, string>) => JSON.stringify(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  return { publicChanged: key(before) !== key(after) };
}
