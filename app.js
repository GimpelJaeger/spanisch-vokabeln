console.log("app.js wurde geladen!");

// Backend-URL (läuft im selben Server, bei Render auch)
const AI_BACKEND_URL = "/ai-vocab";

// Supabase-Konfiguration (optional für Cloud-Sync)
// Wenn du das nicht nutzt: einfach so lassen, dann zeigt der Button nur eine Info.
const SUPABASE_URL = "https://DEINE_SUPABASE_URL.supabase.co";
const SUPABASE_ANON_KEY = "DEIN_SUPABASE_ANON_KEY";
const SUPABASE_TABLE = "vocab";
const SUPABASE_PROFILE_ID = "standard-profil";

// ---------------------
// Globale Variablen
// ---------------------
let vocabList = [];
let currentSessionId = 0;

// Lernstapel
let learnStack = [];
let learnStackPos = -1;
let currentEntry = null;
let currentResult = null;      // true = richtig, false = falsch, null = keine Bewertung
let cardPhase = "front";       // "front" | "back"
let learnDirection = "DE_ES";  // "DE_ES" | "ES_DE"

let stackResults = [];         // Zusammenfassung

// Swipe
let touchStartX = null;
let mouseDownX = null;
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
    if (!Array.isArray(s.history)) s.history = [];
    return entry;
}

// ---------------------
// Laden & Speichern
// ---------------------
function loadVocab() {
    try {
        const raw = JSON.parse(localStorage.getItem("vocabList") || "[]");
        vocabList = raw
            .filter(e => e && typeof e.de === "string" && typeof e.es === "string")
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
// Trefferquote & Farben
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

// ---------------------
// Vokabel-Tabelle rendern
// ---------------------
function renderVocabTable() {
    const tbody = document.getElementById("vocabTableBody");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (!vocabList || vocabList.length === 0) return;

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
        const tdCorrect = document.createElement("td");
        const tdWrong = document.createElement("td");
        const tdRate = document.createElement("td");
        const tdHistory = document.createElement("td");

        tdShown.textContent = shown;
        tdCorrect.textContent = correct;
        tdWrong.textContent = wrong;

        const rate = getRate(entry);
        tdRate.textContent = rate === null ? "-" : `${rate}%`;

        // Letzte Abfragen (5 Punkte)
        const container = document.createElement("div");
        container.className = "history-dots-table";

        const history = Array.isArray(s.history) ? s.history : [];
        const last5 = history.slice(-5);
        const totalDots = 5;
        const padding = totalDots - last5.length;

        // graue "leere" Punkte
        for (let i = 0; i < padding; i++) {
            const dot = document.createElement("span");
            dot.className = "dot large";
            container.appendChild(dot);
        }
        // tatsächliche letzten Ergebnisse
        last5.forEach(val => {
            const dot = document.createElement("span");
            dot.className = "dot large";
            if (val === true) dot.classList.add("correct");
            if (val === false) dot.classList.add("wrong");
            container.appendChild(dot);
        });

        tdHistory.appendChild(container);

        tr.appendChild(tdIndex);
        tr.appendChild(tdEs);
        tr.appendChild(tdDe);
        tr.appendChild(tdShown);
        tr.appendChild(tdCorrect);
        tr.appendChild(tdWrong);
        tr.appendChild(tdRate);
        tr.appendChild(tdHistory);

        // Farbe nach Rate
        const cls = getRowClassForRate(rate);
        if (cls) tr.classList.add(cls);

        tbody.appendChild(tr);
    });
}

function refreshStats() {
    const statsEl = document.getElementById("stats");
    if (statsEl) {
        statsEl.innerText = `Gesamt: ${vocabList.length}`;
    }
    renderVocabTable();
}

// ---------------------
// Vokabel hinzufügen
// ---------------------
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
    const exists = vocabList.some(e => e.de.toLowerCase() === key);
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
// Lernmodus – Stapel
// ---------------------
function updateLearnDirectionFromUI() {
    const checked = document.querySelector("input[name='learnDirection']:checked");
    if (checked) {
        learnDirection = checked.value;
    }
}

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

function buildNormalStack(size = 10) {
    const unseen = [];
    const seen = [];

    vocabList.forEach((entry, index) => {
        const s = entry.stats || {};
        const shown = s.timesShown || 0;

        if (shown === 0) {
            unseen.push(index);   // noch nie dran gewesen → weiße Wörter
        } else {
            seen.push(index);     // schon mindestens einmal gezeigt
        }
    });

    // zufällig mischen (shuffle ist bei dir schon definiert)
    shuffle(unseen);
    shuffle(seen);

    const result = [];

    // zuerst alle "weißen" Wörter nehmen
    for (let i = 0; i < unseen.length && result.length < size; i++) {
        result.push(unseen[i]);
    }

    // wenn noch Platz im Stapel ist, mit schon geübten auffüllen
    for (let i = 0; i < seen.length && result.length < size; i++) {
        result.push(seen[i]);
    }

    return result;
}

