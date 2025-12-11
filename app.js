<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8" />
    <title>Vokabeltrainer</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 20px;
            background: #f5f5f5;
        }

        h1 {
            text-align: center;
        }

        .card-block {
            background: white;
            padding: 15px;
            margin-bottom: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        label {
            font-weight: bold;
        }

        input[type="text"],
        input[type="number"] {
            width: 220px;
            padding: 6px;
            margin-right: 10px;
            margin-top: 5px;
        }

        button {
            padding: 8px 12px;
            margin-top: 10px;
            margin-right: 6px;
            background: #0078ff;
            border: none;
            color: white;
            cursor: pointer;
            border-radius: 6px;
            font-size: 14px;
        }

        button:disabled {
            opacity: 0.5;
            cursor: default;
        }

        button:hover:not(:disabled) {
            background: #005fcc;
        }

        #aiStatus {
            margin-top: 10px;
            font-style: italic;
            color: #333;
        }

        #stats {
            font-weight: bold;
            margin-top: 10px;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
            font-size: 14px;
        }

        th, td {
            border: 1px solid #ddd;
            padding: 6px 8px;
            text-align: left;
        }

        th {
            background-color: #eee;
        }

        /* Overlay für Lernkarten */
        .overlay {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.6);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 9999;
        }

        .overlay.hidden {
            display: none;
        }

        .overlay-inner {
            background: #ffffff;
            padding: 15px;
            border-radius: 10px;
            width: 320px;
            max-width: 90vw;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            position: relative;
        }

        .overlay-title {
            font-size: 14px;
            margin-bottom: 8px;
            color: #555;
        }

        .overlay-close {
            position: absolute;
            top: 8px;
            right: 8px;
            border: none;
            background: transparent;
            font-size: 20px;
            cursor: pointer;
            color: #666;
        }

        .overlay-close:hover {
            color: #000;
        }

        .card-container {
            perspective: 1000px;
            margin-top: 10px;
            margin-bottom: 10px;
        }

        .learn-card {
            width: 280px;
            height: 180px;
            margin: 0 auto;
            position: relative;
            transform-style: preserve-3d;
            transition: transform 0.5s;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            overflow: hidden;
        }

        .learn-card.flipped {
            transform: rotateY(180deg);
        }

        .card-face {
            position: absolute;
            inset: 0;
            backface-visibility: hidden;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            padding: 10px;
            box-sizing: border-box;
            background: #ffffff;
        }

        .card-back {
            transform: rotateY(180deg);
        }

        .learn-card.card-correct .card-face {
            background: #c8f7c5;
        }

        .learn-card.card-wrong .card-face {
            background: #f8c4c4;
        }

        #cardFrontText, #cardBackText {
            font-size: 24px;
            text-align: center;
            padding: 0 5px;
        }

        /* Punkte-Historie oben links */
        #cardHistoryDots {
            position: absolute;
            top: 6px;
            left: 8px;
            display: flex;
            gap: 4px;
        }

        .dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #ddd;
        }

        .dot.correct {
            background: #3ba55d;
        }

        .dot.wrong {
            background: #e53935;
        }

        #cardStatus {
            font-size: 13px;
            margin-top: 6px;
            min-height: 18px;
            text-align: center;
        }

        #btnNextCard {
            width: 100%;
            margin-top: 10px;
        }

        #summaryContainer {
            margin-top: 10px;
        }

        #summaryContainer table {
            font-size: 12px;
        }

        #summaryContainer th, #summaryContainer td {
            padding: 4px;
        }
    </style>
</head>

<body>
    <h1>Vokabeltrainer</h1>

    <!-- Manuelles Hinzufügen -->
    <div class="card-block">
        <h2>Vokabel hinzufügen</h2>
        <label>Deutsch:</label><br />
        <input id="inputDe" type="text" placeholder="Haus" /><br />

        <label>Spanisch:</label><br />
        <input id="inputEs" type="text" placeholder="casa" /><br />

        <button id="btnAdd">Hinzufügen</button>
    </div>

    <!-- Lernen -->
    <div class="card-block">
        <h2>Lernen (Stapel von 10 Karten)</h2>
        <p>Es wird ein Stapel von bis zu 10 Karten erstellt. Jede Karte kann per Wischen bewertet werden:
            <br>Rechts wischen = gewusst (grün), Links wischen = nicht gewusst (rot). Weiter zur nächsten Karte erst nach Klick auf „Weiter“.
        </p>
        <button id="btnStartStack">Stapel (10 Karten) starten</button>
    </div>

    <!-- KI-Vokabelvorschläge -->
    <div class="card-block">
        <h2>KI-Vokabeln generieren</h2>

        <label>Thema:</label><br />
        <input id="aiTopic" type="text" placeholder="Essen, Haushalt, Reisen ..." /><br />

        <label>Anzahl:</label><br />
        <input id="aiCount" type="number" min="1" max="50" value="10" /><br />

        <button id="btnAi">KI-Vokabeln hinzufügen</button>

        <div id="aiStatus"></div>
    </div>

    <!-- Statistik -->
    <div class="card-block">
        <h2>Statistik</h2>
        <div id="stats">Gesamt: 0</div>
    </div>

    <!-- Vokabel-Liste -->
    <div class="card-block">
        <h2>Alle Vokabeln (alphabetisch nach Spanisch)</h2>
        <table>
            <thead>
                <tr>
                    <th>#</th>
                    <th>Spanisch</th>
                    <th>Deutsch</th>
                    <th>Gezeigt</th>
                    <th>Richtig</th>
                    <th>Falsch</th>
                </tr>
            </thead>
            <tbody id="vocabTableBody">
                <!-- wird per JavaScript gefüllt -->
            </tbody>
        </table>
    </div>

    <!-- Overlay für Lernkarten -->
    <div id="learnOverlay" class="overlay hidden">
        <div class="overlay-inner">
            <button id="btnCloseOverlay" class="overlay-close">×</button>
            <div class="overlay-title" id="overlayTitle">Lernstapel</div>

            <div id="cardArea">
                <div class="card-container">
                    <div id="learnCard" class="learn-card">
                        <div class="card-face card-front">
                            <div id="cardHistoryDots"></div>
                            <div id="cardFrontText"></div>
                        </div>
                        <div class="card-face card-back">
                            <div id="cardBackText"></div>
                        </div>
                    </div>
                </div>
                <div id="cardStatus"></div>
                <button id="btnNextCard">Weiter</button>
            </div>

            <div id="summaryContainer" class="hidden"></div>
        </div>
    </div>

    <!-- App-Script -->
    <script src="app.js"></script>
</body>
</html>
