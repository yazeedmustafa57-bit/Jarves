/**
 * J.A.R.V.I.S. Brain - Intelligent NLP Engine
 * Handles intent classification, goal extraction, and response generation.
 */

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'conversation.json');
const GOALS_FILE = path.join(__dirname, '..', 'data', 'goals.json');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// ─── Data Persistence ────────────────────────────────────────────────────

function loadJSON(file, fallback) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    }
  } catch (e) { /* ignore */ }
  return fallback;
}

function saveJSON(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error(`Failed to save ${file}:`, e.message);
  }
}

// ─── Goals Management ─────────────────────────────────────────────────────

function getGoals() {
  return loadJSON(GOALS_FILE, []);
}

function saveGoals(goals) {
  saveJSON(GOALS_FILE, goals);
}

function createGoal(text) {
  const goals = getGoals();
  const existing = goals.find(g => g.text.toLowerCase() === text.toLowerCase() && g.status === 'active');
  if (existing) return existing;
  const goal = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    text,
    status: 'active',
    createdAt: new Date().toISOString(),
    progress: 0,
    milestones: []
  };
  goals.push(goal);
  saveGoals(goals);
  return goal;
}

function updateGoal(id, updates) {
  const goals = getGoals();
  const idx = goals.findIndex(g => g.id === id);
  if (idx === -1) return null;
  goals[idx] = { ...goals[idx], ...updates };
  saveGoals(goals);
  return goals[idx];
}

function deleteGoal(id) {
  let goals = getGoals();
  goals = goals.filter(g => g.id !== id);
  saveGoals(goals);
}

// ─── Conversation Memory ─────────────────────────────────────────────────

function getHistory() {
  return loadJSON(DATA_FILE, []);
}

function addToHistory(entry) {
  const history = getHistory();
  history.push({
    ...entry,
    timestamp: new Date().toISOString()
  });
  if (history.length > 100) history.splice(0, history.length - 100);
  saveJSON(DATA_FILE, history);
}

// ─── Intent Classification ───────────────────────────────────────────────

const INTENT_PATTERNS = {
  greeting: [
    /^(h(e(llo|y))?|y(es|o)|hi|hey|servus|hallo|moin|tach|grüß|guten|na (so|denn)|was geht|tschüss)/i,
    /^(guten (morgen|tag|abend))/i,
    /^(schön|hallo|hey) (dich|sie) (zu sehen|kennen)/i,
  ],
  status: [
    /status|online|system|funktion|bereit|aktiv|zustand|lage|situation/i,
    /wie (geht's|läuft|steht's|ist der status)/i,
    /alles (okay|gut|in ordnung)/i,
  ],
  earn: [
    /verdien|\d+\s*€|euro|geld|profit|einkommen|umsatz|finanz|reich/i,
    /(geld|euro|cash) (verdienen|machen|holen|bekommen)/i,
    /(passives? )?(einkommen|income)/i,
  ],
  goal_set: [
    /ich (möchte|will|würde|werde|habe (vor|geplant)|muss)/i,
    /(ziel|goal|aufgabe|mission|erreichen|schaffen|bauen|erstellen|entwickeln)/i,
    /hilf mir (dabei|beim|bei der|bei dem)/i,
    /ich brauche (deine |deinen )?(hilfe|unterstützung)/i,
    /kannst du (mir|mich|für mich)/i,
    /setze (ein|einen) (ziel|goal|task)/i,
  ],
  complete: [
    /(erledigt|geschafft|fertig|done|abgeschlossen|complete)/i,
    /habe (es|das) (erledigt|geschafft|fertig)/i,
    /ziel (erreicht|abgeschlossen)/i,
  ],
  thanks: [
    /danke|thanks|thank you|merci|gracias/i,
  ],
  stop: [
    /stop|halt|aufhören|beenden|schließen|ende|shutdown/i,
  ],
  name: [
    /(wer|was) (bist|ist) (du|das)|(dein|wie ist dein) (name|bezeichnung)|jarvis/i,
  ],
  capabilities: [
    /(was |was )?(kannst|machst) (du|der)|(fähigkeiten|capabilities|funktionen|hilfe|help)/i,
    /was (kannst|kann) (du|der robot)/i,
  ]
};

