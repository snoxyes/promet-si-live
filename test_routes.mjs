import('./netlify/functions/data.js').then(async (m) => {
  const r = await m.handler({}, {});
  const v = JSON.parse(r.body);
  const tr = v.filter(x => x.Type === 'transit');
  console.log('transit total:', tr.length);
  // replicate routes grouping
  const lines = {};
  let lineCount = 0;
  tr.forEach(function(x) {
    const t = x.__transit__ || {};
    const route = t.route || 'B', hs = t.headsign || '-', op = t.operator || 'Javni Promet';
    const lk = op + '|' + route + '|' + hs;
    if (!lines[lk]) { lines[lk] = {operator:op, route:route, headsign:hs, buses:0}; lineCount++; }
    lines[lk].buses++;
  });
  console.log('unique lines:', lineCount);
  const arr = Object.values(lines).slice(0, 5);
  arr.forEach(L => console.log('  ', L.route, L.operator, '|', L.headsign, '|', L.buses, 'bus'));
}).catch(e => { console.error('ERR', e); process.exit(1); });
