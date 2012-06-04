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
 * NavTabs.
 * Interprets all <li> nodes of the #nav section as tabs;
 * expects each to contain an <a> anchor,
 * with href pointing to the <div> that defines the tab's contents
 * (super-simplified tab system, not dependent on jquery-ui).
 */
function NavTabs()
{
  var lTabs = [] // An array of {name:, anchor:, content:}.
  var lTabContentFromName = function(_pName) { return $("#" + _pName); }
  var lTabNameFromA = function(_pAnchor) { return _pAnchor.toString().split('#').pop(); }
  var lFindTab = function(_pName) { for (var _i = 0; _i < lTabs.length; _i++) if (_pName == lTabs[_i].name) { return lTabs[_i]; } return null; }
  var lOnTab =
    function(_pEvent)
    {
      // Hide all tabs.
      $.each(lTabs, function(__pI, __pE) { __pE.content.css("display", "none"); var __lImg = $(__pE.anchor).children("img"); if (__lImg.hasClass("tab-selected")) { __pE.content.trigger("deactivate_tab"); __lImg.removeClass("tab-selected"); } });
      // Display the selected tab.
      var _lTargetA = $(_pEvent.target).parent()[0];
      var _lTab = lTabContentFromName(lTabNameFromA(_lTargetA));
      $(_lTargetA).children("img").addClass("tab-selected");
      _lTab.css("display", "block");
      _lTab.trigger("activate_tab");
    }
  // For each <li> of #nav, record it as a tab in lTabs, and bind lOnTab to the click event.
  $("#nav li").each(
    function(_pI, _pE)
    {
      var _lAnchor = $("a", _pE)[0];
      var _lTab = {name:lTabNameFromA(_lAnchor), anchor:_lAnchor};
      _lTab.content = lTabContentFromName(_lTab.name);
      lTabs.push(_lTab);
      $("img", _lAnchor).each(
        function(__pI, __pE)
        {
          $(__pE).click(lOnTab);
          $(__pE).hover(function() { $(this).addClass("tab-highlighted"); }, function() { $(this).removeClass("tab-highlighted"); });
          bindTooltip($(__pE), $("#tooltip_" + _lTab.name).text());
        });
    });
  // Select the first tab initially (either from the url, if one is specified, or just by index, otherwise).
  var lLoadedUrl = location.href.split('#');
  var lDone = false;
  while (lLoadedUrl.length > 1 && !lDone)
  {
    var lTf = lFindTab(lLoadedUrl.pop());
    if (undefined != lTf && 'anchor' in lTf)
      { lOnTab({target:$("img", lTf.anchor)}); lDone = true; }
  }
  if (!lDone)
    lOnTab({target:$("#nav img")[0]});
}

/**
 * QResultTable.
 * Deals with infinitely long results, using pagination and special scollbars.
 * Contains at least 2 columns: PID, Other Properties.
 * When the query is on a class (or eventually join etc.), adds more columns.
 * Goal: improve readability by showing common properties, and also reduce waste of space.
 */
