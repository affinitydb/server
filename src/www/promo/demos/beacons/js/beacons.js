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
c3dl.addModel("sphere.dae");
c3dl.addMainCallBack(beaconsEntryPoint, "viewer");

/**
 * Ctx/Helpers.
 */
var SIMULCTX = new Object();
SIMULCTX.mDevices =
	[
		"687A5860-B3E1-4911-A815-1DA60129DB8E", // Michael's TI      - top,left
		"47E70978-EECF-48C5-88C8-883B83A53D96", // My TI             - top,right
		"CE8B54E6-7AA4-44D0-AD7B-40DBA218D9D7", // new TI 1          - bottom,left
		"8AD608B8-3C38-4B34-B53C-352AA679FB1E", // new TI 2          - bottom,right
		// "F8B6D41E-01E3-4BC7-966A-C862C07542D3", // Estimote 1 (pale) - bottom,left
		// "90BC157C-BF34-4625-92F8-F6B5B8AF8246", // Estimote 2 (dark) - bottom,right
	];
SIMULCTX.m3dScene = null;
SIMULCTX.m3dRenderer = null;
SIMULCTX.mRadical = "beacons";
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

			// The beacons.
			var _lQs1 = [];
			_lQs1.push("INSERT simul:\"moveable/type\"='duck', simul:\"moveable/angle/x\"=0.0, simul:\"moveable/angle/y\"=0.0, simul:\"moveable/angle/z\"=0;");
			_lQs1.push("CREATE LOADER _ble AS 'BLE';");
			_lQs1.push("CREATE LISTENER scan_perpetual AS {.srv:BLE} SET BLE:purpose=BLEPURPOSES#SCAN_CONFIG, BLE:\"scan/mode\"=BLESCANMODES#PERPETUAL;");
			for (var _iD = 0; _iD < SIMULCTX.mDevices.length; _iD++)
				_lQs1.push("INSERT afy:objectID='distance" + _iD + "', afy:service={.srv:BLE}, afy:address='" + SIMULCTX.mDevices[_iD] + "', BLE:purpose=BLEPURPOSES#DISTANCE;"); // , BLE:\"keep-connected\"=TRUE
			_lSS.push(function() { SIMULCTX.queryMulti(_lQs1, new QResultHandler(_lSS.next, null, null)); });

			// Go.
			_lSS.push(pCompletion);
			_lSS.start();
		};
	var lCheckAlreadyThere = function() { SIMULCTX.query("SELECT * FROM simul:moveables;", new QResultHandler(function(_pJson) { if (undefined == _pJson || parseInt(_pJson) == 0) lInsertObjects(); else pCompletion(); }, null, null), {countonly:true}); };
	SIMULCTX.createClasses(lCheckAlreadyThere);
}

/**
 * beaconsEntryPoint
 */
