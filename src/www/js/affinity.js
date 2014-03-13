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
  this.clear =
    function()
    {
      $("#nav li").each(
        function(_pI, _pE)
        {
          var _lAnchor = $("a", _pE)[0];
          lTabContentFromName(lTabNameFromA(_lAnchor)).css("display", "none");
        });
     $("#content").append($("<p id='_navtabs_loading'>Loading...</p>"));
    };
  this.start =
    function()
    {
      // For each <li> of #nav, record it as a tab in lTabs, and bind lOnTab to the click event.
      $("#_navtabs_loading").remove();
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
    };
}

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
  var lReSilentOp = /(\s*start\s*transaction\s*)|(\s*commit\s*)|(\s*rollback\s*)|(\s*set\s*prefix\s)/i;
  var lQueries = afy_without_comments(this.mQueryAreaQ.val(), false).text.replace(/\n/g,"").replace(/;\s*$/, "").split(';');
  var lNumNonSilentQueries = lQueries.filter(function(_pQ) { return !_pQ.match(lReSilentOp); }).length;
  var lOnResults =
    function(_pJson)
    {
      if (0 == _pJson.length || (lQueries.length > 1 && lQueries.length < _pJson.length))
        return;
      var iQr = 0;
      for (var iQ = 0; iQ < lQueries.length; iQ++)
      {
        var _lPage = {ui:$("<div style='overflow:hidden; width:100%; height:100%;'/>"), query:(lQueries[iQ] + ";"), result:null};
        var _lSilentOp = (undefined != _lPage.query.match(lReSilentOp));
        if (_lSilentOp) // E.g. txops and SET PREFIX don't produce any json result.
          _lPage.ui.append($("<p>ok</p>"));
        else
          _lPage.result = new QResultTable(_lPage.ui, null, {onPinClick:on_pin_click});
        AFY_CONTEXT.mQueryHistory.recordQuery(_lPage.query);
        lThis.mResultList.append($("<option>" + _lPage.query + "</option>"));
        lThis.mPages.push(_lPage);
        lThis.mResultPage.append(_lPage.ui);
        if (!_lSilentOp)
        {
          var _lData = (1 == lNumNonSilentQueries) ? _pJson : _pJson[iQr++];
          _lPage.result._setNumRows(_lData.length);
          _lPage.result._recordRows(_lData, 0);
          _lPage.result._onScroll(0);
        }
        _lPage.ui.css("display", "none");
      }
    };
  var lOnError =
    function(_pError)
    {
      if (_pError[0].responseText.length > 0)
        alert(_pError[0].responseText);
      else
        alert("An error occurred (on the server or during communication).");
    }
  afy_batch_query(lQueries, new QResultHandler(lOnResults, lOnError), {sync:true});
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
  if (AFY_CONTEXT.mMobileVersion)
  {
    // Review: deactivate with a lManageWindowEvents...
    var lScrollOnMobile = new ScrollOnMobile("#query_history");
    lScrollOnMobile.activate();
  }
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
      function _sanitizeStr(__pStr) { return __pStr.replace(/'/g, ""); };
      function print(__pWhat) { lThis.mHistory.append($("<p class='tutorial_result'>" + _stringify(__pWhat, false) + "</p>")); }
      function usePrefix(__pPfxName, __pPfxScope, __pPfxField, __pPfxPurpose, __pRemember)
      {
        var __lPfx = _sanitizeStr(__pPfxScope + '/' + __pPfxField);
        lThis.mCurPrefixes[__pPfxName] = __lPfx;
        if (__pRemember)
        {
          var __lOnCount =
            function(__pJsonCnt)
            {
              if (undefined != __pJsonCnt && 0 != parseInt(__pJsonCnt))
                return;
              var __lQ = "INSERT \"http://localhost/afy/preferredPrefix/scope\"='" + _sanitizeStr(__pPfxScope);
              __lQ += "', \"http://localhost/afy/preferredPrefix/name\"='" + _sanitizeStr(__pPfxName);
              __lQ += "', \"http://localhost/afy/preferredPrefix/value\"='" + __lPfx;
              __lQ += "', \"http://localhost/afy/preferredPrefix/description\"='" + _sanitizeStr(__pPfxPurpose) + "';";
              afy_query(__lQ, new QResultHandler(null, null, null), {sync:true});
            };
          afy_query("SELECT * FROM \"http://localhost/afy/preferredPrefixes\" WHERE \"http://localhost/afy/preferredPrefix/name\"='" + _sanitizeStr(__pPfxName) + "';", new QResultHandler(__lOnCount, null, null), {countonly:true});
        }
      }
      function unusePrefix(__pPfxName) { if (__pPfxName in lThis.mCurPrefixes) delete lThis.mCurPrefixes[__pPfxName]; }
      function pathsql(__pSql)
      {
        if (stepStopped()) { return ""; }

        // Log in the query history.
        // WARNING:
        //   This proves to be catastrophically slow, and is so detrimental to the
        //   performance of the tutorial that I decided to forget about it.
        // AFY_CONTEXT.mQueryHistory.recordQuery(__pSql);

        var __lEvalResult = null;
        var __lOnPathsql = function(__pJson, __pD) { _onPathsqlResult(__pJson); __lEvalResult = __pJson; }

        // Prepend prefixes, if any.
        var __lPrefixesStr = "";
        for (var __iP in lThis.mCurPrefixes)
          __lPrefixesStr += "SET PREFIX " + __iP + ": '" + lThis.mCurPrefixes[__iP] + "'; ";

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
          lThis.mPendingTx.push(__lPrefixesStr + __pSql);
          return {"note":"in the web console, results of operations in a transaction are returned upon commit"};
        }
        else
        {
          afy_query(__lPrefixesStr + afy_sanitize_semicolon(__pSql), new QResultHandler(__lOnPathsql, function(__pError){ print("error:" + __pError[0].responseText); }), {sync:true});
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
        lThis.mTSI = 0;
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
                  function(_pI, _pE) { lThis.mInput.val(lThis.mInput.val() + $(_pE).html().replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")); });
                lExecuteLine();
                lThis.mTSI = 0;
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
      function s(__pStep) { step(__pStep); }
      function next() { n(); }
      function stopStep() { lThis.mTSI = 1; }
      function stepStopped() { return (0 != lThis.mTSI); }
      var _lStmt = lThis.mInput.val().replace(/var/, ""); // Review: should we support var?
      var _lQuickStep = _lStmt.match(/^\s*s\s*([0-9]+)\s*$/); // Quick step: s 5
      if (_lStmt == "t") _lStmt = "t()";
      else if (_lStmt == "n") _lStmt = "n()";
      else if (_lStmt == "h") _lStmt = "h()";
      else if (_lStmt == "next") _lStmt = "n()";
      else if (undefined != _lQuickStep) _lStmt = "step(" + _lQuickStep[1] + ")";
      lThis.mPushInput();
      lThis.mStmtHistory.push(_lStmt);
      lThis.mStmtHistoryCursor = null;
      eval(_lStmt);
      lThis.mScroll();
    };
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
  var lDropFocus = function() { if (AFY_CONTEXT.mMobileVersion) { lThis.mInput.blur(); } }; // Keyboard area tends to confuse the rendering of the page otherwise (e.g. weird white offset at the top of the page on iphone, when I click on the step button while keyboard is still up).
  this.mPushInput = function() { lThis.mHistory.append($("<p class='tutorial_stmt'>&gt;" + lThis.mInput.val().replace(/<br>/g, "&lt;br&gt;") + "</p>")); lThis.mInput.val(''); lDropFocus();  }
  this.mScroll = function() { $("#tutorial_area").scrollTop(lThis.mHistory.height() + 2 * $("#tutorial_input").height() - $("#tutorial_area").height()); $("#tutorial_area").scrollLeft(0); }
  this.mTutorialStep = 0;
  this.mCurPrefixes = {};
  this.mTSI = 0; // Tutorial Step Interrupt.
  if (AFY_CONTEXT.mMobileVersion)
  {
    // Review: deactivate with a lManageWindowEvents...
    var lScrollOnMobile = new ScrollOnMobile("#tutorial_area");
    lScrollOnMobile.activate();
  }
  else
  {
    // Note:
    //   Auto-focus on input line is nice on a std mouse+kbd environment, but it
    //   pops up the keyboard on mobile, which turns out to be annoying.
    var lCurPoint = {x:0, y:0};
    var lAnchorPoint = {x:0, y:0};
    $("#tutorial_area").mousemove(function(e) { lCurPoint.x = e.pageX; lCurPoint.y = e.pageY; });
    $("#tutorial_area").mousedown(function() { lAnchorPoint.x = lCurPoint.x; lAnchorPoint.y = lCurPoint.y; });
    $("#tutorial_area").mouseup(function() { if (Math.abs(lCurPoint.x - lAnchorPoint.x) < 5 && Math.abs(lCurPoint.y - lAnchorPoint.y) < 5) lThis.mInput.focus(); }); // Give focus to the input line, but only if the mouse hasn't moved significantly (otherwise, let it do its standard job, e.g. for selection and copy&paste).
    $("#tab-tutorial").bind("activate_tab", function() { lThis.mInput.focus(); });
  }
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
          var _lV = parseInt(_pLayoutCtx.result[_iE]["afy:count"]);
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
          var _lVal = parseInt(lLayoutCtx.result[_iE]["afy:count"]);
          var _lHeight = _lHUnit * _lVal;
          l2dCtx.fillStyle = "#20a0ee";
          l2dCtx.fillRect(_lX, lVPHeight - 2 - _lHeight, 20, _lHeight);
          l2dCtx.fillStyle = "#444";
          l2dCtx.rotate(-0.5 * Math.PI);
          l2dCtx.fillText(lLayoutCtx.result[_iE]["afy:value"] + " (" + _lVal + ")", - lVPHeight + 5, _lX + 14);
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
      $("#histo_query").html(afy_with_qname_prefixes("<br>SELECT HISTOGRAM(" + lQProp + ") FROM " + lQClass));
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
        var _lCn = AFY_CONTEXT.mClasses[_iC]["afy:objectID"];
        $("#histo_class").append($("<option value=\"" + _lCn + "\">" + _lCn + "</option>"));
      }
      lQClass = $("#histo_class option:selected").val();
    }
    lDoUpdateProperties();
  }

  // Pan & Zoom etc.
  $("#histo_area").mousemove(function(e) { lPanZoom.onMouseMove(e); if (lPanZoom.isButtonDown()) lDoDraw(); });
  $("#histo_area").mousedown(function(e) { lPanZoom.onMouseDown(); });
  $("#histo_area").mouseup(function() { if (!lPanZoom.didMove()) { lPanZoom.reset(); lDoDraw(); } lPanZoom.onMouseUp(); });
  $("#histo_area").mouseout(function() { lPanZoom.onMouseUp(); });
  $("#histo_area").mouseleave(function() { lPanZoom.onMouseUp(); });
  var lOnWheel = function(e) { lPanZoom.onWheel(e); lDoDraw(); return false; }
  var lMouseOnMobile = new TrackMouseOnMobile(
    "#histo_area",
    {
      'wheel':function(p) { lPanZoom.onMouseMove({pageX:p.x, pageY:p.y}); lPanZoom.onWheel(p); lDoDraw(); },
      'mousedown':function(p) { lPanZoom.onMouseMove({pageX:p.x, pageY:p.y}); lPanZoom.onMouseDown(); },
      'mousemove':function(p) { lPanZoom.onMouseMove({pageX:p.x, pageY:p.y}); if (lPanZoom.isButtonDown()) lDoDraw(); },
      'mouseup':function() { lPanZoom.onMouseUp(); }
    });
  var lUpdateCanvasSize = function() { var _lA = $("#histo_area"); _lA.attr("width", _lA.width()); _lA.attr("height", _lA.height()); }
  var lOnResize = function() { lVPHeight = $("#histo_area").height(); lPanZoom = new PanZoom($("#histo_area"), 1.0); lUpdateCanvasSize(); lDoRefresh(); }
  var lManageWindowEvents =
    function(_pOn)
    {
      var _lFunc = _pOn ? window.addEventListener : window.removeEventListener;
      _lFunc('resize', lOnResize, true);
      _lFunc('mousewheel', lOnWheel, true);
      _lFunc('DOMMouseScroll', lOnWheel, true);
      _lFunc('keydown', lPanZoom.onKeyDown, true);
      _lFunc('keyup', lPanZoom.onKeyUp, true);
      lMouseOnMobile.activation(_pOn);
    }

  // Other interactions.
  $("#histo_class").change(function() { lQClass = $("#histo_class option:selected").val(); lDoUpdateProperties(); });
  $("#histo_property").change(function() { lQProp = $("#histo_property option:selected").val(); lDoUpdateQuery(); });
  $("#histo_go").click(function() { lDoRefresh(); return false; });
  $("#tab-histogram").bind("activate_tab", function() { lManageWindowEvents(true); populate_classes(function() { lDoUpdateClasses(); lOnResize(); }); });
  $("#tab-histogram").bind("deactivate_tab", function() { lManageWindowEvents(false); });

  // Initialize the canvas's dimensions (critical for rendering quality).
  lUpdateCanvasSize();
}

