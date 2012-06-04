/*
Copyright (c) 2004-2012 VMware, Inc. All Rights Reserved.

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

/**
 * Globals/Constants.
 */
var DB_ROOT = "/db/";
var AFY_CONTEXT = new Object(); // Global app context.
AFY_CONTEXT.mNavTabs = null; // Main tab/page-navigation system.
AFY_CONTEXT.mQueryHistory = null; // Query history view.
AFY_CONTEXT.mClasses = null; // The current result of 'SELECT FROM afy:ClassOfClasses'.
AFY_CONTEXT.mFullIntrospection = false; // Whether or not additional introspection hints are present (such as produced by modeling.py).
AFY_CONTEXT.mLastQResult = null; // The last query result table (for 'abort' - might be deprecated).
AFY_CONTEXT.mSelectedPID = null; // In the 'Basic Console', the currently selected pin.
AFY_CONTEXT.mDef2QnPrefix = new Object(); // Dictionary of 'http://bla/bla' to 'qn123'.
AFY_CONTEXT.mQnPrefix2Def = new Object(); // Dictionary of 'qn123' to 'http://bla/bla'.
AFY_CONTEXT.mQNamesDirty = false; // For lazy update of qname prefixes, based on new query results.
AFY_CONTEXT.mTooltipTimer = null; // For tooltips.
AFY_CONTEXT.mStoreIdent = ""; // The current store identity specified by the user.
AFY_CONTEXT.mStorePw = ""; // The current store password specified by the user.

/**
 * General-purpose helpers.
 */
function trimPID(pPID) { return undefined != pPID ? pPID.replace(/^0+/, "") : undefined; }
function countProperties(pO) { var lR = 0; for(var iP in pO) { if (pO.hasOwnProperty(iP)) lR++; } return lR; }
function nthProperty(pO, pN) { var i = 0; var lPn = null; for (var iP in pO) { if (i == pN) { lPn = iP; break; } i++; } return lPn; }
function myLog(pMsg) { if ("msie" in $.browser && $.browser["msie"]) return; console.log(pMsg); }
function alertStack() { try { throw new Exception(); } catch (e) { alert(e.stack); } }
function myStringify(pWhat, pOptions/*{quoteStrings:true/false, lineBreaks:true/false}*/)
{
  var lGetOption = function(_pWhat, _pDefault) { return (undefined != pOptions && _pWhat in pOptions) ? pOptions[_pWhat] : _pDefault; }
  if (typeof(pWhat) == "object")
  {
    if (pWhat instanceof Array)
    {
      var lR = [];
      for (var i = 0; i < pWhat.length; i++)
        lR.push(myStringify(pWhat[i], pOptions));
      var lRt = lR.join(",");
      if (lRt.length > 100 && lGetOption('lineBreaks', false)) { lRt = lR.join(",<br>"); }
      return "[" + lRt + "]";
    }
    else if (pWhat instanceof Date)
      return "'" + pWhat.toString() + "'";
    else
    {
      var lR = [];
      for (var iP in pWhat)
        lR.push(iP + ":" + myStringify(pWhat[iP], {quoteStrings:true, lineBreaks:lGetOption('lineBreaks', false)}));
      return "{" + lR.join(",") + "}";
    }
  }
  else if (typeof(pWhat) == "string" && lGetOption('quoteStrings', false))
    return "'" + pWhat + "'";
  return pWhat;
}

/**
 * Base64 helper.
 */
function base64_encode(data)
{
  if (!data) { return data; }
  var b64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  var o1, o2, o3, h1, h2, h3, h4, bits, i = 0, ac = 0, enc = "", tmp_arr = [];
  do
  {
    o1 = data.charCodeAt(i++);
    o2 = data.charCodeAt(i++);
    o3 = data.charCodeAt(i++);
    bits = o1 << 16 | o2 << 8 | o3;
    h1 = bits >> 18 & 0x3f;
    h2 = bits >> 12 & 0x3f;
    h3 = bits >> 6 & 0x3f;
    h4 = bits & 0x3f;
    tmp_arr[ac++] = b64.charAt(h1) + b64.charAt(h2) + b64.charAt(h3) + b64.charAt(h4);
  } while (i < data.length);
  enc = tmp_arr.join('');
  var r = data.length % 3;
  return (r ? enc.slice(0, r - 3) : enc) + '==='.slice(r || 3);
}

