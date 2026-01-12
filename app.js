console.log("app.js wurde geladen!");

const AI_BACKEND_URL = "/ai-vocab";

// ---------------------
// PWA / Offline
// ---------------------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(console.error);
  });
}

// ---------------------
// State
// ---------------------
let vocabList = [];
let currentSessionId = 0;

let learnStack = [];
let learnStackPos = -1;

let currentEntry = null;
let currentResult = null;      // true/false/null
let cardPhase = "front";       // front|back

let learnDirection = "DE_ES";  // DE_ES | ES_DE | MIX
let currentCardDirection = "DE_ES"; // resolved per card if MIX

let stackResults = [];         // summary (first pass + repeats)
let wrongIndicesToRepeat = []; // indices of wrong cards in first pass
let inRepeatRound = false;     // true while repeating wrong cards

let swipeOnly = false;

// swipe
let touchStartX = null;
let mouseDownX = null;
const SWIPE_THRESHOLD = 50;

// ---------------------
// Session
// ---------------------
function initSession() {
  const key = "vocabSessionId";
  const last = parseInt(localStorage.getItem(key) || "0", 10);
  const next = last + 1;
  localStorage.setItem(key, String(next));
  currentSessionId = next;
}

// ---------------------
// Storage
// ---------------------
function initStatsForEntry(entry) {
  if (!entry.stats) entry.stats = {};
  const s = entry.stats;
  s.correct = s.correct || 0;
  s.wrong = s.wrong || 0;
  s.timesShown = s.timesShown || 0;
  if (!Array.isArray(s.sessions)) s.sessions = [];
  s.lastSession = s.lastSession || null;
  if (!Array.isArray(s.history)) s.history = [];
  return entry;
}

function loadVocab() {
  try {
    const raw = JSON.parse(localStorage.getItem("vocabList") || "[]");
    vocabList = raw
      .filter(e => e && typeof e.de === "string" && typeof e.es === "string")
      .map(initStatsForEntry);
  } catch (e) {
    console.error(e);
    vocabList = [];
  }
}

function saveVocab() {
  localStorage.setItem("vocabList", JSON.stringify(vocabList));
}

// ---------------------
// Rate & Table colors
// ---------------------
function getRate(entry) {
  const s = entry.stats || {};
  const shown = s.timesShown || 0;
  const correct = s.correct || 0;
  if (!shown) return null;
  return Math.round((correct / shown) * 100);
}

function getRowClassForRate(rate) {
  if (rate === null) return "";
  if (rate < 40) return "difficulty-very-bad";
  if (rate < 70) return "difficulty-bad";
  if (rate < 90) return "difficulty-good";
  return "difficulty-very-good";
}

