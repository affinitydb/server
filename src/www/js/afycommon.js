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
 * Globals/Constants.
 */
var DB_ROOT = "/db/";
var AFY_CONTEXT = {}; // Global app context.
AFY_CONTEXT.mNavTabs = null; // Main tab/page-navigation system.
AFY_CONTEXT.mQueryHistory = null; // Query history view.
AFY_CONTEXT.mClasses = null; // The current result of 'SELECT FROM afy:Classes'.
AFY_CONTEXT.mFullIntrospection = false; // Whether or not additional introspection hints are present (such as produced by modeling.py).
AFY_CONTEXT.mLastQResult = null; // The last query result table (for 'abort' - might be deprecated).
AFY_CONTEXT.mSelectedPID = null; // In the 'Basic Console', the currently selected pin.
AFY_CONTEXT.mDef2QnPrefix = {}; // Dictionary of 'http://bla/bla' to 'qn123'.
AFY_CONTEXT.mQnPrefix2Def = {}; // Dictionary of 'qn123' to {value:'http://bla/bla', scope:'http://bla' [or null]}, where scoped elements are usually explicitly defined, and treated in priority compared to automatic prefixes.
AFY_CONTEXT.mQnScopes = {}; // Dictionary of unique scopes (see mQnPrefix2Def just above for more details).
AFY_CONTEXT.mQNamesDirty = false; // For lazy update of qname prefixes, based on new query results.
AFY_CONTEXT.mTooltipTimer = null; // For tooltips.
AFY_CONTEXT.mStoreIdent = ""; // The current store identity specified by the user.
AFY_CONTEXT.mStorePw = ""; // The current store password specified by the user.
AFY_CONTEXT.mMobileVersion = (undefined != location.pathname.match(/^\/m\//)); // Whether or not the user is currently visualizing the mobile version.

/**
 * General-purpose helpers.
 */
function trimPID(pPID) { return undefined != pPID ? pPID.replace(/^0+/, "") : undefined; }
function countProperties(pO) { var lR = 0; for(var iP in pO) { if (pO.hasOwnProperty(iP)) lR++; } return lR; }
function nthProperty(pO, pN) { var i = 0; var lPn = null; for (var iP in pO) { if (i == pN) { lPn = iP; break; } i++; } return lPn; }
function myLog(pMsg) { if (("msie" in $.browser && $.browser["msie"]) || undefined == typeof(console)) { return; } console.log(pMsg); }
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
function afy_create_class(pName, pDecl, pCompletion)
{
  var lDoProceed = function() { afy_post_query(pDecl, new QResultHandler(pCompletion, null, null)); }
  var lOnCount = function(_pJson) { if (undefined == _pJson || parseInt(_pJson) == 0) { lDoProceed(); } else { pCompletion(); } }
  afy_query("SELECT * FROM afy:Classes WHERE CONTAINS(afy:objectID, '" + pName + "')", new QResultHandler(lOnCount, null, null), {countonly:true});
}
function afy_setup_preferred_prefixes(pAll, pCompletion)
{
  var lOnPrefixes =
    function(_pJson)
    {
      if (undefined != _pJson)
        for (var _i = 0; _i < _pJson.length; _i++)
          afy_add_qnprefix(_pJson[_i]["http://localhost/afy/preferredPrefix/scope"], _pJson[_i]["http://localhost/afy/preferredPrefix/name"], _pJson[_i]["http://localhost/afy/preferredPrefix/value"]);
      if (undefined != pCompletion)
        pCompletion();
    };
  afy_add_qnprefix(null, 'afy', 'http://affinityng.org/builtin');
  afy_add_qnprefix(null, 'srv', 'http://affinityng.org/service');
  if (pAll)
    afy_query("SELECT * FROM \"http://localhost/afy/preferredPrefixes\"", new QResultHandler(lOnPrefixes, function() {}, null), {longnames:true});
  else if (pCompletion)
    pCompletion();
}
function afy_add_qnprefix(pScope, pName, pValue)
{
  AFY_CONTEXT.mDef2QnPrefix[pValue] = pName;
  AFY_CONTEXT.mQnPrefix2Def[pName] = {value:pValue, scope:pScope};
  if (undefined != pScope)
  {
    if (!(pScope in AFY_CONTEXT.mQnScopes))
      { AFY_CONTEXT.mQnScopes[pScope] = [pValue]; }
    else
    {
      var lFound = false;
      for (var iS = 0; iS < AFY_CONTEXT.mQnScopes[pScope].length && !lFound; iS++)
        lFound = AFY_CONTEXT.mQnScopes[pScope][iS] == pValue;
      if (!lFound)
        { AFY_CONTEXT.mQnScopes[pScope].push(pValue); AFY_CONTEXT.mQnScopes[pScope].sort(); }
    }
  }
  if (!AFY_CONTEXT.mQNamesDirty)
  {
    AFY_CONTEXT.mQNamesDirty = true;
    setTimeout(update_qnames_ui, 2000);
  }
}
function afy_strip_quotes(pFullName)
{
  return (pFullName.match(/^".*"$/) ? pFullName.substr(1, pFullName.length - 2) : pFullName);
}
var afy_keyword_regex = /^((prefix)|(base)|(insert)|(create)|(update)|(delete)|(undelete)|(drop)|(purge)|(select)|(join)|(set)|(add)|(move)|(where)|(from)|(group)|(order)|(having)|(using)|(timer)|(class)|(unique)|(distinct)|(values)|(by)|(as)|(is)|(in)|(to)|(on)|(against)|(and)|(or)|(not)|(case)|(when)|(then)|(else)|(end)|(similar)|(match)|(fractional)|(second)|(minute)|(hour)|(day)|(wday)|(month)|(year)|(between)|(left)|(right)|(inner)|(outer)|(full)|(union)|(intersect)|(except)|(all)|(any)|(some)|(cross)|(nulls)|(asc)|(desc)|(current_timestamp)|(current_user)|(current_store)|(options)|(with)|(into)|(min)|(max)|(abs)|(ln)|(exp)|(power)|(sqrt)|(sin)|(cos)|(tan)|(asin)|(acos)|(atan)|(floor)|(ceil)|(concat)|(lower)|(upper)|(tonum)|(toinum)|(count)|(length)|(sum)|(avg)|(position)|(substr)|(replace)|(pad)|(begins)|(ends)|(exists)|(contains)|(coalesce)|(histogram)|(membership)|(extract)|(cast)|(trim))$/i;
function afy_with_qname(pRawName)
{
  // Quick test; already a qname?
  if (undefined == pRawName) { return null; }
  var lColon = pRawName.indexOf(":");
  if (pRawName.substr(0, lColon) in AFY_CONTEXT.mQnPrefix2Def)
    return pRawName;

  var lNewProp = null;
  pRawName = afy_strip_quotes(pRawName);
  var lLastSlash = -1;
  var lPrefix = null;
  for (var iScope in AFY_CONTEXT.mQnScopes)
  {
    if (0 != pRawName.indexOf(iScope))
      continue;
    // Review: binary search...
    // Note: searching in reverse order to favor longer (i.e. more specific) prefixes...
    for (var iS = AFY_CONTEXT.mQnScopes[iScope].length - 1; iS >= 0 && undefined == lPrefix; iS--)
      if (0 == pRawName.indexOf(AFY_CONTEXT.mQnScopes[iScope][iS]))
        lPrefix = AFY_CONTEXT.mQnScopes[iScope][iS];
    if (undefined != lPrefix)
      { lLastSlash = lPrefix.length; break; }
  }

  if (undefined == lPrefix)
  {
    lLastSlash = (undefined != pRawName) ? pRawName.lastIndexOf("/") : -1;
    if (lLastSlash < 0)
      { return pRawName; }
    lPrefix = pRawName.substr(0, lLastSlash);
  }

  // Note:
  //   At the time of writing this, suffixes that happen to be pathSQL keywords
  //   (e.g. min, max, etc.) are not tolerated, if unquoted.  For the moment I patch here,
  //   even though I don't like to introduce this afy_keyword_regex here... because
  //   I'd rather have uniform rendering everywhere; I might change this later, depending
  //   on Mark's decision regarding this topic.
  var lSuffix = pRawName.substr(lLastSlash + 1);
  if (undefined == lSuffix.match(/^[^0-9]\w+$/) || undefined != lSuffix.match(afy_keyword_regex))
    lSuffix = '"' + lSuffix + '"';
    
  if (lPrefix in AFY_CONTEXT.mDef2QnPrefix)
    { return AFY_CONTEXT.mDef2QnPrefix[lPrefix] + ":" + lSuffix; }
  else
  {
    var lNumQNames = 0;
    for (iQN in AFY_CONTEXT.mDef2QnPrefix) { if (AFY_CONTEXT.mDef2QnPrefix.hasOwnProperty(iQN)) lNumQNames++; }
    var lNewQName = "qn" + lNumQNames;
    AFY_CONTEXT.mDef2QnPrefix[lPrefix] = lNewQName;
    AFY_CONTEXT.mQnPrefix2Def[lNewQName] = {value:lPrefix, scope:null};
    AFY_CONTEXT.mQNamesDirty = true;
    setTimeout(update_qnames_ui, 2000);
    return lNewQName + ":" + lSuffix;
  }
}
function afy_without_qname(pRawName)
{
  // Quick test; already a full name? (TODO: improve)
  if (undefined == pRawName) { return null; }
  var lColon = pRawName.indexOf(":");
  if (lColon < 0)
    { return pRawName; }

  var lQName = pRawName.substr(0, lColon);
  if (lQName in AFY_CONTEXT.mQnPrefix2Def)
  {
    var lSuffix = afy_strip_quotes(pRawName.substr(lColon + 1));
    return AFY_CONTEXT.mQnPrefix2Def[lQName].value + "/" + lSuffix;
  }
  return pRawName;
}
function afy_with_qname_prefixes(pQueryStr)
{
  var lAlreadyDefined = {'http':1, 'afy':1, 'srv':1};
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
        lToDefine[lPrefix] = AFY_CONTEXT.mQnPrefix2Def[lPrefix].value;
      else
        myLog("Unknown prefix: " + lPrefix); // Note: Could happen if for example a URI contains a colon - no big deal.
    }
  }
  var lProlog = "";
  for (var iP in lToDefine)
    { lProlog = lProlog + "SET PREFIX " + iP + ": '" + lToDefine[iP] + "'; "; }
  return lProlog + pQueryStr;
}
function afy_without_comments(pSqlStr, pStartInComment)
{
  var lResult = "";
  var lInString = false;
  var lInSymbol = false;
  var lInComment = pStartInComment;
  for (var iC = 0; iC < pSqlStr.length; iC++)
  {
    var lSkipToEol = function() { while (pSqlStr.charAt(iC) != '\n' && iC < pSqlStr.length) iC++; }
    var lC = pSqlStr.charAt(iC);
    if (lInString)
    {
      lResult += lC;
      if (lC == "'")
        lInString = false;
    }
    else if (lInSymbol)
    {
      lResult += lC;
      if (lC == '"')
        lInSymbol = false;
    }
    else if (lInComment)
    {
      if ((lC == '*') && ((iC + 1) < pSqlStr.length) && (pSqlStr.charAt(iC + 1) == '/'))
        { iC++; lInComment = false; }
    }
    else switch(lC)
    {
      default: lResult += lC; break;
      case '\n':
        lResult += lC;
        if (lInSymbol || lInString)
          myLog('unexpected (afy_without_comments): non-terminated string');
        break;
      case '"': lInSymbol = true; lResult += lC; break;
      case "'": lInString = true; lResult += lC; break;
      case '-':
        if (((iC + 1) < pSqlStr.length) && (pSqlStr.charAt(iC + 1) == '-'))
          { lResult += '\n'; lSkipToEol(); }
        else
          lResult += lC;
        break;
      case '/':
        if (((iC + 1) < pSqlStr.length) && (pSqlStr.charAt(iC + 1) == '*'))
          { iC++; lInComment = true; }
        else
          lResult += lC;
         break;
    }
  }
  return {text:lResult, incomment:lInComment};
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
      var _lNewObj = {};
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
    // Note: The replacement below is due to the fact that for some unknown reason chrome is more sensitive to those extra characters than other browsers.
    var lJsonRaw = $.parseJSON(pResultStr.replace(/\s+/g, " "));
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
function afy_post_query(pSqlStr, pResultHandler, pOptions)
{
  if (null == pSqlStr || 0 == pSqlStr.length)
    { myLog("afy_query: invalid sql " + pSqlStr); pResultHandler.onerror(null, pSqlStr); return; }
  var lSqlStr = afy_with_qname_prefixes(pSqlStr);
  var lHasOption = function(_pOption) { return (undefined != pOptions && _pOption in pOptions); }
  lBody = "q=" + afy_escape_with_plus(lSqlStr) + (lHasOption('countonly') ? "&type=count" : "") + (lHasOption('limit') ? ("&limit=" + pOptions.limit) : "") + (lHasOption('offset') ? ("&offset=" + pOptions.offset) : "");
  $.ajax({
    type: "POST",
    data: lBody,
    url: DB_ROOT + "?i=pathsql&o=json",
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
function afy_batch_to_str(pSqlStrArray)
{
  if (null == pSqlStrArray || 0 == pSqlStrArray.length)
    return null;
  var lBody = "";
  var lInComment = false;
  for (var iStmt = 0; iStmt < pSqlStrArray.length; iStmt++)
  {
    var lLine = afy_without_comments(afy_with_qname_prefixes(pSqlStrArray[iStmt]), lInComment);
    lInComment = lLine.incomment;
    lBody = lBody + lLine.text;
    var lChkSemicolon = lLine.text.match(/(.*)(;\s*)$/);
    if (iStmt < lLine.text.length - 1 && (undefined == lChkSemicolon || undefined == lChkSemicolon[2]))
      lBody = lBody + ";";
  }
  return lBody;
}
function afy_batch_query(pSqlStrArray, pResultHandler, pOptions)
{
  if (null == pSqlStrArray || 0 == pSqlStrArray.length)
    { myLog("afy_batch_query: invalid sql batch"); pResultHandler.onerror(null, pSqlStrArray); return; }
  var lBody = afy_batch_to_str(pSqlStrArray);
  afy_post_query(lBody, pResultHandler, pOptions);
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
        if (undefined == AFY_CONTEXT.mClasses[iC]["afy:objectID"])
          { lToDelete.push(iC); continue; }
        AFY_CONTEXT.mClasses[iC]["afy:objectID"] = afy_with_qname(lTruncateLeadingDot(AFY_CONTEXT.mClasses[iC]["afy:objectID"])); // Remove the leading dot (if any) and transform into qname (prefix:name).
        if ("http://localhost/afy/class/1.0/ClassDescription" == AFY_CONTEXT.mClasses[iC]["afy:objectID"])
          { AFY_CONTEXT.mFullIntrospection = true; }
        var lCProps = AFY_CONTEXT.mClasses[iC]["afy:properties"];
        var lNewProps = {};
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
  afy_query("SELECT * FROM afy:Classes;", lOnClasses, {keepalive:false});
}
function get_pin_info(pPID, pCallback)
{
  var lInfo = {pid:trimPID(pPID), classes:[], data:{}};
  var lGetData =
    function()
    {
      var _lOnData = function(__pJson) { lInfo.data = (undefined != __pJson && __pJson.length > 0) ? __pJson[0] : null; pCallback(lInfo); }
      afy_query("SELECT RAW * FROM @" + pPID + ";", new QResultHandler(_lOnData, null, null), {keepalive:false});
    }
  var lGetClasses =
    function()
    {
      // REVIEW: Would be even nicer if could combine SELECT *, DATAEVENTS(@) FROM ... in a single request...
      // REVIEW: now possible with #364...
      var _lOnSuccess = function(__pJson) { if (undefined != __pJson && __pJson.length > 0) { for (var __c in __pJson[0]['afy:value']) lInfo.classes.push(afy_with_qname(__pJson[0]['afy:value'][__c])); } lGetData(); }
      afy_query("SELECT DATAEVENTS(@" + pPID + ");", new QResultHandler(_lOnSuccess, null, null), {keepalive:false});
    }
  lGetClasses();
}
function get_conditions_and_actions(pOnDone)
{
  var lTruncateLeadingDot = function(_pStr) { return _pStr.charAt(0) == "." ? _pStr.substr(1) : _pStr; }
  var lConditions = [];
  var lActions = [];
  var lOnActions =
    function(_pJson)
    {
      for (var iC = 0; null != _pJson && iC < _pJson.length; iC++)
        if (undefined != _pJson[iC]["afy:objectID"] && undefined != _pJson[iC]["afy:action"])
          lActions.push({id:afy_with_qname(lTruncateLeadingDot(_pJson[iC]["afy:objectID"])), action:_pJson[iC]["afy:action"]});
      if (undefined != pOnDone)
        pOnDone(lConditions, lActions);
    };
  var lOnConditions =
    function(_pJson)
    {
      for (var iC = 0; null != _pJson && iC < _pJson.length; iC++)
        if (undefined != _pJson[iC]["afy:objectID"] && undefined != _pJson[iC]["afy:condition"])
          lConditions.push({id:afy_with_qname(lTruncateLeadingDot(_pJson[iC]["afy:objectID"])), condition:_pJson[iC]["afy:condition"]});
      afy_query("SELECT * FROM afy:NamedObjects WHERE EXISTS(afy:action);", new QResultHandler(lOnActions, null, null), {keepalive:false});
    };
  afy_query("SELECT * FROM afy:NamedObjects WHERE EXISTS(afy:condition);", new QResultHandler(lOnConditions, null, null), {keepalive:false});
}