function beaconsEntryPoint(pCanvasId)
{
	var lPause = false;
	var lCameras = {}, lMarkers = {corners:[null, null, null, null], mobile:null};
	var lUnit = 100;
	var lYm = 75;
	var lRegisterMarker =
		function(pMarker, pEffect, pIndex)
		{
			pMarker.setVisible(true);
			if (pIndex < SIMULCTX.mDevices.length)
			{
				pMarker.setPosition([(pIndex % 2) == 0 ? (-lUnit) : lUnit, 0, (pIndex < 2) ? (-lUnit) : lUnit]);
				var _lC = 0.2 + pIndex * 0.1;
				pEffect.setParameter('color', [_lC, _lC, _lC]);
				lMarkers.corners[pIndex] = {index:pIndex, m:pMarker, distance:-59, distance_accum:[], override:$("#manual_dB" + pIndex)};
			}
			else
			{
				pMarker.setPosition([0, lYm, 0]);
				lMarkers.mobile = {m:pMarker, pos_accum:[]};
				pMarker.setColor([1, 0, 0]);
			}
		};

	// Initializations related to the web page as a whole.
	var lCanvas = $("#" + pCanvasId);
	var lUpdateCanvasSize = function() { lCanvas.attr("width", lCanvas.width()); lCanvas.attr("height", lCanvas.height()); }
	lUpdateCanvasSize();

	// The frame update entry-point.
	var lFilteringRadius = 32.0;
	var lFilteringWeight = (1.0 / lFilteringRadius);
	var lLastRefreshed = -1;
	var lAverage =
		function(pArray)
		{
			var _lSum = 0; 
			pArray.forEach(function(_c) { _lSum += _c; });
			return _lSum / pArray.length;
		};
	var lAverage2d =
		function(pArray)
		{
			var _lSum = {x:0, y:0}; 
			pArray.forEach(function(_c) { _lSum.x += _c.x; _lSum.y += _c.y });
			return {x:_lSum.x / pArray.length, y:_lSum.y / pArray.length};
		};
	var ldBMin = 59.0; // My "Plugable" can never produce smaller absolute values; my other receiver can.
	var ldBFactor = 6.0; // For each increment of ldBFactor dB, the distance doubles.
	var lEvalDist = function(pdB) { return Math.max(0.1, Math.pow(2.0, (Math.abs(pdB) - ldBMin)/ldBFactor) - 1.0); }; // dB -> linear dist
	var lClampIn = function(pV, pMin, pMax) { return Math.max(pMin, Math.min(pMax, pV)); }

	// TODO:
	// 2. finish coefficients/model: Q, R, init P, A, H, init estX
	// 3. test&tune for stationary
	// 4. include real accelerometer, goto 1
	// Note: c3dl only seems to care about 4x4 matrices... same for many other js kits... good enough for now...
	//       could actually start with the 2-sensor case and see how it improves that...
	var lKalmanState =
		{
			estX:[-65, -65, -65, -65], // last estimated result
			P:c3dl.makeIdentityMatrix(), // last covariance                                    //// TODO: review scale of this (1?)
			A:c3dl.makeIdentityMatrix(), // model (aka F aka phi) (cst)                        //// TODO: review model: always assume cst? acc data here somehow?
			H:c3dl.makeIdentityMatrix(), // linear combination mapping predicted -> measured (cst)
			identity:c3dl.makeIdentityMatrix(), // cached identity matrix (cst)
			Q:c3dl.makeMatrix(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1), // process noise (cst)     //// TODO: review
			R:c3dl.makeMatrix(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1) // measurement noise (cst)  //// TODO: review
		};

	var lUpdateVisuals =
		function(pCnt, pCompletion)
		{
			// Prevent non-linear progression due to out-of-order async http responses.
			if (pCnt < lLastRefreshed)
					return;

			// Simple filtering.
			var lUseFiltering = $("#use_filtering").is(":checked") && !lPause;
			var lUseOldMethod = $("#use_old_method").is(":checked");
			var lUseTwoBeacons = $("#use_two_beacons").is(":checked");
			var lShowFilteredSignalStrength = $("#show_filtered_signal_strength").is(":checked");
			var lShowUnfilteredSignalStrength = $("#show_unfiltered_signal_strength").is(":checked");
			var lUseSpringMethod = false; // $("#use_springmethod").is(":checked");
			lMarkers.corners.forEach( // top-left, top-right, bottom-left, bottom-right.
				function(_c)
				{
					if (undefined == _c || 0 == _c.distance) return;
					if (Math.abs(_c.distance) < ldBMin)
						ldBMin = Math.abs(_c.distance);
					_c.distance_accum.push(_c.distance);
					if (_c.distance_accum.length > lFilteringRadius)
						_c.distance_accum.splice(0, 1);
				});

			// Visualize relative position (2 or 4 points).
			var lCalculateKalman =
				function()
				{
					// Prediction.
					c3dl.pushMatrix(lKalmanState.A);
					c3dl.multMatrix(lKalmanState.estX);
					var _lEstX = c3dl.peekMatrix(); // A * estX
					c3dl.popMatrix();

					c3dl.pushMatrix(lKalmanState.A);
					c3dl.multMatrix(lKalmanState.P);
					c3dl.multMatrix(c3dl.transposeMatrix(lKalmanState.A));
					var _lP = c3dl.addMatrices(c3dl.peekMatrix(), lKalmanState.Q); // A * P * A[T] + Q
					c3dl.popMatrix();

					// Correction (Riccati).
					var _lHT = c3dl.transposeMatrix(lKalmanState.H);
					c3dl.pushMatrix(lKalmanState.H);
					c3dl.multMatrix(_lP);
					c3dl.multMatrix(_lHT);
					var _lTmp = c3dl.addMatrices(c3dl.peekMatrix(), lKalmanState.R); // H * P * H[T] + R
					c3dl.popMatrix();
					c3dl.pushMatrix(_lP);
					c3dl.multMatrix(_lHT);
					c3dl.multMatrix(c3dl.inverseMatrix(_lTmp));
					var _lK = c3dl.peekMatrix(); // (P * H[T]) * _lTmp^-1

					c3dl.pushMatrix(lKalmanState.H);
					c3dl.multMatrix(_lEstX);
					var _lMeasurement = [0, 0, 0, 0];
					lMarkers.corners.forEach(function(_c) { _lMeasurement[_c.index] = lEvalDist(_c.distance); });
					_lTmp = c3dl.peekMatrix(); c3dl.popMatrix();
					c3dl.multMatrix(c3dl.subtractMatrices(_lMeasurement, _lTmp)); // K * (meas - H * estX)
					lKalmanState.estX = c3dl.addMatrices(_lEstX, c3dl.peekMatrix());
					c3dl.popMatrix();

					c3dl.pushMatrix(_lK);
					c3dl.multMatrix(lKalmanState.H);
					_lTmp = c3dl.peekMatrix(); c3dl.popMatrix();
					c3dl.pushMatrix(c3dl.subtractMatrices(lKalmanState.identity, _lTmp));
					c3dl.multMatrix(lKalmanState.P);
					lKalmanState.P = c3dl.peekMatrix(); // (I - K * H) * P;
					c3dl.popMatrix();
				};
			//if (lUseFiltering)
			//	lCalculateKalman();
			var lFilteredSamples = lMarkers.corners.map(
				function(_c)
				{
					if (undefined == _c) return 0;
					// return lKalmanState.estX[_c.index];
					return lFilteringWeight * _c.distance + (1 - lFilteringWeight) * lAverage(_c.distance_accum);
				});
			var lDist = lUseFiltering ?
				lFilteredSamples.map(function(_c) { return lEvalDist(_c); }) :
				lMarkers.corners.map(function(_c) { return _c ? lEvalDist(lPause ? _c.override.val() : _c.distance) : 0; }); // top-left, top-right, bottom-left, bottom-right.
			var lXm = 0, lZm = 0;
			var lNumSmall = 0, lSide = 0;
			var lNormalized, lAng1 = 0, lAng2 = 0;
			var lNumCorrections = 0;
			if (SIMULCTX.mDevices.length > 2 && !lUseTwoBeacons)
			{
				// With 4 beacons, assuming that they are arranged in a square or arbitrary (unknown) dimension,
				// and that the receiver is somewhere inside that square...

				// Perform a first qualitative assessment of the measurements (normalized on the average).
				var isSmallR = function(_r) { return _r < 0.9; };
				var lAvg, lRatios;
				var lUpdateRatios =
					function()
					{
						lAvg = lAverage(lDist);
						lRatios = lDist.map(function(_d) { return _d / lAvg; });
						lNumSmall = 0; lRatios.forEach(function(_r) { if (isSmallR(_r)) lNumSmall++; });
					};
				lUpdateRatios();

				// Calculate the receiver's final lXm and lZm (in a normalized 1x1 square).
				if (lUseOldMethod)
				{
					// This is the first very rough estimate I had tried; it behaves surprisingly not too bad, especially near the edges.
					var lFudge = 1.8; // Note: This is an empirical scaling factor to compensate for the very imperfect geometric method below.
					lXm = 0.5 * ((lDist[0]/(lDist[0]+lDist[1])) + (lDist[2]/(lDist[2]+lDist[3]))) * lFudge;
					lZm = 0.5 * ((lDist[0]/(lDist[0]+lDist[2])) + (lDist[1]/(lDist[1]+lDist[3]))) * lFudge;
					lMarkers.mobile.m.setPosition([lClampIn(-lUnit*lFudge + lXm*2*lUnit, -lUnit, lUnit), lYm, lClampIn(-lUnit*lFudge + lZm*2*lUnit, -lUnit, lUnit)]);
					lNormalized = lRatios.slice(0);
				}
				else if (lUseSpringMethod)
				{
					// TODO:
					// Maybe we could model this as a spring system (attached at the corners of the square and together at the center).
					// The dB measurements could be translated into the forces applied or alternatively the springs' characteristic constant,
					// in the hope of minimizing the impact of erratic RSSI measurements.  I'm not sure if this is a
					// well determined problem though, and whether the difficulties encountered in the geometric solutions
					// would resurface in some other form.
				}
				else
				{
					// First, assess roughly the side of the square, in absolute value.
					// Also, perform corrections for measurements that are incompatible with the expected square.
					// In the corners, the diagonal should be roughly the sum of the smallest and largest measurements.
					// Near the edges, the side should be roughly the sum of the two smallest measurements.
					// Near the middle, the diagonal should be roughly the sum of the two largest measurements.
					lSide = 0;
					var lDSIdx; // Indexes in lDist, sorted by dist.
					while (0 == lSide)
					{
						lDSIdx = [];
						for (var _iD = 0; _iD < lDist.length; _iD++)
							lDSIdx.push(_iD);
						lDSIdx.sort(function(_a, _b) { return lDist[_a] - lDist[_b]; });

						if (1 == lNumSmall)
							lSide = 0.707 * (lDist[lDSIdx[0]] + lDist[lDSIdx[3]]);
						else if (2 == lNumSmall)
							lSide = Math.max(lDist[lDSIdx[0]] + lDist[lDSIdx[1]], 0.15 * lDist[lDSIdx[0]] + 0.894 * lDist[lDSIdx[3]]);
						else
						{
							// It's abnormal in a square to be near 3 corners, and far from 1; we presume that lDist[lDSIdx[3]] is larger than it should be, clamp it, and let the next iteration recalculate ratios etc.
							if (3 == lNumSmall && !(lDist[lDSIdx[0]]+lDist[lDSIdx[1]]+lDist[lDSIdx[2]]<1))
								{ lDist[lDSIdx[3]] = Math.min(lDist[lDSIdx[3]], 1.414 * lDist[lDSIdx[2]]); lNumCorrections++; }
							else
							{
								if (4 == lNumSmall) alert("ASSERT: the 4 values are smaller than their average?");
								lSide = 0.707 * (lDist[lDSIdx[2]] + lDist[lDSIdx[3]]);
							}
						}

						if (0 == lSide)
							lUpdateRatios();
					}

					// Second, normalize all measurements (such that the side of the square becomes 1).
					lNormalized = lDist.map(function(_d) { return Math.min(1.414, _d / lSide); });

					// Third, using aˆ2 = bˆ2 + cˆ2 - 2*b*c*cosA, assess 2 of the angles, to compute averaged lXm and lZm.
					// Note: We proceed from the corner closest to the receiver, to minimize angle errors due to imprecisions.
					var lCornerConfigs = [[1, 0], [0, 1], [3, 2], [2, 3]];
					var lCC = lCornerConfigs[lDSIdx[0]];
					var lCos1 = lClampIn((Math.pow(lNormalized[lCC[0]], 2) - 1 - Math.pow(lNormalized[lCC[1]], 2)) / (-2 * lNormalized[lCC[1]]), -1, 1);
					lAng1 = Math.acos(lCos1);
					lXm = lClampIn(lCos1 * lNormalized[lCC[1]], 0, 1);
					if (1 == lDSIdx[0] % 2) lXm = 1 - lXm;
					lZm = lClampIn(Math.sin(lAng1) * lNormalized[lCC[1]], 0, 1);
					if (lDSIdx[0] > 1) lZm = 1 - lZm;

					// Post-process filtering: a cheap solution to smooth jumps that could result from the mapping function itself (as opposed to the raw input).
					lMarkers.mobile.pos_accum.push({x:lXm, y:lZm});
					if (lMarkers.mobile.pos_accum.length > lFilteringRadius)
						lMarkers.mobile.pos_accum.splice(0, 1);
					if (lUseFiltering)
						{ var _lFp = lAverage2d(lMarkers.mobile.pos_accum); lXm = _lFp.x; lZm = _lFp.y; }

					// Update the receiver's marker.
					lMarkers.mobile.m.setPosition([-lUnit + lXm*2*lUnit, lYm, -lUnit + lZm*2*lUnit]);
				}
			}
			else if (SIMULCTX.mDevices.length > 1)
			{
				// With 2 beacons, assuming that the receiver is somewhere between the 2
				// (be it at a distance from the line that joins them), we just consider the
				// ratio of the 2 distances, which provides a normalized measurement,
				// i.e. does not require a-priori knowledge of the actual distance between
				// the 2 beacons.  This seems like a nice approach because
				//   1. it requires 0 configuration (all we need to know is that
				//      the 2 beacons are indeed arranged in some line, but we
				//      don't need to know the distance between them)
				//   2. in practice, the sum of the 2 measurements fluctuates quite a bit,
				//      making any hard assumption about the actual (fixed) distance quite futile
				lXm = lDist[0]/(lDist[0]+lDist[1]);
				lMarkers.mobile.m.setPosition([-lUnit + lXm*2*lUnit, lYm, -lUnit + lZm*2*lUnit]);
			}

			// Illustrate each beacon's distance to the target (the closer, the smaller).
			// I prefer to represent this in absolute value (as opposed to normalized),
			// to get a real sense of what the sensors report and how they vary;
			// the display scale is arbitrary.
			if (lShowFilteredSignalStrength || lShowUnfilteredSignalStrength)
			{
				for (var _iC = 0; _iC < lMarkers.corners.length; _iC++)
				{
					if (!lMarkers.corners[_iC]) continue;
					var _lPos = lMarkers.corners[_iC].m.getSceneGraph().getPosition();
					var _ldBRaw = lPause ? lMarkers.corners[_iC].override.val() : (lShowFilteredSignalStrength ? lFilteredSamples[_iC] : lMarkers.corners[_iC].distance);
					if (0 == _ldBRaw)
						_ldBRaw = -ldBMin;
					var _lS = 0.2 + 0.2 * Math.max(0.1, Math.abs(_ldBRaw) - ldBMin); // 3 * lNormalized[_iC];
					lMarkers.corners[_iC].m.getSceneGraph().setTransform([_lS, 0, 0, 0, 0, _lS, 0, 0, 0, 0, _lS, 0, _lPos[0], _lPos[1], _lPos[2], 1]);
				}
			}

			// Display tracing/debugging info.
			$("#info1").text("beacons:[" + (lShowFilteredSignalStrength ? lFilteredSamples.map(function(_c) { return Math.floor(_c + 0.5); }).join(", ") : lMarkers.corners.map(function(_c) { return _c ? _c.distance : "nil"; }).join(", ")) + "]");
			$("#info2").text("distances:[" + lDist.map(function(_c) { return Math.ceil(10.0 * _c); }).join(", ") + "]");
			$("#info3").text("normalized:[" + (undefined != lNormalized ? lNormalized.map(function(_c) { return Math.ceil(100.0 * _c); }).join(", ") : "nil") + "]");
			$("#info4").text("coord:[" + Math.ceil(100.0 * lXm) + "%, " + Math.ceil(100.0 * lZm) + "%]");
			$("#info5").text(lNumSmall + " small, " + /* "side=" + Math.ceil(10.0 * lSide) + ", corr=" + lNumCorrections + ", " */ + Math.ceil(180*lAng1/Math.PI) + "°, " + Math.ceil(180*lAng2/Math.PI) + "°");
			$("#info6").text("filtering:[" + (lUseFiltering ? "on" : "off") + "]");

			// Highlight abnormal measurements.
			// TODO: detect more cases (e.g. imbalanced diagonals, imbalanced sides etc.).
			$("#info2").css("color", (lNumCorrections > 0) ? "red" : "black"); // In theory in a square, it's impossible to be close to 3 corners and far from 1... but radio measurements don't care...
		};
	var lRefresh =
		function(pCnt, pForced)
		{
			if (lPause && pForced != true) return;
			for (var _iM = 0; _iM < SIMULCTX.mDevices.length; _iM++)
			{
				SIMULCTX.query("SELECT * FROM #distance" + _iM, new QResultHandler(
					(function(_pIndex)
						{
							return function(_pJsonDistance)
							{
								if (undefined == _pJsonDistance) return;
								lMarkers.corners[_pIndex].distance = _pJsonDistance[0]['http://affinityng.org/service/BLE/value'];
								lUpdateVisuals(pCnt, function(){});
							};
						})(_iM),
					null, null));
			}
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
				lCameras.top.setPosition([0.0, 800.0, 0.0]);
				lCameras.top.setLookAtPoint([0.0, 0.0, 0.0]);
				lCameras.top.setUpVector([0.0, 0.0, -1.0]);
				SIMULCTX.m3dScene.setCamera(lCameras.top);

				// Create a sun, to have some basic lighting movement.
				var _lLightSun = new c3dl.PositionalLight();
				_lLightSun.setPosition([10000.0, 500.0, 10000.0]);
				_lLightSun.setDiffuse([0.3, 0.7, 0.7, 1]);
				_lLightSun.setOn(true);
				SIMULCTX.m3dScene.setAmbientLight([0.3, 0.3, 0.3, 0.3]);
				SIMULCTX.m3dScene.addLight(_lLightSun);

				// Start the empty 3d scene.
				SIMULCTX.m3dScene.startScene();

				// Add the beacons/markers.
				for (var _iM = 0; _iM < SIMULCTX.mDevices.length + 1; _iM++)
				{
					var _lMarker = _iM < SIMULCTX.mDevices.length ? new c3dl.Collada() : new c3dl.Point();
					var _lEffect = null;
					if (_iM < SIMULCTX.mDevices.length)
					{
						_lMarker.init("sphere.dae");
						_lEffect = new c3dl.Effect();
						_lEffect.init(c3dl.effects.GREYSCALE);
						_lMarker.setEffect(_lEffect);
						_lMarker.scale([10, 10, 10]);
					}
					lRegisterMarker(_lMarker, _lEffect, _iM);
					SIMULCTX.m3dScene.addObjectToScene(_lMarker);
				}
				pCompletion();
			}
			else
				alert("WARNING: Failed to initialize the 3d rendering context; this browser may not support webgl.");
		};

	// Initializations related to the logic (pathsql stuff).
	var lRefreshCnt = 0;
	var lPullIntervalInMs = 500; // 350 // 0
	var lGo =
		function()
		{
			lInit3d(
				function()
				{
					// If lPullIntervalInMs, then no pulling occurs; this is useful to work purely in manual (paused) mode.
					if (lPullIntervalInMs > 0)
						setInterval(function() { lRefresh(lRefreshCnt++); }, lPullIntervalInMs);
				});
		};
	window.addEventListener(
		'keydown',
		function(e)
		{
			var _lQs = [];
			if (e.which == 80)
			{
				lPause = !lPause;
				$("#mini_console").css("display", lPause ? "block" : "none");
				if (lPause)
					lMarkers.corners.forEach(function(_m) { if (_m) { _m.override.val(_m.distance ? _m.distance : -ldBMin) } });
			}
			// TODO: other manual interactions (maybe)
			if (_lQs.length > 0)
				SIMULCTX.queryMulti(_lQs, new QResultHandler(function() {}, null, null));
		});
	$("#logo").click(function() { window.location.href = 'http://' + location.hostname + ":" + location.port + "/console.html#tab-basic"; });
	$("#camera_top").click(function() { SIMULCTX.m3dScene.setCamera(lCameras.top); });
	$("#camera_fixed").click(function() { SIMULCTX.m3dScene.setCamera(lCameras.fixed); });
	[$("#manual_dB0"), $("#manual_dB1"), $("#manual_dB2"), $("#manual_dB3")].forEach(
		function(_w) { _w.change(function() { lUpdateVisuals(lRefreshCnt++, function(){}); }); });
	[$("#use_old_method"), $("#show_filtered_signal_strength"), $("#show_unfiltered_signal_strength"), $("#use_two_beacons") /*, $("#use_springmethod")*/].forEach(
		function(_w) { _w.click(function() { if (lPause) lUpdateVisuals(lRefreshCnt++, function(){}); }); });
	var lResetSignalStrengthUI =
		function()
		{
			for (var _iC = 0; _iC < lMarkers.corners.length; _iC++)
			{
				if (!lMarkers.corners[_iC]) continue;
				var _lPos = lMarkers.corners[_iC].m.getSceneGraph().getPosition();
				lMarkers.corners[_iC].m.getSceneGraph().setTransform([1.0, 0, 0, 0, 0, 1.0, 0, 0, 0, 0, 1.0, 0, _lPos[0], _lPos[1], _lPos[2], 1]);
			}
		};
  $("#show_filtered_signal_strength").change(function() { var _lC = $("#show_filtered_signal_strength").is(":checked"); if (_lC && $("#show_unfiltered_signal_strength").is(":checked")) { $("#show_unfiltered_signal_strength").click(); } else if (!_lC) { lResetSignalStrengthUI(); } });
  $("#show_unfiltered_signal_strength").change(function() { var _lC = $("#show_unfiltered_signal_strength").is(":checked"); if ($("#show_filtered_signal_strength").is(":checked") && _lC) { $("#show_filtered_signal_strength").click(); } else if (!_lC) { lResetSignalStrengthUI(); } });
	$("#use_two_beacons").change(function() {
		var _lInv = $("#use_two_beacons").is(":checked");
		if (lMarkers.corners.length >= 4) { [2,3].forEach(function(_i){ lMarkers.corners[_i].m.setVisible(!_lInv); }); } });
	$("#manual_step_button").click(function() { SIMULCTX.query($("#manual_step").text(), new QResultHandler(function(_pRes) { $("#manual_step_result").text(myStringify(_pRes)); lRefresh(lRefreshCnt++, true); }), null, null); });

	var lCurX, lCurY;
	$("#viewer").mousemove(function(e) { lCurX = e.pageX; lCurY = e.pageY; });
	$("#viewer").mousedown(
		function(e)
		{
			if (!lPause)
				return;
			// When the user clicks in the viewer, produce theoretical RSSI readings,
			// to assess the quality of the mapping function, for perfect values.
			// Review: hard-coded boundary coords from 3d view...
			var _lX = 64 * (lCurX - 565) / (715-565);
			var _lY = 64 * (lCurY - 177) / (326-177);
			var _lL =
				[
					Math.sqrt(Math.pow(_lX, 2) + Math.pow(_lY, 2)),
					Math.sqrt(Math.pow(64 - _lX, 2) + Math.pow(_lY, 2)),
					Math.sqrt(Math.pow(_lX, 2) + Math.pow(64 - _lY, 2)),
					Math.sqrt(Math.pow(64 - _lX, 2) + Math.pow(64 - _lY, 2))
				];
			var _lDb = _lL.map(function(_l) { return -((Math.log(_l) / Math.log(2)) * ldBFactor + ldBMin); });
			for (var _i = 0; _i < _lDb.length; _i++)
				$("#manual_dB" + _i).val(_lDb[_i]);
			lUpdateVisuals(lRefreshCnt++, function(){});
		});

	initLogicalScene(lGo);
}

