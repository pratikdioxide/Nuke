const state = { projects: [], editing: null, formKind: "html", envRows: [], formContent: "", projectFiles: [], folderSelected: false };
const app = document.querySelector("#app");
const esc = (s = "") => s.replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[c]));
const slugify = s => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const api = async (url, options = {}) => { const r = await fetch(url, { headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options }); const data = r.status === 204 ? null : await r.json(); if (!r.ok) throw Error(data?.error || "Something went wrong"); return data; };
const brand = `<div class="brand"><img src="/nuke-logo.svg" alt="Nuke logo"><span>NUKE</span></div>`;
const MAX_SITE_BYTES = 16 * 1024 * 1024;
const MAX_SITE_FILES = 500;
const TEXT_SITE_EXTENSIONS = new Set([".html", ".htm", ".css", ".js", ".mjs", ".cjs", ".json", ".map", ".xml", ".svg", ".txt", ".md", ".csv", ".webmanifest", ".yaml", ".yml", ".toml"]);

function isTextSiteFile(filePath) {
  return TEXT_SITE_EXTENSIONS.has(filePath.slice(filePath.lastIndexOf(".")).toLowerCase());
}

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

async function readSiteFolder(fileList) {
  const selected = [...fileList];
  if (!selected.length) throw Error("Choose a website folder first.");
  if (selected.length > MAX_SITE_FILES) throw Error(`A site can contain up to ${MAX_SITE_FILES} files.`);
  const totalBytes = selected.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > MAX_SITE_BYTES) throw Error("The website folder must total 16 MB or less.");

  const originalPaths = selected.map(file => file.webkitRelativePath || file.name);
  const roots = new Set(originalPaths.map(filePath => filePath.split("/")[0]));
  const hasCommonFolder = originalPaths.every(filePath => filePath.includes("/")) && roots.size === 1;
  const rootPrefix = hasCommonFolder ? `${[...roots][0]}/` : "";
  const entries = selected.map((file, index) => ({
    file,
    path: rootPrefix && originalPaths[index].startsWith(rootPrefix) ? originalPaths[index].slice(rootPrefix.length) : originalPaths[index],
  }));
  const entryIndex = entries.findIndex(item => item.path.toLowerCase() === "index.html");
  if (entryIndex < 0) throw Error("Put an index.html file at the root of the selected folder.");

  const seen = new Set();
  for (const item of entries) {
    if (!item.path || item.path.startsWith("/") || item.path.includes("\\") || item.path.split("/").some(part => !part || part === "." || part === "..")) {
      throw Error(`Invalid file path: ${item.path}`);
    }
    if (seen.has(item.path)) throw Error(`The folder contains the path more than once: ${item.path}`);
    seen.add(item.path);
  }

  const [entry, ...otherFiles] = [
    entries[entryIndex],
    ...entries.filter((_, index) => index !== entryIndex),
  ];
  const content = await entry.file.text();
  const projectFiles = await Promise.all(otherFiles.map(async ({ file, path }) => ({
    path,
    encoding: isTextSiteFile(path) ? "utf8" : "base64",
    content: isTextSiteFile(path) ? await file.text() : bufferToBase64(await file.arrayBuffer()),
  })));
  return { content, projectFiles };
}

function publicBubble(project, index) {
  let left = 8 + ((index * 29 + 13) % 84);
  const top = 8 + ((index * 41 + 7) % 84);
  if (left > 27 && left < 73 && top > 15 && top < 85) left = left < 50 ? 10 : 90;
  return `<a class="public-bubble" href="/${encodeURIComponent(project.slug)}" style="left:${left}%;top:${top}%" title="Open ${esc(project.name)}">${esc(project.name)}</a>`;
}

