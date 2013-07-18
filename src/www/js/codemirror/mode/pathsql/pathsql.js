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

CodeMirror.defineMode(
  "pathsql",
  function(config, parserConfig)
  {
    /**
     * StateDef.
     * Internal state used to implement the interface
     * (an instance lives across multiple calls to 'token').
     */
    function StateDef()
    {
      var sDefaultStyle = "tag"; // Review...
      var sShowErrors = true;
      var lThis = this;
      var lInComment = false;
      var lCurLine = {number:1, tokens:[], fullyparsed:false};
      this._getState = function() { return {incomment:lInComment, curline:lCurLine}; }
      this._copyFrom =
        function(pSrc)
        {
          // Note:
          //   We only pre-process once, after which everything is immutable
          //   (future additions don't alter past decisions), so it should be ok to just share
          //   those references (no deep clone).
          var _lS = pSrc._getState();
          lInComment = _lS.incomment;
          lCurLine = _lS.curline;
          return lThis;
        }
      this._peekCurrentLine =
        function(pStream)
        {
          if (!pStream.sol()) { return null; }
          var _lLine = '';
          while (!pStream.eol())
            _lLine += pStream.next();
          pStream.backUp(_lLine.length);
          return _lLine;
        }
      this.onBlankLine = function() { lCurLine.number++; }
      this.begin =
        function(pStream)
        {
          // Deal once with every new line.
          if (!pStream.sol()) { return; }

          // Grab the pre-parsed tokens for this line.
          lCurLine.tokens = [];
          lCurLine.fullyparsed = true;
          var _lTokens = AFY_CONTEXT.mEditingCtx.getParsed().getTokens();
          for (var _iT = 0; _iT < _lTokens.length; _iT++)
          {
            var _lT = _lTokens[_iT];
            if (lCurLine.number > _lT.mLine)
              continue;
            else if (lCurLine.number < _lT.mLine)
              break;
            lCurLine.tokens.push(_lT);
          }

          // If the pre-parsed tokens don't match the actual line, re-parse and mark as "not fully parsed".
          // Note: This happens while editing, in between scheduled full reparsing.
          // Note: "not fully parsed" lines will not display errors (until full reparsing is done).
          var _lActualLine = this._peekCurrentLine(pStream);
          var _lParsedLine = lCurLine.tokens.map(function(_t) { return _t.mText; }).join("").replace(/\s/g, "");
          if (_lParsedLine != _lActualLine.replace(/\s/g, ""))
          {
            var _lErrors = new AfyCompileErrors();
            var _lLexer = new AfyLexer(_lErrors);
            _lLexer.process([_lActualLine]);
            lCurLine.tokens = _lLexer.mTokens;
            lCurLine.fullyparsed = false;
          }

          // Debugging...
          if (false)
            myLog("line #" + lCurLine.number + (lCurLine.fullyparsed ? " [fp]" : " [!fp]") + ":\n  " + _lActualLine + "\n  tokens: " + lCurLine.tokens.map(function(_t) { return _t.mText; }).join(","));
        };
      this.processCurrentToken =
        function(pStream)
        {
          // White space (nothing to do).
          if (pStream.eol() || pStream.eatSpace())
            return null;

          // Comments (trivial to pre-process here).
          var _lC = pStream.next();
          if ('/' == _lC && '*' == pStream.peek())
            { pStream.next(); lInComment = true; }
          if (lInComment)
          {
            while (!pStream.eol())
            {
              if ('*' != _lC)
                pStream.eatWhile(/[^\*]/);
              if ('/' == (_lC = pStream.next()))
                { lInComment = false; break; }
            }
            return "comment";
          }
          if ('-' == _lC && '-' == pStream.peek())
            { pStream.skipToEnd(); return "comment"; }

          // Errors.
          var lCurCol = pStream.column();
          if (sShowErrors && lCurLine.fullyparsed)
          {
            // Note:
            //   Highlights the fact that
            //   my 'ParserInterface' policy will not be able to specify all the requirements
            //   for Mark's parser (the choice of errors and how to report them has a big effect
            //   on the UX, but is intricately woven in the parser, and hard to describe as
            //   a programmatic interface).
            var _lErrors = AFY_CONTEXT.mEditingCtx.getParsed().getErrors();
            for (var _iE = 0; _iE < _lErrors.length; _iE++)
            {
              var _lT = _lErrors[_iE].token;
              if (lCurLine.number != _lT.mLine)
                continue;
              if (lCurCol >= _lT.mColumn && lCurCol < _lT.mColumn + _lT.mText.length)
              {
                myLog('error detected at col: ' + lCurCol + ' on: ' + _lT.mText);
                return "error";
              }
            }
          }

          // Normal tokens.
          var _lHighlights = AFY_CONTEXT.mEditingCtx.highlightedSymbols();
          for (var _iT = 0; _iT < lCurLine.tokens.length; _iT++)
          {
            var _lT = lCurLine.tokens[_iT];
            if (lCurCol >= _lT.mColumn && lCurCol < _lT.mColumn + _lT.mText.length)
            {
              for (var _iS = 1; _iS < _lT.mText.length; _iS++) // Note: the 'token' entry point eats the first character.
                pStream.next();

              // Deal with explicitly highlighted stuff.
              // Note: this is +/- a workaround until I fully integrate the parser here...
              for (var _iH in _lHighlights)
              {
                var _lTarget = null;
                if (0 == _iH.indexOf(_lT.mText)) _lTarget = _iH;
                else if (0 == afy_with_qname(_iH).indexOf(_lT.mText)) _lTarget = afy_with_qname(_iH);
                if (undefined == _lTarget) continue;
                var _lSuff = "";
                for (var _iAdv = 0; _iAdv < (_lTarget.length - _lT.mText.length) && !pStream.eol(); _iAdv++)
                  _lSuff += pStream.next();
                if (_lTarget == _lT.mText + _lSuff)
                  return "strong";
                pStream.backUp(_iAdv);
              }

              // Everything else.
              if (AfyToken.tdarrayKeywords.recognize(_lT))
                return "keyword";
              else if (AfyToken.tdarrayCorefuncs.recognize(_lT))
                return "builtin";
              else if (AfyToken.tdarrayPropSpec.recognize(_lT))
                return "attribute";
              else switch(_lT.mType)
              {
                case AfyToken.tdAlnum.afy_tokenType:
                case AfyToken.tdColon.afy_tokenType:
                case AfyToken.tdQuotedSymbol.afy_tokenType:
                  return "attribute";
                case AfyToken.tdLiteralString.afy_tokenType:
                case AfyToken.tdLiteralBinaryString.afy_tokenType:
                case AfyToken.tdLiteralTimestamp.afy_tokenType:
                case AfyToken.tdLiteralInterval.afy_tokenType:
                  return "string";
                default:
                  break;
              }
              return "plain";
            }
          }
          return sDefaultStyle;
        };
      this.end = function(pStream) { if (pStream.eol()) { lCurLine.number++; } };
    }

    /**
     * Public interface of this component,
     * following codemirror.js's specification.
     */
    var lPubIface =
      {
        startState: function(basecolumn) { return new StateDef(); },
        copyState: function(state) { var _lS = new StateDef(); return _lS._copyFrom(state); },
        indent: null,
        electricChars: null, //":{}",
        jsonMode: parserConfig.json,
        blankLine: function(state) { state.onBlankLine(); },
        token:
          function(stream, state)
          {
            state.begin(stream);
            var lR = state.processCurrentToken(stream);
            state.end(stream);
            return lR;
          }
      };
    return lPubIface;
  });

CodeMirror.defineMIME("text/pathsql", "pathsql");

// TODO: improve error reporting (make sure it's as unambiguous as possible)
// TODO: review what are 'electricChars'(?)
// TODO: experiment with contextual coloring, the actual css etc. (e.g. highlight all symbols that relate to x etc.)
// TODO: syntax completion
