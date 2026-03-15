// app.js
// Zet dit naar je Worker endpoint:
const API_URL = "https://winsol-socrates.gwenn-vanthournout.workers.dev/ask";

const chat = document.getElementById("chat");
const input = document.getElementById("input");
const sendBtn = document.getElementById("sendBtn");
const resetBtn = document.getElementById("resetBtn");
const statusEl = document.getElementById("status");
const langSelect =
  document.getElementById("language") || document.getElementById("lang");
const langLabel = document.getElementById("langLabel");
const mailBtn = document.getElementById("mailBtn");

let pending = false;

/* ========= Translations ========= */
const translations = {
  nl: { language: "Taal", reset: "Reset", send: "Verstuur",
    placeholder: "Typ je vraag… (Shift+Enter = nieuwe regel)",
    greeting: "Hallo! Ik beantwoord technische vragen over de Pergola SO! op basis van de gekoppelde documentatie. Wat wil je weten?",
    ready: "Klaar", failed: "Mislukt" },
  fr: { language: "Langue", reset: "Réinitialiser", send: "Envoyer",
    placeholder: "Tapez votre question… (Maj+Entrée = nouvelle ligne)",
    greeting: "Bonjour ! Je réponds aux questions techniques concernant la Pergola SO! sur la base de la documentation liée. Que voulez-vous savoir ?",
    ready: "Terminé", failed: "Échec" },
  en: { language: "Language", reset: "Reset", send: "Send",
    placeholder: "Type your question... (Shift+Enter = new line)",
    greeting: "Hello! I answer technical questions about the Pergola SO! based on the linked documentation. What would you like to know?",
    ready: "Ready", failed: "Failed" },
  de: { language: "Sprache", reset: "Zurücksetzen", send: "Senden",
    placeholder: "Gib deine Frage ein… (Umschalt+Enter = neue Zeile)",
    greeting: "Hallo! Ich beantworte technische Fragen zur Pergola SO! anhand der verknüpften Dokumentation. Was möchten Sie wissen?",
    ready: "Fertig", failed: "Fehlgeschlagen" },
  es: { language: "Idioma", reset: "Restablecer", send: "Enviar",
    placeholder: "Escribe tu pregunta… (Mayús+Enter = nueva línea)",
    greeting: "¡Hola! Respondo preguntas técnicas sobre la pérgola SO! basándome en la documentación vinculada. ¿Qué te gustaría saber?",
    ready: "Hecho", failed: "Error" },
  it: { language: "Lingua", reset: "Reimposta", send: "Invia",
    placeholder: "Scrivi la tua domanda… (Shift+Invio = nuova riga)",
    greeting: "Ciao! Rispondo a domande tecniche sulla Pergola SO! basandomi sulla documentazione collegata. Cosa vuoi sapere?",
    ready: "Pronto", failed: "Non riuscito" },
  cs: { language: "Jazyk", reset: "Resetovat", send: "Odeslat",
    placeholder: "Zadejte svou otázku… (Shift+Enter = nový řádek)",
    greeting: "Ahoj! Odpovídám na technické dotazy týkající se pergoly SO! na základě připojené dokumentace. Na co by ses chtěl zeptat?",
    ready: "Hotovo", failed: "Selhalo" },
  sv: { language: "Språk", reset: "Återställ", send: "Skicka",
    placeholder: "Skriv din fråga… (Skift+Enter = ny rad)",
    greeting: "Hej! Jag besvarar tekniska frågor om Pergola SO! baserat på den länkade dokumentationen. Vad vill du veta?",
    ready: "Klar", failed: "Misslyckades" },
  hr: { language: "Jezik", reset: "Poništi", send: "Pošalji",
    placeholder: "Upišite svoje pitanje… (Shift+Enter = novi red)",
    greeting: "Bok! Odgovaram na tehnička pitanja o Pergoli SO! na temelju povezane dokumentacije. Što želite znati?",
    ready: "Gotovo", failed: "Neuspjelo" },
  hu: { language: "Nyelv", reset: "Visszaállítás", send: "Küldés",
    placeholder: "Írd be a kérdésed… (Shift+Enter = új sor)",
    greeting: "Szia! A Pergola SO!-val kapcsolatos műszaki kérdésekre a csatolt dokumentáció alapján válaszolok. Mit szeretnél tudni?",
    ready: "Kész", failed: "Sikertelen" },
};

