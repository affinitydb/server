/*
Copyright (c) 2004-2014 GoPivotal, Inc. All Rights Reserved.

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,  WITHOUT
WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
License for the specific language governing permissions and limitations
under the License.
*/

// Query in the docsample store.
function afydoc_escapeQ(_pWhat)
{
  return escape(_pWhat.replace(/\+/g, "\+")).replace(/\+/g, "%2B").replace(/%A0/ig, "%20"); // escape _pWhat, and preserve '+' signs (e.g. for {+} in path expressions; by default '+' is automatically interpreted as a space).
}
function afydoc_query(_pWhat, _pOnSuccess, _pOnError)
{
  $.ajax({
    type: "GET",
    url: "/db/?q=" + _pWhat + "&i=pathsql&o=json",
    dataType: "text",
    async: true,
    cache: false,
    global: false,
    success: _pOnSuccess,
    error: _pOnError,
    beforeSend : function(req) { req.setRequestHeader('Authorization', "Basic ZG9jc2FtcGxlOg=="/*docsample:*/); }
  });
};

// Inter-snippet messages (on a same page; i.e. let snippet A activate snippet B, in a case where B depends on A).
function InterSnippetNotifications()
{
  var lThis = this;
  var lSinks = {};
  this.registerSink = function(pMessageName, pSink) { if (pMessageName in lSinks) { lSinks[pMessageName].push(pSink); } else lSinks[pMessageName] = [pSink]; };
  this.isRegistered = function(pMessageName, pSink) { var lFound = false; if (pMessageName in lSinks) { lSinks[pMessageName].forEach(function(_pS) { if (_pS == pSink) lFound = true; }); } return lFound; };
  this.notify = function(pMessageName) { if (pMessageName in lSinks) { lSinks[pMessageName].forEach(function(_pS) { _pS(); }); } };
};

// Rendering context for animated widgets.
// (reused from promo.js)
function PrezRenderCtx(pCanvas, pDrawFunc)
{
  var lThis = this;
  this.c2d = pCanvas.get(0).getContext("2d"); // The 2d-ctx; will throw an exception when not supported.
  this.c2d.setTransform(1, 0, 0, 1, 0, 0);
  this.time = 0; // The animation time, on a scale of [0,100].
  this.drawFunc = pDrawFunc; // The function that redraws the canvas.
  this.changeCursor = function(pType) { pCanvas.css("cursor", pType); }
  this.updateCanvasSize = function() { pCanvas.attr("width", pCanvas.width()); pCanvas.attr("height", pCanvas.height()); }
  this.clampPct = function(pPct) { return pPct < 0 ? 0 : (pPct > 1 ? 1 : pPct); }

  // For color transitions.
  var lChannels = [{mask:0xff0000, shift:16}, {mask:0x00ff00, shift:8}, {mask:0x0000ff, shift:0}];
  var lEvalChannel =
    function(pChannel, pParams)
    {
      var _lFrom = (pParams.from & pChannel.mask) >> pChannel.shift;
      var _lTo = (pParams.to & pChannel.mask) >> pChannel.shift;
      var _lV = (_lTo > _lFrom ? Math.floor(_lFrom + ((_lTo - _lFrom) * pParams.pct)) : Math.floor(_lTo + ((_lFrom - _lTo) * (1.0 - pParams.pct)))).toString(16);
      return _lV.length > 1 ? _lV : ("0" + _lV);
    }
  this.calcColor =
    function(pParams/*{from:hex, to:hex, pct:in [0.0, 1.0]}*/)
    {
      return "#" + lEvalChannel(lChannels[0], pParams) + lEvalChannel(lChannels[1], pParams) + lEvalChannel(lChannels[2], pParams);
    }
}

