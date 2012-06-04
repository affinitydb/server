/*
Copyright (c) 2004-2012 VMware, Inc. All Rights Reserved.

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
    lP = new DsmsViewer(lCreateDefaultSetup);

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
  var lGo =
    function()
    {
      // Review: Extra trailing ) in INSERT crashes... log as bug...
      // Review: UPDATE @... WHERE -> seems to prevent classification based on that field (e.g. class 'maintenance' wouldn't select anything; but subsequently created identical class would)...
      // Review: OTOH, DELETE @... without WHERE -> will fail the tx if not there...
      /* Note: The single statement below worked nicely, except that I couldn't express actions talking to the machine...
      /* Note: Also, I didn't know how to insert the dsms:machine backpointer with this syntax (but this is not mandatory at the moment in my model).
      DSMS_CONTEXT.query("INSERT dsms:machine_name='coffee_dispenser', dsms:sensors={\
        (INSERT dsms:sensor_id='coffee_level', dsms:sensor_type='st_level', dsms:sensor_curve='sc_linear_down', dsms:sensor_shifts=true, dsms:sensor_jitter=true),\
        (INSERT dsms:sensor_id='coins_amount', dsms:sensor_type='st_money', dsms:sensor_curve='sc_linear_up', dsms:sensor_jitter=true)}, dsms:rules={\
        (INSERT dsms:rule_id='warn_coffee', dsms:rule_action='INSERT dsms:warning_ts=CURRENT_TIMESTAMP, dsms:warning_msg=''Coffee running low'';', dsms:rule_class='CREATE CLASS dsms:\"coffee_dispenser/warn_coffee\" AS SELECT * FROM dsms:basic_rule(''coffee_dispenser'') WHERE (dsms:sensor_id_cpy=''coffee_level'' AND dsms:\"sample/X\" < 20)'),\
        (INSERT dsms:rule_id='warn_money', dsms:rule_action='INSERT dsms:warning_ts=CURRENT_TIMESTAMP, dsms:warning_msg=''Money box filling up'';', dsms:rule_class='CREATE CLASS dsms:\"coffee_dispenser/warn_money\" AS SELECT * FROM dsms:basic_rule(''coffee_dispenser'') WHERE (dsms:sensor_id_cpy=''coins_amount'' AND dsms:\"sample/X\" > 80)'),\
        (INSERT dsms:rule_id='maintenance', dsms:rule_action='reset', dsms:rule_class='CREATE CLASS dsms:\"coffee_dispenser/maintenance\" AS SELECT * WHERE EXISTS(dsms:warning_ts) AND (dsms:warning_ts + INTERVAL ''00:00:10'' < CURRENT_TIMESTAMP)')}", new QResultHandler(pCompletion, null, null));
      */
      var _lSeq = new DSMS_CONTEXT.instrSeq();
      var _lNewMachine = null;
      _lSeq.push(function() { DSMS_CONTEXT.query("INSERT dsms:machine_name='coffee_dispenser'", new QResultHandler(function(_pJson) { _lNewMachine = _pJson[0]; _lNewMachine.sensors = []; _lNewMachine.rules = []; _lSeq.next(); }, null, null)); });
      _lSeq.push(function() { DSMS_CONTEXT.query("INSERT dsms:sensor_id='coffee_level', dsms:machine=@" + trimPID(_lNewMachine.id) + ", dsms:sensor_type='st_level', dsms:sensor_curve='sc_linear_down', dsms:sensor_shifts=true, dsms:sensor_jitter='true'", new QResultHandler(function(_pJson) { _lNewMachine.sensors.push(_pJson[0]); _lSeq.next(); }, null, null)); });
      _lSeq.push(function() { DSMS_CONTEXT.query("INSERT dsms:sensor_id='coins_amount', dsms:machine=@" + trimPID(_lNewMachine.id) + ", dsms:sensor_type='st_money', dsms:sensor_curve='sc_linear_up', dsms:sensor_shifts=true, dsms:sensor_jitter=true", new QResultHandler(function(_pJson) { _lNewMachine.sensors.push(_pJson[0]); _lSeq.next(); }, null, null)); });
      _lSeq.push(function() { DSMS_CONTEXT.query("INSERT dsms:sensor_id='water_alcalinity', dsms:machine=@" + trimPID(_lNewMachine.id) + ", dsms:sensor_type='st_level', dsms:sensor_curve='sc_sine', dsms:sensor_jitter=true, dsms:sensor_spread=0.1", new QResultHandler(function(_pJson) { _lNewMachine.sensors.push(_pJson[0]); _lSeq.next(); }, null, null)); });
      _lSeq.push(function() { DSMS_CONTEXT.query("INSERT dsms:sensor_id='internal_temperature', dsms:machine=@" + trimPID(_lNewMachine.id) + ", dsms:sensor_type='st_temperature', dsms:sensor_curve='sc_sine', dsms:sensor_jitter=true, dsms:sensor_spread=0.5", new QResultHandler(function(_pJson) { _lNewMachine.sensors.push(_pJson[0]); _lSeq.next(); }, null, null)); });
      _lSeq.push(function() { DSMS_CONTEXT.query("UPDATE @" + trimPID(_lNewMachine.id) + " ADD dsms:sensors={" + _lNewMachine.sensors.map(function(_e) { return "@" + _e.id; }).join(",") + "}", new QResultHandler(function(_pJson) { _lSeq.next(); }, null, null)); });
      _lSeq.push(function() { DSMS_CONTEXT.query("INSERT dsms:rule_id='warn_coffee', dsms:rule_description='Emit a warning when the coffee level goes below 20%', dsms:rule_action='UPDATE @" + trimPID(_lNewMachine.id) + " SET dsms:warning_coffee=CURRENT_TIMESTAMP', dsms:rule_class='CREATE CLASS dsms:\"coffee_dispenser/warn_coffee\" AS SELECT * FROM dsms:basic_rule(''coffee_dispenser'') WHERE (dsms:sensor_id_cpy=''coffee_level'' AND dsms:\"sample/X\" < 20)'", new QResultHandler(function(_pJson) { _lNewMachine.rules.push(_pJson[0]); _lSeq.next(); }, null, null)); }); // WHERE NOT EXISTS(warning_coffee)
      _lSeq.push(function() { DSMS_CONTEXT.query("INSERT dsms:rule_id='warn_money', dsms:rule_description='Emit a warning when the accumulated cash in the box goes beyond 80% capacity', dsms:rule_action='UPDATE @" + trimPID(_lNewMachine.id) + " SET dsms:warning_money=CURRENT_TIMESTAMP', dsms:rule_class='CREATE CLASS dsms:\"coffee_dispenser/warn_money\" AS SELECT * FROM dsms:basic_rule(''coffee_dispenser'') WHERE (dsms:sensor_id_cpy=''coins_amount'' AND dsms:\"sample/X\" > 80)'", new QResultHandler(function(_pJson) { _lNewMachine.rules.push(_pJson[0]); _lSeq.next(); }, null, null)); }); // WHERE NOT EXISTS(warning_money)
      _lSeq.push(function() { DSMS_CONTEXT.query("INSERT dsms:rule_id='maintenance', dsms:rule_description='Order immediate maintenance when both coffee and money warnings are pending', dsms:rule_action='START TRANSACTION;UPDATE @" + trimPID(_lNewMachine.id) + " DELETE dsms:warning_money WHERE EXISTS(dsms:warning_money);UPDATE @" + trimPID(_lNewMachine.id) + " DELETE dsms:warning_coffee WHERE EXISTS(dsms:warning_coffee);UPDATE @" + trimPID(_lNewMachine.sensors[0].id) + " SET dsms:reset_ts=CURRENT_TIMESTAMP WHERE (NOT EXISTS(dsms:reset_ts) OR (dsms:reset_ts + INTERVAL ''00:00:02'' < CURRENT_TIMESTAMP));UPDATE @" + trimPID(_lNewMachine.sensors[1].id) + " SET dsms:reset_ts=CURRENT_TIMESTAMP WHERE (NOT EXISTS(dsms:reset_ts) OR (dsms:reset_ts + INTERVAL ''00:00:02'' < CURRENT_TIMESTAMP));COMMIT', dsms:rule_class='CREATE CLASS dsms:\"coffee_dispenser/maintenance\" AS SELECT * WHERE EXISTS(dsms:warning_money) AND EXISTS(dsms:warning_coffee)'", new QResultHandler(function(_pJson) { _lNewMachine.rules.push(_pJson[0]); _lSeq.next(); }, null, null)); }); // Note: the INTERVAL is to avoid feedback loops due to asynchronous queries (next sample arriving before the changes take effect... and triggering again).
      _lSeq.push(function() { DSMS_CONTEXT.query("UPDATE @" + trimPID(_lNewMachine.id) + " ADD dsms:rules={" + _lNewMachine.rules.map(function(_e) { return "@" + _e.id; }).join(",") + "}", new QResultHandler(function(_pJson) { _lSeq.next(); }, null, null)); });
      _lSeq.push(function() { pCompletion(); });
      _lSeq.start();
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
  var lStepInMs = 200;
  var lRunCtx = {timer:null, run_id:Math.random(), emitter:new Emitter(pMachineName), time_step:0};
  var lOnTimer =
    function()
    {
      $("#stepdisplay").text(lRunCtx.time_step);
      // Simple emulation of a real-life simulation (quasi-multi-threading):
      // . launch the simulation step (we could choose to wait for results, but we don't have to)
      // . render the current state
      Emitter.processStep(lRunCtx.emitter.step(lRunCtx), null);
      pRenderStep();
      lRunCtx.time_step++;
    }
  lRunCtx.emitter.init(lRunCtx, function() { lRunCtx.timer = setInterval(lOnTimer, lStepInMs); });
  return lRunCtx;
}