function renderVocabTable() {
  const tbody = document.getElementById("vocabTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const sorted = [...vocabList].sort((a, b) =>
    (a.es || "").toLowerCase().localeCompare((b.es || "").toLowerCase(), "es")
  );

  sorted.forEach((entry, idx) => {
    const tr = document.createElement("tr");

    const tdIndex = document.createElement("td");
    tdIndex.textContent = String(idx + 1);

    const tdEs = document.createElement("td");
    tdEs.textContent = entry.es || "";

    const tdDe = document.createElement("td");
    tdDe.textContent = entry.de || "";

    const s = entry.stats || {};
    const shown = s.timesShown || 0;
    const correct = s.correct || 0;
    const wrong = s.wrong || 0;

    const tdShown = document.createElement("td");
    tdShown.textContent = shown;

    const tdCorrect = document.createElement("td");
    tdCorrect.textContent = correct;

    const tdWrong = document.createElement("td");
    tdWrong.textContent = wrong;

    const tdRate = document.createElement("td");
    const rate = getRate(entry);
    tdRate.textContent = rate === null ? "-" : `${rate}%`;

    const tdHistory = document.createElement("td");
    const container = document.createElement("div");
    container.className = "history-dots-table";

    const history = Array.isArray(s.history) ? s.history : [];
    const last5 = history.slice(-5);
    const padding = 5 - last5.length;

    for (let i = 0; i < padding; i++) {
      const dot = document.createElement("span");
      dot.className = "dot large";
      container.appendChild(dot);
    }
    last5.forEach(v => {
      const dot = document.createElement("span");
      dot.className = "dot large";
      if (v === true) dot.classList.add("correct");
      if (v === false) dot.classList.add("wrong");
      container.appendChild(dot);
    });

    tdHistory.appendChild(container);

    // ✅ Löschen-Spalte
    const tdDelete = document.createElement("td");
    const btnDel = document.createElement("button");
    btnDel.textContent = "×";
    btnDel.style.background = "transparent";
    btnDel.style.color = "#c62828";
    btnDel.style.fontSize = "18px";
    btnDel.style.padding = "4px 10px";
    btnDel.style.borderRadius = "10px";
    btnDel.style.border = "1px solid #ddd";
    btnDel.style.cursor = "pointer";

    btnDel.addEventListener("click", () => {
      const ok = confirm(`„${entry.es}“ / „${entry.de}“ wirklich entfernen?`);
      if (!ok) return;

      // Entfernen nach deutschem Schlüssel (unique)
      const key = (entry.de || "").toLowerCase();
      vocabList = vocabList.filter(e => (e.de || "").toLowerCase() !== key);

      saveVocab();
      refreshStats();
    });

    tdDelete.appendChild(btnDel);

    tr.appendChild(tdIndex);
    tr.appendChild(tdEs);
    tr.appendChild(tdDe);
    tr.appendChild(tdShown);
    tr.appendChild(tdCorrect);
    tr.appendChild(tdWrong);
    tr.appendChild(tdRate);
    tr.appendChild(tdHistory);
    tr.appendChild(tdDelete);

    const cls = getRowClassForRate(rate);
    if (cls) tr.classList.add(cls);

    tbody.appendChild(tr);
  });
}

function refreshStats() {
  const statsEl = document.getElementById("stats");
  if (statsEl) statsEl.innerText = `Gesamt: ${vocabList.length}`;
  renderVocabTable();
}

// ---------------------
// Add word
// ---------------------
function createEntry(de, es) {
  return {
    de, es,
    stats: { correct: 0, wrong: 0, timesShown: 0, sessions: [], lastSession: null, history: [] }
  };
}

function addWord() {
  const deInput = document.getElementById("inputDe");
  const esInput = document.getElementById("inputEs");
  if (!deInput || !esInput) return;

  const de = deInput.value.trim();
  const es = esInput.value.trim();
  if (!de || !es) return alert("Bitte beide Felder ausfüllen.");

  const exists = vocabList.some(e => e.de.toLowerCase() === de.toLowerCase());
  if (exists) return alert(`„${de}“ ist bereits in deiner Liste.`);

  vocabList.push(createEntry(de, es));
  saveVocab();
  refreshStats();
  deInput.value = "";
  esInput.value = "";
}

// ---------------------
// Direction + stack selection
// ---------------------
function updateLearnDirectionFromUI() {
  const checked = document.querySelector("input[name='learnDirection']:checked");
  learnDirection = checked ? checked.value : "DE_ES";
}

