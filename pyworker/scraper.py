#!/usr/bin/env python3
"""
EstateFlow — public-records connector worker.

Called by the Node API (server/src/pybridge.js) as a subprocess:
    python3 scraper.py check
    python3 scraper.py run --connector sample   <<< '{"limit": 8}'
    python3 scraper.py run --connector csv      <<< '{"path": "/tmp/records.csv"}'
    python3 scraper.py run --connector http     <<< '{"url": "...", "format": "html", ...}'

Always prints a single JSON document to stdout:
    success: {"records": [...], "log": ["..."]}
    failure: exits non-zero after printing {"error": "...", "log": ["..."]}
"""
import argparse
import csv
import json
import random
import re
import sys
from datetime import datetime, timedelta

LOGS = []


def log(msg):
    LOGS.append(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")


def emit(payload, code=0):
    payload["log"] = LOGS
    print(json.dumps(payload))
    sys.exit(code)


def fail(error, code=1):
    log(f"ERROR: {error}")
    emit({"error": str(error)}, code=code)


# ── connector: sample (offline synthetic county feed) ───────────────────────
STREETS = [
    "W Palm Lane", "E Coronado Rd", "N 7th Street", "E Indian School Rd",
    "W Encanto Blvd", "N 40th Street", "E Thomas Rd", "W McDowell Rd",
    "N 16th Street", "E Campbell Ave", "W Bethany Home Rd", "E Camelback Rd",
    "S Rural Road", "W Warner Rd", "N Alma School Rd", "E Guadalupe Rd",
]
FIRST = ["James", "Maria", "Robert", "Linda", "David", "Sarah", "Miguel", "Jennifer", "Ahmed", "Emily", "Chen", "Olivia", "Carlos", "Nina", "Omar", "Grace"]
LAST = ["Nguyen", "Alvarez", "Washington", "Patel", "Kim", "Torres", "O'Brien", "Haddad", "Kowalski", "Silva", "Chang", "Foster", "Moreno", "Weber"]
CITIES = [("Phoenix", "85007,85008,85014,85016,85018,85020,85004"), ("Scottsdale", "85251,85254,85260"),
          ("Tempe", "85281,85283"), ("Mesa", "85201,85210"), ("Gilbert", "85233,85296"),
          ("Glendale", "85301,85308"), ("Chandler", "85224,85249"), ("Peoria", "85345,85383")]
TYPES = [("single_family", 0.55), ("condo", 0.2), ("townhouse", 0.15), ("multi_family", 0.1)]
PRICE_BASE = {"single_family": (340000, 950000), "condo": (240000, 520000), "townhouse": (300000, 590000), "multi_family": (620000, 1250000)}


def conn_sample(params):
    limit = int(params.get("limit") or 8)
    city_filter = (params.get("city") or "").strip().lower()
    state = (params.get("state") or "AZ").strip()
    rng = random.Random()  # time-seeded → each run discovers fresh records
    now = datetime.utcnow()
    records = []
    log(f"Querying synthetic Maricopa County records feed (limit={limit})...")
    for _ in range(limit):
        city, zips = rng.choice(CITIES)
        if city_filter and city_filter != city.lower():
            continue
        ptype = rng.choices([t for t, _ in TYPES], weights=[w for _, w in TYPES])[0]
        lo, hi = PRICE_BASE[ptype]
        price = int(rng.uniform(lo, hi) // 500 * 500)
        year = rng.randint(1948, 2022)
        sqft = int(rng.uniform(850, 3450) // 10 * 10)
        apn = f"MRC-{rng.randint(100, 999)}-{rng.randint(10, 99)}-{rng.randint(1, 200):03d}"
        sale_years_ago = rng.randint(2, 12)
        last_sale = (now - timedelta(days=sale_years_ago * 365 + rng.randint(0, 300))).date().isoformat()
        owner_first, owner_last = rng.choice(FIRST), rng.choice(LAST)
        trust = rng.random() < 0.22
        owner = f"{owner_last} Family Trust" if trust else f"{owner_first} {owner_last}"
        address = f"{rng.randint(102, 14800)} {rng.choice(STREETS)}"
        street_addr = f"{address}, {city}, {state} {rng.choice(zips.split(','))}"
        out_of_state = rng.random() < 0.18
        mailing = street_addr if not out_of_state else f"{rng.randint(10, 9900)} {rng.choice(STREETS)}, {rng.choice(['San Diego', 'Denver', 'Chicago', 'Seattle'])}, {rng.choice(['CA', 'CO', 'IL', 'WA'])} {rng.randint(10000, 99999)}"
        records.append({
            "source": "maricopa_sample",
            "source_id": apn,
            "apn": apn,
            "address": address,
            "city": city,
            "state": state,
            "zip": rng.choice(zips.split(",")),
            "county": "Maricopa",
            "property_type": ptype,
            "beds": max(1, min(6, round(sqft / 720))),
            "baths": max(1, min(5, round(sqft / 900) + rng.choice([0, 0.5]))),
            "sqft": sqft,
            "lot_sqft": rng.randint(0, 1) * rng.randint(2500, 13000),
            "year_built": year,
            "price": price,
            "assessed_value": int(price * rng.uniform(0.58, 0.72) // 100 * 100),
            "last_sale_price": int(price * rng.uniform(0.55, 0.85) // 500 * 500),
            "last_sale_date": last_sale,
            "owner_name": owner,
            "owner_mailing_address": mailing,
            "latitude": round(rng.uniform(33.2, 33.8), 4),
            "longitude": round(rng.uniform(-112.4, -111.7), 4),
        })
    log(f"Fetched {len(records)} records from county feed")
    return records


# ── connector: csv ──────────────────────────────────────────────────────────
FIELD_SYNONYMS = {
    "address": ["address", "property_address", "site_address", "street_address", "situs_address", "addr"],
    "city": ["city", "situs_city"], "state": ["state", "st"], "zip": ["zip", "zipcode", "zip_code", "postal_code"],
    "county": ["county"], "apn": ["apn", "parcel", "parcel_id", "parcel_number", "apn_number"],
    "property_type": ["property_type", "type", "prop_type", "use_code"],
    "beds": ["beds", "bedrooms", "bed"], "baths": ["baths", "bathrooms", "bath"],
    "sqft": ["sqft", "living_area", "building_sqft", "square_feet"], "lot_sqft": ["lot_sqft", "lot_size", "land_sqft"],
    "year_built": ["year_built", "yr_built", "year"],
    "price": ["price", "list_price", "asking_price", "market_value", "total_value"],
    "assessed_value": ["assessed_value", "assessed", "tax_value"],
    "last_sale_price": ["last_sale_price", "sale_price", "sold_price"],
    "last_sale_date": ["last_sale_date", "sale_date", "sold_date"],
    "owner_name": ["owner_name", "owner", "owner1", "owner_full_name"],
    "owner_mailing_address": ["owner_mailing_address", "mailing_address", "owner_address"],
    "source_id": ["source_id", "record_id", "id", "listing_id"],
}


def conn_csv(params):
    path = (params.get("path") or "").strip()
    if not path:
        fail("csv connector requires params.path")
    if not os.path.isfile(path):
        fail(f"File not found: {path}")
    log(f"Reading CSV export: {path}")
    records = []
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        norm = {name: re.sub(r"\s+", "_", name.strip().lower()) for name in (reader.fieldnames or [])}
        for raw in reader:
            rec = {"source": params.get("source") or "csv_import"}
            for target, synonyms in FIELD_SYNONYMS.items():
                for col, n in norm.items():
                    if n in synonyms and raw.get(col) not in (None, ""):
                        rec[target] = raw[col].strip()
                        break
            rec["source_id"] = rec.get("source_id") or rec.get("apn")
            if rec.get("address"):
                records.append(rec)
    log(f"Parsed {len(records)} usable records from CSV")
    return records


# ── connector: http (generic scraper) ───────────────────────────────────────
def conn_http(params):
    try:
        import requests
    except ImportError:
        fail("The 'requests' package is required for the http connector — run: pip3 install -r pyworker/requirements.txt")
    url = (params.get("url") or "").strip()
    if not url:
        fail("http connector requires params.url")
    fmt = (params.get("format") or "html").lower()
    item_selector = params.get("item_selector") or ".property-record"
    fields = params.get("fields") or "{}"
    limit = int(params.get("limit") or 20)
    try:
        fields = json.loads(fields) if isinstance(fields, str) else fields
    except json.JSONDecodeError:
        fail("params.fields is not valid JSON")

    log(f"GET {url}")
    try:
        resp = requests.get(url, timeout=20, headers={"User-Agent": "EstateFlowBot/1.0 (public records research)"})
        resp.raise_for_status()
    except Exception as e:
        fail(f"HTTP request failed: {e}")
    log(f"Received {resp.status_code}, {len(resp.content)} bytes ({resp.headers.get('content-type', '?')})")

    records = []
    if fmt == "json" or "json" in resp.headers.get("content-type", ""):
        try:
            data = resp.json()
        except ValueError:
            fail("Response was not valid JSON")
        items = data
        for key in item_selector.split(".") if item_selector else []:
            key = key.strip()
            if key and isinstance(items, dict) and key in items:
                items = items[key]
        if isinstance(items, dict):
            items = list(items.values())
        for item in items[:limit]:
            if not isinstance(item, dict):
                continue
            rec = {}
            for field, key in fields.items():
                v = item.get(key) if isinstance(key, str) else None
                if v is None and isinstance(key, str) and "." in key:
                    cur = item
                    for part in key.split("."):
                        cur = cur.get(part) if isinstance(cur, dict) else None
                    v = cur
                if v is not None:
                    rec[field] = v if not isinstance(v, (dict, list)) else json.dumps(v)
            rec["source"] = params.get("source") or re.sub(r"\W+", "_", url.split("//")[-1].split("/")[0])
            records.append(rec)
    else:
        try:
            from bs4 import BeautifulSoup
        except ImportError:
            fail("The 'beautifulsoup4' package is required for HTML scraping — run: pip3 install -r pyworker/requirements.txt")
        soup = BeautifulSoup(resp.text, "html.parser")
        nodes = soup.select(item_selector)
        log(f"Selector '{item_selector}' matched {len(nodes)} blocks")
        for node in nodes[:limit]:
            rec = {}
            for field, sel in fields.items():
                el = node.select_one(sel) if sel else None
                if el:
                    val = el.get("content") or el.get("data-value") or el.get_text(strip=True)
                    if val:
                        rec[field] = val
            rec["source"] = params.get("source") or re.sub(r"\W+", "_", url.split("//")[-1].split("/")[0])
            if rec.get("address"):
                records.append(rec)
    records = records[:limit]
    log(f"Extracted {len(records)} records")
    return records


CONNECTORS = {"sample": conn_sample, "csv": conn_csv, "http": conn_http}


def main():
    parser = argparse.ArgumentParser(description="EstateFlow public-records connector worker")
    parser.add_argument("command", choices=["run", "check"])
    parser.add_argument("--connector", default="sample")
    args = parser.parse_args()

    if args.command == "check":
        result = {"python": True, "requests": False, "bs4": False}
        try:
            import requests  # noqa: F401
            result["requests"] = True
        except ImportError:
            pass
        try:
            import bs4  # noqa: F401
            result["bs4"] = True
        except ImportError:
            pass
        emit(result)

    # read params from stdin (piped JSON)
    raw = sys.stdin.read() if not sys.stdin.isatty() else "{}"
    try:
        params = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        fail("stdin was not valid JSON")

    fn = CONNECTORS.get(args.connector)
    if not fn:
        fail(f"Unknown connector '{args.connector}'. Available: {', '.join(CONNECTORS)}")
    try:
        records = fn(params)
    except SystemExit:
        raise
    except Exception as e:
        fail(f"Connector crashed: {type(e).__name__}: {e}")
    emit({"records": records})


if __name__ == "__main__":
    main()
