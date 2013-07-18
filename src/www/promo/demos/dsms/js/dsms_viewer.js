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
    // Setup the presentation.
    var lCreateDefaultSetup = (undefined != location.href.match(/default_setup\=[0-9]*$$/i));
    var lP = new DsmsViewer(lCreateDefaultSetup);

    // Make sure the tab is activated in all circumstances.
    if (!lP.active)
    {
      if (top === self)
        $("#content").trigger("activate_tab");
      else if (window.parent.location.href.indexOf("#tab-dsms") >0)
        window.parent.$("#tab-dsms").trigger("activate_tab");
    }
  });

/**
 * defaultMachineSetup.
 * Create a default machine, if none is present in the database,
 * for a quicker, automated presentation experience.
 */
function defaultMachineSetup(pCompletion)
{
  // Note (Oct2012):
  //   The reason why I switched to evaluated expressions is that the heart of this demo, where the simulation curves
  //   are reset to t=0 by the triggers, became harder to deal with when I switched from notifications to triggers;
  //   evaluated expressions allowed me to do everything in affinitydb, without any client-server chatter.
  //   Complete programs (like in afy:onEnter) would be even nicer to invoke, but this is not yet available
  //   (other than by creating an artificial class).
  // Note:
  //   These evaluators expect the following arguments:
  //   . random jitter value
  //   . random shift value
  //   . time_step
  //   . sin(time_step)
  //   Ideally I would only pass the time_step, but right now it seems impossible to SELECT from within $(...).
  //   I couldn't integrate sensor_spread to the sin version, here (would neet to apply to t...).
  var lJitterShift = "dsms:sensor_jitter * :0 + dsms:sensor_shifts * :1";
  var lFuncConst = "$(MAX(dsms:sensor_min, MIN(dsms:sensor_max, (dsms:sensor_min + dsms:sensor_max) * 0.5 + " + lJitterShift + ")))";
  var lFuncLinUp = "$(MAX(dsms:sensor_min, MIN(dsms:sensor_max, (dsms:sensor_min + (0.01 * (:2 - dsms:sensor_resetts[:LAST]) / dsms:sensor_spread) * (dsms:sensor_max - dsms:sensor_min)) + " + lJitterShift + ")))";
  var lFuncLinDn = "$(MAX(dsms:sensor_min, MIN(dsms:sensor_max, (dsms:sensor_max - (0.01 * (:2 - dsms:sensor_resetts[:LAST]) / dsms:sensor_spread) * (dsms:sensor_max - dsms:sensor_min)) + " + lJitterShift + ")))";
  var lFuncSinus = "$(MAX(dsms:sensor_min, MIN(dsms:sensor_max, (dsms:sensor_min + ((0.5 + :3 * 0.5) * (dsms:sensor_max - dsms:sensor_min))) + " + lJitterShift + ")))";
  var lTriggerMaintenance =
    [
      // Note:
      //  The triggers on raw samples modify the machine_rt object.
      //  The maintenance trigger monitors the machine_rt object, and modifies the sensors (sensor_resetts).
      // TODO: shifts... (requires a bit more state management...)
      // REVIEW (bugs to investigate and log):
      //  Some bug, when specifying the machine, both as argument to the family, or as extra WHERE (dsms:machine=@self.dsms:machine)...
      //  Also SET ...=resetts[:FIRST/:LAST] doesn't work here... forced me to pretent that sensor_resetts is a coll...
      //  Also a redundant @self in the WHERE of the last statement caused it to do nothing...
      //  If I remove dsms:resetts from @self, the execution becomes unpredictable (e.g. money curve not always reset).
      "${INSERT dsms:maintenance_at=CURRENT_TIMESTAMP}",
      "${UPDATE dsms:sensors SET dsms:sensor_resetts=@self.dsms:resetts[:LAST], dsms:maintenance_at=CURRENT_TIMESTAMP}", // WHERE (MAX(@self.dsms:warning_coffee[:FIRST], @self.dsms:warning_money[:FIRST]) + INTERVAL '00:00:03' < CURRENT_TIMESTAMP)
      "${UPDATE @self DELETE dsms:warning_money, dsms:warning_coffee, dsms:resetts}", // WHERE (MAX(dsms:warning_coffee[:FIRST], dsms:warning_money[:FIRST]) + INTERVAL '00:00:03' < CURRENT_TIMESTAMP)
    ]
  var lGo =
    function()
    {
      // Note: I mix 'CREATE CLASS' with 'INSERT afy:objectID=..., afy:predicate=...' syntaxes for educational purposes only.
      DSMS_CONTEXT.query("INSERT @:1 dsms:machine_name='coffee_dispenser',\
        dsms:sensors={\
        (INSERT dsms:sensor_id='coffee_level', dsms:machine=@:1, dsms:sensor_type='st_level', dsms:sensor_curve='sc_linear_down', dsms:sensor_shifts=0, dsms:sensor_jitter=5, dsms:sensor_min=0, dsms:sensor_max=100, dsms:sensor_spread=1.0, dsms:sensor_func=" + lFuncLinDn + ", dsms:sensor_resetts={0}),\
        (INSERT dsms:sensor_id='water_alcalinity', dsms:machine=@:1, dsms:sensor_type='st_level', dsms:sensor_curve='sc_sine', dsms:sensor_shifts=0, dsms:sensor_jitter=5, dsms:sensor_min=0, dsms:sensor_max=100, dsms:sensor_spread=0.1, dsms:sensor_func=" + lFuncSinus + ", dsms:sensor_resetts={0}),\
        (INSERT dsms:sensor_id='internal_temperature', dsms:machine=@:1, dsms:sensor_type='st_temperature', dsms:sensor_curve='sc_sine', dsms:sensor_shifts=0, dsms:sensor_jitter=5, dsms:sensor_min=0, dsms:sensor_max=100, dsms:sensor_spread=0.5, dsms:sensor_func=" + lFuncSinus + ", dsms:sensor_resetts={0}),\
        (INSERT dsms:sensor_id='coins_amount', dsms:machine=@:1, dsms:sensor_type='st_money', dsms:sensor_curve='sc_linear_up', dsms:sensor_shifts=0, dsms:sensor_jitter=5, dsms:sensor_min=0, dsms:sensor_max=100, dsms:sensor_spread=0.9, dsms:sensor_func=" + lFuncLinUp + ", dsms:sensor_resetts={0})},\
        dsms:rules={\
        (INSERT dsms:rule_id='warn_coffee', dsms:machine=@:1, afy:objectID=.\"" + DSMS_CONTEXT.mNs + "/coffee_dispenser/warn_coffee\", afy:predicate=${SELECT * FROM dsms:basic_rule('coffee_dispenser') WHERE (dsms:sensor_id_cpy='coffee_level' AND dsms:\"sample/X\" < 20)}, afy:onEnter=${UPDATE @self.dsms:machine_rt ADD dsms:warning_coffee=CURRENT_TIMESTAMP, dsms:resetts=@self.dsms:time_step}, dsms:rule_description='Emit a warning when the coffee level goes below 20%'),\
        (INSERT dsms:rule_id='warn_money', dsms:machine=@:1, afy:objectID=.\"" + DSMS_CONTEXT.mNs + "/coffee_dispenser/warn_money\", afy:predicate=${SELECT * FROM dsms:basic_rule('coffee_dispenser') WHERE (dsms:sensor_id_cpy='coins_amount' AND dsms:\"sample/X\" > 80)}, afy:onEnter=${UPDATE @self.dsms:machine_rt ADD dsms:warning_money=CURRENT_TIMESTAMP, dsms:resetts=@self.dsms:time_step}, dsms:rule_description='Emit a warning when the accumulated cash in the box goes beyond 80% capacity'),\
        (CREATE CLASS dsms:\"coffee_dispenser/maintenance\" AS SELECT * WHERE EXISTS(dsms:warning_money) AND EXISTS(dsms:warning_coffee) SET dsms:rule_id='maintenance', dsms:machine=@:1, afy:onEnter={" + lTriggerMaintenance.join(",") + "}, afy:onUpdate={" + lTriggerMaintenance.join(",") + "}, dsms:rule_description='Order immediate maintenance when both coffee and money warnings are pending')}",
        new QResultHandler(function(_pJson) { pCompletion(); }, null, null));
    }
  var lOnMachines = function(_pJson) { if (undefined == _pJson || parseInt(_pJson) == 0) lGo(); else pCompletion(); }
  DSMS_CONTEXT.query("SELECT * FROM dsms:machines;", new QResultHandler(lOnMachines, null, null), {countonly:true});
}

