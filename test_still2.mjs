function haversineC(lat1,lon1,lat2,lon2){var R=6371000.0,p1=lat1*Math.PI/180,p2=lat2*Math.PI/180,dp=(lat2-lat1)*Math.PI/180,dl=(lon2-lon1)*Math.PI/180,a=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return 2*R*Math.asin(Math.sqrt(a));}
var _prevClient={},_stillClient={};
function tickOnce(d, now){
  d.forEach(function(v){
    var key=v.__op__+':'+v.Id;
    var p=_prevClient[key];
    if(v.Lat!=null&&v.Lon!=null){
      var lat=v.Lat,lon=v.Lon;
      _prevClient[key]={lat:lat,lon:lon,t:now};
      var sp=_stillClient[key]||0;
      var dxy2=p?haversineC(p.lat,p.lon,lat,lon):999;
      if(p && dxy2>5.0){ sp=0; } else { sp=sp+1; }
      _stillClient[key]=sp;
      if(v.Type==='transit' && sp>=3) v.__still=true;
    }
  });
  return d;
}
// simulate 4 polls of a stuck bus (real coords from test)
var bus={Type:'transit',__op__:'JavniPromet',Id:'LPP:bc573b0f',Lat:46.057674,Lon:14.509504};
var now=1000;
for(var i=1;i<=4;i++){
  var d=[JSON.parse(JSON.stringify(bus))];
  tickOnce(d, now);
  console.log('poll',i,'still=',d[0].__still===true,'counter=',_stillClient['JavniPromet:LPP:bc573b0f']);
  now+=20;
}
// also test a moving bus resets
var moving={Type:'transit',__op__:'JavniPromet',Id:'MOV',Lat:46.05,Lon:14.50};
for(var j=0;j<3;j++){
  moving.Lat+=0.001; // moves ~111m
  var dm=[JSON.parse(JSON.stringify(moving))];
  tickOnce(dm, now);
  console.log('moving poll',j+1,'still=',dm[0].__still===true,'counter=',_stillClient['JavniPromet:MOV']);
  now+=20;
}
