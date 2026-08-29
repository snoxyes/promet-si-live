// Netlify Function: serves live vehicle data on each request.
// Same core logic as server.js (port for serverless). The _prev movement
// cache is module-level -> persists while the function instance stays warm
// (browser polls every 20s, so it usually does). Cold starts reset the
// still-pulls counter but it recovers within ~80s.
import https from 'https';
import http from 'http';
import { URL } from 'url';

const INTERVAL = parseInt(process.env.LAGUNA_INTERVAL || '20', 10);
const CENTER_LAT = 46.0569, CENTER_LON = 14.5058;
const OPERATORS = {
  Laguna: 'laguna.user.net-informatika.eu',
  Maribor: 'plusmaribor.user.net-informatika.eu',
};

const _prev = {};

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000.0;
  const p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180;
  const dp = (lat2 - lat1) * Math.PI / 180, dl = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const SLO_LAT_MIN = 45.4, SLO_LAT_MAX = 46.9, SLO_LON_MIN = 13.4, SLO_LON_MAX = 16.6;
function inSlovenia(lat, lon) {
  if (lat == null || lon == null) return false;
  return SLO_LAT_MIN <= lat && lat <= SLO_LAT_MAX && SLO_LON_MIN <= lon && lon <= SLO_LON_MAX;
}

function getJSON(url, headers) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = (u.protocol === 'https:' ? https : http).get(url,
      { headers: headers || {}, timeout: INTERVAL * 1000 + 10000 },
      (res) => {
        let body = '';
        res.on('data', (c) => body += c);
        res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { resolve(null); } });
      });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