/**
 * startSimulation.
 * Note:
 *   This simulation in a browser is a nice & easy way to publish this demo,
 *   but it's not ideal perf-wise, obviously (http etc.). In particular,
 *   the default javascript garbage collection produces a frequent, noticeable
 *   hiccup. It might be possible to reduce this with more spartian coding
 *   methods... if I have some time I'll investigate. In the meantime,
 *   in Firefox, it's possible to eliminate this hiccup by raising
 *   javascript.options.mem.gc_frequency to say a 1000x larger value
 *   (via about:config).
 */
function startSimulation(pMachineName, pRenderStep)
{
  var lStepInMs = (undefined == location.hostname.match(/(localhost|127\.0\.0\.1)/i)) ? 500 : 100;
  var lRunCtx = {timer:null, run_id:Math.random(), emitter:new Emitter(pMachineName), time_step:0, samples:{}};
  var lOnTimer =
    function()
    {
      $("#stepdisplay").text(lRunCtx.time_step);
      // Simple emulation of a real-life simulation (quasi-multi-threading):
      // . launch the simulation step (we could choose to wait for results, but we don't have to)
      // . render the current state
      Emitter.processStep(lRunCtx, lRunCtx.emitter.step(lRunCtx), null);
      pRenderStep();
      lRunCtx.time_step++;
    }
  lRunCtx.emitter.init(lRunCtx, function() { lRunCtx.timer = setInterval(lOnTimer, lStepInMs); });
  return lRunCtx;
}

