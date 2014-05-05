/*
Copyright (c) 2004-2014 GoPivotal, Inc. All Rights Reserved.

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
c3dl.addModel("quad.dae");
c3dl.addModel("grass.dae");
c3dl.addMainCallBack(imuEntryPoint, "viewer");

/**
 * Ctx/Helpers.
 */
var SIMULCTX = new Object();
SIMULCTX.m3dScene = null;
SIMULCTX.m3dRenderer = null;
SIMULCTX.mRadical = "imu";
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
	var lClassDecl =
	[
		"CREATE CLASS simul:moveables AS SELECT * WHERE EXISTS(simul:\"moveable/type\");",
	];
	lClassDecl.reverse();
	var lProcess =
		function()
		{
			if (0 == lClassDecl.length) { if (undefined != pCompletion) { pCompletion(); } return; }
			SIMULCTX.createClass(lClassDecl.pop(), lProcess);
		};
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
	var lInsertObjects =
		function()
		{
			var _lSS = new SIMULCTX.instrSeq();

			// TODO: decide how we want to handle uint8_t -> int8_t... these are not VT_types... could add them as such... or could signify to the service somehow how it should do this... or could have special operators / UDF... in any case, I'm still stuck with this voodoo in the $() for the time being.
				// _lQs1.push("INSERT afy:objectID='acceleration', afy:service={.srv:BLE}, afy:address='" + _lDeviceAddr + "', BLE:\"characteristic/write\"='f000aa12-0451-4000-b000-000000000000', BLE:\"characteristic/read\"='f000aa11-0451-4000-b000-000000000000', BLE:\"characteristic/purpose\"='accelerometer', BLE:\"characteristic/evaluator\"={x=$(CAST(:0 AS INT)/64.0), y=$(CAST(:1 AS INT)/64.0), z=$(CAST(:2 AS INT)/-64.0)}; -- in g");

			// The moveable objects.
			var _lQs1 = [], _lQs2 = [];
			var _lDeviceAddr = "8AD608B8-3C38-4B34-B53C-352AA679FB1E"; // "687A5860-B3E1-4911-A815-1DA60129DB8E"; // "47E70978-EECF-48C5-88C8-883B83A53D96"; // Michael's: 687A5860-B3E1-4911-A815-1DA60129DB8E; mine: 47E70978-EECF-48C5-88C8-883B83A53D96.
			_lQs1.push("INSERT simul:\"moveable/type\"='duck', simul:\"moveable/angle/x\"=0.0, simul:\"moveable/angle/y\"=0.0, simul:\"moveable/angle/z\"=0;");
			_lQs1.push("INSERT afy:objectID=.srv:BLE, afy:load='BLE';");
			_lQs1.push("INSERT afy:objectID='acceleration', afy:service={.srv:BLE}, afy:address='" + _lDeviceAddr + "', BLE:\"characteristic/write\"='f000aa12-0451-4000-b000-000000000000', BLE:\"characteristic/read\"='f000aa11-0451-4000-b000-000000000000', BLE:\"characteristic/purpose\"='accelerometer', BLE:\"characteristic/evaluator\"={x=$((:0 - 256*(:0 & 128)/128)/64.0), y=$((:1 - 256*(:1 & 128)/128)/64.0), z=$((:2 - 256*(:2 & 128)/128)/-64.0)}; -- in g");
			_lQs1.push("INSERT afy:objectID='acceleration_period', afy:service={.srv:BLE}, afy:address='" + _lDeviceAddr + "', BLE:\"characteristic/write\"='f000aa13-0451-4000-b000-000000000000', BLE:\"characteristic/read\"='f000aa11-0451-4000-b000-000000000000', BLE:\"characteristic/purpose\"='accelerometer_period';");
			_lQs1.push("INSERT afy:objectID='compass', afy:service={.srv:BLE}, afy:address='" + _lDeviceAddr + "', BLE:\"characteristic/write\"='f000aa32-0451-4000-b000-000000000000', BLE:\"characteristic/read\"='f000aa31-0451-4000-b000-000000000000', BLE:\"characteristic/purpose\"='compass', BLE:\"characteristic/evaluator\"={x=$(((:1<<8 | :0) - 65536*(:1&128)/128) * -0.030517578125 * 0.000001),y=$(((:3<<8 | :2) - 65536*(:3&128)/128) * -0.030517578125 * 0.000001),z=$(((:5<<8 | :4) - 65536*(:5&128)/128) * 0.030517578125 * 0.000001)};");//{x=$((((:1 - 256*(:1 & 128)/128)<<8) | :0) * -0.030517578125 * 0.000001), y=$((((:3 - 256*(:3 & 128)/128)<<8) | :2) * -0.030517578125 * 0.000001), z=$((((:5 - 256*(:5 & 128)/128)<<8) | :4) * 0.030517578125 * 0.000001)}, BLE:\"characteristic/units\"=0T;");
			_lQs1.push("INSERT afy:objectID='compass_period', afy:service={.srv:BLE}, afy:address='" + _lDeviceAddr + "', BLE:\"characteristic/write\"='f000aa33-0451-4000-b000-000000000000', BLE:\"characteristic/read\"='f000aa31-0451-4000-b000-000000000000', BLE:\"characteristic/purpose\"='compass_period';");
			_lQs1.push("INSERT afy:objectID='gyro', afy:service={.srv:BLE}, afy:address='" + _lDeviceAddr + "', BLE:\"characteristic/write\"='f000aa52-0451-4000-b000-000000000000', BLE:\"characteristic/read\"='f000aa51-0451-4000-b000-000000000000', BLE:\"characteristic/purpose\"='gyro', BLE:\"characteristic/evaluator\"={x=$((:3<<8 | :2) * 0.00762939453125), y=$((:1<<8 | :0) * -0.00762939453125), z=$((:5<<8 | :4) * 0.00762939453125)}; -- in deg/S");
      _lQs1.push("INSERT afy:objectID='distance', afy:service={.srv:BLE}, afy:address='" + _lDeviceAddr + "', BLE:purpose=BLEPURPOSES#DISTANCE_CONNECTED;");
			_lQs1.push("SELECT * FROM #acceleration;");
			_lQs1.push("SELECT * FROM #compass;");
			_lQs2.push("UPDATE #acceleration SET afy:content=1;");
			_lQs2.push("UPDATE #acceleration_period SET afy:content=10;"); // update readings every 100ms (as opposed to default: 1s)
			_lQs2.push("UPDATE #compass SET afy:content=1;");
			_lQs2.push("UPDATE #compass_period SET afy:content=10;"); // update readings every 100ms (as opposed to default: 1s)
			_lQs2.push("UPDATE #gyro SET afy:content=7;");
			_lSS.push(function() { SIMULCTX.queryMulti(_lQs1, new QResultHandler(_lSS.next, null, null)); });
			_lSS.push(function() { setTimeout(_lSS.next, 2000); }); // Review...
			_lSS.push(function() { SIMULCTX.queryMulti(_lQs2, new QResultHandler(_lSS.next, null, null)); });

			// Go.
			_lSS.push(pCompletion);
			_lSS.start();
		};
	var lCheckAlreadyThere = function() { SIMULCTX.query("SELECT * FROM simul:moveables;", new QResultHandler(function(_pJson) { if (undefined == _pJson || parseInt(_pJson) == 0) lInsertObjects(); else pCompletion(); }, null, null), {countonly:true}); };
	SIMULCTX.createClasses(lCheckAlreadyThere);
}