function buildHardStack(size = 10) {
    const hard = [];
    vocabList.forEach((entry, index) => {
        const rate = getRate(entry);
        if (rate !== null && rate < 70) {
            hard.push(index);
        }
    });

    shuffle(hard);
    const n = Math.min(size, hard.length);
    return hard.slice(0, n);
}

function openOverlay() {
    const overlay = document.getElementById("learnOverlay");
    const cardArea = document.getElementById("cardArea");
    const summaryContainer = document.getElementById("summaryContainer");
    const btnNext = document.getElementById("btnNextCard");

    if (!overlay || !cardArea || !summaryContainer || !btnNext) return;

    overlay.classList.remove("hidden");
    cardArea.classList.remove("hidden");
    summaryContainer.classList.add("hidden");
    summaryContainer.innerHTML = "";
    btnNext.disabled = true;
}

function closeOverlay() {
    const overlay = document.getElementById("learnOverlay");
    if (!overlay) return;
    overlay.classList.add("hidden");

    learnStack = [];
    learnStackPos = -1;
    currentEntry = null;
    currentResult = null;
    cardPhase = "front";
    stackResults = [];
}

function updateHistoryDots(entry) {
    const dotsContainer = document.getElementById("cardHistoryDots");
    if (!dotsContainer) return;

    dotsContainer.innerHTML = "";
    const s = entry.stats || {};
    const history = Array.isArray(s.history) ? s.history : [];

    const last5 = history.slice(-5);
    const totalDots = 5;
    const padding = totalDots - last5.length;

    for (let i = 0; i < padding; i++) {
        const dot = document.createElement("span");
        dot.className = "dot";
        dotsContainer.appendChild(dot);
    }

    last5.forEach(val => {
        const dot = document.createElement("span");
        dot.className = "dot";
        if (val === true) dot.classList.add("correct");
        if (val === false) dot.classList.add("wrong");
        dotsContainer.appendChild(dot);
    });
}

function resetCardVisual() {
    const learnCard = document.getElementById("learnCard");
    const statusEl = document.getElementById("cardStatus");
    const btnBackRow = document.getElementById("cardButtonsBack");
    const btnFrontRow = document.getElementById("cardButtonsFront");
    const btnNext = document.getElementById("btnNextCard");

    if (!learnCard || !statusEl || !btnBackRow || !btnFrontRow || !btnNext) return;

    learnCard.classList.remove("card-correct", "card-wrong", "show-back");
    statusEl.innerText = "";
    btnBackRow.classList.add("hidden");
    btnFrontRow.classList.remove("hidden");
    btnNext.disabled = true;
    cardPhase = "front";
    currentResult = null;
}

let currentFrontTextValue = "";
let currentBackTextValue = "";

function showCurrentCard() {
    const learnCard = document.getElementById("learnCard");
    const frontText = document.getElementById("cardFrontText");
    const backText = document.getElementById("cardBackText");
    const statusEl = document.getElementById("cardStatus");
    const overlayTitle = document.getElementById("overlayTitle");
    const cardArea = document.getElementById("cardArea");
    const summaryContainer = document.getElementById("summaryContainer");

    if (!learnCard || !frontText || !backText || !statusEl || !overlayTitle || !cardArea || !summaryContainer) return;

    // Stapel fertig → Zusammenfassung
    if (!learnStack || learnStack.length === 0 || learnStackPos < 0 || learnStackPos >= learnStack.length) {
        cardArea.classList.add("hidden");
        summaryContainer.classList.remove("hidden");
        statusEl.innerText = "";
        overlayTitle.innerText = "Stapel beendet";

        let html = "<h3>Zusammenfassung</h3>";
        html += "<table><thead><tr><th>#</th><th>Spanisch</th><th>Deutsch</th><th>Antwort</th></tr></thead><tbody>";

        stackResults.forEach((res, index) => {
            html += "<tr>";
            html += `<td>${index + 1}</td>`;
            html += `<td>${res.es || ""}</td>`;
            html += `<td>${res.de || ""}</td>`;
            if (res.result === true) html += "<td>Richtig</td>";
            else if (res.result === false) html += "<td>Falsch</td>";
            else html += "<td>Keine Bewertung</td>";
            html += "</tr>";
        });

        html += "</tbody></table>";
        summaryContainer.innerHTML = html;
        return;
    }

    resetCardVisual();
    overlayTitle.innerText = `Karte ${learnStackPos + 1} von ${learnStack.length}`;

    const idx = learnStack[learnStackPos];
    const entry = vocabList[idx];
    currentEntry = initStatsForEntry(entry);

    const s = currentEntry.stats;
    s.timesShown = (s.timesShown || 0) + 1;
    if (!Array.isArray(s.sessions)) s.sessions = [];
    if (!s.sessions.includes(currentSessionId)) s.sessions.push(currentSessionId);
    s.lastSession = currentSessionId;

    saveVocab();
    refreshStats();

    if (learnDirection === "DE_ES") {
        currentFrontTextValue = currentEntry.de || "";
        currentBackTextValue = currentEntry.es || "";
    } else {
        currentFrontTextValue = currentEntry.es || "";
        currentBackTextValue = currentEntry.de || "";
    }

    frontText.innerText = currentFrontTextValue;
    backText.innerText = currentBackTextValue;
    updateHistoryDots(currentEntry);
}

