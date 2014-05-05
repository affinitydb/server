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

function Emitter(pMachineName)
{
  var lThis = this;
  var lMachine = null; // JSON of the machine + a virtual 'runtime' property, pointing to the corresponding runtime objects.
  var lMachineSensors = []; // JSON of the sensors.
  this.init =
    function(pRunCtx, pOnReady)
    {
      lMachine = null;
      lMachineSensors.splice(0);
      var _lCreateRTCtx =
        function(_pJson, _pMachine)
        {
          lMachineSensors = (undefined != _pJson ? _pJson : []);
          for (var __iS = 0; __iS < lMachineSensors.length; __iS++)
            pRunCtx.samples[lMachineSensors[__iS][DSMS_CONTEXT.mNs + '/sensor_id']] = [];
          DSMS_CONTEXT.query(
            "INSERT dsms:machine=@" + trimPID(_pMachine.id) + ", dsms:run_id='" + pRunCtx.run_id + "', dsms:start_at=CURRENT_TIMESTAMP",
            new QResultHandler(function(_pJson) { _pMachine.runtime = _pJson[0]; pOnReady(); }, null, null));
        }
      var _lOnMachine = function(_pJson) { lMachine = (undefined != _pJson && _pJson.length > 0) ? _pJson[0] : null; DSMS_CONTEXT.getSensors(lMachine, function(_pJson) { _lCreateRTCtx(_pJson, lMachine); }); }
      var _lGetMachine = function() { DSMS_CONTEXT.query("SELECT * FROM dsms:machines('" + pMachineName + "');", new QResultHandler(_lOnMachine, null, null)); }
      DSMS_CONTEXT.createClasses(_lGetMachine);
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
        var _lSn = lMachineSensors[_iS][DSMS_CONTEXT.mNs + '/sensor_id'];
        _lActions.push(
          DSMS_CONTEXT.mQPrefix +
          "INSERT dsms:machine_rt=@" + trimPID(lMachine.runtime.id) +
          ", dsms:machine_name_cpy='" + pMachineName + // redundant with machine_rt - see the note above; _cpy is used to avoid collisions with other classes.
          "', dsms:sensor_id_cpy='" + _lSn +
          "', dsms:time_step=" + pRunCtx.time_step +
          ", dsms:\"sample/X\"=(SELECT dsms:sensor_func(" + Math.random() + ", " + Math.random() + ", " + pRunCtx.time_step + ", " + Math.sin(pRunCtx.time_step / 10.0) + ") FROM dsms:sensors WHERE dsms:sensor_id='" + _lSn + "')");
      }
      return _lActions;
    }
  this.term = function(pRunCtx) {}
}
Emitter.processStep = function(pRunCtx, pStepCommands, pCompletion)
{
  pStepCommands.splice(0, 0, "START TRANSACTION");
  pStepCommands.push("COMMIT");
  var lOnResults =
    function(_pJson)
    {
      for (var _iR = 0; _iR < _pJson.length; _iR++)
      {
        var _lSample = _pJson[_iR][0];
				var _lX = _lSample[DSMS_CONTEXT.mNs + '/sample/X'];
				if (typeof(_lX) != 'number') // Note: the (SELECT...) in Emitter.step has produced scalars and collections in alternance, depending on kernel versions...
					_lX = _lX[0];
        var _lS = {x:pRunCtx.time_step, y:1.5 * _lX};
        pRunCtx.samples[_lSample[DSMS_CONTEXT.mNs + '/sensor_id_cpy']].push(_lS);
      }
    }
  afy_batch_query(pStepCommands, new QResultHandler(function(_pJson){ lOnResults(_pJson); if (pCompletion) pCompletion(); }, null, null), {longnames:true});
}

// Notes:
// http://stackoverflow.com/questions/6209042/node-js-http-request-slows-down-under-load-testing-am-i-doing-something-wrong
