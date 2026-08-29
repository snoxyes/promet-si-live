import('./netlify/functions/data.js').then(async (m) => {
  for (let i = 0; i < 5; i++) {
    const r = await m.handler({}, {});
    const v = JSON.parse(r.body);
    const tr = v.filter(x => x.Type === 'transit');
    const withSpeed = tr.filter(x => x.__speed__ != null && x.__speed__ > 1);
    const sample = withSpeed.slice(0, 4).map(x => `${x.__transit__?.route}:${x.__speed__.toFixed(0)}`);
    console.log(`call ${i+1}: transit=${tr.length} moving(>1km/h)=${withSpeed.length} sample=[${sample.join(', ')}]`);
    await new Promise(res => setTimeout(res, 2500));
  }
}).catch(e => { console.error('ERR', e); process.exit(1); });