function resolveCircleRect(motion, radius, rect) {
  const nearestX = Math.max(rect.left, Math.min(motion.x, rect.right));
  const nearestY = Math.max(rect.top, Math.min(motion.y, rect.bottom));
  let dx = motion.x - nearestX;
  let dy = motion.y - nearestY;
  let distance = Math.hypot(dx, dy);
  if (distance >= radius) return;

  if (!distance) {
    const distances = [
      { value: motion.x - rect.left, x: -1, y: 0 },
      { value: rect.right - motion.x, x: 1, y: 0 },
      { value: motion.y - rect.top, x: 0, y: -1 },
      { value: rect.bottom - motion.y, x: 0, y: 1 },
    ].sort((a, b) => a.value - b.value);
    dx = distances[0].x;
    dy = distances[0].y;
    distance = 1;
  }

  const nx = dx / distance;
  const ny = dy / distance;
  motion.x += nx * (radius - distance + 1);
  motion.y += ny * (radius - distance + 1);
  const velocityAlongNormal = motion.vx * nx + motion.vy * ny;
  if (velocityAlongNormal < 0) {
    motion.vx -= 2 * velocityAlongNormal * nx;
    motion.vy -= 2 * velocityAlongNormal * ny;
  }
}

function resolveBubblePair(first, second) {
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  const minimumDistance = first.radius + second.radius;
  const distance = Math.hypot(dx, dy);
  if (distance >= minimumDistance) return;

  const nx = distance ? dx / distance : 1;
  const ny = distance ? dy / distance : 0;
  const overlap = minimumDistance - (distance || 1);
  first.x -= nx * overlap * 0.5;
  first.y -= ny * overlap * 0.5;
  second.x += nx * overlap * 0.5;
  second.y += ny * overlap * 0.5;

  const relativeVelocity = (second.vx - first.vx) * nx + (second.vy - first.vy) * ny;
  if (relativeVelocity < 0) {
    first.vx += relativeVelocity * nx;
    first.vy += relativeVelocity * ny;
    second.vx -= relativeVelocity * nx;
    second.vy -= relativeVelocity * ny;
  }
}

function wanderBubble(bubble, index, container) {
  const radius = bubble.offsetWidth / 2;
  const stageRect = container.getBoundingClientRect();
  const obstacles = [];
  const logo = document.querySelector("#drag-logo");
  if (logo) obstacles.push(logo.getBoundingClientRect());
  let x = stageRect.width * (0.1 + Math.random() * 0.8);
  let y = stageRect.height * (0.1 + Math.random() * 0.8);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const overlaps = obstacles.some((rect) => {
      const localRect = { left: rect.left - stageRect.left - 22, right: rect.right - stageRect.left + 22, top: rect.top - stageRect.top - 22, bottom: rect.bottom - stageRect.top + 22 };
      return x > localRect.left - radius && x < localRect.right + radius && y > localRect.top - radius && y < localRect.bottom + radius;
    });
    if (!overlaps) break;
    x = radius + Math.random() * Math.max(1, stageRect.width - radius * 2);
    y = radius + Math.random() * Math.max(1, stageRect.height - radius * 2);
  }

  bubble.motion = {
    x,
    y,
    radius,
    vx: (Math.random() < 0.5 ? -1 : 1) * (0.07 + Math.random() * 0.1),
    vy: (Math.random() < 0.5 ? -1 : 1) * (0.07 + Math.random() * 0.1),
    rotation: index * 7,
    spin: (Math.random() - 0.5) * 0.03,
    cooldownUntil: 0,
  };
}

function startBubblePhysics(container) {
  let previousTime = performance.now();
  const motion = {
    bubbles: [],
  };
  motion.bubbles = [...container.querySelectorAll(".public-bubble")];

  const move = (time) => {
    if (!container.isConnected) return;
    const delta = Math.min(34, Math.max(8, time - previousTime));
    previousTime = time;
    const stageRect = container.getBoundingClientRect();
    const stageWidth = stageRect.width;
    const stageHeight = stageRect.height;
    const activeBubbles = motion.bubbles.filter((bubble) => bubble.isConnected && bubble.motion);
    const stage = document.querySelector("#drag-stage");

    activeBubbles.forEach((bubble) => {
      const item = bubble.motion;
      item.x += item.vx * delta;
      item.y += item.vy * delta;
      if (item.x <= item.radius || item.x >= stageWidth - item.radius) {
        item.x = Math.max(item.radius, Math.min(stageWidth - item.radius, item.x));
        item.vx *= -1;
      }
      if (item.y <= item.radius || item.y >= stageHeight - item.radius) {
        item.y = Math.max(item.radius, Math.min(stageHeight - item.radius, item.y));
        item.vy *= -1;
      }

      if (stage && !stage.classList.contains("unlocked")) {
        const liveLogo = document.querySelector("#drag-logo")?.getBoundingClientRect();
        if (liveLogo) resolveCircleRect(item, item.radius, { left: liveLogo.left - stageRect.left, right: liveLogo.right - stageRect.left, top: liveLogo.top - stageRect.top, bottom: liveLogo.bottom - stageRect.top });
      }
      const card = document.querySelector("#login-card.visible")?.getBoundingClientRect();
      if (card) resolveCircleRect(item, item.radius, { left: card.left - stageRect.left, right: card.right - stageRect.left, top: card.top - stageRect.top, bottom: card.bottom - stageRect.top });
      item.rotation += item.spin * delta;
    });

    for (let first = 0; first < activeBubbles.length; first += 1) {
      for (let second = first + 1; second < activeBubbles.length; second += 1) {
        resolveBubblePair(activeBubbles[first].motion, activeBubbles[second].motion);
      }
    }

    activeBubbles.forEach((bubble) => {
      const item = bubble.motion;
      bubble.style.left = `${item.x}px`;
      bubble.style.top = `${item.y}px`;
      bubble.style.transform = `translate(-50%, -50%) rotate(${item.rotation}deg)`;
    });
    requestAnimationFrame(move);
  };
  requestAnimationFrame(move);
}