// main concerns at the moment:
// 1. deadlock issue (esp. iPhone)
// 2. gather more info about measurement distributions, in various contexts (e.g. multimodal distr due to reflections? etc.)

/*
  -- Small app to gather and plot (via online console's "histogram" tab) the distribution of a beacon's measurements...
  CREATE LOADER _ble AS 'BLE';
  INSERT afy:objectID='distance0', afy:service={.srv:BLE}, afy:address='687A5860-B3E1-4911-A815-1DA60129DB8E', BLE:purpose=BLEPURPOSES#DISTANCE;
  CREATE CLASS iteration AS SELECT * WHERE EXISTS(sampletime) SET afy:onEnter=${UPDATE @self SET _rssi=(SELECT BLE:value FROM #distance0)};
  CREATE CLASS rssi AS SELECT * WHERE EXISTS(_rssi);
  CREATE TIMER thread INTERVAL '00:00:00.5' AS INSERT sampletime=CURRENT_TIMESTAMP;
*/

/*
  -- Small self-contained pathSQL app to perform the full loop of reading the 4 beacons, assessing the reader's quadrant,
  -- and controlling a LED reflecting the result.

  -- Enable debugging traces.
  SET TRACE ALL ACTIONS;

  -- Initializations and classification.
  --------------------------------------

  -- Load the Bluetooth Low Energy service.
  CREATE LOADER _ble AS 'BLE';

  -- Beacons.
  CREATE CLASS beacons AS SELECT * WHERE corner IN :0 AND EXISTS("beacon/id") SET
    comment='Classify and initialize new beacons; attach a ''sensor'' CPIN to them.',
    afy:onEnter=${UPDATE @self SET
      "rssi/filtered"=0,
      updater=(INSERT beacon=@self, lastupd=CURRENT_TIMESTAMP),
      sensor=(INSERT afy:service={.srv:BLE}, afy:address=@self."beacon/id",
        BLE:purpose=BLEPURPOSES#DISTANCE, corner=@self.corner)};
  CREATE CLASS "beacons/updaters" AS SELECT * WHERE EXISTS(beacon) AND EXISTS(lastupd) SET
    comment='Whenever @self.lastupd is changed, grab a new sample from the beacon, and compute the resulting filtered value.',
    afy:onUpdate={
        ${UPDATE @auto SET "rssi/raw"=(SELECT BLE:value FROM @self.beacon.sensor)}, -- Read the sensor.
        ${UPDATE @self.beacon SET "rssi/filtered"+=(@auto."rssi/raw" - "rssi/filtered"/3)/3} -- Calculate the new filtered value.
      };

  -- LED.
  CREATE CLASS "LED/channel" AS SELECT * WHERE EXISTS("LED/characteristic") SET
    comment='Initialize each LED color channel as a distinct CPIN.',
    afy:onEnter=
      ${UPDATE @self SET actuator= -- Actual CPIN (per color channel).
        (INSERT afy:objectID=@self."LED/channel")
          --, afy:service={.srv:BLE}, afy:address='4EADEBC2-9BB3-4AAC-891F-86DE570FF2D8', 
          --BLE:"characteristic/write"=@self."LED/characteristic")
        };

  -- Physical configuration.
  --------------------------

  -- Beacons.
  -- We specify the corner they're assigned to, in a logical square where
  -- the top-left corner is 0, top-right is 1, bottom-left is 2 and bottom-right is 3;
  -- that square is expected to contain the BLE receiver.
  -- TODO (asap): use MAC instead of Apple UUID...
  INSERT (corner, "beacon/id", color) VALUES
         (0, '687A5860-B3E1-4911-A815-1DA60129DB8E', (INSERT r=1, g=65534, b=65534)),
         (1, '47E70978-EECF-48C5-88C8-883B83A53D96', (INSERT r=65534, g=1, b=65534)),
         (2, 'CE8B54E6-7AA4-44D0-AD7B-40DBA218D9D7', (INSERT r=65534, g=65534, b=1)),
         (3, '8AD608B8-3C38-4B34-B53C-352AA679FB1E', (INSERT r=1, g=1, b=1));

  -- LED.
  -- TODO: use LED by service ID instead: B03F6ED0-9B46-11E3-A5E2-0800200C9A66 
  INSERT ("LED/channel", "LED/characteristic") VALUES
         ('red', '8d9cbfae-9b46-11e3-b248-425861b86ab6'),
         ('green', '8d9cbb9e-9b46-11e3-b248-425861b86ab6'),
         ('blue', '8d9cbdba-9b46-11e3-b248-425861b86ab6');

  -- Main loop.
  -------------

  CREATE CLASS "LED/update" AS SELECT * WHERE EXISTS(winner) SET
    comment='Update the RBG channels of the LED, according to the specified winner beacon.',
    afy:onEnter={
      ${UPDATE @self SET color=(SELECT color FROM beacons WHERE corner=@self.winner)},
      ${UPDATE #red SET afy:content=(SELECT r from @self.color)},
      ${UPDATE #green SET afy:content=(SELECT g from @self.color)},
      ${UPDATE #blue SET afy:content=(SELECT b from @self.color)}};
  CREATE CLASS iteration AS SELECT * WHERE EXISTS(sampletime) SET
    comment='For each runtime iteration, update the beacons and elect a winner corner.',
    afy:onEnter={
      -- Let each beacon grab a new sample, and compute its filtered value.
      ${UPDATE "beacons/updaters" SET lastupd=@self.sampletime},
      -- Elect a winner corner (n.b. class "LED/update" will automatically update the color accordingly).
      ${UPDATE @self SET winner=(SELECT ARGMAX("rssi/filtered") FROM beacons)}
    };
  CREATE TIMER entrypoint INTERVAL '00:00:00.3' AS INSERT sampletime=CURRENT_TIMESTAMP;
*/