function classifyIntent(text) {
  const lower = text.toLowerCase();
  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    for (const pattern of patterns) {
      if (lower.match(pattern)) {
        if (intent === 'goal_set' && lower.match(/(verdien|euro|€|geld|profit)/i)) {
          return 'earn';
        }
        return intent;
      }
    }
  }
  return 'unknown';
}

// ─── Goal Extraction ─────────────────────────────────────────────────────

function extractGoal(text) {
  // Remove greeting/salutation phrases
  let goal = text
    .replace(/^(ich (möchte|will|würde|werde|habe (vor|geplant)|muss)\s*(dass|,?\s*(dass|mir|dir)?\s*))?/i, '')
    .replace(/^(hilf mir (dabei|beim|bei der|bei dem)\s*)/i, '')
    .replace(/^(kannst du (mir|mich|für mich)\s*)/i, '')
    .replace(/^(ich brauche (deine |deinen )?(hilfe|unterstützung) (bei|mit|für) )/i, '')
    .replace(/^(setze (ein|einen) (ziel|goal|task) )/i, '')
    .replace(/^(bitte\s*)/i, '')
    .trim();

  // If goal is too short or empty, use the full text
  if (goal.length < 4) goal = text;
  return goal.charAt(0).toUpperCase() + goal.slice(1);
}

// ─── Response Generation ────────────────────────────────────────────────

