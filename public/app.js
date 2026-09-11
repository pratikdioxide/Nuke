const state = { projects: [], editing: null, formKind: "html" };
const app = document.querySelector("#app");
const esc = (value = "") => String(value).replace(/[&<>"']/g, (c) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#039;",
}[c]));
const slugify = (value) => String(value).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const api = async (url, options = {}) => {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) throw Error(data?.error || "Something went wrong");
  return data;
};
const brand = `<div class="brand"><img src="/nuke-logo.svg" alt="Nuke logo"><span>NUKE</span></div>`;

function projectBubble(project, index) {
  const seed = ((Number(project.id) || index + 1) * 9301 + 49297) % 233280;
  const random = (offset) => ((seed + offset * 7919) % 233280) / 233280;
  const left = 8 + random(1) * 82;
  const top = 10 + random(2) * 76;
  const drift = 14 + random(3) * 9;
  const delay = random(4) * -16;
  const size = 1 + random(5) * 0.32;
  const href = `/${encodeURIComponent(project.slug)}`;
  return `<a class="project-bubble ${project.kind}" href="${href}" target="_blank" rel="noreferrer"
    style="--bubble-left:${left}%;--bubble-top:${top}%;--bubble-drift:${drift}s;--bubble-delay:${delay}s;--bubble-scale:${size}"
    title="Open ${esc(project.name)}">
    <span class="bubble-orbit-dot"></span><span class="bubble-type">${project.kind === "html" ? "HTML" : "LINK"}</span>
    <strong>${esc(project.name)}</strong><small>/${esc(project.slug)}</small>
  </a>`;
}

function projectOrbit() {
  if (!state.projects.length) return "";
  return `<div class="project-orbit" aria-label="Project links">${state.projects.map(projectBubble).join("")}</div>`;
}

function shell(content) {
  app.innerHTML = `${projectOrbit()}<main class="shell view-enter"><aside class="rail">${brand}<p class="rail-note">Your private shelf<br>for the web.</p><div class="rail-bottom"><span class="status-dot"></span><span>Private mode</span></div></aside><section class="content">${content}</section></main>`;
}

function transitionTo(action, title, detail) {
  app.innerHTML = `<main class="transition-screen"><div class="transition-mark">${brand}<span class="transition-ring"></span></div><p class="eyebrow">PRIVATE MODE</p><h1>${esc(title)}</h1><p class="transition-detail">${esc(detail)}</p><div class="transition-progress"><span></span></div></main>`;
  return wait(520).then(action);
}

function login(message = "") {
  app.innerHTML = `<main class="login-page drag-stage ${message ? "has-message" : ""}" id="drag-stage">
    <div class="login-grid"></div>
    <div class="login-copy"><p class="eyebrow">A PRIVATE WEB SHELF</p><h1>Keep the good<br><em>things</em> close.</h1><p>Drag the mark to the left to reveal your private shelf.</p></div>
    <div class="logo-slot"><div class="drag-logo" id="drag-logo"><span class="drag-track">DRAG LEFT</span><img src="/nuke-logo.svg" alt="Drag the Nuke mark left" draggable="false"></div></div>
    <div class="login-card" id="login-card">
      ${brand}
      <p class="eyebrow">WELCOME BACK</p>
      <h2>Enter your password</h2>
      <p class="login-subtitle">Your projects are waiting on the other side.</p>
      <form id="login-form">
        <label>Password<input type="password" name="password" autocomplete="current-password" placeholder="Enter your password"></label>
        <button class="primary" type="submit"><span class="button-label">Enter Nuke</span><span>↗</span></button>
        ${message ? `<p class="error">${esc(message)}</p>` : ""}
      </form>
    </div>
    <div class="login-footer"><span>PERSONAL / PRIVATE / YOURS</span><span>NUKE 01</span></div>
  </main>`;

  const stage = document.querySelector("#drag-stage");
  const dragLogo = document.querySelector("#drag-logo");
  const loginCard = document.querySelector("#login-card");
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  let unlocked = false;
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let originX = 0;
  let originY = 0;

  function unlock(instant = false) {
    if (unlocked) return;
    unlocked = true;
    dragging = false;
    dragLogo.style.transform = "";
    stage.classList.add("unlocked");
    const reveal = () => {
      loginCard.classList.add("visible");
      document.querySelector('[name="password"]')?.focus();
    };
    instant ? reveal() : setTimeout(reveal, 260);
  }

  function pointerDown(event) {
    if (unlocked) return;
    dragging = true;
    dragLogo.setPointerCapture(event.pointerId);
    const rect = dragLogo.getBoundingClientRect();
    startX = event.clientX;
    startY = event.clientY;
    originX = rect.left + rect.width / 2;
    originY = rect.top + rect.height / 2;
    dragLogo.classList.add("is-dragging");
    stage.classList.add("is-dragging");
  }

  function pointerMove(event) {
    if (!dragging) return;
    event.preventDefault();
    const stageRect = stage.getBoundingClientRect();
    const margin = 60;
    const targetX = clamp(originX + (event.clientX - startX), stageRect.left + margin, stageRect.right - margin);
    const targetY = clamp(originY + (event.clientY - startY), stageRect.top + margin, stageRect.bottom - margin);
    dragLogo.style.transform = `translate(${targetX - originX}px, ${targetY - originY}px)`;
  }

  function pointerUp() {
    if (!dragging) return;
    dragging = false;
    dragLogo.classList.remove("is-dragging");
    stage.classList.remove("is-dragging");
    const rect = dragLogo.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const draggedLeftEnough = originX - centerX > 120;
    const onLeftSide = centerX < window.innerWidth * 0.48;
    if (draggedLeftEnough && onLeftSide) {
      unlock();
      return;
    }
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

  document.querySelector("#login-form").onsubmit = async (event) => {
    event.preventDefault();
    const button = event.target.querySelector("button[type=submit]");
    button.disabled = true;
    button.innerHTML = `<span class="button-spinner"></span><span class="button-label">Checking...</span>`;
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ password: new FormData(event.target).get("password") }),
      });
      await transitionTo(loadDashboard, "Opening your shelf", "Syncing your projects");
    } catch (error) {
      login(error.message);
    }
  };
}

