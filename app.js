console.log("app.js wurde geladen!");

// Backend-URL (läuft im selben Server, bei Render auch)
const AI_BACKEND_URL = "/ai-vocab";

// Supabase-Konfiguration (4. Cloud-Sync)
// HIER DEINE WERTE EINTRAGEN, sonst macht Sync nur eine Fehlermeldung:
const SUPABASE_URL = "https://DEINE_SUPABASE_URL.supabase.co";
const SUPABASE_ANON_KEY = "DEIN_SUPABASE_ANON_KEY";
const SUPABASE_TABLE = "vocab";
const SUPABASE_PROFILE_ID = "standard-profil"; // gleicher Wert auf PC & Handy = gleicher Wortschatz

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
let cardPhase = "front";   // "front" | "back"
let learnDirection = "DE_ES"; // "DE_ES" | "ES_DE"

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
    if (!Array.isArray(s.history)) s.history = []; // Verlauf der letzten Antworten (true/false)
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
// Schwierigkeit berechnen
// ---------------------
function computeDifficultyScore(entry) {
    const s = entry.stats || {};
    const shown = s.timesShown || 0;
    const correct = s.correct || 0;
    const wrong = s.wrong || 0;
    const history = Array.isArray(s.history) ? s.history : [];
    const recent = history.slice(-5);
    const recentWrong = recent.filter(v => v === false).length;
    const recentTotal = recent.length;

    // Basis: Fehler insgesamt – richtige Antworten drücken die Schwierigkeit
    let score = wrong * 1.5 - correct * 0.4;

    // Aktuelle Phase stärker gewichten
    if (recentTotal > 0) {
        const recentRate = recentWrong / recentTotal;
        score += recentRate * 4; // starke Gewichtung auf die letzten Versuche
    }

    // Wörter mit sehr wenigen Wiederholungen bleiben trotzdem eher "mittel"
    if (shown < 3) {
        score += 0.5;
    }

    return score;
}

function getDifficultyLabel(entry) {
    const s = entry.stats || {};
    const shown = s.timesShown || 0;
    if (shown < 3) return "neu";

    const score = computeDifficultyScore(entry);
    if (score >= 4) return "schwer";
    if (score >= 1.5) return "mittel";
    return "leicht";
}

function getDifficultyCssClass(entry) {
    const label = getDifficultyLabel(entry);
    if (label === "schwer") return "difficulty-hard";
    if (label === "mittel") return "difficulty-medium";
    if (label === "leicht") return "difficulty-easy";
    return "";
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
        const shown = s.timesShown || 0;
        const correct = s.correct || 0;
        const wrong = s.wrong || 0;

        const tdShown = document.createElement("td");
        const tdCorrect = document.createElement("td");
        const tdWrong = document.createElement("td");
        const tdRate = document.createElement("td");
        const tdDiff = document.createElement("td");

        tdShown.textContent = shown;
        tdCorrect.textContent = correct;
        tdWrong.textContent = wrong;

        let rate = 0;
        if (shown > 0) {
            rate = Math.round((correct / shown) * 100);
        }
        tdRate.textContent = shown > 0 ? `${rate}%` : "-";

        const diffLabel = getDifficultyLabel(entry);
        tdDiff.textContent = diffLabel;

        const diffClass = getDifficultyCssClass(entry);
        if (diffClass) {
            tr.classList.add(diffClass);
        }

        tr.appendChild(tdIndex);
        tr.appendChild(tdEs);
        tr.appendChild(tdDe);
        tr.appendChild(tdShown);
        tr.appendChild(tdCorrect);
        tr.appendChild(tdWrong);
        tr.appendChild(tdRate);
        tr.appendChild(tdDiff);

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

    // Gewichtung mit Schwierigkeit
    let totalWeight = 0;
    const weights = advancedPool.map(item => {
        const score = computeDifficultyScore(item.entry);
        let weight = 1 + Math.max(score, 0); // negative Scores nicht belohnen
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

function buildLearnStack(size = 10, onlyHard = false) {
    const used = new Set();
    const stack = [];

    if (!vocabList || vocabList.length === 0) return [];

    const maxCards = Math.min(size, vocabList.length);
    let safety = 0;

    while (stack.length < maxCards && safety < 300) {
        let idx = chooseNextEntryIndex();
        if (idx === null) break;

        const entry = vocabList[idx];

        if (onlyHard) {
            const label = getDifficultyLabel(entry);
            if (label !== "schwer") {
                safety++;
                continue;
            }
        }

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
    const startIndex = Math.max(0, last5.length - totalDots);
    const display = last5.slice(startIndex);

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

function resetCardVisual() {
    const learnCard = document.getElementById("learnCard");
    const statusEl = document.getElementById("cardStatus");
    const btnFlip = document.getElementById("btnFlipCard");
    const btnBackRow = document.getElementById("cardButtonsBack");
    const btnFrontRow = document.getElementById("cardButtonsFront");
    const btnNext = document.getElementById("btnNextCard");

    if (!learnCard || !statusEl || !btnFlip || !btnBackRow || !btnFrontRow || !btnNext) return;

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
            if (res.result === true) {
                html += `<td>Richtig</td>`;
            } else if (res.result === false) {
                html += `<td>Falsch</td>`;
            } else {
                html += `<td>Keine Bewertung</td>`;
            }
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
    if (!s.sessions.includes(currentSessionId)) {
        s.sessions.push(currentSessionId);
    }
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

    learnStack = buildLearnStack(10, onlyHard);

    if (!learnStack || learnStack.length === 0) {
        alert(onlyHard
            ? "Keine schwierigen Vokabeln gefunden. Übe erst ein wenig, dann wird dieser Modus sinnvoll."
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

// Swipe-Events – nur auf Rückseite aktiv
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
        return;
    }

    if (cardPhase !== "back") return;

    if (dx > 0) {
        applyResult(true);
    } else {
        applyResult(false);
    }
}

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

    if (cardPhase !== "back") return;

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
// Cloud-Sync mit Supabase
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

        if (!res.ok) {
            throw new Error(`Fehler beim Laden: ${res.status} ${res.statusText}`);
        }

        const remoteRows = await res.json();

        const remoteList = remoteRows.map(row =>
            initStatsForEntry({
                de: row.de,
                es: row.es,
                stats: row.stats || {}
            })
        );

        // Merge: nach deutschem Wort (lowercase)
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

        if (!upRes.ok) {
            throw new Error(`Fehler beim Hochladen: ${upRes.status} ${upRes.statusText}`);
        }

        statusEl.innerText = "Cloud-Sync abgeschlossen ✅ (PC & Handy sind jetzt auf demselben Stand).";

    } catch (err) {
        console.error(err);
        const statusEl = document.getElementById("cloudStatus");
        if (statusEl) {
            statusEl.innerText = "Cloud-Sync fehlgeschlagen: " + err.message;
        }
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

    // Richtung-Umschalter
    const dirRadios = document.querySelectorAll("input[name='learnDirection']");
    dirRadios.forEach(radio => {
        radio.addEventListener("change", () => {
            learnDirection = radio.value;
        });
    });
});
