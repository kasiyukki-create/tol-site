
/* =========================
   接続設定（ここだけ差し替え）
========================= */

// 例: APIが /api/admin/... にあるなら "" のまま
// 例: APIが http://localhost:8080/admin/... なら "http://localhost:8080"
const API_BASE = "";

// 既存APIに合わせて変えてOK
const ENDPOINTS = {
  stats:  "/api/admin/stats",         // GET: { postCount, userCount, lastUpdated }
  users:  "/api/admin/users",         // GET/POST/PATCH/DELETE
  posts:  "/api/admin/posts",         // GET/POST
  post:   (id)=>`/api/admin/posts/${id}`, // GET/PATCH/DELETE
  revs:   (id)=>`/api/admin/posts/${id}/revisions`, // GET
  perms:  "/api/admin/permissions",   // GET/PATCH
  settings:"/api/admin/settings",     // GET/PATCH
  login:  "/api/admin/login"          // POST: {email,password} => {token}
};

// もしあなたのAPIが「クッキーセッション」で動くなら token不要。
// token方式なら loginでtokenを保存してAuthorizationに付ける。
const AUTH_MODE = "token"; // "token" | "cookie"

/* =========================
   共通ユーティリティ
========================= */

function qs(id){ return document.getElementById(id); }
function escapeHtml(s){
  return (s ?? "").toString()
    .replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function getToken(){ return localStorage.getItem("admin_v2_token") || ""; }
function setToken(t){ localStorage.setItem("admin_v2_token", t); }
function clearToken(){ localStorage.removeItem("admin_v2_token"); }

function guard(){
  if (AUTH_MODE === "cookie") return true;
  const t = getToken();
  if (!t) { location.href = "./kanri_login.html"; return false; }
  return true;
}

async function apiFetch(path, options={}){
  const headers = options.headers ? {...options.headers} : {};
  if (!headers["Content-Type"] && options.body) headers["Content-Type"] = "application/json";
  if (AUTH_MODE === "token") {
    const t = getToken();
    if (t) headers["Authorization"] = `Bearer ${t}`;
  }
  const res = await fetch(API_BASE + path, { ...options, headers, credentials: "include" });
  if (!res.ok) {
    const txt = await res.text().catch(()=> "");
    throw new Error(`HTTP ${res.status}: ${txt || res.statusText}`);
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return await res.json();
  return await res.text();
}

function logout(){
  clearToken();
  location.href = "./kanri_login.html";
}

/* =========================
   Login
========================= */

async function loginSubmit(){
  const email = (qs("email").value || "").trim();
  const password = (qs("password").value || "").trim();
  qs("msg").textContent = "";
  try{
    if (AUTH_MODE === "cookie") {
      await apiFetch(ENDPOINTS.login, { method:"POST", body: JSON.stringify({email,password}) });
      location.href = "./kanri_dashboard.html";
      return;
    }
    const data = await apiFetch(ENDPOINTS.login, { method:"POST", body: JSON.stringify({email,password}) });
    if (!data.token) throw new Error("tokenが返ってきません");
    setToken(data.token);
    location.href = "./kanri_dashboard.html";
  }catch(e){
    qs("msg").textContent = e.message || "ログイン失敗";
    qs("msg").className = "bad";
  }
}

/* =========================
   Dashboard
========================= */

async function loadDashboard(){
  if (!guard()) return;
  qs("logoutBtn").onclick = logout;

  try{
    const s = await apiFetch(ENDPOINTS.stats);
    qs("postCount").textContent = s.postCount ?? "-";
    qs("userCount").textContent = s.userCount ?? "-";
    qs("lastUpdated").textContent = s.lastUpdated ?? "-";
  }catch(e){
    qs("dashMsg").textContent = e.message;
    qs("dashMsg").className = "bad";
  }
}

/* =========================
   Users
========================= */

async function loadUsers(){
  if (!guard()) return;
  qs("logoutBtn").onclick = logout;

  async function refresh(){
    const list = await apiFetch(ENDPOINTS.users);
    const tbody = qs("usersTbody");
    tbody.innerHTML = "";
    for (const u of list){
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(u.email)}</td>
        <td>${escapeHtml(u.role)}</td>
        <td>${u.status === "ACTIVE" ? `<span class="ok">有効</span>` : `<span class="bad">停止</span>`}</td>
        <td>
          <div class="btnRow" style="margin-top:0">
            <button class="btn btnGhost" data-act="toggle" data-id="${u.id}" data-status="${u.status}">
              ${u.status === "ACTIVE" ? "Suspend" : "Activate"}
            </button>
            <button class="btn" data-act="del" data-id="${u.id}">Delete</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    }
    qs("usersSummary").textContent = `有効: ${list.filter(x=>x.status==="ACTIVE").length} / 全体: ${list.length}`;
  }

  qs("addBtn").onclick = async ()=>{
    qs("usersMsg").textContent = "";
    try{
      const email = (qs("newEmail").value || "").trim();
      const password = (qs("newPass").value || "").trim();
      const role = qs("newRole").value;
      await apiFetch(ENDPOINTS.users, { method:"POST", body: JSON.stringify({ email, password, role }) });
      qs("newEmail").value = "";
      qs("newPass").value = "";
      qs("newRole").value = "VIEWER";
      await refresh();
    }catch(e){
      qs("usersMsg").textContent = e.message;
      qs("usersMsg").className = "bad";
    }
  };

  qs("usersTbody").onclick = async (ev)=>{
    const btn = ev.target.closest("button");
    if (!btn) return;
    const act = btn.dataset.act;
    const id = btn.dataset.id;

    qs("usersMsg").textContent = "";
    try{
      if (act === "toggle"){
        const next = (btn.dataset.status === "ACTIVE") ? "SUSPENDED" : "ACTIVE";
        await apiFetch(ENDPOINTS.users, { method:"PATCH", body: JSON.stringify({ id, status: next }) });
      }
      if (act === "del"){
        await apiFetch(ENDPOINTS.users + `?id=${encodeURIComponent(id)}`, { method:"DELETE" });
      }
      await refresh();
    }catch(e){
      qs("usersMsg").textContent = e.message;
      qs("usersMsg").className = "bad";
    }
  };

  try{ await refresh(); }catch(e){
    qs("usersMsg").textContent = e.message;
    qs("usersMsg").className = "bad";
  }
}

/* =========================
   Content
========================= */

async function loadContent(){
  if (!guard()) return;
  qs("logoutBtn").onclick = logout;

  let editingId = null;

  async function refreshList(){
    const list = await apiFetch(ENDPOINTS.posts);
    const wrap = qs("postList");
    wrap.innerHTML = "";
    for (const p of list){
      const div = document.createElement("div");
      div.className = "card";
      div.style.padding = "14px";
      div.innerHTML = `
        <div class="cardLabel">${escapeHtml(p.status)} / 更新: ${escapeHtml(p.updatedAt)}</div>
        <div style="display:flex;justify-content:space-between;gap:12px;margin-top:8px;">
          <div style="min-width:0">
            <div style="font-size:18px;font-weight:900;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
              ${escapeHtml(p.title)}
            </div>
            <div class="small">slug: ${escapeHtml(p.slug)}</div>
          </div>
          <div class="btnRow" style="margin-top:0">
            <button class="btn btnGhost" data-act="edit" data-id="${p.id}">Edit</button>
            <button class="btn" data-act="del" data-id="${p.id}">Delete</button>
          </div>
        </div>
      `;
      wrap.appendChild(div);
    }
  }

  async function refreshRevs(id){
    const revs = await apiFetch(ENDPOINTS.revs(id));
    const ul = qs("revList");
    ul.innerHTML = "";
    for (const r of revs){
      const li = document.createElement("li");
      li.className = "small";
      li.style.marginBottom = "6px";
      li.textContent = `${r.createdAt} / ${r.status} / ${r.title}`;
      ul.appendChild(li);
    }
  }

  function clearForm(){
    editingId = null;
    qs("title").value = "";
    qs("status").value = "DRAFT";
    qs("content").value = "";
    qs("mode").textContent = "新規作成";
    qs("revBlock").style.display = "none";
    qs("revList").innerHTML = "";
    updatePreview();
  }

  function updatePreview(){
    qs("pvStatus").textContent = qs("status").value;
    qs("pvTitle").textContent = qs("title").value || "（タイトル）";
    qs("pvBody").textContent  = qs("content").value || "（本文）";
  }

  qs("title").oninput = updatePreview;
  qs("status").onchange = updatePreview;
  qs("content").oninput = updatePreview;

  qs("saveBtn").onclick = async ()=>{
    qs("contentMsg").textContent = "";
    try{
      const payload = {
        title: (qs("title").value || "").trim(),
        status: qs("status").value,
        content: qs("content").value || ""
      };
      if (!payload.title) throw new Error("タイトルが必要です");

      if (!editingId){
        await apiFetch(ENDPOINTS.posts, { method:"POST", body: JSON.stringify(payload) });
      }else{
        await apiFetch(ENDPOINTS.post(editingId), { method:"PATCH", body: JSON.stringify(payload) });
        await refreshRevs(editingId);
      }
      await refreshList();
      clearForm();
    }catch(e){
      qs("contentMsg").textContent = e.message;
      qs("contentMsg").className = "bad";
    }
  };

  qs("clearBtn").onclick = clearForm;

  qs("postList").onclick = async (ev)=>{
    const btn = ev.target.closest("button");
    if (!btn) return;
    const act = btn.dataset.act;
    const id = btn.dataset.id;

    qs("contentMsg").textContent = "";
    try{
      if (act === "del"){
        await apiFetch(ENDPOINTS.post(id), { method:"DELETE" });
        await refreshList();
        if (editingId === id) clearForm();
        return;
      }
      if (act === "edit"){
        const p = await apiFetch(ENDPOINTS.post(id)); // GET detail
        editingId = p.id;
        qs("mode").textContent = "編集";
        qs("title").value = p.title || "";
        qs("status").value = p.status || "DRAFT";
        qs("content").value = p.content || "";
        updatePreview();
        qs("revBlock").style.display = "block";
        await refreshRevs(id);
      }
    }catch(e){
      qs("contentMsg").textContent = e.message;
      qs("contentMsg").className = "bad";
    }
  };

  try{
    await refreshList();
    clearForm();
  }catch(e){
    qs("contentMsg").textContent = e.message;
    qs("contentMsg").className = "bad";
  }
}

/* =========================
   Roles
========================= */

async function loadRoles(){
  if (!guard()) return;
  qs("logoutBtn").onclick = logout;

  async function refresh(){
    const perms = await apiFetch(ENDPOINTS.perms);
    const tbody = qs("rolesTbody");
    tbody.innerHTML = "";
    for (const p of perms){
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><b>${escapeHtml(p.role)}</b></td>
        ${["dashboard","users","content","roles","settings"].map(k=>`
          <td><input type="checkbox" data-k="${k}" ${p[k] ? "checked":""}></td>
        `).join("")}
        <td><button class="btn btnGhost" data-act="save">Save</button></td>
      `;
      tr.dataset.role = p.role;
      tbody.appendChild(tr);
    }
  }

  qs("rolesTbody").onclick = async (ev)=>{
    const btn = ev.target.closest("button");
    if (!btn) return;
    if (btn.dataset.act !== "save") return;

    const tr = btn.closest("tr");
    const role = tr.dataset.role;
    const payload = { role };

    tr.querySelectorAll("input[type=checkbox]").forEach(cb=>{
      payload[cb.dataset.k] = cb.checked;
    });

    qs("rolesMsg").textContent = "";
    try{
      await apiFetch(ENDPOINTS.perms, { method:"PATCH", body: JSON.stringify(payload) });
      qs("rolesMsg").textContent = "保存OK";
      qs("rolesMsg").className = "ok";
      await refresh();
    }catch(e){
      qs("rolesMsg").textContent = e.message;
      qs("rolesMsg").className = "bad";
    }
  };

  try{ await refresh(); }catch(e){
    qs("rolesMsg").textContent = e.message;
    qs("rolesMsg").className = "bad";
  }
}

/* =========================
   Settings
========================= */

async function loadSettings(){
  if (!guard()) return;
  qs("logoutBtn").onclick = logout;

  async function refresh(){
    const s = await apiFetch(ENDPOINTS.settings);
    qs("siteName").value = s.siteName ?? "";
    qs("logoUrl").value = s.logoUrl ?? "";
    qs("mailFrom").value = s.mailFrom ?? "";
    qs("displayConfig").value = s.displayConfig ?? "{}";
  }

  qs("saveBtn").onclick = async ()=>{
    qs("settingsMsg").textContent = "";
    try{
      // JSONチェック
      JSON.parse(qs("displayConfig").value || "{}");
      await apiFetch(ENDPOINTS.settings, {
        method:"PATCH",
        body: JSON.stringify({
          siteName: qs("siteName").value,
          logoUrl: qs("logoUrl").value,
          mailFrom: qs("mailFrom").value,
          displayConfig: qs("displayConfig").value
        })
      });
      qs("settingsMsg").textContent = "保存OK";
      qs("settingsMsg").className = "ok";
    }catch(e){
      qs("settingsMsg").textContent = e.message;
      qs("settingsMsg").className = "bad";
    }
  };

  qs("reloadBtn").onclick = refresh;

  try{ await refresh(); }catch(e){
    qs("settingsMsg").textContent = e.message;
    qs("settingsMsg").className = "bad";
  }
}