async function loadDashboard() {
  try {
    state.projects = await api("/api/projects");
    renderDashboard();
  } catch (error) {
    if (error.message.includes("DATABASE_URL") || error.message.includes("NUKE_PASSWORD")) renderDashboard(error.message);
    else login(error.message);
  }
}

function renderDashboard(configError = "") {
  shell(`<header class="topbar"><div><p class="eyebrow">COMMAND CENTER</p><h1>Good to see you.</h1><p class="topbar-subtitle">Your personal collection, ready when you are.</p></div><div class="top-actions"><button class="ghost" id="logout">Log out</button><button class="primary small" id="new-project"><span>+</span> New project</button></div></header>${configError ? `<div class="notice">${esc(configError)}<br><span>Set the variables and restart the app to unlock your shelf.</span></div>` : ""}<section class="summary"><div><span class="summary-label">LIVE PROJECTS</span><strong>${state.projects.length.toString().padStart(2, "0")}</strong><span class="summary-note">on your shelf</span></div><div><span class="summary-label">HOSTED HTML</span><strong>${state.projects.filter((project) => project.kind === "html").length.toString().padStart(2, "0")}</strong><span class="summary-note">ready to open</span></div><div><span class="summary-label">EXTERNAL LINKS</span><strong>${state.projects.filter((project) => project.kind === "external").length.toString().padStart(2, "0")}</strong><span class="summary-note">saved for later</span></div></section><div class="section-heading"><div><p class="eyebrow">YOUR SHELF</p><h2>All projects</h2></div><span class="mono">${state.projects.length ? "UPDATED RECENTLY" : "NOTHING HERE YET"}</span></div><div class="project-grid">${state.projects.length ? state.projects.map(projectCard).join("") : `<div class="empty"><span class="empty-mark">✦</span><h3>Your shelf is clear.</h3><p>Drop in a standalone HTML file or save a site you want close by.</p><button class="secondary" id="empty-new">Create your first project</button></div>`}</div>`);
  document.querySelector("#new-project").onclick = () => openEditor();
  document.querySelector("#logout").onclick = async () => {
    const button = document.querySelector("#logout");
    button.disabled = true;
    button.innerHTML = `<span class="button-spinner dark"></span> Locking...`;
    try {
      await api("/api/auth/logout", { method: "POST" });
      await transitionTo(() => login(), "Locking your shelf", "Your private session is closing");
    } catch (error) {
      button.disabled = false;
      button.textContent = "Log out";
      showToast(error.message, "error");
    }
  };
  document.querySelector("#empty-new")?.addEventListener("click", () => openEditor());
  document.querySelectorAll("[data-edit]").forEach((button) => {
    button.onclick = () => openEditor(state.projects.find((project) => project.id == button.dataset.edit));
  });
  document.querySelectorAll("[data-delete]").forEach((button) => {
    button.onclick = async () => {
      if (!confirm("Delete this project?")) return;
      button.disabled = true;
      button.innerHTML = `<span class="button-spinner dark"></span>`;
      try {
        await api(`/api/projects/${button.dataset.delete}`, { method: "DELETE" });
        await loadDashboard();
        showToast("Project removed", "success");
      } catch (error) {
        button.disabled = false;
        button.textContent = "×";
        showToast(error.message, "error");
      }
    };
  });
}

function projectCard(project) {
  return `<article class="project-card"><div class="card-top"><span class="type-pill ${project.kind}">${project.kind === "html" ? "HTML" : "LINK"}</span><button class="kebab" data-edit="${project.id}" aria-label="Edit ${esc(project.name)}">•••</button></div><h3>${esc(project.name)}</h3><p class="project-url">/${esc(project.slug)}</p><div class="card-foot"><a class="open-link" href="/${encodeURIComponent(project.slug)}" target="_blank" rel="noreferrer">Open live <span>↗</span></a><div class="card-actions"><button class="icon-btn" data-edit="${project.id}" aria-label="Edit">✎</button><button class="icon-btn danger" data-delete="${project.id}" aria-label="Delete">×</button></div></div></article>`;
}

