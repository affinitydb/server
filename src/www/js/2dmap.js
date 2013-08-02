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
    // Setup the graph/map.
    var lGM = new GraphMap();

    // Make sure the tab is activated in all circumstances.
    // Note:
    //   In the common case it's console.html that drives tab activation,
    //   but a direct initial visit to console.html#tab-map requires special attention
    //   (the frame content is loaded independently), and also we want to
    //   support 2dmap.html running as standalone.
    if (!lGM.active)
    {
      if (top === self)
        $("#content").trigger("activate_tab");
      else if (window.parent.location.href.indexOf("#tab-map") >0)
        window.parent.$("#tab-map").trigger("activate_tab");
    }
  });

/**
 * GraphMap.
 * Manages the graph/map display.
 * The acception of "clique" used here is broad, i.e. a group of pins related by something, such as:
 * . pins that refer to each other via any property
 * . pins that refer to each other via a specific set of properties
 * . pins that belong to the same classes
 * . pins that relate to one another to form a complete graph
 * In order for pagination to be meaningful, and to preserve a cartography that remains meaningful to the viewer,
 * a pin that doesn't gain new refs should remain where it was.
 * TODO: manage layout info in a tmp db (instead of memory)
 * TODO: colorize by classes
 */
function gm_has(pArray, pO) { if (undefined == pArray) return; for (var i = 0; i < pArray.length; i++) if (pArray[i] == pO) return true; return false; }
function gm_removeFrom(pArray, pO) { if (undefined == pArray) return; for (var i = 0; i < pArray.length; i++) if (pArray[i] == pO) { pArray.splice(i, 1); return; } }
function gm_quantizePos(pX, pY, pGrid) { return "" + Math.floor(pX / pGrid) + "," + Math.floor(pY / pGrid); }
function gm_LayoutCtx(pQuery, pOptions/*{walkrefs:true/false, progressive:true/false, draw:func, hideClasses:dict/null, ...}*/)
{
  var lGetOption = function(_pWhat, _pDefault) { return (undefined != pOptions && _pWhat in pOptions) ? pOptions[_pWhat] : _pDefault; }
  // TODO: This will gradually become an interface/caching layer to the layout db.
  // TODO: For the moment, I want to observe and learn what I'll need.
  var lThis = this;
  this.query = pQuery; // The actual query defining the root domain.
  this.walkrefs = lGetOption('walkrefs', true); // Whether or not to walk references to augment the visualization domain.
  this.progressiveDraw = lGetOption('progressive', false); // Whether or not to update the display during pagination.
  this.draw = lGetOption('draw', null); // The redraw function, invoked optionally during pagination, plus at the end.
  this.hideClasses = lGetOption('hideClasses', null); // Class names of classes to be excluded from the visualization domain.
  this.hideRefprops = lGetOption('hideRefprops', null); // Property names of properties to be excluded from graph traversal.
  this.refprops = {}; // Dictionary of names of properties detected to contain references to other pins, during the traversal.
  this.processed = {}; // {pid:layout_info} of all pins processed so far.
  this.cliques = []; // Cliques produced by the current layout engine (n.b. no single-pin clique).
  this.solitaires = {}; // Single pins (not in any clique yet).
  this.backrefs = {}; // To store/retrieve who's pointing to me.
  this.hasClique = function(_pClique) { for (var _iC = 0; _iC < lThis.cliques.length; _iC++) if (lThis.cliques[_iC] == _pClique) return true; return false; }
  this.registerRefprop = function(_pProp) { lThis.refprops[_pProp] = (_pProp in lThis.refprops ? (lThis.refprops[_pProp] + 1) : 1); }
}
gm_LayoutCtx.CLIQUE_RADIUS = 1000.0; // Each clique will be contained within a circle of 100.0 units of radius.
gm_LayoutCtx.QUANTIZE_GRID = 10; // For 2d retrieval.
function gm_LayoutNodeInfo(pPin, pLayoutCtx)
{
  var lPid = trimPID(pPin.id);
  var lDoExtractImmediateRefs =
    function()
    {
      var _lRefs = [];
      for (var _iProp in pPin)
      {
        if (_iProp.charAt(0) == "_") // Review: This special test (borderline hack) is related with the special _xyz_ properties used by the 'complete graph' layout engine, and the fact that we create distinct instances per clique (to account for the fact that this type of partitioning involves nodes shared across cliques).
          continue;
        if (_iProp in pLayoutCtx.hideRefprops)
          { pLayoutCtx.registerRefprop(_iProp); continue; }
        if (typeof(pPin[_iProp]) == "object" && "$ref" in pPin[_iProp])
        {
          pLayoutCtx.registerRefprop(_iProp);
          _lRefs.push(trimPID(pPin[_iProp]["$ref"]));
        }
        else if (typeof(pPin[_iProp]) == "object")
        {
          for (var _iElm in pPin[_iProp])
          {
            if (typeof(pPin[_iProp][_iElm]) == "object" && "$ref" in pPin[_iProp][_iElm])
            {
              pLayoutCtx.registerRefprop(_iProp);
              _lRefs.push(trimPID(pPin[_iProp][_iElm]["$ref"]));
            }
          }
        }
      }
      return _lRefs;
    }
  var lRegisterBackrefs =
    function(_pRefs)
    {
      for (var _iR = 0; _iR < _pRefs.length; _iR++)
      {
        var _lTarget = _pRefs[_iR];
        if (_lTarget in pLayoutCtx.backrefs) pLayoutCtx.backrefs[_lTarget].push(lPid);
        else pLayoutCtx.backrefs[_lTarget] = [lPid];
      }
    }
  var lThis = this;
  this.pin = pPin;
  this.id = lPid;
  this.position = null; // {x:_, y:_, numrefs:_} where (x,y) are relative to the clique in logical cs, and numrefs is a snapshot of the number of backrefs at last evaluation of (x,y).
  this.fwrefs = lDoExtractImmediateRefs(pPin);
  this.clique = null; // a gm_LayoutNodeInfo belongs to only 1 clique at a time; however, depending on the layout engine, the actual pin may belong to multiple cliques (represented by a separate gm_LayoutNodeInfo in each clique).
  this.numrefs_cache = null;
  this.numrefs_eval = function() { lThis.numrefs_cache = lThis.fwrefs.length + (lThis.id in pLayoutCtx.backrefs ? pLayoutCtx.backrefs[lThis.id].length : 0); }
  this.setPosition = function(_pX, _pY) { lThis.position = {x:_pX, y:_pY, numrefs:lThis.numrefs_cache}; }
  this.resetPosition = function() { lThis.position = null; }
  this.getCliqueIndex = function() { return (undefined == lThis.clique ? 0 : (lThis.clique == pLayoutCtx.solitaires ? pLayoutCtx.cliques.length : lThis.clique.cindex)); }
  this.drawVertex =
    function(_pXOffset, _p2dCtx, _pPanZoom, _pRecordPos)
    {
      if (undefined == lThis.position)
        return;
      var _lX = _pXOffset + lThis.position.x;
      var _lY = gm_LayoutCtx.CLIQUE_RADIUS + lThis.position.y;
      var _lQpos = undefined;
      if (undefined != _pRecordPos)
      {
        var _lPx = (_lX + _pPanZoom.pan.x) * _pPanZoom.zoom;
        var _lPy = (_lY + _pPanZoom.pan.y) * _pPanZoom.zoom;
        _lQpos = gm_quantizePos(_lPx, _lPy, gm_LayoutCtx.QUANTIZE_GRID * _pPanZoom.zoom);
        if (_lQpos in _pRecordPos) { if (!gm_has(_pRecordPos[_lQpos], lThis)) _pRecordPos[_lQpos].push(lThis); } else _pRecordPos[_lQpos] = [lThis];
      }
      _p2dCtx.beginPath();
      _p2dCtx.arc(_lX, _lY, 5, 0, 2 * Math.PI, false);
      _p2dCtx.closePath();
      _p2dCtx.fill();
      _p2dCtx.stroke();
      _p2dCtx.fillText("@" + lThis.id /*+ "[" + _lQpos + "] ci:" + lThis.getCliqueIndex()*/, _lX + 5, _lY + 2);
    }
  lRegisterBackrefs(this.fwrefs);
}
function gm_Clique(pLayoutCtx)
{
  var lThis = this;
  var lDebug = false;
  this.data = {}
  this.add =
    function(_pNodeInfo)
    {
      if (lDebug)
      {
        var _l2 = [];
        for (var _i in lThis.data)
          _l2.push("@" + _i);
        myLog("added @" + _pNodeInfo.id + " to " + _l2.join(","));
      }
      lThis.data[_pNodeInfo.id] = _pNodeInfo;
      _pNodeInfo.clique = lThis;
    }
  this.merge =
    function(_pOtherClique)
    {
      if (_pOtherClique == lThis)
        return;
      if (lDebug)
      { 
        var _l1 = [];
        for (var _i in _pOtherClique.data)
          _l1.push("@" + _i);
        var _l2 = [];
        for (var _i in lThis.data)
          _l2.push("@" + _i);
        myLog("merged " + _l1.join(",") + " with " + _l2.join(","));
      }
      for (var _iN in _pOtherClique.data)
        lThis.add(_pOtherClique.data[_iN]);
      gm_removeFrom(pLayoutCtx.cliques, _pOtherClique);
    }
  this.cindex = null;
  pLayoutCtx.cliques.push(this);
}
function gm_InstrSeq()
{
  var iSubStep = 0;
  var lSubSteps = new Array();
  this.next = function() { iSubStep++; if (iSubStep < lSubSteps.length) lSubSteps[iSubStep](); }
  this.push = function(_pSubStep) { lSubSteps.push(_pSubStep); }
  this.start = function() { iSubStep = 0; lSubSteps[iSubStep](); }
  this.curstep = function() { return iSubStep; }
}
function gm_PageByPage(pQueryStr, pPageSize, pHandler, pUserData)
{
  var lAbort = false;
  var lOnCount =
    function(_pJson)
    {
      var _lPaginationCtx = {};
      _lPaginationCtx.mNumPins = parseInt(_pJson);
      _lPaginationCtx.mOffset = 0;
      var _lOnPage =
        function(__pJson, __pUserData)
        {
          if (undefined == __pJson) { return; }
          var __lIsLastPage = (__pUserData.mOffset + __pJson.length >= __pUserData.mNumPins);
          pHandler(__pJson, pUserData, __lIsLastPage);
          __pUserData.mOffset += __pJson.length;
          if (!__lIsLastPage && !lAbort)
            { setTimeout(function(){afy_query(pQueryStr, new QResultHandler(_lOnPage, null, __pUserData), {limit:pPageSize, offset:__pUserData.mOffset})}, 20); }
        }
      if (0 == _lPaginationCtx.mNumPins)
        pHandler([], pUserData, true);
      else
        afy_query(pQueryStr, new QResultHandler(_lOnPage, null, _lPaginationCtx), {limit:pPageSize, offset:_lPaginationCtx.mOffset});
    }
  afy_query(pQueryStr, new QResultHandler(lOnCount, null, null), {countonly:true});
  this.abort = function() { lAbort = true; }
}
// Collection of TBstar-s.
// I believe for the plain execution of EmMCE this is not required (each TBstar can be
// constructed in memory along the pagination process, and then discarded).  But because
// we have uni-directional references, which act as edges in a graph, and because this is
// a general-purpose viewer, I decided to use a 2-pass variation of the algorithm, with
// each TBstar persisted (possibly in a tmp db).
// Note:
//   In this first implementation, the TBstar-s are all in-memory.
function gm_TBstarSystem(pLayoutCtx)
{
  this.layoutCtx = pLayoutCtx;
  this.stars = []; // The array of TBstar-s.
  this.B_byid = {}; // A set of all B-node-ids handled so far; in-memory for the moment (no big deal); this is to implement EmMCE-3, i.e. the removal of GB* from G.
}
gm_TBstarSystem.prototype.newSlice = function(pDomain, pSize)
{
  var lSlice = [];
  for (var iD = 0; iD < pDomain.length && lSlice.length < pSize; iD++)
  {
    if (pDomain[iD] in this.B_byid)
      continue;
    lSlice.push(pDomain[iD])
  }
  var lRemainder = pDomain.slice(iD);
  return [lSlice, lRemainder];
}
gm_TBstarSystem.prototype.add = function(pTBstar)
{
  pTBstar.lockRootRange();
  this.stars.push(pTBstar);
  for (var iB in pTBstar.B_byid)
    this.B_byid[iB] = 1;
}
gm_TBstarSystem.prototype.propagateBackrefs = function()
{
  for (var iDst = 0; iDst < this.stars.length; iDst++)
  {
    var lDst = this.stars[iDst];
    for (var iSrc = 0; iSrc < this.stars.length; iSrc++)
    {
      if (iSrc == iDst)
        continue;
      var lSrc = this.stars[iSrc];
      for (var iB = 0; iB < lSrc.B_data.length; iB++)
      {
        var lB = lSrc.B_data[iB];
        if (lB._info_.id in lDst.Bnb_byid)
          continue;
        var lBcpy = {_oid_:new Number(lDst.next_oid++).toString(), _info_:lB._info_, _b_:false};
        for (var iP in lB) // Review: +/- a hack for cosmetic reasons; may not be needed when layout persistence is fully implemented.
          if (!(iP in lBcpy))
            lBcpy[iP] = lB[iP];
        lDst.insertNode(lBcpy);
      }
    }
  }
}
// Basic prefix-tree for accumulating/sorting/retrieving max-cliques.
// Note: See the intro for gm_TBstarSystem.
gm_TBstar_Basic.OPTION_BNB_AS_B = (1 << 0); // Allows to treat nodes marked as Bnb as if they were B nodes (useful for transient buffers such as M2 in EmMCE).
gm_TBstar_Basic.OPTION_NO_BNB = (1 << 1); // The B domain provided will be self-contained, i.e. there will be no Bnb.
function gm_TBstar_Basic(pLayoutCtx, pOptions)
{
  this.layoutCtx = pLayoutCtx; // The layout ctx, from which we get additional info (will become query-based).
  this.tree = {data:null, parent:null, children:[]}; // The actual prefix-tree structure (TB*). Note: each root-to-leaf path is a B*-max-clique (i.e. a max-clique in GB*).
  this.options = (undefined != pOptions ? pOptions : 0); // gm_TBstar_Basic.OPTION_BNB_AS_B etc..
}
gm_TBstar_Basic.prototype.isDirectRelOf = function(pTestedPID, pNode)
{
  for (var i = 0; i < pNode._info_.fwrefs.length; i++)
    if (pNode._info_.fwrefs[i] == pTestedPID)
      return true;
  if (pNode._info_.id in this.layoutCtx.backrefs) // Note: temporary mechanism, until I implement the on-disk version.
  {
    var lBackrefs = this.layoutCtx.backrefs[pNode._info_.id];
    for (var i = 0; i < lBackrefs.length; i++)
      if (lBackrefs[i] == pTestedPID)
        return true;
  }
  return false;
}
gm_TBstar_Basic.prototype.getDirectRelsOf = function(pNode)
{
  var lRels = {};
  for (var i = 0; i < pNode._info_.fwrefs.length; i++)
    lRels[pNode._info_.fwrefs[i]] = 1;
  if (pNode._info_.id in this.layoutCtx.backrefs) // Note: temporary mechanism, until I implement the on-disk version.
  {
    var lBackrefs = this.layoutCtx.backrefs[pNode._info_.id];
    for (var i = 0; i < lBackrefs.length; i++)
      lRels[lBackrefs[i]] = 1;
  }
  return lRels;
}
gm_TBstar_Basic.MATCH_EXACT = (1 << 0);
gm_TBstar_Basic.MATCH_LARGER = (1 << 1);
gm_TBstar_Basic.MATCH_ANY = gm_TBstar_Basic.MATCH_EXACT | gm_TBstar_Basic.MATCH_LARGER;
gm_TBstar_Basic.prototype.findPath = function(pPath, pMatchType, pUnder)
{
  // Note: Unlike other functions in gm_TBstar_Basic, the path returned here is a chain of tree nodes, not their data items.
  var lPathAtCursor = function(_pCursor)
  {
    var _lPath = [_pCursor];
    var _lParent = _pCursor.parent;
    while (_lParent)
    {
      if (undefined != _lParent.data)
        _lPath.splice(0, 0, _lParent);
      _lParent = _lParent.parent;
    }
    return _lPath;
  }
  var lCursorDepth = function(_pCursor)
  {
    return lPathAtCursor(_pCursor).length;
  }
  var lImpl = function(_pCursor, _pPath, _pDepth)
  {
    // Determine if _pPath[_pDepth-1:] is contained in _pCursor (n.b. _pDepth=0 means the virtual root).
    // See if _pCursor corresponds with the _pDepth's node in _pPath.
    var _lFoundNext = (_pDepth == 0 || _pCursor.data._oid_ == _pPath[_pDepth - 1]._oid_);
    var _lNextDepth = _pDepth;
    // Check end conditions.
    if (_lFoundNext)
    {
      if (_pDepth >= _pPath.length)
      {
        if (0 == (pMatchType & gm_TBstar_Basic.MATCH_EXACT) && lCursorDepth(_pCursor) == _pPath.length)
          return null;
        return lPathAtCursor(_pCursor);
      }
      _lNextDepth += 1;
    }
    else
    {
      // If we're looking for only an exact match, then _lFoundNext must be true; otherwise, we simply skip it
      // (case of a more complex path/graph containing a simpler one).
      if (0 == (pMatchType & gm_TBstar_Basic.MATCH_LARGER))
        return null;
      if (parseInt(_pCursor.data._oid_) > parseInt(_pPath[_pDepth - 1]._oid_))
        return null;
    }
    // Recursion.
    for (var _j = 0; _j < _pCursor.children.length; _j++)
    {
      var _lR = lImpl(_pCursor.children[_j], _pPath, _lNextDepth);
      if (undefined != _lR)
        return _lR;
    }
    return null;
  }
  return lImpl((undefined != pUnder) ? pUnder : this.tree, pPath, 0);
}
gm_TBstar_Basic.prototype.hasPath = function(pPath, pMatchType, pUnder)
{
  return undefined != this.findPath(pPath, pMatchType, pUnder);
}
gm_TBstar_Basic.prototype.isMaximalInB = function(pPath, pDetails)
{
  // This function determines if pPath is maximal among sub-graphs of only B nodes,
  // i.e. if no prefix or suffix (B nodes only) can be found.

  // Initialization.
  if (undefined != pDetails)
    pDetails.path = null;

  // Preliminary checks.
  if (undefined == pPath || 0 == pPath.length)
    { return false; }
  if (this.state < 1)
    { alert("Unexpected: calling isPathInMB on an incomplete TB*"); return false; }
  for (var i = 0; i < pPath.length; i++)
    if (0 == (this.options & gm_TBstar_Basic.OPTION_BNB_AS_B) && !pPath[i]._b_)
      { alert("Unexpected: pPath contains Bnb nodes"); return false; }

  // pPath can only be maximal if we can find an exact match; otherwise, it's either not there,
  // or it has at least an additional prefix, infix or suffix.
  var lP = this.findPath(pPath, gm_TBstar_Basic.MATCH_EXACT);
  if (undefined == lP || 0 == lP.length)
    return false;
  
  // Make sure there's no infix lurking.
  if (undefined != this.findPath(pPath, gm_TBstar_Basic.MATCH_LARGER))
    return false;

  // Now we just need to check that there's no additional B leaf.
  if (0 != (this.options & gm_TBstar_Basic.OPTION_BNB_AS_B) && lP[lP.length - 1].children.length > 0)
    return false;
  for (var iC = 0; iC < lP[lP.length - 1].children.length; iC++)
    if (lP[lP.length - 1].children[iC].data._b_)
      return false;

  // pPath is maximal.
  if (undefined != pDetails)
    pDetails.path = lP;
  return true;
}
gm_TBstar_Basic.prototype.insertPath = function(pPath)
{
  for (var iP = 0; iP < pPath.length; iP++)
    this.insertNode(pPath[iP]);
}
gm_TBstar_Basic.prototype.insertNode = function(pNode)
{
  var lThis = this;
  var SUCCESS = 0;
  var CANNOT_INSERT = 1;
  var ALREADY_THERE = 2;
  var lExtractPathAt = function(_pCursor, _pIncludeUnrelatedParents)
  {
    // Assuming that pNode is a child of _pCursor, extract a subpath containing
    // all valid parents of _pCursor for pNode.
    var _lPath = undefined != _pCursor.data ? [_pCursor.data, pNode] : [pNode];
    var _lParent = _pCursor.parent;
    while (_lParent && undefined != _lParent.data)
    {
      if (_pIncludeUnrelatedParents || lThis.isDirectRelOf(_lParent.data._info_.id, pNode))
        _lPath.splice(0, 0, _lParent.data);
      _lParent = _lParent.parent;
    }
    return _lPath;
  }
  var lInsertDirectChild = function(_pCursor, _pNode)
  {
    // Insert _pNode directly under _pCursor, respecting the _oid_ ordering.
    var _oidn = parseInt(_pNode._oid_);
    if (undefined != _pCursor.data && _oidn <= _pCursor.data._oid_)
      { alert("Unexpected: attempt to insert a child where it can't belong"); return null; }
    var _l = _pCursor.children.length;
    for (var _j = 0; _j < _l; _j++)
    {
      var _oidj = parseInt(_pCursor.children[_j].data._oid_);
      if (_oidj < _oidn)
        continue;
      if (_oidj > _oidn)
        _pCursor.children.splice(_j, 0, {data:_pNode, parent:_pCursor, children:[]});
      return _pCursor.children[_j];
    }
    _pCursor.children.push({data:_pNode, parent:_pCursor, children:[]});
    return _pCursor.children[_l];
  }
  var lInsert = function(_pCursor, _pCompliesWithFullPath)
  {
    var lResult = CANNOT_INSERT;
    // None of these preliminary checks is required at the virtual root.
    if (undefined != _pCursor.data)
    {
      // If pNode is already in that branch, nothing to do.
      if (_pCursor.data._oid_ == pNode._oid_)
        { return ALREADY_THERE; }
      // If we're past a possible insertion point, stop.
      if (parseInt(_pCursor.data._oid_) > parseInt(pNode._oid_))
        { return CANNOT_INSERT; }
      // If we already reached a B-nb, stop (there can be at most one in each root-to-leaf path).
      if (0 == (lThis.options & gm_TBstar_Basic.OPTION_BNB_AS_B) && !_pCursor.data._b_)
        { return CANNOT_INSERT; }
      // If the iterated node is not a relationship of pNode, skip.
      var _lInserted = false;
      if (!lThis.isDirectRelOf(_pCursor.data._info_.id, pNode))
      {
        // We can't insert in the current branch, but maybe we can insert in one or more children,
        // in a separate branch of the tree; we may need to extract and copy that branch
        // in the process of this recursion.
        for (var _j = 0; _j < _pCursor.children.length; _j++)
          if (SUCCESS == lInsert(_pCursor.children[_j], false))
            _lInserted = true;
        return _lInserted ? SUCCESS : CANNOT_INSERT;
      }
    }
    // At this point we know we can insert, either here or deeper; try deeper.
    for (var _j = 0; _j < _pCursor.children.length; _j++)
      if (SUCCESS == lInsert(_pCursor.children[_j], _pCompliesWithFullPath))
        _lInserted = true;
    if (_lInserted)
      lResult = SUCCESS;
    else
    {
      // Couldn't insert deeper - see if we can insert here.
      // Note:
      //   Because we process in _oid_ increasing order, it shouldn't be the case that
      //   _oid_s that are > pNode's need to be reinserted below pNode at this point;
      //   the only exceptions may be uni-directional Bnb-s found in a second pass,
      //   or extracted subpaths (see !_pCompliesWithFullPath).

      // Walk that chain of parents and build a valid path
      // (skipping parents that are not related with pNode).
      var _lPath = lExtractPathAt(_pCursor);
      // If this path is already implicitly present, nothing to do.
      if (lThis.hasPath(_lPath, gm_TBstar_Basic.MATCH_ANY))
        { return ALREADY_THERE; }
      if (_pCompliesWithFullPath)
      {
        // Don't insert a Bnb at the root.
        if (undefined == _pCursor.data && !pNode._b_) // Note: Even when gm_TBstar_Basic.OPTION_BNB_AS_B is set, we never want to insert a Bnb at the root (this options's purpose is to integrate Bnb's inter-relationships).
          lResult = CANNOT_INSERT;
        // Otherwise, yes we can insert here.
        else
        {
          lInsertDirectChild(_pCursor, pNode);
          lResult = SUCCESS;
        }
      }
      else
      {
        // If the prefix of that path is already explicitly present,
        // then it's not our business here (!_pCompliesWithFullPath) to complete it.
        if (lThis.hasPath(_lPath.slice(0, -1), gm_TBstar_Basic.MATCH_EXACT))
          { return ALREADY_THERE; }
        //myLog("inserting " + _lPath.map(function(e) { return trimPID(e.id); }).join(",") + "\nin\n" + lThis.toString());
        
        // Force-insert the path.
        // Review: In some instances this may require removing paths that become non-maximal.
        var _lParent = lThis.tree;
        if (_lPath[0]._b_) // Note: Even when gm_TBstar_Basic.OPTION_BNB_AS_B is set, we never want to insert a Bnb at the root (this options's purpose is to integrate Bnb's inter-relationships).
        {
          for (var _j = 0; _j < _lPath.length; _j++)
            _lParent = lInsertDirectChild(_lParent, _lPath[_j]);
          lResult = SUCCESS;
        }
        lResult = CANNOT_INSERT;
      }
    }
    return lResult;
  }
  lInsert(this.tree, true);
}
gm_TBstar_Basic.prototype.toCliques = function(pCommonThreshold)
{
  var lThis = this;
  var lWalk = function(_pCursor, _pDepth, _pCurClique)
  {
    if (_pDepth >= pCommonThreshold)
    {
      var _lI = new gm_LayoutNodeInfo(_pCursor.data, lThis.layoutCtx); // Create a distinct instance for this clique, since the same pin may also belong to other cliques.
      _pCurClique.add(_lI);
      lThis.layoutCtx.processed[_pCursor.data._info_.id] = _lI;
    }
    for (var _j = 0; _j < _pCursor.children.length; _j++)
    {
      var _lCC = _pCurClique;
      if (_pDepth + 1 == pCommonThreshold)
      {
        _lCC = new gm_Clique(lThis.layoutCtx);
        _lCP = _pCursor;
        while (undefined != _lCP && undefined != _lCP.data && undefined != _lCP.data._info_)
        {
          var _lI = new gm_LayoutNodeInfo(_lCP.data, lThis.layoutCtx); // Create a distinct instance for this clique, since the same pin may also belong to other cliques.
          _lCC.add(_lI);
          lThis.layoutCtx.processed[_lCP.data._info_.id] = _lI;
          _lCP = _lCP.parent;
        }
      }
      lWalk(_pCursor.children[_j], _pDepth + 1, _lCC);
    }
  }
  lWalk(this.tree, 0, this.layoutCtx.solitaires);
  return true;
}
gm_TBstar_Basic.prototype.toPaths = function()
{
  var lThis = this;
  var lPaths = [];
  var lBfs = function(_pCursor, _pCurPath)
  {
    if (0 == _pCursor.children.length)
      lPaths.push(_pCurPath);
    for (var _i = 0; _i < _pCursor.children.length; _i++)
    {
      var _lC = _pCursor.children[_i];
      var _lCP = _pCurPath.slice(0);
      _lCP.push(_lC.data);
      lBfs(_lC, _lCP);
    }
  }
  lBfs(this.tree, []);
  return lPaths;
}
gm_TBstar_Basic.prototype.toString = function(pPropName)
{
  if (undefined == pPropName) pPropName = "name"; // XXX
  var lPaths = this.toPaths();
  var lTxt = "TB*: {\n";
  for (var i = 0; i < lPaths.length; i++)
    lTxt += "  [" + lPaths[i].map(function(_e) { return _e._info_.id + "(" + _e._oid_ + ")" + (undefined != pPropName ? (":" + _e[pPropName]) : ""); }).join(",") + "],\n";
  lTxt += "}";
  return lTxt;
}
// Prefix-tree for accumulating B*-max-cliques, in the layout by cliques.
// Note: When pSelfContained is true, all Bs are included, so tb* becomes tb+.
function gm_TBstar(pSS, pBdata, pOptions)
{
  this.layoutCtx = pSS.layoutCtx; // See gm_TBstar_Basic.
  this.tree = {data:null, parent:null, children:[]}; // See gm_TBstar_Basic.
  this.options = (undefined != pOptions ? pOptions : 0); // See gm_TBstar_Basic.
  this.SS = pSS; // The "start system".
  this.B_data = pBdata; // The original JSON data of all B nodes.
  this.Bnb_data = null; // The original JSON data of all Bnb nodes (n.b. required to handle unidirectional backrefs; wouldn't be required otherwise).
  this.next_oid = pBdata.length + 1; // The next oid value to be assigned to a B-neighbour.
  this.Bnb_byid = {}; // A dictionary of PID->{_oid_:..., ...}, for B-neighbours only.
  this.B_byid = {}; // A dictionary of PID->{_oid_:..., _info_:..., ...}, for B nodes only.
  this.state = 0; // 0:pre-initialized, 1:initialized, 2:root range locked (finished pass 1).
}
gm_TBstar.prototype = new gm_TBstar_Basic(null);
gm_TBstar.prototype.init = function(pCallback)
{
  // Assign an ordering ID to all the Bs (the virtual root has oid=0).
  // Note: Because I add directly to the data (in-memory for the moment, but soon not due to the bidir problem), I use this _name_ convention.
  // Note: _oid_ is only meaningful within the context of 1 tb*; EmMCE actually treats it as transient; it's only because of the handling of backrefs that I keep tb* longer, and local _oid_s along.
  myLog("new batch of Bs: " + this.B_data.map(function(_e){ return trimPID(_e.id) + ":" + _e.name; }).join(","));
  for (var i = 0; i < this.B_data.length; i++)
  {
    var iB = this.B_data[i];
    iB._oid_ = new Number(i + 1).toString();
    iB._info_ = new gm_LayoutNodeInfo(iB, this.layoutCtx);
    iB._b_ = true;
    this.B_byid[trimPID(iB.id)] = iB;
  }

  // Insert all Bs.
  for (var i = 0; i < this.B_data.length; i++)
    this.insertNode(this.B_data[i]);

  // If this tb* is used as stand-alone, there's no Bnb; just finalize it.
  var lThis = this;
  var lFinalize = function()
  {
    // Trim out paths of length 1.
    for (var _i = lThis.tree.children.length; _i > 0; _i--)
      if (lThis.tree.children[_i - 1].children.length == 0)
        lThis.tree.children.splice(_i - 1, 1);
    // Optional validation.
    if (!lThis.verify())
      alert("Failure during final verification");
  }
  if (0 != (this.options & gm_TBstar_Basic.OPTION_NO_BNB))
  {
    lFinalize();
    this.state = 1;
    pCallback(this);
  }
  // Otherwise, process the Bnbs.
  else
  {
    // Collect all Bnbs.
    // Note:
    //   To implement GB* removals from G (EmMCE), it suffices to remove Bnbs that were already processed as Bs in a previous pass.
    //   This is not essential to the success of the algorithm, it just reduces the workload.
    var lBnb_str = [];
    var lBnb = {};
    for (var i = 0; i < this.B_data.length; i++)
    {
      var iB = this.B_data[i];
      for (var iR = 0; iR < iB._info_.fwrefs.length; iR++)
      {
        var lRef = iB._info_.fwrefs[iR];
        if (!(lRef in this.B_byid) && !(lRef in this.SS.B_byid))
          lBnb["@" + lRef] = 1;
      }
    }
    for (var iR in lBnb)
      lBnb_str.push(iR);

    // Process them.
    if (lBnb_str.length > 0)
    {
      var lOnBnb =
        function(_pJson)
        {
          lThis.Bnb_data = _pJson;
          for (var i = 0; i < lThis.Bnb_data.length; i++)
          {
            var iBnb = lThis.Bnb_data[i];
            iBnb._oid_ = new Number(lThis.next_oid++).toString();
            iBnb._info_ = new gm_LayoutNodeInfo(iBnb, lThis.layoutCtx);
            iBnb._b_ = 0 != (this.options & gm_TBstar_Basic.OPTION_BNB_AS_B);
            lThis.Bnb_byid[trimPID(iBnb.id)] = iBnb; // Note: It's on purpose that I ignore OPTION_BNB_AS_B here (to remember which nodes were intended as B).
          }
          for (var i = 0; i < lThis.Bnb_data.length; i++)
            lThis.insertNode(lThis.Bnb_data[i]);

          // Note: In this case the finalization process is part of the caller's logic.
          lThis.state = 1;
          pCallback(lThis);
        }
      afy_query("SELECT RAW * WHERE afy:pinID IN (" + lBnb_str.join(",") + ");", new QResultHandler(lOnBnb, null, null));
    }
    else
    {
      // Note: In this case the finalization process is part of the caller's logic.
      lThis.state = 1;
      pCallback(lThis);
    }
  }
}
gm_TBstar.prototype.lockRootRange = function()
{
  this.state = 2;
}
gm_TBstar.prototype.verify = function()
{
  // Check that there's no redundancy in the resulting tree,
  // i.e. each path is necessary (maximal), i.e. only exists in exact form.
  var lPaths = this.toPaths();
  for (var i = 0; i < lPaths.length; i++)
    if (this.hasPath(lPaths[i], gm_TBstar_Basic.MATCH_LARGER))
      { myLog("Path " + lPaths[i].map(function(_e){ return _e._info_.id; }).join(",") + " not maximal"); return false; }
  
  // Check that it's complete.
  // Short of building the tree with a completely different method,
  // I don't know how to do this comprehensively and efficiently;
  // here, I simply verify that it's impossible to
  // add a B-node to any computed path.
  for (var i = 0; i < lPaths.length; i++)
  {
    for (var j = 0; j < this.B_data.length; j++)
    {
      // First, check that B_data[j] is not already in the path.
      var lBinP = false;
      for (var k = 0; k < lPaths[i].length && !lBinP; k++)
        lBinP = (lPaths[i][k]._oid_ == this.B_data[j]._oid_);
      if (lBinP)
        continue;
      // Second, check that B_data[j] couldn't be added to the path.
      var lPath = [this.B_data[j]];
      var lBrel = 0;
      for (var k = 0; k < lPaths[i].length; k++)
        if (this.isDirectRelOf(this.B_data[j]._info_.id, lPaths[i][k]))
          { lBrel++; lPath.push(lPaths[i][k]); }
      lPath.sort(function(_a, _b) { return parseInt(_a._oid_) - parseInt(_b._oid_); });
      if (lBrel == lPaths[i].length)
        { myLog("[A] Path " + lPath.map(function(_e){ return _e._info_.id; }).join(",") + " is missing"); return false; }
      // Third, check that the tree does contain the cumulated (correct) lPath including B_data[j].
      if (lPath.length > 1 && !this.hasPath(lPath, gm_TBstar_Basic.MATCH_ANY))
        { myLog("[B] Path " + lPath.map(function(_e){ return _e._info_.id; }).join(",") + " is missing"); return false; }
    }
  }
  return true;
}
// Common layout functionality.
function gm_LayoutEngine() {}
gm_LayoutEngine.prototype.getClassFilters = function(pLayoutCtx)
{
  var lFilters = [];
  for (var iF in pLayoutCtx.hideClasses)
    lFilters.push("@ IS NOT A " + iF);
  return lFilters;
}
gm_LayoutEngine.prototype.getFilteringQ = function(pLayoutCtx)
{
  var lFilters = this.getClassFilters(pLayoutCtx);
  var lQ = pLayoutCtx.query;
  if (lFilters.length > 0)
  {
    // TODO: Improve this very sketchy parsing...
    var lWhere = lQ.match(/\Wwhere\W/i);
    var lFstr = "(" + lFilters.join(" AND ") + ")";
    if (undefined == lWhere)
      lQ = lQ + " WHERE " + lFstr;
    else
      lQ = lQ.substr(0, lWhere.index + lWhere[0].length) + lFstr + " AND " + lQ.substr(lWhere.index + lWhere[0].length, lQ.length);
  }
  return lQ;
}
gm_LayoutEngine.prototype.getDomain = function(pLayoutCtx, pOnResult)
{
  var lQ = this.getFilteringQ(pLayoutCtx);
  // TODO: Improve this very sketchy parsing...
  var lSelect = lQ.match(/(\s*select\s*)(\Wwhere\W|\Wfrom\W|\Worder\W|.*|$)/i);
  if (lSelect[2].length > 0)
  {
    var lKeep = lSelect[2].match(/(.+)(\Wwhere\W|\Wfrom\W|\Worder\W)/i);
    lQ = lQ.replace((undefined != lKeep ? lKeep[1] : lSelect[2]), "afy:pinID");
  }
  else
    lQ = lQ.replace(lSelect[1], "SELECT afy:pinID ");
  var lOnDomain = function(_pJson) { var _lDomain = []; for (var _i = 0; _i < _pJson.length; _i++) { _lDomain.push({id:trimPID(_pJson[_i]['afy:pinID']['$ref'])}); } pOnResult(_lDomain); }
  afy_query(lQ, new QResultHandler(lOnDomain, null, null));
}
gm_LayoutEngine.prototype.recomputePositions = function(pLayoutCtx)
{
  var lMaxRadius = gm_LayoutCtx.CLIQUE_RADIUS;
  var lSimpleHashAngle = function(_pPidStr) { var _lH = 0; for (var _i = 0; _i < _pPidStr.length; _i++) { _lH = (2.71828 * _lH + 3.14159 * _pPidStr.charCodeAt(_i)) % 100 ; } return _lH / 100; }
  var lSimpleHashDist = function(_pPidStr) { var _lH = 0; for (var _i = 0; _i < _pPidStr.length; _i++) { _lH = (37 * _lH + 19 * _pPidStr.charCodeAt(_i)) % lMaxRadius ; } return _lH; }

  // Solitaires.
  for (var iPid in pLayoutCtx.solitaires)
  {
    var lI = pLayoutCtx.solitaires[iPid];
    if (undefined != lI.position)
      continue;
    var lDistance = lSimpleHashDist(iPid);
    var lAngle = 2 * Math.PI * lSimpleHashAngle(iPid);
    lI.setPosition(lDistance * Math.cos(lAngle), lDistance * Math.sin(lAngle));
  }

  // Cliques.
  for (var iC = 0; iC < pLayoutCtx.cliques.length; iC++)
  {
    var lClique = pLayoutCtx.cliques[iC];

    // In a clique, put the pins with most relationships closer to the center;
    // don't move pins that have no more refs than at their last evaluation.
    var lRemaining = []
    for (var iPid in lClique.data)
    {
      var lI = lClique.data[iPid];
      lRemaining.push(lI);
      lI.numrefs_eval();
      if (undefined != lI.position && lI.position.numrefs < lI.numrefs_cache)
        lI.resetPosition();
    }
    lRemaining.sort(function(_a, _b) { return _a.numrefs_cache - _b.numrefs_cache; });

    // Starting from the most 'friendly' downward, locate at a predictable distance from the center,
    // but at a pseudo-random angle.
    while (lRemaining.length > 0)
    {
      var lR = lRemaining.pop();
      if (undefined != lR.position)
        continue;
      var lDistance = lR.numrefs_cache > 0 ? (lMaxRadius / lR.numrefs_cache) : lMaxRadius; // TODO: Investigate why I had to add this test...
      var lAngle = 2 * Math.PI * lSimpleHashAngle(lR.id);
      lR.setPosition(lDistance * Math.cos(lAngle), lDistance * Math.sin(lAngle));
    }
  }

  // Sort cliques by size.
  // Note: This is to try to get as stable an output as possible, when playing with filtering options.
  pLayoutCtx.cliques.sort(function(_c1, _c2) { return countProperties(_c2.data) - countProperties(_c1.data); });
  for (var iC = 0; iC < pLayoutCtx.cliques.length; iC++)
    pLayoutCtx.cliques[iC].cindex = iC;
}
// Layout by cliques (maximal complete sub-graphs).
function gm_LayoutEngine_completeG_mem()
{
  // This layout engine partitions the domain by complete graphs, aka cliques,
  // i.e. only sets of pins that are all interconnected to one another.  Typically
  // this produces lots of small partitions.
  // Note:
  //   This version is a purely in-memory flavor, not using the EmMCE algorithm.
  //   The primary purpose is to validate the results of the more complex version
  //   (EmMCE algorithm).

  var lBase = new gm_LayoutEngine();
  var lDoPartition =
    function(_pTBSS, _pDomain)
    {
      var _lB = _pDomain.slice(0);
      if (0 == _lB.length)
        { alert("finished scanning all data"); _pTBSS.layoutCtx.draw(); return; }
      var _lOnBdata =
        function(__pJson)
        {
          // We re-purpose EmMCE's TB* structure to partition the whole domain.
          lTBs = new gm_TBstar(_pTBSS, __pJson, gm_TBstar_Basic.OPTION_NO_BNB);
          lTBs.init(
            function()
            {
              myLog(lTBs.toString());
              _pTBSS.add(lTBs);
              lTBs.toCliques(2);
              lBase.recomputePositions(_pTBSS.layoutCtx);
              _pTBSS.layoutCtx.draw();
            })
        }
      var _lBstr = [];
      for (var _i = 0; _i < _lB.length; _i++)
        _lBstr.push("@" + _lB[_i].id);
      afy_query("SELECT RAW * WHERE afy:pinID IN (" + _lBstr.join(",") + ");", new QResultHandler(_lOnBdata, null, null));
    }
    
  this.doLayout =
    function(_pLayoutCtx)
    {
      lBase.getDomain(
        _pLayoutCtx,
        function(__pDomain) { lDoPartition(new gm_TBstarSystem(_pLayoutCtx), __pDomain); });
    }
}
function gm_LayoutEngine_completeG_EmMCE()
{
  // This layout engine partitions the domain by complete graphs, aka cliques,
  // i.e. only sets of pins that are all interconnected to one another.  Typically
  // this produces lots of small partitions.
  // Note:
  //   Initially I'm doing it in-memory, but it should be trivial to convert
  //   to disk after (the persisted data model is trivial [input G, and progressive output]).
  // Note:
  //   This engine is based on the article by James Cheng, Yiping Ke, Ada Wai-Chee Fu,
  //   Jeffrey Xu Yu, and Linhong Zhu: "Finding Maximal Cliques in Massive Networks".

  var lBase = new gm_LayoutEngine();
  var lProcessFinalClique =
    function(_pLayoutCtx, _pPath)
    {
      _lCC = new gm_Clique(_pLayoutCtx);
      for (var _iP = 0; _iP < _pPath.length; _iP++)
      {
        var _lNode = _pPath[_iP];
        var _lI = new gm_LayoutNodeInfo(_lNode, _pLayoutCtx);
        _lCC.add(_lI);
        _pLayoutCtx.processed[_lNode._info_.id] = _lI;
      }
    }
  var lEmMCE4 =
    function(_pTBSS)
    {
      // For debugging.
      // for (var _iTB = 0; _iTB < _pTBSS.stars.length; _iTB++)
      //   myLog("partition " + _iTB + " before backrefs: " + _pTBSS.stars[_iTB].toString());

      // Our 2nd-pass adjustment, for taking into account pure backrefs
      // (i.e. the fact that our edges can be uni-directional)
      // (iow add B nodes from other partitions, as Bnb pointing back/across).
      _pTBSS.propagateBackrefs();

      // Final pass (main io streaming loop).
      var _lDedup = {paths:{}}; // This is the hash in EmMCE-6.
      for (var _iTB = 0; _iTB < _pTBSS.stars.length; _iTB++)
      {
        var _lTB = _pTBSS.stars[_iTB];
        var _lPaths = _lTB.toPaths();
        // myLog("partition " + _iTB + " after backrefs: " + _lTB.toString());

        // After implementing this M1+M2+M3 subdivision proposed by EmMCE,
        // it occurred to me that it was completely useless.
        // Simply inserting all Bnbs as Bs in the TB* produces the same effect.
        // The essential concept is captured by their own theorem 5.5,
        // i.e. Bnb(Bnb) is never interesting, because it can never contribute to
        // a maxCL involving B...
        /*
          // EmMCE-4: get B+-max-cliques from each TB*
          var _lM1 = new gm_TBstar_Basic(_pTBSS.layoutCtx);
          var _lM2 = new gm_TBstar_Basic(_pTBSS.layoutCtx, gm_TBstar_Basic.OPTION_BNB_AS_B);
          var _lM3 = {};
          var _lX = {};
          for (var _iP = 0; _iP < _lPaths.length; _iP++)
          {
            var _lPath = _lPaths[_iP];
            if (_lPath[_lPath.length - 1]._b_)
            {
              // In M1 we have locally-maximal paths without any Bnb (i.e. globally-maximal paths).
              _lM1.insertPath(_lPath);
            }
            else
            {
              var _lC1 = _lPath.slice(0, _lPath.length - 1);
              var _lDetails = {path:null};
              if (_lTB.isMaximalInB(_lC1, _lDetails))
              {
                // In M2 we have paths that contain a core that is maximal in B,
                // plus all maximal combinations of all their Bnbs,
                // already accounting for their own inter-relationships.
                // (n.b. in _lTB we were not accounting for those inter-relationships yet,
                // hence the temporary _lNbs instance below).
                // M2 essentially treats Bnbs as Bs... why such a convoluted way?
                var _lNbs = new gm_TBstar_Basic(_pTBSS.layoutCtx, gm_TBstar_Basic.OPTION_BNB_AS_B);
                var _lBLeaf = _lDetails.path[_lDetails.path.length - 1];
                for (var _iBnb = 0; _iBnb < _lBLeaf.children.length; _iBnb++)
                  _lNbs.insertNode(_lBLeaf.children[_iBnb].data);
                var _lNbsPaths = _lNbs.toPaths();
                for (var _iP2 = 0; _iP2 < _lNbsPaths.length; _iP2++)
                {
                  var _lC2 = _lC1.slice(0);
                  for (var _iP3 = 0; _iP3 < _lNbsPaths[_iP2].length; _iP3++)
                    _lC2.push(_lNbsPaths[_iP2][_iP3]);
                  _lM2.insertPath(_lC2);
                }
              }
              else
              {
                // In X, we collect what's left in a hash.
                _lX[_lC1.map(function(_e) { return _e._info_.id; }).join(",")] = _lC1;
              }
            }
          }
          alert("M1: " + _lM1.toString());
          alert("M2: " + _lM2.toString());
          var _lXstr = ""; for (var _iX in _lX) { _lXstr += ("[" + _lX[_iX].map(function(_e) { return _e._info_.id + ":" + _e.name; }).join(",") + "]"); } alert("X: " + _lXstr);
          // EmMCE-4.11: for each C1 in X do M3 += C1 U C2 | C2 in EXT(C1)
          for (var _iX in _lX)
          {
            var _lC1 = _lX[_iX];
            var _lEvalExt = function(__pPath)
            {
              var __lExt = new gm_TBstar_Basic(_pTBSS.layoutCtx, gm_TBstar_Basic.OPTION_BNB_AS_B);
              var __lBnbs = _lTB.getDirectRelsOf(__pPath[__pPath.length - 1]);
              for (var __iBnb in __lBnbs)
              {
                if (!(__iBnb in _lTB.Bnb_byid))
                  continue;
                var __lC2 = __pPath.slice(0);
                __lC2.push(_lTB.Bnb_byid[__iBnb]);
                // check that (C1 U C2) is not the subpath of an element of M2
                if (_lM2.hasPath(__lC2, gm_TBstar_Basic.MATCH_ANY))
                  continue;
                // TODO: check that (if C1 is the subpath of an element C1" of X, it's never true that C2 E EXT(C1"))
                // __lC2 is part of the result.
                __lExt.insertPath(__lC2);
              }
              return __lExt;
            }
            var _lExt = _lEvalExt(_lC1).toPaths();
            for (var _iE = 0; _iE < _lExt.length; _iE++)
            {
              var _lC2 = _lExt[_iE];
              _lM3[_lC2.map(function(_e) { return _e._info_.id; }).join(",")] = _lC2;
            }
          }
          var _lM3str = ""; for (var _iM3 in _lM3) { _lM3str += ("[" + _lM3[_iM3].map(function(_e) { return _e._info_.id + ":" + _e.name; }).join(",") + "]"); } alert("M3: " + _lM3str);
        */

        // EmMCE-5.  if _k==1...
        // Review:
        //   We could trim paths from _lDedup after each iteration,
        //   but this space-vs-complexity trade-off is not essential,
        //   in the context of this visualization app.
        var _lPath2Key = function(__pPath) { return __pPath.map(function(_e) { return _e.id + ":" + _e.name; }).sort().join(","); }
        for (var _iP = 0; _iP < _lPaths.length; _iP++)
        {
          var _lP = _lPaths[_iP];
          var _lPk = _lPath2Key(_lP);
          if (_lPk in _lDedup.paths)
            continue;
          _lDedup.paths[_lPk] = 1;
          lProcessFinalClique(_pTBSS.layoutCtx, _lP);
          myLog("> " + _lPk);
        }
      }

      // Produce the final layout and render.
      // Review: we could do it partition by partition.
      lBase.recomputePositions(_pTBSS.layoutCtx);
      _pTBSS.layoutCtx.draw();
    }
  var lEmMCE1 =
    function(_pTBSS, _pDomain)
    {
      // EmMCE-1: select base vertices B (for now: first n pins; could sample instead, or follow chapt. 7)
      var _lPageSize = 20; //5; // TODO: observe & tune (or parametrize)
      var _lSlice = _pTBSS.newSlice(_pDomain, _lPageSize);
      var _lB = _lSlice[0];
      if (0 == _lB.length)
        { lEmMCE4(_pTBSS); return; }
      var _lOnBdata =
        function(__pJson)
        {
          // EmMCE-2: construct TB* (prefix tree of B*-max-cliques)
          // [compute GB*, i.e. all Bnb + B, plus all edges between B, and all edges from B to to a neighbor; then "remove" it from G]
          var __lTBs = new gm_TBstar(_pTBSS, __pJson, gm_TBstar_Basic.OPTION_BNB_AS_B);
          __lTBs.init(function() { _pTBSS.add(__lTBs); lEmMCE1(_pTBSS, _lSlice[1]); });
        }
      var _lBstr = [];
      for (var _i = 0; _i < _lB.length; _i++)
        _lBstr.push("@" + _lB[_i].id);
      afy_query("SELECT RAW * WHERE afy:pinID IN (" + _lBstr.join(",") + ");", new QResultHandler(_lOnBdata, null, null));
    }

  this.doLayout =
    function(_pLayoutCtx)
    {
      lBase.getDomain(_pLayoutCtx, function(__pDomain) { lEmMCE1(new gm_TBstarSystem(_pLayoutCtx), __pDomain); });
    }
}
// Layout by disjoint sub-graphs.
function gm_LayoutEngine_disjointG()
{
  // This layout engine partitions the domain by disjoint sub-graphs, i.e.
  // all connected pins belong to the same partition.  Typically this produces
  // a few large partitions.
  var lThis = this;
  var lBase = new gm_LayoutEngine();
  var lPbP = null; // For interruptibility.
  var lMergeReferers =
    function(_pReferers, _pLayoutCtx)
    {
      var _lFirstInfoReferer = _pLayoutCtx.processed[_pReferers[0]];
      for (var _iR = 1; _iR < _pReferers.length; _iR++)
        _lFirstInfoReferer.clique.merge(_pLayoutCtx.processed[_pReferers[_iR]].clique);
    }
  var lBindLayoutInfo =
    function(_pPin, _pLayoutCtx)
    {
      // Use trimmed-down PIDs (no leading 0s).
      var _lPid = trimPID(_pPin.id);

      // If this pin was already processed...
      if (_lPid in _pLayoutCtx.processed)
      {
        // It may mean that we just discovered a pin pointing to it
        // (which by now should already be registered in _pLayoutCtx.backrefs).
        if (_lPid in _pLayoutCtx.backrefs)
        {
          // If the pin being pointed to was a solitaire, it no longer is.
          // Note: If a pin is pointing to another pin, it necessarily already has a clique (i.e. not solitaire).
          // Note: Many existing cliques may be pointing to this solitaire... must merge all.
          var _lInfo = _pLayoutCtx.processed[_lPid];
          var _lReferers = _pLayoutCtx.backrefs[_lPid];
          var _lFirstInfoReferer = _pLayoutCtx.processed[_lReferers[0]];
          if ((_lInfo.clique == _pLayoutCtx.solitaires) && (_lPid in _pLayoutCtx.solitaires))
          {
            delete _pLayoutCtx.solitaires[_lPid];
            _lFirstInfoReferer.clique.add(_lInfo);
            lMergeReferers(_lReferers, _pLayoutCtx);
          }
          // If it belonged to a clique, it's time to merge cliques.
          else if (_pLayoutCtx.hasClique(_lInfo.clique))
          {
            if (_lFirstInfoReferer.clique != _lInfo.clique)
              _lFirstInfoReferer.clique.merge(_lInfo.clique);
            lMergeReferers(_lReferers, _pLayoutCtx);
          }
        }
        return null;
      }

      // This is a new pin; register it as such; scan its outward references.
      var _lInfo = new gm_LayoutNodeInfo(_pPin, _pLayoutCtx);
      _pLayoutCtx.processed[_lPid] = _lInfo;

      // Determine its clique.
      if (_lPid in _pLayoutCtx.backrefs)
      {
        // Some other pin is pointing to it, so it belongs to that clique (may involve merging multiple cliques).
        var _lReferers = _pLayoutCtx.backrefs[_lPid];
        var _lFirstInfoReferer = _pLayoutCtx.processed[_lReferers[0]];
        _lFirstInfoReferer.clique.add(_lInfo);
        lMergeReferers(_lReferers, _pLayoutCtx);
      }
      else if (0 == _lInfo.fwrefs.length)
      {
        // It points to nothing and nothing points to it so far, so it's a solitaire.
        _pLayoutCtx.solitaires[_lPid] = _lInfo;
        _lInfo.clique = _pLayoutCtx.solitaires;
      }
      else
      {
        // It points to other pins, so at least for now, it's the beginning of a new clique.
        var _lNewClique = new gm_Clique(_pLayoutCtx);
        _lNewClique.add(_lInfo);
      }
      return _lInfo;
    }
  var lGetClassFilters =
    function(_pLayoutCtx)
    {
      var _lFilters = [];
      for (var _iF in _pLayoutCtx.hideClasses)
        _lFilters.push("@ IS NOT A " + _iF);
      return _lFilters;
    }
  var lRequestRefs =
    function(_pSS, _pRefs, _pOnResults, _pLayoutCtx)
    {
      _pSS.push(
        function()
        {
          var _lQ = "SELECT RAW * FROM {" + _pRefs.join(",") + "}";
          var _lFilters = lGetClassFilters(_pLayoutCtx);
          if (_lFilters.length > 0)
            _lQ = _lQ + " WHERE (" + _lFilters.join(" AND ") + ")";
          afy_query(_lQ, new QResultHandler(function(__pJson) { _pOnResults(__pJson, _pLayoutCtx); _pSS.next(); }, null, null));
        });
    }
  var lOnPage =
    function(_pJson, _pLayoutCtx, _pLastPage)
    {
      if (undefined == _pJson) return;

      // First, bind layout infos + scan references, for all new objects.
      var _lNewInfos = [];
      for (var _iPin = 0; _iPin < _pJson.length; _iPin++)
      {
        var _lI = lBindLayoutInfo(_pJson[_iPin], _pLayoutCtx);
        if (undefined != _lI)
        {
          for (var _iR = 0; _iR < _lI.fwrefs.length; _iR++)
            _lNewInfos.push("@" + _lI.fwrefs[_iR]);
        }
      }

      // Second, if the 'extend with refs' option is selected, walk all possible new paths generated by these references (bfs).
      var _lSS = new gm_InstrSeq();
      while (_pLayoutCtx.walkrefs && _lNewInfos.length > 0)
        lRequestRefs(_lSS, _lNewInfos.splice(0, 200), lOnPage, _pLayoutCtx);

      // Once all structural aspects of the page are dealt with, attribute positions and refresh.
      _lSS.push(
        function()
        {
          if (_pLastPage && !_pLayoutCtx.walkrefs)
          {
            // If the 'extend with refs' option was not selected, then we need to walk all references within
            // the final domain, to make sure all cliques are consolidated.
            for (var _iPid in _pLayoutCtx.processed)
            {
              lBindLayoutInfo({id:_iPid}, _pLayoutCtx);
              var _lI = _pLayoutCtx.processed[_iPid];
              for (var _iR = 0; _iR < _lI.fwrefs.length; _iR++)
              {
                var _lR = _lI.fwrefs[_iR];
                if (_lR in _pLayoutCtx.processed)
                  lBindLayoutInfo({id:_lR}, _pLayoutCtx);
              }
            }
          }
          lBase.recomputePositions(_pLayoutCtx);
          if (_pLastPage || undefined != _pLayoutCtx.progressiveDraw)
            _pLayoutCtx.draw();
        });
      _lSS.start();
    }
  this.doLayout =
    function(_pLayoutCtx)
    {
      // On a page by page basis (streaming), perform the layout and refresh along the way.
      if (undefined != lPbP) { lPbP.abort(); }
      var _lFilters = lGetClassFilters(_pLayoutCtx);
      var _lQ = _pLayoutCtx.query;
      if (_lFilters.length > 0)
      {
        // TODO: Improve this very sketchy parsing...
        var _lWhere = _lQ.match(/\Wwhere\W/i);
        var _lFstr = "(" + _lFilters.join(" AND ") + ")";
        if (undefined == _lWhere)
          _lQ = _lQ + " WHERE " + _lFstr;
        else
          _lQ = _lQ.substr(0, _lWhere.index + _lWhere[0].length) + _lFstr + " AND " + _lQ.substr(_lWhere.index + _lWhere[0].length, _lQ.length);
      }
      lPbP = new gm_PageByPage(_lQ, 200, lOnPage, _pLayoutCtx);
    }
}
function gm_Background(p2dCtx)
{
  var lThis = this;
  this.bg = null;
  this.release = function() { lThis.bg = null; }
  this.capture = function() { if (undefined == lThis.bg) try { lThis.bg = p2dCtx.getImageData(0, 0, p2dCtx.canvas.width, p2dCtx.canvas.height); } catch(e) {} return (undefined != lThis.bg); }
  this.restore = function() { if (undefined != lThis.bg) { p2dCtx.save(); p2dCtx.setTransform(1, 0, 0, 1, 0, 0); p2dCtx.putImageData(lThis.bg, 0, 0); p2dCtx.restore(); return true; } return false; }
}
function gm_PinDetails(p2dCtx, pBackground)
{
  var lThis = this;
  var lWidth = 400;
  var lHeight = 120;
  this.pid = null;
  this.pulling = false;
  this.reset = function() { lThis.pid = null; }
  this.displayHighlights =
    function(_pPInfo, _pLayoutCtx, _pPanZoom)
    {
      lThis.pid = _pPInfo.id;
      if (!pBackground.restore() || undefined == lThis.pid || undefined == _pLayoutCtx || !(lThis.pid in _pLayoutCtx.processed))
        return;
      if (undefined == _pPInfo.position)
        return;
      p2dCtx.setTransform(1, 0, 0, 1, 0, 0);
      p2dCtx.scale(_pPanZoom.zoom, _pPanZoom.zoom);
      p2dCtx.translate(_pPanZoom.pan.x, _pPanZoom.pan.y);
      p2dCtx.strokeStyle = "#ccf";
      p2dCtx.fillStyle = "#866";
      p2dCtx.lineWidth = 3;
      var _lCX = _pPInfo.getCliqueIndex() * 2 * gm_LayoutCtx.CLIQUE_RADIUS;
      var _lAllRefs = [];
      for (var _iTo = 0; _iTo < _pPInfo.fwrefs.length; _iTo++)
      {
        var _lIRef = _pPInfo.fwrefs[_iTo];
        if (!(_lIRef in _pPInfo.clique.data))
          continue;
        var _lITo = _pLayoutCtx.processed[_lIRef];
        if (undefined != _lITo && undefined != _lITo.position)
          _lAllRefs.push(_lITo.position);
      }
      var _lBrefs = _pLayoutCtx.backrefs[lThis.pid];
      for (var _iFrom = 0; undefined != _lBrefs && _iFrom < _lBrefs.length; _iFrom++)
      {
        var _lIRef = _lBrefs[_iFrom];
        if (!(_lIRef in _pPInfo.clique.data))
          continue;
        var _lIFrom = _pLayoutCtx.processed[_lIRef];
        if (undefined != _lIFrom && undefined != _lIFrom.position)
          _lAllRefs.push(_lIFrom.position);
      }
      for (var _i = 0; _i < _lAllRefs.length; _i++)
      {
        p2dCtx.beginPath();
        p2dCtx.moveTo(_lCX + _pPInfo.position.x, gm_LayoutCtx.CLIQUE_RADIUS + _pPInfo.position.y);
        p2dCtx.lineTo(_lCX + _lAllRefs[_i].x, gm_LayoutCtx.CLIQUE_RADIUS + _lAllRefs[_i].y);
        p2dCtx.closePath();
        p2dCtx.stroke();
      }
      _pPInfo.drawVertex(_lCX, p2dCtx, _pPanZoom, null);
    }
  var lDisplayDetails =
    function(_pPinInfo, _pPos)
    {
      lThis.pid = _pPinInfo.pid;
      if (!pBackground.restore())
        return;
      var _lPos = {x:Math.min(_pPos.x + 10, p2dCtx.canvas.width - lWidth), y:Math.min(_pPos.y + 10, p2dCtx.canvas.height - lHeight)};
      p2dCtx.save();
      p2dCtx.setTransform(1, 0, 0, 1, 0, 0);
      p2dCtx.globalAlpha = 0.7;
      p2dCtx.fillStyle = "#888";
      p2dCtx.beginPath(); p2dCtx.rect(_lPos.x, _lPos.y, lWidth, lHeight); p2dCtx.closePath();
      p2dCtx.fill(); p2dCtx.clip();
      p2dCtx.fillStyle = "#fff";
      p2dCtx.font = "8pt monospace";
      var _lProps = []
      for (var _iProp in _pPinInfo.data)
      {
        if (_iProp == "id" || _iProp == "afy:pinID") continue;
        _lProps.push(_iProp + ":" + myStringify(_pPinInfo.data[_iProp]));
      }
      var _lTxt = "@" + _pPinInfo.pid + " IS A " + _pPinInfo.classes.join(",") + ": " + _lProps.join(", ");
      var _lMw = p2dCtx.measureText(_lTxt).width;
      var _lCpl = Math.floor((lWidth - 30) * _lTxt.length / _lMw);
      for (var _iL = 0, _iC = 0; _iC < _lTxt.length; _iL++)
      {
        var _lL = _lTxt.substr(_iC, _lCpl);
        var _lLastAlnum = _lL.match(/\W\w*$/);
        var _lLen = _lCpl;
        if (undefined != _lLastAlnum && _lLastAlnum.index >= _lCpl / 2)
        {
          var _lPunct = _lLastAlnum[0].charAt(0);
          _lLen = ((_lPunct == ":" || _lPunct == "," || _lPunct == "}" || _lPunct == "]") ? 1 : 0) + _lLastAlnum.index;
        }
        p2dCtx.fillText(_lL.substr(0, _lLen), _lPos.x + 15, _lPos.y + 25 + _iL * 10);
        _iC += _lLen;
      }
      p2dCtx.restore();
    }
  this.pull =
    function(_pPid, _pAnchor)
    {
      lDisplayDetails({pid:_pPid, classes:[], data:{}}, _pAnchor);
      lThis.pulling = true;
      get_pin_info(_pPid, function(__pInfo) { lThis.pulling = false; lDisplayDetails(__pInfo, _pAnchor); });
    }
}
function GraphMap()
{
  var lThis = this;
  var l2dCtx;
  try { l2dCtx = document.getElementById("map_area").getContext("2d"); } catch(e) { myLog("html5 canvas not supported"); disableTab("#tab-map", true); return; }
  var lVPHeight = $("#map_area").height();
  var lPanZoom = new PanZoom($("#map_area"), lVPHeight / (2 * gm_LayoutCtx.CLIQUE_RADIUS));
  var lLayoutEngines = [new gm_LayoutEngine_disjointG(), new gm_LayoutEngine_completeG_EmMCE()]; //mem()];
  var lLayoutCtx = null;
  var lHideClasses = {};
  var lHideRefprops = {};
  var lBypos = {}; // In screen coordinates.
  var lClassesOfInterest = [];
  var lBackground = new gm_Background(l2dCtx); // Once a view is rendered, we immediately capture it to be able to draw/erase over it, quickly.
  var lPinDetails = new gm_PinDetails(l2dCtx, lBackground);
  var lDoDraw = // The rendering engine.
    function()
    {
      // We assume, as seems to be the case, that
      // browsers take care of double-buffering upon return
      // from this function.  Should this need to be improved,
      // see: http://stackoverflow.com/questions/2795269/does-html5-canvas-support-double-buffering.

      // Release old background captures.
      lBackground.release();
      lBypos = {};

      // Reset transfos and background.
      l2dCtx.setTransform(1, 0, 0, 1, 0, 0);
      l2dCtx.fillStyle = "#e4e4e4";
      l2dCtx.fillRect(0, 0, l2dCtx.canvas.width, l2dCtx.canvas.height);
      if (undefined == lLayoutCtx)
        return;

      // Apply current pan&zoom.
      l2dCtx.scale(lPanZoom.zoom, lPanZoom.zoom);
      l2dCtx.translate(lPanZoom.pan.x, lPanZoom.pan.y);

      // Draw a shadow behind each clique (+ solitaires).
      var _lCX = 0, _iC;
      l2dCtx.fillStyle = "#eaeaea";
      for (_iC = lLayoutCtx.cliques.length + (countProperties(lLayoutCtx.solitaires) > 0 ? 1 : 0); _iC > 0; _iC--, _lCX += 2 * gm_LayoutCtx.CLIQUE_RADIUS)
      {
        l2dCtx.beginPath();
        l2dCtx.arc(_lCX, gm_LayoutCtx.CLIQUE_RADIUS, gm_LayoutCtx.CLIQUE_RADIUS, 0, 2 * Math.PI, false);
        l2dCtx.closePath();
        l2dCtx.fill();
      }

      // Set some general attributes.
      l2dCtx.strokeStyle = "#20a0ee";
      l2dCtx.fillStyle = "#444";
      l2dCtx.lineWidth = 3;

      // Draw edges.
      for (_iC = 0, _lCX = 0; _iC < lLayoutCtx.cliques.length; _iC++, _lCX += 2 * gm_LayoutCtx.CLIQUE_RADIUS)
      {
        var _lClique = lLayoutCtx.cliques[_iC];
        for (var _iPid in _lClique.data)
        {
          var _lI = _lClique.data[_iPid];
          if (undefined == _lI.position)
            continue;
          for (var _iRef = 0; _iRef < _lI.fwrefs.length; _iRef++)
          {
            var _lRef = _lI.fwrefs[_iRef];
            if (!(_lRef in _lClique.data))
              continue;
            var _lITo = lLayoutCtx.processed[_lRef];
            if (undefined == _lITo || undefined == _lITo.position)
              continue;
            l2dCtx.beginPath();
            l2dCtx.moveTo(_lCX + _lI.position.x, gm_LayoutCtx.CLIQUE_RADIUS + _lI.position.y);
            l2dCtx.lineTo(_lCX + _lITo.position.x, gm_LayoutCtx.CLIQUE_RADIUS + _lITo.position.y);
            l2dCtx.closePath();
            l2dCtx.stroke();
          }
        }
      }

      // Draw vertices.
      // TODO: add a coloring phase to the layout, and then here use either a default color, or colors representing the classes (pie slices).
      for (_iC = 0, _lCX = 0; _iC < lLayoutCtx.cliques.length; _iC++, _lCX += 2 * gm_LayoutCtx.CLIQUE_RADIUS)
      {
        var _lClique = lLayoutCtx.cliques[_iC];
        for (var _iPid in _lClique.data)
          _lClique.data[_iPid].drawVertex(_lCX, l2dCtx, lPanZoom, lBypos);
      }
      for (var _iPid in lLayoutCtx.solitaires)
        lLayoutCtx.solitaires[_iPid].drawVertex(_lCX, l2dCtx, lPanZoom, lBypos);

      // Draw legend etc.
      l2dCtx.setTransform(1, 0, 0, 1, 0, 0);
      l2dCtx.fillStyle = "#444";
      l2dCtx.lineWidth = 1;
      l2dCtx.fillText("pan:", 5, lVPHeight - 62);
      l2dCtx.fillText("zoom:", 5, lVPHeight - 42);
      l2dCtx.fillText("classes:", 5, lVPHeight - 22);
      l2dCtx.fillText("refs:", 5, lVPHeight - 2);
      l2dCtx.fillStyle = "#666";
      l2dCtx.strokeStyle = "#666";
      l2dCtx.fillText("click&drag", 50, lVPHeight - 62);
      l2dCtx.fillText("scroll or z+click&drag", 50, lVPHeight - 42);
      if (undefined != lClassesOfInterest)
      {
        for (var _iC = 0; _iC < lClassesOfInterest.length; _iC++)
        {
          l2dCtx.fillStyle = (lClassesOfInterest[_iC]["afy:objectID"] in lLayoutCtx.hideClasses) ? "#e4e4e4" : "#8f8";
          l2dCtx.fillRect(50 + _iC * 15, lVPHeight - 15 - 22, 15, 15);
          l2dCtx.strokeRect(50 + _iC * 15, lVPHeight - 15 - 22, 15, 15);
        }
      }
      var _iPi = 0;
      for (var _iP in lLayoutCtx.refprops)
      {
        l2dCtx.fillStyle = (_iP in lLayoutCtx.hideRefprops) ? "#e4e4e4" : "#8f8";
        l2dCtx.fillRect(50 + _iPi * 15, lVPHeight - 15 - 2, 15, 15);
        l2dCtx.strokeRect(50 + _iPi * 15, lVPHeight - 15 - 2, 15, 15);
        _iPi++;
      }

      // Capture the rendered scene.
      lBackground.capture();
    }
  var lDoLayout =
    function(_pProgressive)
    {
      lLayoutCtx = new gm_LayoutCtx(
        afy_sanitize_semicolon($("#map_query").val()),
        {walkrefs:$("#map_query_withrefs").is(":checked"), progressive:_pProgressive, draw:lDoDraw, hideClasses:lHideClasses, hideRefprops:lHideRefprops});
      lLayoutEngines[$("#map_query_cgraphs").is(":checked") ? 1 : 0].doLayout(lLayoutCtx);
    }
  var lDoRefresh = function(_pProgressive) { lDoLayout(_pProgressive); }

  // Pan & Zoom, checkboxes etc.
  var lClassIndex_modified = null, lPropIndex_modified = null;
  var lDoCheckBox =
    function(_pIndex, _pY, _pStyle)
    {
      l2dCtx.fillStyle = _pStyle;
      l2dCtx.strokeStyle = "#666";
      var _lX = 50 + _pIndex * 15;
      l2dCtx.fillRect(_lX, _pY, 15, 15);
      l2dCtx.strokeRect(_lX, _pY, 15, 15);
    }
  var lCheckboxIndexFromPoint =
    function(_pY)
    {
      var _lOffset = $("#map_area").offset();
      var _lNLP = {x:(lPanZoom.curX() - _lOffset.left - 50), y:(lPanZoom.curY() - _lOffset.top - _pY)};
      if (_lNLP.x >= 0 && _lNLP.x < 15 * lClassesOfInterest.length && _lNLP.y >= 0 && _lNLP.y <= 15)
        return Math.floor(_lNLP.x / 15);
      return null;
    }    
  var lClassIndexFromPoint = function() { return (undefined != lClassesOfInterest) ? lCheckboxIndexFromPoint(lVPHeight - 37) : null; }
  var lPropIndexFromPoint = function() { var _lNumProps = countProperties(lLayoutCtx.refprops); return (0 != _lNumProps) ? lCheckboxIndexFromPoint(lVPHeight - 17): null; }
  var lPinfoFromPoint =
    function()
    {
      var _lOffset = $("#map_area").offset();
      var _lLx = ((lPanZoom.curX() - _lOffset.left) / lPanZoom.zoom) - lPanZoom.pan.x;
      var _lLy = ((lPanZoom.curY() - _lOffset.top) / lPanZoom.zoom) - lPanZoom.pan.y;
      var _lQg = gm_LayoutCtx.QUANTIZE_GRID * lPanZoom.zoom;
      var _lQx = Math.floor((lPanZoom.curX() - _lOffset.left) / _lQg);
      var _lQy = Math.floor((lPanZoom.curY() - _lOffset.top) / _lQg);
      var _lCandidate = null, _lDist2Min = 1e+200;
      for (var _iQx = _lQx - 1; _iQx <= _lQx + 1; _iQx++)
        for (var _iQy = _lQy - 1; _iQy <= _lQy + 1; _iQy++)
        {
          var _lQpos = "" + _iQx + "," + _iQy;
          if (_lQpos in lBypos)
          {
            for (var _iP = 0; _iP < lBypos[_lQpos].length; _iP++)
            {
              var _lChk = lBypos[_lQpos][_iP];
              if (undefined == _lChk.position) continue;
              var _lDist2 = Math.pow((2 * gm_LayoutCtx.CLIQUE_RADIUS * _lChk.getCliqueIndex()) + _lChk.position.x - _lLx, 2) + Math.pow(gm_LayoutCtx.CLIQUE_RADIUS + _lChk.position.y - _lLy, 2);
              if (_lDist2 < _lDist2Min)
                { _lCandidate = _lChk; _lDist2Min = _lDist2; }
            }
          }
        }
      return _lCandidate;
    }
  var lMouseMove =
    function(e)
    {
      lPanZoom.onMouseMove(e);
      if (lPanZoom.isButtonDown())
        lDoDraw();
      else
      {
        var _lDone = false;
        if (undefined != lLayoutCtx)
        {
          var _lClassIndex = lClassIndexFromPoint();
          if (undefined != _lClassIndex)
            { bindTooltip($("#map_area"), lClassesOfInterest[_lClassIndex]["afy:objectID"], {left:lPanZoom.curX(), top:lPanZoom.curY() - 40}, {once:true, start:0, end:500, offy:-15}); _lDone = true; }
          if (!_lDone)
          {
            var _lPropIndex = lPropIndexFromPoint();
            if (undefined != _lPropIndex)
              { bindTooltip($("#map_area"), nthProperty(lLayoutCtx.refprops, _lPropIndex), {left:lPanZoom.curX(), top:lPanZoom.curY() - 40}, {once:true, start:0, end:500, offy:-15}); _lDone = true; }
          }
        }
        if (!_lDone)
        {
          var _lPinfo = lPinfoFromPoint();
          if (undefined == _lPinfo)
            { if (undefined != lPinDetails.pid) { lPinDetails.reset(); lBackground.restore(); } }
          else if (_lPinfo.id != lPinDetails.pid)
            lPinDetails.displayHighlights(_lPinfo, lLayoutCtx, lPanZoom);
        }
      }
    }
  $("#map_area").mousemove(lMouseMove);
  $("#map_area").mousedown(
    function(e)
    {
      var _lDone = false;
      if (undefined != lLayoutCtx)
      {
        var _lClassIndex, _lPropIndex;
        if (undefined != (_lClassIndex = lClassIndexFromPoint()))
        {
          lDoCheckBox(lClassIndex_modified = _lClassIndex, lVPHeight - 37, (lClassesOfInterest[_lClassIndex]["afy:objectID"] in lHideClasses) ? "#8f8" : "#e4e4e4");
          _lDone = true;
        }
        else if (undefined != (_lPropIndex = lPropIndexFromPoint()))
        {
          lDoCheckBox(lPropIndex_modified = _lPropIndex, lVPHeight - 17, (nthProperty(lLayoutCtx.refprops, _lPropIndex) in lHideRefprops) ? "#8f8" : "#e4e4e4");
          _lDone = true;
        }
      }
      if (!_lDone)
        lPanZoom.onMouseDown();
    });
  $("#map_area").mouseup(
    function()
    {
      lPanZoom.onMouseUp();
      if (undefined != lClassIndex_modified)
      {
        var _lClassName = lClassesOfInterest[lClassIndex_modified]["afy:objectID"];
        if (_lClassName in lHideClasses)
          delete lHideClasses[_lClassName];
        else
          lHideClasses[_lClassName] = true;
        lDoRefresh(false);
        lClassIndex_modified = null;
      }
      else if (undefined != lPropIndex_modified)
      {
        var _lPropName = nthProperty(lLayoutCtx.refprops, lPropIndex_modified);
        if (_lPropName in lHideRefprops)
          delete lHideRefprops[_lPropName];
        else
          lHideRefprops[_lPropName] = true;
        lDoRefresh(false);
        lPropIndex_modified = null;
      }
      else
      {
        var _lPinfo = lPinfoFromPoint();
        if (undefined == _lPinfo)
        {
          if (undefined != lPinDetails.pid)
            { lPinDetails.reset(); lBackground.restore(); }
          if (!lPanZoom.didMove())
            { lPanZoom.reset(); lDoDraw(); }
        }
        else
        {
          var _lOffset = $("#map_area").offset();
          var _lA = {x:lPanZoom.curX() - _lOffset.left, y:lPanZoom.curY() - _lOffset.top};
          lPinDetails.pull(_lPinfo.id, _lA);
        }
      }
    });
  $("#map_area").mouseout(function() { lPanZoom.onMouseUp(); });
  $("#map_area").mouseleave(function() { lPanZoom.onMouseUp(); });
  var lMouseOnMobile = new TrackMouseOnMobile(
    "#map_area",
    {
      'wheel':function(p) { lPanZoom.onMouseMove({pageX:p.x, pageY:p.y}); lPanZoom.onWheel(p); lDoDraw(); },
      'mousedown':function(p) { lPanZoom.onMouseMove({pageX:p.x, pageY:p.y}); lPanZoom.onMouseDown(); },
      'mousemove':function(p) { lPanZoom.onMouseMove({pageX:p.x, pageY:p.y}); if (lPanZoom.isButtonDown()) lDoDraw(); },
      'mouseup':function() { lPanZoom.onMouseUp(); }
    });
  var lOnWheel = function(e) { lPanZoom.onWheel(e); lDoDraw(); return false; }
  var lUpdateCanvasSize = function() { var _lA = $("#map_area"); _lA.attr("width", _lA.width()); _lA.attr("height", _lA.height()); }
  var lOnResize = function() { lVPHeight = $("#map_area").height(); lPanZoom = new PanZoom($("#map_area"), lVPHeight / (2 * gm_LayoutCtx.CLIQUE_RADIUS)); lUpdateCanvasSize(); lDoRefresh(true); }
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
  $("#map_query").keypress(function(e) { if (13 == e.keyCode) { lDoRefresh(true); } return true; });
  $("#map_querygo").click(function() { lDoRefresh(true); return false; });
  $("#map_query_withrefs").click(function() { lDoRefresh(false); return true; });
  $("#map_query_cgraphs").click(function() { lDoRefresh(false); return true; });
  var lTabMap = (top === self) ? $("#content") : window.parent.$("#tab-map");
  lTabMap.bind(
    "activate_tab",
    function()
    {
      lThis.active = true;
      lManageWindowEvents(true);
      get_classes(
        function()
        {
          // Update the set of classes we're interested in.
          lClassesOfInterest.splice(0);
          for (var _iC = 0; _iC < AFY_CONTEXT.mClasses.length; _iC++)
            if (undefined == AFY_CONTEXT.mClasses[_iC]['afy:objectID'].match(/^afy:/))
              lClassesOfInterest.push(AFY_CONTEXT.mClasses[_iC]);

          // Initialize the map_query field, if needed.
          if (0 == $("#map_query").val().length)
          {
            if (lClassesOfInterest.length > 0)
              $("#map_query").val("SELECT FROM " + lClassesOfInterest[0]['afy:objectID']);
            else
              $("#map_query").val("SELECT RAW *");
            lDoRefresh(true);
          }
          else
            lDoDraw(); // In case classes changed...
        });
    });
  lTabMap.bind("deactivate_tab", function() { lManageWindowEvents(false); lThis.active = false; });

  // Initialize the canvas's dimensions (critical for rendering quality).
  lUpdateCanvasSize();
}

