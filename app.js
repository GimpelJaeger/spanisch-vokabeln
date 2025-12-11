console.log("app.js wurde geladen!");

// Backend-URL (läuft im selben Server, bei Render auch)
const AI_BACKEND_URL = "/ai-vocab";

// ---------------------
// Globale Variablen
// ---------------------
let vocabList = [];
let currentSessionId = 0;

// Lernstapel
let learnStack = [];       // Array von Indizes in vocabList
let learnStackPos = -1;    // Position im Stapel
let currentEntry = null;   // aktuell abgefragte Vokabel
let currentResult = null;  // true = richtig, false = falsch, null = nicht bewertet

let stackResults = [];     // Ergebnisliste für Zusammenfassung

// Swipe
let touchStartX = null;
const SWIPE_THRESHOLD = 50;

// ---------------------
// Session-Verwaltung
// ---------------------
function initSession() {
    const key = "vocabSessionId";
    const last = parseInt(localStorage.getItem(key) || "0", 10);
    const next = last + 1;
    localStorage.setItem(key, String(next));
    currentSessionId = next;
    console.log("Aktuelle Session-ID:", currentSessionId);
}

// ---------------------
// Stats-Struktur
// ---------------------
function initStatsForEntry(entry) {
    if (!entry.stats) entry.stats = {};
    const s = entry.stats;
    s.correct = s.correct || 0;
    s.wrong = s.wrong || 0;
    s.timesShown = s.timesShown || 0;
    if (!Array.isArray(s.sessions)) s.sessions = [];
    s.lastSession = s.lastSession || null;
    if (!Array.isArray(s.history)) s.history = []; // Verlauf der letzten Antworten
    return entry;
}

// ---------------------
// Laden & Speichern
// ---------------------
function loadVocab() {
    try {
        const raw = JSON.parse(localStorage.getItem("vocabList") || "[]");
        vocabList = raw
            .filter(entry => entry && typeof entry.de === "string" && typeof entry.es === "string")
            .map(initStatsForEntry);
    } catch (e) {
        console.error("Fehler beim Laden der Vokabeln:", e);
        vocabList = [];
    }
}

function saveVocab() {
    try {
        localStorage.setItem("vocabList", JSON.stringify(vocabList));
    } catch (e) {
        console.error("Fehler beim Speichern der Vokabeln:", e);
    }
}

// ---------------------
// Vokabel-Tabelle rendern
// ---------------------
function renderVocabTable() {
    const tbody = document.getElementById("vocabTableBody");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (!vocabList || vocabList.length === 0) {
        return;
    }

    const sorted = [...vocabList].sort((a, b) => {
        const esA = (a.es || "").toLowerCase();
        const esB = (b.es || "").toLowerCase();
        return esA.localeCompare(esB, "es");
    });

    sorted.forEach((entry, idx) => {
        const tr = document.createElement("tr");

        const tdIndex = document.createElement("td");
        tdIndex.textContent = String(idx + 1);

        const tdEs = document.createElement("td");
        tdEs.textContent = entry.es || "";

        const tdDe = document.createElement("td");
        tdDe.textContent = entry.de || "";

        const s = entry.stats || {};
        const tdShown = document.createElement("td");
        const tdCorrect = document.createElement("td");
        const tdWrong = document.createElement("td");

        tdShown.textContent = s.timesShown || 0;
        tdCorrect.textContent = s.correct || 0;
        tdWrong.textContent = s.wrong || 0;

        tr.appendChild(tdIndex);
        tr.appendChild(tdEs);
        tr.appendChild(tdDe);
        tr.appendChild(tdShown);
        tr.appendChild(tdCorrect);
        tr.appendChild(tdWrong);

        tbody.appendChild(tr);
    });
}

function refreshStats() {
    const total = vocabList.length;
    const statsEl = document.getElementById("stats");
    if (statsEl) {
        statsEl.innerText = `Gesamt: ${total}`;
    }
    renderVocabTable();
}

// neue Vokabel mit Stats
function createEntry(de, es) {
    return {
        de,
        es,
        stats: {
            correct: 0,
            wrong: 0,
            timesShown: 0,
            sessions: [],
            lastSession: null,
            history: []
        }
    };
}

