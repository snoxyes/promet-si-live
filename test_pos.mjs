import('./netlify/functions/data.js').then(async (m) => {
  const target = 'JavniPromet:LPP:bc573b0f-fb2f-48ad-8610-b288f13f6e7a';
  const positions = [];
  for (let i = 0; i < 4; i++) {
    const r = await m.handler({}, {});
    const v = JSON.parse(r.body).find(x => x.__op__ + ':' + x.Id === target);
    if (v) positions.push([v.Lat, v.Lon]);
    console.log(`poll ${i+1}:`, v ? `${v.Lat.toFixed(6)}, ${v.Lon.toFixed(6)}` : 'MISSING');
    await new Promise(res => setTimeout(res, 1500));
  }
  // distance between first and last
  function hav(a,b){const R=6371000,p1=a[0]*Math.PI/180,p2=b[0]*Math.PI/180,dp=(b[0]-a[0])*Math.PI/180,dl=(b[1]-a[1])*Math.PI/180;const x=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return 2*R*Math.asin(Math.sqrt(x));}
  if (positions.length >= 2) console.log('move (m):', hav(positions[0], positions[positions.length-1]).toFixed(1));
}).catch(e => { console.error('ERR', e); process.exit(1); });
