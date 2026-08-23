const state = { projects: [], editing: null, formKind: "html" };
const app = document.querySelector("#app");
const esc = (s = "") => s.replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[c]));
const slugify = s => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const api = async (url, options = {}) => { const r = await fetch(url, { headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options }); const data = r.status === 204 ? null : await r.json(); if (!r.ok) throw Error(data?.error || "Something went wrong"); return data; };
const brand = `<div class="brand"><img src="/nuke-logo.svg" alt="Nuke logo"><span>NUKE</span></div>`;
function shell(content) { app.innerHTML = `<main class="shell"><aside class="rail">${brand}<p class="rail-note">Your private shelf<br>for the web.</p><div class="rail-bottom"><span class="status-dot"></span><span>Private mode</span></div></aside><section class="content">${content}</section></main>`; }
function login(message = "") {
  app.innerHTML = `<main class="login-page drag-stage" id="drag-stage">
    <div class="drag-copy">
      ${brand}
      <p class="eyebrow">PRIVATE ACCESS</p>
      <h1>Drag the mark<br>to unlock.</h1>
      <p class="muted">Hold the logo and drag it to the ring on the left.</p>
      <button type="button" class="unlock-fallback" id="unlock-fallback">Trouble dragging? Unlock instead →</button>
    </div>
    <div class="zone-slot"><div class="drop-zone" id="drop-zone" aria-hidden="true"><span class="drop-ring"></span><span class="drop-label">DROP HERE</span></div></div>
    <div class="logo-slot"><button type="button" class="drag-logo" id="drag-logo" aria-label="Hold and drag to the left to unlock the login form"><img src="/nuke-logo.svg" alt="" draggable="false"></button></div>
    <div class="login-card" id="login-card">
      <p class="eyebrow">WELCOME BACK</p>
      <h2>Enter your password</h2>
      <form id="login-form">
        <label>Password<input type="password" name="password" autocomplete="current-password" placeholder="Enter your password"></label>
        <button class="primary" type="submit">Enter Nuke <span>↗</span></button>
        ${message ? `<p class="error">${esc(message)}</p>` : ""}
      </form>
    </div>
  </main>`;

  const stage = document.querySelector("#drag-stage");
  const dragLogo = document.querySelector("#drag-logo");
  const dropZone = document.querySelector("#drop-zone");
  const loginCard = document.querySelector("#login-card");
  const unlockFallback = document.querySelector("#unlock-fallback");
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  let unlocked = false, dragging = false, startX = 0, startY = 0, originX = 0, originY = 0;

  function overlaps() {
    const a = dragLogo.getBoundingClientRect(), b = dropZone.getBoundingClientRect();
    return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
  }

  function unlock(instant = false) {
    if (unlocked) return;
    unlocked = true;
    stage.classList.add("unlocked");
    dragLogo.classList.add("locked-in");
    dropZone.classList.add("hit");
    dragLogo.style.transform = "";
    const reveal = () => { loginCard.classList.add("visible"); document.querySelector('[name="password"]')?.focus(); };
    instant ? reveal() : setTimeout(reveal, 260);
  }

  function pointerDown(e) {
    if (unlocked) return;
    dragging = true;
    dragLogo.setPointerCapture(e.pointerId);
    dragLogo.classList.add("dragging");
    const rect = dragLogo.getBoundingClientRect();
    startX = e.clientX; startY = e.clientY;
    originX = rect.left + rect.width / 2; originY = rect.top + rect.height / 2;
  }
  function pointerMove(e) {
    if (!dragging) return;
    e.preventDefault();
    const stageRect = stage.getBoundingClientRect();
    const margin = 46;
    const targetX = clamp(originX + (e.clientX - startX), stageRect.left + margin, stageRect.right - margin);
    const targetY = clamp(originY + (e.clientY - startY), stageRect.top + margin, stageRect.bottom - margin);
    dragLogo.style.transform = `translate(${targetX - originX}px, ${targetY - originY}px)`;
    dropZone.classList.toggle("active", overlaps());
  }
  function pointerUp() {
    if (!dragging) return;
    dragging = false;
    dragLogo.classList.remove("dragging");
    if (overlaps()) { unlock(); return; }
    dropZone.classList.remove("active");
    dragLogo.classList.add("snap-back");
    dragLogo.style.transform = "";
    setTimeout(() => dragLogo.classList.remove("snap-back"), 420);
  }

  dragLogo.addEventListener("pointerdown", pointerDown);
  dragLogo.addEventListener("pointermove", pointerMove);
  dragLogo.addEventListener("pointerup", pointerUp);
  dragLogo.addEventListener("pointercancel", pointerUp);
  dragLogo.style.touchAction = "none";

  unlockFallback.addEventListener("click", () => unlock());
  setTimeout(() => unlockFallback.classList.add("show"), 4500);

  if (message) unlock(true);

  document.querySelector("#login-form").onsubmit = async e => { e.preventDefault(); try { await api("/api/auth/login", { method:"POST", body: JSON.stringify({ password: new FormData(e.target).get("password") }) }); await loadDashboard(); } catch (err) { login(err.message); } };
}
async function loadDashboard() { try { state.projects = await api("/api/projects"); renderDashboard(); } catch (err) { if (err.message.includes("DATABASE_URL") || err.message.includes("NUKE_PASSWORD")) renderDashboard(err.message); else login(err.message); } }
function renderDashboard(configError = "") { shell(`<header class="topbar"><div><p class="eyebrow">COMMAND CENTER</p><h1>Good to see you.</h1></div><div class="top-actions"><button class="ghost" id="logout">Log out</button><button class="primary small" id="new-project">+ New project</button></div></header>${configError ? `<div class="notice">${esc(configError)}<br><span>Set the variables and restart the app to unlock your shelf.</span></div>` : ""}<section class="summary"><div><span class="summary-label">LIVE PROJECTS</span><strong>${state.projects.length.toString().padStart(2,"0")}</strong></div><div><span class="summary-label">HOSTED HTML</span><strong>${state.projects.filter(p=>p.kind==="html").length.toString().padStart(2,"0")}</strong></div><div><span class="summary-label">EXTERNAL LINKS</span><strong>${state.projects.filter(p=>p.kind==="external").length.toString().padStart(2,"0")}</strong></div></section><div class="section-heading"><div><p class="eyebrow">YOUR SHELF</p><h2>All projects</h2></div><span class="mono">${state.projects.length ? "UPDATED RECENTLY" : "NOTHING HERE YET"}</span></div><div class="project-grid">${state.projects.length ? state.projects.map(projectCard).join("") : `<div class="empty"><span class="empty-mark">✦</span><h3>Your shelf is clear.</h3><p>Drop in a standalone HTML file or save a site you want close by.</p><button class="secondary" id="empty-new">Create your first project</button></div>`}</div>`);
 document.querySelector("#new-project").onclick = () => openEditor(); document.querySelector("#logout").onclick = async () => { await api("/api/auth/logout",{method:"POST"}); login(); }; document.querySelector("#empty-new")?.addEventListener("click", () => openEditor()); document.querySelectorAll("[data-edit]").forEach(b => b.onclick = () => openEditor(state.projects.find(p=>p.id == b.dataset.edit))); document.querySelectorAll("[data-delete]").forEach(b => b.onclick = async () => { if(confirm("Delete this project?")) { await api(`/api/projects/${b.dataset.delete}`,{method:"DELETE"}); loadDashboard(); } }); }
