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

// TODO: Update... this is now quite out of sync with the actual execution (since Oct2012 revamp to use triggers and eval expr)...

/**
 * Document entry point (by callback).
 */
$(document).ready(
  function()
  {
    // Setup the presentation.
    var lP = new DsmsBuilder();

    // Make sure the tab is activated in all circumstances.
    if (!lP.active)
    {
      if (top === self)
        $("#content").trigger("activate_tab");
      else if (window.parent.location.href.indexOf("#tab-dsms-builder") >0)
        window.parent.$("#tab-dsms-builder").trigger("activate_tab");
    }
  });

/**
 * DSMS Builder.
 * Data model:
 *   {machine_name, sensors:[refs], rules:[refs]} // machines can have extra (dynamic) state, modified by rules
 *   {sensor_id, machine:ref, ...} // sensors have type-specific + instance-specific data, relationships with other sensors etc. (the more the better... show off)
 *   {rule_id, machine:ref} // rules monitor events; can test additional conditions; can set/add state (e.g. alerts or state-machine control)
 */
function DsmsBuilder()
{
  // Machine selection/creation/update.
  var lCurMachine = null; // JSON representation of the current machine (name, collections of references to sensors, rules etc.). Sensors and rules are also held in memory via virtual properties.
  var lGetMachineName = function() { return lCurMachine[DSMS_CONTEXT.mNs + '/machine_name']; }
  var lGetSelectedSensor = function() { if (!('sensors' in lCurMachine) || 0 == lCurMachine.sensors.length) { return null; } var _lSn = $("#sensors_list option:selected").val(); for (var _iS = 0; _iS < lCurMachine.sensors.length; _iS++) { if (lCurMachine.sensors[_iS][DSMS_CONTEXT.mNs + '/sensor_id'] == _lSn) return lCurMachine.sensors[_iS]; } return null; }
  var lGetSelectedRule = function() { if (!('rules' in lCurMachine) || 0 == lCurMachine.rules.length) { return null; } var _lRn = $("#rules_list option:selected").val(); for (var _iR = 0; _iR < lCurMachine.rules.length; _iR++) { if (lCurMachine.rules[_iR][DSMS_CONTEXT.mNs + '/rule_id'] == _lRn) return lCurMachine.rules[_iR]; } return null; }
  var lMachineItemTypes = {sensors:{uilist:"#sensors_list", machineprop:"sensors", idprop:"sensor_id"}, rules:{uilist:"#rules_list", machineprop:"rules", idprop:"rule_id"}};
  var lResolveRefs =
    function(_pItemType, _pCompletion)
    {
      // First, clear or init the virtual property holding resolved (in-memory) references.
      if (_pItemType.machineprop in lCurMachine)
        lCurMachine[_pItemType.machineprop].splice(0);
      else
        lCurMachine[_pItemType.machineprop] = [];
      // Second, fetch the data.
      var _lOnData = function(_pJson, _pRefs) { if (undefined == _pJson) { return; } lCurMachine[_pItemType.machineprop] = _pJson; for (var _iR = 0; _iR < _pRefs.length; _iR++) { lCurMachine[_pItemType.machineprop][_iR].owner_eid = _pRefs[_iR].eid; } if (undefined != _pCompletion) _pCompletion(); }
      DSMS_CONTEXT.resolveRefs(lCurMachine, DSMS_CONTEXT.mNs + '/' + _pItemType.machineprop, _lOnData);
    }
  var lUpdateUiList =
    function(_pItemType)
    {
      $(_pItemType.uilist).empty();
      lResolveRefs(_pItemType, function() { var _lVp = lCurMachine[_pItemType.machineprop]; for (var _i = 0; _i < _lVp.length; _i++) { var _lId = _lVp[_i][DSMS_CONTEXT.mNs + '/' + _pItemType.idprop]; $(_pItemType.uilist).append($("<option id='" + _lId + "'>" + _lId + "</option>")); } });
    }
  var lUpdateSensors = function() { lUpdateUiList(lMachineItemTypes.sensors); $("#sensor_delete").css("visibility", "hidden"); $("#right_sensors").css("visibility", "hidden"); }
  var lUpdateRules = function() { lUpdateUiList(lMachineItemTypes.rules); $("#rule_delete").css("visibility", "hidden"); $("#right_rules").css("visibility", "hidden"); }
  var lUpdateMachine = function() { $("#machines_list").val(lGetMachineName()); lUpdateSensors(); lUpdateRules(); }
  var lSetCurMachine =
    function(_pMachineName, _pForce)
    {
      if (undefined == _pMachineName) { _pMachineName = $("#machines_list option:selected").val(); }
      if (undefined == _pMachineName || 0 == _pMachineName.length) { return; }
      if ((undefined == _pForce || !_pForce) && (undefined != lCurMachine && lGetMachineName() == _pMachineName)) { return; }
      var _lOnNewMachine = function(_pJson) { if (undefined == _pJson || 0 == _pJson.length) { return; } lCurMachine = _pJson[0]; var _lMn = lGetMachineName(); $("#machines_list").append("<option id='" + _lMn + "'>" + _lMn + "</option>"); lUpdateMachine(); }
      var _lOnExistingMachine = function(_pJson) { lCurMachine = (undefined != _pJson && _pJson.length > 0) ? _pJson[0] : null; if (undefined == lCurMachine) { DSMS_CONTEXT.query("INSERT dsms:machine_name='" + _pMachineName + "';", new QResultHandler(_lOnNewMachine, null, null)); } else lUpdateMachine(); }
      DSMS_CONTEXT.query("SELECT * FROM dsms:machines('" + _pMachineName + "');", new QResultHandler(_lOnExistingMachine, null, null));
    }
  $("#machines_list").change(function() { lSetCurMachine(); });
  $("#machine_new").click(function() { lSetCurMachine(prompt("New Machine:", "")); });

  // Sensor selection/update.
  var lUpdateSensor =
    function()
    {
      var _lSn = $("#sensors_list option:selected").val();
      var _lInitConnectedOptions =
        function()
        {
          // Funny idea: connected sensor (to showcase references in rules).
          $("#sensorprop_connected").empty();
          $("#sensorprop_connected").append($("<option id='none'>none</option>"));
          for (var _iS = 0; _iS < lCurMachine.sensors.length; _iS++)
          {
            var _lSn2 =  lCurMachine.sensors[_iS][DSMS_CONTEXT.mNs + '/sensor_id'];
            if (_lSn == _lSn2) { continue; }
            $("#sensorprop_connected").append($("<option id='" + _lSn2 + "'>" + _lSn2 + "</option>"));
          }
        }
      $("#sensor_delete").text("Delete " + _lSn); $("#sensor_delete").css("visibility", "visible"); $("#right_sensors").css("visibility", "visible");
      $("#sensorprop_id").text(_lSn);
      _lInitConnectedOptions();
      var _lS = lGetSelectedSensor();
      var _lUpdateOption = function(__pProp, __pDefault) { var __lPn = DSMS_CONTEXT.mNs + '/sensor_' + __pProp; $("#sensorprop_" + __pProp).val(__lPn in _lS ? $("#" + _lS[__lPn]).text() : __pDefault); }
      var _lUpdateBool = function(__pProp, __pDefault) { var __lPn = DSMS_CONTEXT.mNs + '/sensor_' + __pProp; $("#sensorprop_" + __pProp).attr('checked', __lPn in _lS ? (_lS[__lPn] == 'true' || _lS[__lPn] == true) : __pDefault); }
      var _lUpdateNumber = function(__pProp, __pDefault) { var __lPn = DSMS_CONTEXT.mNs + '/sensor_' + __pProp; $("#sensorprop_" + __pProp).val(__lPn in _lS ? _lS[__lPn] : __pDefault); }
      DSMS_CONTEXT.mSensorProps.options.forEach(function(_p) { _lUpdateOption(_p[0], _p[1]); });
      DSMS_CONTEXT.mSensorProps.bools.forEach(function(_p) { _lUpdateBool(_p[0], _p[1]); });
      DSMS_CONTEXT.mSensorProps.numbers.forEach(function(_p) { _lUpdateNumber(_p[0], _p[1]); });
    }
  $("#sensors_list").change(lUpdateSensor);
  $("#sensor_delete").click(function() { var _lS = lGetSelectedSensor(); var _lCmds = ["START TRANSACTION", "DELETE FROM @" + trimPID(_lS.id), DSMS_CONTEXT.mQPrefix + "UPDATE @" + trimPID(lCurMachine.id) + " DELETE dsms:sensors" + (lCurMachine.sensors.length > 1 ? ("[" + _lS.owner_eid  + "]") : ""), "COMMIT"]; afy_batch_query(_lCmds, new QResultHandler(function(){ lSetCurMachine(null, true); }, null, null)); });
  var lSaveOption = function(_pProp) { var _lS = lGetSelectedSensor(); var _lV = $("#sensorprop_" + _pProp + " option:selected").attr('id'); _lS[DSMS_CONTEXT.mNs + '/sensor_' + _pProp] = _lV; DSMS_CONTEXT.query("UPDATE @" + trimPID(_lS.id) + " SET dsms:sensor_" + _pProp + "='" + _lV + "';", new QResultHandler(function() {}, null, null)); }
  var lSaveBool = function(_pProp) { var _lS = lGetSelectedSensor(); var _lV = $("#sensorprop_" + _pProp).is(":checked"); _lS[DSMS_CONTEXT.mNs + '/sensor_' + _pProp] = _lV; DSMS_CONTEXT.query("UPDATE @" + trimPID(_lS.id) + " SET dsms:sensor_" + _pProp + "=" + _lV + ";", new QResultHandler(function() {}, null, null)); }
  var lSaveNumber = function(_pProp) { var _lS = lGetSelectedSensor(); var _lV = $("#sensorprop_" + _pProp).val(); _lS[DSMS_CONTEXT.mNs + '/sensor_' + _pProp] = _lV; DSMS_CONTEXT.query("UPDATE @" + trimPID(_lS.id) + " SET dsms:sensor_" + _pProp + "=" + _lV + ";", new QResultHandler(function() {}, null, null)); }
  var lSetupPropHandlers = function(_pWhich, _pFunc) { DSMS_CONTEXT.mSensorProps[_pWhich].forEach(function(__p) { $("#sensorprop_" + __p[0]).change(function() { _pFunc(__p[0]); }); }); }
  lSetupPropHandlers('options', lSaveOption);
  lSetupPropHandlers('bools', lSaveBool);
  lSetupPropHandlers('numbers', lSaveNumber);

  // Rule selection/update.
  // Note: Rules will be converted to classes only at the beginning of a simulation (could have an explicit button also).
  // TODO: Freeze a rule in the UI once it exists as a class...
  var lGetRulePreamble = function(_pRuleId) { return "CREATE CLASS dsms:\"" + lGetMachineName() + "/" + _pRuleId + "\" AS SELECT * FROM dsms:basic_rule('" + lGetMachineName() + "') "; }
  var lUpdateRule =
    function()
    {
      var _lPn;
      var _lRn = $("#rules_list option:selected").val();
      $("#rule_delete").text("Delete " + _lRn); $("#rule_delete").css("visibility", "visible"); $("#right_rules").css("visibility", "visible");
      $("#ruleprop_id").text(_lRn);
      var _lR = lGetSelectedRule();
      var _lPredicate;
      if ((DSMS_CONTEXT.mNs + '/rule_class') in _lR)
        _lPredicate = _lR[DSMS_CONTEXT.mNs + '/rule_class'];
      else
      {
        _lPredicate = lGetRulePreamble(_lRn);
        _lPredicate += "WHERE (";
        if (lCurMachine.sensors.length > 0)
          _lPredicate += "dsms:sensor_id_cpy='" + lCurMachine.sensors[0][DSMS_CONTEXT.mNs + '/sensor_id'] + "' AND ";
        _lPredicate += "dsms:\"sample/X\" =12345)";
      }
      var _lConditionsStart = _lPredicate.match(/where/i).index;
      $("#ruleprop_class_preamble").text(_lPredicate.substr(0, _lConditionsStart));
      $("#ruleprop_class_conditions").val(_lPredicate.substr(_lConditionsStart));
      _lPn = DSMS_CONTEXT.mNs + '/rule_action'; $("#ruleprop_action").val(_lPn in _lR ? _lR[_lPn] : "");
      _lPn = DSMS_CONTEXT.mNs + '/rule_description'; $("#ruleprop_description").val(_lPn in _lR ? _lR[_lPn] : "");
    }
  $("#rules_list").change(lUpdateRule);
  $("#rule_delete").click(function() { var _lR = lGetSelectedRule(); var _lCmds = ["START TRANSACTION", "DELETE FROM @" + trimPID(_lR.id), DSMS_CONTEXT.mQPrefix + "UPDATE @" + trimPID(lCurMachine.id) + " DELETE dsms:rules" + (lCurMachine.rules.length > 1 ? ("[" + _lR.owner_eid  + "]") : ""), "COMMIT"]; afy_batch_query(_lCmds, new QResultHandler(function(){ lSetCurMachine(null, true); }, null, null)); });
  $("#ruleprop_class_conditions").change(function() { var _lR = lGetSelectedRule(); var _lV = $("#ruleprop_class_preamble").text() + $("#ruleprop_class_conditions").val(); _lR[DSMS_CONTEXT.mNs + '/rule_class'] = _lV; DSMS_CONTEXT.query("UPDATE @" + trimPID(_lR.id) + " SET dsms:rule_class='" + _lV.replace(/'/g, "''") + "';", new QResultHandler(function() {}, null, null)); });
  $("#ruleprop_action").change(function() { var _lR = lGetSelectedRule(); var _lV = $("#ruleprop_action").val(); _lR[DSMS_CONTEXT.mNs + '/rule_action'] = _lV; DSMS_CONTEXT.query("UPDATE @" + trimPID(_lR.id) + " SET dsms:rule_action='" + _lV.replace(/'/g, "''") + "';", new QResultHandler(function() {}, null, null)); });
  $("#ruleprop_description").change(function() { var _lR = lGetSelectedRule(); var _lV = $("#ruleprop_description").val(); _lR[DSMS_CONTEXT.mNs + '/rule_description'] = _lV; DSMS_CONTEXT.query("UPDATE @" + trimPID(_lR.id) + " SET dsms:rule_description='" + _lV.replace(/'/g, "''") + "';", new QResultHandler(function() {}, null, null)); });

  // Class definitions.
  DSMS_CONTEXT.createClasses(function() { DSMS_CONTEXT.updateMachinesList($("#machines_list"), lSetCurMachine); });

  // Handlers for "New Sensor", "New Rule".
  var lOnNewItem =
    function(_pId, _pItemType)
    {
      if (undefined == _pId || 0 == _pId.length) { return; }
      var _lDoCreate = function() { var _lMid = "@" + trimPID(lCurMachine.id); DSMS_CONTEXT.query("UPDATE " + _lMid + " ADD dsms:" + _pItemType.machineprop + "=(INSERT dsms:" + _pItemType.idprop + "='" + _pId + "', dsms:machine=" + _lMid + ");", new QResultHandler(function(_pJson){ lCurMachine = (undefined != _pJson && _pJson.length > 0) ? _pJson[0] : null; lUpdateMachine(); }, null, null)); }
      var _lAlreadyThere = false;
      var _lMprop = DSMS_CONTEXT.mNs + '/' + _pItemType.machineprop;
      if (_lMprop in lCurMachine)
        for (var _iS = 0; _iS < _lMprop.length && !_lAlreadyThere; _iS++)
          _lAlreadyThere = (_pId == _lMprop[_iS][DSMS_CONTEXT.mNs + '/' + _pItemType.idprop]);
      if (!_lAlreadyThere)
        _lDoCreate();
    }
  $("#sensor_new").click(function(){ lOnNewItem(prompt("New Sensor's Id (for Machine " + lGetMachineName() + ")", ""), lMachineItemTypes.sensors); });
  $("#rule_new").click(function(){ lOnNewItem(prompt("New Rule's Id (for Machine " + lGetMachineName() + ")", ""), lMachineItemTypes.rules); });
}
