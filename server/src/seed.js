// ── Seed data ──────────────────────────────────────────────────────────────
// Populates a realistic demo dataset on first boot so every surface of the
// product is alive immediately. `npm run seed` (force) resets it.
import { db, all, get, run, now, logActivity, setSetting } from './db.js';

const P = [
  { source: 'maricopa_sample', source_id: 'MRC-104-28-003', address: '1428 W Palm Lane', city: 'Phoenix', state: 'AZ', zip: '85007', county: 'Maricopa', apn: '10428003', property_type: 'single_family', beds: 3, baths: 2, sqft: 1640, lot_sqft: 7200, year_built: 1954, price: 425000, assessed_value: 289400, last_sale_price: 310000, last_sale_date: '2019-06-14', owner_name: 'Daniel & Marisol Reyes', owner_mailing_address: '1428 W Palm Lane, Phoenix, AZ 85007', latitude: 33.4701, longitude: -112.0934 },
  { source: 'maricopa_sample', source_id: 'MRC-117-11-045', address: '8022 E Monte Cristo Ave', city: 'Scottsdale', state: 'AZ', zip: '85260', county: 'Maricopa', apn: '11711045', property_type: 'single_family', beds: 4, baths: 3, sqft: 2610, lot_sqft: 9800, year_built: 1996, price: 899000, assessed_value: 574200, last_sale_price: 615000, last_sale_date: '2021-03-02', owner_name: 'Hoffman Living Trust', owner_mailing_address: '8022 E Monte Cristo Ave, Scottsdale, AZ 85260', latitude: 33.6124, longitude: -111.9018 },
  { source: 'maricopa_sample', source_id: 'MRC-302-64-012', address: '515 N 3rd Street Unit 1204', city: 'Phoenix', state: 'AZ', zip: '85004', county: 'Maricopa', apn: '30264012', property_type: 'condo', beds: 2, baths: 2, sqft: 1120, lot_sqft: 0, year_built: 2008, price: 398000, assessed_value: 265800, last_sale_price: 355000, last_sale_date: '2022-08-19', owner_name: 'Pinnacle Urban Holdings LLC', owner_mailing_address: 'PO Box 5521, Tempe, AZ 85280', latitude: 33.4523, longitude: -112.0741 },
  { source: 'maricopa_sample', source_id: 'MRC-208-71-006', address: '3340 E Campbell Ave', city: 'Phoenix', state: 'AZ', zip: '85018', county: 'Maricopa', apn: '20871006', property_type: 'single_family', beds: 3, baths: 2, sqft: 1485, lot_sqft: 8100, year_built: 1957, price: 610000, assessed_value: 401300, last_sale_price: 240000, last_sale_date: '2014-11-08', owner_name: 'Grace Nakamura', owner_mailing_address: '3340 E Campbell Ave, Phoenix, AZ 85018', latitude: 33.4993, longitude: -112.0054 },
  { source: 'maricopa_sample', source_id: 'MRC-505-92-118', address: '11807 W Deer Valley Rd', city: 'Peoria', state: 'AZ', zip: '85383', county: 'Maricopa', apn: '50592118', property_type: 'single_family', beds: 5, baths: 3.5, sqft: 3320, lot_sqft: 12600, year_built: 2015, price: 745000, assessed_value: 498900, last_sale_price: 486500, last_sale_date: '2018-05-30', owner_name: 'Trevor & Jenna Cole', owner_mailing_address: '11807 W Deer Valley Rd, Peoria, AZ 85383', latitude: 33.6902, longitude: -112.3207 },
  { source: 'maricopa_sample', source_id: 'MRC-401-33-027', address: '941 S Ranch House Rd', city: 'Gilbert', state: 'AZ', zip: '85296', county: 'Maricopa', apn: '40133027', property_type: 'single_family', beds: 4, baths: 2.5, sqft: 2480, lot_sqft: 6900, year_built: 2003, price: 565000, assessed_value: 372600, last_sale_price: 412000, last_sale_date: '2020-01-22', owner_name: 'Adaeze Okafor', owner_mailing_address: '941 S Ranch House Rd, Gilbert, AZ 85296', latitude: 33.2971, longitude: -111.7289 },
  { source: 'maricopa_sample', source_id: 'MRC-216-08-091', address: '7102 N 12th Place', city: 'Phoenix', state: 'AZ', zip: '85020', county: 'Maricopa', apn: '21608091', property_type: 'single_family', beds: 3, baths: 2, sqft: 1730, lot_sqft: 10200, year_built: 1962, price: 585000, assessed_value: 384000, last_sale_price: 268000, last_sale_date: '2016-09-12', owner_name: 'Estate of Raymond Kessler', owner_mailing_address: '418 Camino De La Veta, San Clemente, CA 92672', latitude: 33.5471, longitude: -112.0547 },
  { source: 'maricopa_sample', source_id: 'MRC-603-45-033', address: '2245 W Baseline Rd', city: 'Tempe', state: 'AZ', zip: '85283', county: 'Maricopa', apn: '60345033', property_type: 'multi_family', beds: 8, baths: 4, sqft: 3900, lot_sqft: 11500, year_built: 1978, price: 985000, assessed_value: 612400, last_sale_price: 720000, last_sale_date: '2019-12-05', owner_name: 'Baseline Eight LLC', owner_mailing_address: '2245 W Baseline Rd, Tempe, AZ 85283', latitude: 33.3779, longitude: -111.9559 },
  { source: 'maricopa_sample', source_id: 'MRC-311-52-004', address: '18617 N 68th Drive', city: 'Glendale', state: 'AZ', zip: '85308', county: 'Maricopa', apn: '31152004', property_type: 'single_family', beds: 4, baths: 3, sqft: 2890, lot_sqft: 8700, year_built: 2001, price: 672000, assessed_value: 441900, last_sale_price: 530000, last_sale_date: '2021-07-16', owner_name: 'Peter & Lena Vasquez', owner_mailing_address: '18617 N 68th Dr, Glendale, AZ 85308', latitude: 33.6648, longitude: -112.2061 },
  { source: 'maricopa_sample', source_id: 'MRC-109-77-016', address: '1309 E Taylor Street', city: 'Phoenix', state: 'AZ', zip: '85006', county: 'Maricopa', apn: '10977016', property_type: 'single_family', beds: 2, baths: 1, sqft: 980, lot_sqft: 6400, year_built: 1948, price: 345000, assessed_value: 231700, last_sale_price: 188000, last_sale_date: '2017-04-27', owner_name: 'Rosa Delgado', owner_mailing_address: '1309 E Taylor St, Phoenix, AZ 85006', latitude: 33.4644, longitude: -112.0521 },
];