function projectCard(p) { return `<article class="project-card"><div class="card-top"><span class="type-pill ${p.kind}">${p.kind === "html" ? "HTML" : "LINK"}</span><button class="kebab" data-edit="${p.id}">•••</button></div><h3>${esc(p.name)}</h3><p class="project-url">/${esc(p.slug)}</p><div class="card-foot"><a class="open-link" href="/${encodeURIComponent(p.slug)}" target="_blank">Open live <span>↗</span></a><div class="card-actions"><button class="icon-btn" data-edit="${p.id}" aria-label="Edit">✎</button><button class="icon-btn danger" data-delete="${p.id}" aria-label="Delete">×</button></div></div></article>`; }
function openEditor(project = null) { state.editing = project; state.formKind = project?.kind || "html"; app.insertAdjacentHTML("beforeend", `<div class="modal-backdrop"><section class="modal"><div class="modal-head"><div><p class="eyebrow">${project ? "EDIT PROJECT" : "NEW PROJECT"}</p><h2>${project ? "Refine your project." : "Add to your shelf."}</h2></div><button class="close" id="close-modal">×</button></div><form id="project-form"><label>Name<input name="name" required value="${esc(project?.name || "")}" placeholder="My portfolio"></label><label>URL slug<div class="slug-field"><span>/</span><input name="slug" required value="${esc(project?.slug || "")}" placeholder="my-portfolio"></div></label><div class="field-label">What are you saving?</div><div class="segmented"><button type="button" class="${state.formKind==="html"?"active":""}" data-kind="html">HTML file</button><button type="button" class="${state.formKind==="external"?"active":""}" data-kind="external">External link</button></div><div id="kind-fields"></div><p id="form-error" class="error"></p><div class="modal-actions"><button type="button" class="secondary" id="cancel-modal">Cancel</button><button class="primary" type="submit">${project ? "Save changes" : "Save project"} <span>↗</span></button></div></form></section></div>`); const name = document.querySelector('[name="name"]'); name.oninput = () => { if (!project) document.querySelector('[name="slug"]').value = slugify(name.value); }; document.querySelectorAll("[data-kind]").forEach(b => b.onclick = () => { state.formKind=b.dataset.kind; document.querySelectorAll("[data-kind]").forEach(x=>x.classList.toggle("active",x===b)); renderKindFields(project); }); renderKindFields(project); document.querySelector("#close-modal").onclick = closeEditor; document.querySelector("#cancel-modal").onclick = closeEditor; document.querySelector("#project-form").onsubmit = submitProject; }
function renderKindFields(project) { const wrap = document.querySelector("#kind-fields"); if (!wrap) return; wrap.innerHTML = state.formKind==="html" ? `<label>HTML content${project ? `<textarea name="content" rows="9" placeholder="Paste your HTML here">${esc(project?.content || "")}</textarea>` : `<input type="file" name="file" accept=".html,.htm,text/html"><textarea name="content" rows="6" placeholder="Or paste your HTML here"></textarea>`}</label>` : `<label>Website URL<input name="externalUrl" type="url" required value="${esc(project?.external_url || "")}" placeholder="https://example.com"></label><p class="field-help">The site will open at your Nuke URL with a handy external fallback.</p>`; const file=document.querySelector('[name="file"]'); file?.addEventListener("change", async () => { const f=file.files[0]; if(f) document.querySelector('[name="content"]').value=await f.text(); }); }
async function submitProject(e) { e.preventDefault(); const f = new FormData(e.target); const payload = { name:f.get("name"), slug:f.get("slug"), kind:state.formKind, content:f.get("content"), externalUrl:f.get("externalUrl") }; try { await api(state.editing ? `/api/projects/${state.editing.id}` : "/api/projects", { method:state.editing?"PUT":"POST", body:JSON.stringify(payload) }); closeEditor(); await loadDashboard(); } catch(err) { document.querySelector("#form-error").textContent=err.message; } }
function closeEditor() { document.querySelector(".modal-backdrop")?.remove(); state.editing=null; }
api("/api/auth/session").then(s => s.authenticated ? loadDashboard() : login()).catch(() => login("Start the server and set your environment variables first."));