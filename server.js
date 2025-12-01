import express from "express";
import fetch from "node-fetch";
import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(express.json());

// ---------- Pfad zum aktuellen Ordner bestimmen ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------- Statische Dateien (Frontend) ausliefern ----------
app.use(express.static(__dirname));

// ---------- (optional) CORS ----------
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// ---------- OpenAI-Key ----------
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.warn("⚠ Kein OPENAI_API_KEY in .env gesetzt!");
}

// ---------- Prompt für OpenAI ----------
function buildPrompt(topic, count) {
  return `
Erstelle GENAU ${count} unterschiedliche Vokabelpaare Deutsch–Spanisch.
Thema: "${topic}".

RESTRIKTIONEN:
- Gib GENAU ${count} Einträge zurück, nicht mehr und nicht weniger.
- KEIN zusätzlicher Text, KEINE Erklärungen.
- Antworte NUR mit einem JSON-Array im folgenden Format:

[
  { "de": "Haus", "es": "casa" },
  { "de": "Baum", "es": "árbol" }
]

- Verwende einfache, alltagstaugliche Wörter.
`;
}

// ---------- KI-Route ----------
app.post("/ai-vocab", async (req, res) => {
  try {
    const { topic = "Alltag", count = 10 } = req.body;

    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: "Kein OPENAI_API_KEY gesetzt." });
    }

    const prompt = buildPrompt(topic, count);

    const apiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Du bist ein hilfreicher Vokabelgenerator." },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
      }),
    });

    const status = apiRes.status;
    const rawText = await apiRes.text();

    console.log("OpenAI Status:", status);
    console.log("OpenAI Antwort-Text:", rawText);

    if (!apiRes.ok) {
      return res.status(500).json({
        error: "Fehler bei OpenAI",
        status,
        body: rawText,
      });
    }

    // Gesamte Antwort als JSON parsen
    let data;
    try {
      data = JSON.parse(rawText);
    } catch (err) {
      console.error("Fehler beim Parsen der OpenAI-Gesamtantwort:", err);
      return res.status(500).json({
        error: "Ungültige Gesamtantwort von OpenAI",
        received: rawText,
      });
    }

    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      console.error("Keine message.content in der Antwort gefunden.");
      return res.status(500).json({
        error: "Keine Vokabelliste in der Antwort gefunden.",
        received: data,
      });
    }

    console.log("Assistant-Content:", content);

    // Jetzt NUR den content-String als JSON-Array parsen
    let jsonText = content.trim();
    const firstBracket = jsonText.indexOf("[");
    const lastBracket = jsonText.lastIndexOf("]");

    if (firstBracket !== -1 && lastBracket !== -1) {
      jsonText = jsonText.slice(firstBracket, lastBracket + 1);
    }

    let vocabList;
    try {
      vocabList = JSON.parse(jsonText);
    } catch (err) {
      console.error("Fehler beim JSON-Parsing des content:", err);
      return res.status(500).json({
        error: "Ungültiges JSON im message.content von OpenAI",
        received: jsonText,
      });
    }

    if (!Array.isArray(vocabList)) {
      vocabList = [vocabList];
    }

    console.log("VocabList length:", vocabList.length);

    if (vocabList.length === 0) {
      return res.status(500).json({
        error: "Leere oder ungültige Vokabelliste.",
        received: vocabList,
      });
    }

    // Sicherheitshalber auf gewünschte Anzahl kürzen
    const trimmed = vocabList.slice(0, count);

    res.json(trimmed);
  } catch (err) {
    console.error("Interner Fehler im /ai-vocab Handler:", err);
    res.status(500).json({ error: "Interner Serverfehler" });
  }
});

// ---------- Server starten ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Backend läuft auf Port", PORT);
});