/*
	BLE shield for Arduino
	tx service UID: 713D0000-503E-4C75-BA94-3148F18D941E

	Reserved pins:

		see: https://redbearlab.zendesk.com/entries/22420923-Which-Arduino-pins-are-used-
		MISO, MOSI, SCK
		VCC, GND, RDYN (pin 8) and REQN (pin 9)
		unclear about SS (pin 10)
		n.b. pins 0 and 1 are also reserved if Serial.begin is used, theoretically unrelated with BLE (for dbg tx/rx over serial),
				 although Boards.h (in the firmata sketch) hard-codes that IS_PIN_DIGITAL is false for [0,1]...

	Doc:

		./Documents/Arduino/libraries/...
		./myarduino/RBL_Library_v2.0.1/
		http://firmata.org/wiki/Protocol
		https://github.com/lupeke/python-firmata/blob/master/firmata/firmata.py
		https://github.com/RedBearLab/iOS/blob/master/Examples/BLE%20RGB/BLE%20RGB/RBLViewController.m
		https://redbearlab.zendesk.com/home

	"SimpleControls" applet (with "SimpleControls" sketch):

		works for me
		very simple sketch logic (ble_available -> ble_read -> do whatever)
		very simple protocol (leading byte + value)
		works with a small subset of hard-coded pin numbers (e.g. DIGITAL_IN_PIN=5 - see at the beginning of the SimpleControls sketch file)
		also easy to drive from LightBlue; n.b. to read, *must* subscribe via the rx service (713D0002-503E-4C75-BA94-3148F18D941E), and then watch notifications

	firmata (with BLEFirmataSketch):

		works now
		easy to drive from LightBlue
		n.b. see the BLEFirmata.h file in the BLEFirmata sketch, for up-to-date flags etc. (e.g. PWM=3!!)
		n.b. digitalRead is done via readPort (see the doc in Boards.h), right at the beginning of loop()
		n.b. analog pins are numbered in [14, 19] (see also: http://forum.arduino.cc/index.php/topic,41238.0.html)
		n.b. in the Arduino IDE, all files involved are always loaded in the sketch (IOW, no need to search elsewhere)
		n.b. Serial.println (*after* Serial.begin) + Serial Monitor, even with unsaved changes in the sketch, to debug
		n.b. after Serial.begin, pins 0 and 1 are dedicated to serial comm...
		n.b. to write, one *must* write via the tx characteristic (713D0003-503E-4C75-BA94-3148F18D941E)
		n.b. to read, one *must* subscribe via the rx characteristic (713D0002-503E-4C75-BA94-3148F18D941E), and then process BLE notifications

		SET_PIN_MODE = 0xF4 # set a pin to INPUT/OUTPUT/PWM/etc
		PWM = 3 (!!)
		byte 1: 0xF4
		byte 2: pin
		byte 3: mode (see BLEFirmata.h)

		ANALOG_MESSAGE = 0xE0 # send data for an analog pin (or PWM)
		1: 0xE0 | (pin & 0x0F)
		2: value & 0x7F
		3: value >> 7

		e.g.

			; writing PWM
			F4 03 03 ; set pin 3 in PWM mode
			E3 7F 00 ; write 0x7f to pin 3
			F4 05 03 ; set pin 5 in PWM mode
			E5 7F 00 ; write 0x7f to pin 5

			; writing digital
			; n.b. the digital mode uses a different/strange masking scheme, e.g. to set the third pin (i.e. bit 00000100):
			F4 02 01 ; set pin 2 in digital out mode (n.b. this is actually the default at startup...)
			90 04 00 ; set pin 2 to true (i.e. the third 0-indexed pin, i.e. bit 4)

			; reading digital
			F4 04 00 ; set pin 4 in digital in mode
			; subscribe to the rx service
			; notice BLE notifications when values fed to pin 4 change...
			; (in LightBlue, either View Log, or watch the "Hex" or "Decimal" value reported in the rx service)

			; reading analog
			F4 0E 02 ; set the first analog pin in analog read mode (warning: A0-A5 is in reverse order on the board, compared with D0-D13)
			; subscribe to the rx service

			; controlling the sampling frequency
			F0 7A 00 04 f7 ; set the sampling frequency to 1024 ms (~1 sample/sec) (n.b. this is a "sysex" request)

		"sysex" provides an extended, multi-byte query/response capability, e.g.

			F0 6B F7 ; CAPABILITY_QUERY - return info about the state of every pin (a relatively long stream)
			F0 6D 04 F7 ; PIN_STATE_QUERY - ask for pin current mode and state (n.b. doesn't report last read value per se)

*/
