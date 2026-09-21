// ── EstateFlow AI engine ───────────────────────────────────────────────────
// Provider abstraction: OpenAI → Anthropic → deterministic offline engine.
// The offline engine makes the autonomous messaging pipeline fully usable
// with no API keys (great for demos/dev); real providers engage as soon as
// a key is saved in Settings or present in the environment.
import { get, all, run, getSetting, setSetting, now, logActivity } from './db.js';

// ── Settings / provider resolution ─────────────────────────────────────────
export function effectiveConfig() {
  const s = getSetting('settings', {});
  const providerPref = process.env.AI_PROVIDER || s.aiProvider || 'auto';
  const openaiKey = s.openaiKey || process.env.OPENAI_API_KEY || '';
  const anthropicKey = s.anthropicKey || process.env.ANTHROPIC_API_KEY || '';
  let provider = 'mock';
  if (providerPref === 'openai' && openaiKey) provider = 'openai';
  else if (providerPref === 'anthropic' && anthropicKey) provider = 'anthropic';
  else if (providerPref === 'mock') provider = 'mock';
  else if (openaiKey) provider = 'openai';
  else if (anthropicKey) provider = 'anthropic';
  return {
    provider,
    providerPref,
    hasOpenai: Boolean(openaiKey),
    hasAnthropic: Boolean(anthropicKey),
    openaiModel: process.env.OPENAI_MODEL || s.openaiModel || 'gpt-4o-mini',
    anthropicModel: process.env.ANTHROPIC_MODEL || s.anthropicModel || 'claude-3-5-haiku-latest',
    openaiKey,
    anthropicKey,
    business: s.business || { name: 'Summit Realty Group', agent: 'Ava Morgan', phone: '(602) 555-0148', specialties: 'residential buy/sell in metro Phoenix' },
    autopilotDefault: s.autopilotDefault !== false,
  };
}

const mask = (k) => (k ? `••••${String(k).slice(-4)}` : '');

export function providerStatus() {
  const c = effectiveConfig();
  return {
    active: c.provider, preference: c.providerPref,
    openai: { configured: c.hasOpenai, keyMasked: mask(c.hasOpenai ? (getSetting('settings', {}).openaiKey ? 'saved' : process.env.OPENAI_API_KEY) : ''), model: c.openaiModel },
    anthropic: { configured: c.hasAnthropic, keyMasked: mask(c.hasAnthropic ? 'saved' : ''), model: c.anthropicModel },
    business: c.business,
    autopilotDefault: c.autopilotDefault,
  };
}

export function saveAiSettings(patch) {
  const s = getSetting('settings', {});
  const next = { ...s };
  if ('aiProvider' in patch) next.aiProvider = patch.aiProvider;
  if ('openaiKey' in patch && patch.openaiKey && !patch.openaiKey.startsWith('••')) next.openaiKey = patch.openaiKey;
  if ('openaiKey' in patch && patch.openaiKey === '') delete next.openaiKey;
  if ('anthropicKey' in patch && patch.anthropicKey && !patch.anthropicKey.startsWith('••')) next.anthropicKey = patch.anthropicKey;
  if ('anthropicKey' in patch && patch.anthropicKey === '') delete next.anthropicKey;
  if ('business' in patch && patch.business) next.business = patch.business;
  if ('autopilotDefault' in patch) next.autopilotDefault = Boolean(patch.autopilotDefault);
  setSetting('settings', next);
  return providerStatus();
}

