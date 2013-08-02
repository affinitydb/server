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
$(document).ready(
  function()
  {
    // Setup the FSM editor.
    var lGM = new FsmEditor();

    // Make sure the tab is activated in all circumstances.
    if (!lGM.active)
    {
      if (top === self)
        $("#content").trigger("activate_tab");
      else if (window.parent.location.href.indexOf("#tab-fsm") >0)
        window.parent.$("#tab-fsm").trigger("activate_tab");
    }
  });

/**
 * FSMCTX.
 */
var FSMCTX = new Object();
FSMCTX.mPrefixes = [{prefix:'fsm', uri:'http://affinityng.org/fsm'}, {prefix:'fsmedt', uri:'http://affinityng.org/fsm/editor'}];
FSMCTX.mPrefixesStr = FSMCTX.mPrefixes.map(function(_p) { return "SET PREFIX " + _p.prefix + ": '" + _p.uri + "';"; }).join(" ") + " ";
FSMCTX.mPrefixesMap = {};
FSMCTX.mPrefixes.map(function(_p) { FSMCTX.mPrefixesMap[_p.prefix] = _p.uri; });
FSMCTX.query = function(pSqlStr, pResultHandler, pOptions) { var lOptions = (undefined != pOptions ? pOptions : {}); if (!('countonly' in lOptions && lOptions.countonly)) { lOptions.longnames = true; } return afy_query(FSMCTX.mPrefixesStr + pSqlStr, pResultHandler, lOptions); }
FSMCTX.queryMulti = function(pSqlArray, pResultHandler, pOptions)
{
  var lOptions = (undefined != pOptions ? pOptions : {});
  lOptions.longnames = true;
  if (typeof(pSqlArray) == 'string') { pSqlArray = [pSqlArray]; }
  var lBatch = [FSMCTX.mPrefixesStr];
  pSqlArray.filter(function(_p) { return _p.match(/^\s*$/) ? null : _p; }).forEach(function(_p) { lBatch.push(_p); });
  return afy_batch_query(lBatch, pResultHandler, lOptions);
}
FSMCTX.instrSeq = function()
{
  var iSubStep = 0;
  var lSubSteps = new Array();
  this.next = function() { iSubStep++; if (iSubStep < lSubSteps.length) lSubSteps[iSubStep](); }
  this.push = function(_pSubStep) { lSubSteps.push(_pSubStep); }
  this.start = function() { iSubStep = 0; if (lSubSteps.length > 0) lSubSteps[iSubStep](); }
  this.curstep = function() { return iSubStep; }
}

/**
 * FsmModel.
 * Manages a snapshot of {states, edges, layout}, with persistence of layout info.
 * For now all editable data is in memory (expects that we're far from the day FSM programs would be so huge for this to be an issue);
 * still allows for PINs to hold separate big data.
 * Initially I assume that there's 1 global FSM... will refine (reachability and/or other arguments).
 * All states are positioned on a coarse logical grid where a unit contains 1 whole state; the layout logic depends on this choice;
 * this still provides a lot of flexibility for manual layout.
 */