/**
 * Tabs.
 */
function isTabSelected(pName, pParentFrame)
{
  var lTabs = (true == pParentFrame) ? window.parent.$("#nav li") : $("#nav li");
  var lResult = false;
  lTabs.each(
    function(_pI, _pE)
    {
      var _lAnchor = $("a", _pE)[0];
      if (undefined != _lAnchor && $(_lAnchor).attr('href') == pName && $($("img", _lAnchor)[0]).hasClass("tab-selected"))
        lResult = true;
    });
  return lResult;
}
function disableTab(pName, pParentFrame)
{
  var lTabs = (true == pParentFrame) ? window.parent.$("#nav li") : $("#nav li");
  lTabs.each(
    function(_pI, _pE)
    {
      var _lAnchor = $("a", _pE)[0];
      if (undefined != _lAnchor && undefined != _lAnchor.toString().match(new RegExp(pName + "$")))
        $(_pE).css("display", "none");
    });
}

/**
 * Tooltips.
 * Simple mechanism to bind #thetooltip to any
 * div section on the page.
 */
function bindTooltip(pDiv, pMessage, pPos, pOptions/*{start:_, stop:_, once:_, offy:_}*/)
{
  var lGetOption = function(_pWhat, _pDefault) { return (undefined != pOptions && _pWhat in pOptions) ? pOptions[_pWhat] : _pDefault; }
  var lClearTimeout =
    function()
    {
      if (undefined == AFY_CONTEXT.mTooltipTimer)
        return;
      clearTimeout(AFY_CONTEXT.mTooltipTimer.timer);
      AFY_CONTEXT.mTooltipTimer = null;
    }
  var lDeactivate =
    function()
    {
      // Simply hide the tooltip.
      $("#thetooltip").css("display", "none");
      lClearTimeout();
    }
  var lActivate =
    function()
    {
      // Set the tooltip's text.
      $("#thetooltip").text(pMessage);
      // Set the tooltip's position and make it visible.
      var _lPos;
      if (undefined == pPos)
      {
        _lPos = pDiv.offset();
        var _lTooltipW = $("#thetooltip").outerWidth(true);
        if (_lTooltipW + 5 < _lPos.left)
          _lPos.left -= (_lTooltipW + 5);
        else
          _lPos.left += pDiv.outerWidth(true) + 5;
        _lPos.top += lGetOption('offy', 0);
      }
      else
        _lPos = pPos;
      $("#thetooltip").css("left", _lPos.left + "px").css("top", _lPos.top + "px").css("display", "block");
      // Deactivate automatically after a few seconds.
      if (undefined == AFY_CONTEXT.mTooltipTimer || (AFY_CONTEXT.mTooltipTimer.task == "activate" && AFY_CONTEXT.mTooltipTimer.message == pMessage))
        AFY_CONTEXT.mTooltipTimer = {timer:setTimeout(lDeactivate, lGetOption('stop', 1500)), task:"deactivate", message:pMessage};
    }
  var lDelayedActivate =
    function()
    {
      // Cancel any pending automatic tooltip activation/deactivation.
      lClearTimeout();
      // Schedule tooltip activation after a small delay (don't show tooltips right away).
      AFY_CONTEXT.mTooltipTimer = {timer:setTimeout(lActivate, lGetOption('start', 500)), task:"activate", message:pMessage};
    }

  if (lGetOption('once', false))
  {
    if (0 != lGetOption('start', 500))
      lDelayedActivate();
    else
      { lClearTimeout(); lActivate(); }
  }
  else
    pDiv.hover(lDelayedActivate, lDeactivate);
}
function bindAutomaticTooltips()
{
  $("#thetooltiptable #automatic div").each(
    function(_pI, _pE)
    {
      var _lId = _pE.id.substr("tooltip_".length);
      var _lDiv = $("#" + _lId);
      if (_lDiv.length > 0) { bindTooltip(_lDiv, $(_pE).text()); }
    });
}

/**
 * CtxMenu
 */
