/**
 * Globals/Constants.
 */
var DB_ROOT = "/db/";
var MV_CONTEXT = new Object();
MV_CONTEXT.mNavTabs = null;
MV_CONTEXT.mQueryHistory = null;
MV_CONTEXT.mClasses = null;
MV_CONTEXT.mFullIntrospection = false;
MV_CONTEXT.mLastQueriedClassName = "";
MV_CONTEXT.mLastQResult = null;
MV_CONTEXT.mSelectedPID = null;
MV_CONTEXT.mPrefix2QName = new Object();
MV_CONTEXT.mQName2Prefix = new Object();
MV_CONTEXT.mQNamesDirty = false;
MV_CONTEXT.mTooltipTimer = null;

/**
 * Tooltips.
 * Simple mechanism to bind #thetooltip to any
 * div section on the page.
 */
function bindTooltip(pDiv, pMessage)
{
  var lClearTimeout =
    function()
    {
      if (undefined == MV_CONTEXT.mTooltipTimer)
        return;
      clearTimeout(MV_CONTEXT.mTooltipTimer.timer);
      MV_CONTEXT.mTooltipTimer = null;
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
      var _lPos = pDiv.offset();
      var _lTooltipW = $("#thetooltip").outerWidth(true);
      if (_lTooltipW + 5 < _lPos.left)
        _lPos.left -= (_lTooltipW + 5);
      else
        _lPos.left += pDiv.outerWidth(true) + 5;
      $("#thetooltip").css("left", _lPos.left + "px").css("top", _lPos.top + "px").css("display", "block");
      // Deactivate automatically after a few seconds.
      if (undefined == MV_CONTEXT.mTooltipTimer || (MV_CONTEXT.mTooltipTimer.task == "activate" && MV_CONTEXT.mTooltipTimer.message == pMessage))
        MV_CONTEXT.mTooltipTimer = {timer:setTimeout(lDeactivate, 1500), task:"deactivate", message:pMessage};
    }
  pDiv.hover(
    // Activation.
    function()
    {
      // Cancel any pending automatic tooltip activation/deactivation.
      lClearTimeout();
      // Schedule tooltip activation after a small delay (don't show tooltips right away).
      MV_CONTEXT.mTooltipTimer = {timer:setTimeout(lActivate, 500), task:"activate", message:pMessage};
    },
    // Deactivation.
    lDeactivate);
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
  lMenuItem.append(pBold ? $("<b>" + pText + "</b>") : pText);
  lMenuItem.click(function(_pEvent) { lThis.hide(); if (pCallback) { pCallback(_pEvent, pUserData); } else { console.log("CtxMenu.addItem: unhandled item: " + pText); } });
  lMenuItem.hover(
    function() { $(this).addClass("ctxmenu-highlighted-item"); },
    function() { $(this).removeClass("ctxmenu-highlighted-item"); });
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

  $("#query").bind(
    "contextmenu", null,
    function(_pEvent)
    { 
      var _lMenu = new CtxMenu();
      var _lSomePID = (undefined != MV_CONTEXT.mSelectedPID ? MV_CONTEXT.mSelectedPID : "50001");
      var _lSomeClass = (undefined != MV_CONTEXT.mClasses && MV_CONTEXT.mClasses.length > 0 ? MV_CONTEXT.mClasses[0]["ks:classID"] : "myclass");
      _lMenu.addItem($("#menuitem_query_pin").text(), function() { $("#query").val("SELECT * FROM @" + _lSomePID + ";"); });
      _lMenu.addItem($("#menuitem_query_class").text(), function() { $("#query").val("SELECT * FROM \"" + _lSomeClass + "\";"); });
      _lMenu.addItem($("#menuitem_query_classft").text(), function() { $("#query").val("SELECT * FROM \"" + _lSomeClass + "\" MATCH AGAINST ('hello');"); });
      _lMenu.addItem($("#menuitem_query_classjoin").text(), function() { $("#query").val("SELECT * FROM myclass1 AS c1 JOIN myclass2 AS c2 ON (c1.myprop1 = c2.myprop2);"); });
      _lMenu.addItem($("#menuitem_query_all").text(), function() { $("#query").val("SELECT *;"); });
      _lMenu.addItem($("#menuitem_query_insertpin").text(), function() { $("#query").val("INSERT (\"myprop\", \"myotherprop\") VALUES (1, {2, 'hello', TIMESTAMP'1976-05-02 10:10:10'});"); });
      //_lMenu.addItem($("#menuitem_query_insertgraph").text(), function() { $("#query").val("INSERT \"myname\"='Fred', \"myfriends\"={(INSERT \"myname\"='John', \"myfriends\"={(SELECT * WHERE \"myname\" MATCH AGAINST('Fr')), (INSERT \"myname\"='Jack')}), (INSERT \"myname\"='Tony')};"); });
      _lMenu.addItem($("#menuitem_query_insertclass").text(), function() { $("#query").val("CREATE CLASS \"myclass\" AS SELECT * WHERE EXISTS(\"myprop\");"); });
      _lMenu.addItem($("#menuitem_query_updatepin").text(), function() { $("#query").val("UPDATE @" + _lSomePID + " SET \"mythirdprop\"=123;"); });
      _lMenu.addItem($("#menuitem_query_deletepin").text(), function() { $("#query").val("DELETE FROM @" + _lSomePID + ";"); });
      _lMenu.addItem($("#menuitem_query_dropclass").text(), function() { $("#query").val("DROP CLASS \"" + _lSomeClass + "\";"); }); 
      _lMenu.start(_pEvent.pageX, _pEvent.pageY);
      return false;
    });

  $("#result_pin").bind(
    "contextmenu", null,
    function(_pEvent)
    { 
      var _lMenu = new CtxMenu();
      _lMenu.addItem($("#menuitem_rp_querypin").text(), function() { if (undefined != MV_CONTEXT.mSelectedPID) { $("#query").val("SELECT * FROM @" + MV_CONTEXT.mSelectedPID + ";"); } });
      _lMenu.addItem($("#menuitem_rp_deletepin").text(), function() { if (undefined != MV_CONTEXT.mSelectedPID) { $("#query").val("DELETE FROM @" + MV_CONTEXT.mSelectedPID + ";"); } });
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
 * QResultTable.
 * Contains at least 2 columns: PID, Other Properties.
 * When the query is on a class (or eventually join etc.), add more columns.
 * Goal: improve readability by showing common properties, and also reduce waste of space.
 */
function QResultTable(pContainer, pClassName)
{
  this.mAborted = false;
  this.mClassName = pClassName;
  this.mTable = $("<table id='qresulttable' width=\"100%\" />").appendTo(pContainer);
  this.mInitialized = false;
}
QResultTable.prototype.populate = function(pQuery)
{
  // Count how many pins are expected for pQuery, and then proceed page by page.
  var lThis = this;
  var lOnCountSuccess = function(_pJson) {
    var lPaginationCtx = new Object();
    lPaginationCtx.mNumPins = parseInt(_pJson);
    lPaginationCtx.mOffset = 0;
    lPaginationCtx.mPageSize = 20;
    var lOnPageSuccess = function(_pJson, _pUserData) {
      if (undefined == _pJson)
        return;
      lThis._addRows(_pJson);
      _pUserData.mOffset += _pJson.length;
      if (_pUserData.mOffset < _pUserData.mNumPins && !lThis.mAborted)
      {
        var _lOnPage = new QResultHandler(lOnPageSuccess, null, _pUserData);
        setTimeout(function(){mv_query(pQuery, _lOnPage, {limit:_pUserData.mPageSize, offset:_pUserData.mOffset})}, 20); // For some unidentified reason, pagination was working smoothly for a few days, but then at some point it started to show signs of cpu starvation (e.g. slow/infrequent browser refreshes); I added this 20ms timeout between pages, and things came back to normal.
      }
      else if (undefined != pQuery.match(/^\s*create\s*class/i))
        { populate_classes(); }
    };
    var lOnPage = new QResultHandler(lOnPageSuccess, null, lPaginationCtx);
    mv_query(pQuery, lOnPage, {limit:lPaginationCtx.mPageSize, offset:lPaginationCtx.mOffset});
  };
  var lOnCount = new QResultHandler(lOnCountSuccess, null, null);
  mv_query(pQuery, lOnCount, {countonly:true});
}
QResultTable.prototype._init = function(pJson)
{
  if (this.mInitialized)
    return;
  
  // Clear the table.
  this.mTable.empty();

  // Create the column headers (PID, class props, common props, other props).
  // REVIEW: We could decide to color-code the sections (class vs common vs other).
  var lHead = $("<thead />").appendTo(this.mTable);
  var lHeadR = $("<tr />").appendTo(lHead);
  lHeadR.append($("<th align=\"left\">PID</th>"));
  this.mClassProps = new Object();
  this.mCommonProps = new Object(), lCommonProps = new Object();
  var lClass = null;
  if (this.mClassName)
  {
    lClass = function(_pN){ for (var i = 0; null != MV_CONTEXT.mClasses && i < MV_CONTEXT.mClasses.length; i++) { if (MV_CONTEXT.mClasses[i]["ks:classID"] == _pN) return MV_CONTEXT.mClasses[i]; } return null; }(this.mClassName);
    for (var iProp in lClass["ks:properties"])
    {
      var lPName = lClass["ks:properties"][iProp];
      this.mClassProps[lPName] = 1;
      lHeadR.append($("<th align=\"left\">" + lPName + "</th>"));
    }
  }
  for (var i = 0; i < pJson.length; i++)
  {
    var lPin = (pJson[i] instanceof Array || pJson[i][0] != undefined) ? pJson[i][0] : pJson[i];
    for (var iProp in lPin)
    {
      if (iProp == "id") continue;
      if (iProp in this.mClassProps) continue;
      if (iProp in lCommonProps) { lCommonProps[iProp] = lCommonProps[iProp] + 1; continue; }
      lCommonProps[iProp] = 1;
    }
  }
  for (var iProp in lCommonProps)
  {
    if (lCommonProps[iProp] < (pJson.length / 2)) continue; // Only keep properties that appear at least in 50% of the results.
    this.mCommonProps[iProp] = 1;
    lHeadR.append($("<th align=\"left\">" + iProp + "</th>"));
  }
  lHeadR.append($("<th align=\"left\">Other Properties</th>"));
  this.mInitialized = true;
}
QResultTable.prototype._addRows = function(pQResJson)
{
  if (undefined == pQResJson)
    return;
  var lJson = pQResJson;

  // Initialize upon receiving the first batch of results,
  // in order to be able to gather "common" properties, based on that first batch.
  this._init(lJson);

  // Create the rows.
  var lBody = $("<tbody />").appendTo(this.mTable);
  for (var i = 0; i < lJson.length; i++)
  {
    // For now, if an element of the result is a list (result from a JOIN), just take the leftmost pin.
    // When the kernel behavior stabilizes with respect to the structure and contents of JOIN results,
    // we can do more.
    var lPin = (lJson[i] instanceof Array || lJson[i][0] != undefined) ? lJson[i][0] : lJson[i];
    
    // Create a new row and bind mouse interactions.
    var lRow = $("<tr id=\"" + lPin["id"] + "\"/>").appendTo(lBody);
    lRow.mouseover(function(){$(this).addClass("highlighted");});
    lRow.mouseout(function(){$(this).removeClass("highlighted");});
    lRow.click(function(){on_pin_click($(this).attr("id")); return false;});
    var lRefs = new Object();

    // Create the first column.
    lRow.append($("<td>" + lPin["id"] + "</td>"));

    // Create the class-related columns, if any.
    for (var iProp in this.mClassProps)
      { lRow.append($("<td>" + this._createValueUI(lPin[iProp], lRefs, lPin["id"] + "rqt") + "</td>")); }

    // Create the common props columns, if any.
    for (var iProp in this.mCommonProps)
      { lRow.append($("<td>" + (iProp in lPin ? this._createValueUI(lPin[iProp], lRefs, lPin["id"] + "rqt") : "") + "</td>")); }

    // Create the last column (all remaining properties).
    lOtherProps = $("<p />");
    for (var iProp in lPin)
    {
      if (iProp == "id") continue;
      if (iProp in this.mClassProps) continue;
      if (iProp in this.mCommonProps) continue;
      lOtherProps.append($("<span class='mvpropname'>" + iProp + "</span>"));
      lOtherProps.append($("<span>:" + this._createValueUI(lPin[iProp], lRefs, lPin["id"] + "rqt") + "  </span>"));
    }
    var lOPD = $("<td />");
    lOPD.append(lOtherProps);
    lRow.append(lOPD);

    // Bind mouse interactions for references.
    for (iRef in lRefs)
      { $("#" + iRef).click(function(){on_pin_click($(this).text()); return false;}); }
  }
}
QResultTable.createValueUI = function(pProp, pRefs, pRefPrefix)
{
  if (typeof(pProp) != "object")
    { return pProp; }
  for (var iElm in pProp)
  {
    if (iElm == "$ref")
    {
      pRefs[pRefPrefix + pProp[iElm]] = true;
      return "<a id=\"" + pRefPrefix + pProp[iElm] + "\" href=\"#" + pProp[iElm] + "\">" + pProp[iElm] + "</a>";
    }
    else if (!isNaN(parseInt(iElm)))
    {
      var lElements = new Array();
      for (iElm in pProp)
        { lElements.push(QResultTable.createValueUI(pProp[iElm], pRefs, pRefPrefix)); }      
      return "{" + lElements.join(",") + "}";
    }
    else { console.log("QResultTable.createValueUI: unexpected property: " + iElm); }
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
  this.mResultList.change(
    function()
    {
      var _lCurPageQ = $("#result_area_selector option:selected").val();
      $.each(lThis.mPages, function(_pI, _pE) { _pE.ui.css("display", (_pE.query == _lCurPageQ) ? "block" : "none"); });
    });
}
BatchingSQL.prototype.go = function()
{
  this.mResultList.empty();
  this.mResultPage.empty();
  this.mPages = new Array();
  var lThis = this;
  var lQueries = this.mQueryAreaQ.val().replace(/\n/g,"").split(';');
  var lOnResults =
    function(_pJson)
    {
      if (0 == _pJson.length || lQueries.length < _pJson.length)
        return;
      for (var iQ = 0; iQ < _pJson.length; iQ++)
      {
        var _lPage = {ui:$("<div />"), query:(lQueries[iQ] + ";"), result:null};
        _lPage.result = new QResultTable(_lPage.ui, null);
        MV_CONTEXT.mQueryHistory.recordQuery(_lPage.query);
        _lPage.result._addRows(_pJson[iQ]);
        lThis.mResultList.append($("<option>" + _lPage.query + "</option>"));
        lThis.mPages.push(_lPage);
        lThis.mResultPage.append(_lPage.ui);
        _lPage.ui.css("display", "none");
      }
    };
  mv_batch_query(lQueries, new QResultHandler(lOnResults, function(_pError){ print("error:" + _pError[0].responseText); }), {sync:true});
  if (this.mPages.length > 0)
    this.mPages[0].ui.css("display", "block");
}
BatchingSQL.prototype.go_1by1 = function() // No longer used.
{
  this.mResultList.empty();
  this.mResultPage.empty();
  this.mPages = new Array();
  var lThis = this;
  var lQueries = this.mQueryAreaQ.val().replace(/\n/g,"").split(';');
  $.each(
    lQueries,
    function(_pI, _pE)
    {
      if (0 == _pE.length)
        return;
      var _lPage = {ui:$("<div />"), query:(_pE + ";"), result:null};
      _lPage.result = new QResultTable(_lPage.ui, null);
      MV_CONTEXT.mQueryHistory.recordQuery(_lPage.query);
      _lPage.result.populate(_lPage.query);
      lThis.mResultList.append($("<option>" + _lPage.query + "</option>"));
      lThis.mPages.push(_lPage);
      lThis.mResultPage.append(_lPage.ui);
      _lPage.ui.css("display", "none");
    });
  if (this.mPages.length > 0)
    this.mPages[0].ui.css("display", "block");
}

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
      $.each(lTabs, function(__pI, __pE) { __pE.content.css("display", "none"); });
      // Display the selected tab.
      var _lTargetA = $(_pEvent.target).parent()[0];
      var _lTab = lTabContentFromName(lTabNameFromA(_lTargetA));
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
      $("img", _lAnchor).each(function(__pI, __pE) { $(__pE).click(lOnTab); bindTooltip($(__pE), $("#tooltip_" + _lTab.name).text()); });
    });
  // Select the first tab initially (either from the url, if one is specified, or just by index, otherwise).
  var lLoadedUrl = location.href.split('#');
  lOnTab({target:(lLoadedUrl.length > 1 ? $("img", lFindTab(lLoadedUrl.pop()).anchor) : $("#nav img")[0])});
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
  catch(e) { console.log("QHistory._init: " + e); }
}
QHistory.prototype._removeRow = function(pKey)
{
  try
  {
    this.mStore.remove(pKey);
    $("#" + pKey).remove();
  }
  catch(e) { console.log("QHistory._removeRow: " + e); }
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
  catch(e) { console.log("QHistory.recordQuery: " + e); }
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
  catch(e) { console.log("QHistory.clearHistory: " + e); }
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
      function _stringify(__pWhat, __pQuoteStrings)
      {
        if (typeof(__pWhat) == "object")
        {
          if (__pWhat instanceof Array)
          {
            var __lR = [];
            for (var __i = 0; __i < __pWhat.length; __i++)
              __lR.push(_stringify(__pWhat[__i], __pQuoteStrings));
            return "[" + __lR.join(",") + "]<br>";
          }
          else if (__pWhat instanceof Date)
            return "'" + __pWhat.toString() + "'";
          else
          {
            var __lR = [];
            for (var __iP in __pWhat)
              __lR.push(__iP + ":" + _stringify(__pWhat[__iP], true));
            return "{" + __lR.join(",") + "}";
          }
        }
        else if (typeof(__pWhat) == "string" && __pQuoteStrings)
          return "'" + __pWhat + "'";
        return __pWhat;
      }
      function _onPathsqlResult(__pJson) { print(__pJson); }
      function _pushTutInstr(__pLine) { lThis.mHistory.append($("<p class='tutorial_instructions'>" + __pLine + "</p>")); }
      function print(__pWhat) { lThis.mHistory.append($("<p class='tutorial_result'>" + _stringify(__pWhat, false) + "</p>")); }
      function pathsql(__pSql)
      {
        // Log in the query history.
        // WARNING:
        //   This proves to be catastrophically slow, and is so detrimental to the
        //   performance of the tutorial that I decided to forget about it.
        // MV_CONTEXT.mQueryHistory.recordQuery(__pSql);

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
            mv_batch_query(
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
          mv_query(mv_sanitize_semicolon(__pSql), new QResultHandler(__lOnPathsql, function(__pError){ print("error:" + __pError[0].responseText); }), {sync:true});
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
  this.mPushInput = function() { lThis.mHistory.append($("<p class='tutorial_stmt'>&gt;" + lThis.mInput.val() + "</p>")); lThis.mInput.val(''); }
  this.mScroll = function() { $("#tutorial_area").scrollTop(lThis.mHistory.height() + 2 * $("#tutorial_input").height() - $("#tutorial_area").height()); $("#tutorial_area").scrollLeft(0); }
  this.mTutorialStep = 0;
  $("#tutorial_area").click(function() { lThis.mInput.focus(); });
  $("#tab-tutorial").bind("activate_tab", function() { lThis.mInput.focus(); });
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
 * Document entry point (by callback).
 */
$(document).ready(
  function() {
    // Setup a client-side persistent memory.
    MV_CONTEXT.mUIStore = new Persist.Store("mvStore Console Persistence");
    if (undefined != MV_CONTEXT.mUIStore)
    {
      var lLastStoreIdent = MV_CONTEXT.mUIStore.get('laststoreident');
      if (undefined != lLastStoreIdent)
        $("#storeident").val(lLastStoreIdent);
      var lLastStorePw = MV_CONTEXT.mUIStore.get('laststorepw');
      if (undefined != lLastStorePw)
        $("#storepw").val(lLastStorePw);
    }
    // Setup the tutorial.
    new Tutorial();
    // Setup the batching UI.
    new BatchingSQL();
    // Setup tab-dependent aspects of the basic console.
    // Note:
    //   For the moment, for simplicity, we refresh classes everytime we come back from another tab
    //   (where classes may have been created).
    // Note:
    //   This also allows to land on the tutorial page without emitting any query to the store upfront,
    //   which is nice in a setup where the front-end is hosted in a separate environment.
    $("#tab-basic").bind("activate_tab", function() { populate_classes(); $("#query").focus(); });
    // Setup the main navigational tab system.
    // Note: We set this up after the actual tabs, in order for them to receive the initial 'activate_tab'.
    MV_CONTEXT.mNavTabs = new NavTabs();    
    // Setup the basic tooltips.
    bindAutomaticTooltips();
    // Setup static context menus.
    bindStaticCtxMenus();
    // Setup the persistent cache for the query history.
    MV_CONTEXT.mQueryHistory = new QHistory($("#query_history"), MV_CONTEXT.mUIStore);
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
      var lResultList = $("#result_list");
      lResultList.html("loading...");
      if ($("#result_pin pre").size() > 0) // If the contents of the #result_pin represent an error report from a previous query, clear it now; otherwise, let the contents stay there.
        $("#result_pin").empty(); 
      var lCurClassName = $("#classes option:selected").val();
      var lQueryStr = mv_sanitize_semicolon($("#query").val());
      MV_CONTEXT.mLastQueriedClassName = (lQueryStr.indexOf(mv_without_qname(lCurClassName)) >= 0) ? lCurClassName : null;
      if ($("#querytype option:selected").val() == "query" && null == lQueryStr.match(/select\s*count/i))
      {
        if (null != MV_CONTEXT.mLastQResult)
          { MV_CONTEXT.mLastQResult.mAborted = true; }
        lResultList.empty();
        MV_CONTEXT.mLastQResult = new QResultTable(lResultList, MV_CONTEXT.mLastQueriedClassName);
        MV_CONTEXT.mLastQResult.populate(lQueryStr);
        MV_CONTEXT.mQueryHistory.recordQuery(lQueryStr);
      }
      else
      {
        var lQuery = "query=" + mv_escape_with_plus(mv_with_qname_prefixes(lQueryStr)) + "&type=" + $("#querytype option:selected").val();
        $.ajax({
          type: "POST",
          url: DB_ROOT,
          dataType: "text",
          timeout: 10000,
          cache: false,
          global: false,
          data: lQuery,
          complete: function (e, xhr, s) {
            $("#result_list").html(hqbr(lQueryStr + "\n\n" + e.responseText + "\n" + xhr));
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
    $("#storeident").change(function() { populate_classes(); if (undefined != MV_CONTEXT.mUIStore) { MV_CONTEXT.mUIStore.set('laststoreident', $("#storeident").val()); } });
    $("#storepw").change(function() { populate_classes(); if (undefined != MV_CONTEXT.mUIStore) { MV_CONTEXT.mUIStore.set('laststorepw', $("#storepw").val()); } });
  }
);

/**
 * String manips.
 */
function hq(s) {return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function hqbr(s) {return hq(s).replace(/\n/g,"<br/>").replace(/ /g,"&nbsp;");}

/**
 * MV query helpers.
 */
function mv_with_qname(pRawName)
{
  var lNewProp = null;
  var lLastSlash = (undefined != pRawName) ? pRawName.lastIndexOf("/") : -1;
  if (lLastSlash < 0)
    { return pRawName; }
  var lPrefix = pRawName.substr(0, lLastSlash);
  var lSuffix = pRawName.substr(lLastSlash + 1);
  if (lPrefix in MV_CONTEXT.mPrefix2QName)
    { return MV_CONTEXT.mPrefix2QName[lPrefix] + ":" + lSuffix; }
  else
  {
    var lNumQNames = 0;
    for (iQN in MV_CONTEXT.mPrefix2QName) { if (MV_CONTEXT.mPrefix2QName.hasOwnProperty(iQN)) lNumQNames++; }
    var lNewQName = "qn" + lNumQNames;
    MV_CONTEXT.mPrefix2QName[lPrefix] = lNewQName;
    MV_CONTEXT.mQName2Prefix[lNewQName] = lPrefix;
    MV_CONTEXT.mQNamesDirty = true;
    setTimeout(update_qnames_ui, 2000);
    return lNewQName + ":" + lSuffix;
  }
}
function mv_without_qname(pRawName)
{
  if (null == pRawName || undefined == pRawName)
    { return null; }
  var lColon = pRawName.indexOf(":");
  if (lColon < 0)
    { return pRawName; }
  var lQName = pRawName.substr(0, lColon);
  var lSuffix = pRawName.substr(lColon + 1);
  if (lQName in MV_CONTEXT.mQName2Prefix)
    { return MV_CONTEXT.mQName2Prefix[lQName] + "/" + lSuffix; }
  return pRawName;
}
function mv_with_qname_prefixes(pQueryStr)
{
  var lAlreadyDefined = {'http':1, 'ks':1};
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
      if (lPrefix in MV_CONTEXT.mQName2Prefix)
        lToDefine[lPrefix] = MV_CONTEXT.mQName2Prefix[lPrefix];
      else
        alert("Unknown prefix: " + lPrefix);
    }
  }
  var lProlog = "";
  for (var iP in lToDefine)
    { lProlog = lProlog + "PREFIX " + iP + ": '" + lToDefine[iP] + "' "; }
  return lProlog + pQueryStr;
}
function mv_sanitize_json_result(pResultStr)
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
      var _lNewObj = new Object();
      for (var _iProp in _pJsonRaw)
      {
        var _lNewProp = mv_with_qname(_iProp);
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
  } catch(e) { console.log("mv_sanitize_json_result: " + e); }
  return null;
}
function mv_sanitize_classname(pClassName)
{
  return (pClassName.charAt(0) != "\"" && pClassName.indexOf("/") > 0) ? ("\"" + pClassName + "\"") : pClassName;
}
function mv_sanitize_semicolon(pQ)
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
function mv_escape_with_plus(pStr)
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
    var lT = pSql + "\n" + pArgs[0].responseText;
    console.log(lT);
    lT = lT.replace(/\n/g, "<br>").replace(/\s/, "&nbsp;");
    $("#result_pin").empty(); $("#result_pin").append("<pre style='color:red'>" + lT + "</pre>");
  }
}
function mv_query(pSqlStr, pResultHandler, pOptions)
{
  if (null == pSqlStr || 0 == pSqlStr.length)
    { console.log("mv_query: invalid sql " + pSqlStr); pResultHandler.onerror(null, pSqlStr); return; }
  var lSqlStr = mv_with_qname_prefixes(pSqlStr);
  var lHasOption = function(_pOption) { return (undefined != pOptions && _pOption in pOptions); }
  $.ajax({
    type: "GET",
    url: DB_ROOT + "?q=" + mv_escape_with_plus(lSqlStr) + "&i=pathsql&o=json" + (lHasOption('countonly') ? "&type=count" : "") + (lHasOption('limit') ? ("&limit=" + pOptions.limit) : "") + (lHasOption('offset') ? ("&offset=" + pOptions.offset) : ""),
    dataType: "text", // Review: until mvStore returns 100% clean json...
    async: (lHasOption('sync') && pOptions.sync) ? false : true,
    timeout: (lHasOption('sync') && pOptions.sync) ? 10000 : null,
    cache: false,
    global: false,
    success: function(data) { /*alert(data);*/ pResultHandler.onsuccess(mv_sanitize_json_result(data), pSqlStr); },
    error: function() { pResultHandler.onerror(arguments, pSqlStr); },
    beforeSend : function(req) {
      if (!lHasOption('keepalive') || pOptions.keepalive) { req.setRequestHeader('Connection', 'Keep-Alive'); } // Note: This doesn't seem to guaranty that a whole multi-statement transaction (e.g. batching console) will run in a single connection; in firefox, it works if I configure network.http.max-persistent-connections-per-server=1 (via the about:config page).
      var lStoreIdent = $("#storeident").val();
      var lStorePw = $("#storepw").val();
      if (lStoreIdent.length > 0) { req.setRequestHeader('Authorization', "Basic " + base64_encode(lStoreIdent + ":" + lStorePw)); }
    }
  });
}
function mv_batch_query(pSqlStrArray, pResultHandler, pOptions)
{
  if (null == pSqlStrArray || 0 == pSqlStrArray.length)
    { console.log("mv_query: invalid sql batch"); pResultHandler.onerror(null, pSqlStrArray); return; }
  var lBody = "";
  for (var iStmt = 0; iStmt < pSqlStrArray.length; iStmt++)
  {
    lBody = lBody + mv_with_qname_prefixes(pSqlStrArray[iStmt]);
    var lChkSemicolon = pSqlStrArray[iStmt].match(/(.*)(;)(\s*)$/);
    if (iStmt < pSqlStrArray.length - 1 && (undefined == lChkSemicolon || undefined == lChkSemicolon[2]))
      lBody = lBody + ";";
  }
  var lHasOption = function(_pOption) { return (undefined != pOptions && _pOption in pOptions); }
  lBody = "q=" + mv_escape_with_plus(lBody) + (lHasOption('countonly') ? "&type=count" : "") + (lHasOption('limit') ? ("&limit=" + pOptions.limit) : "") + (lHasOption('offset') ? ("&offset=" + pOptions.offset) : "");
  $.ajax({
    type: "POST",
    data: lBody,
    url: DB_ROOT + "?i=pathsql&o=json",
    dataType: "text", // Review: until mvStore returns 100% clean json...
    async: (lHasOption('sync') && pOptions.sync) ? false : true,
    timeout: (lHasOption('sync') && pOptions.sync) ? 10000 : null,
    cache: false,
    global: false,
    success: function(data) { /*alert(data);*/ pResultHandler.onsuccess(mv_sanitize_json_result(data), pSqlStrArray); },
    error: function() { pResultHandler.onerror(arguments, pSqlStrArray); },
    beforeSend : function(req) {
      if (!lHasOption('keepalive') || pOptions.keepalive) { req.setRequestHeader('Connection', 'Keep-Alive'); } // Note: This doesn't seem to guaranty that a whole multi-statement transaction (e.g. batching console) will run in a single connection; in firefox, it works if I configure network.http.max-persistent-connections-per-server=1 (via the about:config page).
      var lStoreIdent = $("#storeident").val();
      var lStorePw = $("#storepw").val();
      if (lStoreIdent.length > 0) { req.setRequestHeader('Authorization', "Basic " + base64_encode(lStoreIdent + ":" + lStorePw)); }
    }
  });
}

/**
 * Classes/properties UI.
 */
function populate_classes()
{
  var lTruncateLeadingDot = function(_pStr) { return _pStr.charAt(0) == "." ? _pStr.substr(1) : _pStr; }
  var lOnSuccess = function(_pJson) {
    MV_CONTEXT.mClasses = _pJson;
    MV_CONTEXT.mFullIntrospection = false;
    var lToDelete = [];
    for (var iC = 0; null != MV_CONTEXT.mClasses && iC < MV_CONTEXT.mClasses.length; iC++)
    {
      if (undefined == MV_CONTEXT.mClasses[iC]["ks:classID"])
        { lToDelete.push(iC); continue; }
      MV_CONTEXT.mClasses[iC]["ks:classID"] = mv_with_qname(lTruncateLeadingDot(MV_CONTEXT.mClasses[iC]["ks:classID"])); // Remove the leading dot (if any) and transform into qname (prefix:name).
      if ("http://localhost/mv/class/1.0/ClassDescription" == MV_CONTEXT.mClasses[iC]["ks:classID"])
        { MV_CONTEXT.mFullIntrospection = true; }
      var lCProps = MV_CONTEXT.mClasses[iC]["ks:properties"];
      var lNewProps = new Object();
      for (iP in lCProps)
      {
        var lNewName = mv_with_qname(lTruncateLeadingDot(lCProps[iP]));
        lNewProps[iP] = lNewName;
      }
      MV_CONTEXT.mClasses[iC]["ks:properties"] = lNewProps;
    }
    for (var iD = lToDelete.length - 1; iD >= 0; iD--)
      MV_CONTEXT.mClasses.splice(lToDelete[iD], 1);
    $("#classes").empty();
    $("#class_properties").empty();
    $("#class_doc").empty();
    $("#property_doc").empty();
    $("#qnames").empty();
    if (undefined == _pJson) { console.log("populate_classes: undefined _pJson"); return; }
    for (var i = 0; i < _pJson.length; i++)
    {
      var lCName = _pJson[i]["ks:classID"];
      var lOption = "<option value=\"" + lCName + "\">" + lCName + "</option>";
      $("#classes").append(lOption);
    }
    on_class_change();
  };
  MV_CONTEXT.mQNamesDirty = true;
  var lOnClasses = new QResultHandler(lOnSuccess, null, null);
  mv_query("SELECT * FROM ks:ClassOfClasses;", lOnClasses, {keepalive:false});
}

function on_class_change()
{
  update_qnames_ui();

  var lCurClassName = $("#classes option:selected").val();
  var lCurClass = function(_pN){ for (var i = 0; null != MV_CONTEXT.mClasses && i < MV_CONTEXT.mClasses.length; i++) { if (MV_CONTEXT.mClasses[i]["ks:classID"] == _pN) return MV_CONTEXT.mClasses[i]; } return null; }(lCurClassName);
  if (undefined == lCurClass) return;
  $("#class_properties").empty();
  for (var iProp in lCurClass["ks:properties"])
  {
    var lPName = lCurClass["ks:properties"][iProp];
    var lOption = "<option value=\"" + lPName + "\">" + lPName + "</option>";
    $("#class_properties").append(lOption);
    // TODO: for each prop, show all the classes that are related directly with it; show docstring.
  }
  $("#property_doc").empty();

  var lClassDoc = $("#class_doc");
  lClassDoc.empty();
  lClassDoc.append($("<p><h4>predicate:</h4>&nbsp;" + lCurClass["ks:predicate"] + "<br/></p>"));
  
  if (MV_CONTEXT.mFullIntrospection)
  {
    var lOnDocstringSuccess = function(_pJson) { if (undefined != _pJson) { lClassDoc.append("<h4>docstring:</h4>&nbsp;"+ _pJson[0][mv_with_qname("http://localhost/mv/property/1.0/hasDocstring")]); } }
    var lOnDocstring = new QResultHandler(lOnDocstringSuccess, function(){}, null);
    mv_query("SELECT * FROM \"http://localhost/mv/class/1.0/ClassDescription\"('" + mv_without_qname(lCurClassName) + "');", lOnDocstring, {keepalive:false});
  }
}

function on_class_dblclick()
{
  var lCurClassName = mv_sanitize_classname(mv_without_qname($("#classes option:selected").val()));
  $("#query").val("SELECT * FROM " + lCurClassName + ";");
}

function on_cprop_change()
{
  update_qnames_ui();
  var lCurPropName = $("#class_properties option:selected").val();
  var lPropDoc = $("#property_doc");
  lPropDoc.empty();
  if (MV_CONTEXT.mFullIntrospection)
  {
    lPropDoc.append($("<p />"));
    var lOnDocstringSuccess = function(_pJson) { lPropDoc.append("<h4>docstring:</h4>&nbsp;"+ _pJson[0][mv_with_qname("http://localhost/mv/property/1.0/hasDocstring")]); }
    var lOnDocstring = new QResultHandler(lOnDocstringSuccess, function(){}, null);
    mv_query("SELECT * FROM \"http://localhost/mv/class/1.0/AttributeDescription\"('" + mv_without_qname(lCurPropName) + "') UNION SELECT * FROM \"http://localhost/mv/class/1.0/RelationDescription\"('" + lCurPropName + "');", lOnDocstring, {keepalive:false});
  }
}

function on_cprop_dblclick()
{
  var lCurPropName = mv_sanitize_classname(mv_without_qname($("#class_properties option:selected").val()));
  $("#query").val("SELECT * WHERE EXISTS(" + lCurPropName + ");");
}

function on_pin_click(pPID)
{
  update_qnames_ui();

  // Manage the row selection.
  if (null != MV_CONTEXT.mSelectedPID)
    { $("#" + MV_CONTEXT.mSelectedPID).removeClass("selected"); }
  MV_CONTEXT.mSelectedPID = pPID;
  $("#" + MV_CONTEXT.mSelectedPID).addClass("selected");

  // Update the selected PIN's information section.
  var lPinArea = $("#result_pin");
  lPinArea.empty();
  lPinClasses = $("<p>PIN:" + pPID + ", IS A </p>").appendTo(lPinArea);
  var lCheckClasses = function(_pNumC)
  {
    var _mNumCTotal = _pNumC;
    var _mNumCTested = 0;
    var _mNumCValidated = 0;
    var _mOnSuccess = function(__pJson, __pClass) { _mNumCTested += 1; if (parseInt(__pJson) > 0) { lPinClasses.append(" " + mv_with_qname(__pClass)); _mNumCValidated += 1; } if (_mNumCTested >= _mNumCTotal && 0 == _mNumCValidated) { lPinClasses.append("unclassified pin"); } };
    this.next =
      function(__pClass)
      {        
        var __lOnCount = new QResultHandler(_mOnSuccess, null, __pClass);
        mv_query("SELECT * FROM " + mv_sanitize_classname(__pClass) + " WHERE ks:pinID=@" + pPID + ";", __lOnCount, {countonly:true, keepalive:false});
      }
  }
  if (undefined != MV_CONTEXT.mClasses)
  {
    var lChk = new lCheckClasses(MV_CONTEXT.mClasses.length);
    for (var iC = 0; null != MV_CONTEXT.mClasses && iC < MV_CONTEXT.mClasses.length; iC++)
    {
      var lClass = mv_without_qname(MV_CONTEXT.mClasses[iC]["ks:classID"]);
      lChk.next(lClass);
    }
  }
  else
    lPinClasses.append("unclassified pin");
  var lOnDataSuccess = function(_pJson) {
    var lRefs = new Object();
    var lTxt = $("<p />");
    for (iProp in _pJson[0])
    {
      if (iProp == "id") continue;
      lTxt.append($("<span class='mvpropname'>" + iProp + "</span>"));
      lTxt.append($("<span>:" + QResultTable.createValueUI(_pJson[0][iProp], lRefs, pPID + "refdet") + "  </span>"));
    }
    lPinArea.append(lTxt);
    for (iRef in lRefs)
      { $("#" + iRef).click(function(){on_pin_click($(this).text()); return false;}); }
  }
  var lOnData = new QResultHandler(lOnDataSuccess, null, null);
  mv_query("SELECT * WHERE ks:pinID=@" + pPID + ";", lOnData, {keepalive:false});
}

function update_qnames_ui()
{
  if (!MV_CONTEXT.mQNamesDirty)
    { return; }
  var lQNames = $("#qnames");
  lQNames.empty();
  for (iP in MV_CONTEXT.mPrefix2QName)
    { lQNames.append("<option>" + MV_CONTEXT.mPrefix2QName[iP] + "=" + iP + "</option>"); }
  MV_CONTEXT.mQNamesDirty = false;
}

// TODO (Ming): special hints for divergences from standard SQL
// TODO: future modes (e.g. graph navigator, erdiagram, wizard to create pins that conform with 1..n classes, ...)