// Animated widget to integrate user-defined schemas in the doc flow.
// (reused from promo.js)
function PrezElm_StaticGraph(pCode, pWidth)
{
  var lThis = this;
  var lT0 = 0;
  var lX = 10, lY = 10;
  var lModel = eval(pCode);
  var lDashed = new Image(); lDashed.src = $("#dashed_src").text();
  var lDrawThickArrow =
    function(pCtx, pThck)
    {
      pCtx.c2d.moveTo(-pThck, -2 * pThck);
      pCtx.c2d.lineTo(pThck, -2 * pThck);
      pCtx.c2d.lineTo(pThck, pThck);
      pCtx.c2d.lineTo(2 * pThck, pThck);
      pCtx.c2d.lineTo(0, 2 * pThck);
      pCtx.c2d.lineTo(-2 * pThck, pThck);
      pCtx.c2d.lineTo(-pThck, pThck);
      pCtx.c2d.lineTo(-pThck, -2 * pThck);
    }
  var lDrawThickBidirArrow =
    function(pCtx, pXc, pYc, pThck)
    {
      pCtx.c2d.moveTo(pXc - pThck, pYc - pThck);
      pCtx.c2d.lineTo(pXc - 2 * pThck, pYc - pThck);
      pCtx.c2d.lineTo(pXc, pYc - 2 * pThck);
      pCtx.c2d.lineTo(pXc + 2 * pThck, pYc - pThck);
      pCtx.c2d.lineTo(pXc + pThck, pYc - pThck);
      pCtx.c2d.lineTo(pXc + pThck, pYc + pThck);
      pCtx.c2d.lineTo(pXc + 2 * pThck, pYc + pThck);
      pCtx.c2d.lineTo(pXc, pYc + 2 * pThck);
      pCtx.c2d.lineTo(pXc - 2 * pThck, pYc + pThck);
      pCtx.c2d.lineTo(pXc - pThck, pYc + pThck);
      pCtx.c2d.lineTo(pXc - pThck, pYc - pThck);
    }
  this.render =
    function(pCtx)
    {
      var _lFadePct = 0.9 * pCtx.clampPct(4.0 * (pCtx.time - lT0) / 100.0);
      var _lW = pWidth;
      var _lH = lThis.getHeight();
      var _lX = lX;
      var _lY = lY;

      pCtx.c2d.save();
      if (pCtx.time == lT0)
      {
        pCtx.c2d.globalAlpha = 1.0;
        pCtx.c2d.fillStyle = $("body").css("background-color");
        pCtx.c2d.fillRect(_lX, _lY, _lW, _lH);
      }
      pCtx.c2d.globalAlpha = _lFadePct;
      for (var _i = 0; _i < lModel.instructions.length; _i++)
      {
        var _lI = lModel.instructions[_i];
        if ('t' in _lI)
        {
          if (pCtx.time - lT0 < _lI.t * 100.0) continue;
          if ('duration' in _lI && pCtx.time - lT0 > (_lI.t + _lI.duration) * 100.0) continue;
          pCtx.c2d.globalAlpha = _lFadePct * pCtx.clampPct((pCtx.time - lT0) / 50.0 - _lI.t);
        }
        var _lOffx = 0; var _lOffy = 0;
        if ('fillStyle' in _lI)
          pCtx.c2d.fillStyle = _lI.fillStyle;
        if ('strokeStyle' in _lI)
          pCtx.c2d.strokeStyle = _lI.strokeStyle;
        pCtx.c2d.lineWidth = ('lineWidth' in _lI) ? _lI.lineWidth : 1;
        var _lAngle = ('angle' in _lI) ? _lI.angle : 90;
        switch (_lI.type)
        {
          case 'stroke':
            pCtx.c2d.beginPath();
            pCtx.c2d.moveTo(_lX + _lI.x0 * _lW, _lY + _lI.y0 * _lH);
            pCtx.c2d.lineTo(_lX + _lI.x1 * _lW, _lY + _lI.y1 * _lH);
            pCtx.c2d.stroke();
            break;
          case 'strokeCircle':
            pCtx.c2d.beginPath();
            pCtx.c2d.arc(_lX + _lI.x * _lW, _lY + _lI.y * _lH, _lI.radius * _lW, 0, 2 * Math.PI, true);
            pCtx.c2d.stroke();
            if ('fillStyle' in _lI)
            {
              var _lAlpha = pCtx.c2d.globalAlpha;
              pCtx.c2d.globalAlpha = 1.0;
              pCtx.c2d.fill();
              pCtx.c2d.globalAlpha = _lAlpha;
            }
            break;
          case 'strokeThickArrow':
            pCtx.c2d.save();
            pCtx.c2d.translate(_lX + _lI.x * _lW, _lY + _lI.y * _lH);
            pCtx.c2d.rotate(Math.PI * (_lAngle - 90) / 180);
            pCtx.c2d.beginPath();
            lDrawThickArrow(pCtx, _lI.thickness * Math.min(_lW, _lH));
            pCtx.c2d.stroke();
            pCtx.c2d.restore();
            break;
          case 'strokeThickVerticalArrowBidir':
            pCtx.c2d.beginPath();
            lDrawThickBidirArrow(pCtx, _lX + (_lI.x * _lW), _lY + (_lI.y * _lH), _lI.thickness * Math.min(_lW, _lH));
            pCtx.c2d.stroke();
            break;
          case 'strokeThickHorizontalArrowBidir':
            pCtx.c2d.save();
            pCtx.c2d.rotate(-0.5 * Math.PI);
            pCtx.c2d.beginPath();
            lDrawThickBidirArrow(pCtx, -_lY - (_lI.y * _lH), _lX + (_lI.x * _lW), _lI.thickness * Math.min(_lW, _lH));
            pCtx.c2d.stroke();
            pCtx.c2d.restore();
            break;
          case 'strokeDB':
          {
            var _lXc = _lX + _lI.x * _lW;
            var _lYc = _lY + _lI.y * _lH;
            var _lw = _lI.w * _lW;
            var _lh = _lI.h * _lH;
            pCtx.c2d.beginPath();
            pCtx.c2d.moveTo(_lXc + _lw , _lYc + 0.25 * _lh);
            pCtx.c2d.bezierCurveTo(_lXc + 0.9 * _lw, _lYc + 0.1 * _lh, _lXc + 0.1 * _lw, _lYc + 0.1 * _lh, _lXc, _lYc + 0.25 * _lh);
            pCtx.c2d.lineTo(_lXc, _lYc + 0.75 * _lh);
            pCtx.c2d.bezierCurveTo(_lXc + 0.1 * _lw, _lYc + 1.1 * _lh, _lXc + 0.9 * _lw, _lYc + 1.1 * _lh, _lXc + _lw, _lYc + 0.75 * _lh);
            pCtx.c2d.lineTo(_lXc + _lw, _lYc + 0.25 * _lh);
            pCtx.c2d.bezierCurveTo(_lXc + 0.9 * _lw, _lYc + 0.35 * _lh, _lXc + 0.1 * + _lw, _lYc + 0.35 * _lh, _lXc, _lYc + 0.25 * _lh);
            pCtx.c2d.stroke();
            break;
          }
          case 'fillRect':
            pCtx.c2d.fillRect(_lX + _lI.x * _lW, _lY + _lI.y * _lH, _lI.w * _lW, _lI.h * _lH);
            break;
          case 'fillText':
            pCtx.c2d.font = _lI.font;
            if ('dx' in _lI) _lOffx = pCtx.c2d.measureText(_lI.text).width * _lI.dx;
            if ('dy' in _lI) _lOffy = parseInt(_lI.font.match(/(.*\s)*([0-9]+)pt/)[2]) * _lI.dy;
            pCtx.c2d.fillText(_lI.text, _lX + _lI.x * _lW + _lOffx, _lY + _lI.y * _lH + _lOffy);
            break;
          case 'textBox':
            pCtx.c2d.save();
            pCtx.c2d.fillRect(_lX + _lI.x * _lW, _lY + _lI.y * _lH, _lI.w * _lW, _lI.h * _lH);
            if ('dashed' in _lI)
            {
              var _lPattern = pCtx.c2d.createPattern(lDashed, "repeat");
              pCtx.c2d.strokeStyle = _lPattern;
            }
            pCtx.c2d.beginPath();
            pCtx.c2d.rect(_lX + _lI.x * _lW, _lY + _lI.y * _lH, _lI.w * _lW, _lI.h * _lH);
            pCtx.c2d.stroke();
            pCtx.c2d.clip();
            pCtx.c2d.fillStyle = _lI.textStyle;
            pCtx.c2d.font = _lI.font;
            _lOffx = 0.5 * (_lI.w * _lW - pCtx.c2d.measureText(_lI.text).width);
            _lOffy = 1.2 * (_lI.h * _lH - parseInt(_lI.font.match(/(.*\s)*([0-9]+)pt/)[2]));
            pCtx.c2d.fillText(_lI.text, _lX + _lI.x * _lW + _lOffx, _lY + _lI.y * _lH + _lOffy);
            pCtx.c2d.restore();
            break;
        }
        pCtx.c2d.globalAlpha = _lFadePct;
      }
      pCtx.c2d.restore();
    }
  this.getHeight = function() { return pWidth / lModel.aspect; }
}