gQrtIndex = 0;
function QResultTable(pContainer, pClassName)
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
  this.mQrtIndex = gQrtIndex++;
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
  this.mAddPIDColumn = true; // Whether or not to add a afy:pinID column.
  this.mQrtVScroller.scroll(function() { lThis._onScroll(this.scrollTop); });
  this.mQrtHScroller.scroll(function() { lThis.mQrtContainer.scrollLeft(this.scrollLeft); });
  var lOnWheel = function(e) { var _lV = ('wheelDelta' in e ? -e.wheelDelta : e.detail); var _lDelta = (_lV > 0 ? lThis.mQrtVSNominalRowHeight : -lThis.mQrtVSNominalRowHeight); var _lNewPos = $(lThis.mQrtVScroller).scrollTop() + _lDelta; lThis.mQrtVScroller.scrollTop(_lNewPos); lThis.mQrtVScroller.scroll(); }
  var lOnResize = function() { lThis._setNumRows(lThis.mNumRows); lThis._onScroll(lThis.mScrollPos); }; // To avoid half-empty pages when the display grows.
  var lManageWindowEvents =
    function(_pOn)
    {
      var _lFunc = _pOn ? window.addEventListener : window.removeEventListener;
      _lFunc('mousewheel', lOnWheel, true);
      _lFunc('DOMMouseScroll', lOnWheel, true);
      if (_pOn)
        $(window).resize(lOnResize);
      else
        $(window).unbind('resize', lOnResize);
    }
  this.onActivateTab = function() { lManageWindowEvents(true); }
  this.onDeactivateTab = function() { lManageWindowEvents(false); }
  lManageWindowEvents(true);
}
QResultTable.PAGESIZE = 50; // Review: Fine-tune this...
QResultTable.CACHE_SIZE = 20 * QResultTable.PAGESIZE; // Note: Must be at least 2*PAGESIZE, to work with internal logic.
QResultTable.prototype.populate = function(pQuery)
{
  var lThis = this;
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
    { alert("Unexpected: no query specified, yet not enough results"); return; }
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
  this.mClassProps = new Object();
  this.mCommonProps = new Object(), lCommonProps = new Object();
  var lClass = null;
  if (this.mClassName)
  {
    lClass = function(_pN){ for (var i = 0; null != AFY_CONTEXT.mClasses && i < AFY_CONTEXT.mClasses.length; i++) { if (AFY_CONTEXT.mClasses[i]["afy:classID"] == _pN) return AFY_CONTEXT.mClasses[i]; } return null; }(this.mClassName);
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
      if (iProp == "id" || iProp == "afy:pinID") { this.mAddPIDColumn = true; continue; }
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
  var lShortPid = trimPID('id' in pPin ? pPin['id'] : ('afy:pinID' in pPin ? pPin['afy:pinID'] : null));
  var lRow = $("<tr id=\"" + lShortPid + "\"/>").appendTo(lBody);
  lRow.mouseover(function(){$(this).addClass("highlighted");});
  lRow.mouseout(function(){$(this).removeClass("highlighted");});
  lRow.click(function(){if (undefined != lThis.mCurRow) {lThis.mCurRow.removeClass("selected"); lThis.mCurRow = null;} on_pin_click($(this).attr("id")); $(this).addClass("selected"); lThis.mCurRow = $(this);});
  var lRefs = new Object();

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

  // Bind mouse interactions for references.
  for (iRef in lRefs)
    { $("#" + iRef).click(function(){on_pin_click($(this).text().replace(/^@/, "")); return false;}); }  
    
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
  for (var iElm in pProp)
  {
    if (iElm == "$ref")
    {
      var lShortRef = trimPID(pProp[iElm]);
      pRefs[pRefPrefix + lShortRef] = true;
      return "<a id=\"" + pRefPrefix + lShortRef + "\" href=\"#" + lShortRef + "\">@" + lShortRef + "</a>";
    }
    else if (!isNaN(parseInt(iElm)))
    {
      var lElements = new Array();
      for (iElm in pProp)
        { lElements.push(QResultTable.createValueUI(pProp[iElm], pRefs, pRefPrefix)); }      
      return "{" + lElements.join(",") + "}";
    }
    else { myLog("QResultTable.createValueUI: unexpected property: " + iElm); }
  }
}
QResultTable.prototype._createValueUI = QResultTable.createValueUI;

/**
 * BatchingSQL
 */
function BatchingSQL()
{
  var lThis = this;
  this.mQueryAreaQ = $("#query_area_q");
  this.mResultList = $("#result_area_selector");
  this.mResultPage = $("#result_area_page");
  this.mPages = null;
  $("#query_area_go").click(function() { lThis.go(); });
  $("#tab-batching").bind("activate_tab", function() { if (undefined != lThis.mPages) { for (var _i = 0; _i < lThis.mPages.length; _i++) if (undefined != lThis.mPages[_i].result) lThis.mPages[_i].result.onActivateTab(); } });
  $("#tab-batching").bind("deactivate_tab", function() { if (undefined != lThis.mPages) { for (var _i = 0; _i < lThis.mPages.length; _i++) if (undefined != lThis.mPages[_i].result) lThis.mPages[_i].result.onDeactivateTab(); } });
  this.mResultList.change(
    function()
    {
      var _lCurPage = $("#result_area_selector option:selected").index();
      $.each(lThis.mPages, function(_pI, _pE) { _pE.ui.css("display", "none"); });
      if (_lCurPage >= 0 && _lCurPage < lThis.mPages.length)
        lThis.mPages[_lCurPage].ui.css("display", "block");
    });
}
BatchingSQL.prototype.go = function()
{
  this.mResultList.empty();
  this.mResultPage.empty();
  this.mPages = new Array();
  var lThis = this;
  var lQueries = this.mQueryAreaQ.val().replace(/\n/g,"").replace(/;\s*$/, "").split(';');
  var lOnResults =
    function(_pJson)
    {
      if (0 == _pJson.length || (lQueries.length > 1 && lQueries.length < _pJson.length))
        return;
      var iQr = 0;
      for (var iQ = 0; iQ < lQueries.length; iQ++)
      {
        var _lPage = {ui:$("<div style='overflow:hidden; position:absolute; top:30px; width:100%; height:100%;'/>"), query:(lQueries[iQ] + ";"), result:null};
        var _lTxOp = (undefined != _lPage.query.match(/(\s*start\s*transaction\s*)|(\s*commit\s*)|(\s*rollback\s*)/i));
        if (_lTxOp) // Currently, txops don't produce any json result.
          _lPage.ui.append($("<p>ok</p>"));
        else
          _lPage.result = new QResultTable(_lPage.ui, null);
        AFY_CONTEXT.mQueryHistory.recordQuery(_lPage.query);
        lThis.mResultList.append($("<option>" + _lPage.query + "</option>"));
        lThis.mPages.push(_lPage);
        lThis.mResultPage.append(_lPage.ui);
        if (!_lTxOp)
        {
          var _lData = (1 == lQueries.length) ? _pJson : _pJson[iQr++];
          _lPage.result._setNumRows(_lData.length);
          _lPage.result._recordRows(_lData, 0);
          _lPage.result._onScroll(0);
        }
        _lPage.ui.css("display", "none");
      }
    };
  afy_batch_query(lQueries, new QResultHandler(lOnResults, function(_pError){ print("error:" + _pError[0].responseText); }), {sync:true});
  if (this.mPages.length > 0)
    this.mPages[0].ui.css("display", "block");
}

/**
 * Query History.
 * Stores a history of every query requested by the user (using persist.js),
 * and allows to navigate/reuse that history.
 * Note:
 *   At least for the time being, I decided not to store this history on the server,
 *   because I didn't want to spend time dealing with the security implications,
 *   and because I prefer to keep this tool as non-intrusive as possible.
 */
function QHistory(pContainer, pUIStore)
{
  var lThis = this;
  this.mStore = pUIStore;
  this.mTable = $("<table id='qhistorytable' width=\"100%\" />").appendTo(pContainer);
  $("#query_history_clear").click(function() { lThis.clearHistory(); });
  this._init();
}
QHistory.prototype._init = function()
{
  // Clear the table.
  this.mTable.empty();

  // Append the already existing rows.
  var lBody = $("<tbody id='qhistorybody' />").appendTo(this.mTable);
  var lThis = this;
  this._iterate(function(_pK, _pV) { if (undefined != _pV) lThis._addRow(_pK, _pV); });
}
QHistory.prototype._iterate = function(pHandler)
{
  // Note:
  //   On chrome, with localstorage, persist.js's iterate method appears not to work;
  //   this is a substitute implementation, based on our knowledge of our keys semantics;
  //   it replaces: this.mStore.iterate(pHandler);
  if (undefined == this.mStore)
    return;
  try
  {
    var lLastKey = this.mStore.get('hist_lastkey');
    if (undefined != lLastKey)
    {
      lLastKey = parseInt(lLastKey);
      for (var i = 1; i <= lLastKey; i++)
      {
        var lKey = 'hist_' + i.toString();
        var lVal = this.mStore.get(lKey);
        pHandler(lKey, lVal);
      }
    }
  }
  catch(e) { myLog("QHistory._init: " + e); }
}
QHistory.prototype._removeRow = function(pKey)
{
  try
  {
    this.mStore.remove(pKey);
    $("#" + pKey).remove();
  }
  catch(e) { myLog("QHistory._removeRow: " + e); }
}
QHistory.prototype._addRow = function(pKey, pValue)
{
  var lBody = $("#qhistorybody");
  var lRow = $("<tr id=\"" + pKey + "\"/>").appendTo(lBody);
  lRow.append($("<td>" + pValue + "</td>"));
  lRow.mouseover(function() { $(this).addClass("highlighted"); });
  lRow.mouseout(function() { $(this).removeClass("highlighted"); });
  lRow.click(function() { $("#query").val(pValue); return false; });
  var lThis = this;
  lRow.bind(
    "contextmenu", null,
    function(_pEvent)
    {
      var _lMenu = new CtxMenu();
      _lMenu.addItem($("#menuitem_qh_setquery").text(), function() { $("#query").val(pValue); }, null, true);
      _lMenu.addItem($("#menuitem_qh_remove").text(), function() { lThis._removeRow(pKey); });
      _lMenu.start(_pEvent.pageX, _pEvent.pageY);
      return false;
    });
}
QHistory.prototype.recordQuery = function(pQuery)
{
  if (undefined == this.mStore)
    return;

  // If this query is already in the history, don't add it again.
  // Notes:
  //   There appears to be no way to interrupt this iteration.
  //   Managing efficiently a LRU with this kind of storage would require additional gymnastics.
  var lAlreadyThere = false;
  try
  {
    this._iterate(function(_pK, _pV) { if (_pV == pQuery) lAlreadyThere = true; });
    if (lAlreadyThere)
      return;

    // Store it.
    var lCacheKey = (parseInt(this.mStore.get('hist_lastkey') || "0") + 1).toString();
    this.mStore.set('hist_' + lCacheKey, pQuery);
    this.mStore.set('hist_lastkey', lCacheKey);

    // Add it to the table.
    this._addRow('hist_' + lCacheKey, pQuery);
  }
  catch(e) { myLog("QHistory.recordQuery: " + e); }
}
QHistory.prototype.clearHistory = function()
{
  if (!window.confirm("Clear the query history?"))
    return;
  var lThis = this;
  var lHistKeys = [];
  try
  {
    this._iterate(function(_pK, _pV) { lHistKeys.push(_pK); });
    $.each(lHistKeys, function(_pI, _pE) { lThis.mStore.remove(_pE); });
    lThis.mStore.remove('hist_lastkey');
    $("#qhistorybody").empty();
  }
  catch(e) { myLog("QHistory.clearHistory: " + e); }
}

/**
 * Tutorial.
 * Manages the tutorial window and its input line.
 */
function Tutorial()
{
  var lThis = this;
  var lExecuteLine =
    function()
    {
      function _stringify(__pWhat, __pQuoteStrings) { return myStringify(__pWhat, {quoteStrings:__pQuoteStrings, lineBreaks:true}); }
      function _onPathsqlResult(__pJson) { print(__pJson); }
      function _pushTutInstr(__pLine) { lThis.mHistory.append($("<p class='tutorial_instructions'>" + __pLine + "</p>")); }
      function print(__pWhat) { lThis.mHistory.append($("<p class='tutorial_result'>" + _stringify(__pWhat, false) + "</p>")); }
      function pathsql(__pSql)
      {
        // Log in the query history.
        // WARNING:
        //   This proves to be catastrophically slow, and is so detrimental to the
        //   performance of the tutorial that I decided to forget about it.
        // AFY_CONTEXT.mQueryHistory.recordQuery(__pSql);

        var __lEvalResult = null;
        var __lOnPathsql = function(__pJson, __pD) { _onPathsqlResult(__pJson); __lEvalResult = __pJson; }

        // Note:
        //   It doesn't appear to be possible to rely on keep-alive for transactions, in all browsers.
        //   On the other hand, we would like to display the best performance possible (in the tutorial).
        //   Therefore, we provide this compromise, where operations of a transaction will not return any
        //   result synchronously.
        // Note:
        //   For the moment I'm not planning to use nested transactions in the tutorial,
        //   so I don't add complexity here to support them.
        if (undefined != lThis.mPendingTx)
        {
          lThis.mPendingTx.push(__pSql);
          if (__pSql.match(/\s*commit/i))
          {
            afy_batch_query(
              lThis.mPendingTx,
              new QResultHandler(
                function(__pJson, __pD){ lThis.mPendingTx = null; __lOnPathsql(__pJson, __pD); },
                function(__pError){ lThis.mPendingTx = null; print("error:" + __pError[0].responseText); }), {sync:true});
            return __lEvalResult;
          }
          else
            return {"note":"in the web console, results of operations in a transaction are returned upon commit"};
        }
        else if (__pSql.match(/\s*start\s*transaction/i))
        {
          lThis.mPendingTx = new Array();
          lThis.mPendingTx.push(__pSql);
          return {"note":"in the web console, results of operations in a transaction are returned upon commit"};
        }
        else
        {
          afy_query(afy_sanitize_semicolon(__pSql), new QResultHandler(__lOnPathsql, function(__pError){ print("error:" + __pError[0].responseText); }), {sync:true});
          return __lEvalResult;
        }
      }
      function q(__pSql) { return pathsql(__pSql); }
      function save(__pJson)
      {
        if (typeof(__pJson) != "object")
          { alert("This tutorial will only save objects (with named properties)."); return; }
        if (__pJson instanceof Array)
        {
          for (__i = 0; __i < __pJson.length; __i++)
            save(__pJson[__i]);
        }
        else
        {
          var __lQ = (undefined != __pJson.id) ? ("UPDATE @" + __pJson.id + " SET ") : "INSERT ";
          var __lArgs = []
          for (__iP in __pJson)
          {
            if (__iP == "id")
              continue;
            var __lV = __pJson[__iP];
            var __lArg = __iP + "=";
            switch (typeof(__lV))
            {
              case "boolean":
              case "number":
                __lArg += __lV;
                break;
              case "string":
                __lArg += "'" + escape(__lV) + "'";
                break;
              case "object":
                if (__lV instanceof Date)
                {
                  var __l2Digits = function(__pNum) { return (__pNum < 10 ? "0" : "") + __pNum; }
                  var __lDate2Str = function(__pDate) { return __pDate.getUTCFullYear().toString() + "-" + __l2Digits(1 + __pDate.getUTCMonth()) + "-" + __l2Digits(__pDate.getUTCDate()) + " " + __l2Digits(__pDate.getUTCHours()) + ":" + __l2Digits(__pDate.getUTCMinutes()) + ":" + __l2Digits(__pDate.getUTCSeconds()); }
                  __lArg += "TIMESTAMP'" + __lDate2Str(__lV) + "'";
                }
                else if (__lV instanceof Array)
                  __lArg += "{" + __lV.join(",") + "}"; // Review: very incomplete...
                else
                {
                  alert("This demo doesn't support the full range of object attributes, yet.");
                  __lArg = null;
                }
                break;
            }
            if (__lArg)
              __lArgs.push(__lArg);
          }
          __lQ = __lQ + __lArgs.join(",") + ";";
          __lRes = pathsql(__lQ);
          if (undefined == __pJson.id && __lRes.length > 0)
            __pJson.id = __lRes[0].id;
        }
      }
      function h()
      {
        $("#thetutorial #help div").each(function(_pI, _pE) { lThis.mHistory.append($("<p class='tutorial_help'>" + $(_pE).html() + "</p>")); });
      }
      function t()
      {
        $("#thetutorial #steps #step0 div").each(function(_pI, _pE) { _pushTutInstr($(_pE).html()); });
        lThis.mTutorialStep = 1;
      }
      function n()
      {
        var lNumSteps = $("#thetutorial #steps > div").size();
        if (lThis.mTutorialStep < lNumSteps)
        {
          lThis.mPendingTx = null; // Note: I need to figure out ASAP why mPendingTx is not always cleared properly on COMMIT (during the previous step); in the meantime, to eliminate the impact of this problem, I force-clear it when a new step starts.
          $("#thetutorial #steps #step" + lThis.mTutorialStep + " div").each(function(_pI, _pE) { _pushTutInstr($(_pE).html()); });
          if (lThis.mTutorialStep > 0)
          {
            var lQuickRunStep = lThis.mTutorialStep;
            var lQuickRunButton = $("<div class='tutorial_button_run'>paste &amp; run step " + lQuickRunStep + "</div>");
            lThis.mHistory.append(lQuickRunButton);
            lQuickRunButton.click(
              function()
              {
                lThis.mInput.val("");
                $("#thetutorial #steps #step" + lQuickRunStep + " .tutorial_step").each(
                  function(_pI, _pE) { lThis.mInput.val(lThis.mInput.val() + $(_pE).html().replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">")); });
                lExecuteLine();
              });
          }
          lThis.mTutorialStep++;
        }
        else
          _pushTutInstr($("#thetutorial #restart").html());
      }
      function step(__pStep)
      {
        if (__pStep < 0)
          return;
        var lNumSteps = $("#thetutorial #steps > div").size();
        lThis.mTutorialStep = Math.min(__pStep, lNumSteps);
        n();
      }
      function next() { n(); }
      var _lStmt = lThis.mInput.val().replace(/var/, ""); // Review: should we support var?
      if (_lStmt == "t") _lStmt = "t()";
      else if (_lStmt == "n") _lStmt = "n()";
      else if (_lStmt == "h") _lStmt = "h()";
      else if (_lStmt == "next") _lStmt = "n()";
      lThis.mPushInput();
      lThis.mStmtHistory.push(_lStmt);
      lThis.mStmtHistoryCursor = null;
      eval(_lStmt);
      lThis.mScroll();
    }
  this.mPendingTx = null;
  this.mInput = $("#tutorial_input");
  this.mHistory = $("#tutorial_history");
  this.mStmtHistory = new Array();
  this.mStmtHistoryCursor = null;
  this.mOnKey =
    function(_pEvent)
    {
      if (13 == _pEvent.keyCode) { lExecuteLine(); return; }
      if (0 == _pEvent.which)
      {
        if (38 == _pEvent.keyCode) // up (prev stmt in history)
        {
          lThis.mStmtHistoryCursor = (undefined == lThis.mStmtHistoryCursor) ? lThis.mStmtHistory.length - 1 : Math.max(lThis.mStmtHistoryCursor - 1, 0);
          lThis.mInput.val(lThis.mStmtHistory[lThis.mStmtHistoryCursor]);
        }
        else if (40 == _pEvent.keyCode) // up (next stmt in history)
        {
          lThis.mStmtHistoryCursor = (undefined == lThis.mStmtHistoryCursor) ? lThis.mStmtHistory.length - 1 : Math.min(lThis.mStmtHistoryCursor + 1, lThis.mStmtHistory.length);
          lThis.mInput.val(lThis.mStmtHistoryCursor < lThis.mStmtHistory.length ? lThis.mStmtHistory[lThis.mStmtHistoryCursor] : "");
        }
      }
    } // if 0 == pEvent.which ... 38:up 40:down
  this.mInput.keypress(this.mOnKey);
  this.mPushInput = function() { lThis.mHistory.append($("<p class='tutorial_stmt'>&gt;" + lThis.mInput.val().replace(/<br>/g, "&lt;br&gt;") + "</p>")); lThis.mInput.val(''); }
  this.mScroll = function() { $("#tutorial_area").scrollTop(lThis.mHistory.height() + 2 * $("#tutorial_input").height() - $("#tutorial_area").height()); $("#tutorial_area").scrollLeft(0); }
  this.mTutorialStep = 0;
  var lCurPoint = {x:0, y:0};
  var lAnchorPoint = {x:0, y:0};
  $("#tutorial_area").mousemove(function(e) { lCurPoint.x = e.pageX; lCurPoint.y = e.pageY; });
  $("#tutorial_area").mousedown(function() { lAnchorPoint.x = lCurPoint.x; lAnchorPoint.y = lCurPoint.y; });
  $("#tutorial_area").mouseup(function() { if (Math.abs(lCurPoint.x - lAnchorPoint.x) < 5 && Math.abs(lCurPoint.y - lAnchorPoint.y) < 5) lThis.mInput.focus(); }); // Give focus to the input line, but only if the mouse hasn't moved significantly (otherwise, let it do its standard job, e.g. for selection and copy&paste).
  $("#tab-tutorial").bind("activate_tab", function() { lThis.mInput.focus(); });
}

