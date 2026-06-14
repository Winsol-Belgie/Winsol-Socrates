// app.js
const API_URL = "https://winsol-socrates-dev.gwenn-vanthournout.workers.dev/ask";

const chat     = document.getElementById("chat");
const input    = document.getElementById("input");
const sendBtn  = document.getElementById("sendBtn");
const resetBtn = document.getElementById("resetBtn");
const statusEl = document.getElementById("status");
const langSelect = document.getElementById("language") || document.getElementById("lang");
const mailBtn  = document.getElementById("mailBtn");

let pending = false;

/* ========= Translations ========= */
const translations = {
  nl: { reset: "Reset", send: "Verstuur",
    placeholder: "Typ je vraag… (Shift+Enter = nieuwe regel)",
    greeting: "Hallo! Ik beantwoord technische vragen over de Pergola SO! op basis van de gekoppelde documentatie. Wat wil je weten?",
    ready: "Klaar", failed: "Mislukt" },
  fr: { reset: "Réinitialiser", send: "Envoyer",
    placeholder: "Tapez votre question… (Maj+Entrée = nouvelle ligne)",
    greeting: "Bonjour ! Je réponds aux questions techniques concernant la Pergola SO! sur la base de la documentation liée. Que voulez-vous savoir ?",
    ready: "Terminé", failed: "Échec" },
  en: { reset: "Reset", send: "Send",
    placeholder: "Type your question... (Shift+Enter = new line)",
    greeting: "Hello! I answer technical questions about the Pergola SO! based on the linked documentation. What would you like to know?",
    ready: "Ready", failed: "Failed" },
  de: { reset: "Zurücksetzen", send: "Senden",
    placeholder: "Gib deine Frage ein… (Umschalt+Enter = neue Zeile)",
    greeting: "Hallo! Ich beantworte technische Fragen zur Pergola SO! anhand der verknüpften Dokumentation. Was möchten Sie wissen?",
    ready: "Fertig", failed: "Fehlgeschlagen" },
  es: { reset: "Restablecer", send: "Enviar",
    placeholder: "Escribe tu pregunta… (Mayús+Enter = nueva línea)",
    greeting: "¡Hola! Respondo preguntas técnicas sobre la pérgola SO! basándome en la documentación vinculada. ¿Qué te gustaría saber?",
    ready: "Hecho", failed: "Error" },
  it: { reset: "Reimposta", send: "Invia",
    placeholder: "Scrivi la tua domanda… (Shift+Invio = nuova riga)",
    greeting: "Ciao! Rispondo a domande tecniche sulla Pergola SO! basandomi sulla documentazione collegata. Cosa vuoi sapere?",
    ready: "Pronto", failed: "Non riuscito" },
};

/* ========= Language logic ========= */
function detectBrowserLang() {
  const list = navigator.languages?.length ? navigator.languages : [navigator.language || "nl"];
  for (const l of list) {
    const code = (l || "").slice(0, 2).toLowerCase();
    if (translations[code]) return code;
  }
  return "nl";
}
function currentLangCode() {
  const v = (langSelect?.value) || "auto";
  return v === "auto" ? detectBrowserLang() : v;
}
function t() { return translations[currentLangCode()] || translations.nl; }
function applyUIStrings() {
  const tt = t();
  if (resetBtn) resetBtn.textContent = tt.reset;
  if (sendBtn)  sendBtn.textContent  = tt.send;
  if (input)    input.placeholder    = tt.placeholder;
}

/* ========= Conversation state ========= */
// threadId: OpenAI response ID (kennisvraag) of UUID (diagnose-sessie)
function getThreadId()   { return sessionStorage.getItem("threadId") || ""; }
function setThreadId(id) { if (id) sessionStorage.setItem("threadId", id); }
function clearThread()   { sessionStorage.removeItem("threadId"); }