async function fetchBrezavta() {
  const url = 'https://api.beta.brezavta.si/vehicles/locations';
  const data = await getJSON(url, { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' });
  if (!data) return [];
  const out = [];
  const now = Date.now() / 1000;
  const WIN = 5;
  const dedup = {};
  for (const x of data) {
    if (!x || typeof x !== 'object') continue;
    const veh = x.vehicle || {};
    const vid = veh.id || veh.gtfs_id;
    if (!vid) continue;
    const ts = x.timestamp || 0;
    if (!dedup[vid] || (dedup[vid].timestamp || 0) < ts) dedup[vid] = x;
  }
  const dataArr = Object.values(dedup);
  const presentIds = new Set(Object.keys(dedup));
  for (const st of Object.values(_prev)) {
    if (!presentIds.has(st._id)) st.still_pulls = 0;
  }
  for (const x of dataArr) {
    if (!x || typeof x !== 'object') continue;
    const lat = x.lat, lon = x.lon;
    if (lat == null || lon == null) continue;
    const v = x.vehicle || {};
    let apiSpd = x.speed;
    if (apiSpd != null) {
      apiSpd = parseFloat(apiSpd);
      if (isNaN(apiSpd) || apiSpd <= 0) apiSpd = null;
    }
    const k = 'brezavta:' + (v.id || v.gtfs_id);
    const st = _prev[k] || (_prev[k] = {});
    const lastGood = st.good;
    const jump = lastGood ? haversine(lastGood[0], lastGood[1], lat, lon) : 0;
    const teleport = lastGood != null && jump > 2000.0;
    const dlat = teleport ? lastGood[0] : lat, dlon = teleport ? lastGood[1] : lon;
    let hist = st.hist || [];
    const last = hist[hist.length - 1];
    const dtLast = last ? (now - last[2]) : 0;
    const maxPlausible = 30.5 * Math.max(dtLast, 1.0);
    const dxy = last ? haversine(last[0], last[1], lat, lon) : Infinity;
    const moved = last == null || (dxy > 1.0 && dxy <= maxPlausible);
    if (moved && !teleport) {
      hist = hist.concat([[lat, lon, now]]);
      if (hist.length > WIN) hist = hist.slice(-WIN);
    }
    let raw = null;
    if (!teleport && hist.length >= 2) {
      const a = hist[hist.length - 2], b = hist[hist.length - 1];
      const dt = b[2] - a[2], d = haversine(a[0], a[1], b[0], b[1]);
      if (dt > 0.3 && d > 2.0) {
        raw = (d / dt) * 3.6;
        if (raw > 110) raw = null;
        else if (st.spd != null && st.spd > 5 && raw > 1.8 * st.spd) raw = null;
      }
    }
    let sh = (st.spd_hist || []).slice();
    if (raw != null && raw >= 0) { sh.push(raw); if (sh.length > 6) sh = sh.slice(-6); }
    let spd;
    if (sh.length >= 2) {
      const s2 = sh.slice().sort((a, b) => a - b);
      spd = s2.length >= 4 ? s2.slice(1, -1).reduce((a, b) => a + b, 0) / (s2.length - 2)
                           : s2.reduce((a, b) => a + b, 0) / s2.length;
      if (spd > 110) spd = 110;
    } else spd = raw != null ? raw : (moved ? st.spd : apiSpd);
    st.hist = hist; st.spd = spd; st.spd_hist = sh;
    if (!teleport) st.good = [lat, lon];
    const STILL_M = 5.0;
    const prevPos = st.last_poll_pos;
    let actuallyMoved;
    if (prevPos == null) actuallyMoved = true;
    else {
      const dprev = haversine(prevPos[0], prevPos[1], lat, lon);
      actuallyMoved = dprev > STILL_M || teleport;
    }
    st.last_poll_pos = [lat, lon];
    st._id = v.id || v.gtfs_id;
    if (actuallyMoved) st.still_pulls = 0;
    else st.still_pulls = (st.still_pulls || 0) + 1;
    if (st.still_pulls >= 4) continue;
    if (spd != null && spd > 110) spd = 110;
    const rec = {
      Id: v.id || v.gtfs_id, Title: v.operator_name || v.operator_id,
      Lat: dlat, Lon: dlon, Heading: x.heading, Position: true, Status: null,
      Type: 'transit', __op__: 'JavniPromet', __speed__: spd,
      __transit__: { operator: v.operator_name || v.operator_id, route: x.route_short_name,
        headsign: x.trip_headsign, trip_id: x.trip_id, plate: v.plate, color: x.color, ts: x.timestamp },
    };
    if (!inSlovenia(lat, lon)) continue;
    out.push(rec);
  }
  return out;
}

async function fetchMicromobility() {
  const url = 'https://api.beta.brezavta.si/micromobility/';
  const data = await getJSON(url, { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' });
  if (!data) return [];
  const out = [];
  const now = Date.now() / 1000;
  for (const x of data) {
    if (!x || typeof x !== 'object') continue;
    const lat = x.lat, lon = x.lon;
    if (lat == null || lon == null) continue;
    const mtype = (x.type || 'STATION').toUpperCase();
    const form = (x.form || 'BICYCLE').toUpperCase();
    const net = x.network || '?';
    const vid = x.id || net;
    if (mtype !== 'FLOATING') continue;
    const mk = 'micro:' + vid;
    const prev = _prev[mk];
    let moved = true;
    if (prev) { const d = haversine(prev.lat, prev.lon, lat, lon); moved = d > 15.0; }
    _prev[mk] = { lat, lon, t: now };
    if (!moved) continue;
    const rec = {
      Id: vid, Title: net, Lat: lat, Lon: lon, Heading: null, Position: true,
      Status: null, Type: 'micro', __op__: 'Micromobility', __speed__: null,
      __micro__: { kind: mtype, form, network: net, name: x.name, vehicles: x.vehicles,
        spaces: x.spaces, active: x.active },
    };
    if (!inSlovenia(lat, lon)) continue;
    out.push(rec);
  }
  return out;
}

async function fetchOperator(name, host) {
  const ep = `https://${host}/NetCabAppServer.asmx/GetData`;
  const body = JSON.stringify({ Type: 'GetNearestAvailableUnitsWithTimeOfArrival',
    latitude: CENTER_LAT, longitude: CENTER_LON });
  const data = await new Promise((resolve) => {
    const req = https.request(ep, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json',
        'User-Agent': 'LagunaTaxi/4.2.421' },
      timeout: INTERVAL * 1000 + 10000,
    }, (res) => {
      let b = ''; res.on('data', (c) => b += c);
      res.on('end', () => { try { resolve(JSON.parse(b).d || []); } catch (e) { resolve([]); } });
    });
    req.on('error', () => resolve([]));
    req.on('timeout', () => { req.destroy(); resolve([]); });
    req.write(body); req.end();
  });
  const out = [], seen = new Set(), now = Date.now() / 1000;
  for (const x of data) {
    if (!x || typeof x !== 'object') continue;
    const key = x.Imsi || x.Id;
    if (seen.has(key)) continue;
    seen.add(key);
    const xx = Object.assign({}, x); xx.__op__ = name;
    const k = `${name}:${x.Id}`;
    const lat = x.Lat, lon = x.Lon;
    let spd = null;
    if (k in _prev && lat != null && lon != null && x.Position) {
      const st = _prev[k];
      const last = st.hist[st.hist.length - 1];
      let hist = st.hist;
      if (!last || haversine(last[0], last[1], lat, lon) > 1.0) {
        hist = st.hist.concat([[lat, lon, now]]);
        if (hist.length > 8) hist = hist.slice(-8);
      }
      let raw = null;
      if (hist.length >= 2) {
        const a = hist[hist.length - 2], b = hist[hist.length - 1];
        const dt = b[2] - a[2], d = haversine(a[0], a[1], b[0], b[1]);
        if (dt > 0.3 && d > 1.0) {
          raw = (d / dt) * 3.6;
          if (raw > 160) raw = st.spd != null ? st.spd : 160;
          else if (st.spd != null && st.spd > 5 && raw > 2.5 * st.spd) raw = st.spd;
        }
      }
      let sh = st.spd_hist.slice();
      if (raw != null && raw >= 0) { sh.push(raw); if (sh.length > 4) sh = sh.slice(-4); }
      if (sh.length >= 2) {
        const s2 = sh.slice().sort((a, b) => a - b);
        spd = s2.length >= 4 ? s2.slice(1, -1).reduce((a, b) => a + b, 0) / (s2.length - 2)
                             : s2.reduce((a, b) => a + b, 0) / s2.length;
        if (spd > 160) spd = 160;
      } else spd = raw == null ? st.spd : raw;
      _prev[k] = { hist, spd, spd_hist: sh };
    } else if (lat != null && lon != null) {
      _prev[k] = { hist: [[lat, lon, now]], spd: null, spd_hist: [] };
    }
    xx.__speed__ = spd;
    if (!inSlovenia(lat, lon)) continue;
    out.push(xx);
  }
  return out;
}

async function fetchAll() {
  let rows = [];
  for (const [name, host] of Object.entries(OPERATORS)) {
    try { rows = rows.concat(await fetchOperator(name, host)); } catch (e) {}
  }
  try { rows = rows.concat(await fetchBrezavta()); } catch (e) {}
  try { rows = rows.concat(await fetchMicromobility()); } catch (e) {}
  return rows;
}

export const handler = async (event, context) => {
  try {
    const v = await fetchAll();
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(v),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: String(e) }) };
  }
};
