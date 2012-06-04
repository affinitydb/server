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
    lP = new Sns();

    // Make sure the tab is activated in all circumstances.
    if (!lP.active)
    {
      if (top === self)
        $("#content").trigger("activate_tab");
      else if (window.parent.location.href.indexOf("#tab-sns") >0)
        window.parent.$("#tab-sns").trigger("activate_tab");
    }
  });

/**
 * Sns.
 */
function Sns()
{
  // data model:
  //   single db
  //   list of users, with bidir masters/disciples
  //     http://snsdemo/...
  //       name
  //       masters, disciples
  //       sentposts
  //         timespan, text
  //   others' posts are collected by query
  //   notifications
  
  var lSnsPrefix = "PREFIX sns: 'http://snsdemo' ";

// have all the user names in mem (pid, name).
  var lUsersById = {};
  var lUsersByName = {};
  var lCurUser = null;
  var lUpdateCurUser =
    function(pJson)
    {
      if (undefined == pJson)
        return;
      lCurUser = pJson;
      $("#mymasters").empty();
      var _lMasters = lCurUser[afy_with_qname('http://snsdemo/masters')];
      alert("updating with: " + myStringify(_lMasters));
      for (var _i = 0; _i < _lMasters.length; _i++)
        $("#mymasters").append("<p>" + _lMasters[_i] + "</p>");
      // masters
      // disciples
      // posts
    }
  var lUpdateCur =
    function(pName)
    {
      var _lOnData = function(_pJson) { lUpdateCurUser(_pJson[0]); }
      afy_query(lSnsPrefix + "SELECT * FROM sns:users('" + pName + "');", new QResultHandler(_lOnData, null, null));
    }
  var lUpdate = function() { lUpdateCur(lCurUser[afy_with_qname('http://snsdemo/name')]); }
  var lPopulateUserLists =
    function()
    {
      afy_query(lSnsPrefix + "SELECT afy:pinID, sns:name FROM sns:users;", new QResultHandler(
        function(_pJson)
        {
          alert(myStringify(_pJson));
          for (var _i = 0; _i < _pJson.length; _i++)
          {
            var _lN = _pJson[_i]['http://snsdemo/name'];
            var _lOpt = "<option value='" + _lN + "'>" + _lN + "</option>";
            $("#userslist").append($(_lOpt));
            $("#masterslist").append($(_lOpt));
          }
        }, null, null), {longnames:true});
    }
  var lCreateClasses = function() { afy_query(lSnsPrefix + "CREATE CLASS sns:users AS SELECT * WHERE sns:name = :0;", new QResultHandler(function(){ lPopulateUserLists(); }, null, null)); }
  var lOnClassCount = function(_pJson) { if (undefined != _pJson && parseInt(_pJson) == 0) { lCreateClasses(); } else lPopulateUserLists(); }
  afy_query(lSnsPrefix + "SELECT * FROM afy:ClassOfClasses WHERE CONTAINS(afy:classID, 'snsdemo');", new QResultHandler(lOnClassCount, null, null), {countonly:true});
  
  var lOnNewUser =
    function(pName)
    {
      var _lDoCreateUser = function() { afy_query(lSnsPrefix + "INSERT sns:name='" + pName + "';", new QResultHandler(function(_pJson){ $("#userslist").append($("<option value='" + pName + "'>" + pName + "</option>")); }, null, null)); }
      var _lOnCount = function(_pJson) { if (undefined != _pJson && parseInt(_pJson) > 0) { alert("User " + pName + " already exists"); return; } _lDoCreateUser(); }
      afy_query(lSnsPrefix + "SELECT * FROM sns:users('" + pName + "');", new QResultHandler(_lOnCount, null, null), {countonly:true});
    }
  $("#usernew").click(function(){ lOnNewUser(prompt("New User's Name", "")); });
  $("#userslist").click(function(){ lUpdateCur($("#masterslist option:selected").val()); });

  var lOnNewMaster =
    function()
    {
      var _lNewMasterName = $("#masterslist option:selected").val();
      if (_lNewMasterName == lCurUser[afy_with_qname('http://snsdemo/name')])
        return;
      
      var _lOnGotMaster = function(_pJson) { afy_query(lSnsPrefix + "UPDATE @" + lCurUser.id + " ADD sns:masters=@" + _pJson[0].id + ";", new QResultHandler(function() { lUpdate(); }, null, null)); }
      afy_query(lSnsPrefix + "SELECT * FROM sns:users('" + _lNewMasterName + "');", new QResultHandler(_lOnGotMaster, null, null));
    }
  $("#masternew").click(function(){ lOnNewMaster(); });
}