/**
 * SimpleDlg.
 */
function SimpleDlg(pDlgRs, pOkRs, pCancelRs, pOnOk, pOnCancel)
{
  var lCloseDlg = function() { pDlgRs.css("visibility", "hidden"); pDlgRs.unbind('keyup'); pOkRs.unbind('click'); pCancelRs.unbind('click'); };
  var lDo =
    function()
    {
      if (pDlgRs.css("visibility") == "hidden")
        return;
      if (pOnOk)
        pOnOk(lCloseDlg);
    };
  pDlgRs.css("visibility", "visible");
  pDlgRs.keyup(function(_e) { if (_e.which == 13) lDo(); else if (_e.which == 27) lCloseDlg(); });
  pOkRs.click(lDo);
  pCancelRs.click(function() { if (pOnCancel) { pOnCancel(); } lCloseDlg(); });
}

/**
 * popDlgNewRule.
 */
function popDlgNewRule(pOnOk, pOnCancel)
{
  var lAddChoice =
    function(_pChoiceType, _pPopulateFunc)
    {
      var _lCur = $("#dlg_newrule_" + _pChoiceType + "s select");
      var _lCurNum = _lCur.size();
      var _lNew = $("<select id='dlg_newrule_" + _pChoiceType + "_" + _lCurNum + "' style='width:100%;'></select>");
      _pPopulateFunc(_lNew, true);
      _lNew.insertAfter(_lCur.last());
    };
  // Hack for native browser on android2.x.
  // Problem:
  //   http://code.google.com/p/android/issues/detail?id=6721
  //   z-index is not properly respected and lets controls underneath the dlg capture the input.
  // Note:
  //   I tried a lot of workarounds but none was great; for the time being, I prefer just hiding the background
  //   for those devices+agents(browsers). Maybe something to learn from jquerytools.org.
  var lAndroidHack = navigator.userAgent.match(/.*(android\s[0-9]+\.).*(applewebkit).*(mobile\ssafari)/i);
  if (lAndroidHack) { $("#content_left").find('*').css("visibility", "hidden"); }
  var lUnbindButtons =
    function()
    {
      $("#dlg_newrule_condition_add").unbind('click');
      $("#dlg_newrule_action_add").unbind('click');
      if (lAndroidHack) { $("#content_left").find('*').css("visibility", "visible"); }
    };
  get_conditions_and_actions(
    function(_pConditions, _pActions)
    {
      var _lAddNil = function(_pSelectList) { _pSelectList.append($("<option value='nil'>nil</value>")); };
      var _lPopulateConditions = function(_pSelectList, _pWithNil) { _pSelectList.empty(); _pConditions.forEach(function(_c) { _pSelectList.append("<option value='" + _c.id + "'>" + _c.id /*+ " : " + _c.condition*/ + "</option>"); }); if (_pWithNil) { _lAddNil(_pSelectList); } };
      var _lPopulateActions = function(_pSelectList, _pWithNil) { _pSelectList.empty(); _pActions.forEach(function(_c) { _pSelectList.append("<option value='" + _c.id + "'>" + _c.id /*+ " : " + _c.action*/ + "</option>"); }); if (_pWithNil) { _lAddNil(_pSelectList); } };
      var _lAddCondition = function() { lAddChoice("condition", _lPopulateConditions); return false; }
      var _lAddAction = function() { lAddChoice("action", _lPopulateActions); return false; }
      // Start afresh.
      $("#dlg_newrule_name").val('');
      $("#dlg_newrule_conditions select").each(function(_pI, _pE) { if (_pI > 0) { $(_pE).remove(); } });
      $("#dlg_newrule_actions select").each(function(_pI, _pE) { if (_pI > 0) { $(_pE).remove(); } });
      _lPopulateConditions($("#dlg_newrule_condition_0"));
      _lPopulateActions($("#dlg_newrule_action_0"));
      $("#dlg_newrule_condition_add").click(_lAddCondition);
      $("#dlg_newrule_action_add").click(_lAddAction);
      // Launch.
      new SimpleDlg($("#dlg_newrule"), $("#dlg_newrule_ok"), $("#dlg_newrule_cancel"),
        function(_pCloseDlg)
        {
          // Build resulting rule, trimming out undesired stuff (nil, repeats etc.).
          var _lSelectedConditions = {d:{}, l:[]}, _lSelectedActions = {d:{}, l:[]};
          var _lAddUnique = function(_pSet, _pWhat) { if (_pWhat == "nil" || _pWhat in _pSet.d) return; _pSet.d[_pWhat] = 1; _pSet.l.push(_pWhat); };
          $("#dlg_newrule_conditions select").each(function(_pI, _pE) { _lAddUnique(_lSelectedConditions, $(_pE).val()); });
          $("#dlg_newrule_actions select").each(function(_pI, _pE) { _lAddUnique(_lSelectedActions, $(_pE).val()); });
          var _lName = $("#dlg_newrule_name").val();
          var _lResultingRule = "RULE " + (_lName.length > 0 ? _lName : "myrule") + " : " + _lSelectedConditions.l.join(" AND ") + " -> " + _lSelectedActions.l.join(", ");
          // Done.
          lUnbindButtons();
          _pCloseDlg();
          if (pOnOk)
            pOnOk(_lResultingRule);
        },
        function() { lUnbindButtons(); pOnCancel(); });
    });
}