// ── NLP helpers (offline) ──────────────────────────────────────────────────
const INTENT_RULES = [
  ['valuation',   /\b(worth|value of|valuation|appraise|cma|what.s my home)\b/i],
  ['selling',     /\b(sell|selling|list(ing)? my (house|home|property)|put (my|it) on the market)\b/i],
  ['buying',      /\b(buy|buying|purchase|looking (for|at) (a|an|homes?)|house hunt|showings?|tour)\b/i],
  ['renting',     /\b(rent|rental|lease|apartment for rent)\b/i],
  ['investing',   /\b(invest|cash ?flow|roi|rental property|flip)\b/i],
  ['scheduling',  /\b(schedule|appointment|tour|viewing|walk ?through|available (to )?show)\b/i],
  ['mortgage',    /\b(mortgage|pre.?approv|financing|loan|interest rate)\b/i],
];
const NEGATIVE_RE = /\b(angry|furious|terrible|awful|scam|lawsuit|lawyer|attorney|complaint|unacceptable|refund|worst)\b/i;
const ESCALATE_RE = /\b(lawsuit|lawyer|attorney|legal action|complaint|escalate|speak (to|with) (a )?(human|manager|person|someone)|cancel everything)\b/i;

export function detectIntent(text) {
  for (const [intent, re] of INTENT_RULES) if (re.test(text)) return intent;
  if (/https?:\/\/|crypto|bitcoin|seo services|increase your followers/i.test(text)) return 'spam';
  return 'general';
}

export function extractQualifiers(text) {
  const q = {};
  const budget = text.match(/\$\s?([\d,]{4,12})(?:\s?[-–to]+\s?\$?\s?([\d,]{4,12}))?/) || text.match(/([\d,]{3,12})\s?k\b/i);
  if (budget) {
    const parse = (v) => v ? Number(String(v).replace(/[,,$]/g, '')) * (/k\b/i.test(budget[0]) && !/\$/.test(budget[0]) ? 1000 : 1) : null;
    q.budgetMin = budget[2] ? parse(budget[1]) : null;
    q.budgetMax = budget[2] ? parse(budget[2]) : parse(budget[1]);
  }
  const beds = text.match(/\b([1-6])\s?(\+?\s?)(bed|bd|br|bedroom)/i);
  if (beds) q.minBeds = Number(beds[1]);
  const bath = text.match(/\b([1-5](?:\.\d)?)\s?(bath|ba\b)/i);
  if (bath) q.minBaths = Number(bath[1]);
  const loc = text.match(/\b(?:in|around|near|moving to)\s+([A-Z][a-zA-Z]+(?:\s?[A-Z][a-zA-Z]+)?)\b/);
  if (loc && !/^(The|I|We|My|It)\b/.test(loc[1])) q.locations = [loc[1]];
  const timeline = text.match(/\b(next\s?\w+|asap|immediately|this (month|week|weekend)|\d{1,2}\s?(days?|weeks?|months?))\b/i);
  if (timeline) q.timeline = timeline[1];
  const pre = /pre.?approv/i.test(text);
  if (pre) q.preApproved = true;
  return q;
}

function scoreLead(qual, intent, text) {
  let score = intent === 'buying' || intent === 'selling' || intent === 'valuation' ? 45 : intent === 'renting' || intent === 'investing' ? 35 : 15;
  if (qual.budgetMax) score += 20;
  if (qual.locations) score += 12;
  if (qual.timeline) score += 12;
  if (qual.preApproved) score += 8;
  if (qual.minBeds) score += 5;
  return Math.min(99, score);
}

// ── LLM providers ──────────────────────────────────────────────────────────
function buildSystemPrompt(cfg, contact, propertyContext) {
  const b = cfg.business;
  return [
    `You are the autonomous messaging assistant for ${b.name}, a real estate team (${b.specialties}). You reply on behalf of ${b.agent}.`,
    `Style: concise (under 90 words), warm, professional. Always end with a clear next step. Sign as ${b.agent}, ${b.name}.`,
    `Contact on file: ${contact?.name || 'unknown'}, type=${contact?.type || 'unknown'}, stage=${contact?.stage || 'new'}.`,
    propertyContext ? `Property context: ${propertyContext}` : '',
    `Analyze the message and reply with ONLY a JSON object:`,
    `{"reply": "...", "intent": "buying|selling|renting|investing|valuation|scheduling|mortgage|general|spam", "sentiment": "positive|neutral|negative", "lead_score": 0-99, "needs_human": true|false, "qualifiers": {"budget_max": 0, "locations": [], "timeline": ""}}`,
    `Set needs_human=true for legal threats, complaints, or requests for a human. Never invent listings or prices.`,
  ].filter(Boolean).join('\n');
}

