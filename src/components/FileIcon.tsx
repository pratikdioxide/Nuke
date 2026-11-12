import type { ReactNode } from "react";

// VS Code style file and folder icons, drawn as small inline SVGs (no packages, no images).
// The icon is picked from the exact file name first, then from special patterns, then from the extension.

type Spec = { c: string; g?: string };

const DEFAULT: Spec = { c: "#90a4ae" };
const EXT: Record<string, Spec> = {};
const add = (exts: string, c: string, g?: string) => exts.split(" ").forEach((e) => { EXT[e] = { c, g }; });

// web
add("html htm xhtml", "#e44d26", "angle");
add("css", "#42a5f5", "hash");
add("scss sass", "#f06292", "hash");
add("less", "#5c7cfa", "hash");
add("styl stylus", "#66bb6a", "hash");
add("js mjs cjs", "#f0db4f", "label:JS");
add("ts mts cts", "#3178c6", "label:TS");
add("jsx tsx", "#26c6da", "react");
add("vue", "#41b883", "label:V");
add("svelte", "#ff3e00", "label:S");
add("astro", "#ff5d01", "label:A");
add("ejs hbs handlebars pug jade njk liquid twig mustache", "#ffa726", "angle");
add("wasm", "#654ff0", "label:WA");
add("graphql gql", "#e535ab", "label:GQL");
// data and config
add("json jsonc json5 webmanifest geojson", "#cbcb41", "braces");
add("yaml yml", "#ef5350", "label:YML");
add("toml", "#bf6a3b", "label:TOML");
add("ini cfg conf config properties editorconfig", "#78909c", "sliders");
add("xml xsl xsd plist", "#ff7043", "label:XML");
add("svg", "#ffb13b", "label:SVG");
add("csv tsv", "#7cb342", "table");
add("xls xlsx ods", "#43a047", "table");
add("sql", "#e38c00", "label:SQL");
add("db sqlite sqlite3 mdb", "#ffca28", "db");
add("proto", "#78909c", "label:PB");
add("env", "#fdd835", "key");
add("pem key crt cer pub p12 pfx", "#fdd835", "key");
add("lock", "#78909c", "lock");
// docs
add("md mdx markdown", "#42a5f5", "label:MD");
add("rst adoc", "#42a5f5", "lines");
add("txt text log out", "#9e9e9e", "lines");
add("tex bib", "#26a69a", "label:TEX");
add("pdf", "#f44336", "label:PDF");
add("doc docx rtf odt pages", "#1e88e5", "label:DOC");
add("ppt pptx odp key-presentation", "#e64a19", "label:PPT");
// media
add("png jpg jpeg gif webp avif bmp ico tif tiff heic heif jfif apng psd ai fig sketch xcf", "#a074c4", "image");
add("mp3 wav ogg flac m4a aac opus wma aiff mid midi", "#e91e63", "audio");
add("mp4 webm mov mkv avi m4v wmv flv ogv", "#ff9800", "video");
add("woff woff2 ttf otf eot", "#ef5350", "label:Aa");
add("zip rar 7z tar gz tgz bz2 xz zst jar war apk ipa dmg iso", "#f9a825", "zip");
add("bin exe dll so dylib o a obj class pyc", "#78909c", "label:BIN");
// languages
add("py pyw pyi", "#4b8bbe", "label:PY");
add("ipynb", "#f37726", "label:NB");
add("java", "#e76f00", "label:JV");
add("kt kts", "#a97bff", "label:KT");
add("scala sc", "#dc322f", "label:SC");
add("groovy gradle", "#5382a1", "label:GR");
add("c h", "#5c6bc0", "label:C");
add("cpp cc cxx hpp hh hxx", "#4f8ed8", "label:C++");
add("cs csx", "#9c5fc7", "label:C#");
add("go", "#00add8", "label:GO");
add("rs", "#dea584", "label:RS");
add("rb erb gemspec rake", "#e53935", "label:RB");
add("php phtml", "#8f93d6", "label:PHP");
add("swift", "#fa7343", "label:SW");
add("dart", "#00b4ab", "label:DT");
add("lua", "#5c6bc0", "label:LUA");
add("r rmd", "#276dc3", "label:R");
add("pl pm", "#6a8fc5", "label:PL");
add("hs lhs", "#8e6bb5", "label:HS");
add("ex exs eex heex", "#7e57c2", "label:EX");
add("erl hrl", "#b83998", "label:ERL");
add("clj cljs cljc edn", "#63b132", "label:CLJ");
add("zig", "#f7a41d", "label:ZIG");
add("nim", "#ffe953", "label:NIM");
add("sol", "#9e9e9e", "label:SOL");
add("tf tfvars hcl", "#7e57c2", "label:TF");
add("sh bash zsh fish ksh", "#7cb342", "term");
add("bat cmd ps1 psm1", "#4caf50", "term");