const C = [
  { name: 'Jordan Whitfield', email: 'jordan.whitfield@gmail.com', phone: '+1 602 555 0132', type: 'buyer', stage: 'qualified', tags: ['relocating', 'pre-approved'], budget_min: 380000, budget_max: 475000, preferred_locations: 'Phoenix, Tempe', source: 'website' },
  { name: 'Priya Raman', email: 'p.raman@outlook.com', phone: '+1 480 555 0177', type: 'seller', stage: 'contacted', tags: ['probate', 'as-is'], budget_min: null, budget_max: null, preferred_locations: 'Scottsdale', source: 'referral' },
  { name: 'Marcus Bell', email: 'marcus.bell@icloud.com', phone: '+1 602 555 0194', type: 'investor', stage: 'negotiating', tags: ['multi-family', '1031'], budget_min: 700000, budget_max: 1000000, preferred_locations: 'Tempe, Mesa', source: 'open_house' },
  { name: 'Elena Souza', email: 'elena.souza@gmail.com', phone: '+1 623 555 0119', type: 'buyer', stage: 'new', tags: ['first-time'], budget_min: 300000, budget_max: 360000, preferred_locations: 'Glendale', source: 'facebook_ads' },
  { name: 'Dana Kirkpatrick', email: 'dana.k@zohomail.com', phone: '+1 602 555 0107', type: 'seller', stage: 'qualified', tags: ['out-of-state', 'absentee'], budget_min: null, budget_max: 620000, preferred_locations: 'Phoenix - Arcadia', source: 'direct_mail' },
  { name: 'Tom Nguyen', email: 'tnguyen.re@gmail.com', phone: '+1 480 555 0161', type: 'agent', stage: 'closed', tags: ['partner-agent'], budget_min: null, budget_max: null, preferred_locations: null, source: 'network' },
  { name: 'Aisha Karim', email: 'aisha.karim@gmail.com', phone: '+1 602 555 0143', type: 'renter', stage: 'contacted', tags: [], budget_min: 1400, budget_max: 1900, preferred_locations: 'Phoenix - Downtown', source: 'website' },
  { name: 'Victor Halvorsen', email: 'v.halvorsen@proton.me', phone: '+1 602 555 0186', type: 'buyer', stage: 'new', tags: ['cash-buyer'], budget_min: 500000, budget_max: 700000, preferred_locations: 'Arcadia, Biltmore', source: 'zillow' },
];