function parseLlmJson(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

async function callOpenAI(cfg, system, userText) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: cfg.openaiModel,
      messages: [{ role: 'system', content: system }, { role: 'user', content: userText }],
      temperature: 0.4, max_tokens: 400,
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return parseLlmJson(data.choices?.[0]?.message?.content || '');
}

async function callAnthropic(cfg, system, userText) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': cfg.anthropicKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: cfg.anthropicModel, max_tokens: 500, system,
      messages: [{ role: 'user', content: userText }],
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return parseLlmJson((data.content || []).map((c) => c.text || '').join(''));
}

// ── Offline deterministic engine ───────────────────────────────────────────
function offlineReply(cfg, contact, text, intent, qual, score) {
  const b = cfg.business;
  const name = (contact?.name || 'there').split(' ')[0];
  const REPLY = {
    buying: () => `Hi ${name}, thanks for reaching out! I'd love to help you find the right home${qual.locations ? ` in ${qual.locations.join(' and ')}` : ''}${qual.budgetMax ? ` around $${Number(qual.budgetMax).toLocaleString()}` : ''}. ${qual.minBeds ? `I'll filter for ${qual.minBeds}+ bedrooms. ` : ''}Could you share a good time this week for a quick call? I'll line up matching listings beforehand. — ${b.agent}, ${b.name}`,
    selling: () => `Hi ${name}, thanks for reaching out about selling! I can start with a free market analysis of your property — could you confirm the address and any recent upgrades or repairs? From there I'll outline pricing strategy and next steps. — ${b.agent}, ${b.name}`,
    valuation: () => `Hi ${name}, happy to put together a free, no-obligation market analysis for your property. Could you confirm the address and any recent upgrades? I'll have the valuation over to you within 24 hours. — ${b.agent}, ${b.name}`,
    renting: () => `Hi ${name}, thanks for reaching out about renting. Could you share your target move-in date, budget, and preferred areas? I'll send matching options right away. — ${b.agent}, ${b.name}`,
    investing: () => `Hi ${name}, great to hear you're looking at investment opportunities. I can pull cash-flow analysis for target neighborhoods${qual.budgetMax ? ` under $${Number(qual.budgetMax).toLocaleString()}` : ''}. When's a good time for a 15-minute call? — ${b.agent}, ${b.name}`,
    scheduling: () => `Hi ${name}, absolutely — let's get that on the calendar. Do afternoons or evenings work better for you? I'll confirm the exact slot shortly. — ${b.agent}, ${b.name}`,
    mortgage: () => `Hi ${name}, happy to point you in the right direction on financing. We work with trusted local lenders who can get you pre-approved quickly. Want me to make an introduction? — ${b.agent}, ${b.name}`,
    spam: () => null,
    general: () => `Hi ${name}, thanks for getting in touch with ${b.name}! I'd be glad to help with your real estate needs. Could you tell me a bit more about what you're looking for? — ${b.agent}, ${b.name}`,
  };
  const body = (REPLY[intent] || REPLY.general)();
  return {
    reply: body,
    intent,
    sentiment: NEGATIVE_RE.test(text) ? 'negative' : 'positive',
    lead_score: score,
    needs_human: false,
    qualifiers: qual,
  };
}