/*
  Example from article (on blank store):

    INSERT name='a';
    INSERT name='b';
    INSERT name='c';
    INSERT name='d';
    INSERT name='e';
    INSERT name='q';
    INSERT name='r';
    INSERT name='s';
    INSERT name='t';
    INSERT name='w';
    INSERT name='x';
    INSERT name='y';
    INSERT name='z';
    UPDATE @50001 SET friends={@50002, @50003, @5000A, @5000B, @5000C};
    UPDATE @50002 SET friends={@50003, @50004, @50005, @5000A, @5000B};
    UPDATE @50003 SET friends={@50004, @50005, @5000A, @5000B, @5000C};
    UPDATE @50004 SET friends={@50005, @50007, @5000D};
    UPDATE @50005 SET friends={@50008, @5000C};
    UPDATE @50006 SET friends={@50008, @50009};
    UPDATE @50007 SET friends={@5000D};
    UPDATE @50008 SET friends={@5000C};
    UPDATE @5000A SET friends={@5000B};

  Same example, different ordering (also: see if ORDER BY produces identical intermediate results...):

    INSERT name='a', friends={(INSERT name='b', friends={(INSERT name='c', friends={(INSERT name='w'), (INSERT name='x')})})}
    UPDATE @50005 ADD friends=@50003
    INSERT name='y'
    INSERT name='d', friends={(INSERT name='e', friends={(INSERT name='s'), @50006}), (INSERT name='r'), (INSERT name='z')}
    UPDATE @50003 ADD friends={@5000b, @50006, @50008}
    UPDATE @50005 ADD friends={@50001, @50002, @50006}
    UPDATE @50004 ADD friends={@50001, @50002, @50008, @5000B}
    UPDATE @50009 SET friends={@5000A}
    UPDATE @50002 ADD friends=@50001
    UPDATE @50006 ADD friends=@50007
    INSERT name='q', friends={@50007, (INSERT name='t')}
*/

// TODO: test with different orderings, different data sets etc. (mem vs EmMCE)
// TODO: test with different partitioning windows (e.g. single pin / 5 / 10 / ...)