/**
 * Histogram.
 * Displays histograms of specified properties in specified contexts,
 * using the store's native support.
 */
function histo_LayoutCtx(pQuery, pOptions/*{draw:func}*/)
{
  var lGetOption = function(_pWhat, _pDefault) { return (undefined != pOptions && _pWhat in pOptions) ? pOptions[_pWhat] : _pDefault; }
  var lThis = this;
  this.query = pQuery;
  this.draw = lGetOption('draw', null);
  this.result = {};
  this.range = {min:999999, max:1};
}
function histo_LayoutEngine()
{
  var lOnResult =
    function(_pJson, _pLayoutCtx)
    {
      if (undefined != _pJson)
      {
        _pLayoutCtx.result = _pJson[0]["afy:value"];
        for (var _iE in _pLayoutCtx.result)
        {
          var _lV = parseInt(_pLayoutCtx.result[_iE]["afy:value"]);
          if (_lV < _pLayoutCtx.range.min)
            _pLayoutCtx.range.min = _lV;
          if (_lV > _pLayoutCtx.range.max)
            _pLayoutCtx.range.max = _lV;
        }
      }
      else
        _pLayoutCtx.result = null;
      _pLayoutCtx.draw();
    }
  this.doLayout = function(_pLayoutCtx) { afy_query(_pLayoutCtx.query, new QResultHandler(lOnResult, null, _pLayoutCtx)); }
}
function Histogram()
{
  var lThis = this;
  if ("msie" in $.browser && $.browser["msie"])
    { var lV = $.browser.version.match(/^([0-9]+)\./); if (undefined == lV || parseInt(lV[0]) < 9) { disableTab("#tab-histogram"); return; } }
  var l2dCtx;
  try { l2dCtx = document.getElementById("histo_area").getContext("2d"); } catch(e) { myLog("html5 canvas not supported"); disableTab("#tab-histogram"); return; }
  var lVPHeight = $("#histo_area").height();
  var lPanZoom = new PanZoom($("#histo_area"), 1.0);
  var lLayoutEngine = new histo_LayoutEngine();
  var lLayoutCtx = null;
  var lQClass = null, lQProp = null;
  var lDoDraw = // The rendering engine.
    function()
    {
      // Reset transfos and background.
      l2dCtx.setTransform(1, 0, 0, 1, 0, 0);
      l2dCtx.fillStyle = "#e4e4e4";
      l2dCtx.fillRect(0, 0, l2dCtx.canvas.width, l2dCtx.canvas.height);
      if (undefined == lLayoutCtx)
        return;

      // Apply current pan&zoom.
      l2dCtx.scale(lPanZoom.zoom, lPanZoom.zoom);
      l2dCtx.translate(lPanZoom.pan.x, lPanZoom.pan.y);

      // Draw the histogram.
      if (undefined != lLayoutCtx && undefined != lLayoutCtx.result)
      {
        var _lHUnit = Math.floor(lVPHeight / lLayoutCtx.range.max);
        var _lX = 0;
        for (var _iE in lLayoutCtx.result)
        {
          var _lVal = parseInt(lLayoutCtx.result[_iE]["afy:value"]);
          var _lHeight = _lHUnit * _lVal;
          l2dCtx.fillStyle = "#20a0ee";
          l2dCtx.fillRect(_lX, lVPHeight - 2 - _lHeight, 20, _lHeight);
          l2dCtx.fillStyle = "#444";
          l2dCtx.rotate(-0.5 * Math.PI);
          l2dCtx.fillText(myStringify(lLayoutCtx.result[_iE]["afy:key"]) + " (" + _lVal + ")", - lVPHeight + 5, _lX + 14);
          l2dCtx.rotate(0.5 * Math.PI);
          _lX += 25;
        }
      }
    }
  var lDoLayout =
    function()
    {
      lLayoutCtx = new histo_LayoutCtx(afy_sanitize_semicolon($("#histo_query").text()), {draw:lDoDraw});
      lLayoutEngine.doLayout(lLayoutCtx);
    }
  var lDoRefresh = function() { lDoLayout(); }
  var lDoUpdateQuery =
    function()
    {
      if (undefined == lQClass || undefined == lQProp)
        { $("#histo_query").text("Please select a class and a property..."); return; }
      $("#histo_query").text(afy_with_qname_prefixes("SELECT HISTOGRAM(" + lQProp + ") FROM " + lQClass));
      lDoRefresh();
    }
  var lDoUpdateProperties =
    function()
    {
      var lOnPage =
        function(_pJson, _pUserData)
        {
          if (undefined != _pJson)
          {
            var __lProps = {};
            for (var __iPin = 0; __iPin < _pJson.length; __iPin++)
              for (var __iProp in _pJson[__iPin])
                __lProps[__iProp] = 1;
            delete __lProps.id;
            $("#histo_property").empty();
            for (var __iProp in __lProps)
              $("#histo_property").append($("<option value='" + __iProp + "'>" + __iProp + "</option>"));
            lQProp = $("#histo_property option:selected").val();
          }
          lDoUpdateQuery();
        };
      afy_query("SELECT FROM " + lQClass, new QResultHandler(lOnPage, null, null), {limit:20, offset:0});
    }
  var lDoUpdateClasses = function()
  {
    $("#histo_class").empty();
    $("#histo_class").append("<option value='*'>*</option>");
    if (undefined == AFY_CONTEXT.mClasses)
      lQClass = "*";
    else
    {
      for (var _iC = 0; _iC < AFY_CONTEXT.mClasses.length; _iC++)
      {
        var _lCn = AFY_CONTEXT.mClasses[_iC]["afy:classID"];
        $("#histo_class").append($("<option value=\"" + _lCn + "\">" + _lCn + "</option>"));
      }
      lQClass = $("#histo_class option:selected").val();
    }
    lDoUpdateProperties();
  }

  // Pan & Zoom etc.
  $("#histo_area").mousemove(function(e) { lPanZoom.onMouseMove(e); if (lPanZoom.isButtonDown()) lDoDraw(); });
  $("#histo_area").mousedown(function(e) { lPanZoom.onMouseDown(); });
  $("#histo_area").mouseup(function() { lPanZoom.onMouseUp(); });
  $("#histo_area").mouseout(function() { lPanZoom.onMouseUp(); });
  $("#histo_area").mouseleave(function() { lPanZoom.onMouseUp(); });
  var lOnWheel = function(e) { lPanZoom.onWheel(e); lDoDraw(); return false; }
  var lManageWindowEvents =
    function(_pOn)
    {
      var _lFunc = _pOn ? window.addEventListener : window.removeEventListener;
      _lFunc('mousewheel', lOnWheel, true);
      _lFunc('DOMMouseScroll', lOnWheel, true);
      _lFunc('keydown', lPanZoom.onKeyDown, true);
      _lFunc('keyup', lPanZoom.onKeyUp, true);
    }

  // Other interactions.
  $("#histo_class").change(function() { lQClass = $("#histo_class option:selected").val(); lDoUpdateProperties(); });
  $("#histo_property").change(function() { lQProp = $("#histo_property option:selected").val(); lDoUpdateQuery(); });
  $("#histo_go").click(function() { lDoRefresh(); return false; });
  $("#tab-histogram").bind("activate_tab", function() { lManageWindowEvents(true); populate_classes(function() { lDoUpdateClasses(); lDoDraw(); }); });
  $("#tab-histogram").bind("deactivate_tab", function() { lManageWindowEvents(false); });

  // Initialize the canvas's dimensions (critical for rendering quality).
  $("#histo_area").attr("width", $("#histo_area").width());
  $("#histo_area").attr("height", $("#histo_area").height());
}

