/**
 * J.A.R.V.I.S. Backend Server v2.0
 * Express-based API server with Claude AI integration
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const brain = require('./lib/jarvis-brain');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ──────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname)));

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.path.startsWith('/api')) {
      console.log(`[${new Date().toLocaleTimeString('de-DE')}] ${req.method} ${req.path} → ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// ─── Chat API ───────────────────────────────────────────────────────────

app.post('/api/chat', async (req, res) => {
  const { message } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message is required' });
  }

  if (message.length > 2000) {
    return res.status(400).json({ error: 'Message too long' });
  }

  try {
    const result = await brain.processMessage(message.trim());
    
    // Add small delay for natural feel
    setTimeout(() => {
      res.json(result);
    }, 200);
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Internal processing error' });
  }
});

// ─── API Key Configuration ──────────────────────────────────────────────

app.post('/api/config/key', (req, res) => {
  const { key } = req.body;
  
  if (!key || typeof key !== 'string') {
    return res.status(400).json({ error: 'API key is required' });
  }
  
  if (key.length < 10) {
    return res.status(400).json({ error: 'Invalid API key' });
  }
  
  const success = brain.setApiKey(key.trim());
  
  if (success) {
    res.json({ 
      success: true, 
      message: 'Claude API key configured successfully. J.A.R.V.I.S. is now fully operational.' 
    });
  } else {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to initialize Claude AI with the provided key.' 
    });
  }
});

app.get('/api/config/status', (req, res) => {
  const hasKey = !!(process.env.ANTHROPIC_API_KEY || brain.setApiKey.toString().includes('anthropicClient'));
  // Simple check
  res.json({
    ai: 'claude',
    configured: !!require.cache[require.resolve('@anthropic-ai/sdk')]
  });
});

// ─── Goals API ──────────────────────────────────────────────────────────

app.get('/api/goals', (req, res) => {
  try {
    res.json({ goals: brain.getGoals() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch goals' });
  }
});

app.post('/api/goals', (req, res) => {
  const { text } = req.body;
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Goal text is required' });
  }
  try {
    const goal = brain.createGoal(text.trim());
    res.status(201).json({ goal });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create goal' });
  }
});

app.patch('/api/goals/:id', (req, res) => {
  const { id } = req.params;
  const updates = {};
  for (const key of ['status', 'progress', 'text', 'milestones']) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }
  try {
    const goal = brain.updateGoal(id, updates);
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    res.json({ goal });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update goal' });
  }
});

app.delete('/api/goals/:id', (req, res) => {
  const { id } = req.params;
  try {
    brain.deleteGoal(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete goal' });
  }
});

// ─── System Status ──────────────────────────────────────────────────────

app.get('/api/status', (req, res) => {
  const goals = brain.getGoals();
  const active = goals.filter(g => g.status === 'active');
  const completed = goals.filter(g => g.status === 'complete');
  const total = goals.length;
  const rate = total > 0 ? Math.round((completed.length / total) * 100) : 0;

  res.json({
    status: 'online',
    version: '2.0.0',
    ai: 'claude-3.5-sonnet',
    uptime: process.uptime(),
    memory: process.memoryUsage().rss,
    hasApiKey: !!process.env.ANTHROPIC_API_KEY,
    stats: {
      totalGoals: total,
      activeGoals: active.length,
      completedGoals: completed.length,
      successRate: rate
    }
  });
});

// ─── Serve index.html ───────────────────────────────────────────────────

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ─── Start Server ───────────────────────────────────────────────────────

app.listen(PORT, () => {
  const hasKey = !!process.env.ANTHROPIC_API_KEY;
  console.log(`
╔═══════════════════════════════════════════╗
║     J.A.R.V.I.S. Interface v2.0          ║
║     AI Engine: Claude 3.5 Sonnet         ║
║     API Key: ${hasKey ? '✅ Configured' : '⚠️  Missing'}
║     Running on http://localhost:${PORT}   ║
╚═══════════════════════════════════════════╝
  `);
});