function updateSwipeOnlyFromUI() {
  const cb = document.getElementById("swipeOnly");
  swipeOnly = !!(cb && cb.checked);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function buildNormalStack(size = 10) {
  // erst "weiße" (timesShown==0), dann random aus dem Rest
  const unseen = [];
  const seen = [];

  vocabList.forEach((entry, i) => {
    const shown = (entry.stats?.timesShown || 0);
    if (shown === 0) unseen.push(i);
    else seen.push(i);
  });

  shuffle(unseen);
  shuffle(seen);

  const result = [];
  while (result.length < size && unseen.length) result.push(unseen.shift());
  while (result.length < size && seen.length) result.push(seen.shift());
  return result;
}

function buildHardStack(size = 10) {
  // alle roten = unter 70% richtig
  const hard = [];
  vocabList.forEach((entry, i) => {
    const rate = getRate(entry);
    if (rate !== null && rate < 70) hard.push(i);
  });
  shuffle(hard);
  return hard.slice(0, Math.min(size, hard.length));
}

// ---------------------
// Overlay controls
// ---------------------
function openOverlay() {
  const overlay = document.getElementById("learnOverlay");
  const cardArea = document.getElementById("cardArea");
  const summary = document.getElementById("summaryContainer");
  const btnNext = document.getElementById("btnNextCard");
  if (!overlay || !cardArea || !summary || !btnNext) return;

  overlay.classList.remove("hidden");
  cardArea.classList.remove("hidden");
  summary.classList.add("hidden");
  summary.innerHTML = "";
  btnNext.disabled = true;

  // swipe-only UI: hide buttons
  const frontBtns = document.getElementById("cardButtonsFront");
  const backBtns = document.getElementById("cardButtonsBack");
  if (frontBtns && backBtns) {
    frontBtns.style.display = swipeOnly ? "none" : "";
    backBtns.style.display = swipeOnly ? "none" : "";
  }
}

function closeOverlay() {
  const overlay = document.getElementById("learnOverlay");
  if (overlay) overlay.classList.add("hidden");

  learnStack = [];
  learnStackPos = -1;
  currentEntry = null;
  currentResult = null;
  cardPhase = "front";
  stackResults = [];
  wrongIndicesToRepeat = [];
  inRepeatRound = false;
}

function updateHistoryDotsOnCard(entry) {
  const dots = document.getElementById("cardHistoryDots");
  if (!dots) return;
  dots.innerHTML = "";

  const history = Array.isArray(entry.stats?.history) ? entry.stats.history : [];
  const last5 = history.slice(-5);
  const padding = 5 - last5.length;

  for (let i = 0; i < padding; i++) {
    const d = document.createElement("span");
    d.className = "dot";
    dots.appendChild(d);
  }
  last5.forEach(v => {
    const d = document.createElement("span");
    d.className = "dot";
    if (v === true) d.classList.add("correct");
    if (v === false) d.classList.add("wrong");
    dots.appendChild(d);
  });
}

function resetCardVisual() {
  const card = document.getElementById("learnCard");
  const status = document.getElementById("cardStatus");
  const btnNext = document.getElementById("btnNextCard");
  const backRow = document.getElementById("cardButtonsBack");
  const frontRow = document.getElementById("cardButtonsFront");

  if (!card || !status || !btnNext || !backRow || !frontRow) return;

  card.classList.remove("card-correct", "card-wrong", "show-back");
  status.textContent = "";
  btnNext.disabled = true;

  // buttons visible only in non-swipe-only
  if (!swipeOnly) {
    frontRow.classList.remove("hidden");
    backRow.classList.add("hidden");
  }
  cardPhase = "front";
  currentResult = null;
}

let currentFrontTextValue = "";
let currentBackTextValue = "";

function resolveDirectionForCard() {
  if (learnDirection === "MIX") {
    currentCardDirection = Math.random() < 0.5 ? "DE_ES" : "ES_DE";
  } else {
    currentCardDirection = learnDirection;
  }
}

function showCurrentCard() {
  const card = document.getElementById("learnCard");
  const frontText = document.getElementById("cardFrontText");
  const backText = document.getElementById("cardBackText");
  const title = document.getElementById("overlayTitle");
  const cardArea = document.getElementById("cardArea");
  const summary = document.getElementById("summaryContainer");

  if (!card || !frontText || !backText || !title || !cardArea || !summary) return;

  // finished?
  if (!learnStack.length || learnStackPos < 0 || learnStackPos >= learnStack.length) {
    // if first pass finished and there are wrongs -> start repeat round
    if (!inRepeatRound && wrongIndicesToRepeat.length > 0) {
      inRepeatRound = true;
      learnStack = [...wrongIndicesToRepeat];
      learnStackPos = 0;
      wrongIndicesToRepeat = []; // prevent loops
      title.textContent = "Wiederholung (falsche Karten)";
      resetCardVisual();
      showCurrentCard();
      return;
    }

    // show summary
    cardArea.classList.add("hidden");
    summary.classList.remove("hidden");

    const rows = stackResults.map((r, i) => {
      const ans = r.result === true ? "Richtig" : (r.result === false ? "Falsch" : "Keine Bewertung");
      const round = r.round === "repeat" ? " (Wdh.)" : "";
      return `<tr><td>${i + 1}</td><td>${r.es || ""}</td><td>${r.de || ""}</td><td>${ans}${round}</td></tr>`;
    }).join("");

    summary.innerHTML =
      `<h3>Zusammenfassung</h3>
       <table>
         <thead><tr><th>#</th><th>Spanisch</th><th>Deutsch</th><th>Antwort</th></tr></thead>
         <tbody>${rows}</tbody>
       </table>`;
    return;
  }

  resetCardVisual();

  const idx = learnStack[learnStackPos];
  currentEntry = initStatsForEntry(vocabList[idx]);

  // count shown + session tracking
  const s = currentEntry.stats;
  s.timesShown = (s.timesShown || 0) + 1;
  if (!s.sessions.includes(currentSessionId)) s.sessions.push(currentSessionId);
  s.lastSession = currentSessionId;

  saveVocab();
  refreshStats();

  resolveDirectionForCard();

  if (currentCardDirection === "DE_ES") {
    currentFrontTextValue = currentEntry.de || "";
    currentBackTextValue = currentEntry.es || "";
  } else {
    currentFrontTextValue = currentEntry.es || "";
    currentBackTextValue = currentEntry.de || "";
  }

  frontText.textContent = currentFrontTextValue;
  backText.textContent = currentBackTextValue;

  updateHistoryDotsOnCard(currentEntry);

  // title
  const mode = (learnDirection === "MIX") ? `Gemischt (${currentCardDirection === "DE_ES" ? "DE→ES" : "ES→DE"})` : (learnDirection === "DE_ES" ? "DE→ES" : "ES→DE");
  title.textContent = `${inRepeatRound ? "Wiederholung" : "Stapel"} – Karte ${learnStackPos + 1}/${learnStack.length} • ${mode}`;

  // swipe-only UX: tap to flip
  if (swipeOnly) {
    // in swipe-only allow tap on card to flip
  }
}

function startLearnStack(onlyHard) {
  if (!vocabList.length) return alert("Keine Vokabeln vorhanden!");

  updateLearnDirectionFromUI();
  updateSwipeOnlyFromUI();

  learnStack = onlyHard ? buildHardStack(10) : buildNormalStack(10);
  if (!learnStack.length) {
    return alert(onlyHard
      ? "Keine schwierigen Wörter gefunden (<70% richtig)."
      : "Keine Vokabeln für den Stapel gefunden.");
  }

  stackResults = [];
  wrongIndicesToRepeat = [];
  inRepeatRound = false;

  learnStackPos = 0;
  openOverlay();
  showCurrentCard();
}

// flip
function flipCardToBack() {
  if (!currentEntry) return;
  if (cardPhase !== "front") return;

  const card = document.getElementById("learnCard");
  const backRow = document.getElementById("cardButtonsBack");
  const frontRow = document.getElementById("cardButtonsFront");
  if (!card || !backRow || !frontRow) return;

  card.classList.add("show-back");
  cardPhase = "back";

  if (!swipeOnly) {
    frontRow.classList.add("hidden");
    backRow.classList.remove("hidden");
  }
}

// result
function applyResult(isCorrect) {
  if (!currentEntry) return;
  if (cardPhase !== "back") return;
  if (currentResult !== null) return;

  const card = document.getElementById("learnCard");
  const status = document.getElementById("cardStatus");
  const btnNext = document.getElementById("btnNextCard");
  if (!card || !status || !btnNext) return;

  currentResult = isCorrect;

  const s = currentEntry.stats;
  if (!Array.isArray(s.history)) s.history = [];

  if (isCorrect) {
    s.correct += 1;
    s.history.push(true);
    status.textContent = "Richtig! ✅";
    card.classList.add("card-correct");
  } else {
    s.wrong += 1;
    s.history.push(false);
    status.textContent = `Falsch. Richtig wäre: ${currentBackTextValue}`;
    card.classList.add("card-wrong");

    // only collect wrongs from first pass for repeat
    if (!inRepeatRound) {
      const idx = learnStack[learnStackPos];
      wrongIndicesToRepeat.push(idx);
    }
  }

  if (s.history.length > 50) s.history = s.history.slice(-50);

  saveVocab();
  refreshStats();
  updateHistoryDotsOnCard(currentEntry);

  // In swipe-only: auto-enable next (still manual "Weiter")
  btnNext.disabled = false;
}

// next
function nextCard() {
  if (!learnStack.length) return closeOverlay();

  // push result
  stackResults.push({
    de: currentEntry?.de,
    es: currentEntry?.es,
    result: currentResult,
    round: inRepeatRound ? "repeat" : "main"
  });

  learnStackPos += 1;
  showCurrentCard();
}

// ---------------------
// Swipe handlers (only on back)
// ---------------------
function onTouchStart(e) {
  touchStartX = e.touches[0].clientX;
}

function onTouchEnd(e) {
  if (touchStartX === null) return;
  const dx = e.changedTouches[0].clientX - touchStartX;
  touchStartX = null;

  if (Math.abs(dx) < SWIPE_THRESHOLD) return;

  if (cardPhase !== "back") return;
  if (dx > 0) applyResult(true);
  else applyResult(false);
}

function onMouseDown(e) { mouseDownX = e.clientX; }
function onMouseUp(e) {
  if (mouseDownX === null) return;
  const dx = e.clientX - mouseDownX;
  mouseDownX = null;

  if (Math.abs(dx) < SWIPE_THRESHOLD) return;
  if (cardPhase !== "back") return;

  if (dx > 0) applyResult(true);
  else applyResult(false);
}

// swipe-only tap to flip
function onCardClick() {
  if (!swipeOnly) return;
  if (cardPhase === "front") flipCardToBack();
}

// ---------------------
// KI generate
// ---------------------
async function fetchAiVocab() {
  const topicInput = document.getElementById("aiTopic");
  const countInput = document.getElementById("aiCount");
  const statusEl = document.getElementById("aiStatus");

  const topic = topicInput?.value.trim();
  const requested = parseInt(countInput?.value, 10);

  if (!topic || !requested || requested <= 0) return alert("Bitte Thema und eine gültige Anzahl eingeben.");
  statusEl.textContent = "KI wird abgefragt...";

  const existing = new Set(vocabList.map(e => e.de.toLowerCase()));

  let totalNew = 0;
  const maxRounds = 3;

  try {
    for (let round = 0; round < maxRounds && totalNew < requested; round++) {
      const remaining = requested - totalNew;

      const res = await fetch(AI_BACKEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, count: remaining })
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        console.error(data);
        statusEl.textContent = "Fehler bei der KI-Abfrage.";
        return;
      }

      if (!Array.isArray(data) || data.length === 0) break;

      for (const w of data) {
        if (!w?.de || !w?.es) continue;
        const key = String(w.de).toLowerCase();
        if (existing.has(key)) continue;
        existing.add(key);
        vocabList.push(createEntry(String(w.de), String(w.es)));
        totalNew++;
        if (totalNew >= requested) break;
      }
    }

    saveVocab();
    refreshStats();
    statusEl.textContent = totalNew > 0 ? `${totalNew} neue Vokabeln hinzugefügt.` : "Keine neuen Vokabeln gefunden.";
  } catch (e) {
    console.error(e);
    statusEl.textContent = "Fehler bei der Kommunikation mit dem Backend.";
  }
}

