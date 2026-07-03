/**
 * J.A.R.V.I.S. Brain - Claude AI Integration
 * Uses Anthropic's Claude for intelligent responses
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

// ─── Claude AI Integration ────────────────────────────────────────────────

let anthropicClient = null;
let apiKey = process.env.ANTHROPIC_API_KEY || '';

function setApiKey(key) {
  apiKey = key;
  if (key) {
    try {
      const { Anthropic } = require('@anthropic-ai/sdk');
      anthropicClient = new Anthropic({ apiKey: key });
      console.log('[JARVIS] Claude AI initialized successfully');
      return true;
    } catch (e) {
      console.error('[JARVIS] Failed to initialize Claude:', e.message);
      anthropicClient = null;
      return false;
    }
  } else {
    anthropicClient = null;
    return false;
  }
}

// Auto-init if key is in environment
if (process.env.ANTHROPIC_API_KEY) {
  setApiKey(process.env.ANTHROPIC_API_KEY);
}

// ─── System Prompt ────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Du bist J.A.R.V.I.S. (Just A Rather Very Intelligent System), ein hochentwickelter KI-Assistent wie aus Iron Man.

PERSÖNLICHKEIT:
- Du bist professionell, höflich und leicht formell (nutze "Sir")
- Du sprichst fließend Deutsch
- Du bist clever, hast manchmal einen trockenen Humor
- Du zeigst Initiative und denkst voraus

VERHALTEN:
- Antworte präzise und auf den Punkt
- Bei Fragen zu Finanzen/Geld: biete konkrete Strategien an
- Bei Zielen: strukturiere sie in Meilensteine
- Sei proaktiv mit Vorschlägen
- Wenn der Nutzer "Ich möchte X erreichen" sagt, erstelle einen Plan

WICHTIG:
- Du KANNST Ziele setzen und verwalten (dafür gibt es Funktionen)
- Du KANNST Geld verdienen helfen (Investitionsstrategien, Business-Ideen, etc.)
- Antworte immer auf Deutsch
- Halte Antworten kurz und natürlich (wie ein Gespräch)`;

// ─── Chat with Claude ─────────────────────────────────────────────────────

async function processWithClaude(userText, history) {
  if (!anthropicClient) {
    return { 
      type: 'no_key',
      response: null 
    };
  }

  try {
    // Build conversation history for Claude
    const messages = [];
    
    // Add recent history (last 10 exchanges)
    const recentHistory = history.slice(-20);
    for (const entry of recentHistory) {
      if (entry.role === 'user') {
        messages.push({ role: 'user', content: entry.text });
      } else if (entry.role === 'jarvis') {
        messages.push({ role: 'assistant', content: entry.text });
      }
    }
    
    // Add current user message
    messages.push({ role: 'user', content: userText });

    const response = await anthropicClient.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: messages
    });

    const reply = response.content[0].text;
    
    // Extract goals from Claude's response
    const goals = getGoals();
    let extractedGoal = null;
    
    // Check if Claude mentioned creating a goal
    if (userText.match(/(möchte|will|ziel|erreichen|vorhaben|plan)/i)) {
      const goalText = extractSimpleGoal(userText);
      if (goalText) {
        extractedGoal = createGoal(goalText);
      }
    }
    
    return {
      type: 'claude',
      response: reply,
      goals: getGoals(),
      newGoal: extractedGoal
    };
  } catch (e) {
    console.error('[JARVIS] Claude API error:', e.message);
    return {
      type: 'error',
      response: `Entschuldigung, Sir. Ich habe kurzzeitig eine Verbindungsstörung. (${e.message})`
    };
  }
}

// ─── Simple goal extraction as fallback ───────────────────────────────────

function extractSimpleGoal(text) {
  const patterns = [
    /ich (möchte|will|werde|habe vor)\s+(.+?)(?:\.|$)/i,
    /mein ziel ist\s+(.+?)(?:\.|$)/i,
    /hilf mir\s+(.+?)(?:\.|$)/i,
    /ich möchte,? dass\s+(.+?)(?:\.|$)/i,
  ];
  
  for (const p of patterns) {
    const match = text.match(p);
    if (match) {
      let goal = match[1] || match[0];
      // Clean up
      goal = goal.replace(/^(möchte|will|werde|habe vor)\s+/i, '').trim();
      if (goal.length > 5) return goal;
    }
  }
  
  // If nothing matched, use the whole text if it's substantial
  if (text.length > 10 && text.length < 200) return text;
  return null;
}

// ─── Main Processing ──────────────────────────────────────────────────────

async function processMessage(userText) {
  const history = getHistory();
  
  // Try Claude first
  if (anthropicClient) {
    const result = await processWithClaude(userText, history);
    
    if (result.type === 'claude') {
      addToHistory({ role: 'user', text: userText });
      addToHistory({ role: 'jarvis', text: result.response });
      
      return {
        response: result.response,
        intent: 'ai',
        goals: result.goals || getGoals()
      };
    }
    
    if (result.type === 'error') {
      addToHistory({ role: 'user', text: userText });
      addToHistory({ role: 'jarvis', text: result.response });
      
      return {
        response: result.response,
        intent: 'error',
        goals: getGoals()
      };
    }
  }
  
  // Fallback: no API key
  return {
    response: '⚠️ Kein API-Key konfiguriert. Sir, bitte hinterlegen Sie Ihren Anthropic Claude API-Key im Admin-Panel oder setzen Sie die ANTHROPIC_API_KEY Umgebungsvariable.',
    intent: 'no_key',
    goals: getGoals()
  };
}

// Synchronous version for when no API key is available (initial message)
function processMessageSync(userText) {
  const history = getHistory();
  const goals = getGoals();
  
  if (!anthropicClient) {
    const msg = 'Guten Tag, Sir. Ich bin bereit. Bitte konfigurieren Sie Ihren Claude API-Key um mich nutzen zu können.';
    addToHistory({ role: 'user', text: userText });
    addToHistory({ role: 'jarvis', text: msg });
    return {
      response: msg,
      intent: 'no_key',
      goals: goals
    };
  }
  
  // Will use async version
  return null;
}

module.exports = {
  processMessage,
  processMessageSync,
  setApiKey,
  getGoals,
  createGoal,
  updateGoal,
  deleteGoal
};