function FsmModel(pQuery, pCompletion, pOptions)
{
  var lGetOption = function(_pWhat, _pDefault) { return (undefined != pOptions && _pWhat in pOptions) ? pOptions[_pWhat] : _pDefault; }
  var lThis = this;

  this.query = pQuery; // The actual query defining the root domain.
  this.bypid = {}; // To retrieve states by PID.
  this.bypos = {}; // To retrieve states by logical positions in the state coordinate system.
  this.byposECS = {}; // To retrieve states by logical positions in the edge coordinate system (i.e. with interpolated spaces; key="10x10").
  this.domain = []; // The logical domain, i.e. the set of all FSM states, transitions etc.
  this.gridsize = 1; // Number of logical units (corresponding to 1 FSM state), on the edge of a square grid.

  var sLayoutProp = FSMCTX.mPrefixesMap['fsmedt'] + '/layout';
  var sOriginInPx = [20, 20];
  var sHalfUnitInPx = FsmModel.HALF_UNIT_INPX;
  var sUnitInPx = 2 * sHalfUnitInPx;

  var lMustSaveLayout = false;
  var lScs2Ecs = function(_p) { return [1 + 2 * _p[0], 1 + 2 * _p[1]]; } // state coordinate system -> edge coordinate system.
  var lStatePosInEcs = function(_pS) { return lScs2Ecs([_pS[sLayoutProp].x, _pS[sLayoutProp].y]); }
  var lStateKey = function(_pX, _pY) { return _pX + "x" + _pY; }
  var lStateKeyInScs = function(_pS) { return lStateKey(_pS[sLayoutProp].x, _pS[sLayoutProp].y); }
  var lStateKeyInEcs = function(_pS) { var _lP = lStatePosInEcs(_pS); return lStateKey(_lP[0], _lP[1]); }
  var lGetDomain =
    function(_pOnResult)
    {
      var _lQ = lThis.query;
      var _lSelect = _lQ.match(/(\s*select\s*\*)/i);
      // TODO: investigate apparent regression below... afy:pinID and afy:transition don't appear in the new resulting afy:value...
      if (_lSelect[1].length > 0)
        _lQ = _lQ.replace(_lSelect[1], "SELECT *"); // afy:pinID, afy:transition, fsmedt:layout, fsm_state_name ");
      var _lOnDomain = function(_pJson) { _pOnResult(_pJson); }
      FSMCTX.query(_lQ, new QResultHandler(_lOnDomain, null, null));
    };
  var lRegisterTransition =
    function(_pid1, _pid2)
    {
      var _lPin1 = lThis.bypid[_pid1];
      var _lPin2 = lThis.bypid[_pid2];
      _lPin2._backrefs[_pid1] = 1;
      _lPin1._relcount++;
      _lPin2._relcount++;
    };
  var lAllocGrid =
    function(_pSize, _pInitializer)
    {
      var _lGrid = [];
      for (var _x = 0; _x < _pSize; _x++)
      {
        var _lCol = [];
        _lGrid.push(_lCol);
        for (var _y = 0; _y < _pSize; _y++)
          _lCol.push(_pInitializer());
      }
      return _lGrid;
    };
  var lZeroGrid = function(_pGrid) { for (var _x = 0; _x < _pGrid.length; _x++) { for (var _y = 0; _y < _pGrid.length; _y++) { _pGrid[_x][_y] = 0; } } };
  var lGridBFS =
    function(_pCoords, _pGrid, _pTrace, _pCond, _pProduceFullPath) // _pCond returns 1=found, 0=continue, -1=stop.
    {
      if (undefined == _pTrace)
        _pTrace = lAllocGrid(_pGrid.length, function(){ return 0; });
      var _iC;
      for (_iC = 0; _iC < _pCoords.length; _iC++)
        _pTrace[_pCoords[_iC][0]][_pCoords[_iC][1]] = 1;
      var _lNextCoordsOrg = {};
      var _lNextCoords = [];
      var _lEvalCond =
        function(_pX, _pY, _pDx, _pDy)
        {
          var __lXto = _pX + _pDx; var __lYto = _pY + _pDy;
          var __lTo = _pGrid[__lXto][__lYto];
          var __lC = _pCond(__lTo);
          if (0 == __lC)
          {
            _lNextCoords.push([__lXto, __lYto]);
            if (_pProduceFullPath)
              _lNextCoordsOrg[__lXto + "-" + __lYto] = [_pX, _pY];
          }
          return __lC;
        };
      for (_iC = 0; _iC < _pCoords.length; _iC++)
      {
        // TODO: review... management of _pTrace may not always be the same (e.g.when tracing edges vs placing nodes).
        var _lX = _pCoords[_iC][0];
        var _lY = _pCoords[_iC][1];
        if (_lX > 0 && 0 == _pTrace[_lX-1][_lY] && 1 == _lEvalCond(_lX, _lY, -1, 0))
          return [[_lX-1, _lY], [_lX, _lY]];
        if (_lX + 1 < _pGrid.length && 0 == _pTrace[_lX+1][_lY] && 1 == _lEvalCond(_lX, _lY, 1, 0))
          return [[_lX+1, _lY], [_lX, _lY]];
        if (_lY > 0 && 0 == _pTrace[_lX][_lY-1] && 1 == _lEvalCond(_lX, _lY, 0, -1))
          return [[_lX, _lY-1], [_lX, _lY]];
        if (_lY + 1 < _pGrid.length && 0 == _pTrace[_lX][_lY+1] && 1 == _lEvalCond(_lX, _lY, 0, 1))
          return [[_lX, _lY+1], [_lX, _lY]];
      }
      if (0 != _lNextCoords.length)
      {
        var _lPath = lGridBFS(_lNextCoords, _pGrid, _pTrace, _pCond, _pProduceFullPath);
        if (_pProduceFullPath && undefined != _lPath)
        {
          var _lLastC = _lPath[_lPath.length - 1];
          _lPath.push(_lNextCoordsOrg[_lLastC[0] + "-" + _lLastC[1]]);
        }
        return _lPath;
      }
      return null;
    };
  var lGetDistinctRelatives =
    function(_pState, _pWithBackrefs)
    {
      var _lRelatives = {result:[], map:{}};
      var _lAddRelative = function(_pPid) { if (_pPid in _lRelatives.map) return; _lRelatives.map[_pPid] = 1; _lRelatives.result.push(_pPid); };
      var _lT = _pState['afy:transition'];
      if (undefined != _lT)
      {
        if ('afy:ref' in _lT)
          _lAddRelative(trimPID(_lT['afy:ref']['$ref']));
        else for (var _iP in _lT)
          _lAddRelative(trimPID(_lT[_iP]['afy:ref']['$ref']));
        if (_pWithBackrefs)
          for (_iP in _pState._backrefs)
            _lAddRelative(_iP);
      }
      return _lRelatives.result;
    };
  var lLayoutBFS =
    function(_pNextLevel, _pGrid, _pTrace)
    {
      var _lNextLevelPrep = [];
      var _iN, _iR;
      for (_iN = 0; _iN < _pNextLevel.length; _iN++)
      {
        var _lCenter = _pNextLevel[_iN].center;
        var _lRelative = _pNextLevel[_iN].relative;
        if (sLayoutProp in _lRelative)
          continue;
        lZeroGrid(_pTrace);
        _lPutAt = lGridBFS([[_lCenter[sLayoutProp].x, _lCenter[sLayoutProp].y]], _pGrid, _pTrace, function(__pS) { return undefined == __pS.state ? 1 : 0; }, false)[0];
        _pGrid[_lPutAt[0]][_lPutAt[1]].state = _lRelative;
        _lRelative[sLayoutProp] = {x:_lPutAt[0], y:_lPutAt[1]};
        _lNextLevelPrep.push(_lRelative);
      }
      var _lNextLevel = [];
      for (_iN = 0; _iN < _lNextLevelPrep.length; _iN++)
      {
        var _lN = _lNextLevelPrep[_iN];
        var _lRel = lGetDistinctRelatives(_lN, true);
        for (_iR = 0; _iR < _lRel.length; _iR++)
        {
          var _lR = lThis.bypid[_lRel[_iR]];
          if (sLayoutProp in _lR)
            continue;
          _lNextLevel.push({center:_lN, relative:_lR});
        }
      }
      if (_lNextLevel.length > 0)
        lLayoutBFS(_lNextLevel, _pGrid, _pTrace);
    };
  var lDebugGrid =
    function(_pTitle, _pGrid)
    {
      var _lRows = [];
      for (var _x = 0; _x < _pGrid.length; _x++)
      {
        for (var _y = 0; _y < _pGrid[_x].length; _y++)
        {
          if (0 == _x)
            _lRows.push("");
          _lRows[_y] += (undefined != _pGrid[_x][_y].state ? '1' : '0');
        }
      }
      myLog(_pTitle + " {");
      _lRows.forEach(function(_pR) { myLog(_pR); });
      myLog("} " + _pTitle);
    };
  var lLayout =
    function(_pDomain)
    {
      if (undefined == _pDomain)
        return;
      lMustSaveLayout = false;

      // Initialize computed values on each state; initialize bypid retrieval.
      for (var _iD = 0; _iD < _pDomain.length; _iD++)
      {
        _pDomain[_iD]._backrefs = {};
        _pDomain[_iD]._relcount = 0;
        lThis.bypid[trimPID(_pDomain[_iD].id)] = _pDomain[_iD];
      }
      var _lGridSize = Math.ceil(1.5 * Math.sqrt(_pDomain.length));
      for (var _iD = 0; _iD < _pDomain.length; _iD++)
      {
        lGetDistinctRelatives(_pDomain[_iD], false).forEach(function(_pRel) { lRegisterTransition(trimPID(_pDomain[_iD].id), _pRel); });
        if (sLayoutProp in _pDomain[_iD])
        {
          lThis.bypos[lStateKeyInScs(_pDomain[_iD])] = _pDomain[_iD];
          lThis.byposECS[lStateKeyInEcs(_pDomain[_iD])] = _pDomain[_iD];
          _lGridSize = Math.max(_lGridSize, _pDomain[_iD][sLayoutProp].x + 1, _pDomain[_iD][sLayoutProp].y + 1);
        }
        else
          lMustSaveLayout = true;
      }

      // Allocate a grid (slightly larger than strict minimum, to allow some room, but without exploding shortest path later).
      var _lGrid = lAllocGrid(_lGridSize, function(){ return {state:null}; });
      var _lTrace = lAllocGrid(_lGridSize, function(){ return 0; });
      var _lClearTrace = function() { lZeroGrid(_lTrace); };

      // Get rid of already positioned elements.
      var _lToProcess = _pDomain.slice(0);
      for (var _iD = _pDomain.length - 1; _iD >= 0; _iD--)
      {
        if (!(sLayoutProp in _pDomain[_iD]))
          continue;
        var _lL = _pDomain[_iD][sLayoutProp];
        _lGrid[_lL.x][_lL.y].state = _pDomain[_iD];
        _lToProcess.splice(_iD, 1);
      }

      // Layout (BFS starting with most connected and laying out closest relationships first, on a grid).
      // Start with most related guy.
      while (_lToProcess.length > 0)
      {
        // Identify the most connected node.
        var _lStartAt = null;
        for (var _iP = 0; _iP < _lToProcess.length; _iP++)
          if (undefined == _lStartAt || _lToProcess[_iP]._relcount > _lStartAt._relcount)
            _lStartAt = _lToProcess[_iP];

        // Identify an available location nearest to center.
        // Note: global iteration is only in case there are disconnected islands... not putting effort there for now
        var _lStartCoord = [Math.floor(_lGridSize / 2), Math.floor(_lGridSize / 2)];
        _lClearTrace();
        _lStartCoord = lGridBFS([_lStartCoord], _lGrid, _lTrace, function(_pS) { return undefined == _pS.state ? 1 : 0; }, false)[0];

        // Add.
        _lGrid[_lStartCoord[0]][_lStartCoord[1]].state = _lStartAt;
        _lStartAt[sLayoutProp] = {x:_lStartCoord[0], y:_lStartCoord[1]};
        var _lNext = [];
        var _lRel = lGetDistinctRelatives(_lStartAt, true);
        for (_iR = 0; _iR < _lRel.length; _iR++)
        {
          var _lR = lThis.bypid[_lRel[_iR]];
          if (!(sLayoutProp in _lR))
            _lNext.push({center:_lStartAt, relative:_lR});
        }
        lLayoutBFS(_lNext, _lGrid, _lTrace);

        // Remove all processed guys.
        for (var _iP = _lToProcess.length - 1; _iP >= 0; _iP--)
          if (sLayoutProp in _lToProcess[_iP])
          {
            lThis.bypos[lStateKeyInScs(_lToProcess[_iP])] = _lToProcess[_iP];
            lThis.byposECS[lStateKeyInEcs(_lToProcess[_iP])] = _lToProcess[_iP];
            _lToProcess.splice(_iP, 1);
          }
      }

      // alert(_pDomain.map(function(_d) { return _d['fsm_state_name'] + ":(" + _d[sLayoutProp].x + "," + _d[sLayoutProp].y + ")"; }).join(" | "));
      return _lGridSize;
      // TODO: don't save layout until edited, but at that point save all
    };
  var lGetSign = function(_pNum) { return (0 != _pNum) ? (_pNum < 0 ? -1 : 1) : 0; }
  var lDrawComplexCurvedEdge =
    function(_p2dCtx, _pPoints, _pBidir)
    {
      // Simple first approach: respecting the square shortest-path provided in _pPoints,
      // make it round by producing curved segments running along that square path,
      // respecting its trajectory, and such that each segment blends into previous and next segments;
      // each segment is either U-shaped or S-shaped.
      _p2dCtx.beginPath();
      _p2dCtx.moveTo(sHalfUnitInPx * _pPoints[0][0], sHalfUnitInPx * _pPoints[0][1]);
      for (var _iP = 1; _iP < _pPoints.length; _iP++)
      {
        var _lPrev1 = _pPoints[_iP - 1];
        var _lP = _pPoints[_iP];
        var _lInfl1 = [0, 0];
        var _lInfl2 = [0, 0];
        if (_iP >= 2) // If we can take the past in consideration...
        {
          var _lPrev2 = _pPoints[_iP - 2];
          if (_iP + 1 < _pPoints.length) // If we can also take the future in consideration: we might produce Ss...
          {
            var _lPost1 = _pPoints[_iP + 1];
            if (_lPrev1[0] == _lP[0])
              { _lInfl1 = [-lGetSign(_lPrev2[0] - _lPrev1[0]), lGetSign(_lP[1] - _lPrev1[1])]; _lInfl2 = [-lGetSign(_lPost1[0] - _lP[0]), -_lInfl1[1]]; }
            else
              { _lInfl1 = [lGetSign(_lP[0] - _lPrev1[0]), -lGetSign(_lPrev2[1] - _lPrev1[1])]; _lInfl2 = [-_lInfl1[0], -lGetSign(_lPost1[1] - _lP[1])]; }
          }
          else // Past but no future to take in consideration...
          {
            if (_lPrev1[0] == _lP[0])
              { _lInfl1 = [-lGetSign(_lPrev2[0] - _lPrev1[0]), lGetSign(_lP[1] - _lPrev1[1])]; _lInfl2 = [_lInfl1[0], -_lInfl1[1]]; }
            else
              { _lInfl1 = [lGetSign(_lP[0] - _lPrev1[0]), -lGetSign(_lPrev2[1] - _lPrev1[1])]; _lInfl2 = [-_lInfl1[0], _lInfl1[1]]; }
          }
        }
        else // No past to take in consideration...
        {
          if (_iP + 1 < _pPoints.length) // If we can take the future in consideration...
          {
            var _lPost1 = _pPoints[_iP + 1];
            if (_lPrev1[0] == _lP[0])
              { _lInfl1 = [lGetSign(_lP[0] - _lPost1[0]), lGetSign(_lP[1] - _lPrev1[1])]; _lInfl2 = [_lInfl1[0], -_lInfl1[1]]; }
            else
              { _lInfl1 = [lGetSign(_lP[0] - _lPrev1[0]), lGetSign(_lP[1] - _lPost1[1])]; _lInfl2 = [-_lInfl1[0], _lInfl1[1]]; }
          }
          else // No past and no future to take inconsideration: simple segment (one inflection is hard-coded, i.e. always left/top).
          {
            if (_lPrev1[0] == _lP[0])
              { _lInfl1 = [-1, lGetSign(_lP[1] - _lPrev1[1])]; _lInfl2 = [_lInfl1[0], -_lInfl1[1]]; }
            else
              { _lInfl1 = [lGetSign(_lP[0] - _lPrev1[0]), -1]; _lInfl2 = [-_lInfl1[0], _lInfl1[1]]; }
          }
        }

        // Draw the segment.
        var _lAmplitude = (2 == _pPoints.length) ? 10 : 5;
        _p2dCtx.bezierCurveTo(sHalfUnitInPx * _lPrev1[0] + _lInfl1[0] * _lAmplitude, sHalfUnitInPx * _lPrev1[1] + _lInfl1[1] * _lAmplitude, sHalfUnitInPx * _lP[0] + _lInfl2[0] * _lAmplitude, sHalfUnitInPx * _lP[1] + _lInfl2[1] * _lAmplitude, sHalfUnitInPx * _lP[0], sHalfUnitInPx * _lP[1]);
        _p2dCtx.stroke();
      }
      // Indicate the direction on one of the segments.
      if (!_pBidir)
      {
        var _iStart = _pPoints.length - (_pPoints.length > 3 ? 3 : _pPoints.length);
        lDrawArrow(_p2dCtx, _pPoints[_iStart], _pPoints[_iStart + 1]);
      }
    };
  var lStraightEdgeHitsSomeState =
    function(_pS0, _pS1)
    {
      // Use simple Bresenham on our very coarse logical grid to determine if an edge between _pS0 and _pS1
      // hits any other existing state (n.b. coarse but very quick test).
      // Note: We calculate in ECS (edge coord system), for a bit more resolution, i.e. more opportunities to not hit other states.
      var _lP0 = lStatePosInEcs(_pS0);
      var _lP1 = lStatePosInEcs(_pS1);
      var _lX0 = _lP0[0];
      var _lY0 = _lP0[1];
      var _lX1 = _lP1[0];
      var _lY1 = _lP1[1];
      var _lSteep = Math.abs(_lY1 - _lY0) > Math.abs(_lX1 - _lX0);
      if (_lSteep) { var _lT = _lX0; _lX0 = _lY0; _lY0 = _lT; _lT = _lX1; _lX1 = _lY1; _lY1 = _lT; }
      if (_lX0 > _lX1) { var _lT = _lX0; _lX0 = _lX1; _lX1 = _lT; _lT = _lY0; _lY0 = _lY1; _lY1 = _lT; }
      var _lDx = _lX1 - _lX0;
      var _lDy = Math.abs(_lY1 - _lY0);
      var _lErr = _lDx / 2;
      var _lYs = (_lY0 < _lY1) ? 1 : -1;
      var _lY = _lY0;
      for (_lX = _lX0; _lX <= _lX1; _lX++)
      {
        if ((_lX != _lX0 || _lY != _lY0) && (_lX != _lX1 || _lY != _lY1))
        {  
          if (_lSteep && lStateKey(_lY, _lX) in lThis.byposECS) { return true; }
          else if (!_lSteep && lStateKey(_lX, _lY) in lThis.byposECS) { return true; }
        }
        _lErr -= _lDy;
        if (_lErr < 0) { _lY += _lYs; _lErr += _lDx; }
      }
      return false;
    };
  var lDrawArrow =
    function(_p2dCtx, _p0, _p1)
    {
      var _lAngle = Math.atan((_p1[1] - _p0[1]) / (_p1[0] - _p0[0])) - Math.PI * 135 / 180;
      var _lOffset = [lGetSign(_p1[0] - _p0[0]), -lGetSign(_p1[1] - _p0[1])];
      if (_lOffset[1] == _lOffset[0]) { _lAngle -= _lOffset[1] * Math.PI * 0.5; } // Compensate for atan.
      else if (_lOffset[0] < 0 && _lOffset[1] >= 0) { _lAngle += Math.PI * (0.5 * (1 + _lOffset[1])); }
      if (0 == _lOffset[0]) { _lOffset[0] = -_lOffset[1]; } // Never let the arrow touch the segment.
      if (0 == _lOffset[1]) { _lOffset[1] = -1; }
      var _lPd0 = [sHalfUnitInPx * _p0[0] + sHalfUnitInPx * 0.4 * (_p1[0] - _p0[0]) + 2 * _lOffset[0], sHalfUnitInPx * _p0[1] + sHalfUnitInPx * 0.4 * (_p1[1] - _p0[1]) + 2 * _lOffset[1]];
      var _lPd1 = [sHalfUnitInPx * _p0[0] + sHalfUnitInPx * 0.6 * (_p1[0] - _p0[0]) + 2 * _lOffset[0], sHalfUnitInPx * _p0[1] + sHalfUnitInPx * 0.6 * (_p1[1] - _p0[1]) + 2 * _lOffset[1]];
      var _lPd2 = [sHalfUnitInPx * _p0[0] + sHalfUnitInPx * 0.6 * (_p1[0] - _p0[0]) + 2 * _lOffset[0] + 5 * Math.cos(_lAngle), sHalfUnitInPx * _p0[1] + sHalfUnitInPx * 0.6 * (_p1[1] - _p0[1]) + 2 * _lOffset[1] + 5 * Math.sin(_lAngle)];
      _p2dCtx.lineWidth = 0.5;
      _p2dCtx.beginPath();
      _p2dCtx.moveTo(_lPd0[0], _lPd0[1]);
      _p2dCtx.lineTo(_lPd1[0], _lPd1[1]);
      _p2dCtx.lineTo(_lPd2[0], _lPd2[1]);
      _p2dCtx.stroke();
    };
  var lDrawStateAt =
    function(_p2dCtx, _pLogicalCoords, _pName, _pFillStyle, _pStrokeStyle)
    {
      var _lX = sOriginInPx[0] + _pLogicalCoords[0] * sUnitInPx;
      var _lY = sOriginInPx[1] + _pLogicalCoords[1] * sUnitInPx;
      _p2dCtx.fillStyle = undefined != _pFillStyle ? _pFillStyle : "#e4e4e4";
      _p2dCtx.strokeStyle = undefined != _pStrokeStyle ? _pStrokeStyle : "#20a0ee";
      _p2dCtx.font = "6pt monospace";
      _p2dCtx.lineWidth = 1;
      _p2dCtx.beginPath();
      _p2dCtx.arc(_lX, _lY, sHalfUnitInPx * 0.5, 0, 2 * Math.PI, false);
      _p2dCtx.closePath();
      _p2dCtx.fill();
      _p2dCtx.stroke();
      if (undefined != _pName)
      {
        var _lLabelX = _lX + sHalfUnitInPx * 0.5 + 2;
        _p2dCtx.fillStyle = "#f0f0f0";
        _p2dCtx.lineWidth = 0.5;
        _p2dCtx.globalAlpha = 0.7;
        _p2dCtx.fillRect(_lLabelX, _lY - 6, _p2dCtx.measureText(_pName).width, 10);
        _p2dCtx.globalAlpha = 1.0;
        _p2dCtx.strokeStyle = "#000";
        _p2dCtx.strokeRect(_lLabelX, _lY - 6, _p2dCtx.measureText(_pName).width, 10);
        _p2dCtx.fillStyle = "#000";
        _p2dCtx.fillText(_pName, _lLabelX, _lY + 2);
      }
    };
  var lDrawState =
    function(_p2dCtx, _pState, _pFillStyle, _pStrokeStyle)
    {
      lDrawStateAt(_p2dCtx, [_pState[sLayoutProp].x, _pState[sLayoutProp].y], _pState['fsm_state_name'], _pFillStyle, _pStrokeStyle);
    };
  var lDrawStateEdges =
    function(_p2dCtx, _pState, _pWithBackrefs, _pForceStraightLines)
    {
      // Principles: user only can move states (on a grid); states never overlap; edges are automatic; edges never cross states.
      // Note:
      //   We interpolate one logical square around each 'official' square of the layout coordinate system,
      //   to produce an edge coordinate system which provides safe channels where edges can run without
      //   bumping into states; edges should never cross states.
      _p2dCtx.translate(sOriginInPx[0] - sHalfUnitInPx, sOriginInPx[1] - sHalfUnitInPx);
      var _lRel = lGetDistinctRelatives(_pState, _pWithBackrefs);
      for (var _iE = 0; _iE < _lRel.length; _iE++)
      {
        _p2dCtx.lineWidth = 1;
        var _lOtherS = lThis.bypid[_lRel[_iE]];
        var _lBidir = trimPID(_lOtherS.id) in _pState._backrefs;
        if (_lBidir && !_pWithBackrefs && parseInt(_lOtherS.id, 16) > parseInt(_pState.id, 16))
          continue; // If we have A->B and B->A, don't draw one of the two (and we don't draw arrows also).
        var _lP0 = lStatePosInEcs(_pState);
        var _lP1 = lStatePosInEcs(_lOtherS);
        if (_pForceStraightLines || !lStraightEdgeHitsSomeState(_pState, _lOtherS))
        {
          // If there's no danger to cross a state, draw a direct edge (ideal for readability/simplicity/beauty).
          _p2dCtx.beginPath();
          _p2dCtx.moveTo(sHalfUnitInPx * _lP0[0], sHalfUnitInPx * _lP0[1]);
          _p2dCtx.lineTo(sHalfUnitInPx * _lP1[0], sHalfUnitInPx * _lP1[1]);
          _p2dCtx.stroke();
          // Indicate the direction.
          if (!_lBidir)
            lDrawArrow(_p2dCtx, _lP0, _lP1);
        }
        else
        {
          // Note:
          //   We initialize _lSx and _lSy to - their natural direction, to avoid running directly into the collision;
          //   produces a nice effect and less busy graphs, when this situation occurs.
          var _lPoints = [];
          var _lSx = -lGetSign(_lP1[0] - _lP0[0]); if (0 == _lSx) _lSx = 1;
          var _lSy = -lGetSign(_lP1[1] - _lP0[1]); if (0 == _lSy) _lSy = 1;
          _lPoints.push([_lP0[0], _lP0[1]]);
          _lPoints.push([_lP0[0] + _lSx, _lP0[1]]);
          _lPoints.push([_lP0[0] + _lSx, _lP0[1] + _lSy]);
          _lPoints.push([_lP1[0] - _lSx, _lP0[1] + _lSy]);
          _lPoints.push([_lP1[0] - _lSx, _lP1[1]]);
          _lPoints.push([_lP1[0], _lP1[1]]);
          lDrawComplexCurvedEdge(_p2dCtx, _lPoints, _lBidir);
        }
      }
      _p2dCtx.translate(-sOriginInPx[0] + sHalfUnitInPx, -sOriginInPx[1] + sHalfUnitInPx);
    };
  this.drawState =
    function(_p2dCtx, _pState, _pWithEdges, _pFillStyle, _pStrokeStyle)
    {
      if (_pWithEdges)
        lDrawStateEdges(_p2dCtx, _pState, true, true);
      lDrawState(_p2dCtx, _pState, _pFillStyle, _pStrokeStyle);
    };
  this.drawStateAt =
    function(_p2dCtx, _pLogicalCoords, _pFillStyle, _pStrokeStyle)
    {
      lDrawStateAt(_p2dCtx, _pLogicalCoords, null, _pFillStyle, _pStrokeStyle);
    };
  this.drawEdgeTo =
    function(_p2dCtx, _pFromState, _pToLogicalCoords)
    {
      var _lToState = lThis.bypos[lStateKey(_pToLogicalCoords[0], _pToLogicalCoords[1])];
      _p2dCtx.strokeStyle = (undefined != _lToState && lThis.canConnectStates(_pFromState, _lToState) ? "#aaaaaa" : "#eeaaaa");
      _p2dCtx.beginPath();
      _p2dCtx.moveTo(sOriginInPx[0] + sUnitInPx * _pFromState[sLayoutProp].x, sOriginInPx[1] + sUnitInPx * _pFromState[sLayoutProp].y);
      _p2dCtx.lineTo(sOriginInPx[0] + sUnitInPx * _pToLogicalCoords[0], sOriginInPx[1] + sUnitInPx * _pToLogicalCoords[1]);
      _p2dCtx.stroke();
    };
  this.draw =
    function(_p2dCtx)
    {
      if (undefined == lThis.domain)
        return;
      // Draw "smart" edges.
      lThis.domain.forEach(function(_pS) { lDrawStateEdges(_p2dCtx, _pS, false); });
      // Draw states.
      lThis.domain.forEach(function(_pS) { lDrawState(_p2dCtx, _pS); });
    };
  this.stateAt =
    function(_pLogicalX, _pLogicalY)
    {
      for (var _iS = 0; _iS < lThis.domain.length; _iS++)
      {
        var _lS = lThis.domain[_iS];
        if (_lS[sLayoutProp].x == _pLogicalX && _lS[sLayoutProp].y == _pLogicalY)
          return _lS;
      }
      return null;
    };
  this.moveState =
    function(_pState, _pLogicalX, _pLogicalY, _pPersistent, _pCompletion)
    {
      var _lSk = lStateKey(_pLogicalX, _pLogicalY);
      if (_lSk in lThis.bypos && lThis.bypos[_lSk] != _pState)
        return; // Don't let _pState land on some other state.
      delete lThis.bypos[lStateKeyInScs(_pState)];
      delete lThis.byposECS[lStateKeyInEcs(_pState)];
      _pState[sLayoutProp].x = Math.max(0, _pLogicalX);
      _pState[sLayoutProp].y = Math.max(0, _pLogicalY);
      lThis.bypos[lStateKeyInScs(_pState)] = _pState;
      lThis.byposECS[lStateKeyInEcs(_pState)] = _pState;
      lThis.gridsize = Math.max(lThis.gridsize, _pState[sLayoutProp].x + 1, _pState[sLayoutProp].y + 1);
      if (_pPersistent)
      {
        if (lMustSaveLayout)
          lThis.saveLayout(_pCompletion);
        else
          FSMCTX.query("UPDATE @" + trimPID(_pState.id) + " SET fsmedt:layout={x=" + _pState[sLayoutProp].x + ",y=" + _pState[sLayoutProp].y + "}", new QResultHandler(_pCompletion, null, null));
      }
    };
  this.insertState =
    function(_pStateName, _pLogicalCoords, _pCompletion)
    {
      var _lOnCreated =
        function(_pJson)
        {
          if (undefined == _pJson || !(_pJson instanceof Array) || 0 == _pJson.length)
            { if (undefined != _pCompletion) { _pCompletion(false); } return; }
          var _lNewState = _pJson[0];
          _lNewState._backrefs = {};
          _lNewState._relcount = 0;
          lThis.gridsize = Math.max(lThis.gridsize, _lNewState[sLayoutProp].x + 1, _lNewState[sLayoutProp].y + 1);
          lThis.domain.push(_lNewState);
          lThis.bypid[trimPID(_lNewState.id)] = _lNewState;
          lThis.bypos[lStateKeyInScs(_lNewState)] = _lNewState;
          lThis.byposECS[lStateKeyInEcs(_lNewState)] = _lNewState;
          if (undefined != _pCompletion)
            _pCompletion(true);
        };
      FSMCTX.query("INSERT fsm_state_name='" + _pStateName + "', fsmedt:layout={x=" + _pLogicalCoords[0] + ",y=" + _pLogicalCoords[1] + "}", new QResultHandler(_lOnCreated, null, null));
    };
  this.deleteState =
    function(_pState, _pCompletion)
    {
      // Prepare statements for persistence.
      var _lStmts = [];
      var _lPid = trimPID(_pState.id);
      // Remove from caches.
      delete lThis.bypos[lStateKeyInScs(_pState)];
      delete lThis.byposECS[lStateKeyInEcs(_pState)];
      // Remove from in-memory domain.
      for (var _iS = 0; _iS < lThis.domain.length; _iS++)
        if (lThis.domain[_iS] === _pState) { lThis.domain.splice(_iS, 1); break; }
      // Remove from in-memory _backrefs of other states pointed to by _pState.
      var _lTransitionsTo = lGetDistinctRelatives(_pState, false);
      _lTransitionsTo.forEach(
        function(_pS)
        {
          var __lS = lThis.bypid[_pS];
          __lS._relcount--;
          delete __lS._backrefs[_lPid];
        });
      _pState['afy:transition'] = {};
      // Remove from other states pointing to _pState.
      var _lTransitionsFrom = lGetDistinctRelatives(_pState, true);
      _lTransitionsFrom.forEach(
        function(_pS)
        {
          var _lS = lThis.bypid[_pS];
          var _lT = _lS['afy:transition'];
          if (undefined == _lT)
            return;
          if ('afy:ref' in _lT)
          {
            _lStmts.push("UPDATE @" + trimPID(_pS) + " DELETE afy:transition");
            delete _lS['afy:transition'];
          }
          else
          {
            for (var _iP in _lT)
              if (trimPID(_lT[_iP]['afy:ref']['$ref']) == _lPid)
              {
                _lStmts.push("UPDATE @" + trimPID(_pS) + " DELETE afy:transition[" + _iP + "]");
                delete _lT[_iP];
                break;
              }
          }
        });
      delete lThis.bypid[_lPid];
      // Persist.
      _lStmts.push("DELETE FROM @" + _lPid);
      // alert(myStringify(_lStmts));
      FSMCTX.queryMulti(_lStmts, new QResultHandler(_pCompletion, null, null));
    };
  this.canConnectStates =
    function(_pStateFrom, _pStateTo)
    {
      if (undefined == _pStateFrom || undefined == _pStateTo)
        return false;
      if (_pStateFrom === _pStateTo)
        return false;
      if (lGetDistinctRelatives(_pStateFrom, false).indexOf(trimPID(_pStateTo.id)) >= 0)
        return false;
      return true;
    }
  this.connectStates =
    function(_pStateFrom, _pStateTo, _pParams, _pCompletion)
    {
      // Prepare the new in-memory transition and persisting statement.
      var _lNewTransition = {'afy:ref':{'$ref':trimPID(_pStateTo.id)}};
      var _lStmt = "UPDATE @" + trimPID(_pStateFrom.id) + " ADD afy:transition={afy:ref=@" + trimPID(_pStateTo.id);
      if (undefined != _pParams && 'condition' in _pParams)
        { _lStmt += ", afy:condition=" + _pParams.condition; _lNewTransition['afy:condition'] = _pParams.condition; }
      if (undefined != _pParams && 'action' in _pParams)
        { _lStmt += ", afy:action=" + _pParams.action; _lNewTransition['afy:action'] = _pParams.action; }
      _lStmt += "}";

      // Add the in-memory transition.
      var _lT = _pStateFrom['afy:transition'];
      if (undefined == _lT)
        _pStateFrom['afy:transition'] = _lNewTransition;
      else if ('afy:ref' in _lT)
        _pStateFrom['afy:transition'] = {0:_pStateFrom['afy:transition'], 1:_lNewTransition};
      else
      {
        var _iP;
        for (_iP in _pStateFrom['afy:transition']);
        _pStateFrom['afy:transition'][_iP + 1] = _lNewTransition;
      }

      // Update backrefs.
      _pStateTo._backrefs[trimPID(_pStateFrom.id)] = 1;
      _pStateFrom._relcount++;
      _pStateTo._relcount++;

      // Persist.
      // alert(_lStmt);
      FSMCTX.query(_lStmt, new QResultHandler(_pCompletion, null, null));
    };
  this.getTransitions =
    function(_pState)
    {
      // Note: There can be multiple transitions from A to B, e.g. with different conditions...
      var _lResult = [];
      var _lAddResult = function(_pT, _pTeid) { _lResult.push({transition:_pT, target:lThis.bypid[trimPID(_pT['afy:ref']['$ref'])], eid:_pTeid}); };
      var _lT = _pState['afy:transition'];
      if (undefined == _lT) {}
      else if ('afy:ref' in _lT) _lAddResult(_lT);
      else for (var _iP in _lT) _lAddResult(_lT[_iP], _iP);
      return _lResult;
    }
  this.disconnect =
    function(_pState, _pTransitionEid, _pTargetPid, _pCompletion)
    {
      // Prepare the new in-memory transition and persisting statement.
      var _lUpdatedTransition = _pState['afy:transition'];
      var _lStmt = "UPDATE @" + trimPID(_pState.id) + " DELETE afy:transition";
      if (undefined != _pTransitionEid)
        { _lStmt += "[" + _pTransitionEid + "]"; delete _pState['afy:transition'][_pTransitionEid]; }
      else
        delete _pState['afy:transition'];

      // Update backrefs.
      var _lTarget = lThis.bypid[trimPID(_pTargetPid)];
      delete _lTarget._backrefs[trimPID(_pState.id)];
      _lTarget._relcount--;
      _pState._relcount--;

      // Persist.
      FSMCTX.query(_lStmt, new QResultHandler(_pCompletion, null, null));
    };
  this.saveLayout =
    function(_pCompletion)
    {
      var _lQs = [];
      lThis.domain.forEach(function(_pS) { _lQs.push("UPDATE @" + trimPID(_pS.id) + " SET fsmedt:layout={x=" + _pS[sLayoutProp].x + ",y=" + _pS[sLayoutProp].y + "}"); });
      FSMCTX.queryMulti(_lQs, new QResultHandler(_pCompletion, null, null));
      lMustSaveLayout = false;
    };
  var lDoLayout = function() { lGetDomain(function(_pDomain) { lThis.gridsize = lLayout(_pDomain); lThis.domain = (undefined != _pDomain ? _pDomain : []); pCompletion(); }); };
  lDoLayout();
}
FsmModel.HALF_UNIT_INPX = 25;
 
