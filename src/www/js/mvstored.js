/**
 * Globals/Constants.
 */
var DB_ROOT = "/db/";
var MV_CONTEXT = new Object();
MV_CONTEXT.mNavTabs = null;
MV_CONTEXT.mQueryHistory = null;
MV_CONTEXT.mClasses = null;
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
      var _lSomeClass = (undefined != MV_CONTEXT.mClasses && MV_CONTEXT.mClasses.length > 0 ? MV_CONTEXT.mClasses[0]["mv:URI"] : "myclass");
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
        setTimeout(function(){mv_query(pQuery, _lOnPage, false, _pUserData.mPageSize, _pUserData.mOffset)}, 20); // For some unidentified reason, pagination was working smoothly for a few days, but then at some point it started to show signs of cpu starvation (e.g. slow/infrequent browser refreshes); I added this 20ms timeout between pages, and things came back to normal.
      }
    };
    var lOnPage = new QResultHandler(lOnPageSuccess, null, lPaginationCtx);
    mv_query(pQuery, lOnPage, false, lPaginationCtx.mPageSize, lPaginationCtx.mOffset);
  };
  var lOnCount = new QResultHandler(lOnCountSuccess, null, null);
  mv_query(pQuery, lOnCount, true);
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
    lClass = function(_pN){ for (var i = 0; null != MV_CONTEXT.mClasses && i < MV_CONTEXT.mClasses.length; i++) { if (MV_CONTEXT.mClasses[i]["mv:URI"] == _pN) return MV_CONTEXT.mClasses[i]; } return null; }(this.mClassName);
    for (var iProp in lClass["mv:properties"])
    {
      var lPName = lClass["mv:properties"][iProp];
      this.mClassProps[lPName] = 1;
      lHeadR.append($("<th align=\"left\">" + lPName + "</th>"));
    }
  }
  for (var i = 0; i < pJson.length; i++)
  {
    for (var iProp in pJson[i])
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
    // Create a new row and bind mouse interactions.
    var lRow = $("<tr id=\"" + lJson[i]["id"] + "\"/>").appendTo(lBody);
    lRow.mouseover(function(){$(this).addClass("highlighted");});
    lRow.mouseout(function(){$(this).removeClass("highlighted");});
    lRow.click(function(){on_pin_click($(this).attr("id")); return false;});
    var lRefs = new Object();

    // Create the first column.
    lRow.append($("<td>" + lJson[i]["id"] + "</td>"));

    // Create the class-related columns, if any.
    for (var iProp in this.mClassProps)
      { lRow.append($("<td>" + this._createValueUI(lJson[i][iProp], lRefs, lJson[i]["id"] + "rqt") + "</td>")); }

    // Create the common props columns, if any.
    for (var iProp in this.mCommonProps)
      { lRow.append($("<td>" + (iProp in lJson[i] ? this._createValueUI(lJson[i][iProp], lRefs, lJson[i]["id"] + "rqt") : "") + "</td>")); }

    // Create the last column (all remaining properties).
    lOtherProps = $("<p />");
    for (var iProp in lJson[i])
    {
      if (iProp == "id") continue;
      if (iProp in this.mClassProps) continue;
      if (iProp in this.mCommonProps) continue;
      lOtherProps.append($("<span class='mvpropname'>" + iProp + "</span>"));
      lOtherProps.append($("<span>:" + this._createValueUI(lJson[i][iProp], lRefs, lJson[i]["id"] + "rqt") + "  </span>"));
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
  $.each(
    lQueries,
    function(_pI, _pE)
    {
      if (0 == _pE.length)
        return;
      var _lPage = {ui:$("<div />"), query:(_pE + ";"), result:null};
      _lPage.result = new QResultTable(_lPage.ui, null);
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
      lTabContentFromName(lTabNameFromA(_lTargetA)).css("display", "block");
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
        $("#storeident").val(lLastStoreIdent)
    }
    // Setup the main navigational tab system.
    MV_CONTEXT.mNavTabs = new NavTabs();    
    // Setup the basic tooltips.
    bindAutomaticTooltips();
    // Setup static context menus.
    bindStaticCtxMenus();
    // Setup the persistent cache for the query history.
    MV_CONTEXT.mQueryHistory = new QHistory($("#query_history"), MV_CONTEXT.mUIStore);
    // Setup the batching UI.
    new BatchingSQL();
    // Populate startup UI from queries.
    populate_classes();
    // UI callback for query form.
    $("#form").submit(function() {
      var lResultList = $("#result_list");
      lResultList.html("loading...");
      var lCurClassName = $("#classes option:selected").val();
      var lQuery = unescape($("#form").serialize());
      MV_CONTEXT.mLastQueriedClassName = (lQuery.indexOf(mv_without_qname(lCurClassName)) >= 0) ? lCurClassName : null;
      if ($("#querytype option:selected").val() == "query")
      {
        if (null != MV_CONTEXT.mLastQResult)
          { MV_CONTEXT.mLastQResult.mAborted = true; }
        lResultList.empty();
        var lQueryStr = $("#query").val();
        MV_CONTEXT.mLastQResult = new QResultTable(lResultList, MV_CONTEXT.mLastQueriedClassName);
        MV_CONTEXT.mLastQResult.populate(lQueryStr);
        MV_CONTEXT.mQueryHistory.recordQuery(lQueryStr);
      }
      else
      {
        $.ajax({
          type: "POST",
          url: DB_ROOT,
          dataType: "text",
          timeout: 10000,
          cache: false,
          global: false,
          data: lQuery,
          complete: function (e, xhr, s) {
            $("#result_list").html(hqbr($("#query").val() + "\n\n" + e.responseText + "\n" + xhr));
          },
          beforeSend : function(req) {
            req.setRequestHeader('Connection', 'Keep-Alive');
            var lStoreIdent = $("#storeident").val();
            if (lStoreIdent.length > 0) { req.setRequestHeader('Authorization', "Basic " + base64_encode(lStoreIdent + ":" /* TODO: add pw */)); }
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
    $("#storeident").change(function() { populate_classes(); if (undefined != MV_CONTEXT.mUIStore) { MV_CONTEXT.mUIStore.set('laststoreident', $("#storeident").val()); } });
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
function mv_sanitize_json_result(pResultStr)
{
  //var lStr = "[" + pResultStr.replace(/\n/g, "").replace(/\}\s*\{/g, "},{") + "]";
  try
  {
    var lJsonRaw = $.parseJSON(pResultStr.replace(/\s+/g, " ")); // Note: for some reason chrome is more sensitive to those extra characters than other browsers.
    if (null == lJsonRaw) { return null; }
    if (typeof(lJsonRaw) == "number") { return lJsonRaw; }
    var lJson = new Array();
    for (var i = 0; i < lJsonRaw.length; i++)
    {
      var lNewObj = new Object();
      for (var iProp in lJsonRaw[i])
      {
        var lNewProp = mv_with_qname(iProp);
        if (iProp == lNewProp)
          { lNewObj[iProp] = lJsonRaw[i][iProp]; continue; }
        lNewObj[lNewProp] = lJsonRaw[i][iProp];
      }
      lJson.push(lNewObj);
    }
    return lJson;
  } catch(e) { console.log("mv_sanitize_json_result: " + e); }
  return null;
}
function mv_sanitize_classname(pClassName)
{
  return (pClassName.charAt(0) != "\"" && pClassName.indexOf("/") > 0) ? ("\"" + pClassName + "\"") : pClassName;
}
function QResultHandler(pOnSuccess, pOnError, pUserData) { this.mOnSuccess = pOnSuccess; this.mOnError = pOnError; this.mUserData = pUserData; }
QResultHandler.prototype.onsuccess = function(pJson, pSql) { if (this.mOnSuccess) this.mOnSuccess(pJson, this.mUserData, pSql); }
QResultHandler.prototype.onerror = function(pArgs, pSql) { if (this.mOnError) this.mOnError(pArgs, this.mUserData, pSql); else console.log("QResultHandler.onerror: " + pArgs[1]); }
function mv_query(pSqlStr, pResultHandler, pCountOnly, pLimit, pOffset)
{
  if (null == pSqlStr || 0 == pSqlStr.length || pSqlStr.charAt(pSqlStr.length - 1) != ";")
    { console.log("mv_query: invalid sql " + pSqlStr); pResultHandler.onerror(null, pSqlStr); return; }
  $.ajax({
    type: "GET",
    url: DB_ROOT + "?q=" + escape(pSqlStr) + "&i=mvsql&o=json" + (pCountOnly ? "&type=count" : "") + ((null != pLimit) ? ("&limit=" + pLimit) : "") + ((null != pOffset) ? ("&offset=" + pOffset) : ""),
    dataType: "text", // Review: until mvStore returns 100% clean json...
    timeout: 10000,
    cache: false,
    global: false,
    success: function(data) { pResultHandler.onsuccess(mv_sanitize_json_result(data), pSqlStr); },
    error: function() { pResultHandler.onerror(arguments, pSqlStr); },
    beforeSend : function(req) {
      req.setRequestHeader('Connection', 'Keep-Alive'); // Note: This doesn't seem to guaranty that a whole multi-statement transaction (e.g. batching console) will run in a single connection; in firefox, it works if I configure network.http.max-persistent-connections-per-server=1 (via the about:config page).
      var lStoreIdent = $("#storeident").val();
      if (lStoreIdent.length > 0) { req.setRequestHeader('Authorization', "Basic " + base64_encode(lStoreIdent + ":" /* TODO: add pw */)); }
    }
  });
}

/**
 * Classes/properties UI.
 */
function populate_classes()
{
  var lOnSuccess = function(_pJson) {
    MV_CONTEXT.mClasses = _pJson;
    for (var iC = 0; null != MV_CONTEXT.mClasses && iC < MV_CONTEXT.mClasses.length; iC++)
    {
      MV_CONTEXT.mClasses[iC]["mv:URI"] = mv_with_qname(MV_CONTEXT.mClasses[iC]["mv:URI"]);
      var lCProps = MV_CONTEXT.mClasses[iC]["mv:properties"];
      var lNewProps = new Object();
      for (iP in lCProps)
      {
        var lNewName = mv_with_qname((lCProps[iP].charAt(0) == ".") ? lCProps[iP].substr(1) : lCProps[iP]);
        lNewProps[iP] = lNewName;
      }
      MV_CONTEXT.mClasses[iC]["mv:properties"] = lNewProps;
    }
    $("#classes").empty();
    $("#class_properties").empty();
    $("#class_doc").empty();
    $("#property_doc").empty();
    $("#qnames").empty();
    if (undefined == _pJson) { console.log("populate_classes: undefined _pJson"); return; }
    for (var i = 0; i < _pJson.length; i++)
    {
      var lCName = _pJson[i]["mv:URI"];
      var lOption = "<option value=\"" + lCName + "\">" + lCName + "</option>";
      $("#classes").append(lOption);
    }
    on_class_change();
  };
  MV_CONTEXT.mQNamesDirty = true;
  var lOnClasses = new QResultHandler(lOnSuccess, null, null);
  mv_query("SELECT * FROM mv:ClassOfClasses;", lOnClasses);
}

function on_class_change()
{
  update_qnames_ui();

  var lCurClassName = $("#classes option:selected").val();
  var lCurClass = function(_pN){ for (var i = 0; null != MV_CONTEXT.mClasses && i < MV_CONTEXT.mClasses.length; i++) { if (MV_CONTEXT.mClasses[i]["mv:URI"] == _pN) return MV_CONTEXT.mClasses[i]; } return null; }(lCurClassName);
  if (undefined == lCurClass) return;
  $("#class_properties").empty();
  for (var iProp in lCurClass["mv:properties"])
  {
    var lPName = lCurClass["mv:properties"][iProp];
    var lOption = "<option value=\"" + lPName + "\">" + lPName + "</option>";
    $("#class_properties").append(lOption);
    // TODO: for each prop, show all the classes that are related directly with it; show docstring.
  }
  $("#property_doc").empty();

  var lClassDoc = $("#class_doc");
  lClassDoc.empty();
  lClassDoc.append($("<p><h4>predicate:</h4>&nbsp;" + lCurClass["mv:predicate"] + "<br/></p>"));
  var lOnDocstringSuccess = function(_pJson) { if (undefined != _pJson) { lClassDoc.append("<h4>docstring:</h4>&nbsp;"+ _pJson[0][mv_with_qname("http://localhost/mv/property/1.0/hasDocstring")]); } }
  var lOnDocstring = new QResultHandler(lOnDocstringSuccess, function(){}, null);
  mv_query("SELECT * FROM \"http://localhost/mv/class/1.0/ClassDescription\"('" + mv_without_qname(lCurClassName) + "');", lOnDocstring);
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
  lPropDoc.append($("<p />"));
  var lOnDocstringSuccess = function(_pJson) { lPropDoc.append("<h4>docstring:</h4>&nbsp;"+ _pJson[0][mv_with_qname("http://localhost/mv/property/1.0/hasDocstring")]); }
  var lOnDocstring = new QResultHandler(lOnDocstringSuccess, function(){}, null);
  mv_query("SELECT * FROM \"http://localhost/mv/class/1.0/AttributeDescription\"('" + mv_without_qname(lCurPropName) + "') UNION SELECT * FROM \"http://localhost/mv/class/1.0/RelationDescription\"('" + lCurPropName + "');", lOnDocstring);
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
        mv_query("SELECT * FROM " + mv_sanitize_classname(__pClass) + " WHERE mv:pinID=@" + pPID + ";", __lOnCount, true);
      }
  }
  if (undefined != MV_CONTEXT.mClasses)
  {
    var lChk = new lCheckClasses(MV_CONTEXT.mClasses.length);
    for (var iC = 0; null != MV_CONTEXT.mClasses && iC < MV_CONTEXT.mClasses.length; iC++)
    {
      var lClass = mv_without_qname(MV_CONTEXT.mClasses[iC]["mv:URI"]);
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
  mv_query("SELECT * WHERE mv:pinID=@" + pPID + ";", lOnData);
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

// TODO: a batch mode in js (eval())?
// TODO (Ming): special hints for divergences from standard SQL
// TODO (Ming): links from mvstore console to documentation and vice versa (e.g. execute code snippet)
// TODO: future modes (e.g. graph navigator, erdiagram, wizard to create pins that conform with 1..n classes, ...)