function generateResponse(intent, userText, context) {
  const goals = context.goals || [];
  const activeGoals = goals.filter(g => g.status === 'active');
  const completedGoals = goals.filter(g => g.status === 'complete');

  switch (intent) {
    case 'greeting': {
      const hour = new Date().getHours();
      let timeGreeting = 'Guten Tag';
      if (hour < 10) timeGreeting = 'Guten Morgen';
      else if (hour < 18) timeGreeting = 'Guten Tag';
      else timeGreeting = 'Guten Abend';

      const goalCount = activeGoals.length;
      let goalNote = '';
      if (goalCount > 0) {
        goalNote = ` Sie haben ${goalCount} aktive Ziel${goalCount === 1 ? '' : 'e'} in Bearbeitung.`;
      } else {
        goalNote = ' Ich stehe bereit, um Ihre Ziele zu verfolgen.';
      }

      return `${timeGreeting}, Sir. J.A.R.V.I.S. ist online und voll funktionsfähig.${goalNote} Wie kann ich Ihnen helfen?`;
    }

    case 'name': {
      return 'Ich bin J.A.R.V.I.S. – Ihr intelligentes Assistenzsystem. Entwickelt, um Sie bei all Ihren Vorhaben zu unterstützen. Mein Name steht für Just A Rather Very Intelligent System.';
    }

    case 'capabilities': {
      const goalCount = activeGoals.length;
      return `Meine Systeme umfassen: Zielverfolgung und -management, Finanzanalyse, Marktüberwachung und strategische Planung. Aktuell verfolge ich ${goalCount} aktive Ziele für Sie. Sprechen Sie einfach Ihr Vorhaben aus, und ich leite die entsprechenden Maßnahmen ein.`;
    }

    case 'status': {
      const total = goals.length;
      const done = completedGoals.length;
      const rate = total > 0 ? Math.round((done / total) * 100) : 0;
      return `Alle Systeme funktionieren einwandfrei. Systemintegrität bei 100%. Keine Anomalien erkannt. Aktuell ${activeGoals.length} aktive Ziele. Erfolgsquote: ${rate}%. Ich bin bereit für Ihre Befehle, Sir.`;
    }

    case 'earn': {
      const match = userText.match(/(\d+(?:[.,]\d+)?)\s*(€|euro|eur)/i);
      const amount = match ? match[1].replace(',', '.') : null;
      const extractedGoal = extractGoal(userText);
      const goal = createGoal(extractedGoal);

      if (amount) {
        let formattedAmount = amount;
        if (amount.includes('.')) {
          formattedAmount = amount.replace(/\.0+$/, '');
        }
        return `Ziel erfasst: €${formattedAmount} generieren. Ich habe bereits mit der Analyse optimaler Einkommensströme, Marktchancen und Ressourcenallokation begonnen. Meine ersten Berechnungen zeigen mehrere vielversprechende Wege. Soll ich Ihnen eine detaillierte Strategie präsentieren, Sir?`;
      }
      return `Hervorragendes Ziel, Sir. Ich habe die finanziellen Wachstumsprotokolle initialisiert. Das Ziel "${extractedGoal}" wurde registriert und in meine Prioritätenliste aufgenommen. Ich werde kontinuierlich Marktanalysen durchführen und Ihnen die vielversprechendsten Möglichkeiten präsentieren.`;
    }

    case 'goal_set': {
      const extractedGoal = extractGoal(userText);

      if (userText.toLowerCase().match(/(verdien|euro|€|geld|profit)/i)) {
        return generateResponse('earn', userText, context);
      }

      const goal = createGoal(extractedGoal);
      return `Ziel registriert, Sir: "${extractedGoal}". Ich habe die Ressourcen entsprechend zugewiesen und werde den Fortschritt kontinuierlich überwachen. Lassen Sie mich wissen, wenn Sie weitere Anweisungen haben.`;
    }

    case 'complete': {
      if (activeGoals.length === 0) {
        return 'Es gibt keine aktiven Ziele, die als erledigt markiert werden könnten, Sir.';
      }
      const latest = activeGoals[activeGoals.length - 1];
      updateGoal(latest.id, { status: 'complete', completedAt: new Date().toISOString() });
      return `Ausgezeichnet, Sir! Ziel "${latest.text}" wurde als erledigt markiert. Insgesamt ${completedGoals.length + 1} Ziele erfolgreich abgeschlossen.`;
    }

    case 'thanks': {
      const count = completedGoals.length;
      let extra = '';
      if (count > 0) {
        extra = ` Wir haben bereits ${count} Ziel${count === 1 ? '' : 'e'} erfolgreich abgeschlossen.`;
      }
      return `Gern geschehen, Sir. Ich bin für Sie da.${extra}`;
    }

    case 'stop': {
      return 'System wird heruntergefahren. Es war eine Ehre, Sir. J.A.R.V.I.S. meldet sich ab.';
    }

    default: {
      // Try to extract a goal from the unknown input
      const extractedGoal = extractGoal(userText);
      if (extractedGoal && extractedGoal !== userText && extractedGoal.length > 3 && !userText.toLowerCase().match(/^(ja|nein|okay|ok|gut|super|perfekt|nichts|doch|vielleicht)$/i)) {
        const goal = createGoal(extractedGoal);
        return `Ich habe Ihre Anfrage verarbeitet, Sir. Ziel registriert: "${extractedGoal}". Ich werde entsprechende Maßnahmen einleiten und Sie über den Fortschritt informieren.`;
      }
      // For casual responses
      const casual = [
        'Ich verstehe, Sir. Möchten Sie, dass ich ein neues Ziel für Sie anlege, oder gibt es etwas Bestimmtes, das ich für Sie tun kann?',
        'Verstanden, Sir. Sagen Sie mir einfach, was Sie erreichen möchten, und ich werde die notwendigen Systeme aktivieren.',
        'Sehr wohl, Sir. Wenn Sie ein Ziel definieren möchten, sprechen Sie es einfach aus. Ich bin bereit.',
        'Zur Kenntnis genommen, Sir. Wie kann ich Sie bei Ihren Vorhaben unterstützen?',
      ];
      return casual[Math.floor(Math.random() * casual.length)];
    }
  }
}

// ─── Main Processing ────────────────────────────────────────────────────

function processMessage(userText) {
  const intent = classifyIntent(userText);
  const context = { goals: getGoals() };
  const response = generateResponse(intent, userText, context);
  const goals = getGoals();

  addToHistory({ role: 'user', text: userText, intent });
  addToHistory({ role: 'jarvis', text: response, intent: 'response' });

  return { response, intent, goals };
}

async function processWithOpenAI(userText, apiKey) {
  return processMessage(userText);
}

module.exports = {
  processMessage,
  processWithOpenAI,
  getGoals,
  createGoal,
  updateGoal,
  deleteGoal,
  classifyIntent
};
