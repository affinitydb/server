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

// TODO: integrate live symbol names checking as well?

/**
 * Reporting abstractions (internal).
 */
var gAfyDebugMode = false;
AfyLexer.sDebugMode = false;
AfyParser.sDebugMode = false;
function Afyreport(pMsg) { myLog(pMsg); }
function AfyreportDbg(pMsg) { if (gAfyDebugMode) myLog(pMsg); }
function Afyassert(pCondition, pMsg) { if (!pCondition) { if (gAfyDebugMode) { alert("assert: " + pMsg); } throw new Error(pMsg); } }
function AfyinspectObject(pObject)
{
  Afyreport("Object={");
  var lP;
  for (lP in pObject)
  {
    var lTrace = "  " + lP + " : ";
    lTrace += pObject[lP];
    Afyreport(lTrace);
  }
  Afyreport("}");
}
AfyCompileErrors.limit = "AfyCompileErrors_NumberLimit";
AfyCompileErrors.internal = "AfyCompileErrors_Internal";
AfyCompileErrors.eof = "Input past end of file";
AfyCompileErrors.immediate = false;
function AfyCompileErrors(pNumMax)
{
  this.mNumMax = pNumMax ? pNumMax : 2000;
  this.mErrors = new Array();
  this.mWarnings = new Array();
}
AfyCompileErrors.prototype.copyFrom = function(pSrc)
{
  this.mNumMax = pSrc.mNumMax;
  this.mErrors = pSrc.mErrors.slice(0); // We assume that the errors themselves are immutable.
  this.mWarnings = pSrc.mWarnings.slice(0); // We assume that the warnings themselves are immutable.
  return this;
}
AfyCompileErrors.prototype.addError = function(pError, pFile, pLine, pToken, pNode)
{
  var lMessage = "ERROR: " + pError + (pLine ? (" (line=" + pLine + ")") : "") + (pFile ? (" (file=" + pFile + ")") : "");
  if (AfyCompileErrors.immediate)
    Afyreport(lMessage);
  this.mErrors.push({message:lMessage, token:pToken, node:pNode});
  if (this.mErrors.length > this.mNumMax)
    throw new Error(AfyCompileErrors.limit);
}
AfyCompileErrors.prototype.addWarning = function(pWarning, pFile, pLine, pToken, pNode)
{
  var lMessage = "WARNING: " + pWarning + (pLine ? (" (line=" + pLine + ")") : "") + (pFile ? (" (file=" + pFile + ")") : "");
  if (AfyCompileErrors.immediate)
    Afyreport(lMessage);
  this.mWarnings.push({message:lMessage, token:pToken, node:pNode});
}
AfyCompileErrors.prototype.getReport = function()
{
  var lReport;
  var iE;
  lReport = "Compiler errors (" + this.mErrors.length + "): {\n";
  for (iE = 0; iE < this.mErrors.length; iE++)
    lReport += "  " + this.mErrors[iE].message + "\n";
  lReport += "}\n";
  lReport += "Compiler warnings (" + this.mWarnings.length + "): {\n";
  for (iE = 0; iE < this.mWarnings.length; iE++)
    lReport += "  " + this.mWarnings[iE].message + "\n";
  lReport += "}\n";
  return lReport;
}
AfyCompileErrors.prototype.output = function()
{
  Afyreport(this.getReport());
}
AfyCompileErrors.reportInternalError = function(pError)
{
  var lMessage = "INTERNAL ERROR:" + pError;
  Afyreport(lMessage);
  throw new Error(AfyCompileErrors.internal);
}
AfyCompileErrors.handleException = function(pError, pWhere)
{
  if (-1 != pError.message.indexOf(AfyCompileErrors.limit))
    throw pError;
  if (-1 != pError.message.indexOf(AfyCompileErrors.internal))
    throw pError;
  if (-1 != pError.message.indexOf(AfyCompileErrors.eof))
    return;
  Afyreport("***\n*** Exception caught in " + pWhere +
    " (" + pError.name + "): " + pError.message + "\n" +
    pError.stack.split("\n").map(function(_l) { return "***   " + _l; }).join("\n"));
}

/**
 * Token abstraction.
 * Note: td=token definition.
 * Note:
 *   token definitions are processed in parallel; therefore definitions not starting with ^ can take precedence
 *   even if they're declared later in the priority list.
 */
AfyToken.nextIndex = 0;
AfyToken.sTokenDefinitionPrio = [];
AfyToken.declare =
  function(pName, pRegex)
  {
    AfyToken[pName] = pRegex;
    AfyToken[pName].afy_tokenType = pName;
    AfyToken[pName].afy_tokenIndex = AfyToken.nextIndex++;
    AfyToken.sTokenDefinitionPrio.push(AfyToken[pName]);
    return AfyToken[pName];
  }
