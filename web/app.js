"use strict";

const $ = (s) => document.querySelector(s);
const state = { chatId: null, sending: false, cache: {}, chats: [], pendingFile: null };

// ── tiny helpers ──────────────────────────────────────────────────
function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}
function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function toast(msg, bad) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast" + (bad ? " bad" : "");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add("hidden"), 3200);
}

// ── markdown-lite (escape first, then format) ─────────────────────
function inline(s) {
  return s
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}
function renderMarkdown(src) {
  const codes = [];
  let text = escapeHtml(src).replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, body) => {
    codes.push(`<pre><code>${body.replace(/\n$/, "")}</code></pre>`);
    return ` ${codes.length - 1} `;
  });
  const lines = text.split("\n");
  let html = "", para = [], list = null;
  const flushP = () => { if (para.length) { html += `<p>${inline(para.join("<br>"))}</p>`; para = []; } };
  const flushList = () => { if (list) { html += `<${list.t}>${list.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${list.t}>`; list = null; } };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    let m;
    if ((m = line.match(/^ (\d+) $/))) { flushP(); flushList(); html += codes[+m[1]]; continue; }
    if ((m = line.match(/^(#{1,3})\s+(.*)/))) { flushP(); flushList(); html += `<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`; continue; }
    if ((m = line.match(/^\s*[-*]\s+(.*)/))) { flushP(); if (!list || list.t !== "ul") { flushList(); list = { t: "ul", items: [] }; } list.items.push(m[1]); continue; }
    if ((m = line.match(/^\s*\d+\.\s+(.*)/))) { flushP(); if (!list || list.t !== "ol") { flushList(); list = { t: "ol", items: [] }; } list.items.push(m[1]); continue; }
    if (line.trim() === "") { flushP(); flushList(); continue; }
    flushList(); para.push(line);
  }
  flushP(); flushList();
  return html || "<p></p>";
}

// ── API ───────────────────────────────────────────────────────────
async function api(path, opts) {
  const r = await fetch(path, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || data.hint || `HTTP ${r.status}`);
  return data;
}

// ── messages ──────────────────────────────────────────────────────
function appendImages(bubble, images) {
  (images || []).forEach((src) => {
    const img = el("img", "msg-img");
    img.src = src.startsWith("data:") ? src : "data:image/png;base64," + src;
    bubble.appendChild(img);
  });
}
function appendFiles(bubble, files) {
  if (!(files || []).length) return;
  const box = el("div", "msg-files");
  files.forEach((name) => box.appendChild(el("div", "msg-file", `<span class="ic">📎</span>${escapeHtml(name)}`)));
  bubble.appendChild(box);
}
function messageNode(role, { text, images, files } = {}) {
  const wrap = el("div", `msg ${role}`);
  const av = el("div", "avatar", role === "user" ? "you" : "✦");
  const body = el("div", "body");
  body.appendChild(el("div", "who", role === "user" ? "You" : "conjure"));
  const bubble = el("div", "bubble");
  if (text) bubble.innerHTML = renderMarkdown(text);
  appendImages(bubble, images);
  appendFiles(bubble, files);
  body.appendChild(bubble);
  wrap.append(av, body);
  return { wrap, bubble };
}
function addMessage(role, payload) {
  const { wrap, bubble } = messageNode(role, payload);
  $("#thread").appendChild(wrap);
  scrollDown();
  return bubble;
}
function scrollDown() { const t = $("#thread"); t.scrollTop = t.scrollHeight; }
function clearThread(emptyState) {
  const t = $("#thread");
  t.innerHTML = "";
  if (emptyState) {
    const e = el("div", "thread-inner-empty");
    e.innerHTML = `<div class="big">conjure <span class="em">✦</span></div><div>Start a new conversation, or open one from the left.</div>`;
    t.appendChild(e);
  }
}

// ── chat list ─────────────────────────────────────────────────────
function saveChatsCache() { try { localStorage.setItem("conjure.chats", JSON.stringify(state.chats)); } catch (e) {} }
function loadChatsCache() {
  try {
    const c = JSON.parse(localStorage.getItem("conjure.chats") || "[]");
    if (Array.isArray(c) && c.length) { state.chats = c; renderChatList(); }
  } catch (e) {}
}
async function loadChats() {
  const list = $("#chat-list");
  // Only show skeletons if we have nothing cached to show meanwhile.
  if (!state.chats.length) list.innerHTML = `<div class="skeleton s3"></div><div class="skeleton s2"></div><div class="skeleton s3"></div><div class="skeleton"></div>`;
  try {
    const data = await api("/chats");
    state.chats = data.conversations || [];
    renderChatList();
    saveChatsCache();
  } catch (e) {
    if (!state.chats.length) list.innerHTML = `<div class="chat-item" style="color:var(--bad)">couldn't load chats</div>`;
  }
}
function renderChatList() {
  const list = $("#chat-list");
  list.innerHTML = "";
  if (!state.chats.length) { list.appendChild(el("div", "chat-item", "no conversations yet")); return; }
  for (const c of state.chats) {
    const item = el("button", "chat-item" + (c.id === state.chatId ? " active" : ""), escapeHtml(c.title || "(untitled)"));
    item.title = c.title || c.id;
    item.onclick = () => openChat(c.id);
    list.appendChild(item);
  }
}

async function openChat(id) {
  if (state.sending) return;
  state.chatId = id;
  const meta = state.chats.find((c) => c.id === id);
  $("#thread-title").textContent = meta ? meta.title : "Conversation";
  renderChatList();
  if (state.cache[id]) { renderTranscript(state.cache[id]); return; }
  clearThread();
  $("#thread").appendChild(el("div", "thread-inner-empty", `<div class="conjuring"><span class="orb"></span> loading conversation…</div>`));
  try {
    const data = await api("/chats/" + id);
    state.cache[id] = data.messages || [];
    if (state.chatId === id) renderTranscript(state.cache[id]);
  } catch (e) {
    clearThread();
    addMessage("assistant", { text: "_Couldn't load this conversation: " + e.message + "_" });
  }
}
function renderTranscript(messages) {
  clearThread(messages.length === 0);
  for (const m of messages) addMessage(m.role, { text: m.text, images: m.images, files: m.files });
}

// ── attachments ───────────────────────────────────────────────────
function refreshSend() { $("#send").disabled = state.sending || !($("#input").value.trim() || state.pendingFile); }
function clearAttach() {
  state.pendingFile = null;
  const chip = $("#attach-chip");
  chip.classList.add("hidden"); chip.innerHTML = "";
  refreshSend();
}
function showAttachChip(file) {
  const chip = $("#attach-chip");
  const preview = file.mime.startsWith("image/")
    ? `<img src="data:${file.mime};base64,${file.data}" alt="" />`
    : `<span class="ic">📎</span>`;
  chip.innerHTML = `${preview}<span class="name">${escapeHtml(file.name)}</span><button class="rm" aria-label="Remove attachment">✕</button>`;
  chip.classList.remove("hidden");
  chip.querySelector(".rm").onclick = clearAttach;
}

// ── sending ───────────────────────────────────────────────────────
function setSending(on) {
  state.sending = on;
  $("#input").disabled = on;
  $("#new-chat").disabled = on;
  $("#attach").disabled = on;
  refreshSend();
}
async function sendMessage(text) {
  const file = state.pendingFile;
  setSending(true);
  if ($(".thread-inner-empty")) clearThread();

  const echo = { text };
  if (file) {
    if (file.mime.startsWith("image/")) echo.images = [`data:${file.mime};base64,${file.data}`];
    else echo.files = [file.name];
  }
  addMessage("user", echo);
  clearAttach();
  const placeholder = addMessage("assistant", {});
  placeholder.innerHTML = `<span class="conjuring"><span class="orb"></span> conjuring…</span>`;

  try {
    const payload = { message: text, conversation_id: state.chatId };
    if (file) payload.file = { name: file.name, data: file.data };
    const data = await api("/chat", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });

    placeholder.innerHTML = data.reply ? renderMarkdown(data.reply) : "";
    appendImages(placeholder, data.images);
    if (!data.reply && !(data.images || []).length) placeholder.innerHTML = "<em>(no reply)</em>";

    const isNew = !state.chatId;
    state.chatId = data.conversation_id || state.chatId;
    if (data.title) $("#thread-title").textContent = data.title;  // header now, not after loadChats

    if (state.chatId) {
      const cache = state.cache[state.chatId] || [];
      cache.push({ role: "user", text, images: echo.images || [], files: echo.files || [] });
      cache.push({ role: "assistant", text: data.reply || "", images: data.images || [], files: [] });
      state.cache[state.chatId] = cache;
    }
    if (isNew) await loadChats();
    // Patch the sidebar entry's title to the authoritative one from the reply.
    if (data.title) {
      const meta = state.chats.find((c) => c.id === state.chatId);
      if (meta) meta.title = data.title;
    }
    renderChatList();
    scrollDown();
  } catch (e) {
    placeholder.classList.add("bubble");
    placeholder.innerHTML = `<em style="color:var(--bad)">${escapeHtml(e.message)}</em>`;
    toast(e.message, true);
  } finally {
    setSending(false);
    $("#input").focus();
  }
}

// ── keys ──────────────────────────────────────────────────────────
async function loadKeys() {
  const ul = $("#key-list"); ul.innerHTML = "";
  try {
    const { keys } = await api("/keys");
    if (!keys.length) { ul.appendChild(el("li", null, "<span>No keys yet.</span>")); return; }
    for (const k of keys) {
      const li = el("li");
      li.innerHTML = `<span><strong>${escapeHtml(k.label)}</strong> <span class="meta">${k.prefix}…</span></span>`;
      const b = el("button", null, "revoke");
      b.onclick = async () => { await api("/keys/" + encodeURIComponent(k.prefix), { method: "DELETE" }); loadKeys(); toast("Key revoked"); };
      li.appendChild(b); ul.appendChild(li);
    }
  } catch (e) { ul.innerHTML = `<li style="color:var(--bad)">${escapeHtml(e.message)}</li>`; }
}

// ── wiring ────────────────────────────────────────────────────────
function autosize() { const i = $("#input"); i.style.height = "auto"; i.style.height = Math.min(i.scrollHeight, 200) + "px"; }

window.addEventListener("DOMContentLoaded", () => {
  clearThread(true);
  loadChatsCache();  // paint the sidebar instantly from cache…
  loadChats();       // …then refresh in the background

  $("#new-chat").onclick = () => {
    if (state.sending) return;
    state.chatId = null;
    $("#thread-title").textContent = "New chat";
    clearThread(true);
    clearAttach();
    renderChatList();
    $("#input").focus();
  };

  const input = $("#input");
  input.addEventListener("input", () => { autosize(); refreshSend(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#composer").requestSubmit(); }
  });
  $("#composer").addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if ((!text && !state.pendingFile) || state.sending) return;
    input.value = ""; autosize();
    sendMessage(text);
  });

  // attachments
  $("#attach").onclick = () => { if (!state.sending) $("#file-input").click(); };
  $("#file-input").addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      const data = (r.result || "").split(",")[1] || "";
      state.pendingFile = { name: f.name, mime: f.type || "application/octet-stream", data };
      showAttachChip(state.pendingFile);
      refreshSend();
    };
    r.readAsDataURL(f);
    e.target.value = "";
  });

  // keys
  $("#open-keys").onclick = () => { $("#keys-modal").classList.remove("hidden"); $("#key-reveal").classList.add("hidden"); loadKeys(); };
  $("#keys-close").onclick = () => $("#keys-modal").classList.add("hidden");
  $("#keys-modal").addEventListener("click", (e) => { if (e.target.id === "keys-modal") $("#keys-modal").classList.add("hidden"); });
  $("#key-create").addEventListener("submit", async (e) => {
    e.preventDefault();
    const label = $("#key-label").value.trim() || "key";
    try {
      const k = await api("/keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label }) });
      const r = $("#key-reveal");
      r.classList.remove("hidden");
      r.innerHTML = `<span class="lbl">${escapeHtml(k.label)} — copy now, shown once:</span>${escapeHtml(k.key)}`;
      $("#key-label").value = "";
      loadKeys();
    } catch (e2) { toast(e2.message, true); }
  });

  const ping = () => api("/health").then(() => $("#conn").classList.remove("down")).catch(() => $("#conn").classList.add("down"));
  ping(); setInterval(ping, 15000);
});