/**
 * Document entry point (by callback).
 */
$(document).ready(
  function()
  {
    // Home/logo button.
    $("#gh_logo_img").hover(function() { $(this).addClass("logo-highlighted"); }, function() { $(this).removeClass("logo-highlighted"); });
    $("#gh_logo_img").click(function() { window.location.href = 'http://' + location.hostname + ":" + location.port; });
    // Setup a client-side persistent memory.
    AFY_CONTEXT.mUIStore = new Persist.Store("Affinity Console Persistence");
    if (undefined != AFY_CONTEXT.mUIStore)
    {
      var lLastStoreIdent = AFY_CONTEXT.mUIStore.get('laststoreident');
      if (undefined != lLastStoreIdent)
        $("#storeident").val(lLastStoreIdent);
      var lLastStorePw = AFY_CONTEXT.mUIStore.get('laststorepw');
      if (undefined != lLastStorePw)
        $("#storepw").val(lLastStorePw);
    }
    // Setup hard-coded prefixes.
    var lAfy = 'http://www.affinitydb.org/builtin';
    AFY_CONTEXT.mDef2QnPrefix[lAfy] = 'afy';
    AFY_CONTEXT.mQnPrefix2Def['afy'] = lAfy;
    // Determine if the 2D-Map tab should be disabled. 
    if ("msie" in $.browser && $.browser["msie"])
      { var lV = $.browser.version.match(/^([0-9]+)\./); if (undefined == lV || parseInt(lV[0]) < 9) { disableTab("#tab-map"); } }
    // Setup the tutorial.
    new Tutorial();
    // Setup the histogram.
    new Histogram();
    // Setup the batching UI.
    new BatchingSQL();
    // Setup tab-dependent aspects of the basic console.
    // Note:
    //   For the moment, for simplicity, we refresh classes everytime we come back from another tab
    //   (where classes may have been created).
    // Note:
    //   This also allows to land on the tutorial page without emitting any query to the store upfront,
    //   which is nice in a setup where the front-end is hosted in a separate environment.
    $("#tab-basic").bind("activate_tab", function() { populate_classes(); if (undefined != AFY_CONTEXT.mLastQResult) { AFY_CONTEXT.mLastQResult.onActivateTab(); } $("#query").focus(); });
    $("#tab-basic").bind("deactivate_tab", function() { if (undefined != AFY_CONTEXT.mLastQResult) { AFY_CONTEXT.mLastQResult.onDeactivateTab(); } });
    // Setup the main navigational tab system.
    // Note: We set this up after the actual tabs, in order for them to receive the initial 'activate_tab'.
    AFY_CONTEXT.mNavTabs = new NavTabs();    
    // Setup the basic tooltips.
    bindAutomaticTooltips();
    // Setup static context menus.
    bindStaticCtxMenus();
    // Setup the persistent cache for the query history.
    AFY_CONTEXT.mQueryHistory = new QHistory($("#query_history"), AFY_CONTEXT.mUIStore);
    // Unless the deployment is local, don't show the administration tab.
    if (undefined == location.hostname.match(/(localhost|127\.0\.0\.1)/i))
      disableTab("#tab-config");
    // Setup the initial query string, if one was specified (used for links from doc to console).
    var lInitialQ = location.href.match(/query\=(.*?)((&.*)|(#.*)|\0)?$/i);
    if (undefined != lInitialQ && lInitialQ.length > 0)
      $("#query").val(unescape(lInitialQ[1]).replace(/\+/g, " "));
    var lInitialStoreId = location.href.match(/storeid\=(.*?)((&.*)|(#.*)|\0)?$/i);
    if (undefined != lInitialStoreId && lInitialStoreId.length > 0)
    {
      $("#storeident").val(unescape(lInitialStoreId[1]));
      $("#storepw").val("");
    }
    // UI callback for query form.
    $("#form").submit(function() {
      var lResultList = $("#result_table");
      lResultList.html("loading...");
      if ($("#result_pin pre").size() > 0) // If the contents of the #result_pin represent an error report from a previous query, clear it now; otherwise, let the contents stay there.
        $("#result_pin").empty(); 
      var lCurClassName = $("#classes option:selected").val();
      var lQueryStr = afy_sanitize_semicolon($("#query").val());
      var lClassName = (lQueryStr.indexOf(afy_without_qname(lCurClassName)) >= 0) ? lCurClassName : null;
      if ($("#querytype option:selected").val() == "query" && null == lQueryStr.match(/select\s*count/i))
      {
        if (null != AFY_CONTEXT.mLastQResult)
          { AFY_CONTEXT.mLastQResult.mAborted = true; }
        lResultList.empty();
        AFY_CONTEXT.mLastQResult = new QResultTable(lResultList, lClassName);
        AFY_CONTEXT.mLastQResult.populate(lQueryStr);
        AFY_CONTEXT.mQueryHistory.recordQuery(lQueryStr);
      }
      else
      {
        var lQuery = "query=" + afy_escape_with_plus(afy_with_qname_prefixes(lQueryStr)) + "&type=" + $("#querytype option:selected").val();
        $.ajax({
          type: "POST",
          url: DB_ROOT,
          dataType: "text",
          timeout: 10000,
          cache: false,
          global: false,
          data: lQuery,
          complete: function (e, xhr, s) {
            $("#result_table").html(hqbr(lQueryStr + "\n\n" + e.responseText + "\n" + xhr));
          },
          beforeSend : function(req) {
            req.setRequestHeader('Connection', 'Keep-Alive');
            var lStoreIdent = $("#storeident").val();
            var lStorePw = $("#storepw").val();
            if (lStoreIdent.length > 0) { req.setRequestHeader('Authorization', "Basic " + base64_encode(lStoreIdent + ":" + lStorePw)); }
          }
        });
      }
      return false;
    });
    // UI callbacks for interactions.
    $("#classes").change(on_class_change);
    $("#classes").dblclick(on_class_dblclick);
    $("#class_properties").change(on_cprop_change);
    $("#class_properties").dblclick(on_cprop_dblclick);
    // Review:
    //   For non-existing (new) stores, the policy used below is not ideal
    //   because if the user intends to create a password-protected store,
    //   he will have to specify the password first (otherwise populate_classes()
    //   will end up creating a store with whatever old [or nil] password was in #storepw).
    //   However, the console is primarily intended for navigation, and password-protected
    //   stores would be marginal in early exploratory experiments done in the console,
    //   so for the moment I prefer not to invest any time improving this.
    $("#storeident").change(function() { AFY_CONTEXT.mStoreIdent = this.val(); populate_classes(); if (undefined != AFY_CONTEXT.mUIStore) { AFY_CONTEXT.mUIStore.set('laststoreident', $("#storeident").val()); } });
    $("#storepw").change(function() { AFY_CONTEXT.mStorePw = this.val(); populate_classes(); if (undefined != AFY_CONTEXT.mUIStore) { AFY_CONTEXT.mUIStore.set('laststorepw', $("#storepw").val()); } });
  });

/**
 * String manips.
 */
function hq(s) {return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function hqbr(s) {return hq(s).replace(/\n/g,"<br/>").replace(/ /g,"&nbsp;");}

/**
 * Classes/properties UI.
 */
function populate_classes(pOnDone)
{
  get_classes(
    function(_pJson)
    {
      $("#classes").empty();
      $("#class_properties").empty();
      $("#class_doc").empty();
      $("#property_doc").empty();
      $("#qnames").empty();
      if (undefined == _pJson) { myLog("populate_classes: undefined _pJson"); return; }
      for (var i = 0; i < _pJson.length; i++)
      {
        var lCName = _pJson[i]["afy:classID"];
        var lOption = "<option value=\"" + lCName + "\">" + lCName + "</option>";
        $("#classes").append(lOption);
      }
      on_class_change();
      if (undefined != pOnDone)
        pOnDone(_pJson);
    });
}

function on_class_change()
{
  update_qnames_ui();

  var lCurClassName = $("#classes option:selected").val();
  var lCurClass = function(_pN){ for (var i = 0; null != AFY_CONTEXT.mClasses && i < AFY_CONTEXT.mClasses.length; i++) { if (AFY_CONTEXT.mClasses[i]["afy:classID"] == _pN) return AFY_CONTEXT.mClasses[i]; } return null; }(lCurClassName);
  if (undefined == lCurClass) return;
  $("#class_properties").empty();
  for (var iProp in lCurClass["afy:properties"])
  {
    var lPName = lCurClass["afy:properties"][iProp];
    var lOption = "<option value=\"" + lPName + "\">" + lPName + "</option>";
    $("#class_properties").append(lOption);
    // TODO: for each prop, show all the classes that are related directly with it; show docstring.
  }
  $("#property_doc").empty();

  var lClassDoc = $("#class_doc");
  lClassDoc.empty();
  lClassDoc.append($("<p><h4>predicate:</h4>&nbsp;" + lCurClass["afy:predicate"] + "<br/></p>"));
  
  if (AFY_CONTEXT.mFullIntrospection)
  {
    var lOnDocstringSuccess = function(_pJson) { if (undefined != _pJson) { lClassDoc.append("<h4>docstring:</h4>&nbsp;"+ _pJson[0][afy_with_qname("http://localhost/afy/property/1.0/hasDocstring")]); } }
    var lOnDocstring = new QResultHandler(lOnDocstringSuccess, function(){}, null);
    afy_query("SELECT * FROM \"http://localhost/afy/class/1.0/ClassDescription\"('" + afy_without_qname(lCurClassName) + "');", lOnDocstring, {keepalive:false});
  }
}

function on_class_dblclick()
{
  var lCurClassName = afy_sanitize_classname(afy_without_qname($("#classes option:selected").val()));
  $("#query").val("SELECT * FROM " + lCurClassName + ";");
}

function on_cprop_change()
{
  update_qnames_ui();
  var lCurPropName = $("#class_properties option:selected").val();
  var lPropDoc = $("#property_doc");
  lPropDoc.empty();
  if (AFY_CONTEXT.mFullIntrospection)
  {
    lPropDoc.append($("<p />"));
    var lOnDocstringSuccess = function(_pJson) { lPropDoc.append("<h4>docstring:</h4>&nbsp;"+ _pJson[0][afy_with_qname("http://localhost/afy/property/1.0/hasDocstring")]); }
    var lOnDocstring = new QResultHandler(lOnDocstringSuccess, function(){}, null);
    afy_query("SELECT * FROM \"http://localhost/afy/class/1.0/AttributeDescription\"('" + afy_without_qname(lCurPropName) + "') UNION SELECT * FROM \"http://localhost/afy/class/1.0/RelationDescription\"('" + lCurPropName + "');", lOnDocstring, {keepalive:false});
  }
}

function on_cprop_dblclick()
{
  var lCurPropName = afy_sanitize_classname(afy_without_qname($("#class_properties option:selected").val()));
  $("#query").val("SELECT * WHERE EXISTS(" + lCurPropName + ");");
}

function on_pin_click(pPID)
{
  update_qnames_ui();

  // Manage the row selection.
  if (undefined != AFY_CONTEXT.mSelectedPID)
  {
    if (pPID == AFY_CONTEXT.mSelectedPID)
      return;
    $("#" + AFY_CONTEXT.mSelectedPID).removeClass("selected");
  }
  AFY_CONTEXT.mSelectedPID = pPID;
  $("#" + AFY_CONTEXT.mSelectedPID).addClass("selected");

  // Update the selected PIN's information section.
  get_pin_info(
    pPID,
    function(_pInfo)
    {
      var lPinArea = $("#result_pin");
      lPinArea.empty();

      // Class info.
      if (0 == _pInfo.classes.length)
        _pInfo.classes.push("unclassified pin");
      lPinClasses = $("<p>PIN @" + _pInfo.pid + " IS A " + _pInfo.classes.join(",") + "</p>").appendTo(lPinArea);

      // Data info.
      var lRefs = new Object();
      var lTxt = $("<p />");
      for (iProp in _pInfo.data)
      {
        if (iProp == "id" || iProp == "afy:pinID") continue;
        lTxt.append($("<span class='afypropname'>" + iProp + "</span>"));
        lTxt.append($("<span>:" + QResultTable.createValueUI(_pInfo.data[iProp], lRefs, pPID + "refdet") + "  </span>"));
      }
      lPinArea.append(lTxt);
      for (iRef in lRefs)
        { $("#" + iRef).click(function(){on_pin_click($(this).text().replace(/^@/, "")); return false;}); }
    });
}

// TODO (Ming): special hints for divergences from standard SQL
// TODO: syntax completion etc.
// TODO: future modes (e.g. erdiagram, wizard to create pins that conform with 1..n classes, ...)