/**
 * DsmsSensorView
 */
function DsmsSensorView(pSensorId, pSamples)
{
  var lThis = this;
  var lSamples = [];
  var lIndex = $("#sensors_views > div").size();
  var lViewsPerRow = Math.floor(($("#content").width() - 100) / 210);
  var lSensorsPos = $("#sensors_views").position();
  var lPos = {x:lSensorsPos.left + (lIndex % lViewsPerRow) * 210, y:lSensorsPos.top + Math.floor(lIndex / lViewsPerRow) * 160};
  var lDiv = $("<div id='@" + pSensorId + "' style='position:absolute; top:" + lPos.y + "px; left:" + lPos.x + "px; width:200px; height:150px;'></div>");
  var lCanvas = $("<canvas id='canvas_@" + pSensorId + "' style='border:1px solid; position:absolute; top:0; left:0; width:100%; height:100%;'></canvas>");
  lDiv.append(lCanvas);
  $("#sensors_views").append(lDiv);
  $("#sensors_views").height((Math.floor(lIndex / lViewsPerRow) + 1) * 160);
  var l2dCtx = null;
  try { l2dCtx = lCanvas.get(0).getContext("2d"); } catch(e) { myLog("html5 canvas not supported"); disableTab("#tab-dsms", true); return; }
  this.update =
    function(pRunCtx)
    {
      if (pSamples.length > 30)
        pSamples.splice(0, pSamples.length - 30);
      lSamples = pSamples;
      if (0 == lSamples.length)
        return;
      // Clear the background.
      l2dCtx.setTransform(1, 0, 0, 1, 0, 0);
      l2dCtx.fillStyle = "#e4e4e4";
      l2dCtx.fillRect(0, 0, l2dCtx.canvas.width, l2dCtx.canvas.height);
      // Draw a title.
      l2dCtx.font = "10pt Helvetica";
      l2dCtx.fillStyle = "#000000";
      l2dCtx.fillText(pSensorId, 0.5 * (l2dCtx.canvas.width - l2dCtx.measureText(pSensorId).width), 10);
      // Render the segment of samples we have.
      l2dCtx.strokeStyle = "#aa0000";
      l2dCtx.lineWidth = 2;
      l2dCtx.beginPath();
      l2dCtx.moveTo(5, l2dCtx.canvas.height - lSamples[0].y);
      for (var _iS = 1; _iS < lSamples.length; _iS++)
        l2dCtx.lineTo(_iS * 10, l2dCtx.canvas.height - lSamples[_iS].y);
      l2dCtx.stroke();
      // Draw the time scale.
      l2dCtx.fillStyle = "#aa0000";
      l2dCtx.fillText(lSamples[0].x, 5, l2dCtx.canvas.height - 2);
      l2dCtx.fillText(lSamples[lSamples.length - 1].x, l2dCtx.canvas.width - l2dCtx.measureText(lSamples[lSamples.length - 1].x).width - 5, l2dCtx.canvas.height - 2);
    }
}

/**
 * DsmsViewer.
 */
