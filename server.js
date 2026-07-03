/**
 * J.A.R.V.I.S. Backend Server
 * Express-based API server for the J.A.R.V.I.S. interface
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

// Request logging
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

app.post('/api/chat', (req, res) => {
  const { message } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message is required' });
  }

  if (message.length > 1000) {
    return res.status(400).json({ error: 'Message too long' });
  }

  try {
    // Simulate realistic processing delay
    const delay = 300 + Math.random() * 700;

    setTimeout(() => {
      const result = brain.processMessage(message.trim());
      res.json(result);
    }, delay);
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Internal processing error' });
  }
});

// ─── Goals API ──────────────────────────────────────────────────────────

// GET /api/goals - List all goals
app.get('/api/goals', (req, res) => {
  try {
    const goals = brain.getGoals();
    res.json({ goals });
  } catch (err) {
    console.error('Goals fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch goals' });
  }
});

// POST /api/goals - Create a new goal
app.post('/api/goals', (req, res) => {
  const { text } = req.body;

  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Goal text is required' });
  }

  if (text.length > 500) {
    return res.status(400).json({ error: 'Goal text too long' });
  }

  try {
    const goal = brain.createGoal(text.trim());
    res.status(201).json({ goal });
  } catch (err) {
    console.error('Goal creation error:', err);
    res.status(500).json({ error: 'Failed to create goal' });
  }
});

// PATCH /api/goals/:id - Update a goal (complete, update progress, etc.)
app.patch('/api/goals/:id', (req, res) => {
  const { id } = req.params;
  const allowed = ['status', 'progress', 'text', 'milestones'];
  const updates = {};

  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      updates[key] = req.body[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  try {
    const goal = brain.updateGoal(id, updates);
    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }
    res.json({ goal });
  } catch (err) {
    console.error('Goal update error:', err);
    res.status(500).json({ error: 'Failed to update goal' });
  }
});

// DELETE /api/goals/:id - Delete a goal
app.delete('/api/goals/:id', (req, res) => {
  const { id } = req.params;
  try {
    brain.deleteGoal(id);
    res.json({ success: true });
  } catch (err) {
    console.error('Goal delete error:', err);
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
    version: '1.0.0',
    uptime: process.uptime(),
    memory: process.memoryUsage().rss,
    stats: {
      totalGoals: total,
      activeGoals: active.length,
      completedGoals: completed.length,
      successRate: rate
    }
  });
});

// ─── Serve index.html for all non-API routes ───────────────────────────

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ─── Start Server ───────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════╗
║     J.A.R.V.I.S. Interface v1.0.0        ║
║     Running on http://localhost:${PORT}      ║
╚═══════════════════════════════════════════╝
  `);
});