// ---------------------
// Manuell Vokabel hinzufügen
// ---------------------
function addWord() {
    const deInput = document.getElementById("inputDe");
    const esInput = document.getElementById("inputEs");

    if (!deInput || !esInput) return;

    const de = deInput.value.trim();
    const es = esInput.value.trim();

    if (!de || !es) {
        alert("Bitte beide Felder ausfüllen.");
        return;
    }

    const key = de.toLowerCase();
    const exists = vocabList.some(entry => entry.de.toLowerCase() === key);
    if (exists) {
        alert(`„${de}“ ist bereits in deiner Liste.`);
        return;
    }

    vocabList.push(createEntry(de, es));
    saveVocab();
    refreshStats();

    deInput.value = "";
    esInput.value = "";
}

// ---------------------
// Lernmodus – adaptiver Stapel
// ---------------------
function chooseNextEntryIndex() {
    if (!vocabList || vocabList.length === 0) return null;

    const initialPool = [];
    const advancedPool = [];

    vocabList.forEach((entry, index) => {
        const s = entry.stats || {};
        const sessions = Array.isArray(s.sessions) ? s.sessions : [];
        const uniqueSessions = sessions.length;

        if (uniqueSessions < 3) {
            initialPool.push({ entry, index, uniqueSessions });
        } else {
            advancedPool.push({ entry, index });
        }
    });

    if (initialPool.length > 0) {
        const minSessions = Math.min(...initialPool.map(i => i.uniqueSessions));
        const candidates = initialPool.filter(i => i.uniqueSessions === minSessions);
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        return pick.index;
    }

    if (advancedPool.length === 0) {
        return null;
    }

    let totalWeight = 0;
    const weights = advancedPool.map(item => {
        const s = item.entry.stats;
        const wrong = s.wrong || 0;
        const correct = s.correct || 0;

        let weight = 1 + wrong * 2 - correct * 0.5;
        if (weight < 0.2) weight = 0.2;

        totalWeight += weight;
        return weight;
    });

    let r = Math.random() * totalWeight;
    for (let i = 0; i < advancedPool.length; i++) {
        r -= weights[i];
        if (r <= 0) {
            return advancedPool[i].index;
        }
    }

    return advancedPool[advancedPool.length - 1].index;
}

function buildLearnStack(size = 10) {
    const used = new Set();
    const stack = [];

    if (!vocabList || vocabList.length === 0) return [];

    const maxCards = Math.min(size, vocabList.length);
    let safety = 0;

    while (stack.length < maxCards && safety < 200) {
        const idx = chooseNextEntryIndex();
        if (idx === null) break;
        if (!used.has(idx)) {
            used.add(idx);
            stack.push(idx);
        }
        safety++;
    }

    return stack;
}

function openOverlay() {
    const overlay = document.getElementById("learnOverlay");
    const cardArea = document.getElementById("cardArea");
    const summaryContainer = document.getElementById("summaryContainer");
    if (!overlay || !cardArea || !summaryContainer) return;

    overlay.classList.remove("hidden");
    cardArea.classList.remove("hidden");
    summaryContainer.classList.add("hidden");
    summaryContainer.innerHTML = "";
}

function closeOverlay() {
    const overlay = document.getElementById("learnOverlay");
    if (!overlay) return;
    overlay.classList.add("hidden");

    // Stapel zurücksetzen
    learnStack = [];
    learnStackPos = -1;
    currentEntry = null;
    currentResult = null;
    stackResults = [];
}

// Punkte-Historie aktualisieren
function updateHistoryDots(entry) {
    const dotsContainer = document.getElementById("cardHistoryDots");
    if (!dotsContainer) return;

    dotsContainer.innerHTML = "";
    const s = entry.stats || {};
    const history = Array.isArray(s.history) ? s.history : [];

    const last5 = history.slice(-5);
    // Wir wollen immer 5 Punkte anzeigen
    const totalDots = 5;
    const startIndex = Math.max(0, last5.length - totalDots);

    const display = last5.slice(startIndex);

    // ggf. vorne mit "null" auffüllen
    const padding = totalDots - display.length;
    for (let i = 0; i < padding; i++) {
        const span = document.createElement("span");
        span.className = "dot";
        dotsContainer.appendChild(span);
    }

    display.forEach(result => {
        const span = document.createElement("span");
        span.className = "dot";
        if (result === true) span.classList.add("correct");
        if (result === false) span.classList.add("wrong");
        dotsContainer.appendChild(span);
    });
}

