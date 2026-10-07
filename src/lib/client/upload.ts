"use client";
import { unzipSync } from "fflate";
import { MAX_FILES, MAX_FILE_BYTES, MAX_TOTAL_BYTES, classifyPath, cleanPath, formatBytes } from "@/lib/shared";

export type Item = { path: string; data: Uint8Array };
export type Hashed = Item & { hash: string };

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function fromFile(file: File, path: string): Promise<Item> {
  return { path, data: new Uint8Array(await file.arrayBuffer()) };
}

export async function itemsFromInput(list: FileList | File[]): Promise<Item[]> {
  const files = Array.from(list);
  if (files.length === 1 && /\.zip$/i.test(files[0].name)) return itemsFromZip(files[0]);
  return Promise.all(files.map((f) => fromFile(f, (f as any).webkitRelativePath || f.name)));
}

export async function itemsFromZip(file: File): Promise<Item[]> {
  const out = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter: (f) => !f.name.endsWith("/") && classifyPath(f.name) !== "skip",
  });
  return Object.entries(out).map(([path, data]) => ({ path, data }));
}

function readEntries(reader: any): Promise<any[]> {
  return new Promise((res, rej) => reader.readEntries(res, rej));
}
async function walk(entry: any, prefix: string, out: Promise<Item>[]) {
  if (classifyPath(prefix + entry.name) === "skip" && entry.isDirectory) return; // don't descend into .git / node_modules
  if (entry.isFile) {
    out.push(new Promise<Item>((res, rej) => entry.file((f: File) => fromFile(f, prefix + entry.name).then(res, rej), rej)));
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    for (let batch = await readEntries(reader); batch.length; batch = await readEntries(reader)) {
      for (const child of batch) await walk(child, `${prefix}${entry.name}/`, out);
    }
  }
}
export async function itemsFromDrop(dt: DataTransfer): Promise<Item[]> {
  const entries = Array.from(dt.items || []).map((i) => (i as any).webkitGetAsEntry?.()).filter(Boolean);
  if (!entries.length) return itemsFromInput(dt.files);
  if (entries.length === 1 && entries[0].isFile && /\.zip$/i.test(entries[0].name)) return itemsFromInput(dt.files);
  const out: Promise<Item>[] = [];
  for (const e of entries) await walk(e, "", out);
  return Promise.all(out);
}

export function textItem(path: string, text: string): Item {
  return { path, data: new TextEncoder().encode(text) };
}

/** Removes junk, checks limits, returns files ready to hash. Throws friendly errors. */
export function checkItems(items: Item[]): { items: Item[]; ignored: number } {
  const keep: Item[] = [];
  let ignored = 0;
  for (const it of items) {
    const path = cleanPath(it.path);
    if (classifyPath(path) === "skip") { ignored++; continue; }
    keep.push({ ...it, path });
  }
  if (!keep.length) throw new Error("No files to deploy.");
  if (keep.length > MAX_FILES) throw new Error(`Too many files (${keep.length}). The limit is ${MAX_FILES}.`);
  const total = keep.reduce((n, i) => n + i.data.length, 0);
  if (total > MAX_TOTAL_BYTES) throw new Error(`Project is ${formatBytes(total)}. The limit is ${formatBytes(MAX_TOTAL_BYTES)}.`);
  const big = keep.find((i) => i.data.length > MAX_FILE_BYTES);
  if (big) throw new Error(`${big.path} is ${formatBytes(big.data.length)}. Single files must be under ${formatBytes(MAX_FILE_BYTES)}.`);
  return { items: keep, ignored };
}

async function jsonFetch(url: string, init: RequestInit) {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

/** Hash, upload missing blobs, return manifest. */
export async function pushItems(items: Item[], onProgress?: (label: string, pct: number) => void): Promise<{ path: string; hash: string; size: number }[]> {
  onProgress?.("Hashing files…", 5);
  const hashed: Hashed[] = [];
  for (const it of items) hashed.push({ ...it, hash: await sha256Hex(it.data) });
  const unique = [...new Set(hashed.map((h) => h.hash))];
  const { res, data } = await jsonFetch("/api/blobs", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hashes: unique }),
  });
  if (!res.ok) throw new Error(data.error || "Could not reach the server.");
  const missing: string[] = data.missing;
  let done = 0;
  const queue = missing.map((hash) => hashed.find((h) => h.hash === hash)!);
  const worker = async () => {
    for (let item = queue.pop(); item; item = queue.pop()) {
      const r = await fetch(`/api/blobs/${item.hash}`, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: item.data as BufferSource });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Upload failed for ${item.path}.`);
      done++;
      onProgress?.(`Uploading ${done}/${missing.length}…`, 10 + (done / Math.max(1, missing.length)) * 75);
    }
  };
  await Promise.all(Array.from({ length: 5 }, worker));
  return hashed.map((h) => ({ path: h.path, hash: h.hash, size: h.data.length }));
}

export async function createDeploy(slug: string, body: unknown): Promise<{ ok: boolean; number?: number; error?: string }> {
  const { res, data } = await jsonFetch(`/api/projects/${slug}/deploy`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok && !data.number) throw new Error(data.error || "Deploy failed.");
  return data;
}

export async function api(url: string, method: string, body?: unknown) {
  const { res, data } = await jsonFetch(url, {
    method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok && !data.number) throw new Error(data.error || `Request failed (${res.status}).`);
  return data;
}