// ---------------------
// Init + wiring
// ---------------------
window.addEventListener("DOMContentLoaded", () => {
  initSession();
  loadVocab();
  refreshStats();

  document.getElementById("btnAdd")?.addEventListener("click", addWord);
  document.getElementById("btnAi")?.addEventListener("click", fetchAiVocab);

  document.getElementById("btnStartStack")?.addEventListener("click", () => startLearnStack(false));
  document.getElementById("btnStartHardStack")?.addEventListener("click", () => startLearnStack(true));

  document.getElementById("btnCloseOverlay")?.addEventListener("click", closeOverlay);
  document.getElementById("btnNextCard")?.addEventListener("click", nextCard);

  document.getElementById("btnFlipCard")?.addEventListener("click", flipCardToBack);
  document.getElementById("btnMarkWrong")?.addEventListener("click", () => applyResult(false));
  document.getElementById("btnMarkCorrect")?.addEventListener("click", () => applyResult(true));

  const card = document.getElementById("learnCard");
  if (card) {
    card.addEventListener("touchstart", onTouchStart, { passive: true });
    card.addEventListener("touchend", onTouchEnd, { passive: true });
    card.addEventListener("mousedown", onMouseDown);
    card.addEventListener("mouseup", onMouseUp);
    card.addEventListener("click", onCardClick);
  }
});