function showCurrentCard() {
    const learnCard = document.getElementById("learnCard");
    const frontText = document.getElementById("cardFrontText");
    const backText = document.getElementById("cardBackText");
    const statusEl = document.getElementById("cardStatus");
    const overlayTitle = document.getElementById("overlayTitle");
    const cardArea = document.getElementById("cardArea");
    const summaryContainer = document.getElementById("summaryContainer");

    if (!learnCard || !frontText || !backText || !statusEl || !overlayTitle || !cardArea || !summaryContainer) return;

    // Wenn Stapel durch ist → Zusammenfassung anzeigen
    if (!learnStack || learnStack.length === 0 || learnStackPos < 0 || learnStackPos >= learnStack.length) {
        cardArea.classList.add("hidden");
        summaryContainer.classList.remove("hidden");
        statusEl.innerText = "";
        overlayTitle.innerText = "Stapel beendet";

        // Zusammenfassungstabelle bauen
        let html = "<h3>Zusammenfassung</h3>";
        html += "<table><thead><tr><th>#</th><th>Spanisch</th><th>Deutsch</th><th>Antwort</th></tr></thead><tbody>";

        stackResults.forEach((res, index) => {
            html += "<tr>";
            html += `<td>${index + 1}</td>`;
            html += `<td>${res.es || ""}</td>`;
            html += `<td>${res.de || ""}</td>`;
            if (res.result === true) {
                html += `<td>Richtig</td>`;
            } else if (res.result === false) {
                html += `<td>Falsch</td>`;
            } else {
                html += `<td>Übersprungen</td>`;
            }
            html += "</tr>";
        });

        html += "</tbody></table>";
        summaryContainer.innerHTML = html;
        return;
    }

    // Karte zurücksetzen
    learnCard.classList.remove("flipped", "card-correct", "card-wrong");
    statusEl.innerText = "";
    overlayTitle.innerText = `Karte ${learnStackPos + 1} von ${learnStack.length}`;
    currentResult = null;

    const idx = learnStack[learnStackPos];
    const entry = vocabList[idx];
    currentEntry = initStatsForEntry(entry);

    const s = currentEntry.stats;
    s.timesShown = (s.timesShown || 0) + 1;
    if (!Array.isArray(s.sessions)) s.sessions = [];
    if (!s.sessions.includes(currentSessionId)) {
        s.sessions.push(currentSessionId);
    }
    s.lastSession = currentSessionId;

    saveVocab();
    refreshStats();

    frontText.innerText = currentEntry.de || "";
    backText.innerText = currentEntry.es || "";
    updateHistoryDots(currentEntry);
}

function startLearnStack() {
    if (!vocabList || vocabList.length === 0) {
        alert("Keine Vokabeln vorhanden!");
        return;
    }

    learnStack = buildLearnStack(10);

    if (!learnStack || learnStack.length === 0) {
        alert("Keine Vokabeln für den Lernstapel gefunden.");
        return;
    }

    stackResults = [];
    learnStackPos = 0;
    openOverlay();
    showCurrentCard();
}

// Ergebnis (richtig/falsch) setzen, Karte flippen & einfärben
function applyResult(isCorrect) {
    if (!currentEntry) return;
    if (currentResult !== null) return; // schon bewertet

    const learnCard = document.getElementById("learnCard");
    const statusEl = document.getElementById("cardStatus");
    if (!learnCard || !statusEl) return;

    currentResult = isCorrect;

    const s = currentEntry.stats;
    if (!Array.isArray(s.history)) s.history = [];

    if (isCorrect) {
        s.correct = (s.correct || 0) + 1;
        s.history.push(true);
        statusEl.innerText = "Richtig! ✅";
        learnCard.classList.add("card-correct");
    } else {
        s.wrong = (s.wrong || 0) + 1;
        s.history.push(false);
        statusEl.innerText = `Falsch. Richtig wäre: ${currentEntry.es}`;
        learnCard.classList.add("card-wrong");
    }

    // Verlauf begrenzen
    if (s.history.length > 50) {
        s.history = s.history.slice(-50);
    }

    saveVocab();
    refreshStats();
    updateHistoryDots(currentEntry);
    learnCard.classList.add("flipped");
}

// Nächste Karte nach Klick auf "Weiter"
function nextCard() {
    if (!learnStack || learnStack.length === 0) {
        closeOverlay();
        return;
    }

    if (currentEntry) {
        stackResults.push({
            de: currentEntry.de,
            es: currentEntry.es,
            result: currentResult // true, false oder null (wenn nicht gewischt)
        });
    }

    learnStackPos++;
    showCurrentCard();
}

// ---------------------
// Swipe-Event-Handler
// ---------------------
function onCardTouchStart(e) {
    const touch = e.touches[0];
    touchStartX = touch.clientX;
}

function onCardTouchEnd(e) {
    if (touchStartX === null) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartX;
    touchStartX = null;

    if (Math.abs(dx) < SWIPE_THRESHOLD) {
        return; // zu kleine Bewegung
    }

    if (dx > 0) {
        // nach rechts = gewusst
        applyResult(true);
    } else {
        // nach links = nicht gewusst
        applyResult(false);
    }
}