function CtxMenu()
{
  this.mMenu = $("<div />").css("position", "absolute").addClass("ctxmenu").appendTo($("body"));
  this.mMenu.css("display", "none");
  var lThis = this;
  this.clicks = function(_pEvent) { var _lO = lThis.mMenu.offset(), _lW = lThis.mMenu.outerWidth(true), _lH = lThis.mMenu.outerHeight(true); if (_pEvent.pageX < _lO.left || _pEvent.pageX > (_lO.left + _lW) || _pEvent.pageY < _lO.top || _pEvent.pageY > (_lO.top + _lH)) lThis.hide(); return true; }
  this.keys = function(_pEvent) { if (_pEvent.keyCode == 27) { lThis.hide(); return false; } return true; }
  this.hide = function() { lThis.mMenu.css("display", "none"); $(document).unbind("keypress", lThis.keys); $(document).unbind("mousedown", lThis.clicks); }
}
CtxMenu.prototype.addItem = function(pText, pCallback, pUserData, pBold)
{
  var lThis = this;
  var lMenuItem = $("<div />").addClass("ctxmenuitem").appendTo(this.mMenu);
  if (undefined != pText && pText.length > 0)
  {
    lMenuItem.append(pBold ? $("<b>" + pText + "</b>") : pText);
    lMenuItem.click(function(_pEvent) { lThis.hide(); if (pCallback) { pCallback(_pEvent, pUserData); } else { myLog("CtxMenu.addItem: unhandled item: " + pText); } });
    lMenuItem.hover(
      function() { $(this).addClass("ctxmenu-highlighted-item"); },
      function() { $(this).removeClass("ctxmenu-highlighted-item"); });
  }
  else
    lMenuItem.css("height", "0").css("margin", "0").css("padding", "0 0.2em 0 0.2em"); // Separator.
  lMenuItem.appendTo(this.mMenu);
}
CtxMenu.prototype.start = function(pX, pY)
{
  var lThis = this;
  $(document).mousedown(this.clicks);
  $(document).keypress(this.keys);
  this.mMenu.css("left", pX + "px").css("top", pY + "px");
  this.mMenu.css("display", "block");
}
function bindStaticCtxMenus()
{
  // TODO:
  //   Add more suggestions... should try to cover enough basics to help somebody be up&running quickly...
  //   (e.g. graph insert dml, path expressions, collections, more joins etc.)
  // REVIEW: Ideally we should have menu enablers also...

  var lQuerySuggestions =
    function()
    {
      var _lThis = this;
      var _lMenu = null, _lTarget = null, _lSomePID = "50001", _lSomeClass = "myclass";
      var _lBegin =
        function(e)
        {
          _lMenu = new CtxMenu(); _lTarget = $(e.target);
          _lSomePID = (undefined != AFY_CONTEXT.mSelectedPID ? AFY_CONTEXT.mSelectedPID : "50001");
          _lSomeClass = (undefined != AFY_CONTEXT.mClasses && AFY_CONTEXT.mClasses.length > 0 ? AFY_CONTEXT.mClasses[0]["afy:classID"] : "myclass");
        }
      var _lAddSelect =
        function()
        {
          _lMenu.addItem($("#menuitem_query_pin").text(), function() { _lTarget.val("SELECT * FROM @" + _lSomePID + ";"); });
          _lMenu.addItem($("#menuitem_query_class").text(), function() { _lTarget.val("SELECT * FROM " + _lSomeClass + ";"); });
          _lMenu.addItem($("#menuitem_query_all").text(), function() { _lTarget.val("SELECT *;"); });
          _lMenu.addItem($("#menuitem_query_classft").text(), function() { _lTarget.val("SELECT * FROM " + _lSomeClass + " MATCH AGAINST ('hello');"); });
          _lMenu.addItem($("#menuitem_query_classjoin").text(), function() { _lTarget.val("SELECT * FROM myclass1 AS c1 JOIN myclass2 AS c2 ON (c1.myprop1 = c2.myprop2);"); });
        }
      var _lAddUpdate =
        function()
        {
          _lMenu.addItem($("#menuitem_query_insertpin").text(), function() { _lTarget.val("INSERT (\"myprop\", \"myotherprop\") VALUES (1, {2, 'hello', TIMESTAMP'1976-05-02 10:10:10'});"); });
          _lMenu.addItem($("#menuitem_query_insertclass").text(), function() { _lTarget.val("CREATE CLASS \"myclass\" AS SELECT * WHERE EXISTS(\"myprop\");"); });
          _lMenu.addItem($("#menuitem_query_updatepin").text(), function() { _lTarget.val("UPDATE @" + _lSomePID + " SET \"mythirdprop\"=123;"); });
          _lMenu.addItem($("#menuitem_query_deletepin").text(), function() { _lTarget.val("DELETE FROM @" + _lSomePID + ";"); });
          _lMenu.addItem($("#menuitem_query_dropclass").text(), function() { _lTarget.val("DROP CLASS " + _lSomeClass + ";"); }); 
        }
      this.handlerAll = function(e) { _lBegin(e); _lAddSelect(); _lMenu.addItem("", null); _lAddUpdate(); _lMenu.start(e.pageX, e.pageY); return false; }
      this.handlerSelect = function(e) { _lBegin(e); _lAddSelect(); _lMenu.start(e.pageX, e.pageY); return false; }
    }
  $("#query").bind("contextmenu", null, function(e) { return new lQuerySuggestions().handlerAll(e); });
  $("#map_query").bind("contextmenu", null, function(e) { return new lQuerySuggestions().handlerSelect(e); });

  $("#result_pin").bind(
    "contextmenu", null,
    function(_pEvent)
    { 
      var _lMenu = new CtxMenu();
      _lMenu.addItem($("#menuitem_rp_querypin").text(), function() { if (undefined != AFY_CONTEXT.mSelectedPID) { $("#query").val("SELECT * FROM @" + AFY_CONTEXT.mSelectedPID + ";"); } });
      _lMenu.addItem($("#menuitem_rp_deletepin").text(), function() { if (undefined != AFY_CONTEXT.mSelectedPID) { $("#query").val("DELETE FROM @" + AFY_CONTEXT.mSelectedPID + ";"); } });
      _lMenu.start(_pEvent.pageX, _pEvent.pageY);
      return false;
    });

  $("#classes").bind(
    "contextmenu", null,
    function(_pEvent)
    {
      // If there's no class, don't display any ctx menu.
      if (0 == $("#classes option").size())
        return;
      // If there's no selected class, select the first one (+/- simulates click on right-click).
      if (undefined == $("#classes option:selected").val())
        $("#classes option:eq(0)").attr("selected", "selected");
      
      var _lMenu = new CtxMenu();
      _lMenu.addItem($("#menuitem_classes_q").text(), function() { on_class_dblclick(); }, null, true);
      _lMenu.addItem($("#menuitem_classes_q_ft").text(), function() { on_class_dblclick(); var _lQ = $("#query").val(); $("#query").val(_lQ.substr(0, _lQ.length - 1) + " MATCH AGAINST ('hello');"); });
      _lMenu.addItem($("#menuitem_classes_q_drop").text(), function() { $("#query").val("DROP CLASS \"" + $("#classes option:selected").val() + "\";"); }); 
      _lMenu.start(_pEvent.pageX, _pEvent.pageY);
      return false;
    });
}