const NAMES: Record<string, Spec> = {
  "package.json": { c: "#8bc34a", g: "npm" },
  "package-lock.json": { c: "#78909c", g: "lock" },
  "yarn.lock": { c: "#78909c", g: "lock" },
  "pnpm-lock.yaml": { c: "#78909c", g: "lock" },
  "bun.lockb": { c: "#78909c", g: "lock" },
  "composer.lock": { c: "#78909c", g: "lock" },
  "cargo.lock": { c: "#78909c", g: "lock" },
  "gemfile.lock": { c: "#78909c", g: "lock" },
  "poetry.lock": { c: "#78909c", g: "lock" },
  "tsconfig.json": { c: "#3178c6", g: "sliders" },
  "jsconfig.json": { c: "#f0db4f", g: "sliders" },
  "readme": { c: "#42a5f5", g: "info" },
  "readme.md": { c: "#42a5f5", g: "info" },
  "readme.txt": { c: "#42a5f5", g: "info" },
  "license": { c: "#fdd835", g: "lines" },
  "licence": { c: "#fdd835", g: "lines" },
  "license.md": { c: "#fdd835", g: "lines" },
  "license.txt": { c: "#fdd835", g: "lines" },
  "changelog.md": { c: "#26a69a", g: "lines" },
  "robots.txt": { c: "#78909c", g: "lines" },
  ".gitignore": { c: "#f4511e", g: "git" },
  ".gitattributes": { c: "#f4511e", g: "git" },
  ".gitmodules": { c: "#f4511e", g: "git" },
  ".gitkeep": { c: "#f4511e", g: "git" },
  ".npmrc": { c: "#cb3837", g: "sliders" },
  ".nvmrc": { c: "#8bc34a", g: "sliders" },
  ".replit": { c: "#f26207", g: "label:RP" },
  "replit.nix": { c: "#f26207", g: "label:RP" },
  "dockerfile": { c: "#0db7ed", g: "docker" },
  ".dockerignore": { c: "#0db7ed", g: "docker" },
  "docker-compose.yml": { c: "#0db7ed", g: "docker" },
  "docker-compose.yaml": { c: "#0db7ed", g: "docker" },
  "compose.yml": { c: "#0db7ed", g: "docker" },
  "compose.yaml": { c: "#0db7ed", g: "docker" },
  "makefile": { c: "#78909c", g: "label:MK" },
  "procfile": { c: "#78909c", g: "sliders" },
  "vercel.json": { c: "#e0e0e0", g: "tri" },
  "netlify.toml": { c: "#00c7b7", g: "label:NT" },
  "favicon.ico": { c: "#a074c4", g: "image" },
};

const PATTERNS: [RegExp, Spec][] = [
  [/^\.env(\.|$)/, { c: "#fdd835", g: "key" }],
  [/^vite\.config\./, { c: "#bd34fe", g: "bolt" }],
  [/^vitest\.config\./, { c: "#fcc72b", g: "bolt" }],
  [/^tailwind\.config\./, { c: "#38bdf8", g: "label:TW" }],
  [/^next\.config\./, { c: "#e0e0e0", g: "label:N" }],
  [/^nuxt\.config\./, { c: "#00dc82", g: "label:NX" }],
  [/^svelte\.config\./, { c: "#ff3e00", g: "label:S" }],
  [/^astro\.config\./, { c: "#ff5d01", g: "label:A" }],
  [/^webpack\.config\./, { c: "#8dd6f9", g: "label:WP" }],
  [/^rollup\.config\./, { c: "#ff3333", g: "label:RU" }],
  [/^jest\.config\./, { c: "#c21325", g: "label:JE" }],
  [/^postcss\.config\./, { c: "#dd3a0a", g: "label:PC" }],
  [/^(\.?eslintrc|eslint\.config)/, { c: "#8080f2", g: "label:ES" }],
  [/^(\.?prettierrc|prettier\.config)/, { c: "#56b3b4", g: "label:PR" }],
  [/^(\.babelrc|babel\.config\.)/, { c: "#f5da55", g: "label:BB" }],
  [/^\.?(stylelintrc|browserslistrc|editorconfig)/, { c: "#78909c", g: "sliders" }],
  [/^dockerfile\./, { c: "#0db7ed", g: "docker" }],
  [/^docker-compose\./, { c: "#0db7ed", g: "docker" }],
  [/^readme\./, { c: "#42a5f5", g: "info" }],
  [/^licen[sc]e[.-]/, { c: "#fdd835", g: "lines" }],
  [/\.d\.ts$/, { c: "#3178c6", g: "label:d.ts" }],
  [/\.(config|conf|rc)$/, { c: "#78909c", g: "sliders" }],
];

