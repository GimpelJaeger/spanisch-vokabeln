console.log("app.js wurde geladen!");

// Backend-URL (läuft im selben Server)
const AI_BACKEND_URL = "/ai-vocab";

// ---------------------
// Globale Variablen
// ---------------------
let vocabList = [];
let currentSessionId = 0;

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
        vocabList = raw.map(initStatsForEntry);
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

function refreshStats() {
    const total = vocabList.length;
    const statsEl = document.getElementById("stats");
    if (statsEl) {
        statsEl.innerText = `Gesamt: ${total}`;
    }
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
// Lernmodus – adaptiv
// ---------------------

// 1. Nächste Vokabel auswählen
function chooseNextEntryIndex() {
    if (!vocabList || vocabList.length === 0) return null;

    const initialPool = [];
    const advancedPool = [];

    vocabList.forEach((entry, index) => {
        const s = entry.stats || {};
        const sessions = Array.isArray(s.sessions) ? s.sessions : [];
        const uniqueSessions = sessions.length;

        if (uniqueSessions < 3) {
            // Phase 1: Jedes Wort soll mind. in 3 verschiedenen Sessions vorkommen
            initialPool.push({ entry, index, uniqueSessions });
        } else {
            // Phase 2: adaptives Wiederholen
            advancedPool.push({ entry, index });
        }
    });

    // Phase 1: Vokabeln, die noch nicht in 3 verschiedenen Sitzungen dran waren
    if (initialPool.length > 0) {
        // Bevorzuge diejenigen mit den wenigsten Sessions
        const minSessions = Math.min(...initialPool.map(i => i.uniqueSessions));
        const candidates = initialPool.filter(i => i.uniqueSessions === minSessions);
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        return pick.index;
    }

    // Phase 2: Alle haben 3 Sitzungen geschafft → jetzt nach Fehlern gewichten
    if (advancedPool.length === 0) {
        return null;
    }

    // Gewichtung: häufig falsch -> hohe Wahrscheinlichkeit,
    // häufig richtig -> geringere Wahrscheinlichkeit
    let totalWeight = 0;
    const weights = advancedPool.map(item => {
        const s = item.entry.stats;
        const wrong = s.wrong || 0;
        const correct = s.correct || 0;

        let weight = 1 + wrong * 2 - correct * 0.5;
        if (weight < 0.2) weight = 0.2; // nie ganz verschwinden lassen

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

    // Fallback
    return advancedPool[advancedPool.length - 1].index;
}

// 2. Lernen starten (ein Durchgang)
function learn() {
    if (!vocabList || vocabList.length === 0) {
        alert("Keine Vokabeln vorhanden!");
        return;
    }

    const idx = chooseNextEntryIndex();
    if (idx === null) {
        alert("Keine Vokabel gefunden (unerwartet).");
        return;
    }

    const entry = vocabList[idx];
    const s = entry.stats;

    // Anzeigen & Session-Tracking
    s.timesShown = (s.timesShown || 0) + 1;
    if (!Array.isArray(s.sessions)) s.sessions = [];
    if (!s.sessions.includes(currentSessionId)) {
        s.sessions.push(currentSessionId);
    }
    s.lastSession = currentSessionId;

    saveVocab(); // Zwischenstand sichern

    const solution = prompt(`Was heißt "${entry.de}" auf Spanisch?`);

    if (solution && solution.toLowerCase().trim() === entry.es.toLowerCase().trim()) {
        alert("Richtig! ✅");
        s.correct = (s.correct || 0) + 1;
    } else {
        alert(`Falsch. Richtig wäre: ${entry.es}`);
        s.wrong = (s.wrong || 0) + 1;
    }

    saveVocab();
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

    // Set mit allen bereits vorhandenen deutschen Wörtern
    const existing = new Set(
        vocabList.map(entry => entry.de.toLowerCase().trim())
    );

    let totalNew = 0;
    const maxRounds = 3; // maximal 3 KI-Runden pro Klick

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
                break; // nichts mehr zu holen
            }

            for (const entry of data) {
                if (!entry || !entry.de || !entry.es) continue;

                const key = String(entry.de).toLowerCase().trim();
                if (existing.has(key)) {
                    // schon vorhanden
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
    const btnLearn = document.getElementById("btnLearn");
    const btnAi = document.getElementById("btnAi");

    if (btnAdd) btnAdd.addEventListener("click", addWord);
    if (btnLearn) btnLearn.addEventListener("click", learn);
    if (btnAi) btnAi.addEventListener("click", fetchAiVocab);
});
