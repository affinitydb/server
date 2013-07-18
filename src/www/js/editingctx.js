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
 * ParserInterface.
 * This will gradually collect a spec for Mark, in order to
 * provide equivalent functionnality from within the kernel
 * (goal: single parser [i.e. be able to throw away afyparser]).
 * My discipline will be to make sure all accesses to afyparser
 * are channeled here. A related goal will be to keep this reasonably
 * simple without being horrendously inefficient. An alternative
 * might be to expose the methods of AfyParser.mTree used here
 * in the local implementations. In any case, the interface should
 * be suitable for http/remote access.
 * Only the actual public methods (without leading underscore)
 * will define the tentative interface.
 * The state should be limited to 1 immutable parsing
 * of 1 version of the code.
 */
function AfyParserInterface(pCodeStr)
{
  // Note: Since this is practically stateless, I'll make an effort to never need a 'lThis'.
  var lErrors = new AfyCompileErrors();
  var lLexer = new AfyLexer(lErrors);
  lLexer.process(pCodeStr.split("\n"));
  var lParser = new AfyParser(lErrors);
  lParser.process(lLexer.mTokens);

  // Internal implementation.
  var lExtractKeys =
    function(pTree, pNodeType, pNodeKey)
    {
      var _lKd = {}, _lK = [];
      pTree.forEachChildOfType(
        pNodeType, null,
        function(__pCtx, __pNode) { var __lK = __pNode[pNodeKey]; if (!(__lK in _lKd)) { _lKd[__lK] = 1; _lK.push(__lK); } },
        true);
      return _lK;
    }
  var lExtractSymbols = function(pTree) { return lExtractKeys(pTree, "AfySTNode_Symbol", "mName"); }
  var lExtractReferences = function(pTree) { return lExtractKeys(pTree, "AfySTNode_Reference", "mPIN"); }
  var lSplitStatements =
    function(pTree)
    {
      var _lLines = pCodeStr.split("\n");
      var _lRes = [];
      pTree.forEachChildOfType(
        "AfySTNode_INSERT", null,
        function(__pCtx, __pNode)
        {
          var __lTR = __pNode.getTokenRange();
          var __lL1 = __lTR[0].mLine - 1;
          var __lL2 = __lTR[1].mLine - 1;
          var __lLastCol = __lTR[1].mColumn + __lTR[1].mText.length;
          if (__lL1 == __lL2)
            { _lRes.push({text:_lLines[__lL1].substr(__lTR[0].mColumn, __lLastCol - __lTR[0].mColumn), oid:__pNode.getOID(), l1:__lL1, l2:__lL2}); return; }
          var __lR = _lLines[__lL1].substr(__lTR[0].mColumn);
          for (var __iL = __lL1 + 1; __iL <= __lL2 - 1; __iL++)
            __lR += _lLines[__iL];
          __lR += _lLines[__iL].substr(0, __lLastCol);
          _lRes.push({text:__lR, oid:afy_with_qname(__pNode.getOID()), l1:__lL1, l2:__lL2});
        },
        false);
      return _lRes;
    }

  // Public interface (work in progress).
  this.getTokens = function() { return lLexer.mTokens; }
  this.getErrors = function() { /*...*/ return lErrors.mErrors; }
  this.extractSymbols = function() { return lExtractSymbols(lParser.mTree); }
  this.extractReferences = function() { return lExtractReferences(lParser.mTree); }
  this.extractSymbolDetails =
    function()
    {
      var _lSd = [];
      lParser.mTree.forEachChildOfType(
        "AfySTNode_Symbol", null,
        function(_pCtx, _pSym) { var __lTr = _pSym.getTokenRange()[0]; _lSd.push({name:_pSym.mName, startpos:(undefined != __lTr ? (__lTr.mLineStart + __lTr.mColumn) : -1)}); },
        true);
      return _lSd;
    }
  this.splitStatements = function() { return lSplitStatements(lParser.mTree); }

  // Debugging services (semi-public, not part of the interface).
  this._toDbgStrings =
    function()
    {
      var _lResult =
      {
        tokens: lLexer.mTokens.map(function(_t) { return _t.mType; }).join(" "),
        tree: lParser.mTree.toDbgStr(),
        errors: lErrors.getReport(),
        symbols: lExtractSymbols(lParser.mTree).join(",")
      }
      return _lResult;
    }
}

/**
 * AfyEditingCtx.
 * Communication between our CodeMirror mode, and the RuleAssistant.
 */
function AfyEditingCtx()
{
  var lThis = this;
  var lHighlighted = {};
  var lLatestCode = {text:null, parsed:null};
  this.clearHighlightedSymbols = function() { lHighlighted = {}; }
  this.highlightSymbol = function(pSymbol, pOn) { if (pOn) lHighlighted[pSymbol] = 1; else if (pSymbol in lHighlighted) delete lHighlighted[pSymbol]; }
  this.highlightedSymbols = function() { return lHighlighted; }
  this.updateCode = function(pCodeStr) { lLatestCode.text = pCodeStr; lLatestCode.parsed = new AfyParserInterface(lLatestCode.text); return lLatestCode.parsed; }
  this.getParsed = function() { return lLatestCode.parsed; }
}
AFY_CONTEXT.mEditingCtx = new AfyEditingCtx();