/**
 * FsmBackground.
 * Background capture, to accelerate some interactions.
 */
function FsmBackground(p2dCtx)
{
  var lThis = this;
  this.bg = null;
  this.release = function() { lThis.bg = null; }
  this.capture = function() { if (undefined == lThis.bg) try { lThis.bg = p2dCtx.getImageData(0, 0, p2dCtx.canvas.width, p2dCtx.canvas.height); } catch(e) {} return (undefined != lThis.bg); }
  this.restore = function() { if (undefined != lThis.bg) { p2dCtx.save(); p2dCtx.setTransform(1, 0, 0, 1, 0, 0); p2dCtx.putImageData(lThis.bg, 0, 0); p2dCtx.restore(); return true; } return false; }
}

/**
 * FsmDlgBox.
 */
function FsmDlgBox(pDlgRs, pOkRs, pCancelRs, pOnOk)
{
  var lCloseDlg = function() { pDlgRs.css("visibility", "hidden"); pDlgRs.unbind('keyup'); pOkRs.unbind('click'); pCancelRs.unbind('click'); };
  var lDo =
    function()
    {
      if (pDlgRs.css("visibility") == "hidden")
        return;
      pOnOk(lCloseDlg);
    };
  pDlgRs.css("visibility", "visible");
  pDlgRs.keyup(function(_e) { if (_e.which == 13) lDo(); else if (_e.which == 27) lCloseDlg(); });
  pOkRs.click(lDo);
  pCancelRs.click(lCloseDlg);
}

