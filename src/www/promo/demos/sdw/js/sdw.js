// REVIEW: licensing implications with the use of google maps API? may or may not publish this in the end...

/**
 * Document entry point (by callback).
 */
$(document).ready(function() { new SdwApp(); });

/**
 * SdwViewerPlain.
 */
function SdwViewerPlain()
{
  var lCanvas = $("#viewer_plain");
  lCanvas.css("display", "none");
  var l2dCtx = lCanvas.get(0).getContext("2d"); // May throw an exception if html5 canvas is not supported.
  var lColorComp = function(pVal) { var _lR = Math.floor(Math.max(0, Math.min(255, pVal))).toString(16); return 2 == _lR.length ? _lR : ("0" + _lR); }
  var lDraw =
    function(pLocations, pConsumption)
    {
      // Clear the background.
      l2dCtx.setTransform(1, 0, 0, 1, 0, 0);
      l2dCtx.fillStyle = "#e4e4e4";
      l2dCtx.fillRect(0, 0, l2dCtx.canvas.width, l2dCtx.canvas.height);
      // Render the locations.
      l2dCtx.lineStyle = "#000000";
      l2dCtx.lineWidth = 2;
      for (var _iL = 0; _iL < pLocations.length; _iL++)
      {
        var _lCons = parseFloat(pConsumption[_iL][SIMULCTX.mNs + "/consumption/aggregated"]);
        l2dCtx.fillStyle = "#" + lColorComp(Math.max(0, _lCons - 0.5) * 500) + lColorComp((0.5 - Math.min(0.5, _lCons)) * 500) + "00";
        l2dCtx.beginPath();
        l2dCtx.arc(
          (parseFloat(pLocations[_iL][SIMULCTX.mNs + "/latitude"]) - 37) * l2dCtx.canvas.width,
          (-parseFloat(pLocations[_iL][SIMULCTX.mNs + "/longitude"]) - 122) * l2dCtx.canvas.height,
          10, 0, 2 * Math.PI, false);
        l2dCtx.closePath();
        l2dCtx.fill();
      }
    }
  var lUpdateCanvasSize = function() { lCanvas.attr("width", lCanvas.width()); lCanvas.attr("height", lCanvas.height()); }
  this.getDiv = function() { return lCanvas; }
  this.refresh = function(pLocations, pConsumption) { lDraw(pLocations, pConsumption); }
  this.updateLocations = function(pLocations) {}
  this.setLatLngCenter = function(pLat, pLng) {}
  this.onKeyDown = function(e) {}
  lUpdateCanvasSize();
}

/**
 * SdwViewerGoogle.
 * Note: developers.google.com/maps/documentation/javascript
 */
function SdwViewerGoogle()
{
  var lCanvas = $("#viewer_google");
  lCanvas.css("display", "block");
  if (!('google' in window)) throw "google not reachable";

  var lMapOptions = {zoom:4, center:new google.maps.LatLng(37.09024, -122.712891), mapTypeId:google.maps.MapTypeId.TERRAIN};
  var lMap = new google.maps.Map(document.getElementById('viewer_google'), lMapOptions);

/*      for (var city in citymap) {
        // Construct the circle for each value in citymap. We scale population by 20.
        var populationOptions = {
          strokeColor: '#FF0000',
          strokeOpacity: 0.8,
          strokeWeight: 2,
          fillColor: '#FF0000',
          fillOpacity: 0.35,
          map: lMap,
          center: citymap[city].center,
          radius: citymap[city].population / 20
        };
        cityCircle = new google.maps.Circle(populationOptions);
*/

  var lUpdateCanvasSize = function() { lCanvas.attr("width", lCanvas.width()); lCanvas.attr("height", lCanvas.height()); }
  this.getDiv = function() { return lCanvas; }
  this.refresh = function(pLocations, pConsumption) {}
  this.updateLocations =
    function(pLocations)
    {
      for (var _iL = 0; _iL < pLocations.length; _iL++)
        new google.maps.Marker({map:lMap, position:new google.maps.LatLng(parseFloat(pLocations[_iL][SIMULCTX.mNs + "/world/latitude"]), parseFloat(pLocations[_iL][SIMULCTX.mNs + "/world/longitude"])), title:pLocations[_iL][SIMULCTX.mNs + "/world/address"]});
    }
  this.setLatLngCenter = function(pLat, pLng) { lMap.panTo(new google.maps.LatLng(pLat, pLng)); }
  lUpdateCanvasSize();
}

/**
 * SdwApp.
 */
