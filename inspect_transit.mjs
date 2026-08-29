import('./netlify/functions/data.js').then(async (m) => {
  const r = await m.handler({}, {});
  const v = JSON.parse(r.body);
  const tr = v.filter(x => x.Type === 'transit');
  console.log('transit count:', tr.length);
  // show raw __transit__ of first 3 to see available fields
  for (const t of tr.slice(0, 3)) {
    console.log('---');
    console.log(JSON.stringify(t.__transit__, null, 1));
    console.log('Id:', t.Id, 'Title:', t.Title);
  }
}).catch(e => { console.error('ERR', e); process.exit(1); });