function openEditor(project = null) {
  state.editing = project;
  state.formKind = project?.kind || "html";
  app.insertAdjacentHTML("beforeend", `<div class="modal-backdrop"><section class="modal"><div class="modal-head"><div><p class="eyebrow">${project ? "EDIT PROJECT" : "NEW PROJECT"}</p><h2>${project ? "Refine your project." : "Add to your shelf."}</h2><p class="modal-subtitle">${project ? "Keep the details current and the path memorable." : "Give something good a permanent place."}</p></div><button class="close" id="close-modal" aria-label="Close">×</button></div><form id="project-form"><label>Name<input name="name" required value="${esc(project?.name || "")}" placeholder="My portfolio"></label><label>URL slug<div class="slug-field"><span>/</span><input name="slug" required value="${esc(project?.slug || "")}" placeholder="my-portfolio"></div></label><div class="field-label">What are you saving?</div><div class="segmented"><button type="button" class="${state.formKind === "html" ? "active" : ""}" data-kind="html">HTML file</button><button type="button" class="${state.formKind === "external" ? "active" : ""}" data-kind="external">External link</button></div><div id="kind-fields"></div><p id="form-error" class="error"></p><div class="modal-actions"><button type="button" class="secondary" id="cancel-modal">Cancel</button><button class="primary" type="submit"><span class="button-label">${project ? "Save changes" : "Save project"}</span><span>↗</span></button></div></form></section></div>`);
  const name = document.querySelector('[name="name"]');
  name.oninput = () => {
    if (!project) document.querySelector('[name="slug"]').value = slugify(name.value);
  };
  document.querySelectorAll("[data-kind]").forEach((button) => {
    button.onclick = () => {
      state.formKind = button.dataset.kind;
      document.querySelectorAll("[data-kind]").forEach((item) => item.classList.toggle("active", item === button));
      renderKindFields(project);
    };
  });
  renderKindFields(project);
  document.querySelector("#close-modal").onclick = closeEditor;
  document.querySelector("#cancel-modal").onclick = closeEditor;
  document.querySelector("#project-form").onsubmit = submitProject;
}

function renderKindFields(project) {
  const wrap = document.querySelector("#kind-fields");
  if (!wrap) return;
  wrap.innerHTML = state.formKind === "html"
    ? `<label>HTML content${project ? `<textarea name="content" rows="9" placeholder="Paste your HTML here">${esc(project?.content || "")}</textarea>` : `<input type="file" name="file" accept=".html,.htm,text/html"><textarea name="content" rows="6" placeholder="Or paste your HTML here"></textarea>`}</label>`
    : `<label>Website URL<input name="externalUrl" type="url" required value="${esc(project?.external_url || "")}" placeholder="https://example.com"></label><p class="field-help">The site will open at your Nuke URL with a handy external fallback.</p>`;
  const file = document.querySelector('[name="file"]');
  file?.addEventListener("change", async () => {
    const selected = file.files[0];
    if (selected) document.querySelector('[name="content"]').value = await selected.text();
  });
}

async function submitProject(event) {
  event.preventDefault();
  const form = event.target;
  const button = form.querySelector('button[type="submit"]');
  const label = button.querySelector(".button-label");
  const isEditing = Boolean(state.editing);
  const formData = new FormData(form);
  const payload = {
    name: formData.get("name"),
    slug: formData.get("slug"),
    kind: state.formKind,
    content: formData.get("content"),
    externalUrl: formData.get("externalUrl"),
  };
  button.disabled = true;
  label.textContent = isEditing ? "Saving..." : "Creating...";
  button.classList.add("is-saving");
  try {
    await api(isEditing ? `/api/projects/${state.editing.id}` : "/api/projects", {
      method: isEditing ? "PUT" : "POST",
      body: JSON.stringify(payload),
    });
    closeEditor();
    await loadDashboard();
    showToast(isEditing ? "Changes saved" : "Project created", "success");
  } catch (error) {
    button.disabled = false;
    button.classList.remove("is-saving");
    label.textContent = isEditing ? "Save changes" : "Save project";
    document.querySelector("#form-error").textContent = error.message;
  }
}

function closeEditor() {
  document.querySelector(".modal-backdrop")?.classList.add("closing");
  setTimeout(() => document.querySelector(".modal-backdrop")?.remove(), 180);
  state.editing = null;
}

function showToast(message, type = "success") {
  document.querySelector(".toast")?.remove();
  document.body.insertAdjacentHTML("beforeend", `<div class="toast ${type}" role="status"><span class="toast-icon">${type === "success" ? "✓" : "!"}</span><span>${esc(message)}</span></div>`);
  setTimeout(() => document.querySelector(".toast")?.classList.add("leaving"), 2600);
  setTimeout(() => document.querySelector(".toast")?.remove(), 3000);
}

api("/api/auth/session").then((session) => session.authenticated ? loadDashboard() : login()).catch(() => login("Start the server and set your environment variables first."));