// ── Public API: analyze + generate a reply ─────────────────────────────────
export async function generateAiReply({ text, contact = null, propertyContext = null }) {
  const cfg = effectiveConfig();
  const offlineIntent = detectIntent(text);
  const offlineQual = extractQualifiers(text);
  const offlineScore = scoreLead(offlineQual, offlineIntent, text);
  const system = buildSystemPrompt(cfg, contact, propertyContext);

  let result = null, providerUsed = 'mock', error = null;
  if (cfg.provider === 'openai') {
    try { result = await callOpenAI(cfg, system, text); providerUsed = 'openai'; }
    catch (e) { error = e.message; }
  } else if (cfg.provider === 'anthropic') {
    try { result = await callAnthropic(cfg, system, text); providerUsed = 'anthropic'; }
    catch (e) { error = e.message; }
  }
  if (!result) {
    providerUsed = 'mock';
    result = offlineReply(cfg, contact, text, offlineIntent, offlineQual, offlineScore);
  }
  const needsHuman =
    result.needs_human === true || ESCALATE_RE.test(text) ||
    (result.sentiment === 'negative' && NEGATIVE_RE.test(text));
  return {
    ...result,
    intent: result.intent || offlineIntent,
    sentiment: result.sentiment || 'neutral',
    lead_score: Number.isFinite(+result.lead_score) ? Math.max(0, Math.min(99, Math.round(+result.lead_score))) : offlineScore,
    qualifiers: result.qualifiers && Object.keys(result.qualifiers).length ? result.qualifiers : offlineQual,
    needs_human: needsHuman || result.intent === 'spam' ? needsHuman : needsHuman,
    provider: providerUsed,
    fallback_reason: providerUsed === 'mock' && error ? error : null,
  };
}

// ── Autopilot: run after an inbound message ────────────────────────────────
export async function runAutopilot(conversationId, contact) {
  const lastIn = get(
    "SELECT * FROM messages WHERE conversation_id = ? AND direction = 'in' ORDER BY id DESC LIMIT 1",
    conversationId
  );
  if (!lastIn) return null;
  const ai = await generateAiReply({ text: lastIn.body, contact });

  // spam → no reply, just tag.  needs_human → escalate, don't auto-send.
  if (ai.intent === 'spam') {
    run("UPDATE conversations SET status = 'open' WHERE id = ?", conversationId);
    return { sent: false, reason: 'spam_detected', ai };
  }
  if (ai.needs_human) {
    run("UPDATE conversations SET status = 'pending_human' WHERE id = ?", conversationId);
    logActivity('escalation', 'conversation', conversationId,
      `Conversation escalated to human (lead score ${ai.lead_score})`, { intent: ai.intent });
    return { sent: false, reason: 'needs_human', ai };
  }

  run(
    "INSERT INTO messages (conversation_id, direction, body, intent, sentiment, ai_generated, meta, created_at) VALUES (?,?,?,?,?,1,?,?)",
    conversationId, 'out', ai.reply, ai.intent, ai.sentiment,
    JSON.stringify({ provider: ai.provider, lead_score: ai.lead_score, qualifiers: ai.qualifiers }), now()
  );
  run('UPDATE conversations SET last_message_at = ?, unread = 0 WHERE id = ?', now(), conversationId);

  // Enrich the contact with extracted qualifiers (lead qualification)
  if (contact) {
    const q = ai.qualifiers || {};
    const patch = {};
    if (q.budgetMax && !contact.budget_max) patch.budget_max = q.budgetMax;
    if (q.budgetMin && !contact.budget_min) patch.budget_min = q.budgetMin;
    if (q.locations && !contact.preferred_locations) patch.preferred_locations = q.locations.join(', ');
    if (Object.keys(patch).length) {
      const sets = Object.keys(patch).map((k) => `${k} = ?`).join(', ');
      run(`UPDATE contacts SET ${sets}, updated_at = ? WHERE id = ?`, ...Object.values(patch), now(), contact.id);
    }
    const nextStage = ai.lead_score >= 60 && ['new', 'contacted'].includes(contact.stage) ? 'qualified' : null;
    if (nextStage && nextStage !== contact.stage) {
      run('UPDATE contacts SET stage = ?, updated_at = ? WHERE id = ?', nextStage, now(), contact.id);
      logActivity('stage_change', 'contact', contact.id, `${contact.name} auto-moved to ${nextStage} (AI lead score ${ai.lead_score})`);
    }
  }
  logActivity('ai_reply', 'conversation', conversationId,
    `Autopilot replied via ${ai.provider} (intent: ${ai.intent}, score ${ai.lead_score})`);
  return { sent: true, ai };
}
