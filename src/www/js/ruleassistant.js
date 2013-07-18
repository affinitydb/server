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
  Rough Spec
  
  First model to attempt:
    . a multi-line text editor, seeded with whatever code is present in the db
      (can be filtered by prefixes / types / etc.)
      - use CodeMirror? investigating... (license is good, package seems good, lots of usage)
    . editing = either adding new classes/etc. to the db, or updating
      (or dropping + reinserting)
    . while editing, syntax completion provides hints
    . while editing, relevant contexts are highlighted (e.g.
      all things that relate to the same symbols)
    . ability to export the code
    . in case generated classes/timers become allowed eventually,
      tag the edited (originating) classes as such
      - implies interesting logic... pins with references participating
        to the program (e.g. templates) can only be rendered within a graph insert
        (i.e. with relative references)... will have to infer the graph from those pins;
        may want to use tags to signify presentation preferences (e.g. roots);
        could infer the default preferences from initial code (when comes from
        the editor), or from insertion order (when comes from unknown source)
        -> if a class contains references to other pins, then those other
           pins should be rendered as nested insert...
        -> and/or as UPDATE ???.conditions[???] SET ...
           (maybe it will not be possible with a collection, with current
           element-addressing limitations)

  Goals:
    . help write/modify/upgrade/remove {actions, conditions, rules} +
      templates (of machines etc.) + classes + timers;
      also some plain pins (e.g. signalable) and some generic containers
    . help find & correlate things (e.g. quickly get all classes that relate
      to symbol x, or all entities, or all triggers, conditions etc.)
      - e.g. who uses symbol x?
      - e.g. symbol x represents what, in context C? (class? prop? etc.)
      - highlight all correlations on the page?
    . help track/organize comm pins
    . help visualize the program (as code and as graph)
    . help run&visualize simulations (within easily deletable sandboxes)
    
  Sub-goals:
    . facilitate renaming/"refactoring"
    . syntax completion
    . maintain "preferred" prefix names
    . reuse the annotation/documentation model in modeling.py
    . reuse the 2d-map or equivalent for graph visualizations (of program,
      of instances at runtime, maybe even of state diagram/petri-net repr)
    . provide mobile-friendly version (should do this for the whole online experience;
      it's already usable, but not great)
    . filtering&searching options (e.g. all entities with prefix x)
    . export all entities satisfying predicate X as text (i.e. produce the program)
      (import from text = run the script)

  "The idea I'm currently working on is essentially a blank page (an editor),
  containing a syntax-highlighted rendering of currently existing classes/timers/comm-pins/etc,
  and letting you modify/insert/delete them.  You can filter them out by various criteria,
  and switch views easily (e.g. all classes under namespace N or prefix P, or all containing
  prop X, or all classes linked to one another by a reference property [sub-graphs], or all
  classes in a fixed list [traditional project approach], etc.).  You can do searches and 
  highlight relationships.  As you modify the classes, they're updated in the db.  As you 
  create new ones, they're inserted.  As you delete a line, the class is deleted or retired 
  to a deleted bucket.  Syntax completion is smart enough to suggest symbols with a ranking 
  that favors "nearer" elements (both from a syntactic point of view [e.g. suggest a class 
  rather than a property when most relevant], and from a modeling point of view [i.e. suggest 
  properties/classes of that program/scope]).  Erroneous sections of statements are underlined 
  in red.  2d visual representations are also available to visualize relations between classes.  
  Runtime/simulation monitoring allows to track and relate what's going on during a test run, 
  and contain that run in a sandbox.  The editor makes it easy to inspect instances of the 
  classes, or instances containing such property, etc."

  TODO: continue the SDW (smart grid) demo, from within the editor
        (subgoal: truly experience the new environment, and improve it)
        Mark: more dialogue, e.g. don't get stuck on my own preferred templating solution
              (e.g. Mark suggested pin cloning with an evaluation parameter for functional props
              [but not available at the moment, especially in pathsql])
        Mark: encourages to pursue this demo; good for comm testing also; supply-demand etc.
        Mark: another, +/- separate goal is to investigate (play with) a programming model that would
              reconcile some classical planning (e.g. taking into consideration the "main" variables, e.g.
              the fixed walls in a room) with "unknown", time-dependent variables obtained from
              live sensing (e.g. people/robots wandering in the room); possibly involving a
              stack of goals (top goal is to get somewhere; transient subgoals, like walk around
              obstacle, are piled on, when exceptions are detected by sensors)
  ---
  TODO: highlight symbols used only once (i.e. potentially wrong; e.g. missing prefix etc.)
  TODO: work on interaction models:
    - right now the scope input field already has a lot of potential
    - may want to do automatic stuff about symbols under the cursor (or some explicit keyboard command)
    - may want to hide/fold less important things (e.g. some properties)
  TODO: think about a 'debug' mode (?); could involve parsing and taking control
        of timers (i.e. extract the action, and execute it from a control loop
        running here in the assistant; even classes could be controlled that way,
        e.g. by recreating a parallel universe with equivalent classes using notifications
        instead of triggers, where the triggered code would be executed explicitly from here)
  TODO: after creating a new pin for a class, must patch all pin references to it (not necessarily all in the current view)
  TODO: code layout options (e.g. long lines vs wrapped etc.)
  TODO: could have a preferred rendering option for prefixes (i.e. as p:s, or as "full")
  TODO: deal better with very long LOC
  TODO (Ming): special hints for divergences from standard SQL

  what I hope is going to be really useful
    - scoping, search, validation
    - visualization/export/import/tweaking (already true actually - e.g. pacman)
    - consolidation, refactoring
    - live relation to data (e.g. effect of changes, relations between classes etc.)
    - ...
*/

/**
 * Document entry point (by callback).
 */
$(document).ready(
  function()
  {
    var lRA = new ProgrammingAssistant();

    // Make sure the tab is activated in all circumstances.
    if (!lRA.active)
    {
      if (top === self)
        $("#content").trigger("activate_tab");
      else if (window.parent.location.href.indexOf("#tab-ruleassistant") >0)
        window.parent.$("#tab-ruleassistant").trigger("activate_tab");
    }
  });

/**
 * BasicCodeRenderer.
 * Note:
 *   At least for the time being, this layer does not involve any
 *   parsing; it just arranges the parts such as to recreate
 *   a statement producing the original. Parsing (for things like
 *   replacement with the prefixed form) is done as a transformation
 *   on this basic result, e.g. in OrganicCodeRenderer.
 * Note:
 *   Could also be pushed to the kernel, but unless this becomes big
 *   no particular effort will be made initially to formalize an
 *   interface, here.
 */
function BasicCodeRenderer(pDbg_noParsing)
{
  var lRenderProp =
    function(pJsonProp)
    {
      switch (typeof(pJsonProp))
      {
        case "string": return "'" + pJsonProp.replace(/'/g, "''") + "'";
        case "number": return pJsonProp;
        default:
        case "object":
          if (pJsonProp instanceof Array)
            return "{" + pJsonProp.map(function(_p) { return lRenderProp(_p); }).join(",") + "}";
          else
          {
            var lPs = [];
            for (var iElm in pJsonProp)
            {
              if ('$ref' == iElm)
                lPs.push("@" + pJsonProp[iElm]);
              else
                lPs.push(lRenderProp(pJsonProp[iElm]));
            }
            return lPs.length > 1 ? ("{" + lPs.join(",") + "}") : lPs[0];
          }
          break;
      }
      return "";
    }
  var lTriggerPropNames = ['afy:onEnter', 'afy:onUpdate', 'afy:onLeave'];
  var lRenderClass =
    function(pJsonClass)
    {
      var _lIsClass = 'afy:predicate' in pJsonClass;
      var _lIsTimer = 'afy:action' in pJsonClass && 'afy:timerInterval' in pJsonClass;
      if (!('afy:objectID' in pJsonClass) || (!_lIsClass && !_lIsTimer))
        return null;
      var _lCName = afy_without_qname(pJsonClass['afy:objectID']);
      if (_lCName.indexOf('http://affinityng.org') >= 0)
        return null;

      var _lStartedAssignments = false;
      var _lCCode = (_lIsClass ? "CREATE CLASS \"" : "CREATE TIMER \"") + _lCName + "\"";
      if (_lIsTimer)
        _lCCode += " INTERVAL '" + pJsonClass['afy:timerInterval'] + "'";
      _lCCode += "\n  AS ";
      _lCCode += pJsonClass[_lIsClass ? 'afy:predicate' : 'afy:action'].replace(/\n/g, " ");
      for (var _iTpn = 0; _iTpn < lTriggerPropNames.length; _iTpn++)
      {
        var _lTpn = lTriggerPropNames[_iTpn];
        if (!(_lTpn in pJsonClass))
          continue;

        if (!_lStartedAssignments) { _lCCode += " SET"; _lStartedAssignments = true; }
        _lCCode += "\n  " + _lTpn + "=";

        var _lRenderStatement = function(_pS) { return "${" + _pS.replace(/\n/g, " ").replace(/,/g, ",\n      ") + "}"; } // Review: simplistic solution for shorter LOC (better: use parsed result and use a systematic approach, e.g. nl on keyw/conjunct/operator/...).
        var _lT = pJsonClass[_lTpn];
        if (typeof(_lT) == "string")
          _lCCode += _lRenderStatement(_lT);
        else
        {
          var _lSs = [];
          for (var _iElm in _lT)
            _lSs.push(_lRenderStatement(_lT[_iElm]));
          _lCCode += "{\n    " + _lSs.join(",\n    ") + "}";
        }
      }
      for (var _iProp in pJsonClass)
      {
        if (_iProp == 'id' || 0 == _iProp.indexOf('afy:')) continue;
        if (!_lStartedAssignments) { _lCCode += " SET\n  "; _lStartedAssignments = true; }
        else _lCCode += ",\n  ";
        _lCCode += "\"" + afy_without_qname(_iProp) + "\"=" + lRenderProp(pJsonClass[_iProp]);
      }
      return _lCCode;
    }

  this.renderProp = function(pJsonProp) { return lRenderProp(pJsonProp); }
  this.renderClass = function(pJsonClass) { return lRenderClass(pJsonClass); }
}

/**
 * OrganicCodeRenderer
 * Reassemble the stored code in a coherent fashion, that
 * preserves and communicates a meaningful structure.
 * Note:
 *   This could also have been generated from the parser's AST, but
 *   since it was not necessary, I preferred keeping dependencies on
 *   a parser to the minimum.
 * Note:
 *   This does not exclude the alternative option, to produce
 *   UPDATE statements instead. I decided to start with the tree
 *   flavor, because it produces a more natural & expressive code
 *   structure.
 */
function OrganicCodeRenderer(pDbg_noParsing)
{
  var lOutput, lPid2CInfo, lFwReferences, lBwReferences;
  var lInit =
    function()
    {
      lOutput = {statements:[], code:"", elapsed:0};
      lPid2CInfo = {}; /*pid->{code:_, oid:_, pid:_, order:_, incycle:_, treenode:_}*/
      lFwReferences = {}; /*pid->[pids]*/
      lBwReferences = {}; /*pid->{pids}*/
    }
  var lAtomicRender =
    function(pJsonClasses, pSymbolUsers)
    {
      for (var _iC = 0; _iC < pJsonClasses.length; _iC++)
      {
        if (!('afy:objectID' in pJsonClasses[_iC]))
          continue;
        var _lCpid = pJsonClasses[_iC].id;
        var _lCName = afy_without_qname(pJsonClasses[_iC]['afy:objectID']);
        var _lCCode = new BasicCodeRenderer(pDbg_noParsing).renderClass(pJsonClasses[_iC]);
        if (undefined != _lCCode)
        {
          // Parse and collect its symbols; convert all symbols to qnames (optional).
          // Note:
          //   Presently the kernel's JSON rendering is not systematic about representing symbols as either all qnames
          //   or all full names (e.g. class names are expanded while afy: special properties are not).
          var _lCRefs = [];
          if (!pDbg_noParsing)
          {
            var _lPI = new AfyParserInterface(_lCCode);

            // Update lSymbolUsers (i.e. mark this class as a 'user' of the symbols it uses in everything that defines it).
            _lPI.extractSymbols().forEach(
              function(_s)
              {
                var _ls = afy_strip_quotes(afy_without_qname(_s));
                if (!(_ls in pSymbolUsers)) pSymbolUsers[_ls] = {users:{}, count:0};
                if (!(_lCName in pSymbolUsers[_ls].users)) { pSymbolUsers[_ls].users[_lCName] = 1; pSymbolUsers[_ls].count++; }
              });

            // If this class points to others, then it will be revisited in the second pass.
            _lCRefs = _lPI.extractReferences();

            // Convert all symbols to qnames (TODO: optional).
            var _lNewCCode = _lCCode;
            _lPI.extractSymbolDetails().reverse().forEach(
              function(_s)
              {
                if (_s.startpos >= 0)
                  _lNewCCode = _lNewCCode.substr(0, _s.startpos) + afy_with_qname(_s.name) + _lNewCCode.substr(_s.startpos + _s.name.length);
              });
            _lCCode = _lNewCCode;
          }

          // Collect results.
          // TODO: decide whether lFwReferences should be stored as [] or {} (uniformity with lBwReferences).
          lPid2CInfo[_lCpid] = {code:_lCCode, oid:_lCName, pid:_lCpid, order:_iC};
          if (_lCRefs.length > 0)
            lFwReferences[_lCpid] = _lCRefs;
        }
      }
    };
  var lFilterOutForeignRefs =
    function()
    {
      // Filter out (ignore) non-problematic references (i.e. those that are not explicit references to other classes).
      for (var _iRer in lFwReferences)
      {
        lFwReferences[_iRer] = lFwReferences[_iRer].map(function(_r) { return _r.replace(/@/, ""); }).filter(function(_r) { return (_r in lPid2CInfo); });
        if (0 == lFwReferences[_iRer].length)
          delete lFwReferences[_iRer];
      }
    };
  var lGatherBwRefs =
    function()
    {
      for (var _iRer in lFwReferences)
        lFwReferences[_iRer].forEach(function(_r) { if (!(_r in lBwReferences)) lBwReferences[_r] = {}; lBwReferences[_r][_iRer] = 1; });
    };
  var lIdentifyCycles =
    function(pStack)
    {
      if (0 == pStack.length)
        return false;
      var _lCur = pStack[pStack.length - 1];
      var _lCurInfo = lPid2CInfo[_lCur];
      if ('incycle' in _lCurInfo)
        return (_lCurInfo.incycle != 0);
      if (!(_lCur in lFwReferences))
        return false;
      var _lCurRefs = lFwReferences[_lCur];
      for (var _iR = 0; _iR < _lCurRefs.length; _iR++)
      {
        var _lR = _lCurRefs[_iR];
        if (_lR == pStack[0])
          { for (var _iM = 0; _iM < pStack.length; _iM++) { lPid2CInfo[pStack[_iM]].incycle = 1; } return true; }
        else
        {
          pStack.push(_lR);
          var _lFnd = lIdentifyCycles(pStack);
          pStack.pop();
          if (_lFnd)
            return true;
        }
      }
      _lCurInfo.incycle = 0;
      return false;
    };
  // Tree is used to determine the containment structure
  // (i.e. decide which references are backrefs, i.e. build a tree from the class graph,
  // i.e. reconstruct something close enough to the original program).
  // Note: during the insertion process, children of mRootNode can be moved; others can't.
  function Tree()
  {
    var mThis = this;
    var mRootNode = {pid:'root', parent:null, children:[]};
    this.addNode =
      function(pPid, pParentNode)
      {
        if (undefined == pParentNode)
          pParentNode = mRootNode;
        if (!(pPid in lPid2CInfo))
          { myLog("error (OrganicCodeRenderer::Tree::addNode): couldn't find pid: " + myStringify(pPid)); return; }
        if ('treenode' in lPid2CInfo[pPid])
        {
          var _lN = lPid2CInfo[pPid].treenode;
          if (_lN.parent == mRootNode && (!(pParentNode.pid in lBwReferences) || !(pPid in lBwReferences[pParentNode.pid])))
          {
            // Move from mRootNode's children to pParentNode's.
            _lN.parent = pParentNode;
            for (var _iRc = 0; _iRc < mRootNode.children.length; _iRc++)
              if (mRootNode.children[_iRc] == _lN)
                { mRootNode.children.splice(_iRc, 1); break; }
            pParentNode.children.push(_lN);
          }
          return;
        }
        var _lNode = {pid:pPid, parent:pParentNode, children:[]};
        lPid2CInfo[pPid].treenode = _lNode;
        pParentNode.children.push(_lNode);
        if (pPid in lFwReferences)
          lFwReferences[pPid].forEach(function(__pRee) { mThis.addNode(__pRee, _lNode); });
      };
    this.findParentNode =
      function(pPid)
      {
        if (pPid in lBwReferences)
          for (var _iRer in lBwReferences[pPid])
            if ('treenode' in lPid2CInfo[_iRer])
              return lPid2CInfo[_iRee].treenode;
        return mRootNode;
      };
    this.replaceReferences =
      function()
      {
        mThis.walk(
          null, null, null,
          function(_n)
          {
            if (_n == mRootNode || _n.parent == mRootNode) return;
            var _lK = '@' + _n.pid;
            var _lKIndex = lPid2CInfo[_n.parent.pid].code.indexOf(_lK);
            lPid2CInfo[_n.parent.pid].code = lPid2CInfo[_n.parent.pid].code.substr(0, _lKIndex) + "\n    -- @" + trimPID(_n.pid) + "\n    (" + lPid2CInfo[_n.pid].code.replace(/\n/g, "\n    ") + ")" + lPid2CInfo[_n.parent.pid].code.substr(_lKIndex + _lK.length);
            delete lPid2CInfo[_n.pid]; // Review: could instead mark as dead.
          });
      };
    this.walk =
      function(pStartNode, pCtx, pFuncTopBottom, pFuncBottomUp)
      {
        if (undefined == pStartNode) pStartNode = mRootNode;
        if (undefined != pFuncTopBottom) pFuncTopBottom(pStartNode, pCtx);
        for (var _iC = 0; _iC < pStartNode.children.length; _iC++)
          mThis.walk(pStartNode.children[_iC], pCtx, pFuncTopBottom, pFuncBottomUp);
        if (undefined != pFuncBottomUp) pFuncBottomUp(pStartNode, pCtx);
      };
    this.countNodes =
      function()
      {
        var _lCtx = {cnt:0};
        mThis.walk(mRootNode, _lCtx, function() { _lCtx.cnt++; });
        return _lCtx.cnt - 1; // Note: don't count the artificial root.
      };
    this.dbgPrint =
      function()
      {
        var _lCtx = {out:[]};
        mThis.walk(mRootNode, _lCtx, function(_n){ _lCtx.out.push(_n.pid + "{"); }, function(){ _lCtx.out.push("} "); });
        return _lCtx.out.join("");
      };
  };
  var lForEachInCycle =
    function(pFunc)
    {
      for (var _iC in lPid2CInfo)
      {
        var _lCInfo = lPid2CInfo[_iC];
        if (('incycle' in _lCInfo) && (_lCInfo.incycle > 0))
          pFunc(_lCInfo);
      }
    };
  var lBuildTree =
    function()
    {
      var _lTree = new Tree();
      
      // Start with nodes that must be containers, because they're in a cycle and back-referenced by more than 1 node.
      lForEachInCycle(function(_pCInfo) { if ((_pCInfo.pid in lBwReferences) && (countProperties(lBwReferences[_pCInfo.pid]) > 1)) _lTree.addNode(_pCInfo.pid); });

      // With the remaining nodes involved in cycles, prefer the "most referring ones" as containers.
      var _lInCycleToInsert = [];
      lForEachInCycle(function(_pCInfo) { if ('treenode' in _pCInfo) { return; } _lInCycleToInsert.push({pid:_pCInfo.pid, fwcnt:countProperties(lFwReferences[_pCInfo.pid])}); });
      _lInCycleToInsert.sort(function(_n1, _n2) { return _n2.fwcnt - _n1.fwcnt; });
      _lInCycleToInsert.forEach(function(_n) { _lTree.addNode(_n.pid); });

      // Add any remaining node to the tree.
      for (var _iC in lPid2CInfo)
      {
        var _lCInfo = lPid2CInfo[_iC];
        if ('treenode' in _lCInfo)
          continue;
        _lTree.addNode(_iC, _lTree.findParentNode(_iC));
      }
      
      // Verify the tree.
      var _lExpectedCount = countProperties(lPid2CInfo);
      var _lActualCount = _lTree.countNodes();
      if (_lExpectedCount != _lActualCount)
        alert("error (OrganicCodeRenderer::lBuildTree): expected " + _lExpectedCount + " nodes in built tree, found " + _lActualCount);
      return _lTree;
    };
  var lRenderClasses =
    function(pJsonClasses, pSymbolUsers)
    {
      if (undefined == pJsonClasses) { myLog("populate_classes: undefined pJsonClasses"); return lOutput; }
      var _lT1 = (new Date).getTime();

      // Start with basic rendering.
      lInit();
      lAtomicRender(pJsonClasses, pSymbolUsers);

      // Then replace fixed (i.e. store-specific) references among classes with
      // their embedded ${...} equivalent.
      lFilterOutForeignRefs();
      lGatherBwRefs();
      for (var _iRer in lFwReferences)
        lIdentifyCycles([_iRer]);
      var _lTree = lBuildTree(_lTree);
      _lTree.replaceReferences(_lTree);

      // Then re-order statements from most to least depended-upon (i.e. least to most dependent).
      // Note:
      //   This is to avoid relying on PIDs, which may not always reflect (numerically) the insertion
      //   history, and also to preserve a stable order across changes (due to our current strategy of
      //   DROP-CREATE while editing)...
      // Review:
      //   It would be even nicer to partition inter-related, independent groups of classes neatly
      //   (e.g. separate applications); presently, the user can do this manually with the scope control.
      var _lReordered = [];
      for (var _iCC in lPid2CInfo)
        _lReordered.push(lPid2CInfo[_iCC]);
      _lReordered.sort(
        function(_c1, _c2)
        {
          if (_c1.oid in pSymbolUsers[_c2.oid].users) return 1; /* if _c1 uses _c2, then _c1 must come after _c2 */
          if (_c2.oid in pSymbolUsers[_c1.oid].users) return -1; /* if _c2 uses _c1, then _c1 must come before _c2 */
          var __ucnt1 = pSymbolUsers[_c1.oid].count, __ucnt2 = pSymbolUsers[_c2.oid].count;
          if (__ucnt1 != __ucnt2) return __ucnt2 - __ucnt1; /* whichever has more users should come first */
          return (_c1.oid > _c2.oid) ? 1 : (_c1.oid == _c2.oid ? 0 : -1); /* if all else is equal, sort in alphabetical order */
        });

      // Produce the final statements.
      _lReordered.forEach(
        function(_pCInfo)
        {
          // TODO: make sure containee always points to its container via @:1 (instead of @50001...)
          lOutput.code += '-- @' + trimPID(_pCInfo.pid) + '\n'; // Note: mostly just for debugging...
          lOutput.code += _pCInfo.code + ";\n\n";
          lOutput.statements.push({text:(_pCInfo.code + ";"), oid:afy_with_qname(_pCInfo.oid)});
        });
      lOutput.elapsed = (new Date).getTime() - _lT1;
      return lOutput;
    };
    
  this.renderClasses = function(pJsonClasses, pSymbolUsers) { return lRenderClasses(pJsonClasses, pSymbolUsers); }
}

/**
 * CodeChangeHandler
 */
function CodeChangeHandler(pDbg_noParsing)
{
  var lThis = this;
  this.mDiff = {changed:null, deleted:null, created:null};
  this.mBefore = {code:null, statements:null};
  this.mAfter = {code:null, statements:null};
  this.init = function(pCode, pStatements) { lThis.mBefore.code = lThis.mAfter.code = pCode; lThis.mBefore.statements = lThis.mAfter.statements = pStatements; AFY_CONTEXT.mEditingCtx.updateCode(pCode); }
  var lClassifyChanges =
    function()
    {
      // Note:
      //   For the time being a simple class rename will be handled with DELETE+CREATE;
      //   same treatment if trigger code changes on a class whose predicate didn't.
      //   If/when there's concrete value in handling these cases differently (e.g. to avoid re-indexing),
      //   then these situations should be easy to identify (e.g. with an equivalence function on the AST).
      // Note:
      //   May need to process presentational annotations (e.g. to preserve editing order).
      var _lDiff = {changed:{}, deleted:{}, created:{}};
      for (var _iBef = 0; _iBef < lThis.mBefore.statements.length; _iBef++)
      {
        var _lBef = lThis.mBefore.statements[_iBef];
        _lDiff.changed[_lBef.oid] = {code_before:_lBef.text};
      }
      for (var _iAft = 0; _iAft < lThis.mAfter.statements.length; _iAft++)
      {
        var _lAft = lThis.mAfter.statements[_iAft];
        if (!(_lAft.oid in _lDiff.changed))
          { _lDiff.created[_lAft.oid] = {code_after:_lAft.text}; }
        else if (_lAft.text.replace(/\s+/g, " ") == _lDiff.changed[_lAft.oid].code_before.replace(/\s+/g, " "))
          { delete _lDiff.changed[_lAft.oid]; }
        else
          { _lDiff.changed[_lAft.oid].code_after = _lAft.text; }
      }
      for (var _iChk in _lDiff.changed)
      {
        if ('code_after' in _lDiff.changed[_iChk])
          continue;
        _lDiff.deleted[_iChk] = {code_before:_lDiff.changed[_iChk].code_before};
        delete _lDiff.changed[_iChk];
      }
      return _lDiff;
    };
  var lReportChanges =
    function(pDiff)
    {
      var _lMsg = "deleted: ";
      for (var _i in pDiff.deleted) _lMsg += _i + " ";
      _lMsg += "\ncreated: ";
      for (var _i in pDiff.created) _lMsg += _i + " ";
      _lMsg += "\nmodified: ";
      for (var _i in pDiff.changed) _lMsg += _i + " ";
      alert(_lMsg);
    }
  var lEffectChanges =
    function(pDiff, pCompletion)
    {
      // Warning: bug 365 (workaround: stop/restart the store before editing existing code; looks like dangling locks)
      var _lModifs = [];
      var _lUndo = [];
      for (var _i in pDiff.deleted)
      {
        _lModifs.push("DROP CLASS " + _i);
        _lUndo.push(pDiff.deleted[_i].code_before);
      }
      for (var _i in pDiff.created)
      {
        _lModifs.push(pDiff.created[_i].code_after);
        _lUndo.push("DROP CLASS " + _i);
      }
      for (var _i in pDiff.changed)
      {
        _lModifs.push("DROP CLASS " + _i);
        _lModifs.push(pDiff.changed[_i].code_after);
        _lUndo.push("DROP CLASS " + _i);
        _lUndo.push(pDiff.changed[_i].code_before);
      }
      // TODO: improve/remove the message (e.g. provide counts, simpler message / lReportChanges?)
      if (window.confirm("Apply the following changes?\n\n" + _lModifs))
        afy_batch_query(_lModifs, new QResultHandler(
          function(_pJson)
          {
            // Note: for the time being I store a log entry for history purposes only (undo in the editor doesn't rely on this).
            var __lUndoBody = afy_batch_to_str(_lUndo).replace(/'/g, "''");
            afy_query("INSERT afy:created=1, \"http://localhost/afy/code_change_undo\"='" + __lUndoBody + "'", new QResultHandler(function() {}, null, null));
            if (undefined != pCompletion) pCompletion('changed');
          }, null, null));
    }
  var lNormalizeNewCode =
    function(pNewCode)
    {
      var _lPI = new AfyParserInterface(pNewCode);
      var _lNormalizedCode = pNewCode;
      _lPI.extractSymbolDetails().reverse().forEach(
        function(_s)
        {
          if (_s.startpos >= 0)
            _lNormalizedCode = _lNormalizedCode.substr(0, _s.startpos) + afy_with_qname(_s.name) + _lNormalizedCode.substr(_s.startpos + _s.name.length);
        });
      return _lNormalizedCode;
    };
  this.onEdit =
    function(pNewCode, pCompletion)
    {
      var _lDoCompletion = function(_pStatus) { if (undefined != pCompletion) pCompletion(_pStatus); }
      if (pDbg_noParsing) { _lDoCompletion('changed'); return; }
      var _lOldBefore = lThis.mBefore;
      lThis.mBefore = lThis.mAfter;
      lThis.mAfter = {code:null, statements:null};
      lThis.mAfter.code = lNormalizeNewCode(pNewCode);
      if (lThis.mAfter.code == lThis.mBefore.code) { lThis.mAfter = lThis.mBefore; _lDoCompletion('unchanged'); return; } // i.e. no actual change in the code
      var _lParser = AFY_CONTEXT.mEditingCtx.updateCode(lThis.mAfter.code);
      var _lErrors = _lParser.getErrors();
      if (undefined != _lErrors && _lErrors.length > 0)
      {
        // We only want to operate on transitions from one consistent state (i.e. originally stored classes)
        // to another consistent state (i.e. parseable new code).
        // Here we'll probably do nothing; the syntax highlighter component may underline those errors...
        alert('errors encountered during parsing: ' + _lErrors.map(function(_e) { return _e.message; }).join(","));
        lThis.mBefore = _lOldBefore;
        _lDoCompletion('error');
        return;
      }
      lThis.mAfter.statements = _lParser.splitStatements();
      myLog(lThis.mAfter.statements.length + " statements, e.g.:\n" + lThis.mAfter.statements[0].text + "\nids:\n" + lThis.mAfter.statements.map(function(_s) { return _s.oid; }).join(","));
      lEffectChanges(lClassifyChanges(), pCompletion);
    }
}

/**
 * ProgrammingAssistant.
 * This is where I'll develop the logic/interactions to
 * enhance the process of modeling sensors, machines,
 * templates, rt samples & timers, conditions and actions.
 */
function ProgrammingAssistant()
{
  var lThis = this;
  var lDbg_explicitParseOnly = false;
  var lSymbolUsers = {};
  var lPredicates = {};
  var lTriggers = {};
  var lCodeChangeHandler = new CodeChangeHandler(lDbg_explicitParseOnly);
  var lCM = null;

  var lCreateClass =
    function(_pName, _pDecl, _pCompletion)
    {
      var _lDoProceed = function() { afy_post_query(_pDecl, new QResultHandler(_pCompletion, null, null)); }
      var _lOnCount = function(_pJson) { if (undefined == _pJson || parseInt(_pJson) == 0) { _lDoProceed(); } else { _pCompletion(); } }
      afy_query("SELECT * FROM afy:Classes WHERE CONTAINS(afy:objectID, '" + _pName + "')", new QResultHandler(_lOnCount, null, null), {countonly:true});
    };
  var lSetupPreferredPrefixes =
    function(_pCompletion)
    {
      var _lOnPrefixes =
        function(__pJson)
        {
          if (undefined != __pJson)
            for (var __i = 0; __i < __pJson.length; __i++)
              afy_add_qnprefix(__pJson[__i]["http://localhost/afy/preferredPrefix/scope"], __pJson[__i]["http://localhost/afy/preferredPrefix/name"], __pJson[__i]["http://localhost/afy/preferredPrefix/value"]);
          if (undefined != _pCompletion)
            _pCompletion();
        };
      afy_add_qnprefix(null, 'afy', 'http://affinityng.org/builtin');
      afy_query("SELECT * FROM \"http://localhost/afy/preferredPrefixes\"", new QResultHandler(_lOnPrefixes, null, null), {longnames:true});
    };
  
  var lCheckChangesTimer = null;
  var lCheckChanges = function(_pCompletion) { lCodeChangeHandler.onEdit(lCM.getValue(), _pCompletion); lCheckChangesTimer = null; };
  var lInertKbKeys = [0, 16, 17, 33, 34, 35, 36, 37, 38, 39, 40];
  var lOnEdit =
    function(pCM, pEvent)
    {
      var _lOnConfirmedChanges = function(_pStatus) { lCM.setValue(lCodeChangeHandler.mAfter.code); /*TODO:upon success, update lSymbolUsers (using lCodeChangeHandler.mAfter.statements?)*/ }; // Note: we re-set the text in the editor, to trigger a complete re-assessment of syntax highlighting based on the new, fully-parsed state.
      var _lOnScheduledCheck = function() { lCheckChanges(_lOnConfirmedChanges); };
      var _lScheduleCheck = function() { lCheckChangesTimer = setTimeout(_lOnScheduledCheck, 1000); return false/*don't eat the keystroke...*/; };
      if (undefined != lCheckChangesTimer)
      {
        // If a timer was already engaged (i.e. pending changes are already waiting to be parsed),
        // then any new key stroke, including pure (inert) navigation, should just push back the timer.
        clearTimeout(lCheckChangesTimer);
        return _lScheduleCheck();
      }
      if (13 == pEvent.which && 'keyup' == pEvent.type) { return false; } // Note: ignore keyup for 'return' (e.g. remains from modal dlg's <ok>).
      if (lInertKbKeys.filter(function(_k){ return (pEvent.which == _k); }).length > 0) { return false; } // Note: ignore keyboard arrows etc.
      return _lScheduleCheck();
    };
  lCM = CodeMirror.fromTextArea($("#editor").get()[0], {lineNumbers:true, smartIndent:false, onKeyEvent:lOnEdit, matchBrackets:true});

  var lRegisterTrigger =
    function(_pCName, _pType, _pTs)
    {
      if (!(_pCName in lTriggers))
        lTriggers[_pCName] = {};
      lTriggers[_pCName][_pType] = [];
      if (typeof(_pTs) == "string")
        lTriggers[_pCName][_pType].push(_pTs.replace(/\n/g, " "));
      else
        for (var _iE in _pTs)
          lTriggers[_pCName][_pType].push(_pTs[_iE].replace(/\n/g, " "));
    };
  var lPopulate_classes =
    function(_pJson)
    {
      // For later use...
      for (var _iC = 0; _iC < _pJson.length; _iC++)
      {
        if (!('afy:objectID' in _pJson[_iC]))
          continue;
        var _lIsClass = 'afy:predicate' in _pJson[_iC];
        var _lCName = afy_without_qname(_pJson[_iC]['afy:objectID']);
        lPredicates[_lCName] = _pJson[_iC][_lIsClass ? 'afy:predicate' : 'afy:action'].replace(/\n/g, " ");
        if ('afy:onEnter' in _pJson[_iC])
          lRegisterTrigger(_lCName, 'onEnter', _pJson[_iC]['afy:onEnter']);
        if ('afy:onUpdate' in _pJson[_iC])
          lRegisterTrigger(_lCName, 'onUpdate', _pJson[_iC]['afy:onUpdate']);
        if ('afy:onLeave' in _pJson[_iC])
          lRegisterTrigger(_lCName, 'onLeave', _pJson[_iC]['afy:onLeave']);
      }

      var _lRes = new OrganicCodeRenderer(lDbg_explicitParseOnly).renderClasses(_pJson, lSymbolUsers);
      myLog("parsed " + _pJson.length + " classes in " + _lRes.elapsed + "ms (" + _lRes.statements.length + " statements)");
      lCodeChangeHandler.init(_lRes.code, _lRes.statements);
      // Note: all is parsed at this point... although not in the final form...
      lCM.setValue(_lRes.code);
    };
  var lOnPinClick =
    function(_pPID)
    {
      if (!('_handler' in constructor.prototype))
        constructor.prototype._handler = new pin_info_handler($("#editor_data_details"));
      constructor.prototype._handler(_pPID);
    }
  var lUpdateDataView =
    function(_pKey)
    {
      var _lUI = $("#editor_data_view");
      _lUI.empty();
      new QResultTable(_lUI, null/*lClassName*/, {onPinClick:lOnPinClick}, {showOtherProps:false, autoSelect:true}).populate("SELECT \"" + _pKey + "\" WHERE EXISTS(\"" + _pKey + "\");");
    };
  var lScopeMatchUsing = function() { return $("#editor_scope").val().match(/\s*using\s([a-zA-Z0-9\:\"\/_\.]+)\s*$/); }
  var lUpdateScope =
    function(_pForceAll, _pCompletion)
    {
      // TODO: find out if a simple syntax suffices, and/or if more UI is needed
      // TODO: some queries would be here rather than in the db, i.e. would leverage parsing
      AFY_CONTEXT.mEditingCtx.clearHighlightedSymbols();
      var _lClassQ = "SELECT * FROM \"http://localhost/afy/allCode\""; // FROM afy:Classes UNION SELECT * FROM afy:ClassOfTimers -- bug #363... TBR now that #363 is fixed...
      if (!_pForceAll)
      {
        var _lMatchUsing = lScopeMatchUsing();
        if (_lMatchUsing)
        {
          var _lKey = afy_without_qname(_lMatchUsing[1]);
          lUpdateDataView(_lKey);
          AFY_CONTEXT.mEditingCtx.highlightSymbol(_lKey, true);
          
          if (false)
          {
            var _lKeys = [];
            for (var _iK in lSymbolUsers)
              _lKeys.push(_iK);
            alert('searching for ' + _lKey + ' in {' + _lKeys.join(",") + '}');
          }
          
          var _lFound = false;
          {
            var _lCNs = [];
            for (var _iS in lSymbolUsers)
            {
              if (_iS.indexOf(_lKey) >= 0)
              {
                _lFound = true;
                for (var _iSu in lSymbolUsers[_iS].users)
                  _lCNs.push("'" + _iSu + "'");
              }
            }
          }
          if (_lFound)
            _lClassQ += " WHERE (afy:objectID IN {" + _lCNs.join(",") + "})";
          else
            { alert('unused symbol: ' + _lKey); return; }
        }
        else
        {
          var _lScopeStr = $("#editor_scope").val();
          var _lMatchPrefix = _lScopeStr.match(/\s*([a-zA-Z0-9_]+):\s*$/);
          if (_lMatchPrefix && _lMatchPrefix[1] in AFY_CONTEXT.mQnPrefix2Def)
            _lClassQ += " WHERE BEGINS(afy:objectID, '" + AFY_CONTEXT.mQnPrefix2Def[_lMatchPrefix[1]].value + "')";
          else if (_lScopeStr.match(/^\s*select/))
            _lClassQ = _lScopeStr;
          else if (_lScopeStr.match(/^http:\/\//))
            _lClassQ += " WHERE BEGINS(afy:objectID, '" + _lScopeStr + "')";
        }
      }
      myLog('new scope: ' + _lClassQ);
      afy_query(_lClassQ, new QResultHandler(function(__pJson) { lPopulate_classes(__pJson); if (undefined != _pCompletion) { _pCompletion(); } }, null, null), {keepalive:false});
    }
  var lUpdateScopeTimer = null;
  $("#editor_scope").change(
    function()
    {
      if (undefined != lUpdateScopeTimer)
        clearTimeout(lUpdateScopeTimer);
      lUpdateScopeTimer = setTimeout(lUpdateScope, 200);
    });
  $("#editor_parse").click(
    function()
    {
      var _lPdbg = new AfyParserInterface(lCM.getSelection())._toDbgStrings();
      alert("tokens: " + _lPdbg.tokens);
      alert(_lPdbg.errors);
      alert("parsed tree:\n" + _lPdbg.tree);
      alert("symbols:\n" + _lPdbg.symbols);
    });
  $("#editor_refactor").click(
    function()
    {
      // Review:
      //   It's debatable whether this function should operate globally (on
      //   all existing symbols, regardless of whether or not they are currently visible in the editor)
      //   or only on the current view... or whether that choice should be given to the user.
      //   For the time being, it will only operate on the current view.

      // Update the list of symbols that could be renamed.
      var _lPickListUI = $("#dlg_rs_pick_symbol");
      _lPickListUI.empty();
      var _lKeys = [];
      for (var _iK in lSymbolUsers)
        if (_iK.indexOf('http://affinityng.org') < 0 && _iK != "*")
          _lKeys.push(_iK);
      _lKeys.sort();
      _lKeys.forEach(function(_k) { _lPickListUI.append($("<option value='" + _k + "'>" + _k + "</option>")); });
      var _lMatchUsing = lScopeMatchUsing();
      if (_lMatchUsing)
        _lPickListUI.find('option[text="' + afy_without_qname(_lMatchUsing[1]) + '"]').attr('selected', 'selected');

      // Define the actual processing.
      var _lRename =
        function()
        {
          if ($("#dlg_rename_symbol").css("visibility") == "hidden")
            return;
          var __lOldName = afy_without_qname($("#dlg_rs_pick_symbol").val());
          var __lNewName = afy_without_qname($("#dlg_rs_new_name").val());
          _lCloseDlg();
          if (0 == __lNewName.length || __lNewName == __lOldName || __lNewName in lSymbolUsers)
            { alert('Invalid new name for symbol ' + __lOldName + ': ' + __lNewName); return; }

          // Refactor.
          var _lRefactoredCode = lCM.getValue();
          var _lPI = new AfyParserInterface(_lRefactoredCode);
          var _lSymbolsToReplace = [];
          _lPI.extractSymbolDetails().reverse().forEach(function(_s) { if (_s.name == afy_with_qname(__lOldName) && _s.startpos >= 0) _lSymbolsToReplace.push(_s); });
          if (!window.confirm('Are you sure you want to rename ' + __lOldName + ' to ' + __lNewName + '\n  (' + _lSymbolsToReplace.length + ' occurences in the code)?'))
            { return; }
          _lSymbolsToReplace.forEach(
            function(_s) { _lRefactoredCode = _lRefactoredCode.substr(0, _s.startpos) + afy_with_qname(__lNewName) + _lRefactoredCode.substr(_s.startpos + _s.name.length); });
          lCM.setValue(_lRefactoredCode);
          lCheckChanges(
            function()
            {
              // Also update the viewing scope, if relevant.
              var _lMatchUsing = lScopeMatchUsing();
              if (_lMatchUsing && afy_without_qname(_lMatchUsing[1]) == __lOldName)
                { $("#editor_scope").val("using " + afy_with_qname(__lNewName)); lUpdateScope(true, lUpdateScope); }
                
              // Refactor instances, if desired.
              // TODO:
              //   In the future it would be interesting to provide a more detailed assessment of existing
              //   instances (e.g. a breakdown by classes). There doesn't appear to be any simple way to do this
              //   at the moment ('membership' and 'is a' don't provide this, and there's no 'foreach' [iteration]
              //   to write this [say, as an invokable trigger]).
              var _lOnRenamed = function() { lUpdateDataView(__lNewName); }
              var _lOnInstanceCount =
                function(__pJson)
                {
                  var __lCnt = parseInt(__pJson);
                  if (0 == __lCnt || !window.confirm('Do you want to refactor all ' + __lCnt + ' instances as well?'))
                    return;
                  afy_query("UPDATE * RENAME \"" + __lOldName + "\"=\"" + __lNewName + "\" WHERE EXISTS(\"" + __lOldName + "\")", new QResultHandler(_lOnRenamed, null, null));
                };
              afy_query("SELECT * WHERE EXISTS(\"" + __lOldName + "\")", new QResultHandler(_lOnInstanceCount, null, null), {countonly:true});
            });
        };

      // Launch the dialog box.
      var _lCloseDlg = function() { $("#dlg_rename_symbol").css("visibility", "hidden"); };
      $("#dlg_rename_symbol").css("visibility", "visible");
      $("#dlg_rename_symbol").keyup(function(_e) { if (_e.which == 13) _lRename(); else if (_e.which == 27) _lCloseDlg(); });
      $("#dlg_rs_ok").click(_lRename);
      $("#dlg_rs_cancel").click(_lCloseDlg);
    });

  var lOnResize = function() { lCM.setSize($("#editor_bkg").width(), $("#editor_bkg").height()); }
  var lManageWindowEvents =
    function(_pOn)
    {
      var _lFunc = _pOn ? window.addEventListener : window.removeEventListener;
      _lFunc('resize', lOnResize, true);
    }
  lOnResize();

  var lTabRA = (top === self) ? $("#content") : window.parent.$("#tab-ruleassistant");
  lTabRA.bind(
    "activate_tab",
    function()
    {
      lThis.active = true;
      lManageWindowEvents(true);
      lCreateClass(
        "http://localhost/afy/preferredPrefixes", "CREATE CLASS \"http://localhost/afy/preferredPrefixes\" AS SELECT * WHERE EXISTS(\"http://localhost/afy/preferredPrefix/name\") AND EXISTS(\"http://localhost/afy/preferredPrefix/value\") AND EXISTS(\"http://localhost/afy/preferredPrefix/scope\")",
        function()
        {
          lCreateClass(
            "http://localhost/afy/allCode", "CREATE CLASS \"http://localhost/afy/allCode\" AS SELECT * WHERE (EXISTS(afy:predicate) OR EXISTS(afy:action));",
            function()
            {
              lSetupPreferredPrefixes(
                function()
                {
                  lUpdateScope(true);
                  setTimeout(function() { lCM.focus(); }, 500); // Review: without this, CodeMirror's internal 'focusInput' doesn't occur properly, after switching tabs - why?
                });
            });
        });
    });
  lTabRA.bind("deactivate_tab", function() { lManageWindowEvents(false); lThis.active = false; });
}

// TODO:
// - when the user manually renames something (not via 'refactor'), may want to warn him somehow of dependencies
// TODO:
// - needed refinements for progressive creation of new stuff (e.g. don't lose everything while incomplete... could autosave draft or something)
//   . periodic auto-save of unfinished/erroneous code (-> clear on commit; reload on refresh/pageload ?)
//   . need to deal with sorting order vs insertion point (user will not like to not retrieve his code at the "right" place)
//     - could auto-insert a comment before, telling that this will be moved between x and y at next refresh
//   . would be nice to show instances once the class exists
//   . may be nice to show instances for symbols participating to the class, while typing the class