/**
 * PanZoom.
 * Common functionality for canvas-based views.
 */
function PanZoom(pArea, pZoom)
{
  var lThis = this;
  var lButtonDown = false, lZoomKeyDown = false;
  var lAnchorPoint = {x:0, y:0}, lDynAnchorPoint = {x:0, y:0}, lLastPoint = {x:0, y:0};
  var lStableZoom =
    function(_pFactor)
    {
      var _lOffset = lThis.area.offset();
      var _lAP = {x:lAnchorPoint.x - _lOffset.left, y:lAnchorPoint.y - _lOffset.top};
      var _lLog = {x:_lAP.x / lThis.zoom - lThis.pan.x, y:_lAP.y / lThis.zoom - lThis.pan.y};
      lThis.zoom = lThis.zoom + lThis.zoom * _pFactor; 
      lThis.pan.x = (_lAP.x / lThis.zoom) - _lLog.x; // ecr = (log + pan) * zoom -> pan = ecr/zoom - log
      lThis.pan.y = (_lAP.y / lThis.zoom) - _lLog.y;
    }
  this.area = pArea;
  this.pan = {x:0, y:0};
  this.zoom = (undefined != pZoom) ? pZoom : 1.0;
  this.curX = function() { return lLastPoint.x; }
  this.curY = function() { return lLastPoint.y; }
  this.isButtonDown = function() { return lButtonDown; }
  this.onMouseDown =
    function()
    {
      lButtonDown = true;
      lDynAnchorPoint.x = lAnchorPoint.x = lLastPoint.x;
      lDynAnchorPoint.y = lAnchorPoint.y = lLastPoint.y;
    }
  this.onMouseMove =
    function(e)
    {
      lLastPoint.x = e.pageX; lLastPoint.y = e.pageY;
      if (lButtonDown)
      {
        if (lZoomKeyDown) 
          lStableZoom(0.2 * (((lLastPoint.x - lLastPoint.y) - (lDynAnchorPoint.x - lDynAnchorPoint.y) > 0) ? 1 : -1));
        else
        {
          lThis.pan.x += (lLastPoint.x - lDynAnchorPoint.x) / lThis.zoom;
          lThis.pan.y += (lLastPoint.y - lDynAnchorPoint.y) / lThis.zoom;
        }
        lDynAnchorPoint.x = lLastPoint.x;
        lDynAnchorPoint.y = lLastPoint.y;
      }
    }
  this.onMouseUp = function() { lButtonDown = false; lZoomKeyDown = false; }
  this.onKeyDown = function(e) { if (e.which == 90) lZoomKeyDown = true; }
  this.onKeyUp = function(e) { if (e.which == 90) lZoomKeyDown = false; }
  this.onWheel = function(e) { e = (undefined != e) ? e : window.event; lAnchorPoint.x = lLastPoint.x; lAnchorPoint.y = lLastPoint.y; var _lV = ('wheelDelta' in e ? -e.wheelDelta : e.detail); lStableZoom(0.2 * (_lV > 0 ? -1 : 1)); }
}