function startLearnStack(onlyHard = false) {
    if (!vocabList || vocabList.length === 0) {
        alert("Keine Vokabeln vorhanden!");
        return;
    }

    updateLearnDirectionFromUI();

    learnStack = onlyHard ? buildHardStack(10) : buildNormalStack(10);

    if (!learnStack || learnStack.length === 0) {
        alert(onlyHard
            ? "Keine schwierigen Vokabeln gefunden (weniger als 70% richtig)."
            : "Keine Vokabeln für den Lernstapel gefunden.");
        return;
    }

    stackResults = [];
    learnStackPos = 0;
    cardPhase = "front";
    currentResult = null;
    openOverlay();
    showCurrentCard();
}

function flipCardToBack() {
    if (cardPhase !== "front" || !currentEntry) return;
    const learnCard = document.getElementById("learnCard");
    const btnBackRow = document.getElementById("cardButtonsBack");
    const btnFrontRow = document.getElementById("cardButtonsFront");
    if (!learnCard || !btnBackRow || !btnFrontRow) return;

    learnCard.classList.add("show-back");
    btnFrontRow.classList.add("hidden");
    btnBackRow.classList.remove("hidden");
    cardPhase = "back";
}

function applyResult(isCorrect) {
    if (!currentEntry) return;
    if (cardPhase !== "back") return;
    if (currentResult !== null) return;

    const learnCard = document.getElementById("learnCard");
    const statusEl = document.getElementById("cardStatus");
    const btnNext = document.getElementById("btnNextCard");
    if (!learnCard || !statusEl || !btnNext) return;

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
        statusEl.innerText = `Falsch. Richtig wäre: ${currentBackTextValue}`;
        learnCard.classList.add("card-wrong");
    }

    if (s.history.length > 50) {
        s.history = s.history.slice(-50);
    }

    saveVocab();
    refreshStats();
    updateHistoryDots(currentEntry);

    btnNext.disabled = false;
}

function nextCard() {
    if (!learnStack || learnStack.length === 0) {
        closeOverlay();
        return;
    }

    if (currentEntry) {
        stackResults.push({
            de: currentEntry.de,
            es: currentEntry.es,
            result: currentResult
        });
    }

    learnStackPos++;
    showCurrentCard();
}

// ---------------------
// Swipe-Events
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

    if (Math.abs(dx) < SWIPE_THRESHOLD) return;
    if (cardPhase !== "back") return;

    if (dx > 0) applyResult(true);
    else applyResult(false);
}

function onCardMouseDown(e) {
    mouseDownX = e.clientX;
}