async function loadPublicBubbles() {
  try {
    const projects = await api("/api/public-projects");
    const bubbles = document.querySelector("#public-bubbles");
    if (bubbles) {
      bubbles.innerHTML = projects.map(publicBubble).join("");
      bubbles.querySelectorAll(".public-bubble").forEach((bubble, index) => wanderBubble(bubble, index, bubbles));
      startBubblePhysics(bubbles);
    }
  } catch {
    // The private login should remain usable if the optional public list is unavailable.
  }
}

 function showTransition(title, detail) {
   return new Promise(resolve => {
     app.innerHTML = `<main class="transition-screen" role="status" aria-live="polite"><div class="transition-mark">${brand}<span class="transition-ring"></span></div><h1>${title}</h1><p class="transition-detail">${detail}</p><div class="transition-progress" aria-hidden="true"><span></span></div></main>`;
     setTimeout(resolve, 520);
   });
 }
 function shell(content) { app.innerHTML = `<main class="shell view-enter"><aside class="rail">${brand}<p class="rail-note">Your private shelf<br>for the web.</p><div class="rail-bottom"><span class="status-dot"></span><span>Private mode</span></div></aside><section class="content">${content}</section></main>`; }
function login(message = "") {
  app.innerHTML = `<main class="login-page drag-stage" id="drag-stage">
    <div id="public-bubbles" class="public-bubbles" aria-label="Public project links"></div>
    <div class="logo-slot"><div class="drag-logo" id="drag-logo"><img src="/nuke-logo.svg" alt="" draggable="false"></div></div>
    <div class="login-card" id="login-card">
      ${brand}
      <h2>Enter your password</h2>
      <form id="login-form">
        <label>Password<input type="password" name="password" autocomplete="current-password" placeholder="Enter your password"></label>
        <button class="primary" type="submit">Enter Nuke <span>↗</span></button>
        ${message ? `<p class="error">${esc(message)}</p>` : ""}
      </form>
    </div>
  </main>`;

  loadPublicBubbles();

  const stage = document.querySelector("#drag-stage");
  const dragLogo = document.querySelector("#drag-logo");
  const loginCard = document.querySelector("#login-card");
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  let unlocked = false, dragging = false, startX = 0, startY = 0, originX = 0, originY = 0;

  function unlock(instant = false) {
    if (unlocked) return;
    unlocked = true;
    stage.classList.add("unlocked");
    const reveal = () => { loginCard.classList.add("visible"); document.querySelector('[name="password"]')?.focus(); };
    instant ? reveal() : setTimeout(reveal, 200);
  }

  function pointerDown(e) {
    if (unlocked) return;
    dragging = true;
    dragLogo.setPointerCapture(e.pointerId);
    const rect = dragLogo.getBoundingClientRect();
    startX = e.clientX; startY = e.clientY;
    originX = rect.left + rect.width / 2; originY = rect.top + rect.height / 2;
  }
  function pointerMove(e) {
    if (!dragging) return;
    e.preventDefault();
    const stageRect = stage.getBoundingClientRect();
    const margin = 60;
    const targetX = clamp(originX + (e.clientX - startX), stageRect.left + margin, stageRect.right - margin);
    const targetY = clamp(originY + (e.clientY - startY), stageRect.top + margin, stageRect.bottom - margin);
    dragLogo.style.transform = `translate(${targetX - originX}px, ${targetY - originY}px)`;
  }
  function pointerUp() {
    if (!dragging) return;
    dragging = false;
    const rect = dragLogo.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const draggedLeftEnough = originX - centerX > 120;
    const onLeftSide = centerX < window.innerWidth * 0.5;
    if (draggedLeftEnough && onLeftSide) { unlock(); return; }
    dragLogo.classList.add("snap-back");
    dragLogo.style.transform = "";
    setTimeout(() => dragLogo.classList.remove("snap-back"), 420);
  }

  dragLogo.addEventListener("pointerdown", pointerDown);
  dragLogo.addEventListener("pointermove", pointerMove);
  dragLogo.addEventListener("pointerup", pointerUp);
  dragLogo.addEventListener("pointercancel", pointerUp);
  dragLogo.style.touchAction = "none";

  if (message) unlock(true);

   document.querySelector("#login-form").onsubmit = async e => { e.preventDefault(); try { await api("/api/auth/login", { method:"POST", body: JSON.stringify({ password: new FormData(e.target).get("password") }) }); await showTransition("Opening Nuke.", "Loading your private shelf."); await loadDashboard(); } catch (err) { login(err.message); } };
}
async function loadDashboard() { try { state.projects = await api("/api/projects"); renderDashboard(); } catch (err) { if (err.message.includes("DATABASE_URL") || err.message.includes("NUKE_PASSWORD")) renderDashboard(err.message); else login(err.message); } }
function renderDashboard(configError = "") { shell(`<header class="topbar"><div><p class="eyebrow">COMMAND CENTER</p><h1>Good to see you.</h1></div><div class="top-actions"><button class="ghost" id="logout">Log out</button><button class="primary small" id="new-project">+ New project</button></div></header>${configError ? `<div class="notice">${esc(configError)}<br><span>Set the variables and restart the app to unlock your shelf.</span></div>` : ""}<section class="summary"><div><span class="summary-label">LIVE PROJECTS</span><strong>${state.projects.length.toString().padStart(2,"0")}</strong></div><div><span class="summary-label">HOSTED HTML</span><strong>${state.projects.filter(p=>p.kind==="html").length.toString().padStart(2,"0")}</strong></div><div><span class="summary-label">EXTERNAL LINKS</span><strong>${state.projects.filter(p=>p.kind==="external").length.toString().padStart(2,"0")}</strong></div></section><div class="section-heading"><div><p class="eyebrow">YOUR SHELF</p><h2>All projects</h2></div><span class="mono">${state.projects.length ? "UPDATED RECENTLY" : "NOTHING HERE YET"}</span></div><div class="project-grid">${state.projects.length ? state.projects.map(projectCard).join("") : `<div class="empty"><span class="empty-mark">✦</span><h3>Your shelf is clear.</h3><p>Drop in a standalone HTML file or save a site you want close by.</p><button class="secondary" id="empty-new">Create your first project</button></div>`}</div>`);
    document.querySelector("#new-project").onclick = () => openEditor(); document.querySelector("#logout").onclick = async () => { await api("/api/auth/logout",{method:"POST"}); await showTransition("Locking Nuke.", "Returning to the public screen."); login(); }; document.querySelector("#empty-new")?.addEventListener("click", () => openEditor()); document.querySelectorAll("[data-edit]").forEach(b => b.onclick = () => openEditor(Number(b.dataset.edit))); document.querySelectorAll("[data-delete]").forEach(b => b.onclick = async () => { if(confirm("Delete this project?")) { await api(`/api/projects/${b.dataset.delete}`,{method:"DELETE"}); loadDashboard(); } }); }