/* ========= Language logic ========= */
function detectBrowserLang() {
  const list = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || "nl"];
  for (const l of list) {
    const code = (l || "").slice(0, 2).toLowerCase();
    if (translations[code]) return code;
  }
  return "nl";
}
function currentLangCode() {
  const v = (langSelect && langSelect.value) || "auto";
  if (v === "auto") return detectBrowserLang();
  return v;
}
function t() {
  const code = currentLangCode();
  return translations[code] || translations.nl;
}
function applyUIStrings() {
  const tt = t();
  if (langLabel) langLabel.textContent = tt.language;
  if (resetBtn) resetBtn.textContent = tt.reset;
  if (sendBtn) sendBtn.textContent = tt.send;
  if (input) input.placeholder = tt.placeholder;
}

/* ========= Conversation state ========= */
function getThreadId() { return sessionStorage.getItem("threadId") || ""; }
function setThreadId(id) { if (id) sessionStorage.setItem("threadId", id); }
function clearThread() { sessionStorage.removeItem("threadId"); }

/* ========= Rendering ========= */
function sanitize(str = "") {
  return String(str).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[ch]);
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
  bubble.innerHTML = "";
  wrap.appendChild(bubble);
  chat.appendChild(wrap);
  chat.scrollTop = chat.scrollHeight;
  return bubble;
}

function buildTranscript() {
  const lines = [];
  chat.querySelectorAll(".msg").forEach((msg) => {
    const bubble = msg.querySelector(".bubble");
    if (!bubble) return;

    let role = "";
    if (msg.classList.contains("user")) role = "User";
    else if (msg.classList.contains("assistant")) role = "SO!Crates";

    const text = bubble.innerText.trim();
    if (!role || !text) return;

    lines.push(`${role}:\n${text}`);
  });

  return lines.join("\n\n");
}

function setBusy(on) {
  pending = on;
  sendBtn.disabled = on;
  resetBtn.disabled = on;
  input.disabled = on;
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

/* ========= Actions ========= */
async function send() {
  if (pending) return;
  const q = (input.value || "").trim();
  if (!q) return;

  // 1️⃣ Geselecteerde taal uit de dropdown
  const langEl =
    document.getElementById("language") || document.getElementById("lang");
  const uiLang = (langEl && langEl.value) ? langEl.value : "auto";

  const tt = t();
  setBusy(true);
  statusEl.textContent = "...";

  // User message renderen
  renderMessage("user", sanitize(q).replace(/\n/g, "<br>"));
  input.value = "";

  const body = {
    query: q,
    language: uiLang,
    threadId: getThreadId(),
  };

  const t0 = performance.now();

  try {
    showTypingIndicator();
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok || !res.body) {
      throw new Error(`HTTP ${res.status}`);
    }

    removeTypingIndicator();

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let assistantText = "";
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
        try {
          evt = JSON.parse(line);
        } catch {
          continue;
        }

        if (evt.type === "meta" && evt.threadId) {
          setThreadId(evt.threadId);
        } else if (evt.type === "delta") {
          assistantText += evt.text || "";
          const html = sanitize(assistantText).replace(/\n/g, "<br>");
          bubble.innerHTML = html;
          chat.scrollTop = chat.scrollHeight;
        } else if (evt.type === "error") {
          throw new Error(evt.message || "Stream error");
        } else if (evt.type === "done") {
          // Niets extra nodig; lus stopt vanzelf als de stream klaar is
        }
      }
    }

    if (!assistantText) {
      assistantText = "Geen antwoord gevonden in de beschikbare documenten.";
      const html = sanitize(assistantText).replace(/\n/g, "<br>");
      bubble.innerHTML = html;
    }

    statusEl.textContent = `${tt.ready} (${(
      (performance.now() - t0) /
      1000
    ).toFixed(1)} s)`;
  } catch (e) {
    removeTypingIndicator();
    renderMessage(
      "assistant",
      sanitize(`Fout: ${e?.message || e}`),
    );
    statusEl.textContent = t().failed;
  } finally {
    input.focus();
    setBusy(false);
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
    const subject = encodeURIComponent("SO!Crates mail");
    const body = encodeURIComponent(transcript);
    const mailto = `mailto:pergolasupport@winsol.eu?subject=${subject}&body=${body}`;
    window.location.href = mailto;
  });
}

input.addEventListener("keydown", (e) => {
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
