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

// ---------------------
// Session-Verwaltung
// Jede Seite-Öffnung = neue Lern-Einheit
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
// Stats-Struktur sicherstellen
// ---------------------
function initStatsForEntry(entry) {
    if (!entry.stats) entry.stats = {};
    const s = entry.stats;
    s.correct = s.correct || 0;
    s.wrong = s.wrong || 0;
    s.timesShown = s.timesShown || 0;
    if (!Array.isArray(s.sessions)) s.sessions = [];
    s.lastSession = s.lastSession || null;
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
// Vokabel-Tabelle rendern (alphabetisch nach Spanisch)
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
    // Liste immer mitaktualisieren
    renderVocabTable();
}

// Hilfsfunktion, um eine neue Vokabel mit Stats anzulegen
function createEntry(de, es) {
    return {
        de,
        es,
        stats: {
            correct: 0,
            wrong: 0,
            timesShown: 0,
            sessions: [],
            lastSession: null
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

    // Duplikate nach deutschem Wort verhindern
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

// Lernstapel aufbauen (bis zu 10 einzigartige Indizes)
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

function updateLearnButtonsState(active) {
    const btnCheck = document.getElementById("btnCheck");
    const btnDontKnow = document.getElementById("btnDontKnow");
    const btnSkip = document.getElementById("btnSkip");

    if (btnCheck) btnCheck.disabled = !active;
    if (btnDontKnow) btnDontKnow.disabled = !active;
    if (btnSkip) btnSkip.disabled = !active;
}

function showCurrentCard() {
    const questionEl = document.getElementById("learnQuestion");
    const inputEl = document.getElementById("learnInput");
    const infoEl = document.getElementById("learnInfo");

    if (!questionEl || !inputEl || !infoEl) return;

    if (!learnStack || learnStack.length === 0) {
        questionEl.innerText = "Noch kein Lernstapel gestartet.";
        inputEl.value = "";
        infoEl.innerText = "";
        updateLearnButtonsState(false);
        currentEntry = null;
        return;
    }

    if (learnStackPos < 0 || learnStackPos >= learnStack.length) {
        questionEl.innerText = "Stapel abgeschlossen! Du kannst einen neuen Stapel starten.";
        inputEl.value = "";
        infoEl.innerText = "";
        updateLearnButtonsState(false);
        currentEntry = null;
        return;
    }

    const idx = learnStack[learnStackPos];
    const entry = vocabList[idx];
    currentEntry = entry;

    const s = entry.stats;
    s.timesShown = (s.timesShown || 0) + 1;
    if (!Array.isArray(s.sessions)) s.sessions = [];
    if (!s.sessions.includes(currentSessionId)) {
        s.sessions.push(currentSessionId);
    }
    s.lastSession = currentSessionId;
    saveVocab();
    refreshStats();

    questionEl.innerText = `Karte ${learnStackPos + 1} von ${learnStack.length}: Was heißt „${entry.de}“ auf Spanisch?`;
    inputEl.value = "";
    inputEl.focus();
    infoEl.innerText = "Gib deine Antwort ein, oder klicke auf „Weiß ich nicht“ oder „Überspringen“.";

    updateLearnButtonsState(true);
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

    learnStackPos = 0;
    showCurrentCard();
}

// Antwort prüfen
function checkAnswer() {
    if (!currentEntry) {
        alert("Kein aktuelles Wort – starte zuerst einen Lernstapel.");
        return;
    }

    const inputEl = document.getElementById("learnInput");
    const infoEl = document.getElementById("learnInfo");

    if (!inputEl || !infoEl) return;

    const given = inputEl.value.toLowerCase().trim();
    if (given === "") {
        infoEl.innerText = "Bitte eine Antwort eingeben oder „Weiß ich nicht“ wählen.";
        return;
    }

    const s = currentEntry.stats;
    const correctSolution = currentEntry.es.toLowerCase().trim();

    if (given === correctSolution) {
        s.correct = (s.correct || 0) + 1;
        infoEl.innerText = "Richtig! ✅";
    } else {
        s.wrong = (s.wrong || 0) + 1;
        infoEl.innerText = `Falsch. Richtig wäre: ${currentEntry.es}`;
    }

    saveVocab();
    refreshStats();
}

// Weiß ich nicht → falsch werten, Lösung anzeigen
function dontKnow() {
    if (!currentEntry) {
        alert("Kein aktuelles Wort – starte zuerst einen Lernstapel.");
        return;
    }

    const infoEl = document.getElementById("learnInfo");
    if (!infoEl) return;

    const s = currentEntry.stats;
    s.wrong = (s.wrong || 0) + 1;

    infoEl.innerText = `Okay, du wusstest es nicht. Richtig wäre: ${currentEntry.es}`;
    saveVocab();
    refreshStats();
}

// Überspringen → nichts werten, nur zur nächsten Karte
function skipCard() {
    if (!learnStack || learnStack.length === 0) {
        alert("Kein Lernstapel aktiv.");
        return;
    }
    learnStackPos++;
    showCurrentCard();
}

// ---------------------
// KI-Vokabeln abrufen – mit Duplikat-Schutz & Wiederholungen
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
    const btnCheck = document.getElementById("btnCheck");
    const btnDontKnow = document.getElementById("btnDontKnow");
    const btnSkip = document.getElementById("btnSkip");
    const btnAi = document.getElementById("btnAi");

    if (btnAdd) btnAdd.addEventListener("click", addWord);
    if (btnStartStack) btnStartStack.addEventListener("click", startLearnStack);
    if (btnCheck) btnCheck.addEventListener("click", checkAnswer);
    if (btnDontKnow) btnDontKnow.addEventListener("click", dontKnow);
    if (btnSkip) btnSkip.addEventListener("click", skipCard);
    if (btnAi) btnAi.addEventListener("click", fetchAiVocab);

    updateLearnButtonsState(false);
});
