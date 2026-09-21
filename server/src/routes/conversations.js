import { Router } from 'express';
import { all, get, run, now, logActivity } from '../db.js';
import { generateAiReply } from '../ai.js';

const router = Router();

function serializeConv(c) {
  const contact = get('SELECT id, name, email, phone, type, stage, tags, budget_min, budget_max, preferred_locations FROM contacts WHERE id = ?', c.contact_id);
  return { ...c, contact: contact ? { ...contact, tags: JSON.parse(contact.tags || '[]') } : null };
}

// GET /api/conversations — list with last message preview
router.get('/', (req, res) => {
  const { status } = req.query;
  const w = status ? 'WHERE cv.status = ?' : '';
  const rows = all(
    `SELECT cv.*,
       (SELECT body FROM messages m WHERE m.conversation_id = cv.id ORDER BY m.id DESC LIMIT 1) AS last_message,
       (SELECT direction FROM messages m WHERE m.conversation_id = cv.id ORDER BY m.id DESC LIMIT 1) AS last_direction,
       (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = cv.id) AS messages_count
     FROM conversations cv ${w} ORDER BY cv.last_message_at DESC LIMIT 200`,
    ...(status ? [status] : [])
  );
  const counts = {
    open: get("SELECT COUNT(*) AS n FROM conversations WHERE status = 'open'").n,
    pending_human: get("SELECT COUNT(*) AS n FROM conversations WHERE status = 'pending_human'").n,
    unread: get('SELECT COALESCE(SUM(unread),0) AS n FROM conversations').n,
  };
  res.json({ rows: rows.map(serializeConv), counts });
});

// GET /api/conversations/:id — thread + messages
router.get('/:id', (req, res) => {
  const conv = get('SELECT * FROM conversations WHERE id = ?', req.params.id);
  if (!conv) return res.status(404).json({ error: 'Conversation not found' });
  const messages = all('SELECT * FROM messages WHERE conversation_id = ? ORDER BY id ASC', conv.id);
  run('UPDATE conversations SET unread = 0 WHERE id = ?', conv.id);
  res.json({ ...serializeConv(conv), unread: 0, messages });
});

// PATCH /api/conversations/:id — autopilot toggle, status
router.patch('/:id', (req, res) => {
  const conv = get('SELECT * FROM conversations WHERE id = ?', req.params.id);
  if (!conv) return res.status(404).json({ error: 'Conversation not found' });
  const { autopilot, status, subject } = req.body || {};
  if (autopilot !== undefined) run('UPDATE conversations SET autopilot = ? WHERE id = ?', autopilot ? 1 : 0, conv.id);
  if (status !== undefined) {
    if (!['open', 'pending_human', 'closed'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    run('UPDATE conversations SET status = ? WHERE id = ?', status, conv.id);
    logActivity('conversation_status', 'conversation', conv.id, `Conversation marked ${status}`);
  }
  if (subject !== undefined) run('UPDATE conversations SET subject = ? WHERE id = ?', subject, conv.id);
  res.json(serializeConv(get('SELECT * FROM conversations WHERE id = ?', conv.id)));
});

// POST /api/conversations — start a conversation manually
router.post('/', (req, res) => {
  const { contact_id, channel = 'sms', subject = null, body = null, autopilot } = req.body || {};
  const contact = get('SELECT * FROM contacts WHERE id = ?', contact_id);
  if (!contact) return res.status(400).json({ error: 'Valid contact_id required' });
  if (!['sms', 'email', 'webchat'].includes(channel)) return res.status(400).json({ error: 'Invalid channel' });
  const info = run(
    'INSERT INTO conversations (contact_id, channel, subject, autopilot, last_message_at, created_at) VALUES (?,?,?,?,?,?)',
    contact.id, channel, subject, autopilot === undefined ? 1 : (autopilot ? 1 : 0), now(), now()
  );
  if (body) {
    run("INSERT INTO messages (conversation_id, direction, body, created_at) VALUES (?, 'out', ?, ?)", info.lastInsertRowid, body, now());
  }
  logActivity('conversation_started', 'conversation', info.lastInsertRowid, `Conversation started with ${contact.name} (${channel})`);
  res.status(201).json(serializeConv(get('SELECT * FROM conversations WHERE id = ?', info.lastInsertRowid)));
});

// POST /api/conversations/:id/messages — agent sends a message (human hand-off)
router.post('/:id/messages', (req, res) => {
  const conv = get('SELECT * FROM conversations WHERE id = ?', req.params.id);
  if (!conv) return res.status(404).json({ error: 'Conversation not found' });
  const { body } = req.body || {};
  if (!body || !body.trim()) return res.status(400).json({ error: 'body is required' });
  const info = run(
    "INSERT INTO messages (conversation_id, direction, body, ai_generated, created_at) VALUES (?, 'out', ?, 0, ?)",
    conv.id, body.trim(), now()
  );
  run("UPDATE conversations SET last_message_at = ?, unread = 0, status = CASE WHEN status = 'pending_human' THEN 'open' ELSE status END WHERE id = ?", now(), conv.id);
  logActivity('agent_reply', 'conversation', conv.id, 'Agent replied manually (autopilot bypassed)');
  res.status(201).json(get('SELECT * FROM messages WHERE id = ?', info.lastInsertRowid));
});

// POST /api/conversations/:id/suggest — AI drafts a reply WITHOUT sending
router.post('/:id/suggest', async (req, res) => {
  const conv = get('SELECT * FROM conversations WHERE id = ?', req.params.id);
  if (!conv) return res.status(404).json({ error: 'Conversation not found' });
  const contact = get('SELECT * FROM contacts WHERE id = ?', conv.contact_id);
  const lastIn = get("SELECT * FROM messages WHERE conversation_id = ? AND direction = 'in' ORDER BY id DESC LIMIT 1", conv.id);
  if (!lastIn) return res.status(400).json({ error: 'No inbound message to reply to yet' });
  try {
    const ai = await generateAiReply({ text: lastIn.body, contact });
    res.json({ suggestion: ai.reply, analysis: ai });
  } catch (e) {
    res.status(500).json({ error: `AI suggestion failed: ${e.message}` });
  }
});

// POST /api/conversations/:id/run-autopilot — manually trigger autopilot for the latest inbound
router.post('/:id/run-autopilot', async (req, res) => {
  const conv = get('SELECT * FROM conversations WHERE id = ?', req.params.id);
  if (!conv) return res.status(404).json({ error: 'Conversation not found' });
  const contact = get('SELECT * FROM contacts WHERE id = ?', conv.contact_id);
  const result = await runAutopilot(conv.id, contact);
  if (!result) return res.status(400).json({ error: 'No inbound message to process' });
  res.json(result);
});

export default router;
