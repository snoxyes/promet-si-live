// Simulate client-side still-pulls logic from build.js tick()
function haversineC(lat1,lon1,lat2,lon2){var R=6371000.0,p1=lat1*Math.PI/180,p2=lat2*Math.PI/180,dp=(lat2-lat1)*Math.PI/180,dl=(lon2-lon1)*Math.PI/180,a=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return 2*R*Math.asin(Math.sqrt(a));}
var _prevClient={},_posHist={},_stillClient={};
function tickOnce(d, now){
  d.forEach(function(v){
    var key=v.__op__+':'+v.Id;
    var p=_prevClient[key];
    if(v.Lat!=null&&v.Lon!=null){
      var lat=v.Lat,lon=v.Lon;
      if(p){var dt2=now-p.t,dxy2=haversineC(p.lat,p.lon,lat,lon);
        var sp=_stillClient[key];
        if(p&&dxy2>2.0){if(sp)_stillClient[key]=0;}else{_stillClient[key]=(sp||0)+1;}
        if(v.Type==='transit'&&(_stillClient[key]||0)>=3)v.__still=true;
      }
      _prevClient[key]={lat:lat,lon:lon,t:now};
    }
  });
  return d;
}
// one stuck bus (same pos every poll), interval 20s
var bus={Type:'transit',__op__:'JavniPromet',Id:'LPP:test',Lat:46.05,Lon:14.50,__transit__:{route:'1'}};
var now=1000;
for(var i=1;i<=4;i++){
  var d=[JSON.parse(JSON.stringify(bus))];
  tickOnce(d, now);
  console.log('poll',i,'__still=',d[0].__still===true);
  now+=20; // 20s later
}
