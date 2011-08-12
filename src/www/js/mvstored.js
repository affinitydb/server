// idea from Ming: hints in comparison with standard SQL (e.g. insert into...)
// idea from Ming: links from mvstore console to documentation
// idea from Ming: links from documentation to mvstore console (e.g. execute code snippet)
// old idea: advanced views vs learning views

/**
 * Globals/Constants.
 */
var DB_ROOT = "/db/";
var MV_CONTEXT = new Object();
MV_CONTEXT.mClasses = null;
MV_CONTEXT.mLastQueriedClassName = "";
MV_CONTEXT.mLastQResult = null;
MV_CONTEXT.mSelectedPID = null;
MV_CONTEXT.mPrefix2QName = new Object();
MV_CONTEXT.mQName2Prefix = new Object();
MV_CONTEXT.mQNamesDirty = false;

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
  this._init();
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
QResultTable.prototype._init = function()
{
  // Clear the table.
  this.mTable.empty();

  // Create the column headers.
  var lHead = $("<thead />").appendTo(this.mTable);
  var lHeadR = $("<tr />").appendTo(lHead);
  lHeadR.append($("<th align=\"left\">PID</th>"));
  this.mClassProps = new Object();
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
  lHeadR.append($("<th align=\"left\">Other Properties</th>"));
}
QResultTable.prototype._addRows = function(pQResJson)
{
  // Create the rows.
  var lBody = $("<tbody />").appendTo(this.mTable);
  var lJson = pQResJson;
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

    // Create the last column (all remaining properties).
    lOtherProps = "";
    for (var iProp in lJson[i])
    {
      if (iProp == "id") continue;
      if (iProp in this.mClassProps) continue;
      lOtherProps += iProp + "=\"" + this._createValueUI(lJson[i][iProp], lRefs, lJson[i]["id"] + "rqt") + "\" ";
    }
    if (lOtherProps.length > 0)
      { lRow.append($("<td>" + lOtherProps + "</td>")); }

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
    else if (parseInt(iElm) == 0)
    {
      var lResult = "";
      for (iElm in pProp)
        { lResult += QResultTable.createValueUI(pProp[iElm], pRefs, pRefPrefix) + " "; }
      return lResult;
    }
    else { console.log("Unexpected property: " + iElm); }
  }
}
QResultTable.prototype._createValueUI = QResultTable.createValueUI;

/**
 * Document entry point (by callback).
 */
$(document).ready(function() {
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
        MV_CONTEXT.mLastQResult = new QResultTable(lResultList, MV_CONTEXT.mLastQueriedClassName);
        MV_CONTEXT.mLastQResult.populate($("#query").val());
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
  var lLastSlash = pRawName.lastIndexOf("/");
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
  } catch(e) { console.log("ERROR (mv_sanitize_json_result): " + e); }
  return null;
}
function mv_sanitize_classname(pClassName)
{
  return (pClassName.charAt(0) != "\"" && pClassName.indexOf("/") > 0) ? ("\"" + pClassName + "\"") : pClassName;
}
function QResultHandler(pOnSuccess, pOnError, pUserData) { this.mOnSuccess = pOnSuccess; this.mOnError = pOnError; this.mUserData = pUserData; }
QResultHandler.prototype.onsuccess = function(pJson, pSql) { if (this.mOnSuccess) this.mOnSuccess(pJson, this.mUserData, pSql); }
QResultHandler.prototype.onerror = function(pArgs, pSql) { if (this.mOnError) this.mOnError(pArgs, this.mUserData, pSql); else console.log("QResultHandler caught error: " + pArgs[1]); }
function mv_query(pSqlStr, pResultHandler, pCountOnly, pLimit, pOffset)
{
  if (null == pSqlStr || 0 == pSqlStr.length || pSqlStr.charAt(pSqlStr.length - 1) != ";")
    { console.log("invalid sql: " + pSqlStr); pResultHandler.onerror(null, pSqlStr); return; }
  $.ajax({
    type: "GET",
    url: DB_ROOT + "?q=" + escape(pSqlStr) + "&i=mvsql&o=json" + (pCountOnly ? "&type=count" : "") + ((null != pLimit) ? ("&limit=" + pLimit) : "") + ((null != pOffset) ? ("&offset=" + pOffset) : ""),
    dataType: "text", // Review: until mvStore returns 100% clean json...
    timeout: 10000,
    cache: false,
    global: false,
    success: function(data) { pResultHandler.onsuccess(mv_sanitize_json_result(data), pSqlStr); },
    error: function() { pResultHandler.onerror(arguments, pSqlStr); }
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
    if (undefined == _pJson) { console.log("populate_class failed with undefined _pJson"); return; }
    for (var i = 0; i < _pJson.length; i++)
    {
      var lCName = _pJson[i]["mv:URI"];
      var lOption = "<option value=\"" + lCName + "\">" + lCName + "</option>";
      $("#classes").append(lOption);
    }
    on_class_change();
  };
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
  var lOnDocstringSuccess = function(_pJson) { lClassDoc.append("<h4>docstring:</h4>&nbsp;"+ _pJson[0][mv_with_qname("http://localhost/mv/property/1.0/hasDocstring")]); }
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
  lPropDoc.append($("<p></p>"));
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
  for (var iC = 0; null != MV_CONTEXT.mClasses && iC < MV_CONTEXT.mClasses.length; iC++)
  {
    var lClass = mv_without_qname(MV_CONTEXT.mClasses[iC]["mv:URI"]);
    var lOnSuccess = function(_pJson, _pClass) { if (parseInt(_pJson) > 0) lPinClasses.append(" " + mv_with_qname(_pClass)); };
    var lOnCount = new QResultHandler(lOnSuccess, null, lClass);
    mv_query("SELECT * FROM " + mv_sanitize_classname(lClass) + " WHERE mv:pinID=@" + pPID + ";", lOnCount, true);
  }
  var lOnDataSuccess = function(_pJson) {
    var lTxt = ""
    var lRefs = new Object();
    for (iProp in _pJson[0])
      { lTxt += iProp + "=" + QResultTable.createValueUI(_pJson[0][iProp], lRefs, pPID + "refdet") + "  "; }
    lPinArea.append($("<p>" + lTxt + "</p>"));
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

// TODO: button/right-click to query only for the pin in the detail section
// TODO: context menu (on query edit): suggest things like "ft in current class" (SELECT * FROM testphotos2_class_users MATCH AGAINST('jill');)
// TODO: context menu (on pin/class/prop): do various things on current class/prop/pin/...
// TODO: context menu: class creation helper; right-click -> class drop etc.
// TODO: history in the query, and ability to export a log (learn mvsql by clicks)
// TODO: left pane for various browsing/viewing modes (e.g. erdiagram, help create pins that conform with 1..n classes, ...)
// TODO: results: fine tune the table presentation (e.g. maybe also show props not of the class as columns, in certain cases, maybe with different visuals)
