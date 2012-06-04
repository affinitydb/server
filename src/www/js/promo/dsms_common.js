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

function defaultOption(pOptName) { var lE = $("#" + pOptName); return lE.length != 0 ? lE.text() : pOptName; }
var DSMS_CONTEXT = new Object();
DSMS_CONTEXT.mRadical = "dsmsdemo";
DSMS_CONTEXT.mNs = "http://" + DSMS_CONTEXT.mRadical;
DSMS_CONTEXT.mQPrefix = "PREFIX dsms: '" + DSMS_CONTEXT.mNs + "' ";
DSMS_CONTEXT.mSensorProps = // Sensor properties grouped by value type: [name, default] (assumes that the html contains some special items).
{
  options:[['type', defaultOption("st_temperature")], ['curve', defaultOption("sc_constant")], ['connected', 'none']],
  bools:[['jitter', false], ['shifts', false]],
  numbers:[['frequency', 1], ['spread', 1], ['min', 0], ['max', 100]],
}
DSMS_CONTEXT.query = function(pSqlStr, pResultHandler, pOptions) { var lOptions = (undefined != pOptions ? pOptions : {}); if (!('countonly' in lOptions && lOptions.countonly)) { lOptions.longnames = true; } return afy_query(DSMS_CONTEXT.mQPrefix + pSqlStr, pResultHandler, lOptions); }
DSMS_CONTEXT.queryMulti = function(pSqlArray, pResultHandler, pOptions)
{
  var lOptions = (undefined != pOptions ? pOptions : {});
  lOptions.longnames = true;
  if (typeof(pSqlArray) == 'string') { pSqlArray = [pSqlArray]; }
  var lBatch = pSqlArray.filter(function(_p) { return _p.match(/^\s*$/) ? null : _p; }).map(function(_p) { return _p.match(/(start transaction)|(commit)/i) ? _p : (DSMS_CONTEXT.mQPrefix + _p); });
  return afy_batch_query(lBatch, pResultHandler, lOptions);
}
DSMS_CONTEXT.getRefs = function(pObj, pProp) { var lR = []; if (!(pProp in pObj)) { return lR; } if ('$ref' in pObj[pProp]) lR.push({eid:-1, ref:trimPID(pObj[pProp]['$ref'])}); else for (var iR in pObj[pProp]) lR.push({eid:iR, ref:trimPID(pObj[pProp][iR]['$ref'])}); return lR; }
DSMS_CONTEXT.resolveRefs = function(pObj, pProp, pCompletion)
{
  if (undefined == pObj) { if (undefined != pCompletion) { pCompletion(null, []); } return; }
  var lRefs = DSMS_CONTEXT.getRefs(pObj, pProp);
  if (0 == lRefs.length) { if (undefined != pCompletion) { pCompletion(null, lRefs); } return; }
  DSMS_CONTEXT.query("SELECT * WHERE @ IN (" + lRefs.map(function(_pR) { return "@" + _pR.ref; }).join(",") + ");", new QResultHandler(function(_pJson) { pCompletion(_pJson, lRefs); }, null, null));
}
DSMS_CONTEXT.getMachinesNames = function(pCompletion)
{
  DSMS_CONTEXT.query("SELECT dsms:machine_name FROM dsms:machines;", new QResultHandler(pCompletion, null, null));
}
DSMS_CONTEXT.updateMachinesList = function(pListUI, pCompletion)
{
  pListUI.empty();
  var _lOnMachines =
    function(_pJson)
    {
      if (undefined == _pJson) { return; }
      for (var _iM = 0; _iM < _pJson.length; _iM++)
      {
        var _lMn = _pJson[_iM][DSMS_CONTEXT.mNs + "/machine_name"];
        pListUI.append($("<option id='" + _lMn + "'>" + _lMn + "</option>"));
      }
      if (undefined != pCompletion)
        pCompletion();
    }
  DSMS_CONTEXT.getMachinesNames(_lOnMachines);
}
DSMS_CONTEXT.getSensors = function(pMachine, pCompletion) { DSMS_CONTEXT.resolveRefs(pMachine, DSMS_CONTEXT.mNs + '/sensors', pCompletion); }
DSMS_CONTEXT.getRules = function(pMachine, pCompletion) { DSMS_CONTEXT.resolveRefs(pMachine, DSMS_CONTEXT.mNs + '/rules', pCompletion); }
DSMS_CONTEXT.extractFullClassName = function(pClassDef)
{
  return pClassDef.match(/^CREATE CLASS (.*) AS SELECT/i)[1].replace("dsms:", "http://dsmsdemo/").replace(/\"/g, "");
}
DSMS_CONTEXT.createClass = function(pClassDef, pCompletion)
{
  // Review: Why did I need to use 'CONTAINS' here? Why did '=' not work? Can afy:ClassOfClasses be used as a family, or not?
  var lClassName = DSMS_CONTEXT.extractFullClassName(pClassDef);
  var lDoCreateClass = function() { myLog("Creating class " + lClassName); DSMS_CONTEXT.query(pClassDef, new QResultHandler(pCompletion, null, null)); }
  var lOnClassCount = function(_pJson) { if (undefined == _pJson || parseInt(_pJson) == 0) { lDoCreateClass(); } else { myLog("Class " + lClassName + " already exists"); pCompletion(); } }
  DSMS_CONTEXT.query("SELECT * FROM afy:ClassOfClasses WHERE CONTAINS(afy:classID, '" + lClassName + "');", new QResultHandler(lOnClassCount, null, null), {countonly:true});
}
DSMS_CONTEXT.createClasses = function(pCompletion)
{
  var lClassDecl =
  [
    // Runtime stuff (sample-related).
    "CREATE CLASS dsms:sensors_rt AS SELECT * WHERE dsms:sensor IN :0 AND dsms:run_id IN :1;",
    "CREATE CLASS dsms:samples AS SELECT * WHERE dsms:sensor_rt IN :0 AND dsms:time_step IN :1;",
    "CREATE CLASS dsms:basic_rule AS SELECT * WHERE dsms:machine_name_cpy = :0",
    // Basic building blocks (static); some of these classes are not needed by the app (just for convenience in the console, e.g. show me all rules).
    "CREATE CLASS dsms:rules AS SELECT * WHERE dsms:machine IN :0 AND dsms:rule_id IN :1;",
    "CREATE CLASS dsms:sensors AS SELECT * WHERE dsms:machine IN :0 AND dsms:sensor_id IN :1;",
    "CREATE CLASS dsms:machines AS SELECT * WHERE dsms:machine_name IN :0;",
  ];
  var lProcess =
    function()
    {
      if (0 == lClassDecl.length) { if (undefined != pCompletion) { pCompletion(); } return; }
      DSMS_CONTEXT.createClass(lClassDecl.pop(), lProcess);
    }
  lProcess();
}
DSMS_CONTEXT.instrSeq = function()
{
  var iSubStep = 0;
  var lSubSteps = new Array();
  this.next = function() { iSubStep++; if (iSubStep < lSubSteps.length) lSubSteps[iSubStep](); }
  this.push = function(_pSubStep) { lSubSteps.push(_pSubStep); }
  this.start = function() { iSubStep = 0; if (lSubSteps.length > 0) lSubSteps[iSubStep](); }
  this.curstep = function() { return iSubStep; }
}