// Maus-Unterstützung (optional, für PC)
let mouseDownX = null;
function onCardMouseDown(e) {
    mouseDownX = e.clientX;
}

function onCardMouseUp(e) {
    if (mouseDownX === null) return;
    const dx = e.clientX - mouseDownX;
    mouseDownX = null;

    if (Math.abs(dx) < SWIPE_THRESHOLD) {
        return;
    }

    if (dx > 0) {
        applyResult(true);
    } else {
        applyResult(false);
    }
}

// ---------------------
// KI-Vokabeln abrufen
// ---------------------
async function fetchAiVocab() {
    const topicInput = document.getElementById("aiTopic");
    const countInput = document.getElementById("aiCount");
    const statusEl = document.getElementById("aiStatus");

    if (!topicInput || !countInput || !statusEl) return;

    const topic = topicInput.value.trim();
    const requested = parseInt(countInput.value, 10);

    if (!topic || !requested || requested <= 0) {
        alert("Bitte Thema und eine gültige Anzahl eingeben.");
        return;
    }

    statusEl.innerText = "KI wird abgefragt...";

    const existing = new Set(
        (vocabList || [])
            .filter(entry => entry && typeof entry.de === "string")
            .map(entry => entry.de.toLowerCase().trim())
    );

    let totalNew = 0;
    const maxRounds = 3;

    try {
        for (let round = 0; round < maxRounds && totalNew < requested; round++) {
            const remaining = requested - totalNew;
            console.log(`Runde ${round + 1}, benötige noch ${remaining} neue Wörter.`);

            const res = await fetch(AI_BACKEND_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ topic, count: remaining })
            });

            const data = await res.json();

            if (!res.ok || data.error) {
                console.error("Fehler vom Backend:", data);
                statusEl.innerText = "Fehler bei der KI-Abfrage.";
                return;
            }

            if (!Array.isArray(data) || data.length === 0) {
                console.warn("Backend hat kein Array zurückgegeben:", data);
                break;
            }

            for (const entry of data) {
                if (!entry || !entry.de || !entry.es) continue;

                const key = String(entry.de).toLowerCase().trim();
                if (existing.has(key)) {
                    continue;
                }

                existing.add(key);
                vocabList.push(createEntry(String(entry.de), String(entry.es)));
                totalNew++;

                if (totalNew >= requested) break;
            }
        }

        saveVocab();
        refreshStats();

        if (totalNew === 0) {
            statusEl.innerText = `Keine neuen Vokabeln gefunden – vermutlich kennst du alle zum Thema „${topic}“ schon.`;
        } else if (totalNew < requested) {
            statusEl.innerText = `${totalNew} neue KI-Vokabeln für „${topic}“ hinzugefügt (weitere Vorschläge waren doppelt oder nicht nutzbar).`;
        } else {
            statusEl.innerText = `${totalNew} neue KI-Vokabeln für „${topic}“ hinzugefügt.`;
        }

    } catch (err) {
        console.error("Fehler beim Fetch:", err);
        statusEl.innerText = "Fehler bei der Kommunikation mit dem Backend.";
    }
}

// ---------------------
// Initialisierung
// ---------------------
window.addEventListener("DOMContentLoaded", () => {
    initSession();
    loadVocab();
    refreshStats();

    const btnAdd = document.getElementById("btnAdd");
    const btnStartStack = document.getElementById("btnStartStack");
    const btnNextCard = document.getElementById("btnNextCard");
    const btnCloseOverlay = document.getElementById("btnCloseOverlay");
    const learnCard = document.getElementById("learnCard");
    const btnAi = document.getElementById("btnAi");

    if (btnAdd) btnAdd.addEventListener("click", addWord);
    if (btnStartStack) btnStartStack.addEventListener("click", startLearnStack);
    if (btnNextCard) btnNextCard.addEventListener("click", nextCard);
    if (btnCloseOverlay) btnCloseOverlay.addEventListener("click", closeOverlay);
    if (btnAi) btnAi.addEventListener("click", fetchAiVocab);

    // Swipe-Events
    if (learnCard) {
        learnCard.addEventListener("touchstart", onCardTouchStart, { passive: true });
        learnCard.addEventListener("touchend", onCardTouchEnd, { passive: true });
        learnCard.addEventListener("mousedown", onCardMouseDown);
        learnCard.addEventListener("mouseup", onCardMouseUp);
    }
});