function SdwApp()
{
  var lLocations = [];
  var lViews = [];
  try { lViews.push(new SdwViewerPlain()); } catch(e) { myLog("Caught: " + e); }
  try { lViews.push(new SdwViewerGoogle()); } catch(e) { myLog("Caught: " + e); }
  if (0 == lViews.length) { myLog("no viewing available"); return; }
  var lCurView = lViews[lViews.length - 1];
  lCurView.getDiv().css("display", "block");
  if (lViews.length < 2) { $("#use_google_maps").css("display", "none"); }
  var lStepFunction = null;
  var lPause = false;
  var lMoveMoveables =
    function(_pMoveables, _pCompletion)
    {
      SIMULCTX.queryMulti(lStepFunction.split(';'), new QResultHandler(function() { _pCompletion(_pMoveables); }, null, null));
    }
  var lComputeLatLngRange =
    function(_pCompletion)
    {
      var _lOnRange =
        function(_pJson)
        {
          var _lLat = 0.5 * (parseFloat(_pJson[0]['afy:calculated1']) + parseFloat(_pJson[0]['afy:calculated2']));
          var _lLng = 0.5 * (parseFloat(_pJson[0]['afy:calculated3']) + parseFloat(_pJson[0]['afy:calculated4']));
          lViews.forEach(function(__pV) { __pV.setLatLngCenter(_lLat, _lLng); });
          if (undefined != _pCompletion) _pCompletion();
        }
      // Note: this works, but additional math on output asserts/crashes (e.g. MAX+MIN).
      SIMULCTX.query("SELECT MAX(world:latitude), MIN(world:latitude), MAX(world:longitude), MIN(world:longitude) FROM world:locations", new QResultHandler(_lOnRange, null, null));
    }
  var lGrabLocations =
    function(_pCompletion)
    {
      var _lOnLocations = function(_pJson) { if (undefined != _pJson) { lLocations = _pJson; lViews.forEach(function(_v) { _v.updateLocations(lLocations); }); } _pCompletion(); }
      SIMULCTX.query("SELECT world:latitude, world:longitude, world:address FROM world:locations;", new QResultHandler(_lOnLocations, null, null));
    }
  var lRefresh =
    function(_pForced)
    {
      if (lPause && _pForced != true) return;
      var _lOnResults = function(_pJson) { if (undefined != _pJson) { lCurView.refresh(lLocations, _pJson); } }
      SIMULCTX.query("SELECT control:\"consumption/aggregated\" FROM world:locations;", new QResultHandler(_lOnResults, null, null));
    }
  var lGo = function() { setInterval(lRefresh, 1000); }
  var lGrabClassFunction = 
    function(_pClass, _pFunc, _pCompletion)
    {
      var _lGrab = function(_pJson) { _pCompletion(_pJson[0][SIMULCTX.mNs + "/" + _pFunc]); }
      SIMULCTX.query("SELECT world:" + _pFunc + " FROM afy:Classes WHERE CONTAINS(afy:objectID, '" + SIMULCTX.mNs + "/" + _pClass + "');", new QResultHandler(_lGrab, null, null));
    }
  var lGrabStepFunction = function(_pCompletion) { lGrabClassFunction('moveables', 'step', function(__pF) { lStepFunction = __pF; _pCompletion(); }); }
  window.addEventListener(
    'keydown',
    function(e)
    {
      if (e.which == 80) { lPause = !lPause; }
      else if (e.which >= 37 && e.which <= 40)
      {
        var _lD = ['L', 'T', 'R', 'B'];
        var _lQs = [];
        _lQs.push("UPDATE SET simul:\"player/direction/tentative\"='" + _lD[e.which - 37] + "' FROM simul:players;");
        SIMULCTX.queryMulti(_lQs, new QResultHandler(function() {}, null, null));
      }
    });
  $("#logo").click(function() { window.location.href = 'http://' + location.hostname + ":" + location.port + "/console.html#tab-basic"; });
  $("#use_google_maps_checkbox").click(
    function()
    {
      if (lViews.length < 2) return;
      var _lIsChecked = $(this).is(":checked");
      var _lNewCur = _lIsChecked ? lViews[1] : lViews[0];
      if (_lNewCur != lCurView)
      {
        lCurView.getDiv().css("display", "none");
        _lNewCur.getDiv().css("display", "block");
        lCurView = _lNewCur;
      }
    });
  SIMULCTX.install(function() { lComputeLatLngRange(function() { lGrabLocations(lGo); });/*lGrabStepFunction(lGo);*/ })
}

/*
// to remove an overlay: setMap(null)
map.getZoom()

        google.maps.event.addListener(map, 'center_changed', function() { // also zoom_changed etc. (https://developers.google.com/maps/documentation/javascript/reference#Map)
          // 3 seconds after the center of the map has changed, pan back to the
          // marker.
          window.setTimeout(function() {
            map.panTo(marker.getPosition());
          }, 3000);
        });
*/