function specFor(name: string): Spec {
  const n = name.toLowerCase();
  if (NAMES[n]) return NAMES[n];
  for (const [re, spec] of PATTERNS) if (re.test(n)) return spec;
  const dot = n.lastIndexOf(".");
  return (dot > 0 ? EXT[n.slice(dot + 1)] : undefined) ?? DEFAULT;
}

function glyph(g: string, c: string): ReactNode {
  if (g.startsWith("label:")) {
    const t = g.slice(6);
    const fs = t.length <= 1 ? 9 : t.length === 2 ? 7.2 : t.length === 3 ? 5.8 : 4.8;
    return <text x="12" y="17.4" textAnchor="middle" fontSize={fs} fontWeight={800} fill={c} stroke="none" style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" }}>{t}</text>;
  }
  switch (g) {
    case "braces": return <><path d="M10.5 10.5c-1.2 0-1.5.6-1.5 1.5v1c0 .8-.5 1.2-1.2 1.5.7.3 1.2.7 1.2 1.5v1c0 .9.3 1.5 1.5 1.5" /><path d="M13.5 10.5c1.2 0 1.5.6 1.5 1.5v1c0 .8.5 1.2 1.2 1.5-.7.3-1.2.7-1.2 1.5v1c0 .9-.3 1.5-1.5 1.5" /></>;
    case "angle": return <><path d="m10.5 11.5-3 3.5 3 3.5" /><path d="m13.5 11.5 3 3.5-3 3.5" /></>;
    case "hash": return <path d="M10.2 11l-1 8M15.2 11l-1 8M8.2 13.6h8M7.6 16.6h8" />;
    case "image": return <><circle cx="9.6" cy="12.8" r="1.2" /><path d="M7 19l3.4-4.2 2.4 2.8 2-2.4L17 19z" /></>;
    case "audio": return <><path d="M11 18v-6.5l5-1.3V16" /><circle cx="9.4" cy="18" r="1.6" /><circle cx="14.4" cy="16" r="1.6" /></>;
    case "video": return <path d="M10 11v8l6.5-4z" fill={c} />;
    case "zip": return <><path d="M12 3.5V5M12 6.5V8M12 9.5V11" /><path d="M10.6 12.5h2.8v3.4h-2.8z" fill={c} /></>;
    case "db": return <><ellipse cx="12" cy="12.6" rx="4" ry="1.5" /><path d="M8 12.6v5.2c0 .9 1.8 1.5 4 1.5s4-.6 4-1.5v-5.2" /><path d="M8 15.2c0 .9 1.8 1.5 4 1.5s4-.6 4-1.5" /></>;
    case "lock": return <><rect x="8.4" y="14.4" width="7.2" height="5" rx="1" /><path d="M10 14.4v-1.9a2 2 0 0 1 4 0v1.9" /></>;
    case "key": return <><circle cx="9.6" cy="15" r="2.1" /><path d="M11.7 15H17M15 15v2.2" /></>;
    case "sliders": return <><path d="M7.5 12.5h9M7.5 17.5h9" /><circle cx="10.5" cy="12.5" r="1.4" fill={c} /><circle cx="13.5" cy="17.5" r="1.4" fill={c} /></>;
    case "term": return <path d="m8 12 3.2 2.8L8 17.6M12.8 18.4h3.6" />;
    case "lines": return <path d="M8 12h8M8 15h8M8 18h5" />;
    case "table": return <><rect x="7.5" y="11" width="9" height="8" rx=".8" /><path d="M7.5 13.7h9M7.5 16.3h9M12 11v8" /></>;
    case "git": return <><path d="M12 10.2l4.6 4.6-4.6 4.6-4.6-4.6z" /><circle cx="12" cy="13.2" r=".9" fill={c} /><circle cx="12" cy="16.6" r=".9" fill={c} /><path d="M12 14v1.8" /></>;
    case "npm": return <path d="M12 10.2l3.9 2.2v4.4L12 19l-3.9-2.2v-4.4z" fill={c} fillOpacity=".35" />;
    case "docker": return <><path d="M8 14.6h1.9v1.9H8zM10.3 14.6h1.9v1.9h-1.9zM12.6 14.6h1.9v1.9h-1.9zM10.3 12.4h1.9v1.9h-1.9z" fill={c} strokeWidth="0" /><path d="M7 17.6c.8 1.6 3 2 5.6 1.8 2.2-.2 3.6-1.4 4.2-3.1" /></>;
    case "react": return <g strokeWidth="1.1"><ellipse cx="12" cy="15" rx="4.8" ry="1.9" /><ellipse cx="12" cy="15" rx="4.8" ry="1.9" transform="rotate(60 12 15)" /><ellipse cx="12" cy="15" rx="4.8" ry="1.9" transform="rotate(120 12 15)" /><circle cx="12" cy="15" r=".9" fill={c} /></g>;
    case "bolt": return <path d="M13.4 10l-4 5.6h2.8L11 20l4.4-6h-3z" fill={c} />;
    case "info": return <><circle cx="12" cy="15" r="4.2" /><path d="M12 14.4v3.2M12 12.5h.01" /></>;
    case "tri": return <path d="M12 11l5 8.5H7z" fill={c} />;
    default: return null;
  }
}