// Animated widget to integrate fcurves in the doc flow.
// (reused from promo.js)
function PrezElm_MathGraph(pCode, pWidth, pISN, pISNMessage)
{
  var lThis = this;
  var lT0 = 0;
  var lX = 0, lY = 0;
  var lModel = eval(pCode);
  var lReady = false, lOnReady = null;
  var lISNMessageStatus = 0; // 0: not registered, not received; 1: registered; 2: received

  // Data ranges calculations.
  var lXrange = {first:undefined, last:undefined, range:0, middle:undefined};
  var lYrange = {first:undefined, last:undefined, range:0, middle:undefined};
  var lCalculateRanges =
    function()
    {
      lXrange = {first:lModel.series[0].data[0][0], last:lModel.series[0].data[0][0], range:0, middle:lModel.series[0].data[0][0]};
      lYrange = {first:lModel.series[0].data[0][1], last:lModel.series[0].data[0][1], range:0, middle:lModel.series[0].data[0][1]};
      lModel.series.forEach(function(_pS) { _pS.data.forEach(function(_pC) { if (_pC[0] > lXrange.last) lXrange.last = _pC[0]; if (_pC[0] < lXrange.first) lXrange.first = _pC[0]; if (_pC[1] > lYrange.last) lYrange.last = _pC[1]; if (_pC[1] < lYrange.first) lYrange.first = _pC[1]; }); });
      lXrange.range = lXrange.last - lXrange.first; lXrange.middle = (lXrange.first + lXrange.range * 0.5);
      lYrange.range = lYrange.last - lYrange.first; lYrange.middle = (lYrange.first + lYrange.range * 0.5);
      var lTicks = ['first', 'middle', 'last'];
      for (var iT = 0; iT < lTicks.length; iT++)
      {
        lXrange[lTicks[iT] + "_str"] = lXrange[lTicks[iT]].toFixed(lModel.x.decimals);
        lYrange[lTicks[iT] + "_str"] = lYrange[lTicks[iT]].toFixed(lModel.y.decimals);
      }
    };

  // If any of the data series requires querying the store, do that first.
  var lCheckPendingQueries = function() { return lModel.series.filter(function(_pSeries) { return ('query' in _pSeries && !('data' in _pSeries)) ? _pSeries : null; }); };
  var lQueries = lCheckPendingQueries();
  if (lQueries.length > 0)
  {
    // Upon reception of query results, determine if we're ready to display the graph.
    var lOnSeries =
      function(_pData, _pSeries)
      {
        var _lJson = $.parseJSON(_pData.replace(/\s+/g, " ").replace(/NULL/g, "null"));
        _pSeries.data = _lJson.map(function(_pR) { return [_pR["afy:value"].x, _pR["afy:value"].y]; });
        if (0 == lCheckPendingQueries().length)
        {
          // At this point we should have obtained all our series.
          lCalculateRanges();
          lReady = true; if (undefined != lOnReady) lOnReady();
        }
      };
    // Upon notification from other snippets we depend on, retry querying.
    var lOnISNMessage =
      function()
      {
        if (1 != lISNMessageStatus)
          return;
        lISNMessageStatus++;
        lQueries.forEach(
          function(_pSeries)
          {
            if ('data' in _pSeries) return;
            afydoc_query(afydoc_escapeQ(_pSeries.query), function(_pData) { lOnSeries(_pData, _pSeries); }, function() { /* log failure? */ });
          });
      };
    // Query a first time each query-able series.
    // If we fail and pISNMessage exists, register for a notification (from the other snippet we're depending on).
    lQueries.forEach(
      function(_pSeries)
      { 
        afydoc_query(
          afydoc_escapeQ(_pSeries.query), function(_pData) { lOnSeries(_pData, _pSeries); },
          function() { if (0 == lISNMessageStatus && undefined != pISNMessage) { lISNMessageStatus++; pISN.registerSink(pISNMessage, lOnISNMessage); }});
      });
  }

  // Otherwise, we're already all set.
  else
  {
    lCalculateRanges();
    lReady = true; if (undefined != lOnReady) lOnReady();
  }

  this.render =
    function(pCtx)
    {
      if (!lReady)
        return;
      var _lFadePct = pCtx.clampPct(4.0 * (pCtx.time - lT0) / 100.0);
      var _lW = pWidth;
      var _lH = lThis.getHeight();
      var _lX = lX;
      var _lY = lY;
      pCtx.c2d.globalAlpha = _lFadePct * 0.7;
      pCtx.c2d.fillStyle = "#111111";
      pCtx.c2d.font = "9pt Helvetica";

      pCtx.c2d.save();
      if (pCtx.time == lT0)
      {
        pCtx.c2d.globalAlpha = 1.0;
        pCtx.c2d.fillStyle = $("body").css("background-color");
        pCtx.c2d.fillRect(_lX, _lY, _lW, _lH);
      }
      // Frame.
      pCtx.c2d.fillStyle = "#eeeeee";
      pCtx.c2d.strokeStyle = "#999999";
      pCtx.c2d.globalAlpha = 0.8 * _lFadePct;
      pCtx.c2d.fillRect(_lX, _lY, _lW, _lH);
      pCtx.c2d.strokeRect(_lX, _lY, _lW, _lH);
      pCtx.c2d.fillStyle = "#000000";
      // Titles.
      pCtx.c2d.font = "bold 9pt Helvetica";
      pCtx.c2d.fillText(lModel.title, _lX + (_lW - pCtx.c2d.measureText(lModel.title).width) * 0.5, _lY + 10);
      if ('subtitle' in lModel)
      {
        pCtx.c2d.fillStyle = "#111111";
        pCtx.c2d.font = "8pt Helvetica";
        pCtx.c2d.fillText(lModel.subtitle, _lX + (_lW - pCtx.c2d.measureText(lModel.subtitle).width) * 0.5, _lY + 20);
      }
      pCtx.c2d.restore();

      // Axes.
      var _lXz = _lX + 50, _lYz = _lY + _lH - 30;
      var _lWg = _lW * (1.0 - ('legend_w_ratio' in lModel ? lModel.legend_w_ratio : 0.15)) - (50 + 10);
      var _lHg = _lH - (30 + 10);
      pCtx.c2d.beginPath();
      pCtx.c2d.moveTo(_lXz, _lYz);
      pCtx.c2d.lineTo(_lXz + _lWg, _lYz);
      pCtx.c2d.moveTo(_lXz, _lYz)
      pCtx.c2d.lineTo(_lXz, _lYz - _lHg);
      pCtx.c2d.stroke();
      // ---
      pCtx.c2d.fillText(lModel.x.name, _lXz + (_lWg - pCtx.c2d.measureText(lModel.x.name).width) * 0.5, _lY + _lH - 2);
      pCtx.c2d.save();
      pCtx.c2d.rotate(-0.5 * Math.PI);
      pCtx.c2d.fillText(lModel.y.name, -_lYz + (_lHg - pCtx.c2d.measureText(lModel.y.name).width) * 0.5, _lXz - 40);
      pCtx.c2d.restore();
      // ---
      pCtx.c2d.fillText(lXrange.first_str, _lXz + 5, _lYz + 10);
      pCtx.c2d.fillText(lXrange.middle_str, _lXz + (_lWg - pCtx.c2d.measureText(lXrange.middle_str).width) * 0.5, _lYz + 10);
      pCtx.c2d.fillText(lXrange.last_str, _lXz + _lWg - 5 - pCtx.c2d.measureText(lXrange.last_str).width, _lYz + 10);
      pCtx.c2d.fillText(lYrange.first_str, _lXz - pCtx.c2d.measureText(lYrange.first_str).width - 2, _lYz);
      pCtx.c2d.fillText(lYrange.middle_str, _lXz - pCtx.c2d.measureText(lYrange.middle_str).width - 2, 5 + _lYz - _lHg * 0.5);
      pCtx.c2d.fillText(lYrange.last_str, _lXz - pCtx.c2d.measureText(lYrange.last_str).width - 2, 10 + _lYz - _lHg);

      // Series.
      pCtx.c2d.save();
      pCtx.c2d.beginPath();
      pCtx.c2d.rect(_lXz, _lY, _lFadePct * _lWg, _lH);
      pCtx.c2d.rect(_lXz + _lWg, _lY, _lW - _lWg, _lH);
      pCtx.c2d.clip();
      var _lXfact = _lWg / lXrange.range;
      var _lYfact = _lHg / lYrange.range;
      var _lXlegend = _lX + _lWg + 55;
      var _lYlegend = _lY + 20;
      var _lDrawSeries =
        function(_pS)
        {
          pCtx.c2d.fillStyle = _pS.color;
          pCtx.c2d.strokeStyle = _pS.color;
          pCtx.c2d.lineWidth = ('lwidth' in _pS) ? _pS.lwidth : 1.0;
          pCtx.c2d.beginPath();
          pCtx.c2d.moveTo(_lXz + (_pS.data[0][0] - lXrange.first) * _lXfact, _lYz - (_pS.data[0][1] - lYrange.first) * _lYfact);
          for (var _iD = 0; _iD < _pS.data.length; _iD++)
            pCtx.c2d.lineTo(_lXz + (_pS.data[_iD][0] - lXrange.first) * _lXfact, _lYz - (_pS.data[_iD][1] - lYrange.first) * _lYfact);
          pCtx.c2d.stroke();
          pCtx.c2d.fillText(_pS.name, _lXlegend, _lYlegend);
          _lYlegend += 14;
        }
      lModel.series.forEach(_lDrawSeries);
      pCtx.c2d.restore();

      pCtx.c2d.globalAlpha = 1.0;
    }
  this.getHeight = function() { return pWidth / lModel.aspect; }
  this.checkReady = function(pOnReady) { lOnReady = pOnReady; if (lReady) { lOnReady(); } return lReady; }
}