function onCardMouseUp(e) {
    if (mouseDownX === null) return;
    const dx = e.clientX - mouseDownX;
    mouseDownX = null;

    if (Math.abs(dx) < SWIPE_THRESHOLD) return;
    if (cardPhase !== "back") return;

    if (dx > 0) applyResult(true);
    else applyResult(false);
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
            .filter(e => e && typeof e.de === "string")
            .map(e => e.de.toLowerCase().trim())
    );

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
                console.error("Fehler vom Backend:", data);
                statusEl.innerText = "Fehler bei der KI-Abfrage.";
                return;
            }

            if (!Array.isArray(data) || data.length === 0) break;

            for (const entry of data) {
                if (!entry || !entry.de || !entry.es) continue;

                const key = String(entry.de).toLowerCase().trim();
                if (existing.has(key)) continue;

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
// Cloud-Sync (optional, Supabase)
// ---------------------
function hasSupabaseConfig() {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
    if (SUPABASE_URL.includes("DEINE_SUPABASE")) return false;
    if (SUPABASE_ANON_KEY.includes("DEIN_SUPABASE")) return false;
    return true;
}

async function syncWithCloud() {
    const statusEl = document.getElementById("cloudStatus");
    if (!statusEl) return;

    if (!hasSupabaseConfig()) {
        statusEl.innerText = "Supabase ist noch nicht konfiguriert. Trage SUPABASE_URL und SUPABASE_ANON_KEY in app.js ein.";
        return;
    }

    try {
        statusEl.innerText = "Lade Daten aus der Cloud ...";

        const url = `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?select=*&profile_id=eq.${encodeURIComponent(SUPABASE_PROFILE_ID)}`;
        const res = await fetch(url, {
            headers: {
                apikey: SUPABASE_ANON_KEY,
                Authorization: `Bearer ${SUPABASE_ANON_KEY}`
            }
        });

        if (!res.ok) throw new Error(`Fehler beim Laden: ${res.status} ${res.statusText}`);

        const remoteRows = await res.json();
        const remoteList = remoteRows.map(row =>
            initStatsForEntry({
                de: row.de,
                es: row.es,
                stats: row.stats || {}
            })
        );

        const mergedMap = new Map();

        function mergeEntry(entry) {
            const key = entry.de.toLowerCase();
            if (!mergedMap.has(key)) {
                mergedMap.set(key, initStatsForEntry(entry));
            } else {
                const existing = mergedMap.get(key);
                const s1 = existing.stats || {};
                const s2 = entry.stats || {};
                existing.stats = {
                    correct: (s1.correct || 0) + (s2.correct || 0),
                    wrong: (s1.wrong || 0) + (s2.wrong || 0),
                    timesShown: (s1.timesShown || 0) + (s2.timesShown || 0),
                    sessions: Array.from(new Set([...(s1.sessions || []), ...(s2.sessions || [])])),
                    lastSession: existing.lastSession || entry.lastSession || null,
                    history: [...(s1.history || []), ...(s2.history || [])].slice(-50)
                };
                mergedMap.set(key, existing);
            }
        }

        vocabList.forEach(mergeEntry);
        remoteList.forEach(mergeEntry);

        vocabList = Array.from(mergedMap.values());
        saveVocab();
        refreshStats();

        statusEl.innerText = "Synchronisiere Daten in die Cloud ...";

        const upsertUrl = `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}`;
        const payload = vocabList.map(entry => ({
            profile_id: SUPABASE_PROFILE_ID,
            de: entry.de,
            es: entry.es,
            stats: entry.stats || {}
        }));

        const upRes = await fetch(upsertUrl, {
            method: "POST",
            headers: {
                apikey: SUPABASE_ANON_KEY,
                Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
                "Content-Type": "application/json",
                Prefer: "resolution=merge-duplicates"
            },
            body: JSON.stringify(payload)
        });

        if (!upRes.ok) throw new Error(`Fehler beim Hochladen: ${upRes.status} ${upRes.statusText}`);

        statusEl.innerText = "Cloud-Sync abgeschlossen ✅ (PC & Handy sind jetzt auf demselben Stand).";
    } catch (err) {
        console.error(err);
        statusEl.innerText = "Cloud-Sync fehlgeschlagen: " + err.message;
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
    const btnStartHardStack = document.getElementById("btnStartHardStack");
    const btnNextCard = document.getElementById("btnNextCard");
    const btnCloseOverlay = document.getElementById("btnCloseOverlay");
    const learnCard = document.getElementById("learnCard");
    const btnAi = document.getElementById("btnAi");
    const btnFlipCard = document.getElementById("btnFlipCard");
    const btnMarkWrong = document.getElementById("btnMarkWrong");
    const btnMarkCorrect = document.getElementById("btnMarkCorrect");
    const btnCloudSync = document.getElementById("btnCloudSync");

    if (btnAdd) btnAdd.addEventListener("click", addWord);
    if (btnStartStack) btnStartStack.addEventListener("click", () => startLearnStack(false));
    if (btnStartHardStack) btnStartHardStack.addEventListener("click", () => startLearnStack(true));
    if (btnNextCard) btnNextCard.addEventListener("click", nextCard);
    if (btnCloseOverlay) btnCloseOverlay.addEventListener("click", closeOverlay);
    if (btnAi) btnAi.addEventListener("click", fetchAiVocab);
    if (btnFlipCard) btnFlipCard.addEventListener("click", flipCardToBack);
    if (btnMarkWrong) btnMarkWrong.addEventListener("click", () => applyResult(false));
    if (btnMarkCorrect) btnMarkCorrect.addEventListener("click", () => applyResult(true));
    if (btnCloudSync) btnCloudSync.addEventListener("click", syncWithCloud);

    if (learnCard) {
        learnCard.addEventListener("touchstart", onCardTouchStart, { passive: true });
        learnCard.addEventListener("touchend", onCardTouchEnd, { passive: true });
        learnCard.addEventListener("mousedown", onCardMouseDown);
        learnCard.addEventListener("mouseup", onCardMouseUp);
    }

    // Richtung initial aus UI setzen
    updateLearnDirectionFromUI();
});
