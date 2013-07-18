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
 * Ctx/Helpers.
 */
var SIMULCTX = new Object();
SIMULCTX.mToInstall = [];
SIMULCTX.mRadical = "sdw2";
SIMULCTX.mNs = "http://" + SIMULCTX.mRadical;
SIMULCTX.mPrefixes = ['world', 'simul', 'control', 'cep', 'meta', 'inst', 'test'];
SIMULCTX.mSetPrefixesStr = SIMULCTX.mPrefixes.map(function(_p) { return "SET PREFIX " + _p + ": '" + SIMULCTX.mNs + "/" +  _p + "';\n"; }).join("");
SIMULCTX.mClientId = (SIMULCTX.mRadical + new Date() + Math.random()).replace(/\s|\:|\-|\(|\)|\.|/g, "");
SIMULCTX.query = function(pSqlStr, pResultHandler, pOptions) { var lOptions = (undefined != pOptions ? pOptions : {}); if (!('countonly' in lOptions && lOptions.countonly)) { lOptions.longnames = true; } return afy_query(SIMULCTX.mSetPrefixesStr + pSqlStr, pResultHandler, lOptions); }
SIMULCTX.queryMulti = function(pSqlArray, pResultHandler, pOptions)
{
  var lOptions = (undefined != pOptions ? pOptions : {});
  lOptions.longnames = true;
  if (typeof(pSqlArray) == 'string') { pSqlArray = [pSqlArray]; }
  var lBatch = [SIMULCTX.mSetPrefixesStr];
  pSqlArray.filter(function(_p) { return _p.match(/^\s*$/) ? null : _p; }).forEach(function(_p) { lBatch.push(_p); });
  return afy_batch_query(lBatch, pResultHandler, lOptions);
}
SIMULCTX.singleInstall = function(pCriterion, pWhat)
{
  SIMULCTX.mToInstall.push({criterion:pCriterion, what:pWhat});
}
SIMULCTX.install = function(pCompletion)
{
  var lSS = new SIMULCTX.instrSeq();
  SIMULCTX.mToInstall.forEach(
    function(_pI)
    {
      lSS.push(
        function()
        {
          var _lDoProceed = function() { afy_post_query(SIMULCTX.mSetPrefixesStr + _pI.what, new QResultHandler(lSS.next, null, null)); }
          var _lOnCount = function(_pJson) { if (undefined == _pJson || parseInt(_pJson) == 0) { _lDoProceed(); } else { lSS.next(); } }
          afy_query(SIMULCTX.mSetPrefixesStr + _pI.criterion, new QResultHandler(_lOnCount, null, null), {countonly:true});
        });
    });
  lSS.push(pCompletion);
  lSS.start();
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











// goals: show a relevant program, obviously handling good amount of complexity in a related area
// goals: be able to show simple rules in their simple expression (conditions -> actions) (work in progress...)

// TODO:
// 1. start with the simple static part: appliances, houses, localities
//    - localities = +/- separate regions (e.g. 90415)
//    - could represent only the houses to begin (later can zoom in and show details like in older sdw)
// 2. add simple runtime: ctx, simple consumption, visualization
// 3. beef up consumption: control, better curves etc.
// 4. work on localities and equilibrium logic
// 5. work on visualization etc.
// 6. refine until effective/beautiful/works/... 

// in a nutshell:
// . a runtime/simulation ctx: time; time/x=days of simulation; anchor for samples
// . houses will have appliances + presence, alarm
// . each appliance will have a consumption model/fcurve
//   - maybe a notion of scheduling (e.g. 0<x<n times a day, duration of D, ...)
//     i.e. a daily decision in the simulation
// . some appliances will be marked as 'control', i.e. flexible+lasting consumption
// . control appliances will have additional logic
// . localities will maintain a balance of consumption for homes (separate control vs normal), and production
// . localities will have quotas also for control

// TODO: 1day= x minutes of simulation (i.e. control the acceleration)
// TODO: define overlays on zoom change, as an aggregation (could compute aggregate in affinity... store LatLng...)
// TODO: have 2 maps always synced in pos? (prod vs consump); or 2 modes...
// TODO: have more dispersed points on map (instead of very local), to begin
  // if scales very well, can always add more points by simulation, if not via google map (forced limitations)
// TODO: have at least 2 localities/cities (points in the grid that control offer&demand)

//       events come from appliances/homes - they drive (n.b. here I'll compute the localities' aggr in db, but in reality would come naturally)
//         but I don't have comm pins yet, so as a tmp workaround I'll push down those values periodically;
//         I can emulate comm pins right away, i.e. the logic just reads whatever is in those fake comm pins,
//         the only hack is that the center pushes to these pins

// . localities (LatLng range?, name, aggregates, ...)
// . homes (address, locality, LatLng, appliances, aggr state (prod/cons))
// . appliances (state, cons, type [ce/not], ...)
// . supplies (LatLng, state, power, ....)

// pros: it does solve something, i.e. shows how fine-grain control energy can be used
// pros: could also model some cost saving function (i.e. compare sum of better rates, vs avg rages)
// pros: if anything, another good bash on rules/pathexp etc.
// pros: start with something... better than twiddle thumbs...
// cons: arguably simplistic/naive (hard to know real/full complexity); effectiveness of visuals unsure (need to play with it) 
// decision: worth pursuing at this point; will see...
