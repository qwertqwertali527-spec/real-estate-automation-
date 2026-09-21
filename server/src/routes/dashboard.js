import { Router } from 'express';
import { all, get } from '../db.js';

const router = Router();

router.get('/stats', (req, res) => {
  const days = Number(req.query.days) || 14;
  const stats = {
    properties: {
      total: get('SELECT COUNT(*) AS n FROM properties').n,
      byStatus: Object.fromEntries(all('SELECT status, COUNT(*) AS n FROM properties GROUP BY status').map((r) => [r.status, r.n])),
      portfolioValue: get("SELECT COALESCE(SUM(price),0) AS n FROM properties WHERE status NOT IN ('sold','archived')").n,
      sources: Object.fromEntries(all('SELECT source, COUNT(*) AS n FROM properties GROUP BY source').map((r) => [r.source, r.n])),
    },
    contacts: {
      total: get('SELECT COUNT(*) AS n FROM contacts').n,
      byStage: Object.fromEntries(all('SELECT stage, COUNT(*) AS n FROM contacts GROUP BY stage').map((r) => [r.stage, r.n])),
      byType: Object.fromEntries(all('SELECT type, COUNT(*) AS n FROM contacts GROUP BY type').map((r) => [r.type, r.n])),
      leadsThisWeek: get("SELECT COUNT(*) AS n FROM contacts WHERE created_at >= datetime('now','-7 days')").n,
      pipelineValue: get("SELECT COALESCE(SUM(budget_max),0) AS n FROM contacts WHERE stage IN ('new','contacted','qualified','negotiating')").n,
    },
    conversations: {
      open: get("SELECT COUNT(*) AS n FROM conversations WHERE status = 'open'").n,
      pendingHuman: get("SELECT COUNT(*) AS n FROM conversations WHERE status = 'pending_human'").n,
      unread: get('SELECT COALESCE(SUM(unread),0) AS n FROM conversations').n,
      autopilotOn: get('SELECT COUNT(*) AS n FROM conversations WHERE autopilot = 1').n,
      total: get('SELECT COUNT(*) AS n FROM conversations').n,
    },
    messages: {
      total: get('SELECT COUNT(*) AS n FROM messages').n,
      inbound: get("SELECT COUNT(*) AS n FROM messages WHERE direction = 'in'").n,
      aiReplies: get('SELECT COUNT(*) AS n FROM messages WHERE ai_generated = 1').n,
      today: get("SELECT COUNT(*) AS n FROM messages WHERE created_at >= datetime('now','start of day')").n,
    },
    intents: Object.fromEntries(all("SELECT intent, COUNT(*) AS n FROM messages WHERE intent IS NOT NULL GROUP BY intent ORDER BY n DESC").map((r) => [r.intent, r.n])),
    ingest: {
      runs: get('SELECT COUNT(*) AS n FROM ingest_runs').n,
      lastRun: get('SELECT connector, status, records_imported, finished_at FROM ingest_runs ORDER BY id DESC LIMIT 1') || null,
      recordsFromFeeds: get("SELECT COUNT(*) AS n FROM properties WHERE source != 'manual'").n,
    },
  };

  // messages per day (in/out), last N days
  stats.messagesPerDay = all(
    `SELECT date(created_at) AS d,
       SUM(CASE WHEN direction = 'in' THEN 1 ELSE 0 END) AS inbound,
       SUM(CASE WHEN direction = 'out' THEN 1 ELSE 0 END) AS outbound
     FROM messages
     WHERE created_at >= datetime('now', ?)
     GROUP BY date(created_at) ORDER BY d`,
    `-${days} days`
  );

  // contact leads per day (last N days)
  stats.leadsPerDay = all(
    `SELECT date(created_at) AS d, COUNT(*) AS n FROM contacts
     WHERE created_at >= datetime('now', ?) GROUP BY date(created_at) ORDER BY d`,
    `-${days} days`
  );

  stats.recentActivity = all('SELECT * FROM activities ORDER BY id DESC LIMIT 12');
  res.json(stats);
});

export default router;