/**
 * Affinity query helpers.
 */
function update_qnames_ui()
{
  if (!AFY_CONTEXT.mQNamesDirty)
    { return; }
  var lQNames = $("#qnames");
  if (undefined == lQNames)
    return;
  lQNames.empty();
  for (iP in AFY_CONTEXT.mDef2QnPrefix)
    { lQNames.append("<option>" + AFY_CONTEXT.mDef2QnPrefix[iP] + "=" + iP + "</option>"); }
  AFY_CONTEXT.mQNamesDirty = false;
}
function afy_with_qname(pRawName)
{
  var lNewProp = null;
  var lLastSlash = (undefined != pRawName) ? pRawName.lastIndexOf("/") : -1;
  if (lLastSlash < 0)
    { return pRawName; }
  var lPrefix = pRawName.substr(0, lLastSlash);
  var lSuffix = pRawName.substr(lLastSlash + 1);
  if (lSuffix.indexOf(":") > 0)
    lSuffix = "\"" + lSuffix + "\"";
  if (lPrefix in AFY_CONTEXT.mDef2QnPrefix)
    { return AFY_CONTEXT.mDef2QnPrefix[lPrefix] + ":" + lSuffix; }
  else
  {
    var lNumQNames = 0;
    for (iQN in AFY_CONTEXT.mDef2QnPrefix) { if (AFY_CONTEXT.mDef2QnPrefix.hasOwnProperty(iQN)) lNumQNames++; }
    var lNewQName = "qn" + lNumQNames;
    AFY_CONTEXT.mDef2QnPrefix[lPrefix] = lNewQName;
    AFY_CONTEXT.mQnPrefix2Def[lNewQName] = lPrefix;
    AFY_CONTEXT.mQNamesDirty = true;
    setTimeout(update_qnames_ui, 2000);
    return lNewQName + ":" + lSuffix;
  }
}
function afy_without_qname(pRawName)
{
  if (null == pRawName || undefined == pRawName)
    { return null; }
  var lColon = pRawName.indexOf(":");
  if (lColon < 0)
    { return pRawName; }
  var lQName = pRawName.substr(0, lColon);
  var lSuffix = pRawName.substr(lColon + 1);
  if (lQName in AFY_CONTEXT.mQnPrefix2Def)
    { return AFY_CONTEXT.mQnPrefix2Def[lQName] + "/" + lSuffix; }
  return pRawName;
}
function afy_with_qname_prefixes(pQueryStr)
{
  var lAlreadyDefined = {'http':1, 'afy':1};
  {
    var lAlreadyDefinedPattern = /PREFIX\s*(\w*)\:/gi;
    var lAD;
    while (undefined != (lAD = lAlreadyDefinedPattern.exec(pQueryStr)))
      lAlreadyDefined[lAD[1].toLocaleLowerCase()] = 1;
  }
  var lToDefine = {};
  {
    var lToDefinePattern = /\b(\w*)\:/g;
    var lTD;
    while (undefined != (lTD = lToDefinePattern.exec(pQueryStr)))
    {
      var lPrefix = lTD[1].toLocaleLowerCase();
      if (lPrefix in lAlreadyDefined)
        continue;
      if (!isNaN(Number(lPrefix)))
        continue;
      if (lPrefix in AFY_CONTEXT.mQnPrefix2Def)
        lToDefine[lPrefix] = AFY_CONTEXT.mQnPrefix2Def[lPrefix];
      else
        myLog("Unknown prefix: " + lPrefix); // Note: Could happen if for example a URI contains a colon - no big deal.
    }
  }
  var lProlog = "";
  for (var iP in lToDefine)
    { lProlog = lProlog + "PREFIX " + iP + ": '" + lToDefine[iP] + "' "; }
  return lProlog + pQueryStr;
}
function afy_sanitize_json_result(pResultStr, pLongNames)
{
  var lTransform =
    function(_pJsonRaw)
    {
      if (typeof(_pJsonRaw) == "number" || typeof(_pJsonRaw) == "boolean" || typeof(_pJsonRaw) == "string")
        return _pJsonRaw;
      if (typeof(_pJsonRaw) != "object")
        { alert("Unexpected type: " + typeof(_pJsonRaw)); return _pJsonRaw; }
      if (_pJsonRaw instanceof Array)
      {
        var _lNewArray = new Array();
        for (var _iElm = 0; _iElm < _pJsonRaw.length; _iElm++)
          _lNewArray.push(lTransform(_pJsonRaw[_iElm]));
        return _lNewArray;
      }
      if (true == pLongNames)
        return _pJsonRaw;
      var _lNewObj = new Object();
      for (var _iProp in _pJsonRaw)
      {
        var _lNewProp = afy_with_qname(_iProp);
        if (_iProp == _lNewProp)
          { _lNewObj[_iProp] = _pJsonRaw[_iProp]; continue; }
        _lNewObj[_lNewProp] = _pJsonRaw[_iProp];
      }
      return _lNewObj;
    };
  try
  {
    var lJsonRaw = $.parseJSON(pResultStr.replace(/\s+/g, " ")); // Note: for some reason chrome is more sensitive to those extra characters than other browsers.
    if (null == lJsonRaw) { return null; }
    return lTransform(lJsonRaw);
  } catch(e) { myLog("afy_sanitize_json_result: " + e); }
  return null;
}
function afy_sanitize_classname(pClassName)
{
  return (pClassName.charAt(0) != "\"" && pClassName.indexOf("/") > 0) ? ("\"" + pClassName + "\"") : pClassName;
}
function afy_sanitize_semicolon(pQ)
{
  // Remove the last semicolon, if any, to make sure the store recognizes single-instructions as such.
  if (undefined == pQ || 0 == pQ.length) return "";
  for (var _i = pQ.length - 1; _i >= 0; _i--)
  {
    switch (pQ.charAt(_i))
    {
      case ";": return pQ.substr(0, _i);
      case " ": case "\n": continue;
      default: return pQ;
    }
  }
  return "";
}
function afy_escape_with_plus(pStr)
{
  return escape(pStr.replace(/\+/g, "\+")).replace(/\+/g, "%2B"); // escape pStr, and preserve '+' signs (e.g. for {+} in path expressions; by default '+' is automatically interpreted as a space).
}
function QResultHandler(pOnSuccess, pOnError, pUserData) { this.mOnSuccess = pOnSuccess; this.mOnError = pOnError; this.mUserData = pUserData; }
QResultHandler.prototype.onsuccess = function(pJson, pSql) { if (this.mOnSuccess) this.mOnSuccess(pJson, this.mUserData, pSql); }
QResultHandler.prototype.onerror = function(pArgs, pSql)
{
  if (this.mOnError)
    this.mOnError(pArgs, this.mUserData, pSql);
  else
  {
    var lT = pSql + "\n" + (pArgs ? pArgs[0].responseText : "");
    myLog(lT);
    lT = lT.replace(/\n/g, "<br>").replace(/\s/, "&nbsp;");
    $("#result_pin").empty(); $("#result_pin").append("<pre style='color:red'>" + lT + "</pre>");
  }
}
function afy_query(pSqlStr, pResultHandler, pOptions)
{
  if (null == pSqlStr || 0 == pSqlStr.length)
    { myLog("afy_query: invalid sql " + pSqlStr); pResultHandler.onerror(null, pSqlStr); return; }
  var lSqlStr = afy_with_qname_prefixes(pSqlStr);
  var lHasOption = function(_pOption) { return (undefined != pOptions && _pOption in pOptions); }
  $.ajax({
    type: "GET",
    url: DB_ROOT + "?q=" + afy_escape_with_plus(lSqlStr) + "&i=pathsql&o=json" + (lHasOption('countonly') ? "&type=count" : "") + (lHasOption('limit') ? ("&limit=" + pOptions.limit) : "") + (lHasOption('offset') ? ("&offset=" + pOptions.offset) : ""),
    dataType: "text", // Review: until Affinity returns 100% clean json...
    async: (lHasOption('sync') && pOptions.sync) ? false : true,
    timeout: (lHasOption('sync') && pOptions.sync) ? 10000 : null,
    cache: false,
    global: false,
    success: function(data) { /*alert(data);*/ pResultHandler.onsuccess(afy_sanitize_json_result(data, lHasOption('longnames')), pSqlStr); },
    error: function() { pResultHandler.onerror(arguments, pSqlStr); },
    beforeSend : function(req) {
      if (!lHasOption('keepalive') || pOptions.keepalive) { req.setRequestHeader('Connection', 'Keep-Alive'); } // Note: This doesn't seem to guaranty that a whole multi-statement transaction (e.g. batching console) will run in a single connection; in firefox, it works if I configure network.http.max-persistent-connections-per-server=1 (via the about:config page).
      if (AFY_CONTEXT.mStoreIdent.length > 0) { req.setRequestHeader('Authorization', "Basic " + base64_encode(AFY_CONTEXT.mStoreIdent + ":" + AFY_CONTEXT.mStorePw)); }
    }
  });
}
function afy_batch_query(pSqlStrArray, pResultHandler, pOptions)
{
  if (null == pSqlStrArray || 0 == pSqlStrArray.length)
    { myLog("afy_batch_query: invalid sql batch"); pResultHandler.onerror(null, pSqlStrArray); return; }
  var lBody = "";
  for (var iStmt = 0; iStmt < pSqlStrArray.length; iStmt++)
  {
    lBody = lBody + afy_with_qname_prefixes(pSqlStrArray[iStmt]);
    var lChkSemicolon = pSqlStrArray[iStmt].match(/(.*)(;)(\s*)$/);
    if (iStmt < pSqlStrArray.length - 1 && (undefined == lChkSemicolon || undefined == lChkSemicolon[2]))
      lBody = lBody + ";";
  }
  var lHasOption = function(_pOption) { return (undefined != pOptions && _pOption in pOptions); }
  lBody = "q=" + afy_escape_with_plus(lBody) + (lHasOption('countonly') ? "&type=count" : "") + (lHasOption('limit') ? ("&limit=" + pOptions.limit) : "") + (lHasOption('offset') ? ("&offset=" + pOptions.offset) : "");
  $.ajax({
    type: "POST",
    data: lBody,
    url: DB_ROOT + "?i=pathsql&o=json",
    dataType: "text", // Review: until Affinity returns 100% clean json...
    async: (lHasOption('sync') && pOptions.sync) ? false : true,
    timeout: (lHasOption('sync') && pOptions.sync) ? 10000 : null,
    cache: false,
    global: false,
    success: function(data) { /*alert(data);*/ pResultHandler.onsuccess(afy_sanitize_json_result(data, lHasOption('longnames')), pSqlStrArray); },
    error: function() { pResultHandler.onerror(arguments, pSqlStrArray); },
    beforeSend : function(req) {
      if (!lHasOption('keepalive') || pOptions.keepalive) { req.setRequestHeader('Connection', 'Keep-Alive'); } // Note: This doesn't seem to guaranty that a whole multi-statement transaction (e.g. batching console) will run in a single connection; in firefox, it works if I configure network.http.max-persistent-connections-per-server=1 (via the about:config page).
      if (AFY_CONTEXT.mStoreIdent.length > 0) { req.setRequestHeader('Authorization', "Basic " + base64_encode(AFY_CONTEXT.mStoreIdent + ":" + AFY_CONTEXT.mStorePw)); }
    }
  });
}
function get_classes(pOnDone)
{
  var lTruncateLeadingDot = function(_pStr) { return _pStr.charAt(0) == "." ? _pStr.substr(1) : _pStr; }
  var lOnSuccess =
    function(_pJson)
    {
      AFY_CONTEXT.mClasses = _pJson;
      AFY_CONTEXT.mFullIntrospection = false;
      var lToDelete = [];
      for (var iC = 0; null != AFY_CONTEXT.mClasses && iC < AFY_CONTEXT.mClasses.length; iC++)
      {
        if (undefined == AFY_CONTEXT.mClasses[iC]["afy:classID"])
          { lToDelete.push(iC); continue; }
        AFY_CONTEXT.mClasses[iC]["afy:classID"] = afy_with_qname(lTruncateLeadingDot(AFY_CONTEXT.mClasses[iC]["afy:classID"])); // Remove the leading dot (if any) and transform into qname (prefix:name).
        if ("http://localhost/afy/class/1.0/ClassDescription" == AFY_CONTEXT.mClasses[iC]["afy:classID"])
          { AFY_CONTEXT.mFullIntrospection = true; }
        var lCProps = AFY_CONTEXT.mClasses[iC]["afy:properties"];
        var lNewProps = new Object();
        for (iP in lCProps)
        {
          var lNewName = afy_with_qname(lTruncateLeadingDot(lCProps[iP]));
          lNewProps[iP] = lNewName;
        }
        AFY_CONTEXT.mClasses[iC]["afy:properties"] = lNewProps;
      }
      for (var iD = lToDelete.length - 1; iD >= 0; iD--)
        AFY_CONTEXT.mClasses.splice(lToDelete[iD], 1);
      if (undefined != pOnDone)
        pOnDone(_pJson);
    };
  AFY_CONTEXT.mQNamesDirty = true;
  var lOnClasses = new QResultHandler(lOnSuccess, null, null);
  afy_query("SELECT * FROM afy:ClassOfClasses;", lOnClasses, {keepalive:false});
}
function get_pin_info(pPID, pCallback)
{
  var lInfo = {pid:trimPID(pPID), classes:[], data:{}};
  var lGetData =
    function()
    {
      var _lOnData = function(__pJson) { lInfo.data = (undefined != __pJson && __pJson.length > 0) ? __pJson[0] : null; pCallback(lInfo); }
      afy_query("SELECT * FROM @" + pPID + ";", new QResultHandler(_lOnData, null, null), {keepalive:false});
    }
  var lGetClasses =
    function()
    {
      // REVIEW: Would be even nicer if could combine SELECT *, MEMBERSHIP(@) FROM ... in a single request...
      var _lOnSuccess = function(__pJson) { if (undefined != __pJson && __pJson.length > 0) { for (var __c in __pJson[0]['afy:value']) lInfo.classes.push(afy_with_qname(__pJson[0]['afy:value'][__c])); } lGetData(); }
      afy_query("SELECT MEMBERSHIP(@" + pPID + ");", new QResultHandler(_lOnSuccess, null, null), {keepalive:false});
    }
  lGetClasses();
}