/* ========= Rendering ========= */
function sanitize(str = "") {
  return String(str).replace(/[&<>"']/g, ch => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" })[ch]);
}
function renderMessage(role, html) {
  const wrap = document.createElement("div");
  wrap.className = `msg ${role}`;
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.innerHTML = html;
  wrap.appendChild(bubble);
  chat.appendChild(wrap);
  chat.scrollTop = chat.scrollHeight;
}
function createAssistantStreamBubble() {
  const wrap = document.createElement("div");
  wrap.className = "msg assistant";
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  wrap.appendChild(bubble);
  chat.appendChild(wrap);
  chat.scrollTop = chat.scrollHeight;
  return bubble;
}
function buildTranscript() {
  const lines = [];
  chat.querySelectorAll(".msg").forEach(msg => {
    const bubble = msg.querySelector(".bubble");
    if (!bubble) return;
    const role = msg.classList.contains("user") ? "User" : msg.classList.contains("assistant") ? "SO!Crates" : "";
    const text = bubble.innerText.trim();
    if (role && text) lines.push(`${role}:\n${text}`);
  });
  return lines.join("\n\n");
}
function setBusy(on) {
  pending = sendBtn.disabled = resetBtn.disabled = input.disabled = on;
}
function showTypingIndicator() {
  removeTypingIndicator();
  const wrap = document.createElement("div");
  wrap.className = "msg assistant typing-indicator-wrapper";
  const bubble = document.createElement("div");
  bubble.className = "typing-indicator";
  bubble.innerHTML = "<span></span><span></span><span></span>";
  wrap.appendChild(bubble);
  chat.appendChild(wrap);
  chat.scrollTop = chat.scrollHeight;
}
function removeTypingIndicator() {
  document.querySelectorAll(".typing-indicator-wrapper").forEach(el => el.remove());
}

/* ========= Send ========= */
async function send() {
  if (pending) return;
  const q = (input.value || "").trim();
  if (!q) return;

  const uiLang = langSelect?.value || "auto";
  setBusy(true);
  statusEl.textContent = "...";
  renderMessage("user", sanitize(q).replace(/\n/g, "<br>"));
  input.value = "";

  const body = { query: q, language: uiLang, threadId: getThreadId() };
  const t0 = performance.now();

  try {
    showTypingIndicator();
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    removeTypingIndicator();

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "", assistantText = "";
    const bubble = createAssistantStreamBubble();

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        let evt;
        try { evt = JSON.parse(line); } catch { continue; }
        if (evt.type === "meta" && evt.threadId) {
          setThreadId(evt.threadId);
        } else if (evt.type === "delta") {
          assistantText += evt.text || "";
          bubble.innerHTML = sanitize(assistantText).replace(/\n/g, "<br>");
          chat.scrollTop = chat.scrollHeight;
        } else if (evt.type === "error") {
          throw new Error(evt.message || "Stream error");
        }
      }
    }

    if (!assistantText) {
      assistantText = "Geen antwoord gevonden in de beschikbare documenten.";
      bubble.innerHTML = sanitize(assistantText);
    }

    statusEl.textContent = `${t().ready} (${((performance.now() - t0) / 1000).toFixed(1)} s)`;

    // Log vraag + antwoord naar LOGS KV (fire-and-forget)
    const logBase = API_URL.replace(/\/ask$/, "");
    fetch(`${logBase}/log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: q, answer: assistantText, lang: uiLang }),
    }).catch(() => {});
  } catch (e) {
    removeTypingIndicator();
    renderMessage("assistant", sanitize(`Fout: ${e?.message || e}`));
    statusEl.textContent = t().failed;
  } finally {
    setBusy(false);
    setTimeout(() => input.focus(), 0);
  }
}

function resetConversation() {
  if (pending) return;
  clearThread();
  chat.innerHTML = "";
  renderMessage("assistant", sanitize(t().greeting));
}

/* ========= Events ========= */
sendBtn.addEventListener("click", send);
resetBtn.addEventListener("click", resetConversation);

if (mailBtn) {
  mailBtn.addEventListener("click", () => {
    const transcript = buildTranscript() || "Geen chatgeschiedenis beschikbaar.";
    window.location.href = `mailto:pergolasupport@winsol.eu?subject=${encodeURIComponent("SO!Crates mail")}&body=${encodeURIComponent(transcript)}`;
  });
}

input.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
});

if (langSelect) {
  langSelect.addEventListener("change", () => {
    applyUIStrings();
    if (!chat.querySelector(".msg.user")) {
      chat.innerHTML = "";
      renderMessage("assistant", sanitize(t().greeting));
    }
  });
}

/* ========= Boot ========= */
applyUIStrings();
renderMessage("assistant", sanitize(t().greeting));
