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

function Emitter(pMachineName)
{
  var lThis = this;
  var lClientId = ("dsmsdemo" + new Date() + Math.random()).replace(/\s|\:|\-|\(|\)|\.|/g, "");
  var lMachine = null;
  var lMachineSensors = []; // JSON of the sensors + a virtual 'runtime' property, pointing to the corresponding runtime objects.
  this.init =
    function(pRunCtx, pOnReady)
    {
      lMachine = null;
      lMachineSensors.splice(0);
      var _lMachineRules = []; // JSON of the rules.
      var _lActions = {}; // Dictionary of {classname:action}.
      var _lOnRefreshedSensor =
        function(_pJson, _pCompletion)
        {
          if (undefined == _pJson || !(_pJson instanceof Array) || 0 == _pJson.length) { _pCompletion(); return; }
          var __lFound = -1;
          for (var __iS = 0; __iS < lMachineSensors.length && -1 == __lFound; __iS++)
            __lFound = (trimPID(lMachineSensors[__iS].id) == trimPID(_pJson[0].id)) ? __iS : -1;
          if (-1 == __lFound) { _pCompletion(); return; }
          for (var __iP in _pJson[0])
            lMachineSensors[__lFound][__iP] = _pJson[0][__iP];
          _pCompletion();
        }
      var _lRefreshSensors =
        function(_pCompletion)
        {
          // Note:
          //   We do this upon trigger activation, to demonstrate the notion that the system itself can be influenced by the database's updated contents.
          //   Presently this is essentially used to refresh the per-sensor dsms:reset_ts property.
          var __lSS = new DSMS_CONTEXT.instrSeq();
          var __lCmd = function(__pIs, __pSS) { return function() { DSMS_CONTEXT.query("SELECT * FROM @" + trimPID(lMachineSensors[__pIs].id), new QResultHandler(function(__pJson) { _lOnRefreshedSensor(__pJson, function() { __pSS.next(); }); }, function() { __pSS.next(); }, null)); } }
          for (var __iS = 0; __iS < lMachineSensors.length; __iS++)
            __lSS.push(__lCmd(__iS, __lSS));
          __lSS.push(_pCompletion);
          __lSS.start();
        }
      var _lResetShifts = function() { for (var __iS = 0; __iS < lMachineSensors.length; __iS++) if ('shifts' in lMachineSensors[__iS]) delete lMachineSensors[__iS].shifts; }
      var _lOnClassNotified =
        function(_pClass, _pCompletion)
        {
          $("#" + _pClass.replace(/\:*\/*/g, "")).attr('checked', true);
          if (_pClass in _lActions)
          {
            if (-1 != _pClass.indexOf('maintenance')) // This pseudo-hack/shortcut takes care of the simulator's own internal needs only.
            {
              setTimeout(function() { for (var __iC in _lActions) { $("#" + __iC.replace(/\:*\/*/g, "")).attr('checked', false); } }, 3000);
              _lResetShifts();
            }
            DSMS_CONTEXT.queryMulti(_lActions[_pClass].split(';')/*review:coarse*/, new QResultHandler(function() { _lRefreshSensors(_pCompletion); }, _pCompletion, null));
            return;
          }
          _pCompletion();
        }
      var _lWaitNotifs =
        function()
        {
          $.ajax({
            type: "GET",
            url: DB_ROOT + "?i=waitnotif&clientid=" + lClientId + "&timeout=5000", // Note: We set a relatively short timeout in order for help the server reclaim our resources should we leave without unregistering.
            dataType: "text", async: true, timeout: null, cache: false, global: false,
            success: function(data)
            {
              try
              {
                var __lJson = $.parseJSON(data);
                if (undefined == __lJson) { _lWaitNotifs(); return; }
                var __lSeq = new DSMS_CONTEXT.instrSeq();
                for (var __iP in __lJson)
                  if (__lJson[__iP] instanceof Array) // Otherwise it's a timeout... ignore (we'll just wait again soon).
                    { __lJson[__iP].forEach(function(__p) { if ('class_name' in __p) { __lSeq.push(function() { _lOnClassNotified(__p.class_name, function() { __lSeq.next(); }) }); } }); }
                __lSeq.push(_lWaitNotifs);
                __lSeq.start();
              }
              catch (e) { myLog("Caught error while handling callback (data: " + data + "): " + e); _lWaitNotifs(); }
            },
            error: function() { alert("error while waiting for notifs! " + myStringify(arguments)); },
            beforeSend : function(req) { if (AFY_CONTEXT.mStoreIdent.length > 0) { req.setRequestHeader('Authorization', "Basic " + base64_encode(AFY_CONTEXT.mStoreIdent + ":" + AFY_CONTEXT.mStorePw)); } }
          });
        }
      var _lRegisterNotifs =
        function(_pClasses)
        {
          if (0 == _pClasses.length) { _lWaitNotifs(); pOnReady(); return; }
          var __lC = _pClasses.pop();
          var __lCn = __lC.match(/^CREATE CLASS (.*) AS SELECT/i)[1].replace("dsms:\"", "http://dsmsdemo/").replace("\"", "");
          $.ajax({
            type: "GET",
            url: DB_ROOT + "?i=regnotif&notifparam=" + __lCn + "&type=class&clientid=" + lClientId,
            dataType: "text", async: true, timeout: null, cache: false, global: false,
            success: function(data) { /*alert(data);*/ /* what to do */ _lRegisterNotifs(_pClasses); },
            error: function() { alert("error while registering for notifs! " + myStringify(arguments)); },
            beforeSend : function(req) { if (AFY_CONTEXT.mStoreIdent.length > 0) { req.setRequestHeader('Authorization', "Basic " + base64_encode(AFY_CONTEXT.mStoreIdent + ":" + AFY_CONTEXT.mStorePw)); } }
          });
        }
      var _lRegisterClasses =
        function(_pClasses, _pCompletion)
        {
          if (0 == _pClasses.length) { _pCompletion(); return; }
          DSMS_CONTEXT.createClass(_pClasses.pop(), function() { _lRegisterClasses(_pClasses, _pCompletion); });
        }
      var _lSetupTriggers =
        function(_pJson)
        {
          if (undefined == _pJson) { pOnReady(); return; }
          _lMachineRules = _pJson;
          var __lClasses = [];
          for (var __iR = 0; __iR < _lMachineRules.length; __iR++)
          {
            var __lR = _lMachineRules[__iR];
            var __lPn = DSMS_CONTEXT.mNs + '/rule_class';
            if (!(__lPn in __lR)) { continue; }
            var __lC = __lR[__lPn];
            __lClasses.push(__lC);
            __lPn = DSMS_CONTEXT.mNs + '/rule_action';
            if (!(__lPn in __lR)) { continue; }
            var __lCn = DSMS_CONTEXT.extractFullClassName(__lC);
            _lActions[__lCn] = __lR[__lPn];
            $("#alerts_views").append($("<input id='" + __lCn.replace(/\:*\/*/g, "") + "' type='checkbox'>" + __lCn + "</input>"));
          }
          _lRegisterClasses(__lClasses.slice(0), function() { _lRegisterNotifs(__lClasses); });
        }
      var _lOnNewSensorsRT =
        function(_pJson)
        {
          if (undefined == _pJson || _pJson.length != lMachineSensors.length) { myLog("Unexpected number of sensor runtime infos"); return; }
          var __lLinkCommands = [];
          for (var __iS = 0; __iS < _pJson.length; __iS++)
          {
            var __lSid = trimPID(lMachineSensors[__iS].id);
            if (trimPID(_pJson[__iS][0][DSMS_CONTEXT.mNs + "/sensor"]['$ref']) != __lSid) throw "Unexpected mismatch between sensors and sensorsRT";
            lMachineSensors[__iS].runtime = _pJson[__iS][0];
          }
          DSMS_CONTEXT.getRules(lMachine, _lSetupTriggers);
        }
      var _lCreateSensorsRT =
        function(_pJson)
        {
          lMachineSensors = (undefined != _pJson ? _pJson : []);
          var __lCommands = [];
          for (var __iS = 0; __iS < lMachineSensors.length; __iS++)
          {
            pRunCtx.samples[lMachineSensors[__iS][DSMS_CONTEXT.mNs + '/sensor_id']] = [];
            __lCommands.push(DSMS_CONTEXT.mQPrefix + "INSERT dsms:sensor=@" + trimPID(lMachineSensors[__iS].id) + ", dsms:run_id='" + pRunCtx.run_id + "', dsms:start_at=CURRENT_TIMESTAMP");
          }
          afy_batch_query(__lCommands, new QResultHandler(_lOnNewSensorsRT, null, null), {longnames:true});
        }
      var _lOnMachine = function(_pJson) { lMachine = (undefined != _pJson && _pJson.length > 0) ? _pJson[0] : null; DSMS_CONTEXT.getSensors(lMachine, _lCreateSensorsRT); }
      var _lGetMachine = function() { DSMS_CONTEXT.query("SELECT * FROM dsms:machines('" + pMachineName + "');", new QResultHandler(_lOnMachine, null, null)); }
      DSMS_CONTEXT.createClasses(_lGetMachine);
    }
  var lGetSensorPropVal =
    function(pSensor, pWhich, pProp)
    {
      // Return the actual value, if it's there...
      var _lPn = DSMS_CONTEXT.mNs + '/sensor_' + pProp;
      if (_lPn in pSensor)
        return pSensor[_lPn];
      // Or return a default value.
      for (var _iV = 0; _iV < pWhich.length; _iV++)
        if (pWhich[_iV][0] == pProp)
          return pWhich[_iV][1];
      return null;
    }
  var lGetResetTs =
    function(pSensor, pRunCtx)
    {
      // Note: This function performs a rough conversion of the timestamp stored in reset_ts, to a time_step equivalent; this is because rules cannot express time as time_step values, but my simulator depends on those values at the moment...
      var _lPn = DSMS_CONTEXT.mNs + '/reset_ts';
      if (!(_lPn in pSensor)) { return 0; }
      if ('reset_ts_cache' in pSensor && pSensor.reset_ts_cache.gmtraw == pSensor[_lPn]) { return pSensor.reset_ts_cache.time_step; }
      pSensor.reset_ts_cache = {time_step:pRunCtx.time_step, gmtraw:pSensor[_lPn]};
      return pSensor.reset_ts_cache.time_step;
    }
  this.step =
    function(pRunCtx)
    {
      // Here we're essentially simulating the reception & storage of sensor values.
      // Note: We let the caller decide how to do batching/transactions (in the case of js in a browser, the choices are limited).
      // Note: Couldn't store samples in a collection, due to pathsql limitations in that case (can't fetch a range of collection values).
      // Note: Whereas in a collection the natural ordering would have sufficed to track time, here I must store time_step explicitly.
      // Note: It's not possible presently to walk references in a class definition, and therefore in basic trigger definitions...
      //       therefore I must copy the machine_name and sensor_id to each sample, to retrieve samples specific to a sensor;
      //       the run_id is not vital as long as we assume that only one run is executed at a time (i.e. triggers can only come from
      //       the current run).
      var _lActions = [];
      for (var _iS = 0; _iS < lMachineSensors.length; _iS++)
      {
        var _lValue;
        var _lSn = lMachineSensors[_iS][DSMS_CONTEXT.mNs + '/sensor_id'];
        var _lMin = lGetSensorPropVal(lMachineSensors[_iS], DSMS_CONTEXT.mSensorProps.numbers, 'min');
        var _lMax = lGetSensorPropVal(lMachineSensors[_iS], DSMS_CONTEXT.mSensorProps.numbers, 'max');
        var _lGrad = 0.01 * (pRunCtx.time_step - lGetResetTs(lMachineSensors[_iS], pRunCtx)) / lGetSensorPropVal(lMachineSensors[_iS], DSMS_CONTEXT.mSensorProps.numbers, 'spread');
        var _lCurve = lGetSensorPropVal(lMachineSensors[_iS], DSMS_CONTEXT.mSensorProps.options, 'curve');
        var _lShiftDir = 1;
        switch (_lCurve)
        {
          case 'sc_constant': default: _lValue = 0.5 * (_lMin + _lMax); break;
          case 'sc_linear_up': _lValue = Math.min(_lMax, _lMin + _lGrad * _lMax); break;
          case 'sc_linear_down': _lValue = Math.max(_lMin, _lMax - _lGrad * _lMax); _lShiftDir = -1; break;
          case 'sc_sine': _lValue = 0.5 * (1.0 + Math.sin(_lGrad)) * _lMax; break;
        }
        var _lDoJitter = lGetSensorPropVal(lMachineSensors[_iS], DSMS_CONTEXT.mSensorProps.bools, 'jitter') == 'true';
        var _lDoShift = lGetSensorPropVal(lMachineSensors[_iS], DSMS_CONTEXT.mSensorProps.bools, 'shifts') == 'true';
        if (_lDoJitter)
          _lValue += 0.05 * (_lMax - _lMin) * Math.random();
        if (_lDoShift)
        {
          var _lNewOffsetIncrement = function() { return 0.25 * (_lMax - _lMin) * Math.random() * _lShiftDir; }
          if (!('shifts' in lMachineSensors[_iS]))
            { lMachineSensors[_iS].shifts = {offset:_lNewOffsetIncrement(), t0:pRunCtx.time_step}; }
          else if (pRunCtx.time_step - lMachineSensors[_iS].shifts.t0 > 20)
            { lMachineSensors[_iS].shifts.offset += _lNewOffsetIncrement(); lMachineSensors[_iS].shifts.t0 = pRunCtx.time_step; }
          _lValue += lMachineSensors[_iS].shifts.offset;
        }
        if (_lDoJitter || _lDoShift)
          _lValue = Math.max(_lMin, Math.min(_lMax, _lValue));
        pRunCtx.samples[_lSn].push({x:pRunCtx.time_step, y:1.5 * _lValue});
        _lActions.push(
          DSMS_CONTEXT.mQPrefix +
          "INSERT dsms:sensor_rt=@" + trimPID(lMachineSensors[_iS].runtime.id) +
          ", dsms:machine_name_cpy='" + pMachineName + // redundant with sensor_rt - see the note above; _cpy is used to avoid collisions with other classes.
          "', dsms:sensor_id_cpy='" + _lSn + // redundant with sensor_rt - see the note above; _cpy is used to avoid collisions with other classes.
          "', dsms:time_step=" + pRunCtx.time_step +
          ", dsms:\"sample/X\"=" + _lValue)
        // TODO: 2-variable cases (e.g. position); units; frequency
      }
      return _lActions;
    }
  this.term =
    function(pRunCtx)
    {
      // TODO: unregister the notifs; make sure this is called; this is not vital for demo (overhead on server should be tolerable)
    }
}
Emitter.processStep = function(pStepCommands, pCompletion)
{
  pStepCommands.splice(0, 0, "START TRANSACTION");
  pStepCommands.push("COMMIT");
  afy_batch_query(pStepCommands, new QResultHandler(function(){ if (pCompletion) pCompletion(); }, null, null), {longnames:true});
}
