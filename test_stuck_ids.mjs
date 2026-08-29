import('./netlify/functions/data.js').then(async (m) => {
  // pick a known-stopped Ljubljana bus by tracking same Id across polls
  const seen = {};
  for (let i = 0; i < 4; i++) {
    const r = await m.handler({}, {});
    const v = JSON.parse(r.body);
    const tr = v.filter(x => x.Type === 'transit' && x.Lat != null);
    // count how many ids repeat from previous poll
    const ids = new Set(tr.map(x => x.__op__ + ':' + x.Id));
    let repeated = 0;
    for (const id of ids) if (seen[id]) repeated++;
    console.log(`poll ${i+1}: transit=${tr.length} uniqueIds=${ids.size} repeatedFromPrev=${repeated}`);
    // store
    for (const id of ids) seen[id] = (seen[id] || 0) + 1;
    await new Promise(res => setTimeout(res, 2000));
  }
  // which ids appeared in all 4 polls (truly stuck candidates)
  const stuck = Object.entries(seen).filter(([k,c]) => c >= 4).slice(0,5);
  console.log('IDs present all 4 polls (stuck candidates):', stuck.length);
  stuck.forEach(([k,c]) => console.log('  ', k, 'count', c));
}).catch(e => { console.error('ERR', e); process.exit(1); });
