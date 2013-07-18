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
c3dl.addModel("duck.dae");
c3dl.addModel("wolf.dae");
c3dl.addModel("cone.dae");
c3dl.addModel("grass.dae");
c3dl.addMainCallBack(robotEntryPoint, "viewer");

/**
 * Ctx/Helpers.
 */
var SIMULCTX = new Object();
SIMULCTX.m3dScene = null;
SIMULCTX.m3dRenderer = null;
SIMULCTX.mRadical = "robot";
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
  // Review:
  //   Bug #329.
  var lStep =
  [
    "START TRANSACTION;",
    // "UPDATE @instance SET simul:tmpprogress+=1 WHERE EXISTS(simul:tmpprogress);", // for testing purposes: turn regularly
    // "UPDATE @instance SET simul:\"moveable/direction/angle\"+=10 WHERE EXISTS(simul:tmpprogress) AND simul:tmpprogress%10=0;", // for testing purposes: turn regularly
    "UPDATE @instance ADD simul:_rad=@instance.simul:\"moveable/direction/angle\" * 3.141592654 / 180;",
    // "UPDATE @instance SET simul:\"moveable/direction/angle\"=0 WHERE simul:\"moveable/direction/angle\" >= 360;", // for testing purposes: turn regularly
    "UPDATE @instance SET simul:\"moveable/position/x\"+=(COS(@instance.simul:_rad) * @instance.simul:\"moveable/direction/speed\"), simul:\"moveable/position/z\"-=(SIN(@instance.simul:_rad) * @instance.simul:\"moveable/direction/speed\");",
    "UPDATE @instance DELETE simul:_rad;",
    "COMMIT;"
  ];
  var lAction_DuckTurn =
  [
    "${UPDATE @self SET simul:\"moveable/direction/angle\"=(@self.simul:prev_angle+20)%360 WHERE (simul:ts - CURRENT_TIMESTAMP <= INTERVAL '00:00:03')}",
    "${UPDATE @self DELETE simul:collision}"
  ];
  // TODO: after x seconds without event, reorient toward final goal
  // TODO: illustrate final goal with yet another model
  var lClassDecl =
  [
    "CREATE CLASS simul:moveables AS SELECT * WHERE EXISTS(simul:\"moveable/type\") SET simul:step='" + lStep.join("") + "';",
    "CREATE CLASS simul:ducks AS SELECT * FROM simul:moveables WHERE simul:\"moveable/type\"='duck';",
    "CREATE CLASS simul:wolves AS SELECT * FROM simul:moveables WHERE simul:\"moveable/type\"='wolf';",
    "CREATE CLASS simul:\"duck/turn\" AS SELECT * FROM simul:ducks WHERE EXISTS(simul:collision) SET afy:onEnter={" + lAction_DuckTurn.join(",") + "};",
  ];
  lClassDecl.reverse();
  var lProcess =
    function()
    {
      if (0 == lClassDecl.length) { if (undefined != pCompletion) { pCompletion(); } return; }
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
 * initLogicalScene
 */
function initLogicalScene(pCompletion)
{
  // Review:
  //   Due to limitations in selecting specific fields of VT_STRUCT via pathsql, in queries,
  //   I have decomposed the 'direction' and 'position' into separate properties.
  var lInsertObjects =
    function()
    {
      var _lSS = new SIMULCTX.instrSeq();

      // The duck.
      var _lQs = [];
      _lQs.push("INSERT simul:\"moveable/type\"='duck', simul:\"moveable/position/x\"=0.0, simul:\"moveable/position/z\"=0.0, simul:\"moveable/direction/angle\"=0, simul:\"moveable/direction/speed\"=2.5, simul:tmpprogress=0;");
      _lSS.push(function() { SIMULCTX.queryMulti(_lQs, new QResultHandler(_lSS.next, null, null)); });

      // The wolves.
      var _dst = 150.0;
      var _lWolvesBatches = //[null, null, null, null, null, null];
      [
        [{x:-2*_dst, z:-2*_dst}, {x:-_dst, z:-2*_dst}, {x:0.0, z:-2*_dst}, {x:_dst, z:-2*_dst}, {x:2*_dst, z:-2*_dst}],
        [{x:-2*_dst, z:-_dst}, {x:-_dst, z:-_dst}, {x:0.0, z:-_dst}, {x:_dst, z:-_dst}, {x:2*_dst, z:-_dst}],
        [{x:-2*_dst, z:0.0}, {x:-_dst, z:0.0}, {x:_dst, z:0.0}, {x:2*_dst, z:0.0}],
        [{x:-2*_dst, z:_dst}, {x:-_dst, z:_dst}, {x:0.0, z:_dst}, {x:_dst, z:_dst}, {x:2*_dst, z:_dst}],
        [{x:-2*_dst, z:2*_dst}, {x:-_dst, z:2*_dst}, {x:0.0, z:2*_dst}, {x:_dst, z:2*_dst}, {x:2*_dst, z:2*_dst}]
      ];
      var _lWolvesMobile = true;
      for (var _iWb = 0; _iWb < _lWolvesBatches.length; _iWb++)
      {
        _lSS.push(
          function(_pWb)
          {
            return function()
            {
              var __lQws = [];
              if (undefined == _lWolvesBatches[_pWb])
              {
                // random selection...
                for (var _iI = 0; _iI < 4; _iI++)
                {
                  var _lX = (Math.random() - 0.5) * 800.0;
                  var _lZ = (Math.random() - 0.5) * 800.0;
                  if (_lX >= -100.0 && _lX <= 100.0 && _lZ >= -100.0 && _lZ < 100.0) _lZ += 200.0;
                  __lQws.push("INSERT simul:\"moveable/type\"='wolf', simul:\"moveable/position/x\"=" + _lX + ", simul:\"moveable/position/z\"=" + _lZ + ", simul:\"moveable/direction/angle\"=" + (Math.floor(Math.random() * 36.0) * 10.0) + ", simul:\"moveable/direction/speed\"=" + ((_lWolvesMobile && Math.random() > 0.9) ? 0.75 : 0.0) + ", simul:tmpprogress=0;");
                }
              }
              else
              {
                // specified selection...
                for (var _iI = 0; _iI < _lWolvesBatches[_pWb].length; _iI++)
                {
                  var _lWdef = _lWolvesBatches[_pWb][_iI];
                  __lQws.push("INSERT simul:\"moveable/type\"='wolf', simul:\"moveable/position/x\"=" + _lWdef.x + ", simul:\"moveable/position/z\"=" + _lWdef.z + ", simul:\"moveable/direction/angle\"=270.0, simul:\"moveable/direction/speed\"=" + ((_lWolvesMobile && Math.random() > 0.9) ? 1.0 : 0.0) + ", simul:tmpprogress=0;");
                }
              }
              SIMULCTX.queryMulti(__lQws, new QResultHandler(_lSS.next, null, null));
            }
          }(_iWb));
      }

      // Go.
      _lSS.push(pCompletion);
      _lSS.start();
    }
  var lCheckAlreadyThere = function() { SIMULCTX.query("SELECT * FROM simul:moveables;", new QResultHandler(function(_pJson) { if (undefined == _pJson || parseInt(_pJson) == 0) lInsertObjects(); else pCompletion(); }, null, null), {countonly:true}); }
  SIMULCTX.createClasses(lCheckAlreadyThere);
}

/**
 * robotEntryPoint
 */
function robotEntryPoint(pCanvasId)
{
  var lPause = false;
  var lModels = {}, lWolves = [], lCameras = {};
  var lCollCones = {};
  var lStepFunction = null;

  // Initializations related to the web page as a whole.
  var lCanvas = $("#" + pCanvasId);
  var lUpdateCanvasSize = function() { lCanvas.attr("width", lCanvas.width()); lCanvas.attr("height", lCanvas.height()); }
  lUpdateCanvasSize();

  // The frame update entry-point.
  var lClampRad = function(pAngleRad) { var _p = 2 * Math.PI; while (pAngleRad < 0) pAngleRad += _p; while (pAngleRad > _p) pAngleRad -= _p; return pAngleRad; }
  var lMoveDuckCamera =
    function(pX, pZ, pAngleRad)
    {
      lCameras.topmoving.setPosition([pX, 225.0, pZ - 600]);
      lCameras.topmoving.setLookAtPoint([pX, 0.0, pZ]);
      lCameras.topmoving.setUpVector([0.0, 0.0, 1.0]);
    }
  var lLastRefreshed = -1;
  var lMoveMoveables =
    function(pMoveables, pCnt, pCompletion)
    {
      // Prevent non-linear progression due to out-of-order async http responses.
      if (pCnt < lLastRefreshed)
          return;

      var _lQs = [];
      for (var _i = 0; _i < pMoveables.length; _i++)
      {
        if (pMoveables[_i][SIMULCTX.mNs + '/moveable/direction/speed'] == 0.0)
          continue;
        var _lSf = lStepFunction.replace(/\@instance/g, "@" + pMoveables[_i]['id']);
        _lQs.push(_lSf);
      }

      // Execute the step function.
      var _lHandleMoveResults =
        function(_pJson, _pCnt)
        {
          // Prevent non-linear progression due to out-of-order async http responses.
          if (_pCnt < lLastRefreshed)
            return;
          lLastRefreshed = _pCnt;

          // Process the result, mainly by moving the corresponding 3d models accordingly.
          var _lProcessed = {};
          var _lCone = null;
          var _lConeAdeg = 0;
          for (var _iM = 0; _iM < _pJson.length; _iM++)
          {
            var _lM = _pJson[_iM][0];
            if (undefined == _lM || !('id' in _lM)) continue;
            var _lPid = trimPID(_lM.id);
            if (_lPid in _lProcessed) continue;
            if (!(_lPid in lModels)) continue;
            var _lMd = lModels[_lPid];
            _lProcessed[_lPid] = _lPid;

            var _lPos = [_lM[SIMULCTX.mNs + '/moveable/position/x'], 0.0, _lM[SIMULCTX.mNs + '/moveable/position/z']];
            _lMd.setPosition(_lPos);

            var _lAdeg = _lM[SIMULCTX.mNs + '/moveable/direction/angle'];
            var _lArad = lClampRad(Math.PI * (_lAdeg / 180.0));
            var _lType = _lM[SIMULCTX.mNs + '/moveable/type'];
            if (_lType == 'duck')
            {
              var _lVd = _lMd.getDirection();
              var _lOldA = lClampRad((_lVd[2] != 0 ? (Math.atan(_lVd[0] / _lVd[2]) + (_lVd[2] < 0 ? Math.PI : 0)) : (_lVd[0] > 0 ? 0.5 : 1.5) * Math.PI));
              var _lDiffA = _lArad - _lOldA;
              if (Math.abs(_lDiffA) > 0.00001)
                _lMd.yaw(_lDiffA);

              lMoveDuckCamera(_lPos[0], _lPos[2], _lArad);
              _lConeAdeg = _lAdeg;

              if (_lPid in lCollCones)
              {
                _lCone = lCollCones[_lPid];
                _lCone.setPosition([_lPos[0], 10.0, _lPos[2]]);
                if (Math.abs(_lDiffA) > 0.00001)
                  _lCone.roll(-_lDiffA);
              }
            }
          }

          // Evaluate duck(cone)-wolf collisions.
          var _lCollDetect = new c3dl.CollisionDetection();
          for (var _iW = 0; _iW < lWolves.length; _iW++)
          {
            if (_lCollDetect.checkObjectCollision(_lCone, lWolves[_iW], 0.1/*review*/, "Collada"))
            {
              SIMULCTX.query("UPDATE @" + _lCone.pid + " SET simul:collision=@" + lWolves[_iW].pid + ", simul:ts=CURRENT_TIMESTAMP, simul:prev_angle=" + _lConeAdeg, new QResultHandler(function() {}, null, null));
              break;
            }
          }

          pCompletion(pMoveables); 
        }
      SIMULCTX.queryMulti(_lQs, new QResultHandler(function(_pCntLcl) { return function(_pJson) { _lHandleMoveResults(_pJson, _pCntLcl); } }(pCnt),  null, null));
    }
  var lRefresh =
    function(pCnt, pForced)
    {
      if (lPause && pForced != true) return;
      var _lOnMoveables = function(_pJson) { lMoveMoveables(_pJson, pCnt, function() {}); }
      SIMULCTX.query("SELECT * FROM simul:moveables;", new QResultHandler(_lOnMoveables, null, null));
    }

  // Initialization of the 3d scene.
  var lInit3d =
    function(pCompletion)
    {
      // Initializations related to the 3d canvas.
      // Note:
      //   c3dl's scene's collision detection mechanism (setCollision, getCollision)
      //   appears to be too coarse for my case (can't distinguish wolf-wolf from wolf-duck
      //   collisions), therefore I don't use it directly.
      // Note:
      //   At the moment c3dl doesn't offer any shadow mapping/casting services.
      //   There are other similar frameworks that do, however, such as ThreeJS.
      //   When I started this demo I had not noticed ThreeJS, but in future demos
      //   I might switch to that or another js framework.
      //   See also: http://stackoverflow.com/questions/6762726/scenejs-vs-three-js-vs-others.
      SIMULCTX.m3dScene = new c3dl.Scene();
      SIMULCTX.m3dScene.setCanvasTag(pCanvasId);
      SIMULCTX.m3dRenderer = new c3dl.WebGL();
      SIMULCTX.m3dRenderer.setLighting(true);
      SIMULCTX.m3dRenderer.createRenderer(this);
      SIMULCTX.m3dScene.setRenderer(SIMULCTX.m3dRenderer);
      SIMULCTX.m3dScene.init(pCanvasId);
      SIMULCTX.m3dScene.setBackgroundColor([0.125, 0.527, 0.773, 1.0]);
      if (SIMULCTX.m3dRenderer.isReady())
      {
        // Define the cameras.
        lCameras.fixed = new c3dl.FreeCamera();
        lCameras.fixed.setPosition([0.0, 300.0, -1000.0]);
        lCameras.fixed.setLookAtPoint([0.0, 0.0, 0.0]);
        lCameras.top = new c3dl.FreeCamera();
        lCameras.top.setPosition([1.0, 1200.0, 1.0]);
        lCameras.top.setLookAtPoint([0.0, 0.0, 0.0]);
        lCameras.top.setUpVector([0.0, 0.0, 1.0]);
        lCameras.topmoving = new c3dl.FreeCamera();
        lCameras.topmoving.setPosition([0.0, 100.0, -600]);
        lCameras.topmoving.setLookAtPoint([0.0, 0.0, 0.0]);
        lCameras.topmoving.setUpVector([0.0, 0.0, 1.0]);
        SIMULCTX.m3dScene.setCamera(lCameras.topmoving);

        // Create a sun, to have some basic lighting movement.
        var _lLightSun = new c3dl.PositionalLight();
        _lLightSun.setPosition([10000.0, 500.0, 10000.0]);
        _lLightSun.setDiffuse([0.3, 0.7, 0.7, 1]);
        _lLightSun.setOn(true);
        SIMULCTX.m3dScene.setAmbientLight([0.3, 0.3, 0.3, 0.3]);
        SIMULCTX.m3dScene.addLight(_lLightSun);

        // Start the empty 3d scene.
        SIMULCTX.m3dScene.startScene();

        // Add some grass.
        var _lGrass = new c3dl.Collada();
        _lGrass.init("grass.dae");
        _lGrass.setPosition([0.0, -10.0 /*just to not truncate the cone*/, 0.0]);
        _lGrass.scale([10.0, 1.0, 10.0]);
        _lGrass.setVisible(true);
        SIMULCTX.m3dScene.addObjectToScene(_lGrass);

        // Query the moveable objects and create their 3d counterpart.
        var _lOnMoveables =
          function(_pJson)
          {
            for (var _iM = 0; _iM < _pJson.length; _iM++)
            {
              var _lM = new c3dl.Collada();
              var _lPid = trimPID(_pJson[_iM].id);
              _lM.pid = _lPid;
              var _lPosX = _pJson[_iM][SIMULCTX.mNs + '/moveable/position/x'];
              var _lPosZ = _pJson[_iM][SIMULCTX.mNs + '/moveable/position/z'];
              var _lType = _pJson[_iM][SIMULCTX.mNs + '/moveable/type'];
              _lM.init(_lType == 'duck' ? "duck.dae" : "wolf.dae");
              if (_lType == 'duck')
              {
                _lM.scale([0.25, 0.25, 0.25]);
                var _lA = lClampRad(Math.PI * (_pJson[_iM][SIMULCTX.mNs + '/moveable/direction/angle'] / 180.0));
                _lM.yaw(_lA);

                var _lMc = new c3dl.Collada();
                _lMc.pid = _lPid;
                _lMc.init("cone.dae");
                _lMc.scale([20.0, 20.0, 20.0]);
                _lMc.setPosition([_lPosX, 10.0, _lPosZ]);
                _lMc.pitch(Math.PI * 0.5);
                _lMc.roll(-_lA + 0.5 * Math.PI); // Note: roll, not yaw, because the cone was pitched...
                _lMc.setVisible($("#cone_visibility").is(":checked"));
                SIMULCTX.m3dScene.addObjectToScene(_lMc);
                lCollCones[_lPid] = _lMc;

                lMoveDuckCamera(_lPosX, _lPosZ, _lA);
              }
              else
              {
                lWolves.push(_lM);
              }

              _lM.setPosition([_lPosX, 0.0, _lPosZ]);
              SIMULCTX.m3dScene.addObjectToScene(_lM);
              lModels[_lPid] = _lM;
            }
            pCompletion();
          }
        SIMULCTX.query("SELECT * FROM simul:moveables;", new QResultHandler(_lOnMoveables, null, null));
      }
      else
        alert("WARNING: Failed to initialize the 3d rendering context; this browser may not support webgl.");
    }

  // Initializations related to the logic (pathsql stuff).
  var lRefreshCnt = 0;
  var lGo = function() { lInit3d(function() { setInterval(function() { lRefresh(lRefreshCnt++); }, 100); }); }
  var lGrabClassFunction = 
    function(_pClass, _pFunc, _pCompletion)
    {
      var _lGrab = function(_pJson) { _pCompletion(_pJson[0][SIMULCTX.mNs + "/" + _pFunc]); }
      SIMULCTX.query("SELECT simul:" + _pFunc + " FROM afy:Classes WHERE CONTAINS(afy:objectID, '" + SIMULCTX.mNs + "/" + _pClass + "');", new QResultHandler(_lGrab, null, null));
    }
  var lGrabStepFunction = function(_pCompletion) { lGrabClassFunction('moveables', 'step', function(__pF) { lStepFunction = __pF; _pCompletion(); }); }
  window.addEventListener(
    'keydown',
    function(e)
    {
      var _lQs = [];
      if (e.which == 80) { lPause = !lPause; $("#mini_console").css("display", lPause ? "block" : "none"); }
      else if (e.which == 39)
      {
        // REVIEW: use CASE...WHEN instead, when available... (or even better: trigonometric functions)
        _lQs.push("UPDATE simul:ducks SET simul:\"moveable/direction/angle\"=(simul:\"moveable/direction/angle\"-20)%360 WHERE (simul:\"moveable/direction/angle\" > 0);");
        _lQs.push("UPDATE simul:ducks SET simul:\"moveable/direction/angle\"=340 WHERE (simul:\"moveable/direction/angle\" = 0);");
      }
      else if (e.which == 37)
        _lQs.push("UPDATE simul:ducks SET simul:\"moveable/direction/angle\"=(simul:\"moveable/direction/angle\"+20)%360;");
      if (_lQs.length > 0)
        SIMULCTX.queryMulti(_lQs, new QResultHandler(function() {}, null, null));
    });
  $("#logo").click(function() { window.location.href = 'http://' + location.hostname + ":" + location.port + "/console.html#tab-basic"; });
  $("#camera_top").click(function() { SIMULCTX.m3dScene.setCamera(lCameras.top); });
  $("#camera_topmoving").click(function() { SIMULCTX.m3dScene.setCamera(lCameras.topmoving); });
  $("#camera_fixed").click(function() { SIMULCTX.m3dScene.setCamera(lCameras.fixed); });
  $("#cone_visibility").click(function() { var _lChecked = $(this).is(":checked"); for (_iC in lCollCones) lCollCones[_iC].setVisible(_lChecked); });
  $("#manual_step_button").click(function() { SIMULCTX.query($("#manual_step").text(), new QResultHandler(function(_pRes) { $("#manual_step_result").text(myStringify(_pRes)); lRefresh(lRefreshCnt++, true); }), null, null); });
  initLogicalScene(function() { lGrabStepFunction(lGo); })
}

// TODO:
// . add a mode with a fixed destination (logic, visual cue etc.): workaround the wolves, but always correct to arrive
// . add more sophisticated rules (e.g. avoid wolf coming from behind/side)
// . cosmetic: better cameras etc.
