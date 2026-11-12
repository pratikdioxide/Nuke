"use client";
import { FILE_EXT, FILE_NAME, FOLDER_NAME, FOLDER_OPEN, ICON_BASE } from "@/components/fileIconMap";

// Real VS Code icons: the Material Icon Theme, picked by file name, then extension (longest match first), then a default.

// Own-property lookup, so names like "constructor" or "__proto__" never hit Object.prototype.
const own = (map: Record<string, string>, key: string): string | undefined =>
  Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;

export function fileIconName(name: string): string {
  const n = name.toLowerCase();
  const byName = own(FILE_NAME, n);
  if (byName) return byName;
  if (n.startsWith(".env")) return "tune"; // .env.anything
  // "app.test.js" tries "test.js", then "js"
  for (let i = n.indexOf("."); i >= 0; i = n.indexOf(".", i + 1)) {
    const hit = own(FILE_EXT, n.slice(i + 1));
    if (hit) return hit;
  }
  return "file";
}

export function folderIconName(name: string, open?: boolean): string {
  const icon = own(FOLDER_NAME, name.toLowerCase()) ?? "folder";
  return open ? own(FOLDER_OPEN, icon) ?? `${icon}-open` : icon;
}

function Icon({ icon, fallback, size }: { icon: string; fallback: string; size: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`${ICON_BASE}${icon}.svg`}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
      decoding="async"
      style={{ flex: "none", display: "block" }}
      onError={(e) => {
        const el = e.currentTarget;
        if (el.dataset.fallback) return;
        el.dataset.fallback = "1";
        el.src = `${ICON_BASE}${fallback}.svg`;
      }}
    />
  );
}

export function FileIcon({ name, size = 16 }: { name: string; size?: number }) {
  return <Icon icon={fileIconName(name)} fallback="file" size={size} />;
}

export function FolderIcon({ name, open, size = 16 }: { name: string; open?: boolean; size?: number }) {
  return <Icon icon={folderIconName(name, open)} fallback={open ? "folder-open" : "folder"} size={size} />;
}