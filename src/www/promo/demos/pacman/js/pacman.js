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
 * Document entry point (by callback).
 */
$(document).ready(function() { new PacmanCanvas(); });

/**
 * Ctx/Helpers.
 */
var SIMULCTX = new Object();
SIMULCTX.mUseAfyTimer = false;
SIMULCTX.mRadical = "pacman1";
SIMULCTX.mNs = "http://" + SIMULCTX.mRadical;
SIMULCTX.mQPrefix = "SET PREFIX simul: '" + SIMULCTX.mNs + "'; ";
SIMULCTX.mClientId = (SIMULCTX.mRadical + new Date() + Math.random()).replace(/\s|\:|\-|\(|\)|\.|/g, "");
SIMULCTX.query = function(pSqlStr, pResultHandler, pOptions) { var lOptions = (undefined != pOptions ? pOptions : {}); if (!('countonly' in lOptions && lOptions.countonly)) { lOptions.longnames = true; } return afy_query(SIMULCTX.mQPrefix + pSqlStr, pResultHandler, lOptions); }
SIMULCTX.queryMulti = function(pSqlArray, pResultHandler, pOptions)
{
  var lOptions = (undefined != pOptions ? pOptions : {});
  lOptions.longnames = true;
  if (typeof(pSqlArray) == 'string') { pSqlArray = [pSqlArray]; }
  var lBatch = [SIMULCTX.mQPrefix];
  pSqlArray.filter(function(_p) { return _p.match(/^\s*$/) ? null : _p; }).forEach(function(_p) { lBatch.push(_p); });
  return afy_batch_query(lBatch, pResultHandler, lOptions);
}
SIMULCTX.extractFullClassName = function(pClassDef)
{
  return pClassDef.match(/^CREATE CLASS (.*) AS SELECT/i)[1].replace("simul:", SIMULCTX.mNs + "/").replace(/\"/g, "");
}
SIMULCTX.createClass = function(pClassDef, pCompletion)
{
  var lClassName = SIMULCTX.extractFullClassName(pClassDef);
  var lDoCreateClass = function() { SIMULCTX.query(pClassDef, new QResultHandler(pCompletion, null, null)); }
  var lOnClassCount = function(_pJson) { if (undefined == _pJson || parseInt(_pJson) == 0) { lDoCreateClass(); } else { pCompletion(); } }
  SIMULCTX.query("SELECT * FROM afy:Classes WHERE CONTAINS(afy:objectID, '" + lClassName + "');", new QResultHandler(lOnClassCount, null, null), {countonly:true});
}
SIMULCTX.createClasses = function(pCompletion)
{
  var lAction_GhostTurn_oldatself =
  [
    // -- the 4 next statements update the ghost's logical position, making sure to repeat the WHERE clause due to async treatment of notifications (n.b. 4 separate statements due to lack of CASE...WHEN)
    "${UPDATE @self SET simul:\"moveable/x\"+=1 WHERE (CONTAINS(simul:\"moveable/direction\", 'R') AND (simul:\"moveable/entering\" >= 1.0))}",
    "${UPDATE @self SET simul:\"moveable/x\"-=1 WHERE (CONTAINS(simul:\"moveable/direction\", 'L') AND (simul:\"moveable/entering\" >= 1.0))}",
    "${UPDATE @self SET simul:\"moveable/y\"+=1 WHERE (CONTAINS(simul:\"moveable/direction\", 'B') AND (simul:\"moveable/entering\" >= 1.0))}",
    "${UPDATE @self SET simul:\"moveable/y\"-=1 WHERE (CONTAINS(simul:\"moveable/direction\", 'T') AND (simul:\"moveable/entering\" >= 1.0))}",
    // -- the next statement calculates a temporary variable corresponding to the board's constraints for the ghost's current position; this technique is used to circumvent limitations with nested SELECT in various contexts... UPDATE ADD is used to circumvent bug #319...
    "${UPDATE @self ADD simul:\"ghost/tmpv1\"=(SELECT simul:\"square/constraints\" FROM simul:squares WHERE simul:\"square/x\"=@self.simul:\"moveable/x\" AND simul:\"square/y\"=@self.simul:\"moveable/y\")}",
    // -- the next statements calculate a temporary variable corresponding to the next direction to take, if necessary; string manipulations are made because intersections/differences on collections don't seem to work...
    // -- I avoid returning the inverse direction, and use some pseudo randomness (based on CURRENT_TIMESTAMP's ms).
    // -- REVIEW: now that bug 320 is fixed, reinsert 'WHERE LENGTH(simul:\"ghost/tmpv1\") > 1' when assigning tmpv4, after pre-assigning a default (n.b. I tried quickly but noticed strange side-effects, to be investigated...)
    "${UPDATE @self SET simul:\"ghost/tmpv2\"=REPLACE('TBLR', SUBSTR(simul:invdir, POSITION(simul:dir, simul:\"moveable/direction\"), 1), '')}",
    "${UPDATE @self SET simul:\"ghost/tmpv3\"=REPLACE(simul:\"ghost/tmpv2\", SUBSTR(simul:\"ghost/tmpv1\", 0, 1), '')}",
    "${UPDATE @self SET simul:\"ghost/tmpv4\"=REPLACE(simul:\"ghost/tmpv3\", SUBSTR(simul:\"ghost/tmpv1\", 1, 1), '')}",
    "${UPDATE @self SET simul:\"ghost/tmprand\"=0}",
    "${UPDATE @self SET simul:\"ghost/tmprand\"=(EXTRACT(FRACTIONAL FROM CURRENT_TIMESTAMP) % 2) WHERE LENGTH(simul:\"ghost/tmpv4\") > 1}",
    // -- the next statement assigns the new direction, if necessary
    "${UPDATE @self SET simul:\"moveable/direction\"=SUBSTR(simul:\"ghost/tmpv4\", simul:\"ghost/tmprand\", 1) WHERE CONTAINS(simul:\"ghost/tmpv1\", simul:\"moveable/direction\") AND (simul:\"moveable/entering\" >= 1.0)}",
    // -- the next statement resets the inter-step progression counter
    "${UPDATE @self SET simul:\"moveable/entering\"=0.1 WHERE (simul:\"moveable/entering\" >= 1.0)}",
    // -- the next statement removes all temporary variables
    "${UPDATE @self DELETE simul:\"ghost/tmpv1\", simul:\"ghost/tmpv2\", simul:\"ghost/tmpv3\", simul:\"ghost/tmpv4\", simul:\"ghost/tmprand\"}",
  ];
  var lAction_GhostTurn_newatauto = // converted to @auto and working
  [
    // -- the 4 next statements update the ghost's logical position, making sure to repeat the WHERE clause due to async treatment of notifications (n.b. 4 separate statements due to lack of CASE...WHEN)
    "${UPDATE @self SET simul:\"moveable/x\"+=1 WHERE (CONTAINS(simul:\"moveable/direction\", 'R') AND (simul:\"moveable/entering\" >= 1.0))}",
    "${UPDATE @self SET simul:\"moveable/x\"-=1 WHERE (CONTAINS(simul:\"moveable/direction\", 'L') AND (simul:\"moveable/entering\" >= 1.0))}",
    "${UPDATE @self SET simul:\"moveable/y\"+=1 WHERE (CONTAINS(simul:\"moveable/direction\", 'B') AND (simul:\"moveable/entering\" >= 1.0))}",
    "${UPDATE @self SET simul:\"moveable/y\"-=1 WHERE (CONTAINS(simul:\"moveable/direction\", 'T') AND (simul:\"moveable/entering\" >= 1.0))}",
    // -- the next statement calculates a temporary variable corresponding to the board's constraints for the ghost's current position; this technique is used to circumvent limitations with nested SELECT in various contexts... UPDATE ADD is used to circumvent bug #319...
    "${UPDATE @auto ADD simul:\"ghost/tmpv1\"=(SELECT simul:\"square/constraints\" FROM simul:squares WHERE simul:\"square/x\"=@self.simul:\"moveable/x\" AND simul:\"square/y\"=@self.simul:\"moveable/y\")}",
    // -- the next statements calculate a temporary variable corresponding to the next direction to take, if necessary; string manipulations are made because intersections/differences on collections don't seem to work...
    // -- I avoid returning the inverse direction, and use some pseudo randomness (based on CURRENT_TIMESTAMP's ms).
    // -- REVIEW: now that bug 320 is fixed, reinsert 'WHERE LENGTH(simul:\"ghost/tmpv1\") > 1' when assigning tmpv4, after pre-assigning a default (n.b. I tried quickly but noticed strange side-effects, to be investigated...)
    "${UPDATE @auto SET simul:\"ghost/tmpv2\"=(SELECT REPLACE('TBLR', SUBSTR(simul:invdir, POSITION(simul:dir, simul:\"moveable/direction\"), 1), '') FROM @self)}",
    "${UPDATE @auto SET simul:\"ghost/tmpv3\"=REPLACE(simul:\"ghost/tmpv2\", SUBSTR(simul:\"ghost/tmpv1\", 0, 1), '')}",
    "${UPDATE @auto SET simul:\"ghost/tmpv4\"=REPLACE(simul:\"ghost/tmpv3\", SUBSTR(simul:\"ghost/tmpv1\", 1, 1), '')}",
    "${UPDATE @auto SET simul:\"ghost/tmprand\"=0}",
    "${UPDATE @auto SET simul:\"ghost/tmprand\"=(EXTRACT(FRACTIONAL FROM CURRENT_TIMESTAMP) % 2) WHERE LENGTH(simul:\"ghost/tmpv4\") > 1}",
    // -- the next statement assigns the new direction, if necessary
    "${UPDATE @self SET simul:\"moveable/direction\"=SUBSTR(@auto.simul:\"ghost/tmpv4\", @auto.simul:\"ghost/tmprand\", 1) WHERE CONTAINS(@auto.simul:\"ghost/tmpv1\", simul:\"moveable/direction\") AND (simul:\"moveable/entering\" >= 1.0)}",
    // -- the next statement resets the inter-step progression counter
    "${UPDATE @self SET simul:\"moveable/entering\"=0.1 WHERE (simul:\"moveable/entering\" >= 1.0)}",
    // -- for debugging
    // -- "${INSERT SELECT * FROM @auto}",
  ];
  var lAction_PlayerTurnConstraint_oldatself =
  [
    // Note:
    //   I chose to do this validation as a join trigger (as opposed to at the source, when setting the new direction)
    //   because of problems encountered with JOIN (here one side of the JOIN becomes a cst, and it works);
    //   I couldn't use an update trigger (updating @self caused some trouble). I couldn't figure how to ROLLBACK either,
    //   due to the complexity of the condition (involving a JOIN).
    // TODO: I think we might need to further investigate potential inherent difficulties in onUpdate...
    "${UPDATE @self ADD simul:\"player/tmpv\"=(SELECT simul:\"square/constraints\" FROM simul:squares WHERE simul:\"square/x\"=@self.simul:\"moveable/x\" AND simul:\"square/y\"=@self.simul:\"moveable/y\")}",
    // "${INSERT didit=CURRENT_TIMESTAMP, tmpv=@self.simul:\"player/tmpv\", next=@self.simul:\"player/direction/next\"}",
    "${UPDATE @self SET simul:\"player/direction/next\"=simul:\"player/direction/tentative\"}",
    "${UPDATE @self SET simul:\"moveable/direction\"=simul:\"player/direction/next\" WHERE simul:\"moveable/direction\"='-' AND NOT CONTAINS(simul:\"player/tmpv\", simul:\"player/direction/tentative\")}",
    "${UPDATE @self DELETE simul:\"player/tmpv\", simul:\"player/direction/tentative\"}",
  ];
  var lAction_PlayerTurnConstraint_newatauto = // converted to @auto and working
  [
    // Note:
    //   I chose to do this validation as a join trigger (as opposed to at the source, when setting the new direction)
    //   because of problems encountered with JOIN (here one side of the JOIN becomes a cst, and it works);
    //   I couldn't use an update trigger (updating @self caused some trouble). I couldn't figure how to ROLLBACK either,
    //   due to the complexity of the condition (involving a JOIN).
    // TODO: I think we might need to further investigate potential inherent difficulties in onUpdate...
    "${UPDATE @auto ADD simul:\"player/tmpv\"=(SELECT simul:\"square/constraints\" FROM simul:squares WHERE simul:\"square/x\"=@self.simul:\"moveable/x\" AND simul:\"square/y\"=@self.simul:\"moveable/y\")}",
    "${UPDATE @self SET simul:\"player/direction/next\"=simul:\"player/direction/tentative\"}",
    "${UPDATE @self SET simul:\"moveable/direction\"=simul:\"player/direction/next\" WHERE simul:\"moveable/direction\"='-' AND NOT CONTAINS(@auto.simul:\"player/tmpv\", simul:\"player/direction/tentative\")}",
    "${UPDATE @self DELETE simul:\"player/direction/tentative\"}",
  ];
  var lAction_PlayerTurn_oldatself =
  [
    // -- grab the direction constraints of the square on which the player is currently located.
    "${UPDATE @self ADD simul:\"player/tmpv1\"=(SELECT simul:\"square/constraints\" FROM simul:squares WHERE simul:\"square/x\"=@self.simul:\"moveable/x\" AND simul:\"square/y\"=@self.simul:\"moveable/y\")}",
    // -- move to the next square, based on the current direction and constraints.
    "${UPDATE @self SET simul:\"moveable/x\"+=1 WHERE (CONTAINS(simul:\"moveable/direction\", 'R') AND (simul:\"moveable/entering\" >= 1.0) AND NOT CONTAINS(simul:\"player/tmpv1\", simul:\"moveable/direction\"))}",
    "${UPDATE @self SET simul:\"moveable/x\"-=1 WHERE (CONTAINS(simul:\"moveable/direction\", 'L') AND (simul:\"moveable/entering\" >= 1.0) AND NOT CONTAINS(simul:\"player/tmpv1\", simul:\"moveable/direction\"))}",
    "${UPDATE @self SET simul:\"moveable/y\"+=1 WHERE (CONTAINS(simul:\"moveable/direction\", 'B') AND (simul:\"moveable/entering\" >= 1.0) AND NOT CONTAINS(simul:\"player/tmpv1\", simul:\"moveable/direction\"))}",
    "${UPDATE @self SET simul:\"moveable/y\"-=1 WHERE (CONTAINS(simul:\"moveable/direction\", 'T') AND (simul:\"moveable/entering\" >= 1.0) AND NOT CONTAINS(simul:\"player/tmpv1\", simul:\"moveable/direction\"))}",
    // -- grab the new direction constraints of the square we just landed on.
    "${UPDATE @self ADD simul:\"player/tmpv2\"=(SELECT simul:\"square/constraints\" FROM simul:squares WHERE simul:\"square/x\"=@self.simul:\"moveable/x\" AND simul:\"square/y\"=@self.simul:\"moveable/y\")}",
    // -- eat the food, if any.
    // TODO: count points etc.
    // TODO: remove the collection from board/food, when it becomes possible...
    "${UPDATE @self ADD simul:\"player/tmpv3\"=(SELECT simul:\"board/width\" FROM simul:board)}",
    "${UPDATE @self SET simul:\"player/tmpv4\"=(simul:\"moveable/x\" + simul:\"player/tmpv3\" * simul:\"moveable/y\")}",
    "${UPDATE simul:board ADD simul:\"board/food\"=SUBSTR(simul:\"board/food\", 0, @self.simul:\"player/tmpv4\") || '0' || SUBSTR(simul:\"board/food\", @self.simul:\"player/tmpv4\" + 1, simul:\"board/width\" * simul:\"board/height\" - @self.simul:\"player/tmpv4\" - 1)}",
    "${UPDATE simul:board DELETE simul:\"board/food\"[:FIRST]}",
    // -- assign pending change of direction (player/direction/next), if any (and valid).
    "${UPDATE @self SET simul:\"moveable/direction\"=simul:\"player/direction/next\" WHERE ((simul:\"moveable/entering\" >= 1.0) AND simul:\"player/direction/next\" <> '-' AND NOT CONTAINS(simul:\"player/tmpv2\", simul:\"player/direction/next\"))}",
    // -- assign the stop (-) direction, if necessary.
    "${UPDATE @self set simul:\"moveable/direction\"='-' WHERE ((simul:\"moveable/entering\" >= 1.0) AND CONTAINS(simul:\"player/tmpv2\", simul:\"moveable/direction\"))}",
    // -- reset the inter-step progression counter, unless we stopped.
    "${UPDATE @self SET simul:\"moveable/entering\"=0.1 WHERE ((simul:\"moveable/entering\" >= 1.0) AND NOT CONTAINS(simul:\"player/tmpv2\", simul:\"moveable/direction\"))}",
    // -- remove temporary variables.
    "${UPDATE @self DELETE simul:\"player/tmpv1\", simul:\"player/tmpv2\", simul:\"player/tmpv3\", simul:\"player/tmpv4\"}",
  ];
  var lAction_PlayerTurn_newatauto = // converted to @auto and working
  [
    // -- grab the direction constraints of the square on which the player is currently located.
    "${UPDATE @auto ADD simul:\"player/tmpv1\"=(SELECT simul:\"square/constraints\" FROM simul:squares WHERE simul:\"square/x\"=@self.simul:\"moveable/x\" AND simul:\"square/y\"=@self.simul:\"moveable/y\")}",
    // -- move to the next square, based on the current direction and constraints.
    "${UPDATE @self SET simul:\"moveable/x\"+=1 WHERE (CONTAINS(simul:\"moveable/direction\", 'R') AND (simul:\"moveable/entering\" >= 1.0) AND NOT CONTAINS(@auto.simul:\"player/tmpv1\", simul:\"moveable/direction\"))}",
    "${UPDATE @self SET simul:\"moveable/x\"-=1 WHERE (CONTAINS(simul:\"moveable/direction\", 'L') AND (simul:\"moveable/entering\" >= 1.0) AND NOT CONTAINS(@auto.simul:\"player/tmpv1\", simul:\"moveable/direction\"))}",
    "${UPDATE @self SET simul:\"moveable/y\"+=1 WHERE (CONTAINS(simul:\"moveable/direction\", 'B') AND (simul:\"moveable/entering\" >= 1.0) AND NOT CONTAINS(@auto.simul:\"player/tmpv1\", simul:\"moveable/direction\"))}",
    "${UPDATE @self SET simul:\"moveable/y\"-=1 WHERE (CONTAINS(simul:\"moveable/direction\", 'T') AND (simul:\"moveable/entering\" >= 1.0) AND NOT CONTAINS(@auto.simul:\"player/tmpv1\", simul:\"moveable/direction\"))}",
    // -- grab the new direction constraints of the square we just landed on.
    "${UPDATE @auto ADD simul:\"player/tmpv2\"=(SELECT simul:\"square/constraints\" FROM simul:squares WHERE simul:\"square/x\"=@self.simul:\"moveable/x\" AND simul:\"square/y\"=@self.simul:\"moveable/y\")}",
    // -- eat the food, if any.
    // TODO: count points etc.
    // TODO: remove the collection from board/food, when it becomes possible...
    "${UPDATE @auto ADD simul:\"player/tmpv3\"=(SELECT simul:\"board/width\" FROM simul:board)}",
    "${UPDATE @auto SET simul:\"player/tmpv4\"=(@self.simul:\"moveable/x\" + simul:\"player/tmpv3\" * @self.simul:\"moveable/y\")}",
    "${UPDATE simul:board ADD simul:\"board/food\"=SUBSTR(simul:\"board/food\", 0, @auto.simul:\"player/tmpv4\") || '0' || SUBSTR(simul:\"board/food\", @auto.simul:\"player/tmpv4\" + 1, simul:\"board/width\" * simul:\"board/height\" - @auto.simul:\"player/tmpv4\" - 1)}",
    "${UPDATE simul:board DELETE simul:\"board/food\"[:FIRST]}",
    // -- assign pending change of direction (player/direction/next), if any (and valid).
    "${UPDATE @self SET simul:\"moveable/direction\"=simul:\"player/direction/next\" WHERE ((simul:\"moveable/entering\" >= 1.0) AND simul:\"player/direction/next\" <> '-' AND NOT CONTAINS(@auto.simul:\"player/tmpv2\", simul:\"player/direction/next\"))}",
    // -- assign the stop (-) direction, if necessary.
    "${UPDATE @self set simul:\"moveable/direction\"='-' WHERE ((simul:\"moveable/entering\" >= 1.0) AND CONTAINS(@auto.simul:\"player/tmpv2\", simul:\"moveable/direction\"))}",
    // -- reset the inter-step progression counter, unless we stopped.
    "${UPDATE @self SET simul:\"moveable/entering\"=0.1 WHERE ((simul:\"moveable/entering\" >= 1.0) AND NOT CONTAINS(@auto.simul:\"player/tmpv2\", simul:\"moveable/direction\"))}",
  ];
  var lAction_GhostTurn = lAction_GhostTurn_newatauto;
  var lAction_PlayerTurnConstraint = lAction_PlayerTurnConstraint_newatauto;
  var lAction_PlayerTurn = lAction_PlayerTurn_newatauto;
  var lClassDecl =
  [
    "CREATE CLASS simul:squares AS SELECT * WHERE simul:\"square/constraints\" IN :0;",
    "CREATE CLASS simul:board AS SELECT * WHERE EXISTS(simul:\"board/food\");",
    "CREATE CLASS simul:moveables AS SELECT * WHERE EXISTS(simul:\"moveable/entering\")" + (SIMULCTX.mUseAfyTimer ? ";" : " SET simul:step='UPDATE simul:moveables SET simul:\"moveable/entering\"+=0.1 WHERE (simul:\"moveable/direction\" <> ''-'' AND simul:\"moveable/entering\" < 1.0)';"),
    "CREATE CLASS simul:ghosts AS SELECT * FROM simul:moveables WHERE simul:\"moveable/type\"='ghost';",
    "CREATE CLASS simul:players AS SELECT * FROM simul:moveables WHERE simul:\"moveable/type\"='player';",
    "CREATE CLASS simul:\"ghost/turn\" AS SELECT * FROM simul:ghosts WHERE (simul:\"moveable/entering\" >= 1.0) SET afy:onEnter={" + lAction_GhostTurn.join(",") + "};",
    "CREATE CLASS simul:\"player/turn\" AS SELECT * FROM simul:players WHERE (simul:\"moveable/entering\" >= 1.0) SET afy:onEnter={" + lAction_PlayerTurn.join(",") + "};",
    "CREATE CLASS simul:\"player/turn/constraint\" AS SELECT * FROM simul:players WHERE EXISTS(simul:\"player/direction/tentative\") SET afy:onEnter={" + lAction_PlayerTurnConstraint.join(",") + "};",
  ];
  lClassDecl.reverse();
  var lCreateAfyTimer =
    function()
    {
      var _lQs = [];
      if (SIMULCTX.mUseAfyTimer)
        _lQs.push("CREATE TIMER simul:step INTERVAL '00:00:00.1' AS UPDATE simul:moveables SET simul:\"moveable/entering\"+=0.1 WHERE (simul:\"moveable/direction\" <> '-' AND simul:\"moveable/entering\" < 1.0)");
      _lQs.push("INSERT \"http://localhost/afy/preferredPrefix/scope\"='http://pacman1', \"http://localhost/afy/preferredPrefix/name\"='pacman', \"http://localhost/afy/preferredPrefix/value\"='http://pacman1';");
      SIMULCTX.queryMulti(_lQs, new QResultHandler(function() { if (undefined != pCompletion) { pCompletion(); } }, null, null));
    }
  var lProcess =
    function()
    {
      if (0 == lClassDecl.length)
      {
        lCreateAfyTimer();
        return;
      }
      SIMULCTX.createClass(lClassDecl.pop(), lProcess);
    }
  lProcess();
}
SIMULCTX.instrSeq = function()
{
  var iSubStep = 0;
  var lSubSteps = new Array();
  this.next = function() { iSubStep++; if (iSubStep < lSubSteps.length) lSubSteps[iSubStep](); }
  this.push = function(_pSubStep) { lSubSteps.push(_pSubStep); }
  this.start = function() { iSubStep = 0; if (lSubSteps.length > 0) lSubSteps[iSubStep](); }
  this.curstep = function() { return iSubStep; }
}

/**
 * initScene
 */
function initScene(pCompletion)
{
  var lBoard = null;
  var lInsertGhosts =
    function()
    {
      var _lQs = [];
      _lQs.push("INSERT simul:\"moveable/type\"='player', simul:\"moveable/entering\"=0.0, simul:\"moveable/direction\"='-', simul:\"moveable/x\"=2, simul:\"moveable/y\"=4, simul:dir='LRTB', simul:invdir='RLBT', simul:\"player/direction/tentative\"='R', simul:\"player/board\"=(SELECT * FROM simul:board);");
      _lQs.push("INSERT simul:\"moveable/type\"='ghost', simul:\"moveable/entering\"=0.0, simul:\"moveable/direction\"='R', simul:\"moveable/x\"=0, simul:\"moveable/y\"=0, simul:dir='LRTB', simul:invdir='RLBT';");
      _lQs.push("INSERT simul:\"moveable/type\"='ghost', simul:\"moveable/entering\"=0.0, simul:\"moveable/direction\"='L', simul:\"moveable/x\"=5, simul:\"moveable/y\"=0, simul:dir='LRTB', simul:invdir='RLBT';");
      SIMULCTX.queryMulti(_lQs, new QResultHandler(function() { pCompletion(lBoard); }, null, null));
    }
  var lInsertSquares =
    function()
    {
      // _lSquares is organized by rows first.
      //   TL: top-left, meaning the way is blocked upward and toward the left.
      //   BL: bottom-left
      //   TR: top-right
      //   BR: bottom-right
      //   TB: top-bottom, meaning one can only navigate horizontally
      //   LR: left-right, meaning one can only navigate vertically
      //   L/R/B/T: can navigate in 3 directions
      //   -: no constraint, can navigate in all directions
      // REVIEW: How could this be done elegantly in pure pathsql?
      // REVIEW:
      //   As a workaround for bug #339, I force all constraints to be the same length (padding with white spaces).
      var _lPadCnstr = function(_pCnstr) { var _lR = _pCnstr; while (_lR.length < 3) _lR += " "; return _lR; }
      var _lSquares =
      [
        ['TL', 'TB', 'TR', 'TL', 'TB', 'TR'],
        ['LR', 'TL', 'BR', 'BL', 'TR', 'LR'],
        ['L',  'B',  'T',  'T',  'B',  'R' ],
        ['LR', 'TL', 'BR', 'BL', 'TR', 'LR'],
        ['LR', 'L',  'TB', 'TB', 'R',  'LR'],
        ['L',  'R',  'TLB','TRB','L',  'R' ],
        ['LR', 'L',  'TB', 'TB', 'R',  'LR'],
        ['LR', 'BL', 'TR', 'TL', 'BR', 'LR'],
        ['L',  'T',  'B',  'B',  'T',  'R' ],
        ['LR', 'BL', 'TR', 'TL', 'BR', 'LR'],
        ['BL', 'TB', 'BR', 'BL', 'TB', 'BR'],
      ];
      var _lQs = [];
      for (var _y = 0; _y < _lSquares.length; _y++)
        for (var _x = 0; _x < _lSquares[_y].length; _x++)
          _lQs.push("INSERT simul:\"square/x\"=" + _x +", simul:\"square/y\"=" + _y + ", simul:\"square/constraints\"='" + _lPadCnstr(_lSquares[_y][_x]) + "';");
      SIMULCTX.queryMulti(_lQs, new QResultHandler(function(_pJson) { lBoard = _pJson; lInsertGhosts(); }, null, null));
    }
  var lInsertBoard = function() { SIMULCTX.query("INSERT simul:\"board/width\"=6, simul:\"board/height\"=11, simul:\"board/food\"={'111111111111111111111111111111110011111111111111111111111111111111'};", new QResultHandler(lInsertSquares, null, null)); }
  var lCheckAlreadyThere =
    function()
    {
      var _lOnBoard = function(_pJson) { if (undefined == _pJson || parseInt(_pJson) == 0) { lInsertBoard(); } else { pCompletion(_pJson); } }
      SIMULCTX.query("SELECT * FROM simul:squares ORDER BY simul:\"square/y\", simul:\"square/x\";", new QResultHandler(_lOnBoard, null, null));
    }
  SIMULCTX.createClasses(lCheckAlreadyThere);
}

/**
 * PacmanCanvas.
 */
function PacmanCanvas()
{
  var lNumModels = 15;
  var lCanvas = $("#viewer");
  var l2dCtx = null;
  try { l2dCtx = lCanvas.get(0).getContext("2d"); } catch(e) { myLog("html5 canvas not supported"); return; }
  var lStepFunction = null;
  var lBoard = null;
  var lSqS = 30; // square size in pixels (n.b. recalculated).
  var lPause = false;

  // Rendering.
  var lDraw =
    function(pMoveables, pBoardDef)
    {
      // Clear the background.
      l2dCtx.setTransform(1, 0, 0, 1, 0, 0);
      l2dCtx.fillStyle = "#e4e4e4";
      l2dCtx.fillRect(0, 0, l2dCtx.canvas.width, l2dCtx.canvas.height);
      // Render the board.
      l2dCtx.fillStyle = "#00aa00";
      l2dCtx.lineStyle = "#000000";
      l2dCtx.lineWidth = 2;
      lSqS = Math.floor(Math.min(l2dCtx.canvas.width / pBoardDef[SIMULCTX.mNs + '/board/width'], l2dCtx.canvas.height / pBoardDef[SIMULCTX.mNs + '/board/height']));
      var _lOffx = Math.floor(0.5 * (l2dCtx.canvas.width - pBoardDef[SIMULCTX.mNs + '/board/width'] * lSqS));
      var _lOffy = Math.floor(0.5 * (l2dCtx.canvas.height - pBoardDef[SIMULCTX.mNs + '/board/height'] * lSqS));
      var _lSqHS = Math.floor(0.5 * lSqS);
      for (var _i = 0; _i < lBoard.length; _i++)
      {
        var _lSquare = lBoard[_i]; if (_lSquare instanceof Array) _lSquare = _lSquare[0];
        var _lX = _lOffx + parseInt(_lSquare[SIMULCTX.mNs + '/square/x']) * lSqS;
        var _lY = _lOffy + parseInt(_lSquare[SIMULCTX.mNs + '/square/y']) * lSqS;
        var _lConstraints = _lSquare[SIMULCTX.mNs + '/square/constraints'];
        var _lFood = null; for (var _iF in pBoardDef[SIMULCTX.mNs + '/board/food']) _lFood = pBoardDef[SIMULCTX.mNs + '/board/food'][_iF].charAt(_i);
        l2dCtx.beginPath();
        if (-1 != _lConstraints.indexOf('L'))
          { l2dCtx.moveTo(_lX, _lY); l2dCtx.lineTo(_lX, _lY + lSqS); }
        if (-1 != _lConstraints.indexOf('R'))
          { l2dCtx.moveTo(_lX + lSqS, _lY); l2dCtx.lineTo(_lX + lSqS, _lY + lSqS); }
        if (-1 != _lConstraints.indexOf('T'))
          { l2dCtx.moveTo(_lX, _lY); l2dCtx.lineTo(_lX + lSqS, _lY); }
        if (-1 != _lConstraints.indexOf('B'))
          { l2dCtx.moveTo(_lX, _lY + lSqS); l2dCtx.lineTo(_lX + lSqS, _lY + lSqS); }
        l2dCtx.closePath();
        l2dCtx.stroke();
        // Render the food items.
        if ('0' != _lFood)
          { l2dCtx.beginPath(); l2dCtx.arc(_lX+_lSqHS, _lY+_lSqHS, 3, 0, 2 * Math.PI, false); l2dCtx.closePath(); l2dCtx.fill() }
      }
      // Render the ghosts and player.
      for (var _i = 0; _i < pMoveables.length; _i++)
      {
        var _lM = pMoveables[_i];
        var _lX = _lOffx + parseInt(_lM[SIMULCTX.mNs + '/moveable/x']) * lSqS;
        var _lY = _lOffy + parseInt(_lM[SIMULCTX.mNs + '/moveable/y']) * lSqS;
        var _lDir = _lM[SIMULCTX.mNs + '/moveable/direction'];
        var _lDelta = Math.min(1.0, parseFloat(_lM[SIMULCTX.mNs + '/moveable/entering'])) * lSqS;
        var _lXoff = _lDir == 'R' ? _lDelta : (_lDir == 'L' ? -_lDelta : 0);
        var _lYoff = _lDir == 'B' ? _lDelta : (_lDir == 'T' ? -_lDelta : 0);
        l2dCtx.fillStyle = _lM[SIMULCTX.mNs + '/moveable/type'] == 'ghost' ? "#00aa00" : "#aa0000";
        l2dCtx.beginPath();
        l2dCtx.arc(_lX+_lXoff+_lSqHS, _lY+_lYoff+_lSqHS, _lSqHS, 0, 2 * Math.PI, false);
        l2dCtx.closePath();
        l2dCtx.fill();
      }
    }
  var lMoveMoveables = function(_pMoveables, _pCompletion)
  {
    if (SIMULCTX.mUseAfyTimer)
      _pCompletion(_pMoveables);
    else
      SIMULCTX.queryMulti(lStepFunction.split(';'), new QResultHandler(function() { _pCompletion(_pMoveables); }, null, null));
  }
  var lRefresh =
    function(_pForced)
    {
      if (lPause && _pForced != true) return;
      var _lMoveables = [];
      var _lOnFood = function(_pJson) { lDraw(_lMoveables, _pJson[0]); }
      var _lGetFood = function() { SIMULCTX.query("SELECT * FROM simul:board;", new QResultHandler(function(__pFood) { _lOnFood(__pFood); }, null, null)); }
      var _lOnMoveables = function(_pJson) { if (lPause) { _lMoveables = _pJson; _lGetFood(); } else { lMoveMoveables(_pJson, function(__pMoveables) { _lMoveables = __pMoveables; _lGetFood(); }); } }
      SIMULCTX.query("SELECT * FROM simul:moveables;", new QResultHandler(_lOnMoveables, null, null));
    }
  var lUpdateCanvasSize = function() { lCanvas.attr("width", lCanvas.width()); lCanvas.attr("height", lCanvas.height()); }

  // Initialization.
  var lGo = function() { setInterval(lRefresh, 100); }
  var lGrabClassFunction = 
    function(_pClass, _pFunc, _pCompletion)
    {
      var _lGrab = function(_pJson) { _pCompletion(_pJson[0][SIMULCTX.mNs + "/" + _pFunc]); }
      SIMULCTX.query("SELECT simul:" + _pFunc + " FROM afy:Classes WHERE CONTAINS(afy:objectID, '" + SIMULCTX.mNs + "/" + _pClass + "');", new QResultHandler(_lGrab, null, null));
    }
  var lGrabStepFunction = function(_pCompletion) { lGrabClassFunction('moveables', 'step', function(__pF) { lStepFunction = __pF; _pCompletion(); }); }
  lUpdateCanvasSize();
  window.addEventListener(
    'keydown',
    function(e)
    {
      if (e.which == 80) { lPause = !lPause; $("#mini_console").css("display", lPause ? "block" : "none"); }
      else if (e.which >= 37 && e.which <= 40)
      {
        var _lD = ['L', 'T', 'R', 'B'];
        var _lQs = [];
        _lQs.push("UPDATE simul:players SET simul:\"player/direction/tentative\"='" + _lD[e.which - 37] + "';");
        SIMULCTX.queryMulti(_lQs, new QResultHandler(function() {}, null, null));
      }
    });
  $("#logo").click(function() { window.location.href = 'http://' + location.hostname + ":" + location.port + "/console.html#tab-basic"; });
  $("#manual_step_button").click(function() { SIMULCTX.query($("#manual_step").text(), new QResultHandler(function(_pRes) { $("#manual_step_result").text(myStringify(_pRes)); lRefresh(true); }), null, null); });
  initScene(function(_pBoard) { lBoard = _pBoard; lGrabStepFunction(lGo); })
}
// TODO: once timers and stack variables are available, revisit and beautify