// Animated widget to integrate applets in the doc flow.
// (from reused elements of promo.js)
function PrezElm_Applet(pCode, pWidth, pISN, pISNMessage)
{
  var lThis = this;
  var lTheCanvas = null;
  var lTr = 10;
  var lISNMessageStatus = 0; // 0: not registered, not received; 1: registered; 2: received
  var lModel = eval(pCode);
  var lObjects = lModel.getObjects();
  var lLastEvalTime = 0;
  var lWaitForISN =
    function()
    {
      if (0 == lISNMessageStatus && undefined != pISNMessage)
      {
        lISNMessageStatus++;
        pISN.registerSink(pISNMessage, function() { lISNMessageStatus++; });
      }
    }
  var lOnState =
    function(_pData)
    {
      // Check & parse.
      if (undefined == _pData || typeof(_pData) != 'string')
        return;
      try
      {
        var _lData = $.parseJSON(_pData.replace(/\s+/g, " ").replace(/NULL/g, "null"));
        if (!(_lData instanceof Array) || _lData.length < 2)
          return;
        // Process.
        lModel.processQueriesResults(_lData);
      }
      catch (e) { lWaitForISN(); } // Review: crutch for invalid JSON in a case of incomplete results (after step 1 of sensors scenario).
    }
  var lEvaluate =
    function(_pOnResult)
    {
      if (1 == lISNMessageStatus)
        return; // i.e. waiting for ISN message...
      // After giving a first chance to our query, if it fails, wait for ISN message...
      afydoc_query(afydoc_escapeQ(lModel.getQueries()), _pOnResult, lWaitForISN);
    }
  var lEvalRateInMs = lModel.getEvalRateInMs();
  this.render =
    function(pCtx)
    {
      var _lT = new Date().getTime();
      if (_lT - lLastEvalTime > lEvalRateInMs)
        { lEvaluate(lOnState); lLastEvalTime = _lT; }

      var _lW = pWidth;
      var _lH = lThis.getHeight();
      pCtx.c2d.font = "9pt Helvetica";
      pCtx.c2d.save();

      // Start from blank.
      pCtx.c2d.globalAlpha = 1.0;
      pCtx.c2d.fillStyle = $("body").css("background-color");
      pCtx.c2d.fillRect(0, 0, _lW, _lH);

      // Draw all objects of the applet.
      pCtx.c2d.translate(lTr, lTr);
      lObjects.forEach(
        function(_pO)
        {
          pCtx.c2d.save();
          pCtx.c2d.fillStyle = _pO.hover ? "#afa" : "#aaa";
          pCtx.c2d.strokeStyle = _pO.hover ? "#080" : "#000";
          _pO.onRender(pCtx.c2d, _pO);
          pCtx.c2d.restore();
        });
      pCtx.c2d.restore();
    }

  var lHeight = undefined;
  this.getHeight = function() { if (undefined == lHeight) { lHeight = 0; lObjects.forEach(function(_pO) { if (_pO.y + _pO.h > lHeight) lHeight = _pO.y + _pO.h; }); } return lHeight + 30; }
  var lMouseDown = undefined;
  var lUpdateHover =
    function(pPos)
    {
      lObjects.forEach(
        function(_pO)
        {
          _pO.hover = (_pO.x <= pPos.x && _pO.x + _pO.w >= pPos.x && _pO.y <= pPos.y && _pO.y + _pO.h >= pPos.y);
          if (_pO.hover && undefined != lMouseDown)
            lMouseDown.last = _pO;
        });
    }
  var lEv2Pnt = function(pEv) { var _lOffset = lTheCanvas.offset(); return {x:pEv.pageX - _lOffset.left - lTr, y:pEv.pageY - _lOffset.top - lTr}; }
  this.setCanvas =
    function(pCanvas)
    {
      lTheCanvas = pCanvas;
      lTheCanvas.mousedown(function(e) { var _lP = lEv2Pnt(e); lMouseDown = _lP; lUpdateHover(_lP); });
      lTheCanvas.mousemove(function(e) { var _lP = lEv2Pnt(e); lUpdateHover(_lP); });
      lTheCanvas.mouseup(
        function(e)
        {
          var _lP = lEv2Pnt(e);
          if (undefined != lMouseDown && 'last' in lMouseDown)
            afydoc_query(afydoc_escapeQ(lMouseDown.last.onClick(lMouseDown.last, _lP)), function() {}, function() {});
          lMouseDown = undefined;
          lUpdateHover(_lP);
        });
    }
}

