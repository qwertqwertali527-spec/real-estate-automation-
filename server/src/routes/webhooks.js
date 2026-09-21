// Inbound message webhook — the integration point for Twilio (SMS), SendGrid/Mailgun
// (email), web chat widgets, or N8N. Triggers the autonomous AI pipeline.
import { Router } from 'express';
import { all, get, run, now, logActivity } from '../db.js';
import { runAutopilot, effectiveConfig } from '../ai.js';

const router = Router();

function findOrCreateContact({ name, phone, email, channel }) {
  let contact = null;
  if (email) contact = get('SELECT * FROM contacts WHERE lower(email) = lower(?)', email);
  if (!contact && phone) contact = get('SELECT * FROM contacts WHERE phone = ? OR replace(replace(replace(phone,\' \',\'\'),\'-\',\'\'),\'(\',\'\') = ?', phone, phone.replace(/[\s\-()]/g, ''));
  if (contact) return contact;
  const displayName = name || (email ? email.split('@')[0] : phone) || 'Unknown lead';
  const info = run(
    "INSERT INTO contacts (name, email, phone, type, stage, tags, source, created_at, updated_at) VALUES (?,?,?,?,'new','[]',?,?,?)",
    displayName, email || null, phone || null, `inbound_${channel}`, `inbound_${channel}`, now(), now()
  );
  logActivity('lead_captured', 'contact', info.lastInsertRowid, `New lead captured from inbound ${channel}: ${displayName}`);
  return get('SELECT * FROM contacts WHERE id = ?', info.lastInsertRowid);
}

function findOrCreateConversation(contactId, channel) {
  let conv = get(
    "SELECT * FROM conversations WHERE contact_id = ? AND channel = ? AND status != 'closed' ORDER BY id DESC LIMIT 1",
    contactId, channel
  );
  if (conv) return conv;
  const info = run(
    'INSERT INTO conversations (contact_id, channel, autopilot, created_at) VALUES (?,?,?,?)',
    contactId, channel, effectiveConfig().autopilotDefault ? 1 : 0, now()
  );
  return get('SELECT * FROM conversations WHERE id = ?', info.lastInsertRowid);
}

// POST /api/webhooks/inbound
// Accepts a normalized payload, plus common provider shapes:
//   { channel, from, name?, email?, body }
//   Twilio SMS: { From: '+1...', To: '...', Body: '...' }
router.post('/inbound', async (req, res) => {
  try {
    const b = req.body || {};
    const channel = (b.channel || (b.From ? 'sms' : 'webchat')).toLowerCase();
    if (!['sms', 'email', 'webchat'].includes(channel)) return res.status(400).json({ error: 'channel must be sms | email | webchat' });
    const phone = b.from || b.From || b.phone || null;
    const email = b.email || b.fromEmail || null;
    const name = b.name || b.profileName || null;
    const body = b.body || b.Body || b.text || null;
    if (!body || !String(body).trim()) return res.status(400).json({ error: 'message body is required (body | Body | text)' });
    if (!phone && !email) return res.status(400).json({ error: 'sender identity required (from / email)' });

    const contact = findOrCreateContact({ name, phone, email, channel });
    const conv = findOrCreateConversation(contact.id, channel);

    run(
      "INSERT INTO messages (conversation_id, direction, body, created_at) VALUES (?, 'in', ?, ?)",
      conv.id, String(body).trim(), now()
    );
    run('UPDATE conversations SET last_message_at = ?, unread = unread + 1, status = CASE WHEN status = ? THEN ? ELSE status END WHERE id = ?',
      now(), 'closed', 'open', conv.id);
    logActivity('inbound_message', 'conversation', conv.id, `Inbound ${channel} from ${contact.name}`);

    // Autonomous handling
    let autopilot = null;
    if (conv.autopilot) autopilot = await runAutopilot(conv.id, contact);

    const thread = all('SELECT * FROM messages WHERE conversation_id = ? ORDER BY id ASC', conv.id);
    const updated = get('SELECT * FROM conversations WHERE id = ?', conv.id);
    res.status(201).json({
      ok: true,
      conversation_id: conv.id,
      contact_id: contact.id,
      autopilot: autopilot ? { sent: autopilot.sent, reason: autopilot.reason || null, provider: autopilot.ai?.provider, intent: autopilot.ai?.intent, lead_score: autopilot.ai?.lead_score, needs_human: autopilot.ai?.needs_human } : { sent: false, reason: 'autopilot_disabled' },
      messages: thread,
      conversation: updated,
    });
  } catch (e) {
    res.status(500).json({ error: `Webhook failed: ${e.message}` });
  }
});

export default router;