export function FileIcon({ name, size = 16 }: { name: string; size?: number }) {
  const { c, g } = specFor(name);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none" }}>
      <path d="M6 2h8l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill={c} fillOpacity=".16" />
      <path d="M14 2v5h5" />
      {g && glyph(g, c)}
    </svg>
  );
}

const FOLDERS: Record<string, string> = {};
const folder = (names: string, c: string) => names.split(" ").forEach((n) => { FOLDERS[n] = c; });
folder("api server functions backend middleware routes controllers", "#66bb6a");
folder("src source app", "#26a69a");
folder("components component ui widgets", "#ffa726");
folder("pages views layouts templates screens", "#ef6c00");
folder("lib libs utils util helpers hooks services", "#29b6f6");
folder("css styles style scss sass themes", "#42a5f5");
folder("js scripts script javascript", "#fdd835");
folder("ts typescript types typings", "#3178c6");
folder("images image img icons icon photos pictures", "#ab47bc");
folder("assets media static resources", "#ffb74d");
folder("public www web site", "#26c6da");
folder("fonts font", "#ef5350");
folder("data db database migrations seeds models schema", "#ffca28");
folder("test tests __tests__ spec specs e2e cypress", "#7cb342");
folder("docs doc documentation", "#42a5f5");
folder("config configs configuration settings .config", "#78909c");
folder("node_modules", "#8bc34a");
folder("dist build out .next .nuxt .output release target bin", "#ff7043");
folder(".git .github .gitlab", "#f4511e");
folder(".vscode .idea .vercel .husky", "#42a5f5");
folder("audio sounds music video videos", "#e91e63");
folder("locales i18n lang languages translations", "#26a69a");
folder("vendor vendors third-party packages", "#9e9e9e");
folder("tmp temp cache logs log", "#9e9e9e");

export function FolderIcon({ name, open, size = 16 }: { name: string; open?: boolean; size?: number }) {
  const c = FOLDERS[name.toLowerCase()] ?? "#90a4ae";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none" }}>
      {open ? (
        <>
          <path d="M3 17.5V7a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v1.5" />
          <path d="M3 18.5l2.4-8h16.1l-2.4 8z" fill={c} fillOpacity=".3" />
        </>
      ) : (
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill={c} fillOpacity=".22" />
      )}
    </svg>
  );
}