// Activate specially marked code fragments in the doc (using the .pathsql_snippet class).
$(document).ready(
  function() {
    // Localhost (i.e. developer) deployments don't require EULA acceptance.
    var lRegisteredUser = (undefined != location.hostname.match(/(localhost|127\.0\.0\.1)/i));
    
    // Home/logo button.
    $("#gh_logo_img").hover(function() { $(this).addClass("logo-highlighted"); }, function() { $(this).removeClass("logo-highlighted"); });
    $("#gh_logo_img").click(function() { window.location.href = 'http://' + location.hostname + ":" + location.port; });

    // TOC.
    var lTocBar = $("#afytocbar");
    $("#afytoclist").change(
      function()
      {
        var _lCurPage = $("#afytoclist option:selected").val();
        window.location.href = 'http://' + location.hostname + ":" + location.port + "/doc/" + escape(_lCurPage) + ".html";
      });

    // Utilities.
    var lBase64Decode =
      function(pIn)
      {
        var lOut = "";
        var lC1, lC2, lC3 = "";
        var lE1, lE2, lE3, lE4 = "";
        var _i = 0;
        var keyStr = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
        pIn = pIn.replace(/[^A-Za-z0-9\+\/\=]/g, "");
        do
        {
          lE1 = keyStr.indexOf(pIn.charAt(_i++));
          lE2 = keyStr.indexOf(pIn.charAt(_i++));
          lE3 = keyStr.indexOf(pIn.charAt(_i++));
          lE4 = keyStr.indexOf(pIn.charAt(_i++));
          lC1 = (lE1 << 2) | (lE2 >> 4);
          lC2 = ((lE2 & 15) << 4) | (lE3 >> 2);
          lC3 = ((lE3 & 3) << 6) | lE4;
          lOut = lOut + String.fromCharCode(lC1);
          if (lE3 != 64) { lOut = lOut + String.fromCharCode(lC2); }
          if (lE4 != 64) { lOut = lOut + String.fromCharCode(lC3); }
          lC1 = lC2 = lC3 = "";
          lE1 = lE2 = lE3 = lE4 = "";
        } while (_i < pIn.length);
        return unescape(lOut);
      };
    var lWithoutComments =
      function(pSqlStr)
      {
        var lResult = "";
        var lInString = false;
        var lInSymbol = false;
        var lInComment = false;
        for (var _iC = 0; _iC < pSqlStr.length; _iC++)
        {
          var _lC = pSqlStr.charAt(_iC);
          if (lInString)
          {
            lResult += _lC;
            if (_lC == "'")
              lInString = false;
          }
          else if (lInSymbol)
          {
            lResult += _lC;
            if (_lC == '"')
              lInSymbol = false;
          }
          else if (lInComment)
          {
            if ((_lC == '*') && ((_iC + 1) < pSqlStr.length) && (pSqlStr.charAt(_iC + 1) == '/'))
              { _iC++; lInComment = false; }
          }
          else switch(_lC)
          {
            default: lResult += _lC; break;
            case '"': lInSymbol = true; lResult += _lC; break;
            case "'": lInString = true; lResult += _lC; break;
            case '/':
              if (((_iC + 1) < pSqlStr.length) && (pSqlStr.charAt(_iC + 1) == '*'))
                { _iC++; lInComment = true; }
              else
                lResult += _lC;
              break;
          }
        }
        return {text:lResult, incomment:lInComment};
      };
    var lColorComments =
      function(pHtml)
      {
        // Wrap C-style comments in the snippets' code with a <span class='pathsql_snippet_comment'> node, for improved readability.
        var sCommentsPattern = /\/\*.*?\*\//g; // Only support C-style comments in snippets, for simplicity.
        var _lResult = "";
        var _iComment;
        var _iFrom = 0;
        while (undefined != (_iComment = sCommentsPattern.exec(pHtml)))
        {
          _lResult += pHtml.substr(_iFrom, _iComment.index- _iFrom);
          _lResult += "<span class='pathsql_snippet_comment'>" + _iComment[0] + "</span>";
          _iFrom = _iComment.index + _iComment[0].length;
        }
        if (_iFrom < pHtml.length)
          _lResult += pHtml.substr(_iFrom);
        return _lResult;
      };

    // TODO: think about an implementation for search (possibly using a store).
    // var lSearch = $("<input id='afytocsearch'>");
    // lTocBar.append(lSearch);

    // Inter-snippet messages (let snippet A activate snippet B, in a case where B depends on A).
    var lISN = new InterSnippetNotifications();

    // Activation + stylization of snippets.
    var lReMultiStatement = /^.+;.+;.+/;
    $(".pathsql_snippet").each(
      function(_pI, _pE)
      {
        var lCode = $(_pE).clone();
        var lPathsqlLoaders = lCode.attr("loaders"); // Allows to run 'invisible' preparatory loaders; failures are tolerated (assumed to be repetitions).
        var lPathsqlDependencies = lCode.attr("dependencies"); // Allows to run 'invisible' preparatory pathSQL steps (useful to de-clutter some presentations).
        var lSnippetDependencies = [lPathsqlLoaders, lPathsqlDependencies].filter(function(_d) { return undefined != _d; });
        var lISNMessage = lCode.attr("pathsql_send_at_completion"); // Allows to enable further snippets/graphs, upon completion locally (via the button).
        lCode.html(lColorComments(lCode.html()));
        var lPre = lCode.wrap('<pre>').parent();
        var lWidget = $('<div class="pathsql_container">');
        var lButton = $('<div class="pathsql_button_runinplace">v</div>');
        var lResult= $('<div class="pathsql_inplace_result">');
        var lDoEscape = afydoc_escapeQ;
        var lEscapeDeps = function() { return lSnippetDependencies.length > 0 ? lSnippetDependencies.map(function(_q) { return lDoEscape(_q); }).join("") : ""; }
        var lEscapeCode = function() { return lDoEscape(lWithoutComments(lCode.text()).text); }
        lWidget.append(lButton);
        lWidget.append(lPre);
        lWidget.append(lResult);
        $(_pE).replaceWith(lWidget);
        lCode.hover(function() { lCode.addClass("pathsql_snippet_highlighted"); lCode.css('cursor', 'pointer'); }, function() { lCode.removeClass("pathsql_snippet_highlighted"); });
        // Clicking on the code opens a tab leading to console.html (either tab-basic or tab-batching, depending ont the contents of the snippet).
        lCode.click(function() { window.open('http://' + location.hostname + ":" + location.port + "/console.html?query=" + lEscapeDeps() + lEscapeCode() + "&storeid=docsample" + (lCode.text().match(lReMultiStatement) ? "#tab-batching" : "#tab-basic")); });
        // Clicking on the arrow button near the code expands the result in-place, directly on the page.
        var lDisplayResult =
          function(_pData)
          {
            // Notify dependent snippets that this step concluded successfully (if requested).
            if (undefined != lISNMessage)
              lISN.notify(lISNMessage);
            // First, try to decompose the result into distinct segments,
            // each corresponding to one statement of the snippet.
            try
            {
              var _lJson = $.parseJSON(_pData.replace(/\s+/g, " ").replace(/NULL/g, "null")); // TODO: remove NULL->null when fixed.
              if (_lJson instanceof Array)
              {
                var _lData = "";
                for (var _iR = 0; _iR < _lJson.length; _iR++)
                  _lData += JSON.stringify(_lJson[_iR]) + "<br><br>"; // Review: could interleave the actual statements as well, e.g. with different colors.
                lResult.html(_lData);
                return;
              }
            }
            catch (e) {}
            // Default: just produce the raw json response.
            lResult.text(_pData);
          };
        var lDoRequestCode = function() { afydoc_query(lEscapeCode(), lDisplayResult, function(_e) { lResult.text('responseText' in _e ? _e.responseText : "error"); }); };
        var lDoRequestDeps =
          function(_pDepIndex)
          {
            if (undefined == lSnippetDependencies || _pDepIndex >= lSnippetDependencies.length)
              { lDoRequestCode(); return; }
            var _lReqNext = function() { lDoRequestDeps(_pDepIndex + 1); };
            afydoc_query(lDoEscape(lSnippetDependencies[_pDepIndex]), _lReqNext, _lReqNext);
          };
        var lDoRequestAll = function() { lDoRequestDeps(0); }; // Note: the dependencies may fail, since they will typically attempt to re-declare singletons... on purpose, we ignore this.
        lButton.click(
          function()
          {
            if (!lRegisteredUser)
            {
              $.ajax({
                type: "GET",
                url: "/isregistered",
                dataType: "text",
                async: true,
                cache: false,
                global: false,
                success: function(data) { if (data != '1') { window.location.href = 'http://' + location.hostname + ":" + location.port + "/registration.html?first_destination=" + location.pathname; } else { lRegisteredUser = true; lDoRequestAll(); } },
                error: function() { alert("unexpected error during registration"); }
              });
            }
            if (lRegisteredUser)
              lDoRequestAll();
          });
      });
    $(".pathsql_inert").each(
      function(_pI, _pE)
      {
        var lCode = $(_pE).clone();
        var lPre = lCode.wrap('<pre>').parent();
        $(_pE).replaceWith(lPre);
      });

    // Activation + stylization of schemas.
    var lCanvasCtxs = [];
    $(".pathsql_staticschema").each(
      function(_pI, _pE)
      {
        var lCode = $(_pE).clone();
        var lWidth = $("#width_constraint").width() * 0.5;
        var lGraph = new PrezElm_StaticGraph(lCode.text(), lWidth);
        var lAnimatedWidget = $('<canvas class="horizontally_centered" style="width:' + lWidth + 'px; height:' + lGraph.getHeight() + 'px;">');
        $(_pE).replaceWith(lAnimatedWidget);
        var lCtx = new PrezRenderCtx(lAnimatedWidget, function(_pCtx) { lGraph.render(_pCtx); });
        lCtx.updateCanvasSize();
        lCanvasCtxs.push(lCtx);
      });

    // Activation + stylization of fcurve graphs.
    $(".pathsql_fcurves").each(
      function(_pI, _pE)
      {
        var lCode = $(_pE).clone();
        var lWidth = $("#width_constraint").width() * 0.5;
        var lISNMessage = lCode.attr("pathsql_listen_to"); // Data series may be enabled by a previous snippet.
        var lGraph = new PrezElm_MathGraph(lCode.text(), lWidth, lISN, lISNMessage);
        var lAnimatedWidget = $('<canvas class="horizontally_centered" style="width:' + lWidth + 'px; height:' + lGraph.getHeight() + 'px;">');
        $(_pE).replaceWith(lAnimatedWidget);
        var lCtx = new PrezRenderCtx(lAnimatedWidget, function(_pCtx) { lGraph.render(_pCtx); });
        lCtx.updateCanvasSize();
        if (!lGraph.checkReady(function() { lAnimatedWidget.css("display", "block"); }))
          lAnimatedWidget.css("display", "none");
        lCanvasCtxs.push(lCtx);
      });

    // Activation + stylization of applets.
    $(".pathsql_applet").each(
      function(_pI, _pE)
      {
        var lCode = $(_pE).clone();
        var lWidth = $("#width_constraint").width() * 0.5;
        var lISNMessage = lCode.attr("pathsql_listen_to"); // Applets may be enabled by a previous snippet.
        var lApplet = new PrezElm_Applet(lCode.text(), lWidth, lISN, lISNMessage);
        var lAnimatedWidget = $('<canvas class="horizontally_centered" style="width:' + lWidth + 'px; height:' + lApplet.getHeight() + 'px;">');
        lApplet.setCanvas(lAnimatedWidget);
        $(_pE).replaceWith(lAnimatedWidget);
        var lCtx = new PrezRenderCtx(lAnimatedWidget, function(_pCtx) { lApplet.render(_pCtx); });
        lCtx.updateCanvasSize();
        lCanvasCtxs.push(lCtx);
      });

    // Timer-based animation & render loop, if required by any schema/graph/applet on the page.
    if (lCanvasCtxs.length > 0) setInterval(
      function()
      {
        // Each canvas has its own context; all contexts progress together on the page.
        lCanvasCtxs.forEach(
          function(_pCtx)
          {
            _pCtx.time++;
            if (_pCtx.time > 100)
              _pCtx.time = 0;
            _pCtx.drawFunc(_pCtx);
          });
      }, 200);

    // Easter Egg.
    $("#special_ee01").hover(function() { $(this).addClass("dimmed"); }, function() { $(this).removeClass("dimmed"); });
    $("#special_ee01").click(
      function()
      {
        if (0 != $("#special_ee01 p").length)
          return;
        var _lT = "TWFueSBwZW9wbGUgaGF2ZSBjb250cmlidXRlZCB0byBjb21wb25lbnRzIG9mIEFmZmluaXR5IGluIHRoZSBwYXN0LCBkaXJlY3RseSBhbmQgaW5kaXJlY3RseS48YnI+DQoNCldlIHdhbnRlZCB0byBleHByZXNzIGEgc3BlY2lhbCBzYWx1dGF0aW9uIHRvIHRoZSBmb2xsb3dpbmcgcGVvcGxlOjxicj4NCg0KSmlmaSBFcml5YXRhbjxicj4NCkFuZHJlIEdhdXRoaWVyPGJyPg0KV2Fzc2VmIEhhcm91bjxicj4NClJvaGFuIEpheWFyYWo8YnI+DQpKdXJnZW4gTGVzY2huZXI8YnI+DQpLb3JuZWwgTWFydG9uPGJyPg0KWWFzaXIgTW9oYW1tYWQ8YnI+DQpEYXJyZW4gUGVnZzxicj4NClNhdW15YSBSYW5qYW4gU2FodTxicj4NCkFuZHJldyBTa293cm9uc2tpPGJyPg0KTHVpcyBUYWxhdmVyYTxicj4NClJvZ2VyIFRhd2E8YnI+DQpTdW1hbnRoIFZhc3U8YnI+DQpNaWNoYWVsIFdpbnNlcjxicj4=";
        $(this).append($("<br><br>"));
        $(this).append($("<p style='font-size:0.4em;color:#666;'>" + lBase64Decode(_lT) + "</p>"));
      });
  });
