const app = document.querySelector("#app");
const MAX_SITE_BYTES = 16 * 1024 * 1024;
const MAX_SITE_FILES = 500;
const TEXT_EXTENSIONS = new Set([".html", ".htm", ".css", ".js", ".mjs", ".cjs", ".json", ".map", ".xml", ".svg", ".txt", ".md", ".csv", ".webmanifest", ".yaml", ".yml", ".toml", ".webmanifest"]);
const state = {
  projects: [],
  editing: null,
  files: {},
  rootContent: "",
  selectedPath: "index.html",
  envRows: [],
  logs: [],
  lastDeploymentLogs: [],
  busy: false,
};

const esc = (value = "") => String(value).replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[char]));
const slugify = value => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const brand = `<div class="brand"><img src="/nuke-logo.svg" alt=""><span>NUKE</span></div>`;
const api = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  let data = null;
  if (response.status !== 204) {
    try { data = await response.json(); } catch { data = null; }
  }
  if (!response.ok) throw new Error(data?.error || `Request failed (${response.status}). Please try again.`);
  return data;
};

function isTextPath(path) {
  const dot = path.lastIndexOf(".");
  return dot >= 0 && TEXT_EXTENSIONS.has(path.slice(dot).toLowerCase());
}
function cleanPath(path) {
  return String(path || "").replace(/\\/g, "/").trim();
}
function validatePath(path) {
  const normalized = cleanPath(path);
  if (!normalized || normalized.startsWith("/") || /^[a-z]:/i.test(normalized) || normalized.split("/").some(part => !part || part === "." || part === "..")) {
    throw new Error(`Invalid relative path: ${path || "(empty)"}. Use a path such as assets/site.css.`);
  }
  return normalized;
}
function encodedSize(entry) {
  if (entry.encoding === "base64") return Math.floor((entry.content || "").length * 3 / 4) - ((entry.content || "").endsWith("==") ? 2 : (entry.content || "").endsWith("=") ? 1 : 0);
  return new TextEncoder().encode(entry.content || "").byteLength;
}
function siteStats() {
  const files = Object.values(state.files);
  return {
    count: files.length + 1,
    bytes: new TextEncoder().encode(state.rootContent || "").byteLength + files.reduce((sum, item) => sum + encodedSize(item), 0),
  };
}
function formatBytes(bytes) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(0.1, bytes / 1024).toFixed(1)} KB`;
}
function recordLog(type, message) {
  state.logs.unshift({ type, message, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) });
  state.logs = state.logs.slice(0, 14);
  const list = document.querySelector("#log-list");
  if (list) list.innerHTML = renderLogs();
}
function renderLogs() {
  return renderLogEntries(state.logs);
}
function renderLogEntries(logs) {
  if (!logs.length) return `<div class="log-entry"><span class="log-time">—</span><span class="log-indicator">·</span><span>Activity will appear here.</span></div>`;
  return logs.map(item => `<div class="log-entry ${esc(item.type)}"><span class="log-time">${esc(item.time)}</span><span class="log-indicator">${item.type === "error" ? "×" : item.type === "success" ? "✓" : item.type === "pending" ? "…" : "›"}</span><span>${esc(item.message)}</span></div>`).join("");
}
function crossfade(render) {
  app.classList.add("is-changing");
  window.setTimeout(() => {
    render();
    requestAnimationFrame(() => app.classList.remove("is-changing"));
  }, 120);
}
function showLogin(message = "") {
  app.innerHTML = `<main class="login-page">
    <section class="login-panel">
      ${brand}
      <p class="eyebrow">PRIVATE STATIC HOSTING</p>
      <h1>Sign in to Nuke</h1>
      <p class="login-desc">Your small sites, files, and deployments in one quiet place.</p>
      <form id="login-form">
        <label for="password">Owner password<input id="password" name="password" type="password" autocomplete="current-password" placeholder="Enter your password" required></label>
        <p class="inline-error" id="login-error">${esc(message)}</p>
        <button class="btn btn-primary" type="submit">Continue <span aria-hidden="true">→</span></button>
      </form>
      <div class="login-foot">OWNER WORKSPACE · PRIVATE BY DEFAULT</div>
    </section>
  </main>`;
  document.querySelector("#login-form").addEventListener("submit", async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button");
    button.disabled = true;
    button.textContent = "Signing in…";
    try {
      await api("/api/auth/login", { method: "POST", body: JSON.stringify({ password: new FormData(event.currentTarget).get("password") }) });
      crossfade(() => loadDashboard());
    } catch (error) {
      const errorNode = document.querySelector("#login-error");
      if (errorNode) errorNode.textContent = error.message;
      button.disabled = false;
      button.innerHTML = `Continue <span aria-hidden="true">→</span>`;
    }
  });
}
function shell(content) {
  app.innerHTML = `<main class="shell">
    <aside class="sidebar">
      <div class="sidebar-brand">${brand}</div>
      <div class="workspace-label">Workspace</div>
      <nav aria-label="Main navigation"><div class="nav-item active"><span class="nav-glyph">⌘</span>Projects</div></nav>
      <div class="sidebar-bottom"><span class="private-dot"></span><span>Private owner workspace</span></div>
    </aside>
    <section class="main-content">${content}</section>
  </main>`;
}
function dashboardNotice(publishedUrl) {
  return publishedUrl ? `<div class="notice" role="status"><span class="notice-symbol">✓</span><div class="notice-body"><strong>Project published successfully</strong><a href="${esc(publishedUrl)}" target="_blank" rel="noopener">${esc(publishedUrl)}</a></div><button class="icon-button" type="button" id="dismiss-notice" aria-label="Dismiss">×</button></div>` : "";
}
function projectCard(project) {
  const url = `${location.origin}/${encodeURIComponent(project.slug)}/`;
  const updated = project.updated_at ? new Date(project.updated_at).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "Recently";
  return `<article class="project-row">
    <div class="project-name"><span class="project-icon">HT</span><div><strong>${esc(project.name)}</strong><small>/${esc(project.slug)}</small></div></div>
    <a class="project-url" href="/${encodeURIComponent(project.slug)}/" target="_blank" rel="noopener">${esc(url)}</a>
    <span class="project-updated">${esc(updated)}</span>
    <div class="row-actions"><a class="btn btn-subtle" href="/${encodeURIComponent(project.slug)}/" target="_blank" rel="noopener">Open</a><button class="btn" type="button" data-edit="${esc(project.id)}">Edit</button><button class="icon-button" type="button" data-delete="${esc(project.id)}" aria-label="Delete ${esc(project.name)}">×</button></div>
  </article>`;
}
function renderDashboard({ error = "", notice = "" } = {}) {
  const projects = state.projects;
  shell(`<header class="topbar">
      <div><div class="eyebrow">OWNER CONSOLE / PROJECTS</div><h1>Your sites</h1><p>Manage files and publish static HTML projects.</p></div>
      <div class="top-actions"><button class="btn btn-subtle" type="button" id="logout">Log out</button><button class="btn btn-primary" type="button" id="new-project"><span aria-hidden="true">+</span> New project</button></div>
    </header>
    ${dashboardNotice(notice)}
    ${state.lastDeploymentLogs.length ? `<section class="dashboard-log log-panel" aria-label="Latest deployment activity"><div class="log-head"><span>Latest deployment activity</span><span>COMPLETED</span></div><div class="log-list">${renderLogEntries(state.lastDeploymentLogs)}</div></section>` : ""}
    ${error ? `<div class="notice error-notice"><span class="notice-symbol">!</span><div class="notice-body"><strong>Could not load projects</strong>${esc(error)}</div><button class="btn btn-subtle" type="button" id="retry-load">Retry</button></div>` : ""}
    <section class="stats-row" aria-label="Project summary">
      <div class="stat"><strong class="stat-value">${String(projects.length).padStart(2, "0")}</strong><span class="stat-label">projects</span></div>
      <div class="stat"><strong class="stat-value">${String(projects.length).padStart(2, "0")}</strong><span class="stat-label">HTML sites</span></div>
      <div class="stat"><strong class="stat-value">16 MB</strong><span class="stat-label">per-site limit</span></div>
    </section>
    <div class="section-head"><h2>All projects</h2><span class="small-text">${projects.length} ${projects.length === 1 ? "site" : "sites"}</span></div>
    ${projects.length ? `<div class="project-list">${projects.map(projectCard).join("")}</div>` : `<section class="empty-state"><span class="empty-glyph">&lt;/&gt;</span><h3>Nothing published yet</h3><p>Create a project, add your homepage and assets, then publish it at a private Nuke URL.</p><button class="btn btn-primary" type="button" id="first-project">Create your first project</button></section>`}
  `);
  document.querySelector("#new-project")?.addEventListener("click", () => openEditor());
  document.querySelector("#first-project")?.addEventListener("click", () => openEditor());
  document.querySelector("#logout")?.addEventListener("click", async event => {
    event.currentTarget.disabled = true;
    try {
      await api("/api/auth/logout", { method: "POST" });
      crossfade(() => showLogin());
    } catch (logoutError) {
      event.currentTarget.disabled = false;
      renderDashboard({ error: logoutError.message });
    }
  });
  document.querySelector("#retry-load")?.addEventListener("click", loadDashboard);
  document.querySelector("#dismiss-notice")?.addEventListener("click", event => event.currentTarget.closest(".notice").remove());
  document.querySelectorAll("[data-edit]").forEach(button => button.addEventListener("click", () => openEditor(button.dataset.edit)));
  document.querySelectorAll("[data-delete]").forEach(button => button.addEventListener("click", () => deleteProject(button.dataset.delete)));
}
async function loadDashboard() {
  shell(`<header class="topbar"><div><div class="eyebrow">OWNER CONSOLE / PROJECTS</div><h1>Your sites</h1><p>Loading your projects…</p></div></header><div class="project-list" aria-label="Loading projects">${[1,2,3].map(() => `<div class="project-row"><span class="small-text">Loading project…</span></div>`).join("")}</div>`);
  try {
    const result = await api("/api/projects");
    state.projects = Array.isArray(result) ? result.filter(project => project.kind === "html" || !project.kind) : [];
    renderDashboard();
    return "";
  } catch (error) {
    renderDashboard({ error: error.message });
    return error.message;
  }
}
async function deleteProject(id) {
  const project = state.projects.find(item => String(item.id) === String(id));
  if (!project || !window.confirm(`Delete "${project.name}" and all of its hosted files? This cannot be undone.`)) return;
  try {
    await api(`/api/projects/${encodeURIComponent(id)}`, { method: "DELETE" });
    state.projects = state.projects.filter(item => String(item.id) !== String(id));
    renderDashboard();
  } catch (error) {
    renderDashboard({ error: error.message });
  }
}
function normalizeProjectFiles(items = []) {
  const map = {};
  for (const item of items) {
    const path = validatePath(item.path);
    if (path.toLowerCase() === "index.html") continue;
    map[path] = { path, encoding: item.encoding === "base64" ? "base64" : "utf8", content: item.content || "" };
  }
  return map;
}
function addProjectLog(message) {
  recordLog("info", message);
}
async function openEditor(projectId = null) {
  let project = null;
  if (projectId !== null) {
    try { project = await api(`/api/projects/${encodeURIComponent(projectId)}`); }
    catch (error) { renderDashboard({ error: error.message }); return; }
  }
  state.editing = project;
  state.files = normalizeProjectFiles(project?.project_files || []);
  state.rootContent = project?.content || `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>My site</title>
  </head>
  <body>
    <h1>Hello, world.</h1>
  </body>