function DsmsViewer(pCreateDefaultSetup)
{
  // Runtime context.
  var lMachine = null;
  var lSensors = null;
  var lRunCtx = null;
  var lViews = [];

  // Manage the sensors views.
  var lDoAddView =
    function(_pSensorId, _pCompletion)
    {
      var _lSensor = null;
      var _lRetry = function() { setTimeout(function() { lDoAddView(_pSensorId, _pCompletion), 1000 }); }
      if (undefined == lSensors) { _lRetry(); return; }
      for (var _iS = 0; _iS < lSensors.length && undefined == _lSensor; _iS++)
        _lSensor = (lSensors[_iS][DSMS_CONTEXT.mNs + '/sensor_id'] == _pSensorId) ? lSensors[_iS] : null;
      var _lOnMachineRT = function(_pJson) { if (undefined != _pJson && 0 != _pJson.length) { lViews.push(new DsmsSensorView(_pSensorId, lRunCtx.samples[_pSensorId])); if (undefined != _pCompletion) { _pCompletion(); } } else { _lRetry(); } }
      DSMS_CONTEXT.query("SELECT * FROM dsms:machines_rt(@" + trimPID(lMachine.id) + ", '" + lRunCtx.run_id + "');", new QResultHandler(_lOnMachineRT, _lRetry, null));
    }
  var lOnViewAdd = function() { lDoAddView($("#sensors_list option:selected").val()); }
  $("#view_add").click(lOnViewAdd);
  $("#logo").click(function() { window.location.href = 'http://' + location.hostname + ":" + location.port + "/console.html#tab-basic"; });

  // Allow to stop the simulation (for debugging).
  if (false)
  {
    $("#rule_descriptions").append("<button id='stop_simulation'>stop!</button>");
    $("#stop_simulation").click(function() { myLog("=======\n======= End of Simulation\n=======\n"); clearInterval(lRunCtx.timer); lRunCtx.stopped_simulation = 1; });
  }

  // Manage the current machine.
  var lOnMachineChange =
    function()
    {
      var _lMachineName = $("#machines_list option:selected").val();
      if (undefined != lMachine && _lMachineName == lMachine[DSMS_CONTEXT.mNs + '/machine_name']) { return; }
      if (undefined != lRunCtx) { clearInterval(lRunCtx.timer); lRunCtx.emitter.term(lRunCtx); lRunCtx = null; }
      lViews.splice(0);
      $("#sensors_views").empty();
      $("#sensors_list").empty();
      $("#rules_list").empty();
      var _lGetVal = function(_pJson, _pProp) { return _pProp in _pJson ? _pJson[_pProp] : "" }
      var _lDisplayRule = function(_pRuleId, _pRuleDescr, _pRulePredicate, _pRuleTrigger) { var _lRcnt = $("<div style='border:1px solid; background-color:#eeeeee;'></div"); _lRcnt.append("<p><b>" + _pRuleId + ": " + _pRuleDescr + "</b></p>"); _lRcnt.append("<p style='font:8pt Helvetica;'>&nbsp;&nbsp;<b>condition</b>:<p>&nbsp;&nbsp;&nbsp;&nbsp;" + _pRulePredicate + "</p></p>"); _lRcnt.append("<p style='font:8pt Helvetica;'>&nbsp;&nbsp;<b>actions</b>:</p>"); for (var _iT in _pRuleTrigger) { _lRcnt.append("<p>&nbsp;&nbsp;&nbsp;&nbsp;" + _pRuleTrigger[_iT] + "</p>"); } $("#rules_list").append(_lRcnt).append("<p>&middot;</p>"); }
      var _lOnRules = function(_pJson) { if (undefined == _pJson) { return; } for (var _iR = 0; _iR < _pJson.length; _iR++){ var _lRid = _lGetVal(_pJson[_iR], DSMS_CONTEXT.mNs + "/rule_id"); var _lRdescr = _lGetVal(_pJson[_iR], DSMS_CONTEXT.mNs + "/rule_description"); var _lRpredicate = _lGetVal(_pJson[_iR], "afy:predicate"); var _lRtrigger = _lGetVal(_pJson[_iR], "afy:onEnter"); _lDisplayRule(_lRid, _lRdescr, _lRpredicate, typeof(_lRtrigger) == "string" ? [_lRtrigger] : _lRtrigger); } }
      var _lOnSensors = function(_pJson) { lSensors = _pJson; if (undefined == lSensors) { return; } for (var _iS = 0; _iS < lSensors.length; _iS++) { var _lSn = _lGetVal(lSensors[_iS], DSMS_CONTEXT.mNs + "/sensor_id"); $("#sensors_list").append($("<option id='" + _lSn + "'>" + _lSn + "</option>")); } }
      var _lOnMachine = function(_pJson) { lMachine = (undefined != _pJson && _pJson.length > 0) ? _pJson[0] : null; DSMS_CONTEXT.getSensors(lMachine, _lOnSensors); DSMS_CONTEXT.getRules(lMachine, _lOnRules, true); }
      DSMS_CONTEXT.query("SELECT * FROM dsms:machines('" + _lMachineName + "');", new QResultHandler(_lOnMachine, null, null));
      lRunCtx = startSimulation(_lMachineName, function() { lOnMachineChange(); lViews.forEach(function(_pV) { _pV.update(lRunCtx); }); }); // Can start in parallel with above UI stuff...
    }
  $("#machines_list").change(lOnMachineChange);

  // Class definitions.
  var lOnReady = function() { DSMS_CONTEXT.updateMachinesList($("#machines_list"), lOnMachineChange); }
  var lDefaultSetup = function() { $("#viewing_area").append("<p id='loading_msg' style='color:#aa0000'>Loading...</p>"); setTimeout(function() { lDoAddView("coffee_level", function() { lDoAddView("coins_amount", function() { lDoAddView("water_alcalinity", function() { $("#loading_msg").remove(); }); }); }); }, 1000); defaultMachineSetup(lOnReady); }
  DSMS_CONTEXT.createClasses(pCreateDefaultSetup ? lDefaultSetup : lOnReady);
}