AfyToken.declare('tdNewLine', /\n/);
AfyToken.declare('tdLiteralTimestamp', /TIMESTAMP\s*(')(\d+\-\d+\-\d+\s)?(\d+\:\d+\:\d+){1}(\.\d+)?\1/ig);
AfyToken.declare('tdLiteralInterval', /INTERVAL\s*(')(\d+\:\d+\:\d+){1}(\.\d+)?\1/ig);
AfyToken.declare('tdLiteralBinaryString', /X(')[a-f0-9]+\1/g);
AfyToken.declare('tdLiteralString', /(')(''|[^'])*\1/g);
AfyToken.declare('tdQuotedSymbol', /(")[^"]*\1/g);
AfyToken.declare('tdSpace', /\s+/g).afy_remove = true;
// ---
// Note:
//   This is processed after strings, to ignore occurrences inside strings;
//   occurrences of strings inside comments is handled during parsing.
AfyToken.declare('tdCommentSingleLine', /(\/\/)|(\-\-)/g);
AfyToken.declare('tdCommentMutliLineOpen', /\/\*/g);
AfyToken.declare('tdCommentMutliLineClose', /\*\//g);
// ---
AfyToken.declare('tdAtCtx', /^@ctx/ig);
AfyToken.declare('tdAtSelf', /^@self/ig);
AfyToken.declare('tdAtPin', /^@[a-f0-9]+/ig);
AfyToken.declare('tdAtLocal', /^@:\d+/ig);
// ---
AfyToken.declare('tdLiteralFloat', /^\d+\.\d+(e(-)?\d+)?f/g);
AfyToken.declare('tdLiteralDouble', /^\d+\.\d+(e(-)?\d+)?/g);
AfyToken.declare('tdLiteralInteger', /^\d+/g);
AfyToken.declare('tdLiteralNull', /^null$/ig);
AfyToken.declare('tdLiteralTrue', /^true$/ig);
AfyToken.declare('tdLiteralFalse', /^false$/ig);
// ---
AfyToken.declare('tdColonFirst', /^:first/ig);
AfyToken.declare('tdColonLast', /^:last/ig);
AfyToken.declare('tdAtSign', /^@/g);
AfyToken.declare('tdDot', /^\./g);
AfyToken.declare('tdColon', /^:/g);
AfyToken.declare('tdDollar', /^\$/g);
AfyToken.declare('tdSemicolon', /^\;/g);
// ---
AfyToken.declare('tdSpecialAssignment', /(\+\=|\-\=|\*\=|\/\=|\%\=)/g);
AfyToken.declare('tdInfixOperator', /(\+|\-|\*|\/|\%|\&|\||\|\||\^)/g); // Note: 'infix' is just a first rough hint/classification...
AfyToken.declare('tdUnaryOperator', /(\~)/g);
AfyToken.declare('tdComparison', /(>|<|<>|>\=|<\=)/g);
AfyToken.declare('tdEqual', /\=/g);
AfyToken.declare('tdComma', /\,/g);
AfyToken.declare('tdCurlyOpen', /\{/g);
AfyToken.declare('tdCurlyClose', /\}/g);
AfyToken.declare('tdSquareOpen', /\[/g);
AfyToken.declare('tdSquareClose', /\]/g);
AfyToken.declare('tdParenthesisOpen', /\(/g);
AfyToken.declare('tdParenthesisClose', /\)/g);
// ---
AfyToken.recognize = function(pToken) { return ('mType' in pToken) && (0 == pToken.mType.indexOf('td')) && (pToken.mType in AfyToken); }
AfyToken.tdarrayKeywords =
  new function()
  {
    var lThis = this;
    this.prefix = 'tdKW';
    var lDeclare = function(pKeyword) { return AfyToken.declare(lThis.prefix + pKeyword, new RegExp("^" + pKeyword + "$", "ig")); };
    var lNames =
      [
        "prefix", "base", "insert", "create", "update", "delete", "undelete", "drop", "purge", "select", "join", "set", "add", "move", "where",
        "from", "group", "order", "having", "using", "timer", "class", "unique", "distinct", "values",
        "by", "as", "is", "in", "to", "on", "against", "and", "or", "not", "case", "when", "then", "else", "end", "similar",
        "match", "fractional", "second", "minute", "hour", "day", "wday", "month", "year",
        "between", "left", "right", "inner", "outer", "full", "union", "intersect", "except", "all", "any", "some", "cross",
        "nulls", "asc", "desc", "current_timestamp", "current_user", "current_store", "options",
        "with", "into" 
      ];
    lNames.forEach(lDeclare);
    var lFirstIndex = AfyToken[lThis.prefix + lNames[0]].afy_tokenIndex;
    var lLastIndex = AfyToken[lThis.prefix + lNames[lNames.length - 1]].afy_tokenIndex;
    this.recognize = function(pToken) { return AfyToken.recognize(pToken) && AfyToken[pToken.mType].afy_tokenIndex >= lFirstIndex && AfyToken[pToken.mType].afy_tokenIndex <= lLastIndex; }
  };
AfyToken.tdarrayCorefuncs =
  new function()
  {
    var lThis = this;
    this.prefix = 'tdFUNC';
    var lDeclare = function(pFunc) { var lF = AfyToken.declare(lThis.prefix + pFunc[0], new RegExp("^" + pFunc[0] + "$", "ig")); lF.afy_arity = pFunc[1]; return lF; };
    var lNamesArity =
      [
        ["min", "+"], ["max", "+"], ["abs", 1],
        ["ln", 1], ["exp", 1], ["power", 2], ["sqrt", 1],
        ["sin", 1], ["cos", 1], ["tan", 1], ["asin", 1], ["acos", 1], ["atan", 1],
        ["floor", 1], ["ceil", 1], ["concat", "+"], ["lower", 1], ["upper", 1], ["tonum", 1], ["toinum", 1],
        ["count", 1], ["length", 1], ["sum", "+"], ["avg", "+"],
        ["position", 2], ["substr", "+"], ["replace", 3], ["pad", 3], ["begins", 2], ["ends", 2],
        ["exists", 1], ["contains", 2], ["coalesce", "+"], 
        ["histogram", "+"], ["membership", 1],
        ["extract", "special"], ["cast", "special"], ["trim", "special"]
      ];
    lNamesArity.forEach(lDeclare);
    var lFirstIndex = AfyToken[lThis.prefix + lNamesArity[0][0]].afy_tokenIndex;
    var lLastIndex = AfyToken[lThis.prefix + lNamesArity[lNamesArity.length - 1][0]].afy_tokenIndex;
    this.recognize = function(pToken) { return AfyToken.recognize(pToken) && AfyToken[pToken.mType].afy_tokenIndex >= lFirstIndex && AfyToken[pToken.mType].afy_tokenIndex <= lLastIndex; }
  };
AfyToken.tdarrayPropSpec =
  new function()
  {
    var lThis = this;
    this.prefix = 'tdPS';
    var lDeclare = function(pAfyProp) { return AfyToken.declare(lThis.prefix + pAfyProp, new RegExp("^afy:" + pAfyProp, "g")); };
    var lNames =
      [
        "pinID", "document", "parent", "value", "created", "createdBy", "updated", "updatedBy",
        "ACL", "stamp", "objectID", "predicate", "count", "subclasses", "superclasses",
        "indexInfo", "properties", "onEnter", "onUpdate", "onLeave", "namespace",
        "ref", "service", "version", "weight", "self", "prototype", "window", "timerInterval",
        "action", "address", "command", "undo", "listen", "condition", "subpackage", "enum",
        "bufferSize", "pattern", "exception", "identity", "request", "content", "position",
        "load", "resolve", "transition", "state"
      ];
    lNames.forEach(lDeclare);
    var lFirstIndex = AfyToken[lThis.prefix + lNames[0]].afy_tokenIndex;
    var lLastIndex = AfyToken[lThis.prefix + lNames[lNames.length - 1]].afy_tokenIndex;
    this.recognize = function(pToken) { return AfyToken.recognize(pToken) && AfyToken[pToken.mType].afy_tokenIndex >= lFirstIndex && AfyToken[pToken.mType].afy_tokenIndex <= lLastIndex; }
  };
AfyToken.tdarrayOptions =
  new function()
  {
    var lThis = this;
    this.prefix = 'tdOPT';
    var lDeclare = function(pOption) { return AfyToken.declare(lThis.prefix + pOption, new RegExp("^" + pOption + "$", "ig")); };
    var lNames = ["transient", "view"];
    lNames.forEach(lDeclare);
    var lFirstIndex = AfyToken[lThis.prefix + lNames[0]].afy_tokenIndex;
    var lLastIndex = AfyToken[lThis.prefix + lNames[lNames.length - 1]].afy_tokenIndex;
    this.recognize = function(pToken) { return AfyToken.recognize(pToken) && AfyToken[pToken.mType].afy_tokenIndex >= lFirstIndex && AfyToken[pToken.mType].afy_tokenIndex <= lLastIndex; }
  };
AfyToken.tdarrayUnits =
  new function()
  {
    var lThis = this;
    this.prefix = 'tdUNIT';
    var lDeclare = function(pUnit) { return AfyToken.declare(lThis.prefix + pUnit, new RegExp("^" + pUnit + "$", "g")); };
    var lNames =
    [
      "m", "kg", "s", "A", "K", "mol", "cd", "Hz", "N", "Pa", "J", "W", "C", "V", "F", "Ohm", "S", "Wb", "T", "H", "dC", "rad", "sr",
      "lm", "lx", "Bq", "Gy", "Sv", "kat", "dm", "cm", "mm", "mkm", "nm", "km", "in", "ft", "yd", "mi", "nmi", "au", "pc", "ly",
      "mps", "kph", "fpm", "mph", "kt", "g", "mg", "mkg", "t", "lb", "oz", "st", "m2", "cm2", "sqin", "sqft", "ac", "ha",
      "m3", "l", "cl", "cm3", "cf", "ci", "floz", "bbl", "bu", "gal", "qt", "pt", "b", "mmHg", "inHg", "cal", "kcal",
      "ct", "carat", "dF"
    ];
    lNames.forEach(lDeclare);
    var lFirstIndex = AfyToken[lThis.prefix + lNames[0]].afy_tokenIndex;
    var lLastIndex = AfyToken[lThis.prefix + lNames[lNames.length - 1]].afy_tokenIndex;
    this.recognize = function(pToken) { return AfyToken.recognize(pToken) && AfyToken[pToken.mType].afy_tokenIndex >= lFirstIndex && AfyToken[pToken.mType].afy_tokenIndex <= lLastIndex; }
  };
// ---
AfyToken.declare('tdAlnum', /^\w+/g);
// ---
function AfyToken(pText, pType, pLine, pLineStart, pColumn)
{
  this.mText = pText;
  this.mType = pType;
  this.mLine = pLine;
  this.mLineStart = pLineStart;
  this.mColumn = pColumn;
}

/**
 * Lexer.
 */
function AfyLexer(pErrors)
{
  this.mFileName = "";
  this.mTokens = null;
  this.mErrors = pErrors;
}
AfyLexer.prototype.process = function(pLines)
{
  // Produces an ordered Array of the tokens found in these lines.
  AfyreportDbg("AfyLexer.process: Tokenizing " + pLines + "...");
  this.mTokens = new Array();
  var lLineStart = 0;
  for (var lLineNum = 1; lLineNum <= pLines.length; lLineNum++)
  {
    var lLine = pLines[lLineNum - 1];
    var lLineTokens = this._tokenizeLine(lLine, lLineNum, lLineStart);
    for (var iT = 0; iT < lLineTokens.length; iT++)
      this.mTokens.push(lLineTokens[iT]);
    lLineStart += lLine.length + 1;
  }
  AfyreportDbg("AfyLexer.process: Done tokenizing (" + this.mTokens.length + " tokens found)");
}
AfyLexer.prototype._tokenizeLine = function(pLine, pLineNum, pLineStart)
{
  // Ignore empty lines.
  if (undefined == pLine || 0 == pLine.length)
    return [];

  // Line segment abstraction.
  // To bind a column to a range of text (can't be done with a dynamic property, because String is not an Object in js).
  function AfyLineSegment(pText, pAtColumn)
  {
    this.mText = pText;
    this.mAtColumn = pAtColumn;
  }

  // Starting from a single line segment, fragment the line and build an array of tokens until all segments are tokenized.
  var lTokens = new Array();
  var lSegments = new Array();
  lSegments[0] = new AfyLineSegment(pLine, 0);
  try
  {
    while (lSegments.length > 0)
    {
      var lSegment = lSegments[0];

      // Process all token definitions, in defined priority order.
      // Review: Avoid walking the whole list of token definitions every time?
      var lFound = false;
      var iTD;
      for (iTD = 0; iTD < AfyToken.sTokenDefinitionPrio.length; iTD++)
      {
        var lTokenDefinition = AfyToken.sTokenDefinitionPrio[iTD];
        var lToken;
        var lNextStart = 0;
        while ((null != (lToken = lTokenDefinition.exec(lSegment.mText))) && lTokenDefinition.global)
        {
          lFound = true;
          if (lToken.index > lNextStart)
            lSegments[lSegments.length] = new AfyLineSegment(lSegment.mText.slice(lNextStart, lToken.index), lNextStart + lSegment.mAtColumn);
          if (!lTokenDefinition.afy_remove)
          {
            var lStart = lToken.index + lSegment.mAtColumn;
            var lNewToken = new AfyToken(lToken[0], lTokenDefinition.afy_tokenType, pLineNum, pLineStart, lStart);
            lTokens[lTokens.length] = lNewToken;
          }
          lNextStart = lToken.index + lToken[0].length;
        }
        if (lFound && lSegment.mText.length > lNextStart)
          lSegments[lSegments.length] = new AfyLineSegment(lSegment.mText.slice(lNextStart), lNextStart + lSegment.mAtColumn);
        if (lFound)
          break;
      }

      // Tokenization issue: unknown entities.
      if (!lFound)
        this.mErrors.addError("AfyLexer._tokenizeLine: Couldn't recognize token <" + lSegment.mText + ">", this.mFileName, pLineNum);
      lSegments.splice(0, 1);
    }

    // Sort all tokens obtained on this line (by position in the line).
    lTokens.sort(function(pA, pB){ return pA.mColumn - pB.mColumn; });
    lTokens[lTokens.length] = new AfyToken("\n", AfyToken.tdNewLine.afy_tokenType, pLineNum, pLineStart, pLine.length);

    // Process single-line comments immediately.
    var iT;
    for (iT = 0; iT < lTokens.length; iT++)
    {
      if (lTokens[iT].mType != AfyToken.tdCommentSingleLine.afy_tokenType)
        continue;
      var iC = iT;
      for (iT++; iT < lTokens.length; iT++)
        lTokens[iC].mText += " " + lTokens[iT].mText;
      lTokens.splice(iC + 1, lTokens.length);
    }
  }
  catch (e) { AfyCompileErrors.handleException(e, "AfyLexer._tokenizeLine"); }    
  AfyLexer.dbgTokens(pLine, lTokens);
  return lTokens;
}
AfyLexer.dbgTokens = function(pLine, pTokens)
{
  if (!gAfyDebugMode || !AfyLexer.sDebugMode)
    return;
  AfyreportDbg("tokens for line: " + pLine);
  for (var i = 0; i < pTokens.length; i++)
  {
    var lTrace = "  (col" + pTokens[i].mColumn + ",type=" + pTokens[i].mType + ")";
    var lPadding = lTrace.length;
    while (lPadding++ < 40)
      lTrace += " ";
    lTrace += pTokens[i].mText;
    AfyreportDbg(lTrace);
  }
}

/**
 * Syntax tree components (nodes).
 */

// Basic node.
AfySTNode.stateNodeStarted = 1000;
AfySTNode.stateOIDFinished = 1100;
AfySTNode.stateTimerIntervalFinished = 1110;
AfySTNode.stateSelectionScopeFinished = 1199;
AfySTNode.statePredicateFinished = 1299;
AfySTNode.stateAssignmentsStarted = 5000;
AfySTNode.stateAssignmentsFinished = 5999;
AfySTNode.stateComma = 9900;
AfySTNode.stateNodeFinished = 9999;
AfySTNode.stateNodeCommitted = 10000;
function AfySTNode()
{
  this.init();
}
AfySTNode.prototype.init = function()
{
  this.mParent = null;
  this.mChildren = null;
  this.mState = AfySTNode.stateNodeStarted;
}
AfySTNode.prototype.addChild = function(pChild)
{
  if (!this.mChildren)
    this.mChildren = new Array();
  this.mChildren.push(pChild);
  pChild.mParent = this;
}
AfySTNode.prototype.getLastChild = function() { return this.hasChildren() ? this.mChildren[this.mChildren.length - 1] : null; }
AfySTNode.prototype.hasChildren = function() { return (this.mChildren && this.mChildren.length); }
AfySTNode.prototype.numChildren = function() { return (this.mChildren ? this.mChildren.length : 0); }
AfySTNode.prototype.getType = function() { return "AfySTNode"; }
AfySTNode.prototype.isA = function(pNodeType) { return "AfySTNode" == pNodeType; }
AfySTNode.prototype.toDbgStrSpecifics = function(pTab) { return ""; }
AfySTNode.prototype.toDbgStr = function(pTab)
{
  if (!pTab)
    pTab = 0;
  var lOutputStr = "";
  for (iT = 0; iT < pTab; iT++)
    lOutputStr += " ";
  lOutputStr += this.getType() + " ";
  lOutputStr += this.toDbgStrSpecifics(pTab) + " ";

  if (this.mChildren && this.mChildren.length)
  {
    var iC;
    lOutputStr += " children: {\n";
    for (iC = 0; iC < this.mChildren.length; iC++)
    {
      lOutputStr += this.mChildren[iC].toDbgStr(pTab + 1);
      if (iC < this.mChildren.length - 1)
        lOutputStr += ",\n";
    }
    lOutputStr += "}";
  }
  return lOutputStr;
}
AfySTNode.prototype.merge = function(pOther)
{
  if (!pOther.mChildren)
    return;
  var iCOther;
  for (iCOther = 0; iCOther < pOther.mChildren.length; iCOther++)
  {
    var lCOther = pOther.mChildren[iCOther];
    var lMerged = false;
    var iC;
    for (iC = 0; this.mChildren && iC < this.mChildren.length && !lMerged; iC++)
      if (this.mChildren[iC].getType() == lCOther.getType())
        { this.mChildren[iC].merge(lCOther); lMerged = true; }
    if (!lMerged)
      this.addChild(lCOther);
  }
}
AfySTNode.prototype.forEachChildOfType = function(pTypeStr, pCtx, pFunc, pRecursive)
{
  // Note: if pFunc returns true, the iteration is aborted.
  if (!this.mChildren)
    return null;
  var iC;
  for (iC = 0; iC < this.mChildren.length; iC++)
  {
    var lChild = this.mChildren[iC];
    if (lChild.getType() == pTypeStr && pFunc(pCtx, lChild))
      return true;
    if (pRecursive && lChild.forEachChildOfType(pTypeStr, pCtx, pFunc, true))
      return true;
  }
  return null;
}
AfySTNode.defineType = function(pType, pProto)
{
  var lParentProto = 'getPrototypeOf' in Object ? Object.getPrototypeOf(pProto) : pProto.__proto__;
  pProto.getType = function() { return pType; };
  pProto.isA = function(_pType) { return pType == _pType || (undefined != lParentProto && 'isA' in lParentProto && lParentProto.isA.call(this, _pType)); };
}  

// Core nodes.
function AfySTNode_Root() { AfySTNode.prototype.init.call(this); }
AfySTNode.defineType("AfySTNode_Root", AfySTNode_Root.prototype = new AfySTNode());
function AfySTNode_Symbol(pName) { AfySTNode.prototype.init.call(this); this.mName = pName; this.mNameIsPrefixed = false; this.mNameOnly = false; this.mTokenRange = [null, null]; } // mNameOnly is true whenever a symbol is dotted (e.g. on rhs of an assignment). Note: mTokenRange may remain [null, null], e.g. for tokens that are "artificially" íntroduced in the parsed tree and don't correspond to actual tokens in the input (e.g. afy:objectID in CREATE CLASS).
AfySTNode.defineType("AfySTNode_Symbol", AfySTNode_Symbol.prototype = new AfySTNode());
AfySTNode_Symbol.prototype.setFirstToken = function(pToken) { this.mTokenRange[0] = pToken; }
AfySTNode_Symbol.prototype.setLastToken = function(pToken) { this.mTokenRange[1] = pToken; }
AfySTNode_Symbol.prototype.getTokenRange = function() { return this.mTokenRange; }
AfySTNode_Symbol.prototype.toDbgStrSpecifics = function(pTab)
{
  var lDescrToken = function(_pT) { return (undefined != _pT ? (_pT.mLine + "@" + _pT.mColumn) : ''); }
  return this.mName + "[" + lDescrToken(this.mTokenRange[0]) + "]";
}
function AfySTNode_Literal(pValue) { AfySTNode.prototype.init.call(this); this.mValue = pValue; }
AfySTNode.defineType("AfySTNode_Literal", AfySTNode_Literal.prototype = new AfySTNode());
AfySTNode_Literal.prototype.toDbgStrSpecifics = function(pTab) { return this.mValue; }
function AfySTNode_Parameter(pIndex) { AfySTNode.prototype.init.call(this); this.mIndex = pIndex; }
AfySTNode.defineType("AfySTNode_Parameter", AfySTNode_Parameter.prototype = new AfySTNode());
AfySTNode_Parameter.prototype.toDbgStrSpecifics = function(pTab) { return ":" + this.mIndex; }
function AfySTNode_Operator(pKind) { AfySTNode.prototype.init.call(this); this.mKind = pKind.toUpperCase(); }
AfySTNode.defineType("AfySTNode_Operator", AfySTNode_Operator.prototype = new AfySTNode());
AfySTNode_Operator.prototype.toDbgStrSpecifics = function(pTab) { return this.mKind; }
function AfySTNode_Funcall(pFunc) { AfySTNode.prototype.init.call(this); this.mFunc = pFunc; }
AfySTNode.defineType("AfySTNode_Funcall", AfySTNode_Funcall.prototype = new AfySTNode());
AfySTNode_Funcall.prototype.toDbgStrSpecifics = function(pTab) { return this.mFunc; }
function AfySTNode_Fundef() { AfySTNode.prototype.init.call(this); }
AfySTNode.defineType("AfySTNode_Fundef", AfySTNode_Fundef.prototype = new AfySTNode());
function AfySTNode_ArgSpec(pArg) { AfySTNode.prototype.init.call(this); this.mArg = pArg; }
AfySTNode.defineType("AfySTNode_ArgSpec", AfySTNode_ArgSpec.prototype = new AfySTNode());
AfySTNode_ArgSpec.prototype.toDbgStrSpecifics = function(pTab) { return this.mArg; }
function AfySTNode_Assignment(pOp) { AfySTNode.prototype.init.call(this); this.mOp = pOp.toUpperCase(); /*add/set/delete*/ } // First child = LHS, second child = RHS. Note: An object's objectID/URI is tracked as assignment also (SET afy:objectID=...).
AfySTNode.defineType("AfySTNode_Assignment", AfySTNode_Assignment.prototype = new AfySTNode());
AfySTNode_Assignment.prototype.toDbgStrSpecifics = function(pTab) { return this.mOp; }
function AfySTNode_Reference() { AfySTNode.prototype.init.call(this); this.mPIN = null; this.mEID = null; }
AfySTNode.defineType("AfySTNode_Reference", AfySTNode_Reference.prototype = new AfySTNode());
AfySTNode_Reference.prototype.setPIN = function(pPIN) { this.mPIN = pPIN; }
AfySTNode_Reference.prototype.setEID = function(pEID) { this.mEID = pEID; }
AfySTNode_Reference.prototype.toDbgStrSpecifics = function(pTab) { return this.mPIN + (undefined != this.mEID ? ("[" + this.mEID + "]") : ""); }
function AfySTNode_PathExpression() { AfySTNode.prototype.init.call(this); }
AfySTNode.defineType("AfySTNode_PathExpression", AfySTNode_PathExpression.prototype = new AfySTNode());
function AfySTNode_Collection() { AfySTNode.prototype.init.call(this); }
AfySTNode.defineType("AfySTNode_Collection", AfySTNode_Collection.prototype = new AfySTNode());
function AfySTNode_Range() { AfySTNode.prototype.init.call(this); }
AfySTNode.defineType("AfySTNode_Range", AfySTNode_Range.prototype = new AfySTNode());
function AfySTNode_Expression() { AfySTNode.prototype.init.call(this); this.mSimpleGroup = false; }
AfySTNode.defineType("AfySTNode_Expression", AfySTNode_Expression.prototype = new AfySTNode());
AfySTNode_Expression.prototype.setSimpleGroup = function() { this.mSimpleGroup = true; }
function AfySTNode_Statement() { this.init(); }
AfySTNode.defineType("AfySTNode_Statement", AfySTNode_Statement.prototype = new AfySTNode());
AfySTNode_Statement.prototype.init = function() { AfySTNode.prototype.init.call(this); this.mTokenRange = [null, null]; }
AfySTNode_Statement.prototype.setFirstToken = function(pToken) { this.mTokenRange[0] = pToken; }
AfySTNode_Statement.prototype.setLastToken = function(pToken) { this.mTokenRange[1] = pToken; }
AfySTNode_Statement.prototype.getTokenRange = function() { return this.mTokenRange; }
AfySTNode_Statement.prototype.toDbgStrSpecifics = function(pTab)
{
  var lDescrToken = function(_pT) { return (undefined != _pT ? (_pT.mText + "{" + _pT.mLine + "@" + _pT.mColumn + "}") : 'null'); }
  return "[" + lDescrToken(this.mTokenRange[0]) + " - " + lDescrToken(this.mTokenRange[1]) + "]";
}
function AfySTNode_Predicate() { AfySTNode.prototype.init.call(this); }
AfySTNode.defineType("AfySTNode_Predicate", AfySTNode_Predicate.prototype = new AfySTNode());

// SELECT & related nodes (used for class predicate, rhs, nested etc.).
function AfySTNode_SELECT() { AfySTNode_Statement.prototype.init.call(this); }
AfySTNode.defineType("AfySTNode_SELECT", AfySTNode_SELECT.prototype = new AfySTNode_Statement());
function AfySTNode_Projection() { AfySTNode.prototype.init.call(this); } // A list of expressions (could contain simple symbols, or more complex trees [e.g. CAST etc.]).
AfySTNode.defineType("AfySTNode_Projection", AfySTNode_Projection.prototype = new AfySTNode());
function AfySTNode_SelectionScope() { AfySTNode.prototype.init.call(this); } // FROM
AfySTNode.defineType("AfySTNode_SelectionScope", AfySTNode_SelectionScope.prototype = new AfySTNode());

// INSERT node.
function AfySTNode_INSERT() { AfySTNode_Statement.prototype.init.call(this); this.mKind = null; this.mLabelID = null; }
AfySTNode.defineType("AfySTNode_INSERT", AfySTNode_INSERT.prototype = new AfySTNode_Statement());
AfySTNode_INSERT.prototype.setKind = function(pKind) { this.mKind = pKind; } // TIMER/CLASS (redundant; mostly for syntax checking).
AfySTNode_INSERT.prototype.setLabelID = function(pLabelID) { this.mLabelID = pLabelID; } // e.g. @:1
AfySTNode_INSERT.prototype.getOID = function()
{ 
  var lOID = null;
  var lFoundOID = false;
  this.forEachChildOfType(
    'AfySTNode_Assignment', null,
    function(_pCtx, _pNode)
    {
      _pNode.forEachChildOfType(
        'AfySTNode_Symbol', null,
        function(__pCtx, __pNode)
        {
          if (!lFoundOID && __pNode.mName == 'afy:objectID')
            { lFoundOID = true; return false; }
          else if (lFoundOID)
            { lOID = __pNode.mName; return true; }
          return false;
        },
        false);
      return true; // OID should always be in the first assignment.
    },
    false);
  return lOID;
}
AfySTNode_INSERT.prototype.toDbgStrSpecifics = function(pTab)
{
  var lStr = AfySTNode_Statement.prototype.toDbgStrSpecifics.call(this, pTab) + " ";
  if (this.mLabelID)
    lStr += " @:" + this.mLabelID;
  if (this.mKind)
    lStr += " " + this.mKind;
  return lStr;
}
function AfySTNode_Options() { AfySTNode.prototype.init.call(this); this.mValues = []; }
AfySTNode.defineType("AfySTNode_Options", AfySTNode_Options.prototype = new AfySTNode());
AfySTNode_Options.prototype.toDbgStrSpecifics = function(pTab) { return this.mValues.join("|"); }

// UPDATE node.
function AfySTNode_UPDATE() { AfySTNode_Statement.prototype.init.call(this); }
AfySTNode.defineType("AfySTNode_UPDATE", AfySTNode_UPDATE.prototype = new AfySTNode_Statement());
AfySTNode_UPDATE.prototype.getType = function() { return "AfySTNode_UPDATE"; }

// DELETE node.
function AfySTNode_DELETE() { AfySTNode_Statement.prototype.init.call(this); }
AfySTNode.defineType("AfySTNode_DELETE", AfySTNode_DELETE.prototype = new AfySTNode_Statement());
AfySTNode_DELETE.prototype.getType = function() { return "AfySTNode_DELETE"; }

/**
 * Parser.
 */
function AfyParser(pErrors)
{
  this.mFileName = "";
  this.mTree = new AfySTNode_Root();
  this.mTree.mName = "root";
  this.mStack = null;
  this.mErrors = pErrors;
  this._mTokensDbg = [];
}
AfyParser.prototype._getParent = function(pIndex)
{
  if (this.mStack.length > (pIndex || 0))
    return this.mStack[this.mStack.length - (pIndex || 0) - 1];
  return null;
}
AfyParser.prototype._getParentType = function(pIndex)
{
  var lParent = this._getParent(pIndex);
  return (lParent ? lParent.getType() : null);
}
AfyParser.prototype._getParentsOfType = function(pType)
{
  var lResult = [];
  var lParentIndex = 0;
  var lParent = this._getParent(lParentIndex++);
  while (undefined != lParent)
  {
    if (lParent.isA(pType))
      lResult.push(lParent);
    lParent = this._getParent(lParentIndex++);
  }
  return lResult;
}
AfyParser.prototype._dbgStack = function()
{
  return "stack: {" + this.mStack.map(function(_e) { return _e.getType(); }).join(",") + "}";
}
AfyParser.prototype._commitCur = function()
{
  var lNode = this.mStack.pop();
  lNode.mState = AfySTNode.stateNodeCommitted;
  this._getParent().addChild(lNode);
}
AfyParser.prototype._reportProblem = function(pMessage, pToken, pNode, pLevel)
{
  var lMessage = pMessage;
  lMessage += " " + pToken.mType + " (" + pToken.mText + ")";
  if (pNode)
    lMessage += " while processing<" + pNode.getType() + "> (nodestate=" + pNode.mState + ")";
  lMessage += " (line=" + pToken.mLine + ", col=" + pToken.mColumn + ")";
  var lStmt = this._getParentsOfType("AfySTNode_Statement").pop();
  if (lStmt)
  {
    lMessage += " (statement=";
    var lOutput = false
    var lFirstToken = lStmt.getTokenRange()[0];
    for (var iT = 0; iT < this._mTokensDbg.length; iT++)
    {
      if (this._mTokensDbg[iT] == lFirstToken)
        lOutput = true;
      if (lOutput)
        lMessage += this._mTokensDbg[iT].mText + " ";
      if (this._mTokensDbg[iT] == pToken)
        break;
    }
    lMessage += ")";
  }

  Afyreport(lMessage);
  if (pLevel == "error")
    this.mErrors.addError(lMessage, this.mFileName, pToken.mLine, pToken, pNode);
  else
    this.mErrors.addWarning(lMessage, this.mFileName, pToken.mLine, pToken, pNode);
}
AfyParser.prototype._hasNext = function(pTokens, pTokenIter, pTokenType)
{
  // Note: Here, pTokenIter is not returned and therefore we don't care about its value at the end of the search.
  var lToken;     
  var lFound = null;
  for (pTokenIter++; pTokenIter < pTokens.length && null == lFound; pTokenIter++)
  {
    lToken = pTokens[pTokenIter];
    switch (lToken.mType)
    {
      // Comments.
      case AfyToken.tdCommentSingleLine.afy_tokenType:
      case AfyToken.tdCommentMutliLineOpen.afy_tokenType:
        pTokenIter = this._processComment(pTokens, pTokenIter) - 1;
        break;
      case AfyToken.tdNewLine.afy_tokenType:
        break;
      // Searched.
      case pTokenType:
        lFound = true;
        break;
      default:
        lFound = false;
        break;
    }
  }
  return lFound;
}
AfyParser.prototype.process = function(pTokens)
{
  // Produces a graph of syntactically validated components.
  AfyreportDbg("AfyParser.process: Parsing " + pTokens.length + " tokens...");
  this.mStack = new Array();
  this._mTokensDbg = pTokens;
  try { this._processRoot(pTokens, 0, this.mTree); }
  catch (e) { AfyCompileErrors.handleException(e, "AfyParser.process"); } 
  finally { if (gAfyDebugMode && AfyParser.sDebugMode) AfyreportDbg(this.mTree.toDbgStr()); }
  AfyreportDbg("AfyParser.process: Done parsing.");
}
AfyParser.prototype._processRoot = function(pTokens, pTokenIter, pNode, pOptions) // Note: could also be named _processStatement...
{
  // pOptions: {tentative:true/false, closingToken:curly/paren/semicolon, singleStatement:true/false}
  var lTokenIterStart = pTokenIter;
  this.mStack.push(pNode);
  var lGetOption = function(_pWhat) { return (undefined != pOptions && (_pWhat in pOptions)) ? pOptions[_pWhat] : null; };
  var lCheckSingleStmt = function() { if (lGetOption('singleStatement')) pNode.mState = AfySTNode.stateNodeFinished; };
  for (; pTokenIter < pTokens.length && pNode.mState < AfySTNode.stateNodeFinished; pTokenIter++)
  {
    var lReportError = false;
    var lReportNotImplemented = false;
    var lToken = pTokens[pTokenIter];
    switch (lToken.mType)
    {
      // Spurious new lines.
      case AfyToken.tdNewLine.afy_tokenType:
        break;

      // Comments.
      case AfyToken.tdCommentSingleLine.afy_tokenType:
      case AfyToken.tdCommentMutliLineOpen.afy_tokenType:
        pTokenIter = this._processComment(pTokens, pTokenIter) - 1;
        break;
        
      // Semicolon.
      case AfyToken.tdSemicolon.afy_tokenType:
        break;

      // SELECT (in practice, mostly for cases like nested assignment).
      case AfyToken.tdKWselect.afy_tokenType:
      {
        var lSELECT = new AfySTNode_SELECT();
        pTokenIter = this._processSELECT(pTokens, pTokenIter, lSELECT) - 1;
        if (lSELECT.mState != AfySTNode.stateNodeFinished) { lReportError = true; } else { this._commitCur(); lCheckSingleStmt(); }
        break;
      }

      // CREATE.
      case AfyToken.tdKWcreate.afy_tokenType:
      {
        var lINSERT = new AfySTNode_INSERT();
        pTokenIter = this._processCREATE(pTokens, pTokenIter, lINSERT) - 1;
        if (lINSERT.mState != AfySTNode.stateNodeFinished) { lReportError = true; } else { this._commitCur(); lCheckSingleStmt(); }
        break;
      }

      // INSERT.
      case AfyToken.tdKWinsert.afy_tokenType:
      {
        var lINSERT = new AfySTNode_INSERT();
        pTokenIter = this._processINSERT(pTokens, pTokenIter, lINSERT) - 1;
        if (lINSERT.mState != AfySTNode.stateNodeFinished) { lReportError = true; } else { this._commitCur(); lCheckSingleStmt(); }
        break;
      }

      // UPDATE.
      case AfyToken.tdKWupdate.afy_tokenType:
      {
        var lUPDATE = new AfySTNode_UPDATE();
        pTokenIter = this._processUPDATE(pTokens, pTokenIter, lUPDATE) - 1;
        if (lUPDATE.mState != AfySTNode.stateNodeFinished) { lReportError = true; } else { this._commitCur(); lCheckSingleStmt(); }
        break;
      }

      // DELETE.
      case AfyToken.tdKWdelete.afy_tokenType:
      {
        var lDELETE = new AfySTNode_DELETE();
        pTokenIter = this._processDELETE(pTokens, pTokenIter, lDELETE) - 1;
        if (lDELETE.mState != AfySTNode.stateNodeFinished) { lReportError = true; } else { this._commitCur(); lCheckSingleStmt(); }
        break;
      }

      // TODO: DROP

      // Unhandled tokens.
      default:
        if (lGetOption('tentative') && 0 == pNode.numChildren())
        {
          this.mStack.pop();
          return lTokenIterStart;
        }
        else
          lReportNotImplemented = true;
        break;
    }
    if (lReportError)
      this._reportProblem("AfyParser._processRoot: Unexpected token", lToken, null, "error");
    if (lReportNotImplemented)
      this._reportProblem("AfyParser._processRoot: Not-yet-implemented token", lToken, null, "warning");
  }
  if (undefined != pOptions && ('closingToken' in pOptions))
    Afyassert((pTokenIter < pTokens.length && pOptions.closingToken.afy_tokenType == pTokens[pTokenIter].mType), "Incorrect closing token: expected " + pOptions.closingToken.afy_tokenType + ", got " + (pTokenIter < pTokens.length ? pTokens[pTokenIter].mType : 'eots') + " instead, for node:\n" + pNode.toDbgStr());
  Afyassert(this._getParent() == pNode, "Imbalance in node stack (expected: " + pNode.getType() + ", found: " + (this._getParent() ? this._getParent().getType() : "null") + ")");
  return pTokenIter;
}
AfyParser.prototype._processComment = function(pTokens, pTokenIter)
{
  // Just throw away comments for now.
  var lToken = pTokens[pTokenIter];
  if (AfyToken.tdCommentSingleLine.afy_tokenType == lToken.mType)
    return pTokenIter + 1;
  if (AfyToken.tdCommentMutliLineOpen.afy_tokenType == lToken.mType)
  {
    var lCommentFinished = false;
    for (pTokenIter++; pTokenIter < pTokens.length && !lCommentFinished; pTokenIter++)
    {
      lToken = pTokens[pTokenIter];
      switch (lToken.mType)
      {
        case AfyToken.tdCommentMutliLineClose.afy_tokenType:
          lCommentFinished = true;
          break;
        default:
          break;
      }
    }
  }
  return pTokenIter;
}
AfyParser.prototype._processSymbol = function(pTokens, pTokenIter, pNode)
{
  this.mStack.push(pNode);
  for (pTokenIter++; pTokenIter < pTokens.length && pNode.mState < AfySTNode.stateNodeFinished; pTokenIter++)
  {
    var lReportError = false;
    var lToken = pTokens[pTokenIter];
    switch (lToken.mType)
    {
      case AfyToken.tdAlnum.afy_tokenType:
      case AfyToken.tdColon.afy_tokenType:
      case AfyToken.tdQuotedSymbol.afy_tokenType:
        if (pNode.mState == AfySTNode.stateNodeStarted)
        {
          if (undefined == pNode.mName)
          {
            pNode.mName = lToken.mText;
            pNode.setFirstToken(lToken);
          }
          else
            pNode.mName += lToken.mText;
          if (pNode.mNameIsPrefixed)
          {
            if (AfyToken.tdColon.afy_tokenType == lToken.mType)
              lReportError = true;
            else
              pNode.mState = AfySTNode.stateNodeFinished;
          }
          else if (AfyToken.tdColon.afy_tokenType == lToken.mType)
            pNode.mNameIsPrefixed = true;
        }
        break;
      default:
        // Special Properties.
        if (pNode.mState == AfySTNode.stateNodeStarted && (undefined == pNode.mName || 0 == pNode.mName.length) &&
          AfyToken.tdarrayPropSpec.recognize(lToken))
        {
          pNode.mName = lToken.mText;
          pNode.mState = AfySTNode.stateNodeFinished;
        }
        // Termination
        else if (pNode.mState == AfySTNode.stateNodeStarted && pNode.mName.length > 0 && !pNode.mNameIsPrefixed)
        {
          pTokenIter--;
          pNode.mState = AfySTNode.stateNodeFinished;
        }
        else
          lReportError = true;
        break;
    }
    if (lReportError)
      this._reportProblem("AfyParser._processSymbol: Unexpected token", lToken, pNode, "error");
  }
  pNode.setLastToken(pTokens[pTokenIter - 1]);
  Afyassert(this._getParent() == pNode, "Imbalance in node stack (expected: " + pNode.getType() + ", found: " + (this._getParent() ? this._getParent().getType() : "null") + ")");
  return pTokenIter;
}
AfyParser.prototype._processReference = function(pTokens, pTokenIter, pNode)
{
  var lThis = this;
  this.mStack.push(pNode);
  for (pTokenIter++; pTokenIter < pTokens.length && pNode.mState < AfySTNode.stateNodeFinished; pTokenIter++)
  {
    var lReportError = false;
    var lToken = pTokens[pTokenIter];
    var lProcessPath =
      function()
      {
        if (pTokenIter + 1 >= pTokens.length)
          { pNode.mState = AfySTNode.stateNodeFinished; return; }
        pTokenIter++;
        var lNextToken = pTokens[pTokenIter];
        if (lNextToken.mType == AfyToken.tdDot.afy_tokenType)
        {
          var lSymbol = new AfySTNode_Symbol();
          pTokenIter = lThis._processSymbol(pTokens, pTokenIter, lSymbol) - 1;
          if (lSymbol.mState != AfySTNode.stateNodeFinished)
            lReportError = true;
          else
          {
            // Collection item?
            if (pTokenIter + 3 < pTokens.length && pTokens[pTokenIter + 1].mType == AfyToken.tdSquareOpen.afy_tokenType)
            {
              if (pTokens[pTokenIter + 3].mType == AfyToken.tdSquareClose.afy_tokenType &&
                (pTokens[pTokenIter + 2].mType == AfyToken.tdColonFirst.afy_tokenType ||
                pTokens[pTokenIter + 2].mType == AfyToken.tdColonLast.afy_tokenType ||
                pTokens[pTokenIter + 2].mType == AfyToken.tdLiteralInteger.afy_tokenType ||
                pTokens[pTokenIter + 2].mType == AfyToken.tdAlnum.afy_tokenType))
                { pNode.setEID(pTokens[pTokenIter + 2].mText); pTokenIter += 3; }
              else
                lReportError = true;
            }
            lProcessPath();
            lThis._commitCur();
          }
        }
        else
        {
          pTokenIter--;
          pNode.mState = AfySTNode.stateNodeFinished;
        }
      };
    switch (lToken.mType)
    {
      case AfyToken.tdAtPin.afy_tokenType:
      case AfyToken.tdAtCtx.afy_tokenType:
      case AfyToken.tdAtSelf.afy_tokenType:
      case AfyToken.tdAtLocal.afy_tokenType:
        pNode.setPIN(lToken.mText);
        lProcessPath();
        break;
      
      default:
        lReportError = true;
        break;
    }
    if (lReportError)
      this._reportProblem("AfyParser._processReference: Unexpected token", lToken, pNode, "error");
  }
  Afyassert(this._getParent() == pNode, "Imbalance in node stack (expected: " + pNode.getType() + ", found: " + this._getParent() ? this._getParent().getType() : "null");
  return pTokenIter;
}
AfyParser.prototype._processExpression = function(pTokens, pTokenIter, pNode)
{
  this.mStack.push(pNode);
  for (pTokenIter++; pTokenIter < pTokens.length && pNode.mState < AfySTNode.stateNodeFinished; pTokenIter++)
  {
    var lReportError = false;
    var lToken = pTokens[pTokenIter];
    var lCheckDone =
      function()
      {
        if (pTokenIter + 1 >= pTokens.length)
          { pNode.mState = AfySTNode.stateNodeFinished; return; }
        switch (pTokens[pTokenIter + 1].mType)
        {
          case AfyToken.tdInfixOperator.afy_tokenType:
          case AfyToken.tdComparison.afy_tokenType:
          case AfyToken.tdEqual.afy_tokenType:
          case AfyToken.tdKWand.afy_tokenType:
          case AfyToken.tdKWor.afy_tokenType:
          case AfyToken.tdKWin.afy_tokenType:
          case AfyToken.tdKWis.afy_tokenType:
            break;
          default:
            pNode.mState = AfySTNode.stateNodeFinished;
            break;
        }
      }
    switch (lToken.mType)
    {
      // Comments.
      case AfyToken.tdCommentSingleLine.afy_tokenType:
      case AfyToken.tdCommentMutliLineOpen.afy_tokenType:
        pTokenIter = this._processComment(pTokens, pTokenIter) - 1;
        break;
      case AfyToken.tdNewLine.afy_tokenType:
        break;

      // Symbols (property names etc.).
      case AfyToken.tdAlnum.afy_tokenType:
      case AfyToken.tdQuotedSymbol.afy_tokenType:
      {
        var lSymbol = new AfySTNode_Symbol();
        pTokenIter = this._processSymbol(pTokens, pTokenIter - 1, lSymbol) - 1;
        if (lSymbol.mState != AfySTNode.stateNodeFinished) { lReportError = true; } else { this._commitCur(); lCheckDone(); }
        break;
      }

      // Parameters (:0).
      case AfyToken.tdColon.afy_tokenType:
        if (pTokenIter + 1 < pTokens.length && pTokens[pTokenIter + 1].mType == AfyToken.tdLiteralInteger.afy_tokenType)
        {
          this.mStack.push(new AfySTNode_Parameter(pTokens[pTokenIter + 1].mText));
          this._commitCur();
        }
        else
          lReportError = true;
        break;

      // Dot-symbols.
      // Note: no arithmetic/operators on those, afaik...
      case AfyToken.tdDot.afy_tokenType:
      {
        this.mStack.push(new AfySTNode_Literal("."));
        var lSymbol = new AfySTNode_Symbol();
        pTokenIter = this._processSymbol(pTokens, pTokenIter, lSymbol) - 1;
        if (lSymbol.mState != AfySTNode.stateNodeFinished) { lReportError = true; } else { this._commitCur(); this._commitCur(); pNode.mState = AfySTNode.stateNodeFinished; }
        break;
      }
        
      // Literals.
      case AfyToken.tdLiteralString.afy_tokenType:
      case AfyToken.tdLiteralBinaryString.afy_tokenType:
      case AfyToken.tdLiteralTimestamp.afy_tokenType:
      case AfyToken.tdLiteralInterval.afy_tokenType:
      case AfyToken.tdLiteralInteger.afy_tokenType:
      case AfyToken.tdLiteralFloat.afy_tokenType:
      case AfyToken.tdLiteralNull.afy_tokenType:
      case AfyToken.tdLiteralTrue.afy_tokenType:
      case AfyToken.tdLiteralFalse.afy_tokenType:
      case AfyToken.tdKWcurrent_timestamp.afy_tokenType:
      case AfyToken.tdKWcurrent_user.afy_tokenType:
      case AfyToken.tdKWcurrent_store.afy_tokenType:
        this.mStack.push(new AfySTNode_Literal(lToken.mText));
        this._commitCur();
        lCheckDone();
        break;
      case AfyToken.tdLiteralDouble.afy_tokenType:
      {
        var lLiteralValue = lToken.mText;
        if (pTokenIter + 1 < pTokens.length)
        {
          var lNextToken = pTokens[pTokenIter + 1];
          if (AfyToken.tdarrayUnits.recognize(lNextToken))
          {
            lLiteralValue += lNextToken.mText;
            pTokenIter++;
          }
        }
        this.mStack.push(new AfySTNode_Literal(lLiteralValue));
        this._commitCur();
        lCheckDone();
        break;
      }
      case AfyToken.tdCurlyOpen.afy_tokenType:
      {
        var lCollection = new AfySTNode_Collection();
        pTokenIter = this._processCollection(pTokens, pTokenIter - 1, lCollection) - 1;
        if (lCollection.mState != AfySTNode.stateNodeFinished) { lReportError = true; } else { this._commitCur(); pNode.mState = AfySTNode.stateNodeFinished; }
        break;
      }
      case AfyToken.tdSquareOpen.afy_tokenType:
      {
        var lRange = new AfySTNode_Range();
        pTokenIter = this._processRange(pTokens, pTokenIter - 1, lRange) - 1;
        if (lRange.mState != AfySTNode.stateNodeFinished) { lReportError = true; } else { this._commitCur(); pNode.mState = AfySTNode.stateNodeFinished; }
        break;
      }

      // References.
      // Review: will this eventually become a full path exp?
      case AfyToken.tdAtPin.afy_tokenType:
      case AfyToken.tdAtCtx.afy_tokenType:
      case AfyToken.tdAtSelf.afy_tokenType:
      case AfyToken.tdAtLocal.afy_tokenType:
      case AfyToken.tdAtSign.afy_tokenType:
      {
        var lReference = new AfySTNode_Reference();
        pTokenIter = this._processReference(pTokens, pTokenIter - 1, lReference) - 1;
        if (lReference.mState != AfySTNode.stateNodeFinished) { lReportError = true; } else { this._commitCur(); lCheckDone(); }
        break;
      }
      
      // Parentheses (e.g. nested SELECT/CREATE/INSERT, or grouping/subexpr).
      case AfyToken.tdParenthesisOpen.afy_tokenType:
      {
        var lNestedRoot = new AfySTNode_Root();
        var lI = this._processRoot(pTokens, pTokenIter + 1, lNestedRoot, {tentative:true, closingToken:AfyToken.tdParenthesisClose});
        if (lI > pTokenIter + 1)
        {
          Afyassert(pTokens[lI].mType == AfyToken.tdParenthesisClose.afy_tokenType, "Expected a closing parenthesis, found instead: " + pTokens[lI].mType + " (at col: " + pTokens[lI].mColumn + ")");
          pTokenIter = lI; this._commitCur(); lCheckDone();
        }
        else
        {
          pNode.setSimpleGroup();
          var lSubExpr = new AfySTNode_Expression();
          pTokenIter = this._processExpression(pTokens, pTokenIter, lSubExpr);
          if (lSubExpr.mState != AfySTNode.stateNodeFinished || pTokenIter >= pTokens.length ||
            pTokens[pTokenIter].mType != AfyToken.tdParenthesisClose.afy_tokenType)
              { lReportError = true; }
          else
            { this._commitCur(); lCheckDone(); }
        }
        break;
      }

      // Conjunctions: infix operators, comparisons, AND/OR.
      // Works in coordination with lCheckDone.
      // TODO: better transform into operator as parent of operands...
      case AfyToken.tdInfixOperator.afy_tokenType:
      case AfyToken.tdComparison.afy_tokenType:
      case AfyToken.tdEqual.afy_tokenType:
      case AfyToken.tdKWand.afy_tokenType:
      case AfyToken.tdKWor.afy_tokenType:
      case AfyToken.tdKWin.afy_tokenType:
        this.mStack.push(new AfySTNode_Operator(lToken.mText));
        this._commitCur();
        break;
      case AfyToken.tdKWis.afy_tokenType:
      {
        var lProcessed = false;
        if (pTokenIter + 1 < pTokens.length)
        {
          var lNextToken = pTokens[pTokenIter + 1];
          switch (lNextToken.mType)
          {
            case AfyToken.tdAlnum.afy_tokenType:
            case AfyToken.tdUNITA.afy_tokenType:
              pTokenIter++;
              // TODO: verify that next token is a symbol (class)...
            case AfyToken.tdKWnot.afy_tokenType:
              pTokenIter++;
              // TODO: verify that next token is valid...
            case AfyToken.tdLiteralNull.afy_tokenType:
            case AfyToken.tdLiteralTrue.afy_tokenType:
            case AfyToken.tdLiteralFalse.afy_tokenType:
              this.mStack.push(new AfySTNode_Operator(lToken.mText));
              this._commitCur();
              lProcessed = true;
              break;
            default:
              break;
          }
        }
        if (!lProcessed)
          lReportError = true;
        break;
      }

      // Expressions/statements: $(...), ${...}, $(...)(...).
      case AfyToken.tdDollar.afy_tokenType:
        if (pTokenIter + 1 < pTokens.length)
        {
          var lNextToken = pTokens[pTokenIter + 1];
          if (lNextToken.mType == AfyToken.tdCurlyOpen.afy_tokenType)
          {
            var lNestedRoot = new AfySTNode_Root();
            pTokenIter = this._processRoot(pTokens, pTokenIter + 2, lNestedRoot, {closingToken:AfyToken.tdCurlyClose});
            if (lNestedRoot.mState != AfySTNode.stateNodeFinished || pTokenIter >= pTokens.length ||
              pTokens[pTokenIter].mType != AfyToken.tdCurlyClose.afy_tokenType)
                { lReportError = true; }
            else
              { this._commitCur(); pNode.mState = AfySTNode.stateNodeFinished; }
          }
          else if (lNextToken.mType == AfyToken.tdParenthesisOpen.afy_tokenType)
          {
            this.mStack.push(new AfySTNode_Fundef());
            var lExprDef = new AfySTNode_Expression();
            pTokenIter = this._processExpression(pTokens, pTokenIter + 2, lExprDef, false) - 1;
            if (lExprDef.mState != AfySTNode.stateNodeFinished || pTokenIter >= pTokens.length ||
              pTokens[pTokenIter].mType != AfyToken.tdParenthesisClose.afy_tokenType)
                { lReportError = true; }
            else
              { this._commitCur(); this._commitCur(); pNode.mState = AfySTNode.stateNodeFinished; }
            // TODO: potential invocation
          }
          else
            lReportError = true;
        }
        else
          lReportError = true;
        break;
        
      // TODO: prop() (func invocation)
      // TODO: special args (CAST, EXTRACT etc.)
      // TODO: in some contexts, special things like :0 (in class pred)

      default:
      {
        var lDefaultProcessed = false;

        // Function calls.
        if (AfyToken.tdarrayCorefuncs.recognize(lToken))
        {
          var lFuncall = new AfySTNode_Funcall(lToken.mType);
          pTokenIter = this._processFuncall(pTokens, pTokenIter, lFuncall) - 1;
          if (lFuncall.mState != AfySTNode.stateNodeFinished) { lReportError = true; } else { this._commitCur(); lCheckDone(); lDefaultProcessed = true; }
        }

        // Special Properties.
        else if (AfyToken.tdarrayPropSpec.recognize(lToken))
        {
          var lSymbol = new AfySTNode_Symbol();
          pTokenIter = this._processSymbol(pTokens, pTokenIter - 1, lSymbol) - 1;
          if (lSymbol.mState != AfySTNode.stateNodeFinished) { lReportError = true; } else { this._commitCur(); lCheckDone(); lDefaultProcessed = true; }
        }

        // Unexpected.
        if (!lDefaultProcessed)
          lReportError = true;
        break;
      }
    }
    if (lReportError)
      this._reportProblem("AfyParser._processExpression: Unexpected token", lToken, null, "error");
  }
  Afyassert(this._getParent() == pNode, "Imbalance in node stack (expected: " + pNode.getType() + ", found: " + (this._getParent() ? this._getParent().getType() : "null") + ")");
  return pTokenIter;
}
AfyParser.prototype._processCollection = function(pTokens, pTokenIter, pNode)
{
  this.mStack.push(pNode);
  var lCurlyOpen = false;
  for (pTokenIter++; pTokenIter < pTokens.length && pNode.mState < AfySTNode.stateNodeFinished; pTokenIter++)
  {
    var lReportError = false;
    var lToken = pTokens[pTokenIter];
    switch (lToken.mType)
    {
      // Curly braces.
      // Note: no nested collection.
      case AfyToken.tdCurlyOpen.afy_tokenType:
        if (lCurlyOpen || pNode.mState != AfySTNode.stateNodeStarted)
          lReportError = true;
        else
          { lCurlyOpen = true; pNode.mState = AfySTNode.stateComma; }
        break;
      case AfyToken.tdCurlyClose.afy_tokenType:
        if (!lCurlyOpen || pNode.mState != AfySTNode.stateNodeStarted)
          lReportError = true;
        else
          pNode.mState = AfySTNode.stateNodeFinished;
        break;

      // Comma.
      case AfyToken.tdComma.afy_tokenType:
        if (lCurlyOpen && pNode.mState != AfySTNode.stateComma && this._getParent() == pNode)
          pNode.mState = AfySTNode.stateComma;
        else
          lReportError = true;
        break;

      default:
      {
        var lDefaultProcessed = false;
        if (pNode.mState == AfySTNode.stateComma)
        {
          var lExpression = new AfySTNode_Expression();
          pTokenIter = this._processExpression(pTokens, pTokenIter - 1, lExpression) - 1;
          if (lExpression.mState == AfySTNode.stateNodeFinished)
          {
            this._commitCur();
            pNode.mState = AfySTNode.stateNodeStarted;
            lDefaultProcessed = true;
          }
        }
        if (!lDefaultProcessed)
          lReportError = true;
        break;
      }
    }
    if (lReportError)
      this._reportProblem("AfyParser._processCollection: Unexpected token", lToken, pNode, "error");
  }
  Afyassert(this._getParent() == pNode, "Imbalance in node stack (expected: " + pNode.getType() + ", found: " + (this._getParent() ? this._getParent().getType() : "null") + ")");
  return pTokenIter;
}         
AfyParser.prototype._processRange = function(pTokens, pTokenIter, pNode)
{
  this.mStack.push(pNode);
  var lSquareOpen = false;
  for (pTokenIter++; pTokenIter < pTokens.length && pNode.mState < AfySTNode.stateNodeFinished; pTokenIter++)
  {
    var lReportError = false;
    var lToken = pTokens[pTokenIter];
    switch (lToken.mType)
    {
      // Square brackets.
      // Note: no nested range.
      case AfyToken.tdSquareOpen.afy_tokenType:
        if (lSquareOpen || pNode.mState != AfySTNode.stateNodeStarted)
          lReportError = true;
        else
          { lSquareOpen = true; pNode.mState = AfySTNode.stateComma; }
        break;
      case AfyToken.tdSquareClose.afy_tokenType:
        if (!lSquareOpen || pNode.mState != AfySTNode.stateNodeStarted)
          lReportError = true;
        else
          pNode.mState = AfySTNode.stateNodeFinished;
        break;

      // Comma.
      case AfyToken.tdComma.afy_tokenType:
        if (lSquareOpen && pNode.mState != AfySTNode.stateComma && this._getParent() == pNode)
          pNode.mState = AfySTNode.stateComma;
        else
          lReportError = true;
        break;

      // Star.
      case AfyToken.tdInfixOperator.afy_tokenType:
        if (lSquareOpen && lToken.mText == "*" && pNode.mState == AfySTNode.stateComma)
        {
          this.mStack.push(new AfySTNode_Symbol("*"));
          this._commitCur();
          pNode.mState = AfySTNode.stateNodeStarted;
        }
        else
          lReportError = true;
        break;

      default:
      {
        var lDefaultProcessed = false;
        if (pNode.mState == AfySTNode.stateComma)
        {
          var lExpression = new AfySTNode_Expression();
          pTokenIter = this._processExpression(pTokens, pTokenIter - 1, lExpression) - 1;
          if (lExpression.mState == AfySTNode.stateNodeFinished)
          {
            this._commitCur();
            pNode.mState = AfySTNode.stateNodeStarted;
            lDefaultProcessed = true;
          }
        }
        if (!lDefaultProcessed)
          lReportError = true;
        break;
      }
    }
    if (lReportError)
      this._reportProblem("AfyParser._processCollection: Unexpected token", lToken, pNode, "error");
  }
  Afyassert(this._getParent() == pNode, "Imbalance in node stack (expected: " + pNode.getType() + ", found: " + (this._getParent() ? this._getParent().getType() : "null") + ")");
  return pTokenIter;
}         
AfyParser.prototype._processFuncall = function(pTokens, pTokenIter, pNode)
{
  this.mStack.push(pNode);
  var lParenOpen = false;
  for (pTokenIter++; pTokenIter < pTokens.length && pNode.mState < AfySTNode.stateNodeFinished; pTokenIter++)
  {
    var lReportError = false;
    var lToken = pTokens[pTokenIter];
    switch (lToken.mType)
    {
      // Parentheses.
      case AfyToken.tdParenthesisOpen.afy_tokenType:
        if (lParenOpen || pNode.mState != AfySTNode.stateNodeStarted)
          lReportError = true;
        else
          { lParenOpen = true; pNode.mState = AfySTNode.stateComma; }
        break;
      case AfyToken.tdParenthesisClose.afy_tokenType:
        if (!lParenOpen || pNode.mState != AfySTNode.stateNodeStarted)
          lReportError = true;
        else
          pNode.mState = AfySTNode.stateNodeFinished;
        break;

      // Comma.
      // Checks the arity also, when available.
      case AfyToken.tdComma.afy_tokenType:
        if (lParenOpen && pNode.mState != AfySTNode.stateComma && this._getParent() == pNode &&
          (undefined == pNode.mFunc || !(pNode.mFunc in AfyToken) || AfyToken[pNode.mFunc].afy_arity == "+" ||
          (typeof(AfyToken[pNode.mFunc].afy_arity) == "number" && pNode.numChildren() < AfyToken[pNode.mFunc].afy_arity)))
        {
          pNode.mState = AfySTNode.stateComma;
        }
        else
          this._reportProblem("AfyParser._processFuncall: Arity issue detected", lToken, pNode, "error");
        break;

      // Special stuff for EXTRACT.
      case AfyToken.tdKWfractional.afy_tokenType:
      case AfyToken.tdKWsecond.afy_tokenType:
      case AfyToken.tdKWminute.afy_tokenType:
      case AfyToken.tdKWhour.afy_tokenType:
      case AfyToken.tdKWday.afy_tokenType:
      case AfyToken.tdKWwday.afy_tokenType:
      case AfyToken.tdKWmonth.afy_tokenType:
      case AfyToken.tdKWyear.afy_tokenType:
        if (pNode.mState == AfySTNode.stateComma && pNode.mFunc == AfyToken.tdFUNCextract.afy_tokenType &&
          pTokenIter + 3 < pTokens.length && pTokens[pTokenIter + 1].mType == AfyToken.tdKWfrom.afy_tokenType)
        {
          this.mStack.push(new AfySTNode_ArgSpec(lToken.mText)); this._commitCur();
          pTokenIter++; // Skip the FROM.
          pNode.mState = AfySTNode.stateComma; // Next argument should be an expression.
        }
        else
          lReportError = true;
        break;

      default:
      {
        var lDefaultProcessed = false;
        if (pNode.mState == AfySTNode.stateComma)
        {
          var lExpression = new AfySTNode_Expression();
          pTokenIter = this._processExpression(pTokens, pTokenIter - 1, lExpression) - 1;
          if (lExpression.mState == AfySTNode.stateNodeFinished)
          {            
            this._commitCur();
            pNode.mState = AfySTNode.stateNodeStarted;
            lDefaultProcessed = true;
          }
        }
        if (!lDefaultProcessed)
          lReportError = true;
        break;
      }
    }
    if (lReportError)
      this._reportProblem("AfyParser._processFuncall: Unexpected token", lToken, pNode, "error");
  }
  Afyassert(this._getParent() == pNode, "Imbalance in node stack (expected: " + pNode.getType() + ", found: " + (this._getParent() ? this._getParent().getType() : "null") + ")");
  return pTokenIter;
}         
AfyParser.prototype._processOptions = function(pTokens, pTokenIter, pNode)
{
  this.mStack.push(pNode);
  var lParenOpen = false;
  for (pTokenIter++; pTokenIter < pTokens.length && pNode.mState < AfySTNode.stateNodeFinished; pTokenIter++)
  {
    var lReportError = false;
    var lToken = pTokens[pTokenIter];
    switch (lToken.mType)
    {
      // Parentheses.
      case AfyToken.tdParenthesisOpen.afy_tokenType:
        if (lParenOpen || pNode.mState != AfySTNode.stateNodeStarted)
          lReportError = true;
        else
          { lParenOpen = true; pNode.mState = AfySTNode.stateComma; }
        break;
      case AfyToken.tdParenthesisClose.afy_tokenType:
        if (!lParenOpen || pNode.mState != AfySTNode.stateNodeStarted)
          lReportError = true;
        else
          pNode.mState = AfySTNode.stateNodeFinished;
        break;

      // Comma.
      case AfyToken.tdComma.afy_tokenType:
        if (lParenOpen && pNode.mState != AfySTNode.stateComma && this._getParent() == pNode)
          pNode.mState = AfySTNode.stateComma;
        else
          lReportError = true;
        break;

      default:
      {
        // Actual options.
        if (pNode.mState == AfySTNode.stateComma && AfyToken.tdarrayOptions.recognize(lToken))
        {
          pNode.mValues.push(lToken.mType);
          pNode.mState = AfySTNode.stateNodeStarted;
        }
        else
          lReportError = true;
        break;
      }
    }
    if (lReportError)
      this._reportProblem("AfyParser._processOptions: Unexpected token", lToken, pNode, "error");
  }
  Afyassert(this._getParent() == pNode, "Imbalance in node stack (expected: " + pNode.getType() + ", found: " + (this._getParent() ? this._getParent().getType() : "null") + ")");
  return pTokenIter;
}         
AfyParser.prototype._processProjection = function(pTokens, pTokenIter, pNode)
{
  // Review: reuse _processExpression (possibly with filter arg)?
  this.mStack.push(pNode);
  var lThis = this;
  var lDeclareSymbol =
    function()
    {
      lThis.mStack.push(new AfySTNode_Expression());
      var lSymbol = new AfySTNode_Symbol();
      pTokenIter = lThis._processSymbol(pTokens, pTokenIter - 1, lSymbol) - 1;
      if (lSymbol.mState != AfySTNode.stateNodeFinished)
        return false;
      if (pTokenIter + 3 < pTokens.length && pTokens[pTokenIter + 1].mType == AfyToken.tdSquareOpen.afy_tokenType)
      {
        // Review: does this truly belong here, in this form?
        if (pTokens[pTokenIter + 3].mType == AfyToken.tdSquareClose.afy_tokenType &&
          (pTokens[pTokenIter + 2].mType == AfyToken.tdColonFirst.afy_tokenType ||
          pTokens[pTokenIter + 2].mType == AfyToken.tdColonLast.afy_tokenType ||
          pTokens[pTokenIter + 2].mType == AfyToken.tdLiteralInteger.afy_tokenType ||
          pTokens[pTokenIter + 2].mType == AfyToken.tdAlnum.afy_tokenType))
            { /*TODO:finish this...*/ /*lSymbol.setEID(pTokens[pTokenIter + 2].mText);*/ pTokenIter += 3; }
      }
      lThis._commitCur();
      lThis._commitCur();
      pNode.mState = AfySTNode.stateNodeStarted;
      return true;
    };
  for (pTokenIter++; pTokenIter < pTokens.length && pNode.mState < AfySTNode.stateNodeFinished; pTokenIter++)
  {
    var lReportError = false;
    var lToken = pTokens[pTokenIter];
    switch (lToken.mType)
    {
      // Comments.
      case AfyToken.tdCommentSingleLine.afy_tokenType:
      case AfyToken.tdCommentMutliLineOpen.afy_tokenType:
        pTokenIter = this._processComment(pTokens, pTokenIter) - 1;
        break;
      case AfyToken.tdNewLine.afy_tokenType:
        break;

      // Star (e.g. SELECT *).
      case AfyToken.tdInfixOperator.afy_tokenType:
        if ((pNode.mState == AfySTNode.stateNodeStarted || pNode.mState == AfySTNode.stateComma) && lToken.mText == "*")
        {
          this.mStack.push(new AfySTNode_Expression());
          this.mStack.push(new AfySTNode_Symbol("*"));
          this._commitCur();
          this._commitCur();
          pNode.mState = AfySTNode.stateNodeStarted;
        }
        else
          lReportError = true;
        break;

      // Comma.
      case AfyToken.tdComma.afy_tokenType:
        if (pNode.mState != AfySTNode.stateComma)
          pNode.mState = AfySTNode.stateComma;
        else
          lReportError = true;
        break;

      // Symbols.
      case AfyToken.tdAlnum.afy_tokenType:
      case AfyToken.tdColon.afy_tokenType:
      case AfyToken.tdQuotedSymbol.afy_tokenType:
        if (pNode.mState == AfySTNode.stateNodeStarted || pNode.mState == AfySTNode.stateComma)
          lReportError = !lDeclareSymbol();
        else
          lReportError = true;
        break;
 
      // TODO: 'AS' with local symbols

      default:
      {
        var lDefaultProcessed = false;
        if (pNode.mState == AfySTNode.stateNodeStarted || pNode.mState == AfySTNode.stateComma)
        {
          // Special Properties.
          if (AfyToken.tdarrayPropSpec.recognize(lToken) && lDeclareSymbol())
            lDefaultProcessed = true;

          // Function calls (aggregates, cast etc.).
          else if (AfyToken.tdarrayCorefuncs.recognize(lToken))
          {
            var lNewExpr = (this._getParentType() == "AfySTNode_Projection");
            if (lNewExpr)
              this.mStack.push(new AfySTNode_Expression());
            var lFuncall = new AfySTNode_Funcall(lToken.mType);
            pTokenIter = this._processFuncall(pTokens, pTokenIter, lFuncall) - 1;
            if (lFuncall.mState != AfySTNode.stateNodeFinished)
              lReportError = true;
            else
            {
              this._commitCur();
              if (lNewExpr)
                this._commitCur();
              lDefaultProcessed = true;
            }
          }
        }
        if (!lDefaultProcessed)
        {
          if ((pNode.mState != AfySTNode.stateComma) && pNode.hasChildren())
          {
            pTokenIter--;
            pNode.mState = AfySTNode.stateNodeFinished;
          }
          else
            lReportError = true;
        }
        break;
      }
    }
    if (lReportError)
      this._reportProblem("AfyParser._processProjection: Unexpected token", lToken, pNode, "error");
  }
  if (pNode.mState < AfySTNode.stateNodeFinished && pNode.mState != AfySTNode.stateComma && pNode.hasChildren())
    pNode.mState = AfySTNode.stateNodeFinished;
  Afyassert(this._getParent() == pNode, "Imbalance in node stack (expected: " + pNode.getType() + ", found: " + (this._getParent() ? this._getParent().getType() : "null") + ")");
  return pTokenIter;
}
AfyParser.prototype._processPathExpression = function(pTokens, pTokenIter)
{
  var lStateDot = false;
  var lPathExpr = this._getParent();
  for (pTokenIter++; pTokenIter < pTokens.length && lPathExpr.mState < AfySTNode.stateNodeFinished; pTokenIter++)
  {
    var lReportError = false;
    var lToken = pTokens[pTokenIter];
    switch (lToken.mType)
    {
      case AfyToken.tdDot.afy_tokenType:
        if (lStateDot)
          lReportError = true;
        else
          lStateDot = true;
        break

      case AfyToken.tdAlnum.afy_tokenType:
      case AfyToken.tdColon.afy_tokenType:
      case AfyToken.tdQuotedSymbol.afy_tokenType:
        if (lStateDot)
        {
          var lSymbol = new AfySTNode_Symbol();
          pTokenIter = this._processSymbol(pTokens, pTokenIter - 1, lSymbol) - 1;
          if (lSymbol.mState != AfySTNode.stateNodeFinished)
            lReportError = true;
          else
          {
            this._commitCur();
            lStateDot = false;
          }
        }
        else
          lReportError = true;
        break;
      
      // TODO: {*}, [] etc.

      default:
        if (!lStateDot)
          lPathExpr.mState = AfySTNode.stateNodeFinished;
        else
          lReportError = true;
        break;
    }
    if (lReportError)
      this._reportProblem("AfyParser._processPathExpression: Unexpected token", lToken, null, "error");
  }
  return pTokenIter;
}
AfyParser.prototype._processSelectionScope = function(pTokens, pTokenIter, pNode) // SELECT FROM <scope>, UPDATE <scope>, ...
{
  var lStateCheckPath = false;
  this.mStack.push(pNode);
  for (pTokenIter++; pTokenIter < pTokens.length && pNode.mState < AfySTNode.stateNodeFinished; pTokenIter++)
  {
    var lReportError = false;
    var lToken = pTokens[pTokenIter];
    switch (lToken.mType)
    {
      // Comments.
      case AfyToken.tdCommentSingleLine.afy_tokenType:
      case AfyToken.tdCommentMutliLineOpen.afy_tokenType:
        pTokenIter = this._processComment(pTokens, pTokenIter) - 1;
        break;
      case AfyToken.tdNewLine.afy_tokenType:
        break;

      // Star (FROM *).
      case AfyToken.tdInfixOperator.afy_tokenType:
        if (pNode.mState == AfySTNode.stateNodeStarted && lToken.mText == "*")
        {
          this.mStack.push(new AfySTNode_Symbol("*"));
          this._commitCur();
          pNode.mState = AfySTNode.stateNodeFinished;
        }
        else
          lReportError = true;
        break;

      // Symbols (FROM class/family).
      case AfyToken.tdAlnum.afy_tokenType:
      case AfyToken.tdColon.afy_tokenType:
      case AfyToken.tdQuotedSymbol.afy_tokenType:
        if (pNode.mState == AfySTNode.stateNodeStarted)
        {
          var lPathExp = new AfySTNode_PathExpression();
          this.mStack.push(lPathExp);
          var lSymbol = new AfySTNode_Symbol();
          pTokenIter = this._processSymbol(pTokens, pTokenIter - 1, lSymbol) - 1;
          if (lSymbol.mState != AfySTNode.stateNodeFinished)
            lReportError = true;
          else
          {
            // Family parameters.
            // Review: check existing families?
            if (pTokenIter + 1 < pTokens.length)
            {
              var lNextToken = pTokens[pTokenIter + 1];
              if (lNextToken.mType == AfyToken.tdParenthesisOpen.afy_tokenType)
              {
                var lFuncall = new AfySTNode_Funcall("");
                pTokenIter = this._processFuncall(pTokens, pTokenIter, lFuncall) - 1;
                if (lFuncall.mState != AfySTNode.stateNodeFinished) { lReportError = true; } else { this._commitCur(); lNextToken = pTokens[pTokenIter + 1]; }
              }
            }

            // Commit the root of the path (but not the whole path expression yet).
            this._commitCur();
            lStateCheckPath = true;
          }
        }
        else
          lReportError = true;
        break;

      // PID (as a terminal scope, or as starting point of a path).
      // TODO: @ctx, @self and @:n are only valid in some contexts...
      case AfyToken.tdAtPin.afy_tokenType:
      case AfyToken.tdAtCtx.afy_tokenType:
      case AfyToken.tdAtSelf.afy_tokenType:
      case AfyToken.tdAtLocal.afy_tokenType:
      case AfyToken.tdAtSign.afy_tokenType:
        if (pNode.mState == AfySTNode.stateNodeStarted)
        {
          this.mStack.push(new AfySTNode_PathExpression());
          var lReference = new AfySTNode_Reference();
          pTokenIter = this._processReference(pTokens, pTokenIter - 1, lReference) - 1;
          if (lReference.mState != AfySTNode.stateNodeFinished) { lReportError = true; } else { this._commitCur(); lStateCheckPath = true; }
        }
        else
          lReportError = true;
        break;
        
      case AfyToken.tdDot.afy_tokenType:
        if (pNode.mState == AfySTNode.stateNodeStarted && lStateCheckPath && this._getParentType() == "AfySTNode_PathExpression")
        {
          var lPathExp = this._getParent();
          pTokenIter = this._processPathExpression(pTokens, pTokenIter) - 1;
          if (lPathExp.mState != AfySTNode.stateNodeFinished)
            { lReportError = true; }
          else
          {
            this._commitCur();
            lStateCheckPath = false;
            pNode.mState = AfySTNode.stateNodeFinished;
          }
        }
        else
          lReportError = true;
        break;

     // TODO: collection of pids (SELECT FROM {@50001, @50002, ...})
 
      default:
        if (pNode.mState == AfySTNode.stateNodeStarted && lStateCheckPath && this._getParentType() == "AfySTNode_PathExpression")
        {
          this._commitCur();
          lStateCheckPath = false;
          pNode.mState = AfySTNode.stateNodeFinished;
          pTokenIter--;
        }
        else
          lReportError = true;
        break;
    }
    if (lReportError)
      this._reportProblem("AfyParser._processSelectionScope: Unexpected token", lToken, pNode, "error");
  }
  Afyassert(this._getParent() == pNode, "Imbalance in node stack (expected: " + pNode.getType() + ", found: " + (this._getParent() ? this._getParent().getType() : "null") + ")");
  return pTokenIter;
}
AfyParser.prototype._processPredicate = function(pTokens, pTokenIter, pNode) // WHERE (selection)
{
  this.mStack.push(pNode);
  var lReportError = false;
  var lExpression = new AfySTNode_Expression();
  pTokenIter = this._processExpression(pTokens, pTokenIter, lExpression);
  if (lExpression.mState != AfySTNode.stateNodeFinished) { lReportError = true; }
  else { this._commitCur(); pNode.mState = AfySTNode.stateNodeFinished; }
  if (lReportError)
    this.mErrors.addError("AfyParser._processPredicate: Incomplete node", this.mFileName, -1);
  Afyassert(this._getParent() == pNode, "Imbalance in node stack (expected: " + pNode.getType() + ", found: " + (this._getParent() ? this._getParent().getType() : "null") + ")");
  return pTokenIter;
}
AfyParser.prototype._processAssignments = function(pTokens, pTokenIter, pOp) // SET p1=v1, p2=v2, ...
{
  var lStop = false;
  var lCommaState = 0; // 0: ready for lhs; 1: ready for assignment+rhs; 2: ready for comma
  var lParent = this._getParent();
  var lReportError = false;
  var lThis = this;
  var lDeclareLhs =
    function()
    {
      lThis.mStack.push(new AfySTNode_Assignment(pOp));
      var lSymbol = new AfySTNode_Symbol();
      pTokenIter = lThis._processSymbol(pTokens, pTokenIter - 1, lSymbol) - 1;
      if (lSymbol.mState != AfySTNode.stateNodeFinished)
        lReportError = true;
      else
        lThis._commitCur();
    };
  for (pTokenIter++; pTokenIter < pTokens.length && !lStop; pTokenIter++)
  {
    lReportError = false;
    var lToken = pTokens[pTokenIter];
    switch (lToken.mType)
    {
      // Comments.
      case AfyToken.tdCommentSingleLine.afy_tokenType:
      case AfyToken.tdCommentMutliLineOpen.afy_tokenType:
        pTokenIter = this._processComment(pTokens, pTokenIter) - 1;
        break;
      case AfyToken.tdNewLine.afy_tokenType:
        break;

      // Closing parenthesis/curly (in nested INSERT).
      // Note: expected closing parenthesis/curly is checked in _processRoot.
      case AfyToken.tdCurlyClose.afy_tokenType:
      case AfyToken.tdParenthesisClose.afy_tokenType:
      {
        var lRoots = this._getParentsOfType("AfySTNode_Root");
        if (2 == lCommaState && lRoots.length > 1)
          { lStop = true; pTokenIter--; lRoots[0].mState = AfySTNode.stateNodeFinished; }
        else
          lReportError = true;
        break;
      }
      // Closing WHERE (in UPDATE).
      case AfyToken.tdKWwhere.afy_tokenType:
      {
        if (2 == lCommaState && lParent.getType() == "AfySTNode_UPDATE")
          { lStop = true; pTokenIter--; }
        else
          lReportError = true;
        break;
      }
      // Closing semicolon (optional).
      // Review: mark nested root as finished?
      case AfyToken.tdSemicolon.afy_tokenType:
      {
        if (2 == lCommaState)
          lStop = true;
        else
          lReportError = true;
        break;
      }

      // Comma.
      case AfyToken.tdComma.afy_tokenType:
        if (2 == lCommaState && this._getParent() == lParent)
          lCommaState = 0;
        else
          lReportError = true;
        break;

      // Symbols.
      // TODO: unit names may also occur here (lexical collision)...
      case AfyToken.tdAlnum.afy_tokenType:
      case AfyToken.tdColon.afy_tokenType:
      case AfyToken.tdQuotedSymbol.afy_tokenType:
        if (0 == lCommaState && this._getParent() == lParent)
          { lDeclareLhs(); lCommaState = 1; }
        else
          lReportError = true;
        break;

      // Assignment.
      case AfyToken.tdSpecialAssignment.afy_tokenType:
      case AfyToken.tdEqual.afy_tokenType:
      {
        var lAssignmentCompleted = false;
        if (1 == lCommaState && this._getParentType() == "AfySTNode_Assignment")
        {
          var lExpression = new AfySTNode_Expression();
          pTokenIter = this._processExpression(pTokens, pTokenIter, lExpression) - 1;
          if (lExpression.mState == AfySTNode.stateNodeFinished)
          {
            this._commitCur();
            Afyassert(this._getParentType() == "AfySTNode_Assignment", "Expected an assignment, found a " + (this._getParent() ? this._getParent().getType() : "null"));
            this._commitCur(); // Closing the AfySTNode_Assignment node...
            lAssignmentCompleted = true;
            lCommaState = 2;
          }
        }
        if (!lAssignmentCompleted)
          lReportError = true;
        break;
      }

      default:
      {
        // Special Properties.
        if (0 == lCommaState && this._getParent() == lParent && AfyToken.tdarrayPropSpec.recognize(lToken))
          { lDeclareLhs(); lCommaState = 1; }
        else
          lReportError = true;
        break;
      }
    }
    if (lReportError)
      this._reportProblem("AfyParser._processAssignments: Unexpected token", lToken, null, "error");
  }
  Afyassert(this._getParent() == lParent, "Imbalance in node stack (expected: " + lParent.getType() + ", found: " + (this._getParent() ? this._getParent().getType() : "null") + ")");
  return pTokenIter;
}
AfyParser.prototype._processCREATE = function(pTokens, pTokenIter, pNode)
{
  this.mStack.push(pNode);
  pNode.setFirstToken(pTokens[pTokenIter]);
  for (pTokenIter++; pTokenIter < pTokens.length && pNode.mState < AfySTNode.stateNodeFinished; pTokenIter++)
  {
    var lReportError = false;
    var lToken = pTokens[pTokenIter];
    switch (lToken.mType)
    {
      // Comments.
      case AfyToken.tdCommentSingleLine.afy_tokenType:
      case AfyToken.tdCommentMutliLineOpen.afy_tokenType:
        pTokenIter = this._processComment(pTokens, pTokenIter) - 1;
        break;
      case AfyToken.tdNewLine.afy_tokenType:
        break;
        
      // CLASS/TIMER, and afy:objectID.
      case AfyToken.tdKWclass.afy_tokenType:
      case AfyToken.tdKWtimer.afy_tokenType:
        if (pNode.mState == AfySTNode.stateNodeStarted)
        {
          pNode.setKind(lToken.mText.toUpperCase());

          // Insert an assignment: afy:objectID=...
          this.mStack.push(new AfySTNode_Assignment('set'));
          this.mStack.push(new AfySTNode_Symbol("afy:objectID")); this._commitCur();
          var lObjectID = new AfySTNode_Symbol(); lObjectID.mNameOnly = true;
          pTokenIter = this._processSymbol(pTokens, pTokenIter, lObjectID) - 1;
          if (lObjectID.mState != AfySTNode.stateNodeFinished)
            lReportError = true;
          else
          {
            this._commitCur(); // The objectID's rhs.
            this._commitCur(); // The assignment.
            pNode.mState = AfySTNode.stateOIDFinished;
          }
        }
        else
          lReportError = true;
        break;

      // OPTIONS.
      case AfyToken.tdKWoptions.afy_tokenType:
        if (pNode.mState == AfySTNode.stateOIDFinished)
        {
          var lOptions = new AfySTNode_Options();
          pTokenIter = this._processOptions(pTokens, pTokenIter, lOptions) - 1;
          if (lOptions.mState != AfySTNode.stateNodeFinished) { lReportError = true; } else { this._commitCur(); }
        }
        else
          lReportError = true;
        break;

      // INTERVAL, for timers.
      case AfyToken.tdLiteralInterval.afy_tokenType:
        if (pNode.mState == AfySTNode.stateOIDFinished)
        {
          // Insert an assignment: afy:timerInterval=...
          this.mStack.push(new AfySTNode_Assignment('set'));
          this.mStack.push(new AfySTNode_Symbol("afy:timerInterval")); this._commitCur();
          this.mStack.push(new AfySTNode_Literal(lToken.mText)); this._commitCur(); // Review: May want to track all literal timestamps specifically...
          this._commitCur();
          pNode.mState = AfySTNode.stateTimerIntervalFinished;
        }
        else
          lReportError = true;
        break;

      // AS SELECT ...
      case AfyToken.tdKWas.afy_tokenType:
        if ((pNode.mState == AfySTNode.stateOIDFinished && pNode.mKind == "CLASS") &&
          pTokenIter + 1 < pTokens.length &&
          pTokens[pTokenIter + 1].mType == AfyToken.tdKWselect.afy_tokenType)
        {
          this.mStack.push(new AfySTNode_Assignment('set'));
          this.mStack.push(new AfySTNode_Symbol("afy:predicate")); this._commitCur();
          var lPredicate = new AfySTNode_SELECT();
          pTokenIter = this._processSELECT(pTokens, pTokenIter + 1, lPredicate) - 1;
          if (lPredicate.mState != AfySTNode.stateNodeFinished)
            lReportError = true;
          else
          {
            this._commitCur();
            this._commitCur();
            pNode.mState = AfySTNode.statePredicateFinished;
          }
        }
        else if ((pNode.mState == AfySTNode.stateTimerIntervalFinished && pNode.mKind == "TIMER") &&
          pTokenIter + 1 < pTokens.length)
        {
          this.mStack.push(new AfySTNode_Assignment('set'));
          this.mStack.push(new AfySTNode_Symbol("afy:action")); this._commitCur();
          var lAction = new AfySTNode_Root();
          pTokenIter = this._processRoot(pTokens, pTokenIter + 1, lAction, {singleStatement:true}) - 1;
          this._commitCur(); this._commitCur(); pNode.mState = AfySTNode.stateNodeFinished;
        }
        else
          lReportError = true;
        break;

      // Assignments.
      case AfyToken.tdKWset.afy_tokenType:
        if (pNode.mState == AfySTNode.statePredicateFinished)
        {
          pTokenIter = this._processAssignments(pTokens, pTokenIter, 'set') - 1;
          pNode.mState = AfySTNode.stateNodeFinished;
        }
        else
          lReportError = true;
        break;
        
      // Closing semicolon (optional).
      case AfyToken.tdSemicolon.afy_tokenType:
        if (pNode.mState == AfySTNode.statePredicateFinished)
          pNode.mState = AfySTNode.stateNodeFinished;
        else
          lReportError = true;
        break;

      // Unhandled tokens.
      default:
        lReportError = true;
        break;
    }
    if (lReportError)
      this._reportProblem("AfyParser._processCREATE: Unexpected token", lToken, pNode, "error");
  }
  if (pNode.mState == AfySTNode.statePredicateFinished && pTokenIter >= pTokens.length)
    pNode.mState = AfySTNode.stateNodeFinished;
  Afyassert(this._getParent() == pNode, "Imbalance in node stack (expected: " + pNode.getType() + ", found: " + (this._getParent() ? this._getParent().getType() : "null") + ")");
  pNode.setLastToken(pTokens[pTokenIter - 1]);
  return pTokenIter;
}
AfyParser.prototype._processINSERT = function(pTokens, pTokenIter, pNode)
{
  this.mStack.push(pNode);
  pNode.setFirstToken(pTokens[pTokenIter]);
  for (pTokenIter++; pTokenIter < pTokens.length && pNode.mState < AfySTNode.stateNodeFinished; pTokenIter++)
  {
    var lReportError = false;
    var lToken = pTokens[pTokenIter];
    switch (lToken.mType)
    {
      // Comments.
      case AfyToken.tdCommentSingleLine.afy_tokenType:
      case AfyToken.tdCommentMutliLineOpen.afy_tokenType:
        pTokenIter = this._processComment(pTokens, pTokenIter) - 1;
        break;
      case AfyToken.tdNewLine.afy_tokenType:
        break;

      // @:n
      case AfyToken.tdAtLocal.afy_tokenType:
        if (pNode.mState == AfySTNode.stateNodeStarted)
          pNode.setLabelID(lToken.mText);
        else
          lReportError = true;
        break;
        
      // OPTIONS.
      case AfyToken.tdKWoptions.afy_tokenType:
        if (pNode.mState == AfySTNode.stateNodeStarted)
        {
          var lOptions = new AfySTNode_Options();
          pTokenIter = this._processOptions(pTokens, pTokenIter, lOptions) - 1;
          if (lOptions.mState != AfySTNode.stateNodeFinished) { lReportError = true; } else { this._commitCur(); }
        }
        else
          lReportError = true;
        break;

      // Closing semicolon (optional).
      // TODO: check that has at least afy:objectID and afy:predicate assignments...
      case AfyToken.tdSemicolon.afy_tokenType:
        pNode.mState = AfySTNode.stateNodeFinished;
        break;

      // Assignments.
      default:
        pTokenIter = this._processAssignments(pTokens, pTokenIter - 1, 'set') - 1;
        pNode.mState = AfySTNode.stateNodeFinished;
        break;
    }
    if (lReportError)
      this._reportProblem("AfyParser._processINSERT: Unexpected token", lToken, pNode, "error");
  }
  Afyassert(this._getParent() == pNode, "Imbalance in node stack (expected: " + pNode.getType() + ", found: " + (this._getParent() ? this._getParent().getType() : "null") + ")");
  pNode.setLastToken(pTokens[pTokenIter - 1]);
  return pTokenIter;
}
AfyParser.prototype._processUPDATE = function(pTokens, pTokenIter, pNode)
{
  this.mStack.push(pNode);
  pNode.setFirstToken(pTokens[pTokenIter]);
  for (pTokenIter++; pTokenIter < pTokens.length && pNode.mState < AfySTNode.stateNodeFinished; pTokenIter++)
  {
    var lReportError = false;
    var lToken = pTokens[pTokenIter];
    switch (lToken.mType)
    {
      // Comments.
      case AfyToken.tdCommentSingleLine.afy_tokenType:
      case AfyToken.tdCommentMutliLineOpen.afy_tokenType:
        pTokenIter = this._processComment(pTokens, pTokenIter) - 1;
        break;
      case AfyToken.tdNewLine.afy_tokenType:
        break;

      // Closing parenthesis/curly (in nested UPDATE).
      // TODO: formally track whether we expect curly or parenthesis.
      case AfyToken.tdCurlyClose.afy_tokenType:
      case AfyToken.tdParenthesisClose.afy_tokenType:
      {
        var lRoots = this._getParentsOfType("AfySTNode_Root");
        if (lRoots.length > 1 && pNode.mState == AfySTNode.stateAssignmentsFinished)
          { pNode.mState = lRoots[0].mState = AfySTNode.stateNodeFinished; pTokenIter--; }
        else
          lReportError = true;
        break;
      }

      // Assignments.
      case AfyToken.tdKWset.afy_tokenType:
      case AfyToken.tdKWadd.afy_tokenType:
        if (pNode.mState == AfySTNode.stateSelectionScopeFinished)
        {
          pTokenIter = this._processAssignments(pTokens, pTokenIter, lToken.mText) - 1;
          if (pTokenIter + 1 < pTokens.length && pTokens[pTokenIter + 1].mType == AfyToken.tdKWwhere.afy_tokenType)
            pNode.mState = AfySTNode.stateAssignmentsFinished;
          else
            pNode.mState = AfySTNode.stateNodeFinished;
        }
        else
          lReportError = true;
        break;

      // Property deletion.
      case AfyToken.tdKWdelete.afy_tokenType:
        if (pNode.mState == AfySTNode.stateSelectionScopeFinished)
        {
          this.mStack.push(new AfySTNode_Assignment('delete'));
          var lProperties = new AfySTNode_Projection();
          pTokenIter = this._processProjection(pTokens, pTokenIter, lProperties) - 1;
          if (lProperties.mState != AfySTNode.stateNodeFinished) { lReportError = true; } else { this._commitCur(); this._commitCur(); pNode.mState = AfySTNode.stateAssignmentsFinished; }
        }
        else
          lReportError = true;
        break;
        
      // WHERE.
      case AfyToken.tdKWwhere.afy_tokenType:
        if (pNode.mState == AfySTNode.stateSelectionScopeFinished || pNode.mState == AfySTNode.stateAssignmentsFinished)
        {
          var lPredicate = new AfySTNode_Predicate();
          pTokenIter = this._processPredicate(pTokens, pTokenIter, lPredicate) - 1;
          if (lPredicate.mState != AfySTNode.stateNodeFinished)
            { lReportError = true; }
          else
          {
            var lRoots = this._getParentsOfType("AfySTNode_Root");
            if (lRoots.length > 1 && pTokenIter + 1 < pTokens.length &&
              ((pTokens[pTokenIter + 1].mType == AfyToken.tdCurlyClose.afy_tokenType) || (pTokens[pTokenIter + 1].mType == AfyToken.tdParenthesisClose.afy_tokenType)))
                { pNode.mState = AfySTNode.stateAssignmentsFinished; }
            else
              { pNode.mState = AfySTNode.stateNodeFinished; }
            this._commitCur(); 
          }
        }
        else
          lReportError = true;
        break;

      // Unhandled tokens.
      default:
        if (pNode.mState == AfySTNode.stateNodeStarted)
        {
          var lSelectionScope = new AfySTNode_SelectionScope();
          pTokenIter = this._processSelectionScope(pTokens, pTokenIter - 1, lSelectionScope) - 1;
          if (lSelectionScope.mState != AfySTNode.stateNodeFinished) { lReportError = true; } else { this._commitCur(); pNode.mState = AfySTNode.stateSelectionScopeFinished; }
        }
        else
          lReportError = true;
        break;
    }
    if (lReportError)
      this._reportProblem("AfyParser._processUPDATE: Unexpected token", lToken, pNode, "error");
  }
  if (pNode.mState >= AfySTNode.stateAssignmentsFinished && pNode.hasChildren())
    pNode.mState = AfySTNode.stateNodeFinished;
  Afyassert(this._getParent() == pNode, "Imbalance in node stack (expected: " + pNode.getType() + ", found: " + (this._getParent() ? this._getParent().getType() : "null") + ")");
  pNode.setLastToken(pTokens[pTokenIter - 1]);
  return pTokenIter;
}
AfyParser.prototype._processDELETE = function(pTokens, pTokenIter, pNode)
{
  this.mStack.push(pNode);
  pNode.setFirstToken(pTokens[pTokenIter]);
  for (pTokenIter++; pTokenIter < pTokens.length && pNode.mState < AfySTNode.stateNodeFinished; pTokenIter++)
  {
    var lReportError = false;
    var lToken = pTokens[pTokenIter];
    switch (lToken.mType)
    {
      // Comments.
      case AfyToken.tdCommentSingleLine.afy_tokenType:
      case AfyToken.tdCommentMutliLineOpen.afy_tokenType:
        pTokenIter = this._processComment(pTokens, pTokenIter) - 1;
        break;
      case AfyToken.tdNewLine.afy_tokenType:
        break;

      // TODO...

      // WHERE.
      case AfyToken.tdKWwhere.afy_tokenType:
        if (pNode.mState == AfySTNode.stateSelectionScopeFinished || pNode.mState == AfySTNode.stateAssignmentsFinished)
        {
          var lPredicate = new AfySTNode_Predicate();
          pTokenIter = this._processPredicate(pTokens, pTokenIter, lPredicate) - 1;
          if (lPredicate.mState != AfySTNode.stateNodeFinished) { lReportError = true; } else { this._commitCur(); pNode.mState = AfySTNode.stateNodeFinished; }
        }
        else
          lReportError = true;
        break;

      // Unhandled tokens.
      default:
        if (pNode.mState == AfySTNode.stateNodeStarted)
        {
          var lSelectionScope = new AfySTNode_SelectionScope();
          pTokenIter = this._processSelectionScope(pTokens, pTokenIter - 1, lSelectionScope) - 1;
          if (lSelectionScope.mState != AfySTNode.stateNodeFinished) { lReportError = true; } else { this._commitCur(); pNode.mState = AfySTNode.stateSelectionScopeFinished; }
        }
        else
          lReportError = true;
        break;
    }
    if (lReportError)
      this._reportProblem("AfyParser._processDELETE: Unexpected token", lToken, pNode, "error");
  }
  Afyassert(this._getParent() == pNode, "Imbalance in node stack (expected: " + pNode.getType() + ", found: " + (this._getParent() ? this._getParent().getType() : "null") + ")");
  pNode.setLastToken(pTokens[pTokenIter - 1]);
  return pTokenIter;
}
AfyParser.prototype._processSELECT = function(pTokens, pTokenIter, pNode)
{
  this.mStack.push(pNode);
  pNode.setFirstToken(pTokens[pTokenIter]);
  var lProjection = new AfySTNode_Projection();
  pTokenIter = this._processProjection(pTokens, pTokenIter, lProjection) - 1;
  if (lProjection.mState != AfySTNode.stateNodeFinished)
    { this._reportProblem("AfyParser._processSELECT: Unexpected token in ", pTokens[pTokenIter], pNode, "error"); return pTokenIter; }
  this._commitCur();
  Afyassert(this._getParent() == pNode, "Imbalance in node stack (expected: " + pNode.getType() + ", found: " + (this._getParent() ? this._getParent().getType() : "null") + ")");
  var lState = "projectionFinished";
  for (pTokenIter++; pTokenIter < pTokens.length && pNode.mState < AfySTNode.stateNodeFinished; pTokenIter++)
  {
    var lReportError = false;
    var lToken = pTokens[pTokenIter];
    switch (lToken.mType)
    {
      // Comments.
      case AfyToken.tdCommentSingleLine.afy_tokenType:
      case AfyToken.tdCommentMutliLineOpen.afy_tokenType:
        pTokenIter = this._processComment(pTokens, pTokenIter) - 1;
        break;
      case AfyToken.tdNewLine.afy_tokenType:
        break;

      // Closing parenthesis (in nested SELECT).
      case AfyToken.tdParenthesisClose.afy_tokenType:
      {
        var lRoots = this._getParentsOfType("AfySTNode_Root");
        if ((lState == "projectionFinished" || lState == "selectionScopeFinished" || lState == "predicateFinished") && lRoots.length > 1)
          { pTokenIter--; pNode.mState = lRoots[0].mState = AfySTNode.stateNodeFinished;  }
        else
          lReportError = true;
        break;
      }

      // FROM.
      case AfyToken.tdKWfrom.afy_tokenType:
        if (lState == "projectionFinished")
        {
          var lSelectionScope = new AfySTNode_SelectionScope();
          pTokenIter = this._processSelectionScope(pTokens, pTokenIter, lSelectionScope) - 1;
          if (lSelectionScope.mState != AfySTNode.stateNodeFinished) { lReportError = true; } else { this._commitCur(); lState = "selectionScopeFinished"; }
        }
        break;

      // WHERE.
      case AfyToken.tdKWwhere.afy_tokenType:
        if (lState == "projectionFinished" || lState == "selectionScopeFinished")
        {
          var lPredicate = new AfySTNode_Predicate();
          pTokenIter = this._processPredicate(pTokens, pTokenIter, lPredicate) - 1;
          if (lPredicate.mState != AfySTNode.stateNodeFinished) { lReportError = true; } else { this._commitCur(); lState = "predicateFinished"; }
        }
        break;

      // TODO: AS ... JOIN ... AS ... ON...
      // TODO: ORDER BY
      // TODO: GROUP BY
      // TODO: HAVING

      default:
        if (lState == "selectionScopeFinished" || lState == "predicateFinished")
        {
          pTokenIter--;
          pNode.mState = AfySTNode.stateNodeFinished;
        }
        else
          lReportError = true;
        break;
    }
    if (lReportError)
      this._reportProblem("AfyParser._processSELECT: Unexpected token", lToken, pNode, "error");
  }
  if ((lState == "selectionScopeFinished" || lState == "predicateFinished") && pTokenIter >= pTokens.length)
    pNode.mState = AfySTNode.stateNodeFinished;
  Afyassert(this._getParent() == pNode, "Imbalance in node stack (expected: " + pNode.getType() + ", found: " + (this._getParent() ? this._getParent().getType() : "null") + ")");
  pNode.setLastToken(pTokens[pTokenIter - 1]);
  return pTokenIter;
}