</html>`;
  state.selectedPath = "index.html";
  const env = project?.public_env || {};
  state.envRows = Object.entries(env).map(([key, value]) => ({ key, value: String(value) }));
  state.logs = [];
  state.busy = false;
  if (project) addProjectLog(`Opened ${project.name} for editing.`);
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `<section class="modal" role="dialog" aria-modal="true" aria-labelledby="editor-heading">
    <header class="modal-header">
      <div class="modal-title"><span class="wordmark-mark">&lt;/&gt;</span><div><h2 id="editor-heading">${project ? "Edit project" : "Create project"}</h2><p>${project ? `ID ${esc(project.id)}` : "HTML static site"}</p></div></div>
      <div class="modal-head-actions"><button class="btn btn-subtle" type="button" data-close-editor>Cancel</button><button class="icon-button" type="button" aria-label="Close editor" data-close-editor>×</button></div>
    </header>
    <form id="project-form">
      <div class="editor-scroll">
        <div class="project-fields">
          <div class="field"><label for="project-name">Project name</label><input class="text-input" id="project-name" name="name" required maxlength="100" placeholder="Studio portfolio" value="${esc(project?.name || "")}"></div>
          <div class="field"><label for="project-slug">Published path</label><div class="slug-wrap"><span class="slug-prefix">/</span><input class="text-input" id="project-slug" name="slug" required maxlength="80" placeholder="studio-portfolio" value="${esc(project?.slug || "")}"></div></div>
        </div>
        <section class="file-manager drop-target" id="file-manager" aria-label="Website file manager">
          <aside class="file-sidebar">
            <div class="file-sidebar-head"><strong>Website files</strong><div class="file-actions"><button type="button" class="mini-action" data-action="add-file">+ File</button><button type="button" class="mini-action" data-action="add-folder">+ Folder</button><button type="button" class="mini-action" data-action="upload-files">Upload</button></div></div>
            <div class="file-count" id="file-count"></div>
            <div class="file-tree" id="file-tree" role="tree"></div>
            <div class="manager-hint">Drop files or folders here, or <button type="button" data-action="upload-folder">choose a folder</button>.</div>
          </aside>
          <section class="file-editor" aria-label="File contents">
            <div class="file-editor-head"><span class="file-path" id="selected-path"></span><div class="file-editor-tools"><span class="encoding-label" id="file-encoding"></span><button type="button" class="mini-action" id="remove-file" data-action="remove-file">Remove file</button></div></div>
            <textarea id="file-content" spellcheck="false" aria-label="Selected file contents"></textarea>
            <div class="binary-info" id="binary-info" hidden></div>
          </section>
          <input type="file" id="file-picker" multiple hidden>
          <input type="file" id="folder-picker" webkitdirectory directory multiple hidden>
        </section>
        <div class="manager-meta"><span>Use normal relative paths such as <code>assets/site.css</code> and <code>pages/about.html</code>.</span><strong id="site-stats"></strong></div>
        <p class="limit-error" id="form-error" role="alert"></p>
        <p class="helper-note">Uploaded files and public environment variables are public to every visitor. Never include passwords, API secrets, or private data. A root <code>index.html</code> is required before publishing.</p>
        <section class="environment">
          <div class="environment-head"><div><h3>Public environment variables</h3><p>Available to hosted pages as <code>window.NUKE_ENV</code>. These values are public.</p></div><button class="mini-action" type="button" data-action="add-env">+ Variable</button></div>
          <div id="env-list"></div>
        </section>
        <section class="log-panel" aria-label="Deployment activity">
          <div class="log-head"><span>Activity log</span><span id="activity-status">READY</span></div>
          <div class="log-list" id="log-list">${renderLogs()}</div>
        </section>
      </div>
      <footer class="modal-footer"><span class="footer-note">Up to ${MAX_SITE_FILES} files · 16 MB total</span><div class="footer-actions"><button class="btn btn-subtle" type="button" data-close-editor>Cancel</button><button class="btn btn-primary" id="publish-button" type="submit">${project ? "Save & publish" : "Create & publish"}</button></div></footer>
    </form>
  </section>`;
  app.appendChild(backdrop);
  renderFileManager();
  renderEnvironment();
  wireEditor(backdrop, project);
  document.querySelector("#project-name").focus();
}
function buildTree() {
  const root = { dirs: {}, files: [] };
  const entries = [{ path: "index.html" }, ...Object.keys(state.files).map(path => ({ path }))].sort((a, b) => a.path.localeCompare(b.path));
  for (const entry of entries) {
    const parts = entry.path.split("/");
    let node = root;
    parts.slice(0, -1).forEach(part => {
      node.dirs[part] ||= { dirs: {}, files: [] };
      node = node.dirs[part];
    });
    node.files.push(entry.path);
  }
  return root;
}
function treeHtml(node, depth = 0) {
  const dirs = Object.keys(node.dirs).sort((a, b) => a.localeCompare(b));
  const files = [...node.files].sort((a, b) => a.localeCompare(b));
  return dirs.map(name => `<div class="tree-folder-row"><div class="tree-row tree-folder" style="padding-left:${7 + depth * 7}px"><span class="tree-glyph">▾</span><span class="tree-name">${esc(name)}</span></div><div class="tree-children">${treeHtml(node.dirs[name], depth + 1)}</div></div>`).join("") +
    files.map(path => `<button type="button" class="tree-row ${state.selectedPath === path ? "selected" : ""}" data-file="${esc(path)}" role="treeitem" aria-selected="${state.selectedPath === path}" style="padding-left:${7 + depth * 7}px"><span class="tree-glyph">${path === "index.html" ? "H" : fileGlyph(path)}</span><span class="tree-name">${esc(path.split("/").pop())}</span></button>`).join("");
}
function fileGlyph(path) {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  if (["css", "scss"].includes(ext)) return "C";
  if (["js", "mjs", "ts"].includes(ext)) return "J";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "I";
  return "F";
}
function renderFileManager() {
  const tree = document.querySelector("#file-tree");
  if (!tree) return;
  tree.innerHTML = treeHtml(buildTree()) || `<div class="empty-tree">No files yet</div>`;
  const stats = siteStats();
  const count = document.querySelector("#file-count");
  const total = document.querySelector("#site-stats");
  if (count) count.textContent = `${stats.count} / ${MAX_SITE_FILES} files`;
  if (total) total.textContent = `${formatBytes(stats.bytes)} / 16 MB`;
  const pathNode = document.querySelector("#selected-path");
  const editor = document.querySelector("#file-content");
  const binaryInfo = document.querySelector("#binary-info");
  const encodingLabel = document.querySelector("#file-encoding");
  const remove = document.querySelector("#remove-file");
  const selected = state.selectedPath;
  if (pathNode) pathNode.textContent = selected;
  if (selected === "index.html") {
    if (editor) { editor.hidden = false; editor.value = state.rootContent; editor.disabled = false; }
    if (binaryInfo) binaryInfo.hidden = true;
    if (encodingLabel) encodingLabel.textContent = "UTF-8";
    if (remove) remove.disabled = true;
  } else {
    const entry = state.files[selected];
    const isText = entry && entry.encoding !== "base64";
    if (editor) {
      editor.hidden = !isText;
      editor.disabled = !isText;
      editor.value = isText ? entry.content : "";
    }
    if (binaryInfo) {
      binaryInfo.hidden = isText;
      binaryInfo.innerHTML = `<strong>Binary asset</strong>${entry ? `${esc(entry.encoding.toUpperCase())} content is retained when you publish. Upload a replacement to change this file.` : "Select a text file to edit its contents."}`;
    }
    if (encodingLabel) encodingLabel.textContent = entry?.encoding === "base64" ? "BASE64" : "UTF-8";
    if (remove) remove.disabled = !entry;
  }
}
function renderEnvironment() {
  const wrap = document.querySelector("#env-list");
  if (!wrap) return;
  wrap.innerHTML = state.envRows.length ? state.envRows.map((row, index) => `<div class="env-row"><input class="text-input" data-env-key data-env-index="${index}" aria-label="Variable key" placeholder="PUBLIC_API_URL" value="${esc(row.key)}"><input class="text-input" data-env-value data-env-index="${index}" aria-label="Variable value" placeholder="https://api.example.com" value="${esc(row.value)}"><button class="env-remove" type="button" data-action="remove-env" data-index="${index}" aria-label="Remove variable">×</button></div>`).join("") : `<p class="small-text" style="margin-top:10px">No public variables added.</p>`;
}
function syncEnvironment() {
  state.envRows = [...document.querySelectorAll(".env-row")].map(row => ({
    key: row.querySelector("[data-env-key]")?.value || "",
    value: row.querySelector("[data-env-value]")?.value || "",
  }));
}
function wireEditor(backdrop, project) {
  const form = backdrop.querySelector("#project-form");
  const nameInput = backdrop.querySelector("#project-name");
  const slugInput = backdrop.querySelector("#project-slug");
  nameInput.addEventListener("input", () => { if (!project) slugInput.value = slugify(nameInput.value); });
  backdrop.querySelectorAll("[data-close-editor]").forEach(button => button.addEventListener("click", closeEditor));
  backdrop.addEventListener("click", event => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (!action) {
      const fileButton = event.target.closest("[data-file]");
      if (fileButton) { syncCurrentFile(); state.selectedPath = fileButton.dataset.file; renderFileManager(); }
      return;
    }
    if (action === "add-file") addNewFile();
    if (action === "add-folder") addNewFolder();
    if (action === "upload-files") backdrop.querySelector("#file-picker").click();
    if (action === "upload-folder") backdrop.querySelector("#folder-picker").click();
    if (action === "remove-file") removeSelectedFile();
    if (action === "add-env") { syncEnvironment(); state.envRows.push({ key: "", value: "" }); renderEnvironment(); backdrop.querySelector("[data-env-key]:last-of-type")?.focus(); }
    if (action === "remove-env") { syncEnvironment(); state.envRows.splice(Number(event.target.closest("[data-index]").dataset.index), 1); renderEnvironment(); }
  });
  backdrop.addEventListener("input", event => {
    if (event.target.id === "file-content") syncCurrentFile(event.target.value);
    if (event.target.matches("[data-env-key], [data-env-value]")) {
      const index = Number(event.target.dataset.envIndex);
      const row = state.envRows[index];
      if (row) row[event.target.hasAttribute("data-env-key") ? "key" : "value"] = event.target.value;
    }
  });
  backdrop.addEventListener("change", async event => {
    if (!["file-picker", "folder-picker"].includes(event.target.id) || !event.target.files?.length) return;
    try {
      await queueFiles([...event.target.files]);
      event.target.value = "";
    } catch (error) { showEditorError(error.message); }
  });
  const dropZone = backdrop.querySelector("#file-manager");
  ["dragenter", "dragover"].forEach(type => dropZone.addEventListener(type, event => {
    event.preventDefault();
    dropZone.classList.add("dragging");
  }));
  ["dragleave", "drop"].forEach(type => dropZone.addEventListener(type, event => {
    event.preventDefault();
    if (type === "drop") {
      dropZone.classList.remove("dragging");
      readDroppedFiles(event.dataTransfer).then(queueFiles).catch(error => showEditorError(error.message));
    } else if (!dropZone.contains(event.relatedTarget)) dropZone.classList.remove("dragging");
  }));
  form.addEventListener("submit", submitProject);
}
function syncCurrentFile(value = null) {
  const textarea = document.querySelector("#file-content");
  const content = value === null ? textarea?.value : value;
  if (content === undefined || content === null) return;
  if (state.selectedPath === "index.html") state.rootContent = content;
  else if (state.files[state.selectedPath] && state.files[state.selectedPath].encoding !== "base64") state.files[state.selectedPath].content = content;
  updateStatsOnly();
}
function updateStatsOnly() {
  const stats = siteStats();
  const total = document.querySelector("#site-stats");
  if (total) total.textContent = `${formatBytes(stats.bytes)} / 16 MB`;
}
function addNewFile() {
  const suggested = state.selectedPath.includes("/") ? state.selectedPath.slice(0, state.selectedPath.lastIndexOf("/") + 1) : "";
  const path = window.prompt("New relative file path:", `${suggested}new-file.html`);
  if (path === null) return;
  try {
    syncCurrentFile();
    const clean = validatePath(path);
    if (clean === "index.html") throw new Error("The root homepage already exists. Select it in the file tree to edit it.");
    if (Object.keys(state.files).length + 2 > MAX_SITE_FILES && !state.files[clean]) throw new Error(`A site can contain up to ${MAX_SITE_FILES} files.`);
    state.files[clean] = { path: clean, encoding: "utf8", content: state.files[clean]?.encoding === "utf8" ? state.files[clean].content : "" };
    state.selectedPath = clean;
    addProjectLog(`Added ${clean} to the file queue.`);
    renderFileManager();
    document.querySelector("#file-content")?.focus();
  } catch (error) { showEditorError(error.message); }
}
function addNewFolder() {
  const suggested = state.selectedPath.includes("/") ? state.selectedPath.slice(0, state.selectedPath.lastIndexOf("/")) : "";
  const path = window.prompt("New folder path:", suggested ? `${suggested}/new-folder` : "new-folder");
  if (path === null) return;
  try {
    syncCurrentFile();
    const folder = validatePath(path);
    const target = `${folder}/index.html`;
    if (target.toLowerCase() === "index.html") throw new Error("Choose a folder name other than the project root.");
    if (!state.files[target] && Object.keys(state.files).length + 2 > MAX_SITE_FILES) throw new Error(`A site can contain up to ${MAX_SITE_FILES} files.`);
    state.files[target] ||= { path: target, encoding: "utf8", content: `<!doctype html>\n<html lang="en">\n<head><meta charset="utf-8"><title>${esc(folder.split("/").pop())}</title></head>\n<body>\n  <h1>${esc(folder.split("/").pop())}</h1>\n</body>\n</html>\n` };
    state.selectedPath = target;
    addProjectLog(`Created folder ${folder} with ${target}.`);
    renderFileManager();
  } catch (error) { showEditorError(error.message); }
}
function removeSelectedFile() {
  if (state.selectedPath === "index.html" || !state.files[state.selectedPath]) return;
  const path = state.selectedPath;
  if (!window.confirm(`Remove ${path} from this project?`)) return;
  delete state.files[path];
  state.selectedPath = "index.html";
  addProjectLog(`Removed ${path} from the project queue.`);
  renderFileManager();
}
function showEditorError(message) {
  const error = document.querySelector("#form-error");
  if (error) error.textContent = message;
  recordLog("error", message);
}
function fileToEntry(file, path) {
  return new Promise(async (resolve, reject) => {
    try {
      if (isTextPath(path)) resolve({ path, encoding: "utf8", content: await file.text(), size: file.size });
      else {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = "";
        for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
        resolve({ path, encoding: "base64", content: btoa(binary), size: file.size });
      }
    } catch (error) { reject(new Error(`Could not read ${path}: ${error.message}`)); }
  });
}
function stripCommonRoot(entries) {
  if (!entries.length) return entries;
  const roots = new Set(entries.map(item => item.path.split("/")[0]));
  if (roots.size !== 1 || entries.some(item => !item.path.includes("/"))) return entries;
  const root = `${[...roots][0]}/`;
  return entries.map(item => ({ ...item, path: item.path.startsWith(root) ? item.path.slice(root.length) : item.path }));
}
async function queueFiles(files) {
  if (!files.length) return;
  syncCurrentFile();
  let candidates = files.map(item => {
    const file = item.file || item;
    return {
      file,
      path: item.path || file.webkitRelativePath || file.name,
    };
  });
  candidates = stripCommonRoot(candidates.map(item => ({ ...item, path: cleanPath(item.path) })));
  const entries = await Promise.all(candidates.map(item => fileToEntry(item.file, validatePath(item.path))));
  const nextFiles = { ...state.files };
  let rootContent = state.rootContent;
  const duplicates = new Set();
  for (const entry of entries) {
    if (entry.path.toLowerCase() === "index.html") {
      rootContent = entry.encoding === "utf8" ? entry.content : rootContent;
      duplicates.add(entry.path);
      continue;
    }
    if (nextFiles[entry.path]) duplicates.add(entry.path);
    nextFiles[entry.path] = { path: entry.path, encoding: entry.encoding, content: entry.content };
  }
  const filesCount = Object.keys(nextFiles).length + 1;
  const bytes = new TextEncoder().encode(rootContent).byteLength + Object.values(nextFiles).reduce((sum, item) => sum + encodedSize(item), 0);
  if (filesCount > MAX_SITE_FILES) throw new Error(`This upload would add ${filesCount} files. The limit is ${MAX_SITE_FILES}; remove files or choose a smaller set.`);
  if (bytes > MAX_SITE_BYTES) throw new Error(`This upload would bring the project to ${formatBytes(bytes)}. The total limit is 16 MB.`);
  state.files = nextFiles;
  state.rootContent = rootContent;
  const firstPath = entries.find(item => item.path.toLowerCase() !== "index.html")?.path || "index.html";
  state.selectedPath = firstPath;
  const replaced = [...duplicates];
  addProjectLog(`Queued ${entries.length} ${entries.length === 1 ? "file" : "files"}${replaced.length ? `; updated ${replaced.length} existing path${replaced.length === 1 ? "" : "s"}` : ""}.`);
  const errorNode = document.querySelector("#form-error");
  if (errorNode) errorNode.textContent = "";
  renderFileManager();
}
function readEntry(entry, prefix = "") {
  return new Promise((resolve, reject) => {
    if (entry.isFile) {
      entry.file(file => resolve([{ file, path: `${prefix}${entry.name}` }]), reject);
      return;
    }
    if (!entry.isDirectory) { resolve([]); return; }
    const reader = entry.createReader();
    const children = [];
    const readBatch = () => reader.readEntries(async items => {
      if (!items.length) {
        try {
          const nested = await Promise.all(children.map(child => readEntry(child, `${prefix}${entry.name}/`)));
          resolve(nested.flat());
        } catch (error) { reject(error); }
        return;
      }
      children.push(...items);
      readBatch();
    }, reject);
    readBatch();
  });
}
async function readDroppedFiles(dataTransfer) {
  const items = [...(dataTransfer?.items || [])];
  const entries = items.map(item => item.webkitGetAsEntry?.()).filter(Boolean);
  if (entries.length) {
    const nested = await Promise.all(entries.map(entry => readEntry(entry)));
    return nested.flat();
  }
  return [...(dataTransfer?.files || [])];
}
function validateBeforeSave(name, slug) {
  if (!name.trim()) throw new Error("Enter a project name.");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Use a URL path with lowercase letters, numbers, and single hyphens only.");
  if (!state.rootContent.trim()) throw new Error("Add the root index.html homepage before publishing.");
  if (Object.keys(state.files).length + 1 > MAX_SITE_FILES) throw new Error(`A site can contain up to ${MAX_SITE_FILES} files.`);
  const stats = siteStats();
  if (stats.bytes > MAX_SITE_BYTES) throw new Error(`The site is ${formatBytes(stats.bytes)}. The total limit is 16 MB.`);
}
async function submitProject(event) {
  event.preventDefault();
  if (state.busy) return;
  syncCurrentFile();
  syncEnvironment();
  const formData = new FormData(event.currentTarget);
  const name = String(formData.get("name") || "").trim();
  const slug = String(formData.get("slug") || "").trim();
  try { validateBeforeSave(name, slug); }
  catch (error) { showEditorError(error.message); return; }
  const payload = {
    name,
    slug,
    content: state.rootContent,
    projectFiles: Object.values(state.files).map(item => ({ path: item.path, encoding: item.encoding, content: item.content })),
    publicEnv: state.envRows.filter(row => row.key.trim()).map(row => ({ key: row.key.trim(), value: row.value })),
  };
  const button = document.querySelector("#publish-button");
  const status = document.querySelector("#activity-status");
  const formError = document.querySelector("#form-error");
  state.busy = true;
  button.disabled = true;
  button.textContent = "Publishing…";
  status.textContent = "PUBLISHING";
  if (formError) formError.textContent = "";
  recordLog("pending", `Sending ${siteStats().count} files to Nuke…`);
  try {
    const saved = await api(state.editing ? `/api/projects/${encodeURIComponent(state.editing.id)}` : "/api/projects", {
      method: state.editing ? "PUT" : "POST",
      body: JSON.stringify(payload),
    });
    const project = saved || state.editing || { name, slug };
    recordLog("success", `${project.name || name} published at /${project.slug || slug}/.`);
    state.lastDeploymentLogs = [...state.logs];
    state.busy = false;
    closeEditor();
    const url = `${location.origin}/${encodeURIComponent(project.slug || slug)}/`;
    const loadError = await loadDashboard();
    renderDashboard({ notice: url, error: loadError });
  } catch (error) {
    state.busy = false;
    recordLog("error", error.message);
    if (button) { button.disabled = false; button.textContent = state.editing ? "Save & publish" : "Create & publish"; }
    if (status) status.textContent = "ERROR";
    if (formError) formError.textContent = error.message;
  }
}
function closeEditor() {
  document.querySelector(".modal-backdrop")?.remove();
  state.editing = null;
  state.files = {};
  state.envRows = [];
}

api("/api/auth/session").then(session => {
  if (session?.authenticated) loadDashboard();
  else showLogin(session?.configured === false ? "Set the owner password and restart the service to enable login." : "");
}).catch(error => showLogin(error.message || "Could not check your session. Refresh to try again."));
