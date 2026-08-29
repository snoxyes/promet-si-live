// Build step for Netlify: generate static HTML that reads live data from
// the serverless function (/api/data -> /.netlify/functions/data).
// Frontend is identical to server.js; only the fetch URL changes.
const fs = require('fs');
const path = require('path');

const CENTER_LAT = 46.0569, CENTER_LON = 14.5058;
const INTERVAL = parseInt(process.env.LAGUNA_INTERVAL || '20', 10);
const GEN_VER = '2026-08-netlify-v1';
const CARTO_KEY = 'cb1_2c52_1_d15dcf504f7d2994d4f4f6f9';
const OP_COLOR = { Laguna: '#58a6ff', Maribor: '#f0883e' };
const STATUS_LABEL = { 0: 'Prost (free)', 1: 'Išče taxi', 2: 'V vožnji (driving)',
  3: 'Stranke v avtu', 4: 'Vožnja končana', 5: 'Brez stranke', 7: 'Neobravnavano', 8: 'Izbrisano' };
const STATUS_FILL = { 0: 'green', 1: 'orange', 2: 'red', 3: 'purple',
  5: 'blue', 7: 'gray', 8: 'black' };
// On Netlify the live data comes from the serverless function, not a static file.
const DATA_URL = '/api/data';

const HTML = `<!DOCTYPE html>
<html lang="sl">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0"/>
<title>Promet SI · LIVE</title>
<meta name="genver" content="${GEN_VER}"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  :root{--bg:#eef1f5;--panel:rgba(255,255,255,.86);--panel-solid:#ffffff;--line:rgba(0,0,0,.10);--txt:#1a2230;--mut:#5a6675;--acc:#1f7ae0;--acc2:#e8730c;--ok:#0f9d58;--bad:#e23b3b;--warn:#e0a106;--vip:#8b32d6;--glass:blur(14px) saturate(140%);--r:14px;}
  *{box-sizing:border-box}
  html,body{margin:0;height:100%;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Arial,sans-serif;background:var(--bg);color:var(--txt);-webkit-font-smoothing:antialiased}
  #app{display:flex;height:100%}
  #sidebar{width:440px;min-width:440px;background:var(--panel);backdrop-filter:var(--glass);-webkit-backdrop-filter:var(--glass);border-right:1px solid var(--line);display:flex;flex-direction:column;overflow:hidden;position:relative;z-index:600}
  #topbar{padding:16px 16px 12px;border-bottom:1px solid var(--line);flex-shrink:0;background:linear-gradient(160deg,rgba(31,122,224,.14),rgba(232,115,12,.05) 60%,transparent)}
  #topbar h1{font-size:17px;font-weight:800;margin:0 0 2px;letter-spacing:.2px;display:flex;align-items:center;gap:8px}
  #topbar h1 .live{font-size:10px;font-weight:700;letter-spacing:1px;color:#fff;background:var(--ok);padding:2px 7px;border-radius:20px;box-shadow:0 0 12px rgba(15,157,88,.5);animation:pulse 2s infinite}
  #topbar h1 small{color:var(--mut);font-weight:600;font-size:11px;margin-left:auto}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.55}}
  .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:12px}
  .stat{background:rgba(255,255,255,.6);border:1px solid var(--line);border-radius:10px;padding:7px 4px;text-align:center}
  .stat b{display:block;font-size:16px;font-weight:800;color:var(--acc);line-height:1}
  .stat:nth-child(4) b{color:var(--ok)} .stat:nth-child(5) b{color:var(--acc2);font-size:12px}
  .stat span{color:var(--mut);font-size:8.5px;text-transform:uppercase;letter-spacing:.4px;margin-top:3px;display:block}
  .search-wrap{position:relative;margin-top:12px}
  #search{width:100%;padding:9px 12px 9px 34px;background:rgba(255,255,255,.8);border:1px solid var(--line);border-radius:10px;color:var(--txt);font-size:13px;outline:none;transition:border .2s}
  #search:focus{border-color:var(--acc)}
  .search-wrap svg{position:absolute;left:11px;top:50%;transform:translateY(-50%);opacity:.45}
  .filter-row{display:flex;flex-wrap:nowrap;gap:4px;margin-top:10px}
  .fbtn{flex:1 1 0;display:flex;align-items:center;justify-content:center;gap:5px;padding:8px 5px;border:1px solid var(--line);border-radius:9px;background:rgba(255,255,255,.6);color:var(--mut);font-size:12px;font-weight:700;cursor:pointer;transition:all .15s;user-select:none;white-space:nowrap;min-width:0}
  .fbtn .emo{font-size:15px;line-height:1}
  .fbtn i{font-style:normal;background:rgba(0,0,0,.08);border-radius:6px;padding:0 4px;font-size:10px;color:var(--txt)}
  .fdot{width:9px;height:9px;border-radius:50%;flex:0 0 auto;display:inline-block}
  .fdot-taxi{background:#1f7ae0} .fdot-transit{background:#3b82f6} .fdot-micro{background:#e84393}
  .fbtn.active{background:rgba(31,122,224,.14);border-color:var(--acc);color:var(--acc)}
  .fbtn.active[data-layer="transit"]{background:rgba(59,130,246,.14);border-color:#3b82f6;color:#3b82f6}
  .fbtn.active[data-layer="micro"]{background:rgba(232,67,147,.14);border-color:#e84393;color:#e84393}
  .fbtn:not(.active){opacity:.55}
  #list{flex:1;min-height:220px;overflow-y:auto;padding:6px}
  #list::-webkit-scrollbar{width:6px}#list::-webkit-scrollbar-thumb{background:rgba(0,0,0,.15);border-radius:3px}
  .veh{display:flex;align-items:center;gap:10px;padding:9px 10px;margin:3px 0;border-radius:10px;cursor:pointer;background:rgba(255,255,255,.5);border:1px solid transparent;transition:all .15s}
  .veh:hover{background:rgba(31,122,224,.10);border-color:rgba(31,122,224,.25)}
  .veh.sel{background:rgba(31,122,224,.16);border-color:var(--acc);box-shadow:0 0 0 1px var(--acc) inset}
  .pin{width:30px;height:30px;border-radius:50%;flex:0 0 auto;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;color:#fff;border:2px solid rgba(0,0,0,.35);box-shadow:0 2px 6px rgba(0,0,0,.3)}
  .micro-ico{width:18px;height:18px;border-radius:50%;flex:0 0 auto;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;color:#fff;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)}
  .micro-scooter{background:#e84393} .micro-bicycle{background:#06b6d4} .micro-car{background:#f97316} .micro-station{background:#636e72;border-style:dashed}
  .pin span{transform:rotate(0deg)}
  .transit-ico{position:relative;flex:0 0 auto;display:flex;align-items:flex-end;justify-content:center;width:18px;height:18px}
  .transit-pin{width:18px;height:18px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:9px;color:#fff;box-shadow:0 1px 4px rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.4)}
  .transit-pin span{transform:rotate(0deg)}
  .transit-spd{position:absolute;bottom:-6px;right:-4px;background:#0f9d58;color:#fff;font-size:8px;font-weight:700;padding:0 4px;border-radius:8px;border:1px solid #fff;box-shadow:0 1px 2px rgba(0,0,0,.3)}
  .vinfo{flex:1;min-width:0}
  .vrow1{display:flex;align-items:center;gap:6px}
  .vname{font-weight:700;font-size:13px}
  .vop{font-size:9px;color:var(--mut);margin-left:auto;background:rgba(0,0,0,.06);padding:1px 6px;border-radius:6px}
  .vrow2{display:flex;gap:8px;margin-top:2px;font-size:11px;color:var(--mut)}
  .vspd{color:var(--ok);font-weight:700} .vna{color:#8a93a0;font-style:italic} .vzero{color:#9aa3ad;font-weight:600}
  .veh.nogps{opacity:.55}
  .nogps-pin{background:#cbd2da !important;border:2px solid #aab2bd !important;color:#5b6472 !important}
  #map{flex:1;position:relative;background:#e8ebf0}
  .leaflet-container{background:#e8ebf0}
  .legend{display:flex;align-items:center;gap:5px;color:var(--mut)}
  .legend i{width:9px;height:9px;border-radius:50%;display:inline-block}
  .op-tag{display:flex;align-items:center;gap:5px;color:var(--mut)}
  .op-tag i{width:10px;height:10px;border-radius:50%;display:inline-block;border:2px solid rgba(0,0,0,.35)}
  #upd{margin-left:auto;color:var(--mut);display:flex;align-items:center;gap:6px}
  #upd .dot{width:7px;height:7px;border-radius:50%;background:var(--ok);box-shadow:0 0 8px var(--ok)}
  .follow-badge{display:flex;align-items:center;gap:7px;background:rgba(31,122,224,.14);border:1px solid var(--acc);color:var(--acc);padding:4px 10px;border-radius:20px;font-size:12px;font-weight:700}
  .follow-badge .fb-ico{animation:pulse 1.5s infinite}
  .follow-badge .fb-stop{background:var(--acc);color:#fff;border:none;border-radius:14px;padding:3px 10px;font-size:11px;font-weight:700;cursor:pointer;margin-left:2px}
  .follow-badge .fb-stop:hover{background:#155fb0}
  .taxi-ico{display:flex;flex-direction:column;align-items:center}
  .taxi-pin{width:18px;height:18px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:9px;color:#fff;border:2px solid rgba(0,0,0,.35);box-shadow:0 2px 8px rgba(0,0,0,.35)}
  .taxi-pin span{transform:rotate(45deg)}
  .taxi-spd{margin-top:2px;background:rgba(0,0,0,.78);color:#fff;font-size:9px;font-weight:800;padding:1px 4px;border-radius:4px;white-space:nowrap}
  #list .micro-ico{width:32px;height:32px;border-radius:50%;flex:0 0 auto;display:flex;align-items:center;justify-content:center;font-size:17px}
  #list .transit-ico{width:36px;height:36px;border-radius:8px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;color:#fff;box-shadow:0 1px 4px rgba(0,0,0,.3)}
  #list .transit-pin{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;color:#fff;border:2px solid rgba(0,0,0,.4);box-shadow:0 2px 8px rgba(0,0,0,.35);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  #list .transit-pin span{font-size:11px;line-height:1}
  .transit-spd{margin-top:2px;background:rgba(0,0,0,.78);color:#fff;font-size:9px;font-weight:800;padding:1px 4px;border-radius:4px;white-space:nowrap}
  .transit-tag{background:#eef2f7 !important;color:#334 !important;border:1px solid #cbd5e1 !important}
  .leaflet-popup-content-wrapper{background:var(--panel-solid);color:var(--txt);border-radius:12px;border:1px solid var(--line);box-shadow:0 8px 30px rgba(0,0,0,.2)}
  .leaflet-popup-tip{background:var(--panel-solid)}
  .pp b{font-size:14px} .pp div{font-size:12px;margin-top:3px;color:var(--mut)} .pp .hl{color:var(--txt)}
  @media(max-width:680px){#app{flex-direction:column}#sidebar{width:100%;min-width:100%;height:52%;position:relative;order:1;border-right:none;border-bottom:1px solid var(--line)}#map{height:48%;order:2}.stats{grid-template-columns:repeat(4,1fr)}}
</style>
</head>
<body>
<div id="app">
  <div id="sidebar">
    <div id="topbar">
      <h1>🚦 Promet SI <span class="live">LIVE</span><small>vozila v realnem času</small></h1>
      <div class="stats" id="stats"></div>
      <div class="search-wrap">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
        <input id="search" placeholder="Išči taxi / operator…" oninput="filter()"/>
      </div>
      <div class="filter-row" id="filters">
        <button class="fbtn active" data-layer="taxi" onclick="toggleLayer('taxi')"><span class="emo">🚕</span> Taxi <i id="cnt-taxi">0</i></button>
        <button class="fbtn active" data-layer="transit" onclick="toggleLayer('transit')"><span class="emo">🚌</span> Javni <i id="cnt-transit">0</i></button>
        <button class="fbtn active" data-layer="micro" onclick="toggleLayer('micro')"><span class="emo">🛴</span> MO-Izposoja <i id="cnt-micro">0</i></button>
      </div>
    </div>
    <div id="list"></div>
  </div>
  <div id="map"></div>
</div>
<script>
var map=L.map('map',{zoomControl:true,attributionControl:false}).setView([${CENTER_LAT},${CENTER_LON}],9);
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png?key=${CARTO_KEY}',
  {maxZoom:20,subdomains:'abcd'}).addTo(map);
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png?key=${CARTO_KEY}',
  {maxZoom:20,subdomains:'abcd',pane:'shadowPane',opacity:.9}).addTo(map);
var markers={}, _sel=null, followId=null;
var pendingMarkers=[];
var LAYERS=(function(){try{return JSON.parse(localStorage.getItem('laguna_layers')||'null')||{taxi:true,transit:true,micro:true};}catch(e){return {taxi:true,transit:true,micro:true};}})();
function layerFor(v){if(v.Type==='transit')return 'transit';if(v.Type==='micro')return 'micro';return 'taxi';}
function isLayerOn(v){return LAYERS[layerFor(v)]!==false;}
function toggleLayer(name){LAYERS[name]=!LAYERS[name];localStorage.setItem('laguna_layers',JSON.stringify(LAYERS));
  document.querySelectorAll('#filters .fbtn').forEach(function(b){b.classList.toggle('active',LAYERS[b.dataset.layer]);});render(_data);}
document.querySelectorAll('#filters .fbtn').forEach(function(b){b.classList.toggle('active',LAYERS[b.dataset.layer]);});
var OP_COLOR=${JSON.stringify(OP_COLOR)}, STATUS_FILL=${JSON.stringify(STATUS_FILL)}, STATUS_LABEL=${JSON.stringify(STATUS_LABEL)};
var FILLHEX={green:'#34d399',red:'#f87171',orange:'#fbbf24',purple:'#c084fc',blue:'#5eb3ff',gray:'#64748b',black:'#111'};
function rot(h){return (h===undefined||h<0)?0:h;}
function fmtSpeed(s){return s==null?'<span class="vna">– km/h</span>':'<span class="vspd">'+s.toFixed(0)+' km/h</span>';}
function pin(v){
  if(v.Type==='transit'){var tc=(v.__transit__&&v.__transit__.color)||'#3b82f6';var lab=v.__transit__?(v.__transit__.route||'B'):'B';
    return '<div class="transit-ico"><div class="transit-pin" style="background:'+tc+';border-color:'+tc+'"><span>'+lab+'</span></div>'
      +(v.__speed__!=null&&v.__speed__>1?'<div class="transit-spd">'+v.__speed__.toFixed(0)+'</div>':'')+'</div>';}
  if(v.Type==='micro'){var m=v.__micro__||{},f=(m.form||'BICYCLE').toLowerCase(),k=(m.kind||'STATION').toLowerCase();
    var cls='micro-ico '+(k==='station'?'micro-station':'micro-'+f);var icon=f==='scooter'?'🛴':(f==='car'?'🚗':'🚲');
    var bgc=f==='scooter'?'#e84393':(f==='car'?'#0984e3':'#00b894');
    return '<div class="'+cls+'" style="background:'+bgc+'">'+icon+'</div>';}
  var fill=FILLHEX[STATUS_FILL[v.Status]||'gray']||'#64748b',ring=OP_COLOR[v.__op__]||'#fff';
  var lab=v.Title||v.Imsi||('#'+v.Id);
  return '<div class="taxi-ico"><div class="taxi-pin" style="background:'+fill+';border-color:'+ring+'"><span>'+lab+'</span></div>'
    +(v.__speed__!=null&&v.__speed__>1?'<div class="taxi-spd">'+v.__speed__.toFixed(0)+'</div>':'')+'</div>';
}
function fmtSpeedFor(v){if(v.Position!==true)return '<span class="vna">ni GPS</span>';if(v.__speed__==null)return '<span class="vzero">0 km/h</span>';if(v.__speed__<1)return '<span class="vzero">0 km/h</span>';return '<span class="vspd">'+v.__speed__.toFixed(0)+' km/h</span>';}
function oc(v){return 'onclick="focusVeh(\\''+v.__op__+'\\',\\''+v.Id+'\\')"';}
function transitTag(v){return '<span class="vop transit-tag">'+((v.__transit__&&v.__transit__.operator)||'Javni promet')+'</span>';}
function row(v){
  if(v.Type==='transit'){var t=v.__transit__||{},nm=(t.route||'B')+' · '+(t.operator||'Javni Promet');var src=(t.headsign)?('→ '+t.headsign):'';
    return '<div class="veh" id="side_'+v.__op__+'_'+v.Id+'" '+oc(v)+'>'
      +'<div class="pin transit-pin" style="background:'+(t.color||'#3b82f6')+';border-color:'+(t.color||'#3b82f6')+'"><span>'+(t.route||'B')+'</span></div>'
      +'<div class="vinfo"><div class="vrow1"><span class="vname">'+nm+'</span>'+transitTag(v)+'</div>'
      +'<div class="vrow2" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><span>'+src+'</span><span>'+fmtSpeedFor(v)+'</span></div></div></div>';}
  if(v.Type==='micro'){var m=v.__micro__||{},f=(m.form||'BICYCLE').toLowerCase();var icon=f==='scooter'?'🛴':(f==='car'?'🚗':'🚲');
    var bgc=f==='scooter'?'#e84393':(f==='car'?'#0984e3':'#00b894');var lab=(m.kind==='STATION'?'Postaja · ':'')+(m.network||'Micromobility');
    return '<div class="veh" id="side_'+v.__op__+'_'+v.Id+'" '+oc(v)+'>'
      +'<div class="micro-ico" style="background:'+bgc+'">'+icon+'</div>'
      +'<div class="vinfo"><div class="vrow1"><span class="vname">'+(m.name||lab)+'</span><span class="vop">'+lab+'</span></div>'
      +'<div class="vrow2"><span>'+(m.vehicles!=null?m.vehicles+' vozil':(f==='scooter'?'skuter':(f==='car'?'avto':'kolo')))+'</span><span class="vna">parkiran</span></div></div></div>';}
  var nm=v.Title||v.Imsi||('#'+v.Id),fill=FILLHEX[STATUS_FILL[v.Status]||'gray'],ring=OP_COLOR[v.__op__]||'#fff';
  return '<div class="veh" id="side_'+v.__op__+'_'+v.Id+'" '+oc(v)+'>'
    +'<div class="pin" style="background:'+fill+';border-color:'+ring+'"><span>'+nm+'</span></div>'
    +'<div class="vinfo"><div class="vrow1"><span class="vname">'+nm+'</span><span class="vop">'+v.__op__+'</span></div>'
    +'<div class="vrow2"><span>'+(STATUS_LABEL[v.Status]||('St:'+v.Status))+'</span><span>'+fmtSpeedFor(v)+'</span></div></div></div>';
}
function rowNoGps(v){
  if(v.Type==='transit'){var t=v.__transit__||{},nm=(t.route||'B')+' · '+(t.operator||'Javni Promet');
    return '<div class="veh nogps" id="side_'+v.__op__+'_'+v.Id+'" '+oc(v)+'>'
      +'<div class="pin nogps-pin"><span>'+(t.route||'B')+'</span></div>'
      +'<div class="vinfo"><div class="vrow1"><span class="vname">'+nm+'</span>'+transitTag(v)+'</div><div class="vrow2"><span>ni GPS</span></div></div></div>';}
  if(v.Type==='micro'){var m=v.__micro__||{},f=(m.form||'BICYCLE').toLowerCase();var bgc=f==='scooter'?'#e84393':(f==='car'?'#0984e3':'#00b894');var icon=f==='scooter'?'🛴':(f==='car'?'🚗':'🚲');
    return '<div class="veh nogps" id="side_'+v.__op__+'_'+v.Id+'" '+oc(v)+'>'
      +'<div class="micro-ico" style="background:'+bgc+'">'+icon+'</div>'
      +'<div class="vinfo"><div class="vrow1"><span class="vname">'+(m.name||(m.network||'Micro'))+'</span><span class="vop">'+m.network+'</span></div><div class="vrow2"><span>ni GPS</span></div></div></div>';}
  var nm=v.Title||v.Imsi||('#'+v.Id);
  return '<div class="veh nogps" id="side_'+v.__op__+'_'+v.Id+'" '+oc(v)+'>'
    +'<div class="pin nogps-pin"><span>'+nm+'</span></div>'
    +'<div class="vinfo"><div class="vrow1"><span class="vname">'+nm+'</span><span class="vop">'+v.__op__+'</span></div><div class="vrow2"><span>'+(STATUS_LABEL[v.Status]||('St:'+v.Status))+'</span><span class="vna">ni GPS</span></div></div></div>';
}
function flushMarkers(){var CH=25,i=0;function step(){var end=Math.min(i+CH,pendingMarkers.length);
  for(;i<end;i++){var p=pendingMarkers[i],mk=markers[p.key];
    if(mk){mk.setLatLng([p.lat,p.lon]);mk._popup.setContent(p.popup);mk.setIcon(p.icon);}
    else{mk=L.marker([p.lat,p.lon],{icon:p.icon}).addTo(map);mk.bindPopup(p.popup);
      mk.on('click',(function(op,id){return function(){focusVeh(op,id);};})(p.op,p.id));markers[p.key]=mk;}}
  if(i<pendingMarkers.length)setTimeout(step,0);}step();}
function render(data){_data=data;var list=document.getElementById('list'),stats=document.getElementById('stats');
  var seen={},gps=0,opc={},transit=0,micro=0;
  var sideData=data.slice().sort(function(a,b){return (b.__speed__||0)-(a.__speed__||0);});
  pendingMarkers.length=0;var sideHtml='';
  data.forEach(function(v){if(!isLayerOn(v))return;var hasPos=v.Position&&v.Lat!=null&&v.Lon!=null;var key=v.__op__+':'+v.Id;seen[key]=true;
    if(hasPos){gps++;var op=v.__op__;opc[op]=(opc[op]||0)+1;if(v.Type==='transit')transit++;if(v.Type==='micro')micro++;
      var fill=FILLHEX[STATUS_FILL[v.Status]||'gray']||'#64748b',ring=OP_COLOR[op]||'#fff';var lab=v.Title||v.Imsi||('#'+v.Id),st=STATUS_LABEL[v.Status]||('St:'+v.Status);
      var icon=L.divIcon({className:'',html:pin(v),iconSize:[30,46],iconAnchor:[15,26]});var popup;
      if(v.Type==='transit'){var t=v.__transit__||{};
        popup='<div class="pp"><b>'+(t.route||'B')+' · '+(t.operator||'Javni Promet')+'</b>'
        +'<div>Linija: <span class="hl">'+(t.route||'-')+'</span></div>'
        +'<div>Smer: <span class="hl">'+(t.headsign||'-')+'</span></div>'
        +'<div>Hitrost: <span class="hl">'+(v.__speed__==null?'0 km/h (stoji)':v.__speed__.toFixed(0)+' km/h')+'</span></div>'
        +'<div>Smer kompas: <span class="hl">'+rot(v.Heading)+'°</span></div>'
        +'<div>GPS: <span class="hl">'+v.Lat.toFixed(5)+', '+v.Lon.toFixed(5)+'</span></div>'
        +'<div style="color:#5b6472">ID '+v.Id+' · '+(t.trip_id||'-')+'</div></div>';}
      else if(v.Type==='micro'){var m=v.__micro__||{},f=(m.form||'BICYCLE').toLowerCase();
        var fLab=f==='scooter'?'Skuter':(f==='car'?'Avto (souporaba)':'Kolo');var kLab=m.kind==='STATION'?'Postaja / dock':'Prosto vozilo';
        popup='<div class="pp"><b>'+(m.network||'Micromobility')+'</b>'
        +'<div>Tip: <span class="hl">'+fLab+'</span></div>'
        +'<div>Vrsta: <span class="hl">'+kLab+'</span></div>'
        +(m.name?'<div>Ime: <span class="hl">'+m.name+'</span></div>':'')
        +(m.vehicles!=null?'<div>Vozila: <span class="hl">'+m.vehicles+'</span></div>':'')
        +(m.spaces!=null?'<div>Prosta mesta: <span class="hl">'+m.spaces+'</span></div>':'')
        +'<div>GPS: <span class="hl">'+v.Lat.toFixed(5)+', '+v.Lon.toFixed(5)+'</span></div>'
        +'<div style="color:#5b6472">ID '+v.Id+'</div></div>';}
      else{popup='<div class="pp"><b>'+op+' · Taxi '+lab+'</b>'
        +'<div>Status: <span class="hl">'+st+'</span></div>'
        +'<div>Hitrost: <span class="hl">'+(v.Position!==true?'ni GPS':(v.__speed__==null?'0 km/h (stoji)':v.__speed__.toFixed(0)+' km/h'))+'</span></div>'
        +'<div>Smer: <span class="hl">'+rot(v.Heading)+'°</span></div>'
        +'<div>GPS: <span class="hl">'+v.Lat.toFixed(5)+', '+v.Lon.toFixed(5)+'</span></div>'
        +'<div style="color:#5b6472">ID '+v.Id+' · Imsi '+(v.Imsi||'-')+'</div></div>';}
      pendingMarkers.push({key:key,lat:v.Lat,lon:v.Lon,icon:icon,popup:popup,op:v.__op__,id:v.Id});
    }else{sideHtml+=rowNoGps(v);}});
  Object.keys(markers).forEach(function(k){if(!seen[k]){map.removeLayer(markers[k]);delete markers[k];}});
  var sideHtml2='';sideData.forEach(function(v){if(isLayerOn(v))sideHtml2+=row(v);});
  list.innerHTML=sideHtml2+sideHtml;flushMarkers();
  var ops=Object.keys(opc).map(function(o){return '<span class="op-tag"><i style="background:'+(OP_COLOR[o]||'#fff')+'"></i>'+o+' '+opc[o]+'</span>';}).join(' ');
  var free=0;data.forEach(function(v){if(v.Type!=='transit'&&v.Status===0)free++;});
  var taxiCount=data.length-transit-micro;
  stats.innerHTML='<div class=stat><b>'+data.length+'</b><span>vozila</span></div>'
    +'<div class=stat><b>'+taxiCount+'</b><span>taxi</span></div>'
    +'<div class=stat><b>'+transit+'</b><span>javni</span></div>'
    +'<div class=stat><b>'+micro+'</b><span>MO-Izposoja</span></div>';
  var cT=document.getElementById('cnt-taxi'),cTr=document.getElementById('cnt-transit'),cM=document.getElementById('cnt-micro');
  if(cT)cT.textContent=taxiCount;if(cTr)cTr.textContent=transit;if(cM)cM.textContent=micro;
  filter();
  if(followId&&markers[followId]){map.panTo(markers[followId].getLatLng(),{animate:false});
    var fEl=document.getElementById('followBadge');if(fEl){var fv=markers[followId]._taxi;fEl.style.display='flex';
      fEl.querySelector('.fb-name').textContent=(fv?(fv.__op__+' · '+(fv.Title||fv.Imsi||('#'+fv.Id))):'');}}
  if(_deepFollow&&markers[_deepFollow]){var df=_deepFollow.split(':');focusVeh(df[0],parseInt(df[1]));_deepFollow=null;}}
function focusVeh(op,id){var k=op+':'+id,mk=markers[k];followId=k;
  if(mk){mk._taxi=markerData(k);map.flyTo(mk.getLatLng(),15,{duration:.8});setTimeout(function(){mk.openPopup();},400);}
  if(_sel)document.getElementById(_sel).classList.remove('sel');var sid='side_'+op+'_'+id;_sel=sid;
  var el=document.getElementById(sid);if(el)el.classList.add('sel');}
function stopFollow(){followId=null;var fEl=document.getElementById('followBadge');if(fEl)fEl.style.display='none';}
function markerData(k){return _data?(_data.find(function(v){return v.__op__+':'+v.Id===k;})):null;}
var _data=null;var _deepFollow=null;
(function(){var m=location.search.match(/[?&]follow=([^&]+)/);if(m)_deepFollow=m[1];})();
function filter(){var q=document.getElementById('search').value.toLowerCase().trim();
  var rows=document.querySelectorAll('#list .veh');
  rows.forEach(function(r){r.style.display=r.textContent.toLowerCase().indexOf(q)>=0?'':'none';});
  if(q&&/^[a-z]*\\s*\\d+$/.test(q)){var matches=rows.filter(function(r){return r.style.display!=='none';});
    if(matches.length===1){var sid=matches[0].id.replace(/^side_/,'');var parts=sid.split('_');focusVeh(parts[0],parseInt(parts[1]));}}}
var lastUpd=document.getElementById('updtxt');
map.on('click',function(e){if(followId)stopFollow();});
var _prevClient={}, _posHist={};
function tick(){
  fetch('${DATA_URL}?_='+Date.now()).then(function(r){return r.json();}).then(function(d){
    var now=Date.now()/1000;
    d.forEach(function(v){
      var key=v.__op__+':'+v.Id;
      var p=_prevClient[key];
      if(v.Lat!=null&&v.Lon!=null){
        var lat=v.Lat, lon=v.Lon;
        // teleport rejection: jump >300m in <15s -> keep last good pos
        if(p&&p.lat!=null){
          var dt=now-p.t, dxy=haversineC(p.lat,p.lon,lat,lon);
          if(dt>0.3&&dt<15&&dxy>300){lat=p.lat;lon=p.lon;}
        }
        // position smoothing: median of last 5 points removes left-right jitter
        var hist=_posHist[key]||[];hist=hist.concat([[lat,lon]]);if(hist.length>5)hist=hist.slice(-5);
        _posHist[key]=hist;
        if(hist.length>=3){
          var ml=hist.map(function(h){return h[0];}).sort(function(a,b){return a-b;})[Math.floor(hist.length/2)];
          var mo=hist.map(function(h){return h[1];}).sort(function(a,b){return a-b;})[Math.floor(hist.length/2)];
          lat=ml;lon=mo;
        }
        v.Lat=lat;v.Lon=lon;
        if(p){
          var dt2=now-p.t, dxy2=haversineC(p.lat,p.lon,lat,lon);
          if(dt2>0.3&&dxy2>2.0){
            var s=dxy2/dt2*3.6;
            if(s<=110&&!(p.spd!=null&&p.spd>5&&s>1.8*p.spd)){
              v.__speed__=p.spd_hist.length>=2?Math.max(0,(p.spd_hist.reduce(function(a,b){return a+b;},0)/p.spd_hist.length+s)/2):s;
              var sh=p.spd_hist.concat([s]);if(sh.length>6)sh=sh.slice(-6);p.spd_hist=sh;
            }else{v.__speed__=p.spd;}
          }else{v.__speed__=(p.spd||null);}
        }else{v.__speed__=null;}
        _prevClient[key]={lat:lat,lon:lon,t:now,spd:v.__speed__,spd_hist:(p?p.spd_hist:[])};
      }else{delete _prevClient[key];delete _posHist[key];}
    });
    render(d);if(lastUpd)lastUpd.textContent=new Date().toLocaleTimeString('sl-SI');
  }).catch(function(e){});
}
function haversineC(lat1,lon1,lat2,lon2){var R=6371000.0,p1=lat1*Math.PI/180,p2=lat2*Math.PI/180,dp=(lat2-lat1)*Math.PI/180,dl=(lon2-lon1)*Math.PI/180,a=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return 2*R*Math.asin(Math.sqrt(a));}
tick();setInterval(tick,${INTERVAL * 1000});
</script>
</body>
</html>`;

const outDir = path.join(__dirname, 'dist');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'index.html'), HTML);
fs.writeFileSync(path.join(outDir, 'laguna_dashboard.html'), HTML);
console.log('[build] wrote dist/index.html + dist/laguna_dashboard.html');