export function isSeeded() {
  return get('SELECT COUNT(*) AS n FROM properties').n > 0;
}

export function seed(force = false) {
  if (!force && isSeeded()) return false;
  if (force) {
    for (const t of ['messages', 'conversations', 'contacts', 'properties', 'ingest_runs', 'activities', 'settings'])
      run(`DELETE FROM ${t}`);
  }

  const propIds = {};
  for (const p of P) {
    const info = run(
      `INSERT INTO properties (source_id, source, address, city, state, zip, county, apn, property_type, beds, baths, sqft, lot_sqft, year_built, price, assessed_value, last_sale_price, last_sale_date, owner_name, owner_mailing_address, status, latitude, longitude, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now','-20 days'),datetime('now','-1 day'))`,
      p.source_id, p.source, p.address, p.city, p.state, p.zip, p.county, p.apn, p.property_type,
      p.beds, p.baths, p.sqft, p.lot_sqft, p.year_built, p.price, p.assessed_value,
      p.last_sale_price, p.last_sale_date, p.owner_name, p.owner_mailing_address,
      'new', p.latitude, p.longitude
    );
    propIds[p.source_id] = info.lastInsertRowid;
  }
  run("UPDATE properties SET status = 'active' WHERE source_id IN ('MRC-104-28-003','MRC-505-92-118')");
  run("UPDATE properties SET status = 'under_contract' WHERE source_id = 'MRC-401-33-027'");

  const contactIds = {};
  for (const c of C) {
    const info = run(
      `INSERT INTO contacts (name, email, phone, type, stage, tags, budget_min, budget_max, preferred_locations, source, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now', ?),datetime('now'))`,
      c.name, c.email, c.phone, c.type, c.stage, JSON.stringify(c.tags),
      c.budget_min, c.budget_max, c.preferred_locations, c.source, `-${Math.floor(Math.random() * 12) + 1} days`
    );
    contactIds[c.name] = info.lastInsertRowid;
  }

  const msg = (convId, dir, body, intent, sent, sentiment, ai) =>
    run(
      "INSERT INTO messages (conversation_id, direction, body, intent, sentiment, ai_generated, created_at) VALUES (?,?,?,?,?,?,datetime('now', ?))",
      convId, dir, body, intent, sentiment, ai, sent
    );
  const conv = (contactId, channel, autopilot, lastAt, status = 'open', unread = 0) =>
    run(
      "INSERT INTO conversations (contact_id, channel, subject, status, autopilot, unread, last_message_at, created_at) VALUES (?,?,?,?,?,?,datetime('now', ?),datetime('now','-6 days'))",
      contactId, channel, null, status, autopilot ? 1 : 0, unread, lastAt
    ).lastInsertRowid;

  // Conversation 1 — buyer, qualified by autopilot
  let c1 = conv(contactIds['Jordan Whitfield'], 'sms', true, '-2 hours');
  msg(c1, 'in', 'Hi! We just relocated to Phoenix for work and are looking to buy a 3 bed house in the $400k to $475k range, ideally in Phoenix or Tempe. We are pre-approved.', 'buying', '-1 day', 'positive', 0);
  msg(c1, 'out', "Hi Jordan, thanks for reaching out! I'd love to help you find the right home in Phoenix and Tempe around $475,000. I'll filter for 3+ bedrooms. Could you share a good time this week for a quick call? I'll line up matching listings beforehand. — Ava Morgan, Summit Realty Group", 'buying', '-1 day', 'positive', 1);
  msg(c1, 'in', 'That would be great. Any chance we can see a few places this weekend? Also do you know what schools are near Tempe?', 'scheduling', '-2 hours', 'positive', 0);
  msg(c1, 'out', "Hi Jordan, absolutely — let's get that on the calendar. Do afternoons or evenings work better for you this weekend? I'll confirm the exact slot shortly and send over Tempe listings near top-rated schools. — Ava Morgan, Summit Realty Group", 'scheduling', '-2 hours', 'positive', 1);
  run('UPDATE conversations SET subject = ? WHERE id = ?', 'Weekend showings + Tempe schools', c1);

  // Conversation 2 — seller (probate, out-of-state owner from records)
  let c2 = conv(contactIds['Dana Kirkpatrick'], 'email', true, '-5 hours');
  msg(c2, 'in', 'I inherited a property near Arcadia at 7102 N 12th Place and I live in California. What is my home worth and what would selling look like? It probably needs work.', 'valuation', '-5 hours', 'neutral', 0);
  msg(c2, 'out', "Hi Dana, happy to put together a free, no-obligation market analysis for 7102 N 12th Place. Could you confirm any recent upgrades or repairs needed? I'll have the valuation over to you within 24 hours. — Ava Morgan, Summit Realty Group", 'valuation', '-5 hours', 'neutral', 1);
  msg(c2, 'in', 'Thanks. It needs a new roof and the kitchen is original from the 60s. I would prefer to sell as-is and close in 30 days if possible.', 'selling', '-5 hours', 'neutral', 0);
  msg(c2, 'out', "Hi Dana, thanks for those details — a 60s-original kitchen and roof replacement are exactly what I factor into an as-is pricing strategy. A 30-day close is very doable. I'll send the market analysis today with an as-is range and an investor-track option side by side. — Ava Morgan, Summit Realty Group", 'selling', '-5 hours', 'neutral', 1);
  run('UPDATE conversations SET subject = ? WHERE id = ?', 'As-is sale — 7102 N 12th Pl', c2);
  run("UPDATE properties SET notes = ? WHERE id = ?", 'Inbound owner interest (Dana Kirkpatrick). Probate, as-is, roof + original kitchen. Target 30-day close.', propIds['MRC-216-08-091']);

  // Conversation 3 — investor, escalated to human
  let c3 = conv(contactIds['Marcus Bell'], 'sms', true, '-1 days', 'pending_human');
  msg(c3, 'in', 'Following up on the Baseline eightplex. My 1031 timeline is next 45 days and I can go to $1M cash. I want to speak with a human about structuring the deal this week.', 'investing', '-1 days', 'neutral', 0);
  run('UPDATE conversations SET subject = ? WHERE id = ?', 'Baseline eightplex — 1031 timeline', c3);

  // Conversation 4 — renter, closed
  let c4 = conv(contactIds['Aisha Karim'], 'webchat', true, '-3 days', 'closed');
  msg(c4, 'in', 'Do you have any apartments for rent downtown around $1500-$1800?', 'renting', '-3 days', 'positive', 0);
  msg(c4, 'out', "Hi Aisha, thanks for reaching out about renting. Could you share your target move-in date, budget, and preferred areas? I'll send matching options right away. — Ava Morgan, Summit Realty Group", 'renting', '-3 days', 'positive', 1);
  msg(c4, 'in', 'Moving in next month. Just sent what you asked, thanks!', 'renting', '-3 days', 'positive', 0);

  setSetting('settings', {
    business: { name: 'Summit Realty Group', agent: 'Ava Morgan', phone: '(602) 555-0148', specialties: 'residential buy/sell in metro Phoenix' },
    autopilotDefault: true,
    aiProvider: 'auto',
  });

  logActivity('seed', null, null, 'Demo dataset loaded (10 properties, 8 contacts, 4 conversations)');
  return true;
}

// CLI: node src/seed.js --force
if (import.meta.url === `file://${process.argv[1]}`) {
  const forced = process.argv.includes('--force');
  const did = seed(forced);
  console.log(did ? 'Database seeded.' : 'Database already has data (use --force to reset).');
}
