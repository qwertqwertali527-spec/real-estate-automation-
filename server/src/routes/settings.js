import { Router } from 'express';
import { providerStatus, saveAiSettings, generateAiReply } from '../ai.js';

const router = Router();

// GET /api/settings/ai — provider status (keys masked)
router.get('/ai', (req, res) => {
  res.json(providerStatus());
});

// PUT /api/settings/ai — save provider / keys / business profile / autopilot default
router.put('/ai', (req, res) => {
  res.json(saveAiSettings(req.body || {}));
});

// POST /api/settings/ai/test — smoke-test the active provider
router.post('/ai/test', async (req, res) => {
  try {
    const r = await generateAiReply({ text: 'Hi, I am thinking about buying a 3 bedroom home in Scottsdale around $700k. Are you available this week?' });
    res.json({ ok: true, provider: r.provider, intent: r.intent, lead_score: r.lead_score, reply: r.reply });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
