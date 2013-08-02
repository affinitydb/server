/*
Copyright (c) 2004-2013 GoPivotal, Inc. All Rights Reserved.

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
 * Scrolling on mobile.
 */
function ScrollOnMobile(pDivId, pScrollers/*optional*/)
{
  if (!AFY_CONTEXT.mMobileVersion)
  {
    this.activate = this.deactivate = function(){};
    return;
  }
  // Note: On mobile the 'overflow:auto' behavior is disabled, so we emulate it here...
  // Review: May be slightly different on iPhone...
  var lThis = this;
  var lScrollerX = (undefined != pScrollers && 'x' in pScrollers ? pScrollers.x : pDivId);
  var lScrollerY = (undefined != pScrollers && 'y' in pScrollers ? pScrollers.y : pDivId);
  var lCurPoint = {x:0, y:0};
  var lAnchorPoint = null;
  var lMouseDown = false;
  var lGrabCurPoint = function(e) { if (undefined == e) return; if ('touches' in e) { lCurPoint.x = e.touches[0].pageX; lCurPoint.y = e.touches[0].pageY; } else { lCurPoint.x = e.pageX; lCurPoint.y = e.pageY; } };
  $(pDivId).bind("touchstart", function(e) { lAnchorPoint = null; lMouseDown = true; });
  $(pDivId).bind("touchend", function() { lMouseDown = false; });
  $(pDivId).bind("touchcancel", function() { lMouseDown = false; });
  $(pDivId).mouseup(function() { lMouseDown = false; });
  var lOnTouch =
    function(e)
    {
      e.preventDefault(); // Review: not all browsers?
      lGrabCurPoint(window.event);
      if (undefined == lAnchorPoint)
        { lAnchorPoint = {x:lCurPoint.x, y:lCurPoint.y, st:$(lScrollerY).scrollTop(), sl:$(lScrollerX).scrollLeft()}; }
      if (lMouseDown)
      {
        $(lScrollerY).scrollTop(lAnchorPoint.st + lAnchorPoint.y - lCurPoint.y);
        $(lScrollerX).scrollLeft(lAnchorPoint.sl + lAnchorPoint.x - lCurPoint.x);
      }
    };
  this.activate = function() { $(window).bind("touchmove", lOnTouch); };
  this.deactivate = function() { $(window).unbind("touchmove", lOnTouch); };
}

// TODO: unify with above
function TrackMouseOnMobile(pDivId, pHandlers)
{
  if (!AFY_CONTEXT.mMobileVersion || undefined == pHandlers)
  {
    this.activate = this.deactivate = this.activation = function(){};
    return;
  }
  // Note: On some(?) mobile platforms the mouse emulation is really bad... we emulate it here...
  var lThis = this;
  var lCurPoint = {x:0, y:0};
  var lSecPoint = null;
  var lWheelData = {x:0, y:0, detail:1.0, lastdst2:0.0};
  var lCallHandler = function(pWhich, pArg) { if (pWhich in pHandlers) pHandlers[pWhich].call(pHandlers, pArg); };
  var lCalcDst2 = function() { return Math.pow(lCurPoint.x - lSecPoint.x, 2) + Math.pow(lCurPoint.y - lSecPoint.y, 2); };
  var lInitWheel = function() { lWheelData.x = 0.5 * (lCurPoint.x + lSecPoint.x); lWheelData.y = 0.5 * (lCurPoint.y + lSecPoint.y); lWheelData.lastdst2 = lCalcDst2(); lWheelData.detail = 1.0; };
  var lCallWheel = function() { var _lNd = lCalcDst2(); lWheelData.detail = (lWheelData.lastdst2 > _lNd ? 1.0 : -1.0); lWheelData.lastdst2 = _lNd; lCallHandler('wheel', lWheelData); };
  var lGrabCurPoint = function(e) { if (undefined == e) return; lSecPoint = null; if ('touches' in e) { lCurPoint.x = e.touches[0].pageX; lCurPoint.y = e.touches[0].pageY; if (e.touches.length > 1) { lSecPoint = {x:e.touches[1].pageX, y:e.touches[1].pageY}; } } else { lCurPoint.x = e.pageX; lCurPoint.y = e.pageY; } };
  $(pDivId).bind("touchstart", function(e) { lGrabCurPoint(window.event); if (undefined == lSecPoint) { lCallHandler('mousedown', lCurPoint); } else { lInitWheel(); } });
  $(pDivId).bind("touchend", function() { lCallHandler('mouseup', lCurPoint); });
  $(pDivId).bind("touchcancel", function() { lCallHandler('mouseup', lCurPoint); });
  $(pDivId).mouseup(function() { lCallHandler('mouseup', lCurPoint); });
  var lOnTouchMove =
    function(e)
    {
      e.preventDefault(); // Review: not all browsers?
      lGrabCurPoint(window.event);
      //$("#footer_text").text("p:" + lCurPoint.x + "-" + lCurPoint.y);
      if (undefined == lSecPoint)
        lCallHandler('mousemove', lCurPoint);
      else
        lCallWheel();
    };
  this.activate = function() { $(window).bind("touchmove", lOnTouchMove); };
  this.deactivate = function() { $(window).unbind("touchmove", lOnTouchMove); };
  this.activation = function(pOn) { if (pOn) lThis.activate(); else lThis.deactivate(); };
}