/**
 * FsmEditor.
 * Principles: user only can move states (on a grid); states never overlap; edges are automatic; edges never cross states.
 */
function FsmEditor()
{
  var lThis = this;
  var l2dCtx;
  try { l2dCtx = document.getElementById("fsm_area").getContext("2d"); } catch(e) { myLog("html5 canvas not supported"); disableTab("#tab-fsm", true); return; }
  var lVPHeight = $("#fsm_area").height();
  var lInitPanZoom = function() { var _lPZ = new PanZoom($("#fsm_area"), lVPHeight / (8 * FsmModel.HALF_UNIT_INPX)); _lPZ.pan = {x:2 * FsmModel.HALF_UNIT_INPX, y:FsmModel.HALF_UNIT_INPX}; return _lPZ; }
  var lPanZoom = lInitPanZoom();
  var lModel = null;
  var lLayoutCtx = null;
  var lBackground = new FsmBackground(l2dCtx); // Once a view is rendered, we immediately capture it to be able to draw/erase over it, quickly.
  var lToolIndexes = {edit:0, connect:1, insert:2, delete:3};
  var lToolNames = [$("#tool_edit").text(), $("#tool_connect").text(), $("#tool_insert").text(), $("#tool_delete").text()];
  var lInteractions = {selected:{state:null, tool:lToolIndexes.edit}, hovering:{state:null, insert:null}};
  var lDrawToolButton =
    function(_pText, _pX, _pY, _pW, _pH, _pSelected)
    {
      var _lTw = l2dCtx.measureText(_pText).width;
      l2dCtx.fillStyle = _pSelected ? "#fafafa" : "#e4e4e4";
      l2dCtx.fillRect(_pX, _pY, _pW, _pH);
      l2dCtx.strokeRect(_pX, _pY, _pW, _pH);
      l2dCtx.fillStyle = "#000000";
      l2dCtx.fillText(_pText, _pX + 0.5 * (_pW - _lTw), _pY + 14);
    };
  var lDoDraw = // The rendering engine.
    function()
    {
      // Release old background captures.
      lBackground.release();

      // Reset transfos and background.
      l2dCtx.setTransform(1, 0, 0, 1, 0, 0);
      l2dCtx.fillStyle = "#e4e4e4";
      l2dCtx.fillRect(0, 0, l2dCtx.canvas.width, l2dCtx.canvas.height);
      if (undefined == lModel)
        return;

      // Apply current pan&zoom.
      l2dCtx.scale(lPanZoom.zoom, lPanZoom.zoom);
      l2dCtx.translate(lPanZoom.pan.x, lPanZoom.pan.y);

      // Draw the 0-0 boundary.
      // Review: maybe deal with negative coords (e.g. by moving everything); or don't allow to pan there; or ?
      l2dCtx.strokeStyle = "#d3d3d3";
      l2dCtx.beginPath();
      l2dCtx.moveTo(0, 0);
      l2dCtx.lineTo(10000, 0);
      l2dCtx.moveTo(0, 0);
      l2dCtx.lineTo(0, 10000);
      l2dCtx.stroke();

      // Draw the model.
      l2dCtx.strokeStyle = "#20a0ee";
      lModel.draw(l2dCtx);

      // Draw legend/toolbar.
      l2dCtx.setTransform(1, 0, 0, 1, 0, 0);
      l2dCtx.lineWidth = 1;
      l2dCtx.strokeStyle = "#444444";
      l2dCtx.font = "8pt Helvetica";
      for (var _iT = 0; _iT < lToolNames.length; _iT++)
        lDrawToolButton(lToolNames[_iT], 5, lVPHeight - 82 + (20 * _iT), 50, 20, _iT == lInteractions.selected.tool);

      // Capture the rendered scene.
      lBackground.capture();
    }
  var lDoLayout = function() { lModel = new FsmModel(afy_sanitize_semicolon($("#fsm_query").val()), lDoDraw); };
  var lDoRefresh = function() { lDoLayout(); };

  // Helpers for mouse interactions.
  var lLogicalCoords =
    function()
    {
      var _lOffset = $("#fsm_area").offset();
      return [Math.floor((((lPanZoom.curX() - _lOffset.left) / lPanZoom.zoom) - lPanZoom.pan.x) / 50),
        Math.floor((((lPanZoom.curY() - _lOffset.top) / lPanZoom.zoom) - lPanZoom.pan.y) / 50)];
    }
  var lStateFromPoint =
    function()
    {
      var _lPos = lLogicalCoords();
      return {state:(undefined != lModel ? lModel.stateAt(_lPos[0], _lPos[1]) : null), pos:_lPos};
    }
  var lToolIndexFromPoint =
    function()
    {
      var _lOffset = $("#fsm_area").offset();
      var _lNLP = {x:(lPanZoom.curX() - _lOffset.left - 5), y:(lPanZoom.curY() - _lOffset.top - (lVPHeight - 82))};
      if (_lNLP.x >= 0 && _lNLP.x < 50 && _lNLP.y >= 0 && _lNLP.y <= 80)
        return Math.floor(_lNLP.y / 20);
      return null;
    }    
  var lSetup2dCtx =
    function()
    {
      l2dCtx.setTransform(1, 0, 0, 1, 0, 0);
      l2dCtx.scale(lPanZoom.zoom, lPanZoom.zoom);
      l2dCtx.translate(lPanZoom.pan.x, lPanZoom.pan.y);
    };

  // Mouse interactions.
  var lOnMouseDown =
    function(e)
    {
      // Check change of active tool.
      var _lTool = lToolIndexFromPoint();
      if (undefined != _lTool)
      {
        lInteractions.selected.tool = _lTool;
        lDoDraw();
      }
      else
      {
        // See if a tool-specific interaction is starting.
        var _lHandled = false;
        switch (lInteractions.selected.tool)
        {
          case lToolIndexes.edit:
          case lToolIndexes.connect:
            lInteractions.selected.state = lStateFromPoint().state;
            _lHandled = (undefined != lInteractions.selected.state);
            break;
          case lToolIndexes.insert:
          {
            var _lTaken = lStateFromPoint();
            if (undefined == _lTaken.state && _lTaken.pos[0] >= 0 && _lTaken.pos[1] >= 0)
            {
              _lHandled = true;
              setTimeout(function() { $("#dlg_ns_name").focus(); }, 500);
              new FsmDlgBox($("#dlg_new_state"), $("#dlg_ns_ok"), $("#dlg_ns_cancel"),
                function(_pCloseDlg)
                {
                  var _lStateName = afy_without_qname($("#dlg_ns_name").val());
                  _pCloseDlg();
                  lModel.insertState(_lStateName, _lTaken.pos, lDoDraw);
                });
            }
            break;
          }
          case lToolIndexes.delete:
          {
            var _lToDelete = lStateFromPoint().state;
            if (undefined != _lToDelete)
            {
              _lHandled = true;
              lModel.deleteState(_lToDelete, lDoDraw);
            }
            break;
          }
          default: break;
        }
        // If nothing happened, delegate to pan/zoom.
        if (!_lHandled)
          lPanZoom.onMouseDown();
      }
    };
  var lOnMouseMove =
    function(e)
    {
      lPanZoom.onMouseMove(e);
      if (undefined != lInteractions.selected.state)
      {
        if (!lBackground.restore())
          return;

        var _lPos = lLogicalCoords();
        switch (lInteractions.selected.tool)
        {
          case lToolIndexes.edit:
            lSetup2dCtx();
            lModel.moveState(lInteractions.selected.state, _lPos[0], _lPos[1], false);
            lModel.drawState(l2dCtx, lInteractions.selected.state, true, "#f5f5f5", "#aaaaaa");
            break;
          case lToolIndexes.connect:
            lModel.drawEdgeTo(l2dCtx, lInteractions.selected.state, _lPos);
            break;
          default: break;
        }
      }
      else
      {
        if (lPanZoom.isButtonDown())
          lDoDraw();
        else
        {
          if (undefined != lInteractions.hovering.state || undefined != lInteractions.hovering.insert)
          {
            lBackground.restore();
            lInteractions.hovering.state = lInteractions.hovering.insert = null;
          }
          switch (lInteractions.selected.tool)
          {
            case lToolIndexes.edit:
            case lToolIndexes.delete:
            case lToolIndexes.connect:
            {
              lInteractions.hovering.state = lStateFromPoint().state;
              if (undefined != lInteractions.hovering.state)
              {
                lSetup2dCtx();
                lModel.drawState(l2dCtx, lInteractions.hovering.state, false, "#f5f5f5", "#aaaaaa");
              }
              break;
            }
            case lToolIndexes.insert:
            {
              lInteractions.hovering.insert = lStateFromPoint();
              if (undefined == lInteractions.hovering.insert.state && lInteractions.hovering.insert.pos[0] >= 0 && lInteractions.hovering.insert.pos[1] >= 0)
              {
                lSetup2dCtx();
                lModel.drawStateAt(l2dCtx, lInteractions.hovering.insert.pos, "#d4d4d4", "#1595ea");
              }
              else
                lInteractions.hovering.insert = null;
              break;
            }
            default: break;
          }
        }
      }
    };
  var lOnMouseUp =
    function()
    {
      if (undefined != lInteractions.selected.state)
      {
        switch (lInteractions.selected.tool)
        {
          case lToolIndexes.edit:
          {
            lBackground.restore();
            var _lPos = lLogicalCoords();
            lModel.moveState(lInteractions.selected.state, _lPos[0], _lPos[1], true, lDoDraw);
            break;
          }
          case lToolIndexes.connect:
          {
            lBackground.restore();
            var _lConnectFrom = lInteractions.selected.state;
            var _lConnectTo = lStateFromPoint().state;
            if (lModel.canConnectStates(_lConnectFrom, _lConnectTo))
            {
              setTimeout(function() { $("#dlg_nt_condition").focus(); }, 500);
              new FsmDlgBox($("#dlg_new_transition"), $("#dlg_nt_ok"), $("#dlg_nt_cancel"),
                function(_pCloseDlg)
                {
                  var _lCondition = $("#dlg_nt_condition").val();
                  var _lAction = $("#dlg_nt_action").val();
                  _pCloseDlg();
                  lModel.connectStates(_lConnectFrom, _lConnectTo, {condition:_lCondition, action:_lAction}, lDoDraw);
                });
            }
            else if (_lConnectFrom === _lConnectTo)
            {
              // A first, simple interaction for disconnect: display a dlg of all possibilities (with ok/cancel).
              // May provide other options in the future (either explicit tool or other gestures or ???).
              $("#dlg_rt_what").text(_lConnectFrom.fsm_state_name);
              $("#dlg_rt_from").empty();
              var _lTransitions = lModel.getTransitions(_lConnectFrom);
              if (_lTransitions.length > 0)
              {
                _lTransitions.forEach(function(_pT) { $("#dlg_rt_from").append($("<option value='" + trimPID(_pT.target.id) + ":" + (undefined != _pT.eid ? _pT.eid : "") + "'>" + _pT.target.fsm_state_name + ' [' + _pT.transition['afy:condition'] + ']' + "</option>")); });
                new FsmDlgBox($("#dlg_remove_transition"), $("#dlg_rt_ok"), $("#dlg_rt_cancel"),
                  function(_pCloseDlg)
                  {
                    var _lToDelete = $("#dlg_rt_from").val();
                    var _lM = _lToDelete.match(/^([0-9a-fA-F]+):([0-9a-fA-F]+|)$/);
                    _pCloseDlg();
                    if (undefined != _lM && _lM.length >= 3)
                      lModel.disconnect(_lConnectFrom, _lM[2].length > 0 ? _lM[2] : null, _lM[1], lDoDraw);
                  });
              }
            }
            break;
          }
          default: break;
        }
        lInteractions.selected.state = null;
      }
      else if (lPanZoom.isButtonDown())
        lPanZoom.onMouseUp();
      else
      {
        lPanZoom.reset();
        lDoDraw();
      }
    };
  $("#fsm_area").mousedown(lOnMouseDown);
  $("#fsm_area").mousemove(lOnMouseMove);
  $("#fsm_area").mouseup(lOnMouseUp);
  $("#fsm_area").mouseout(function() { lPanZoom.onMouseUp(); });
  $("#fsm_area").mouseleave(function() { lPanZoom.onMouseUp(); });
  var lMouseOnMobile = new TrackMouseOnMobile(
    "#fsm_area",
    {
      'wheel':function(p) { lPanZoom.onMouseMove({pageX:p.x, pageY:p.y}); lPanZoom.onWheel(p); lDoDraw(); },
      'mousedown':function(p) { var _p = {pageX:p.x, pageY:p.y}; lOnMouseMove(_p); lOnMouseDown(_p); },
      'mousemove':function(p) { lOnMouseMove({pageX:p.x, pageY:p.y}); },
      'mouseup':function() { lOnMouseUp(); }
    });
  var lOnWheel = function(e) { lPanZoom.onWheel(e); lDoDraw(); return false; }
  var lUpdateCanvasSize = function() { var _lA = $("#fsm_area"); _lA.attr("width", _lA.width()); _lA.attr("height", _lA.height()); }
  var lOnResize = function() { lVPHeight = $("#fsm_area").height(); lPanZoom = lInitPanZoom(); lUpdateCanvasSize(); lDoRefresh(); }
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
  $("#fsm_query").keypress(function(e) { if (13 == e.keyCode) { lDoRefresh(); } return true; });
  $("#fsm_querygo").click(function() { lDoRefresh(); return false; });
  var lTabMap = (top === self) ? $("#content") : window.parent.$("#tab-fsm");
  lTabMap.bind(
    "activate_tab",
    function()
    {
      lThis.active = true;
      lManageWindowEvents(true);
      $("#fsm_query").val("SELECT * WHERE EXISTS(fsm_state_name)");
      lDoRefresh();
    });
  lTabMap.bind("deactivate_tab", function() { lManageWindowEvents(false); lThis.active = false; });

  // Initialize the canvas's dimensions (critical for rendering quality).
  lUpdateCanvasSize();
}

// TODO: notion of relative vs absolute layout/location of interconnected subgraphs (if can see/manipulate subsets by query, need to deal with this, including potential collisions)
      // - the layout bfs code already identifies islands among queried stuff...
      // - islands can quickly merge...
      // - coords could be patched in their load context, and saved only upon modifs
      // - don't think we want to support multiple coordinates...
      // - if relative arrangement in an island is always respected (e.g. by always forcing other islands outside), then probably good enough
        // . that may require special care for unidir transitions... either query them all always (class of afy:transition.afy:ref? can't at the moment), or regard them as islands...
// TODO: sanitize condition/action/name etc. (don't accept invalid inputs)
// TODO: test with bigger cases (maybe from red book; with/without saved partial/full layout)
// TODO: finish the drawing code (edge labels etc.), overlaid details etc.
// TODO: live viz etc.
// TODO: test on android device
// TODO: final prop/class names etc.
// TODO: undo/redo?