/**
 * Document entry point (by callback).
 */
$(document).ready(
  function()
  {
    try
    {
      // Determine if we're running the mobile version.
      AFY_CONTEXT.mMobileVersion = (undefined != location.pathname.match(/^\/m\//));
      // Home/logo button.
      $("#gh_logo_img").hover(function() { $(this).addClass("logo-highlighted"); }, function() { $(this).removeClass("logo-highlighted"); });
      $("#gh_logo_img").click(function() { window.location.href = 'http://' + location.hostname + ":" + location.port; });
      // Initially, hide all tabs, to avoid displaying garbage if for any reason we fail to reach actual tabs setup later on (in start()).
      AFY_CONTEXT.mNavTabs = new NavTabs();
      AFY_CONTEXT.mNavTabs.clear();
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
      // Setup hard-coded / pre-configured / preferred prefixes.
      afy_create_class(
        "http://localhost/afy/preferredPrefixes",
        "CREATE CLASS \"http://localhost/afy/preferredPrefixes\" AS SELECT * WHERE EXISTS(\"http://localhost/afy/preferredPrefix/name\") AND EXISTS(\"http://localhost/afy/preferredPrefix/value\") AND EXISTS(\"http://localhost/afy/preferredPrefix/scope\")",
        function() { afy_setup_preferred_prefixes(false); });
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
      var lUpdateSuggestions =
        function()
        {
          if (!AFY_CONTEXT.mMobileVersion)
            return;
          var lQuerySuggest = $("#querysuggest");
          lQuerySuggest.empty();
          lQuerySuggest.append($("<option value='_suggest'>" + $("#menuitem_query_suggest").text() + "</option>"));
          lQuerySuggest.append($("<option value='_newrule'>" + $("#menuitem_query_newrule").text() + "</option>"));
          lQuerySuggest.append($("<option value='SELECT RAW *'>" + $("#menuitem_query_all").text() + "</option>"));
          if (undefined == AFY_CONTEXT.mClasses)
            return;
          for (var _iC = 0; _iC < AFY_CONTEXT.mClasses.length; _iC++)
          {
            var _lCn = AFY_CONTEXT.mClasses[_iC]["afy:objectID"];
            lQuerySuggest.append($("<option value='SELECT RAW * FROM " + _lCn + "'>" + _lCn + "</option>"));
          }
        };
      $("#tab-basic").bind("activate_tab", function() { populate_classes(lUpdateSuggestions); if (undefined != AFY_CONTEXT.mLastQResult) { AFY_CONTEXT.mLastQResult.onActivateTab(); } if (!AFY_CONTEXT.mMobileVersion) { $("#query").focus(); } });
      $("#tab-basic").bind("deactivate_tab", function() { if (undefined != AFY_CONTEXT.mLastQResult) { AFY_CONTEXT.mLastQResult.onDeactivateTab(); } });
      // Start the main navigational tab system.
      // Note: We set this up after the actual tabs, in order for them to receive the initial 'activate_tab'.
      AFY_CONTEXT.mNavTabs.start();
      // Setup tooltips/menus.
      if (AFY_CONTEXT.mMobileVersion)
      {
        (new ScrollOnMobile("#result_pin")).activate();
        $("#querysuggest").change(
          function()
          {
            // Get current suggestion.
            var _lSuggestion = $("#querysuggest option:selected").val();
            // Set it as the current query, if relevant.
            if (_lSuggestion.charAt(0) != '_')
              $("#query").val(_lSuggestion);
            else if (_lSuggestion == "_newrule")
            {
              popDlgNewRule(
                function(_pNr) { $("#query").val(_pNr); $("#querysuggest").val("_suggest"); },
                function() { $("#querysuggest").val("_suggest"); });
              // On iphone, this gets rid of the selection list... otherwise it stays there and must be closed manually;
              // this behavior is actually nice for plain selections (allows to try in-place many options quickly),
              // so I left it there, except in the case of a new rule, where it becomes undesirable.
              $("#querysuggest").blur();
            }
          });
      }
      else
      {
        // Setup the basic tooltips.
        bindAutomaticTooltips();
        // Setup static context menus.
        bindStaticCtxMenus();
      }
      // Setup the persistent cache for the query history.
      AFY_CONTEXT.mQueryHistory = new QHistory($("#query_history"), AFY_CONTEXT.mUIStore);
      // Unless the deployment is local, don't show the administration tab.
      if (undefined == location.hostname.match(/(localhost|127\.0\.0\.1)/i))
        disableTab("#tab-config");
      // Setup the initial query string, if one was specified (used for links from doc to console).
      var lInitialQ = location.href.match(/query\=(.*?)((&.*)|(#.*)|\0)?$/i);
      if (undefined != lInitialQ && lInitialQ.length > 0)
        $("#query").val(unescape(lInitialQ[1].replace(/\+/g, " ")));
      var lInitialStoreId = location.href.match(/storeid\=(.*?)((&.*)|(#.*)|\0)?$/i);
      if (undefined != lInitialStoreId && lInitialStoreId.length > 0)
      {
        $("#storeident").val(unescape(lInitialStoreId[1]));
        $("#storepw").val("");
      }
      if (0 == AFY_CONTEXT.mStoreIdent.length)
      {
        AFY_CONTEXT.mStoreIdent = $("#storeident").val() || "";
        AFY_CONTEXT.mStorePw = $("#storepw").val() || "";
      }
      // UI callback for query form.
      $("#form").submit(function() {
        if (AFY_CONTEXT.mMobileVersion)
          $("#querysuggest").val("_suggest");
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
          AFY_CONTEXT.mLastQResult = new QResultTable(lResultList, lClassName, {onPinClick:on_pin_click});
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
      $("#storeident").change(function() { AFY_CONTEXT.mStoreIdent = $("#storeident").val(); populate_classes(); if (undefined != AFY_CONTEXT.mUIStore) { AFY_CONTEXT.mUIStore.set('laststoreident', $("#storeident").val()); } });
      $("#storepw").change(function() { AFY_CONTEXT.mStorePw = $("#storepw").val(); populate_classes(); if (undefined != AFY_CONTEXT.mUIStore) { AFY_CONTEXT.mUIStore.set('laststorepw', $("#storepw").val()); } });
    }
    catch(e)
    {
      alert("Failed to start the console: " + e);
    }
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
  afy_setup_preferred_prefixes(true,
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
          var lCName = _pJson[i]["afy:objectID"];
          var lOption = "<option value=\"" + lCName + "\">" + lCName + "</option>";
          $("#classes").append(lOption);
        }
        on_class_change();
        if (undefined != pOnDone)
          pOnDone(_pJson);
      }));
}

function on_class_change()
{
  update_qnames_ui();

  var lCurClassName = $("#classes option:selected").val();
  var lCurClass = function(_pN){ for (var i = 0; null != AFY_CONTEXT.mClasses && i < AFY_CONTEXT.mClasses.length; i++) { if (AFY_CONTEXT.mClasses[i]["afy:objectID"] == _pN) return AFY_CONTEXT.mClasses[i]; } return null; }(lCurClassName);
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
  $("#query").val("SELECT RAW * FROM " + lCurClassName + ";");
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
  if (undefined == pPID) // e.g. histogram result...
    return;
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
  if (!('_handler' in constructor.prototype))
    constructor.prototype._handler = new pin_info_handler($("#result_pin"));
  constructor.prototype._handler(pPID);
}