/**
 * imuEntryPoint
 */
function imuEntryPoint(pCanvasId)
{
	var lPause = false;
	var lModels = {}, lCameras = {}, lMarkers = {};
	var lTestIterator = 0;
	var _lThePid; // TODO: review
	var lRegisterMarker =
		function(pMarker, pIndex)
		{
			pMarker.setVisible(false);
			switch (pIndex)
			{
				case 0: lMarkers.center = pMarker; pMarker.setColor([0, 0, 0]); break;
				case 1: lMarkers.x_axis = pMarker; pMarker.setColor([255, 0, 0]); pMarker.setPosition([20, 0, 0]); break;
				case 2: lMarkers.y_axis = pMarker; pMarker.setColor([0, 255, 0]); pMarker.setPosition([0, 20, 0]); break;
				case 3: lMarkers.z_axis = pMarker; pMarker.setColor([0, 0, 255]); pMarker.setPosition([0, 0, 20]); break;
				case 4: lMarkers.compass = pMarker; pMarker.setColor([255, 255, 0]); pMarker.setPosition([0, 0, 0]); break;
				default: break;
			}
		};
	var lSetMarkersVisibility = function(pVisible) { for (var iM in lMarkers) { lMarkers[iM].setVisible(pVisible); } };

	// Initializations related to the web page as a whole.
	var lCanvas = $("#" + pCanvasId);
	var lUpdateCanvasSize = function() { lCanvas.attr("width", lCanvas.width()); lCanvas.attr("height", lCanvas.height()); }
	lUpdateCanvasSize();

	// The frame update entry-point.
	var lLastRefreshed = -1;
	var lMoveMoveables =
		function(pAcc, pCompass, pDistance, pCnt, pCompletion)
		{
			// Prevent non-linear progression due to out-of-order async http responses.
			if (pCnt < lLastRefreshed)
					return;

			// Note: at R={0,0,0}, the duck points toward x=-1.
			// Note about coordinate systems:
			//   C3DL has x to the right, y to the top and z toward us, whereas
			//   TI with button pointing toward us has x to the right, z to the top and y toward us.
			var _lAx = 0;
			var _lAy = 0;
			var _lAz = 0;
			if (pAcc)
			{
				var _lRa = Math.sqrt(Math.pow(pAcc[0].x, 2) + Math.pow(pAcc[0].y, 2) + Math.pow(pAcc[0].z, 2));
				_lAx = 2 * Math.atan2(-pAcc[0].x, _lRa); // Review: why "2*"?
				_lAz = 2 * Math.atan2(pAcc[0].y, _lRa);
				// Note: yaw (_lAy, i.e. rotation around the vertical axis) cannot be determined with accelerometer alone.
			}
			if (pCompass)
			{
				// Visualize the raw data.
				lMarkers.compass.setPosition([1000000*pCompass[0].x, 1000000*pCompass[0].y, 1000000*pCompass[0].z]);
				if (true)
				{
					// Basic yaw (assuming horizontal device).
					// See also:
					//   http://www51.honeywell.com/aero/common/documents/myaerospacecatalog-documents/Defense_Brochures-documents/Magnetic__Literature_Application_notes-documents/AN203_Compass_Heading_Using_Magnetometers.pdf
					_lAy = Math.atan2(pCompass[0].x, pCompass[0].y);
					if (pCompass[0].y > 0)
						_lAy -= Math.PI * 0.5;
					else
						_lAy = 3 * Math.PI * 0.5 - _lAy;
				}
				else
				{
					// Tilt compensation.
					// See also:
					//   http://freescale.com.hk/files/sensors/doc/app_note/AN4248.pdf
					//   https://sites.google.com/site/myimuestimationexperience/sensors/magnetometer
					if (false)
					{
						// Quick-test the compensation code below, with idealized values.
						lTestIterator += Math.PI/40; if (lTestIterator > Math.PI) lTestIterator = 0;
						pCompass[0].z = 0; pCompass[0].x = Math.cos(lTestIterator); pCompass[0].y = Math.sin(lTestIterator);
					}
					_lAy = Math.atan2(pCompass[0].z*Math.sin(_lAx) - pCompass[0].y*Math.cos(_lAx), pCompass[0].x*Math.cos(_lAz) + pCompass[0].y*Math.sin(_lAz)*Math.sin(_lAx) + pCompass[0].z*Math.sin(_lAz)*Math.cos(_lAx)); 
				}
			}
			if (pDistance)
				lMarkers.center.setPosition([2*pDistance[0]['http://affinityng.org/service/BLE/value'], 0, 0]);
			if (isNaN(_lAx) || isNaN(_lAy) || isNaN(_lAz))
				return;

			// Display tracing/debugging info.
			$("#info1").text("accelerometer:[" + (pAcc ? (Math.ceil(pAcc[0].x * 10)/10 + ", " + Math.ceil(pAcc[0].y * 10)/10 + ", " + Math.ceil(pAcc[0].z * 10)/10) : "nil") + "]");
			$("#info2").text("compass:[" + (pCompass ? (pCompass[0].x.toExponential() + ", " + pCompass[0].y.toExponential() + ", " + pCompass[0].z.toExponential()) : "nil") + "]");
			$("#info3").text("distance:[" + (pDistance ? pDistance[0]['http://affinityng.org/service/BLE/value'] : "nil") + "]");
			$("#info4").text("rotation:[" + Math.ceil(180.0 * _lAx/ Math.PI) + ", " + Math.ceil(180.0 * _lAy / Math.PI) + ", " + Math.ceil(180.0 * _lAz / Math.PI) + "]");

			// Set the resulting transformation matrix on the model.
			var _lT = [Math.cos(_lAy)*Math.cos(_lAz), Math.cos(_lAz)*Math.sin(_lAx)*Math.sin(_lAy)-Math.cos(_lAx)*Math.sin(_lAz), Math.cos(_lAx)*Math.cos(_lAz)*Math.sin(_lAy)+Math.sin(_lAx)*Math.sin(_lAz), 0,
				Math.cos(_lAy)*Math.sin(_lAz), Math.cos(_lAz)*Math.cos(_lAz)+Math.sin(_lAx)*Math.sin(_lAy)*Math.sin(_lAz), -Math.cos(_lAz)*Math.sin(_lAx)+Math.cos(_lAx)*Math.sin(_lAy)*Math.sin(_lAz), 0,
				-Math.sin(_lAy), Math.cos(_lAy)*Math.sin(_lAx), Math.cos(_lAx)*Math.cos(_lAy), 0,
				0, 0, 0, 1];
			lModels[_lThePid].getSceneGraph().setTransform(_lT);
		};
	var lRefresh =
		function(pCnt, pForced)
		{
			if (lPause && pForced != true) return;
			var _lUsedSensors = {accelerometer:$("#use_accelerometer").is(":checked"), compass:$("#use_compass").is(":checked"), distance:$("#use_distance").is(":checked")};
			var _lOnReady = function(_pJsonAcc, _pJsonCompass, _pJsonDistance) { lMoveMoveables(_pJsonAcc, _pJsonCompass, _pJsonDistance, pCnt, function() {}); }
			var _lOnCompass =
				function(_pJsonAcc, _pJsonCompass)
				{
					// Pull distance reading.
					if (_lUsedSensors.distance)
						SIMULCTX.query("SELECT * FROM #distance;", new QResultHandler(function(_pJsonDistance){_lOnReady(_pJsonAcc, _pJsonCompass, _pJsonDistance); }, null, null));
					else
						_lOnReady(_pJsonAcc, _pJsonCompass, null);
				};
			var _lOnAcc =
				function(_pJsonAcc)
				{
					// Pull compass reading.
					if (_lUsedSensors.compass)
						SIMULCTX.query("SELECT * FROM #compass;", new QResultHandler(function(_pJsonCompass){_lOnCompass(_pJsonAcc, _pJsonCompass); }, null, null));
					else
						_lOnCompass(_pJsonAcc, null);
				};
			// Pull accelerometer reading.
			// Note: For the time being it's impossible to control the projection, or join those results, so I pull in sequence.
			if (_lUsedSensors.accelerometer)
				SIMULCTX.query("SELECT * FROM #acceleration;", new QResultHandler(_lOnAcc, null, null));
			else
				_lOnAcc(null);
		};

	// Initialization of the 3d scene.
	var lInit3d =
		function(pCompletion)
		{
			// Initializations related to the 3d canvas.
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
				lCameras.fixed.setPosition([100.0, 20.0, -400.0]);
				lCameras.fixed.setLookAtPoint([0.0, 0.0, 0.0]);
				lCameras.top = new c3dl.FreeCamera();
				lCameras.top.setPosition([0.0, 400.0, 0.0]);
				lCameras.top.setLookAtPoint([0.0, 0.0, 0.0]);
				lCameras.top.setUpVector([0.0, 0.0, 1.0]);
        SIMULCTX.m3dScene.setCamera(lCameras.fixed);

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
				_lGrass.setPosition([0.0, -75.0 /* slightly below the duck */, 0.0]);
				_lGrass.scale([10.0, 1.0, 10.0]);
				_lGrass.setVisible(true);
				SIMULCTX.m3dScene.addObjectToScene(_lGrass);

				// Add some visible markers.
				for (var _iM = 0; _iM < 5; _iM++)
				{
					var _lMarker = new c3dl.Point();
					lRegisterMarker(_lMarker, _iM);
					SIMULCTX.m3dScene.addObjectToScene(_lMarker);
				}

				// Query the moveable objects and create their 3d counterpart.
				var _lOnMoveables =
					function(_pJson)
					{
						for (var _iM = 0; _iM < _pJson.length; _iM++)
						{
							var _lM = new c3dl.Collada();
							var _lPid = trimPID(_pJson[_iM].id);
							_lThePid = _lPid;
							_lM.pid = _lPid;
							var _lPosX = 0.0; //_pJson[_iM][SIMULCTX.mNs + '/moveable/position/x'];
							var _lPosZ = 0.0; //_pJson[_iM][SIMULCTX.mNs + '/moveable/position/z'];
							_lM.init("quad.dae");
							_lM.scale([10, 10, 10]);

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
		};

	// Initializations related to the logic (pathsql stuff).
	var lRefreshCnt = 0;
	var lGo = function() { lInit3d(function() { setInterval(function() { lRefresh(lRefreshCnt++); }, 100); }); };
	window.addEventListener(
		'keydown',
		function(e)
		{
			var _lQs = [];
			if (e.which == 80)
			{
				lPause = !lPause;
				$("#mini_console").css("display", lPause ? "block" : "none");
				// Try to save some battery life...
				_lQs.push("UPDATE #acceleration SET afy:content=" + (lPause ? "0" : "1") + ";");
				_lQs.push("UPDATE #compass SET afy:content=" + (lPause ? "0" : "1") + ";");
				_lQs.push("UPDATE #gyro SET afy:content=" + (lPause ? "0" : "7") + ";");
			}
			// TODO: other manual interactions (maybe)
			if (_lQs.length > 0)
				SIMULCTX.queryMulti(_lQs, new QResultHandler(function() {}, null, null));
		});
	var lUpdateMarkersVisibility = function() { lSetMarkersVisibility($("#use_compass").is(":checked") || $("#use_distance").is(":checked")); }
	$("#logo").click(function() { window.location.href = 'http://' + location.hostname + ":" + location.port + "/console.html#tab-basic"; });
	$("#camera_top").click(function() { SIMULCTX.m3dScene.setCamera(lCameras.top); });
	$("#camera_fixed").click(function() { SIMULCTX.m3dScene.setCamera(lCameras.fixed); });
	$("#use_compass").click(function() { lUpdateMarkersVisibility(); });
	$("#use_distance").click(function() { lUpdateMarkersVisibility(); });
	$("#manual_step_button").click(function() { SIMULCTX.query($("#manual_step").text(), new QResultHandler(function(_pRes) { $("#manual_step_result").text(myStringify(_pRes)); lRefresh(lRefreshCnt++, true); }), null, null); });
	lUpdateMarkersVisibility();
	initLogicalScene(lGo);
}

// TODO:
// . follow up un uint8_t as a VT_...
// . read all doc about magneto, and nail down
// . integrate gyro (optional) and see how better
// . 2++ objects, see how behaves
// . integrate displacement (have some fixed points in the environment, to help visualize/assess)
// . integrate Mark's new filtering... have checkbox to enable/disable and see the difference (smoothness etc.)
