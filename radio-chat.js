(() => {
  const RADIO_JSON_URL = "./content/radio.json";
  const DEFAULT_WS =
    "wss://vps-e09ed6db.vps.ovh.net/hakou-studio/api/radio/chat";
  const NICK_KEY = "hakou-radio-chat-nick";
  const LOG = "[Hakou Chat]";
  const RECONNECT_MS = 2500;

  let ws = null;
  let reconnectTimer = null;
  let myId = null;
  let myNick = "";
  let editingNick = false;

  const $ = (id) => document.getElementById(id);

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setStatus(msg) {
    const el = $("radio-chat-status");
    if (el) el.textContent = msg || "";
  }

  function setNickDisplay(nick) {
    myNick = nick || "";
    const btn = $("radio-chat-nick");
    if (btn) btn.textContent = myNick || "…";
  }

  function appendMessage(msg) {
    const log = $("radio-chat-log");
    if (!log || !msg) return;
    const row = document.createElement("p");
    row.className = "radio-chat__msg";
    row.dataset.id = msg.id || "";
    const nick = document.createElement("span");
    nick.className = "radio-chat__msg-nick";
    nick.textContent = msg.nick || "?";
    const text = document.createElement("span");
    text.className = "radio-chat__msg-text";
    text.textContent = msg.text || "";
    row.append(nick, document.createTextNode(" "), text);
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
  }

  function renderMembers(members) {
    const list = $("radio-chat-members");
    const count = $("radio-chat-count");
    if (count) count.textContent = String(members?.length || 0);
    if (!list) return;
    list.replaceChildren();
    (members || []).forEach((m) => {
      const li = document.createElement("li");
      li.textContent = m.nick || m.id || "?";
      if (m.id && m.id === myId) li.classList.add("is-me");
      list.appendChild(li);
    });
  }

  function sendJson(payload) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(payload));
    return true;
  }

  function applySavedNick() {
    try {
      const saved = localStorage.getItem(NICK_KEY);
      if (saved && saved.trim().length >= 2) {
        sendJson({ type: "nick", nick: saved.trim().slice(0, 24) });
      }
    } catch {
      /* ignore */
    }
  }

  function connect(url) {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      ws = null;
    }

    setStatus("Connexion au chat…");
    try {
      ws = new WebSocket(url);
    } catch (err) {
      console.warn(LOG, err);
      setStatus("Chat indisponible.");
      scheduleReconnect(url);
      return;
    }

    ws.addEventListener("open", () => {
      setStatus("");
      applySavedNick();
    });

    ws.addEventListener("message", (ev) => {
      let data;
      try {
        data = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (data.type === "hello") {
        myId = data.id || myId;
        if (data.nick) setNickDisplay(data.nick);
        if (Array.isArray(data.history)) {
          const log = $("radio-chat-log");
          if (log && !log.childElementCount) {
            data.history.forEach(appendMessage);
          }
        }
        return;
      }
      if (data.type === "presence") {
        renderMembers(data.members || []);
        return;
      }
      if (data.type === "message" && data.message) {
        appendMessage(data.message);
        return;
      }
      if (data.type === "error") {
        setStatus(data.error || "Erreur chat");
      }
    });

    ws.addEventListener("close", () => {
      setStatus("Chat déconnecté — reconnexion…");
      scheduleReconnect(url);
    });

    ws.addEventListener("error", () => {
      /* close handler reconnects */
    });
  }

  function scheduleReconnect(url) {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect(url);
    }, RECONNECT_MS);
  }

  function startNickEdit() {
    const btn = $("radio-chat-nick");
    const wrap = $("radio-chat-nick-edit");
    const input = $("radio-chat-nick-input");
    if (!btn || !wrap || !input || editingNick) return;
    editingNick = true;
    btn.hidden = true;
    wrap.hidden = false;
    input.value = myNick;
    input.focus();
    input.select();
  }

  function finishNickEdit(save) {
    const btn = $("radio-chat-nick");
    const wrap = $("radio-chat-nick-edit");
    const input = $("radio-chat-nick-input");
    if (!btn || !wrap || !input || !editingNick) return;
    editingNick = false;
    wrap.hidden = true;
    btn.hidden = false;
    if (!save) return;
    const nick = input.value.trim().slice(0, 24);
    if (nick.length < 2) {
      setStatus("Pseudo trop court.");
      return;
    }
    try {
      localStorage.setItem(NICK_KEY, nick);
    } catch {
      /* ignore */
    }
    setNickDisplay(nick);
    if (!sendJson({ type: "nick", nick })) {
      setStatus("Hors ligne — pseudo enregistré localement.");
    }
  }

  async function resolveWsUrl() {
    try {
      const res = await fetch(RADIO_JSON_URL, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (typeof data.chatWsUrl === "string" && data.chatWsUrl.trim()) {
          return data.chatWsUrl.trim();
        }
      }
    } catch {
      /* default */
    }
    return DEFAULT_WS;
  }

  async function init() {
    if (!$("radio-chat")) return;

    $("radio-chat-nick")?.addEventListener("click", startNickEdit);
    $("radio-chat-nick-input")?.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        finishNickEdit(true);
      } else if (ev.key === "Escape") {
        finishNickEdit(false);
      }
    });
    $("radio-chat-nick-input")?.addEventListener("blur", () => {
      finishNickEdit(true);
    });

    $("radio-chat-form")?.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const input = $("radio-chat-input");
      const text = input?.value?.trim() || "";
      if (!text) return;
      if (!sendJson({ type: "message", text })) {
        setStatus("Pas connecté — réessaie dans un instant.");
        return;
      }
      input.value = "";
      setStatus("");
    });

    $("radio-chat-input")?.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && !ev.shiftKey) {
        ev.preventDefault();
        $("radio-chat-form")?.requestSubmit?.();
      }
    });

    const url = await resolveWsUrl();
    connect(url);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      init().catch((err) => console.warn(LOG, err));
    });
  } else {
    init().catch((err) => console.warn(LOG, err));
  }
})();