/**
 * DsmsSensorView
 */
function DsmsSensorView(pSensorRT, pSensorId)
{
  var lThis = this;
  var lSamples = [];
  var lIndex = $("#sensors_views > div").size();
  var lViewsPerRow = Math.floor(($("#content").width() - 100) / 210);
  var lSensorsPos = $("#sensors_views").position();
  var lPos = {x:lSensorsPos.left + (lIndex % lViewsPerRow) * 210, y:lSensorsPos.top + Math.floor(lIndex / lViewsPerRow) * 160};
  var lDiv = $("<div id='@" + pSensorRT.id + "' style='position:absolute; top:" + lPos.y + "px; left:" + lPos.x + "px; width:200px; height:150px;'></div>");
  var lCanvas = $("<canvas id='canvas_@" + pSensorRT.id + "' style='border:1px solid; position:absolute; top:0; left:0; width:100%; height:100%;'></canvas>");
  lDiv.append(lCanvas);
  $("#sensors_views").append(lDiv);
  $("#sensors_views").height((Math.floor(lIndex / lViewsPerRow) + 1) * 160);
  var l2dCtx = null;
  try { l2dCtx = lCanvas.get(0).getContext("2d"); } catch(e) { myLog("html5 canvas not supported"); disableTab("#tab-dsms", true); return; }
  this.update =
    function(pRunCtx)
    {
      // TODO: could choose to refresh at a different rate than sample production
        // e.g. faster update rate, but on older data (smooth impression, always catching up with now)
      // TODO: gather details from sensors (e.g. scale, titles, axes, units etc.)

      // Trim stale samples.
      // Review: Why do I need 30 instead of 20?
      if (lSamples.length > 30)
        lSamples = lSamples.slice(lSamples.length - 30);

      // Get new samples periodically (every 2 ticks).
      if (0 == lSamples.length || pRunCtx.time_step > lSamples[lSamples.length - 1].x + 2)
        DSMS_CONTEXT.query(
          "SELECT * FROM dsms:samples(@" + trimPID(pSensorRT.id) + ", [" + (pRunCtx.time_step - 20) + "," + (pRunCtx.time_step + 20) + "]);",
          new QResultHandler(
            function(_pJson)
            {
              if (undefined == _pJson) { return; }
              var _lNewSamples = _pJson.map(function(__pJ) { return {x:parseInt(__pJ[DSMS_CONTEXT.mNs + '/time_step']), y:1.5 * parseFloat(__pJ[DSMS_CONTEXT.mNs + '/sample/X'])}; });
              var _lLastX = lSamples.length > 0 ? lSamples[lSamples.length - 1].x : 0;
              _lNewSamples.forEach(function(__pS) { if (__pS.x > _lLastX) lSamples.push(__pS); });
            }));
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
      for (var _iS = 0; _iS < lSensors.length && undefined == _lSensor; _iS++)
        _lSensor = (lSensors[_iS][DSMS_CONTEXT.mNs + '/sensor_id'] == _pSensorId) ? lSensors[_iS] : null;
      var _lOnSensorRT = function(_pJson) { if (undefined != _pJson && 0 != _pJson.length) { lViews.push(new DsmsSensorView(_pJson[0], _pSensorId)); } if (undefined != _pCompletion) { _pCompletion(); } }
      DSMS_CONTEXT.query("SELECT * FROM dsms:sensors_rt(@" + trimPID(_lSensor.id) + ", '" + lRunCtx.run_id + "');", new QResultHandler(_lOnSensorRT, null, null));
    }
  var lOnViewAdd = function() { lDoAddView($("#sensors_list option:selected").val()); }
  $("#view_add").click(lOnViewAdd);

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
      var _lDisplayRule = function(_pRuleId, _pRuleDescr, _pRuleClass, _pRuleAction) { var _lRcnt = $("<div style='border:1px solid; background-color:#eeeeee;'></div"); _lRcnt.append("<p><b>" + _pRuleId + ": " + _pRuleDescr + "</b></p>"); _lRcnt.append("<p style='font:8pt Helvetica;'>&nbsp;&nbsp;<b>condition</b>:<p>&nbsp;&nbsp;&nbsp;&nbsp;" + _pRuleClass + "</p></p>"); _lRcnt.append("<p style='font:8pt Helvetica;'>&nbsp;&nbsp;<b>actions</b>:</p>"); _pRuleAction.split(";").forEach(function(__a) { _lRcnt.append("<p>&nbsp;&nbsp;&nbsp;&nbsp;" + __a + "</p>"); }); $("#rules_list").append(_lRcnt).append("<p>&middot;</p>"); }
      var _lOnRules = function(_pJson) { if (undefined == _pJson) { return; } for (var _iR = 0; _iR < _pJson.length; _iR++){ var _lRid = _lGetVal(_pJson[_iR], DSMS_CONTEXT.mNs + "/rule_id"); var _lRdescr = _lGetVal(_pJson[_iR], DSMS_CONTEXT.mNs + "/rule_description"); var _lRclass = _lGetVal(_pJson[_iR], DSMS_CONTEXT.mNs + "/rule_class"); var _lRaction = _lGetVal(_pJson[_iR], DSMS_CONTEXT.mNs + "/rule_action"); _lDisplayRule(_lRid, _lRdescr, _lRclass, _lRaction); } }
      var _lOnSensors = function(_pJson) { lSensors = _pJson; if (undefined == lSensors) { return; } for (var _iS = 0; _iS < lSensors.length; _iS++) { var _lSn = _lGetVal(lSensors[_iS], DSMS_CONTEXT.mNs + "/sensor_id"); $("#sensors_list").append($("<option id='" + _lSn + "'>" + _lSn + "</option>")); } }
      var _lOnMachine = function(_pJson) { lMachine = (undefined != _pJson && _pJson.length > 0) ? _pJson[0] : null; DSMS_CONTEXT.getSensors(lMachine, _lOnSensors); DSMS_CONTEXT.getRules(lMachine, _lOnRules); }
      DSMS_CONTEXT.query("SELECT * FROM dsms:machines('" + _lMachineName + "');", new QResultHandler(_lOnMachine, null, null));
      lRunCtx = startSimulation(_lMachineName, function() { lOnMachineChange(); lViews.forEach(function(_pV) { _pV.update(lRunCtx); }); }); // Can start in parallel with above UI stuff...
    }
  $("#machines_list").change(lOnMachineChange);

  // Class definitions.
  var lOnReady = function() { DSMS_CONTEXT.updateMachinesList($("#machines_list"), lOnMachineChange); }
  var lDefaultSetup = function() { setTimeout(function() { lDoAddView("coffee_level", function() { lDoAddView("coins_amount", function() { lDoAddView("water_alcalinity"); }); }); }, 1500); defaultMachineSetup(lOnReady); }
  DSMS_CONTEXT.createClasses(pCreateDefaultSetup ? lDefaultSetup : lOnReady);
}

// TODO later
// play with more sophisticated conditions/triggers/chained rules
// (not directly related) figure out delete issues in console (pagination? other? use count?)