/**
 * Tooltips.
 * Simple mechanism to bind #thetooltip to any
 * div section on the page.
 */
function bindTooltip(pDiv, pMessage, pPos, pOptions/*{start:_, stop:_, once:_, offy:_}*/)
{
  if (AFY_CONTEXT.mMobileVersion)
    { return; }
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
          _lSomeClass = (undefined != AFY_CONTEXT.mClasses && AFY_CONTEXT.mClasses.length > 0 ? AFY_CONTEXT.mClasses[0]["afy:objectID"] : "myclass");
        }
      var _lAddSelect =
        function()
        {
          _lMenu.addItem($("#menuitem_query_pin").text(), function() { _lTarget.val("SELECT * FROM @" + _lSomePID + ";"); });
          _lMenu.addItem($("#menuitem_query_class").text(), function() { _lTarget.val("SELECT * FROM " + _lSomeClass + ";"); });
          _lMenu.addItem($("#menuitem_query_all").text(), function() { _lTarget.val("SELECT RAW *;"); });
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
  this.reset = function() { lThis.pan.x = 0; lThis.pan.y = 0; lThis.zoom = (undefined != pZoom) ? pZoom : 1.0; }
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
 * QResultTable.
 * Deals with infinitely long results, using pagination and special scollbars.
 * Contains at least 2 columns: PID, Other Properties.
 * When the query is on a class (or eventually join etc.), adds more columns.
 * Goal: improve readability by showing common properties, and also reduce waste of space.
 */
function QResultTable(pContainer, pClassName, pCallbacks, pOptions)
{
  var lThis = this;
  var lEvalVScrollerRowHeight =
    function()
    {
      lThis.mQrtVScroller.css("visibility", "hidden").css("display", "block");
      var _lLine = $("<p>HeightTest</p>").appendTo(lThis.mQrtVScroller);
      var _lH = _lLine.height();
      _lLine.remove();
      lThis.mQrtVScroller.css("display", "none").css("visibility", "visible");
      return _lH;
    }
  this.mInitialized = false;
  this.mAborted = false;
  this.mQrtIndex = QResultTable.sQrtIndex++;
  this.mUIContainer = pContainer; // In this div we will create all the widgets we need to operate our infinite table.
  this.mClassName = pClassName;
  this.mQrtContainer = $("<div id='qrt_cnt_" + this.mQrtIndex + "' class='qrt_cnt' />").appendTo(this.mUIContainer); // This div is used for horizontal scrolling; it contains the table.
  this.mTables = []; // Double-buffering (due to our peculiar pagination mechanism).
  this.mTables.push($("<table id='qrt_table1_" + this.mQrtIndex + "' class='qrt_table' />").appendTo(this.mQrtContainer));
  this.mTables.push($("<table id='qrt_table2_" + this.mQrtIndex + "' class='qrt_table' style='visibility:hidden' />").appendTo(this.mQrtContainer));
  this.mQrtHScroller = $("<div id='qrt_hscroller_" + this.mQrtIndex + "' class='qrt_hscroller' />").appendTo(this.mUIContainer);
  this.mQrtHScrollerContent = $("<div id='qrt_hscroller_content_" + this.mQrtIndex + "' class='qrt_hscroller_content' />").appendTo(this.mQrtHScroller);
  this.mQrtVScroller = $("<div id='qrt_vscroller_" + this.mQrtIndex + "' class='qrt_vscroller' />").appendTo(this.mUIContainer);
  this.mQrtVScrollerContent = $("<div id='qrt_vscroller_content_" + this.mQrtIndex + "' class='qrt_vscroller_content' />").appendTo(this.mQrtVScroller);
  this.mQrtVSNominalRowHeight = lEvalVScrollerRowHeight() + 4; // Hack: To this date, I have failed to identify why this +4 is needed; it reflects the scroll increment actually calculated by the browser, for this scroller's font.
  this.mCurTable = 0; // Next table to update, in the double-buffered mechanism.
  this.mCurRow = null; // Workaround: somehow, sometimes, our current pagination model seems to confuse the table's selected row mechanism; with this we take control...
  this.mRowCache = {}; // Cache of {rownum:rowdata}.
  this.mRowLRU = []; // Array of rownum, from least recently used to most recently used.
  this.mScrollPos = 0; // Last (raw) scroll position.
  this.mNumRows = 0; // Total number of rows.
  this.mQuery = null; // Query string producing the results.
  this.mQueryOrg = null; // Originally-specified query (especially for insert/update/create tracking).
  this.invokeCB = function(_pFuncName, _pArgs) { if (undefined != pCallbacks && _pFuncName in pCallbacks) pCallbacks[_pFuncName].apply(null, _pArgs); }
  var lDefaultOptions = {showPID:true, showOtherProps:true, autoSelect:false};
  this.getOption = function(_pOptionName) { return (undefined != pOptions && _pOptionName in pOptions) ? pOptions[_pOptionName] : ((_pOptionName in lDefaultOptions) ? lDefaultOptions[_pOptionName] : null); }
  this.mAddPIDColumn = true; // Whether or not to add a afy:pinID column.
  this.mMouseOnTable = false;
  this.mUIContainer.mouseenter(function() { lThis.mMouseOnTable = true; });
  this.mUIContainer.mouseleave(function() { lThis.mMouseOnTable = false; });
  this.mQrtVScroller.scroll(function() { lThis._onScroll(this.scrollTop); });
  this.mQrtHScroller.scroll(function() { lThis.mQrtContainer.scrollLeft(this.scrollLeft); });
  var lOnWheel = function(e) { if (!lThis.mMouseOnTable) { return; } var _lV = ('wheelDelta' in e ? -e.wheelDelta : e.detail); var _lDelta = (_lV > 0 ? lThis.mQrtVSNominalRowHeight : -lThis.mQrtVSNominalRowHeight); var _lNewPos = $(lThis.mQrtVScroller).scrollTop() + _lDelta; lThis.mQrtVScroller.scrollTop(_lNewPos); lThis.mQrtVScroller.scroll(); }
  var lOnResize = function() { lThis._setNumRows(lThis.mNumRows); lThis._onScroll(lThis.mScrollPos); }; // To avoid half-empty pages when the display grows.
  var lScrollOnMobile = new ScrollOnMobile(lThis.mUIContainer, {x:lThis.mQrtHScroller, y:lThis.mQrtVScroller});
  var lManageWindowEvents =
    function(_pOn)
    {
      var _lFunc = _pOn ? window.addEventListener : window.removeEventListener;
      _lFunc('mousewheel', lOnWheel, true);
      _lFunc('DOMMouseScroll', lOnWheel, true);
      if (_pOn)
      {
        $(window).resize(lOnResize);
        lScrollOnMobile.activate();
      }
      else
      {
        $(window).unbind('resize', lOnResize);
        lScrollOnMobile.deactivate();
      }
    }
  this.onActivateTab = function() { lManageWindowEvents(true); }
  this.onDeactivateTab = function() { lManageWindowEvents(false); }
  lManageWindowEvents(true);
}
QResultTable.sQrtIndex = 0;
QResultTable.PAGESIZE = 50; // Review: Fine-tune this...
QResultTable.CACHE_SIZE = 20 * QResultTable.PAGESIZE; // Note: Must be at least 2*PAGESIZE, to work with internal logic.
QResultTable.prototype.populate = function(pQuery)
{
  var lThis = this;
  this.mQueryOrg = pQuery;
  if (undefined == pQuery || 0 == pQuery.length)
  {
    this.mQuery = null;
  }
  else if (undefined == pQuery.match(/^\s*select/i))
  {
    // For insert/update/create-class, just run the query once.
    this.mQuery = null;
    var lOnResult = function(_pJson) { lThis._setNumRows(_pJson.length); lThis._recordRows(_pJson, 0); lThis._onScroll(0); };
    afy_query(pQuery, new QResultHandler(lOnResult, null, null));
  }
  else
  {
    // For select, count how many pins are expected for pQuery, and then proceed page by page.
    this.mQuery = pQuery;
    var lOnCount = function(_pJson) { lThis._setNumRows(parseInt(_pJson)); lThis._onScroll(0); };
    afy_query(this.mQuery, new QResultHandler(lOnCount, null, null), {countonly:true});
  }
}
QResultTable.prototype._onScroll = function(pPos)
{
  // See if our cache can satisfy the request.
  var lThis = this;
  this.mScrollPos = pPos;
  var lStartPos = Math.floor(pPos / this.mQrtVSNominalRowHeight);
  var lEndPos = Math.min(lStartPos + QResultTable.PAGESIZE, this.mNumRows);
  for (var iR = lStartPos; iR < lEndPos && (String(iR) in this.mRowCache); iR++);
  if (iR >= lEndPos)
  {
    // If yes, then refresh the UI and we're done.
    setTimeout(function() { lThis._fillTableUI(lThis.mCurTable, pPos); }, 20);
    this.mCurTable = 1 - this.mCurTable;
    return;
  }

  // Otherwise, query a page.
  if (undefined == this.mQuery)
    { alert("Unexpectedly trying to fetch more results for: " + this.mQueryOrg + " (" + lStartPos + "-" + lEndPos + ")"); return; }
  if (iR == lStartPos && iR > 0)
  {
    // When scrolling upward, or seeking at a random point, fetch up to half a page upward (and the rest downward).
    var lNewStart = Math.max(0, lStartPos - Math.floor(QResultTable.PAGESIZE / 2));
    for (--iR; iR > lNewStart && !(String(iR) in this.mRowCache); iR--);
  }
  var lOnPage =
    function(_pJson, _pUserData)
    {
      if (undefined == _pJson)
        return;
      lThis._recordRows(_pJson, _pUserData.offset);
      if (_pUserData.pos == lThis.mScrollPos)
        lThis._onScroll(_pUserData.pos);
      if (undefined != lThis.mQuery.match(/^\s*create\s*class/i))
        { populate_classes(); }
    };
  afy_query(this.mQuery, new QResultHandler(lOnPage, null, {offset:iR, pos:pPos}), {limit:QResultTable.PAGESIZE, offset:iR});
}
QResultTable.prototype._setNumRows = function(pNum)
{
  this.mNumRows = pNum;
  var lPhysH = this.mQrtContainer.height();
  var lTotH = lPhysH + this.mQrtVSNominalRowHeight * (pNum - 1);
  this.mQrtVScrollerContent.height(lTotH);
  this.mQrtVScroller.scrollTop(0);
}
QResultTable.prototype._initTables = function(pJson)
{
  if (this.mInitialized)
    return;

  // Determine the column layout (from initial data/page).
  this.mClassProps = {};
  this.mCommonProps = {};
  var lCommonProps = {};
  var lClass = null;
  if (this.mClassName)
  {
    lClass = function(_pN){ for (var i = 0; null != AFY_CONTEXT.mClasses && i < AFY_CONTEXT.mClasses.length; i++) { if (AFY_CONTEXT.mClasses[i]["afy:objectID"] == _pN) return AFY_CONTEXT.mClasses[i]; } return null; }(this.mClassName);
    for (var iProp in lClass["afy:properties"])
    {
      var lPName = lClass["afy:properties"][iProp];
      this.mClassProps[lPName] = 1;
    }
  }
  this.mAddPIDColumn = false;
  for (var i = 0; i < pJson.length; i++)
  {
    var lPin = (pJson[i] instanceof Array || pJson[i][0] != undefined) ? pJson[i][0] : pJson[i];
    for (var iProp in lPin)
    {
      if (iProp == "id" || iProp == "afy:pinID") { this.mAddPIDColumn = this.getOption('showPID'); continue; }
      if (iProp in this.mClassProps) continue;
      if (iProp in lCommonProps) { lCommonProps[iProp] = lCommonProps[iProp] + 1; continue; }
      lCommonProps[iProp] = 1;
    }
  }
  
  for (var iProp in lCommonProps)
  {
    if (lCommonProps[iProp] < (pJson.length / 2)) continue; // Only keep properties that appear at least in 50% of the results.
    this.mCommonProps[iProp] = 1;
  }

  // Initialize the two tables (for double-buffering).
  for (var iT = 0; iT < this.mTables.length; iT++)
    this._initTableUI(iT);

  this.mInitialized = true;
}
QResultTable.prototype._recordRows = function(pQResJson, pOffset)
{
  if (undefined == pQResJson)
    return;
  var lJson = pQResJson;

  // Initialize upon receiving the first batch of results,
  // in order to be able to gather "common" properties, based on that first batch.
  this._initTables(lJson);

  // Throw away least-recently-used items from the cache, if necessary.
  while (this.mRowLRU.length + lJson.length > QResultTable.CACHE_SIZE)
    delete this.mRowCache[String(this.mRowLRU.splice(0, 1))];
  
  // Create the rows.
  for (var i = 0; i < lJson.length; i++)
  {
    // For now, if an element of the result is a list (result from a JOIN), just take the leftmost pin.
    // When the kernel behavior stabilizes with respect to the structure and contents of JOIN results,
    // we can do more.
    var lPin = (lJson[i] instanceof Array || lJson[i][0] != undefined) ? lJson[i][0] : lJson[i];
    var lK = String(pOffset + i);
    if (lK in this.mRowCache)
      this._removeFromLRU(pOffset + i);
    this.mRowCache[lK] = {pin:lPin};
    this.mRowLRU.push(pOffset + i);
  }
}
QResultTable.prototype._initTableUI = function(pWhich)
{
  // Clear the table.
  var lT = this.mTables[pWhich];
  lT.empty();

  // Create the column headers (PID, class props, common props, other props).
  // REVIEW: We could decide to color-code the sections (class vs common vs other).
  var lHead = $("<thead />").appendTo(lT);
  var lHeadR = $("<tr />").appendTo(lHead);
  if (this.mAddPIDColumn)
    lHeadR.append($("<th class='qrt_table_th' align=\"left\">afy:pinID</th>"));
  var lClass = null;
  for (var iProp in this.mClassProps)
    lHeadR.append($("<th class='qrt_table_th' align=\"left\">" + iProp + "</th>"));
  for (var iProp in this.mCommonProps)
    lHeadR.append($("<th class='qrt_table_th' align=\"left\">" + iProp + "</th>"));
  if (this.getOption('showOtherProps'))
    lHeadR.append($("<th class='qrt_table_th' align=\"left\">Other Properties</th>"));
  $("<tbody />").appendTo(lT);
}
QResultTable.prototype._fillTableUI = function(pWhich, pPos)
{
  // Use the display height as a way to add the least number of rows possible.
  var lCt = this.mTables[pWhich];
  var lHt = lCt.parent().height();
  var lWt = lCt.parent().width();

  // Remove and recreate the offscreen-table's body.
  // Review: Is it this content replacement technique that somehow confuses the table's selected row?
  lCt.children("tbody").each(function(_pI, _pE) { $(_pE).remove(); });
  $("<tbody />").appendTo(lCt);
  this.mCurRow = null;

  // Add the required rows.
  // Note: We don't sum up the height of individual rows, because the layout engine can make them change as new rows are inserted.
  var lAccH = lCt.height();
  var lStartPos = Math.floor(pPos / this.mQrtVSNominalRowHeight);
  var lEndPos = Math.min(lStartPos + QResultTable.PAGESIZE, this.mNumRows);
  var lSuccess = true;
  for (var iR = lStartPos; iR < lEndPos && ((0 == lHt && undefined == this.mQuery) || lAccH < lHt); iR++, lAccH = lCt.height())
  {
    var lK = String(iR);
    if (!(lK in this.mRowCache)) { lSuccess = false; break; }
    this._removeFromLRU(iR);
    this._addRowUI(pWhich, this.mRowCache[String(iR)].pin);
    this.mRowLRU.push(iR);
  }
  if (!lSuccess)
    { myLog("Couldn't retrieve data in cache"); return; }

  // Hide the vertical scroller, if there aren't enough results.
  // Hack:
  //   The lNormWidth calculation is an approximation, meant to deal with the fact that
  //   a native scroller's physical dimension can't be evaluated precisely (for any zoom level).
  //   This adjustment is required because css pixels are zoomed (while native scrollers aren't);
  //   otherwise the browser sometimes chooses to hide the scroll bars (when zoomed out).
  //   As far as I can tell, this touches an extremely messy aspect of browser coordinate systems.
  // Note:
  //   In ie the scrollbars are scaled along with browser zoom.
  var lNormWidth = ("msie" in $.browser && $.browser["msie"]) ? 20 : Math.round(30 * screen.width / 1800);
  var lNWs = "" + lNormWidth + "px";
  if (0 == pPos && iR <= lEndPos && lAccH < lHt)
  {
    this.mQrtVScroller.css("display", "none");
    this.mQrtContainer.css("right", "0px");
    this.mQrtHScroller.css("right", "0px");
  }
  else
  {
    this.mQrtVScroller.css("display", "block");
    this.mQrtVScroller.css("width", lNWs);
    this.mQrtContainer.css("right", lNWs);
    this.mQrtHScroller.css("right", lNWs);
  }

  // Hide the horizontal scroller, unless necessary.
  if (lCt.width() <= lWt)
  {
    this.mQrtHScroller.css("display", "none");
    this.mQrtContainer.css("bottom", "0px");
    this.mQrtVScroller.css("bottom", lNWs); // Note: Normally this would be 0px, but because we hide/show the horizontal scroller on a page-by-page basis, I want to avoid having the downward scrolling arrow move...
  }
  else
  {
    this.mQrtHScrollerContent.width(lCt.width());
    this.mQrtHScroller.css("display", "block");
    this.mQrtHScroller.css("height", lNWs);
    this.mQrtContainer.css("bottom", lNWs);
    this.mQrtVScroller.css("bottom", lNWs);
  }

  // Swap visibility.
  // Note: Using 'visibility' instead of 'display' allows to obtain row heigths while building the off-screen version.
  this.mTables[1 - pWhich].css("visibility", "hidden");
  lCt.css("visibility", "visible");
}
QResultTable.prototype._addRowUI = function(pWhich, pPin)
{
  // Create a new row and bind mouse interactions.
  var lThis = this;
  var lBody = this.mTables[pWhich].children("tbody");
  var lRowCountBefore = lBody.children().length;
  var lShortPid = 'id' in pPin ? trimPID(pPin['id']) : ('afy:pinID' in pPin ? trimPID(pPin['afy:pinID']['$ref']) : null);
  var lRow = $("<tr id=\"" + lShortPid + "\"/>").appendTo(lBody);
  lRow.mouseover(function(){$(this).addClass("highlighted");});
  lRow.mouseout(function(){$(this).removeClass("highlighted");});
  lRow.click(function(){if (undefined != lThis.mCurRow) {lThis.mCurRow.removeClass("selected"); lThis.mCurRow = null;} var _lId = $(this).attr("id"); lThis.invokeCB('onPinClick', [_lId == 'null' ? null : _lId]); $(this).addClass("selected"); lThis.mCurRow = $(this);});
  if (0 == lRowCountBefore && this.getOption('autoSelect'))
  {
    lRow.addClass("selected"); this.mCurRow = lRow;
    this.invokeCB('onPinClick', [lShortPid]);
  }
  var lRefs = {};

  // Create the first column.
  if (this.mAddPIDColumn)
    lRow.append($("<td>@" + lShortPid + "</td>"));

  // Create the class-related columns, if any.
  for (var iProp in this.mClassProps)
    { lRow.append($("<td>" + this._createValueUI(pPin[iProp], lRefs, lShortPid + "rqt" + pWhich) + "</td>")); }

  // Create the common props columns, if any.
  for (var iProp in this.mCommonProps)
    { lRow.append($("<td>" + (iProp in pPin ? this._createValueUI(pPin[iProp], lRefs, lShortPid + "rqt" + pWhich) : "") + "</td>")); }

  // Create the last column (all remaining properties).
  if (this.getOption('showOtherProps'))
  {
    lOtherProps = $("<p />");
    for (var iProp in pPin)
    {
      if (iProp == "id" || iProp == "afy:pinID") continue;
      if (iProp in this.mClassProps) continue;
      if (iProp in this.mCommonProps) continue;
      lOtherProps.append($("<span class='afypropname'>" + iProp + "</span>"));
      lOtherProps.append($("<span>:" + this._createValueUI(pPin[iProp], lRefs, lShortPid + "rqt" + pWhich) + "  </span>"));
    }
    var lOPD = $("<td />");
    lOPD.append(lOtherProps);
    lRow.append(lOPD);
  }

  // Bind mouse interactions for references.
  for (iRef in lRefs)
    { $("#" + iRef).click(function(){ lThis.invokeCB('onPinClick', [$(this).text().replace(/^@/, "")]); return false;}); }

  return lRow;
}
QResultTable.prototype._removeFromLRU = function(pKey)
{
  for (var iLRU = 0; iLRU < this.mRowLRU.length; iLRU++)
    if (this.mRowLRU[iLRU] == pKey) { this.mRowLRU.splice(iLRU, 1); break; }
}
QResultTable.createValueUI = function(pProp, pRefs, pRefPrefix)
{
  if (typeof(pProp) != "object")
    { return pProp; }
  var lFirstElm;
  for (lFirstElm in pProp) break;
  // Reference.
  if (lFirstElm == "$ref")
  {
    var lShortRef = trimPID(pProp[lFirstElm]);
    pRefs[pRefPrefix + lShortRef] = true;
    return "<a id=\"" + pRefPrefix + lShortRef + "\" href=\"#" + lShortRef + "\">@" + lShortRef + "</a>";
  }
  // Collection (eid).
  else if (!isNaN(parseInt(lFirstElm)))
  {
    var lElements = new Array();
    for (var iElm in pProp)
      { lElements.push(QResultTable.createValueUI(pProp[iElm], pRefs, pRefPrefix)); }      
    return "{" + lElements.join(",") + "}";
  }
  // VT_STRUCT/...
  // Review: Would be nice to also expose (as links) references buried into these VT_STRUCT.
  else
    return myStringify(pProp);
}
QResultTable.prototype._createValueUI = QResultTable.createValueUI;

function pin_info_handler(pWidget)
{
  var lThis = this;
  this._handler = function(pPID)
  {
    get_pin_info(
      pPID,
      function(_pInfo)
      {
        pWidget.empty();

        // Class info.
        if (0 == _pInfo.classes.length)
          _pInfo.classes.push("unclassified pin");
        $("<p>PIN @" + _pInfo.pid + " IS A " + _pInfo.classes.join(",") + "</p>").appendTo(pWidget);

        // Data info.
        var lRefs = {};
        var lTxt = $("<p />");
        for (iProp in _pInfo.data)
        {
          if (iProp == "id" || iProp == "afy:pinID") continue;
          lTxt.append($("<span class='afypropname'>" + iProp + "</span>"));
          lTxt.append($("<span>:" + QResultTable.createValueUI(_pInfo.data[iProp], lRefs, pPID + "refdet") + "  </span>"));
        }
        pWidget.append(lTxt);
        for (iRef in lRefs)
          { $("#" + iRef).click(function(){lThis._handler($(this).text().replace(/^@/, "")); return false;}); }
      });
  };
  return lThis._handler;
}