function projectCard(p) { return `<article class="project-card"><div class="card-top"><span class="type-pill ${p.kind}">${p.kind === "html" ? "HTML" : "LINK"}</span><button class="kebab" data-edit="${p.id}">•••</button></div><h3>${esc(p.name)}</h3><p class="project-url">/${esc(p.slug)}</p><div class="card-foot"><a class="open-link" href="/${encodeURIComponent(p.slug)}" target="_blank">Open live <span>↗</span></a><div class="card-actions"><button class="icon-btn" data-edit="${p.id}" aria-label="Edit">✎</button><button class="icon-btn danger" data-delete="${p.id}" aria-label="Delete">×</button></div></div></article>`; }
 async function openEditor(projectId = null) {
   let project = null;
   if (projectId !== null) {
     try {
       project = await api(`/api/projects/${projectId}`);
     } catch (error) {
       alert(error.message);
       return;
     }
   }
  state.editing = project;
  state.formKind = project?.kind || "html";
  state.envRows = Object.entries(project?.public_env || {}).map(([key, value]) => ({ key, value: String(value) }));
  state.formContent = project?.content || "";
   state.projectFiles = project?.project_files || [];
   state.folderSelected = state.projectFiles.length > 0;
  app.insertAdjacentHTML("beforeend", `<div class="modal-backdrop"><section class="modal"><div class="modal-head"><div><p class="eyebrow">${project ? "EDIT PROJECT" : "NEW PROJECT"}</p><h2>${project ? "Refine your project." : "Add to your shelf."}</h2></div><button class="close" id="close-modal">×</button></div><form id="project-form"><label>Name<input name="name" required value="${esc(project?.name || "")}" placeholder="My portfolio"></label><label>URL slug<div class="slug-field"><span>/</span><input name="slug" required value="${esc(project?.slug || "")}" placeholder="my-portfolio"></div></label><div class="field-label">What are you saving?</div><div class="segmented"><button type="button" class="${state.formKind==="html"?"active":""}" data-kind="html">HTML file</button><button type="button" class="${state.formKind==="external"?"active":""}" data-kind="external">External link</button></div><div id="kind-fields"></div><p id="form-error" class="error"></p><div class="modal-actions"><button type="button" class="secondary" id="cancel-modal">Cancel</button><button class="primary" type="submit">${project ? "Save changes" : "Save project"} <span>↗</span></button></div></form></section></div>`);

  const name = document.querySelector('[name="name"]');
  name.oninput = () => { if (!project) document.querySelector('[name="slug"]').value = slugify(name.value); };
  const kindFields = document.querySelector("#kind-fields");
  kindFields.addEventListener("input", (event) => {
    if (event.target.name === "content") state.formContent = event.target.value;
    if (event.target.matches("[data-env-key], [data-env-value]")) state.envRows = readEnvRows();
  });
  kindFields.addEventListener("change", async (event) => {
    const file = event.target.name === "file" ? event.target.files?.[0] : null;
    if (event.target.name === "siteFolder" && event.target.files?.length) {
      try {
        const site = await readSiteFolder(event.target.files);
        state.formContent = site.content;
        state.projectFiles = site.projectFiles;
        state.folderSelected = true;
        renderKindFields(project);
      } catch (error) {
        const formError = document.querySelector("#form-error");
        if (formError) formError.textContent = error.message;
        event.target.value = "";
      }
      return;
    }
    if (file) {
      state.formContent = await file.text();
      const content = kindFields.querySelector('[name="content"]');
      if (content) content.value = state.formContent;
    }
  });
  kindFields.addEventListener("click", (event) => {
    const addButton = event.target.closest("[data-add-env]");
    const removeButton = event.target.closest("[data-remove-env]");
    if (addButton) {
      state.envRows = readEnvRows();
      state.envRows.push({ key: "", value: "" });
      renderKindFields(project);
      kindFields.querySelector("[data-env-key]:last-of-type")?.focus();
    } else if (removeButton) {
      state.envRows = readEnvRows();
      state.envRows.splice(Number(removeButton.dataset.removeEnv), 1);
      renderKindFields(project);
    }
  });

  document.querySelectorAll("[data-kind]").forEach(button => button.onclick = () => {
    if (state.formKind === "html") {
      state.formContent = kindFields.querySelector('[name="content"]')?.value ?? state.formContent;
      state.envRows = readEnvRows();
    }
    state.formKind = button.dataset.kind;
    document.querySelectorAll("[data-kind]").forEach(item => item.classList.toggle("active", item === button));
    renderKindFields(project);
  });
  renderKindFields(project);
  document.querySelector("#close-modal").onclick = closeEditor;
  document.querySelector("#cancel-modal").onclick = closeEditor;
  document.querySelector("#project-form").onsubmit = submitProject;
}
function readEnvRows() {
  return [...document.querySelectorAll("#env-list .env-row")].map(row => ({
    key: row.querySelector("[data-env-key]").value,
    value: row.querySelector("[data-env-value]").value,
  }));
}
function renderKindFields(project) {
  const wrap = document.querySelector("#kind-fields");
  if (!wrap) return;
  wrap.classList.toggle("html-kind-fields", state.formKind === "html");
  if (state.formKind === "html") {
    const rows = state.envRows.length
      ? state.envRows.map((item, index) => `<div class="env-row"><label>Key<input data-env-key autocomplete="off" spellcheck="false" value="${esc(item.key)}" placeholder="PUBLIC_API_URL"></label><label>Value<input data-env-value autocomplete="off" value="${esc(item.value)}" placeholder="https://api.example.com"></label><button class="env-remove" type="button" data-remove-env="${index}" aria-label="Remove ${esc(item.key || "environment variable")}">Remove</button></div>`).join("")
      : `<p class="env-empty">No variables added yet.</p>`;
    const fileRows = state.projectFiles.map(item => `<li><code>${esc(item.path)}</code></li>`).join("");
    const fileStatus = state.folderSelected
      ? `<strong>${state.projectFiles.length + 1} site files ready</strong><ul class="site-file-list"><li><code>index.html</code> <span>home page</span></li>${fileRows}</ul>`
      : `<p class="site-file-status">${project ? "This project currently uses a single HTML page. Choose a folder to replace it with a multi-file site." : "Choose a website folder to upload its HTML, CSS, JavaScript, images, and other assets together."}</p>`;
    wrap.innerHTML = `<section class="site-manager"><div class="site-manager-head"><div><div class="field-label">Website files</div><p class="field-help">Choose a folder with <code>index.html</code> at its root. Uploading a folder replaces the project’s current site files.</p></div><label class="site-folder-pick">Choose folder<input type="file" name="siteFolder" webkitdirectory directory multiple></label></div>${fileStatus}<p class="field-help">Keep normal relative paths in your HTML, such as <code>./css/style.css</code>, <code>./js/app.js</code>, and <code>./images/logo.png</code>. Nested pages can use <code>../css/style.css</code>.</p><p class="field-help">Maximum: 500 files and 16 MB per project. Files are public at their paths; don’t include <code>.env</code>, API keys, or credentials.</p></section><label>Home page HTML<input type="file" name="file" accept=".html,.htm,text/html"><textarea name="content" rows="9" placeholder="Paste your HTML here">${esc(state.formContent)}</textarea></label><section class="env-manager"><div class="env-manager-head"><div><div class="field-label">Public environment variables</div><p class="field-help">Available as <code>window.NUKE_ENV.KEY</code> in your hosted HTML. Visitors can inspect these values; do not store secrets here.</p></div><button class="secondary env-add" type="button" data-add-env>+ Add variable</button></div><div class="env-list" id="env-list">${rows}</div></section>`;
    return;
  }
  wrap.innerHTML = `<label>Website URL<input name="externalUrl" type="url" required value="${esc(project?.external_url || "")}" placeholder="https://example.com"></label><p class="field-help">The site will open at your Nuke URL with a handy external fallback.</p>`;
}
async function submitProject(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  state.envRows = state.formKind === "html" ? readEnvRows() : [];
  state.formContent = document.querySelector('[name="content"]')?.value ?? state.formContent;
  const payload = {
    name: form.get("name"),
    slug: form.get("slug"),
    kind: state.formKind,
    content: state.formContent,
    projectFiles: state.formKind === "html" ? state.projectFiles : undefined,
    externalUrl: form.get("externalUrl"),
    publicEnv: state.envRows,
  };
  try {
    await api(state.editing ? `/api/projects/${state.editing.id}` : "/api/projects", {
      method: state.editing ? "PUT" : "POST",
      body: JSON.stringify(payload),
    });
    closeEditor();
    await loadDashboard();
  } catch (error) {
    document.querySelector("#form-error").textContent = error.message;
  }
}
function closeEditor() { document.querySelector(".modal-backdrop")?.remove(); state.editing=null; state.projectFiles=[]; state.folderSelected=false; }
api("/api/auth/session").then(s => s.authenticated ? loadDashboard() : login()).catch(() => login("Start the server and set your environment variables first."));