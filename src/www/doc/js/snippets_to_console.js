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

function base64_decode(pIn)
{
  var lOut = "";
  var lC1, lC2, lC3 = "";
  var lE1, lE2, lE3, lE4 = "";
  var i = 0;
  var keyStr = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  pIn = pIn.replace(/[^A-Za-z0-9\+\/\=]/g, "");
  do
  {
    lE1 = keyStr.indexOf(pIn.charAt(i++));
    lE2 = keyStr.indexOf(pIn.charAt(i++));
    lE3 = keyStr.indexOf(pIn.charAt(i++));
    lE4 = keyStr.indexOf(pIn.charAt(i++));
    lC1 = (lE1 << 2) | (lE2 >> 4);
    lC2 = ((lE2 & 15) << 4) | (lE3 >> 2);
    lC3 = ((lE3 & 3) << 6) | lE4;
    lOut = lOut + String.fromCharCode(lC1);
    if (lE3 != 64) { lOut = lOut + String.fromCharCode(lC2); }
    if (lE4 != 64) { lOut = lOut + String.fromCharCode(lC3); }
    lC1 = lC2 = lC3 = "";
    lE1 = lE2 = lE3 = lE4 = "";
  } while (i < pIn.length);
  return unescape(lOut);
}

// Activate specially marked code fragments in the doc (using the .pathsql_snippet class).
$(document).ready(
  function() {
    // Home/logo button.
    $("#gh_logo_img").hover(function() { $(this).addClass("logo-highlighted"); }, function() { $(this).removeClass("logo-highlighted"); });
    $("#gh_logo_img").click(function() { window.location.href = 'http://' + location.hostname + ":" + location.port; });

    // TOC.
    var lTocBar = $("#afytocbar");
    $("#afytoclist").change(
      function()
      {
        var _lCurPage = $("#afytoclist option:selected").val();
        window.location.href = 'http://' + location.hostname + ":" + location.port + "/doc/" + escape(_lCurPage) + ".html";
      });

    // TODO: think about an implementation for search (possibly using a store).
    // var lSearch = $("<input id='afytocsearch'>");
    // lTocBar.append(lSearch);

    // Activation + stylization of snippets.
    $(".pathsql_snippet").each(
      function(_pI, _pE)
      {
        var lCode = $(_pE).clone();
        var lPre = lCode.wrap('<pre>').parent();
        var lWidget = $('<div class="pathsql_container">');
        var lButton = $('<div class="pathsql_button_runinplace">v</div>');
        var lResult= $('<div class="pathsql_inplace_result">');
        var lEscapeCode = function() { return escape(lCode.text().replace(/\+/g, "\+")).replace(/\+/g, "%2B").replace(/%A0/ig, "%20"); } // escape lCode.text(), and preserve '+' signs (e.g. for {+} in path expressions; by default '+' is automatically interpreted as a space).
        lWidget.append(lButton);
        lWidget.append(lPre);
        lWidget.append(lResult);
        $(_pE).replaceWith(lWidget);
        lCode.click(function() { window.open('http://' + location.hostname + ":" + location.port + "/console.html?query=" + lEscapeCode() + "&storeid=docsample#tab-basic"); });
        lCode.hover(function() { lCode.addClass("pathsql_snippet_highlighted"); lCode.css('cursor', 'pointer'); }, function() { lCode.removeClass("pathsql_snippet_highlighted"); });
        lButton.click(
          function()
          {
            $.ajax({
              type: "GET",
              url: "/db/?q=" + lEscapeCode() + "&i=pathsql&o=json",
              dataType: "text",
              async: true,
              cache: false,
              global: false,
              success: function(data) { lResult.text(data); },
              error: function() { lResult.text("error"); },
              beforeSend : function(req) { req.setRequestHeader('Authorization', "Basic ZG9jc2FtcGxlOg=="/*docsample:*/); }
            });
          });
      });
    $(".pathsql_inert").each(
      function(_pI, _pE)
      {
        var lCode = $(_pE).clone();
        var lPre = lCode.wrap('<pre>').parent();
        $(_pE).replaceWith(lPre);
      });

    // Easter Egg.
    $("#special_ee01").hover(function() { $(this).addClass("dimmed"); }, function() { $(this).removeClass("dimmed"); });
    $("#special_ee01").click(
      function()
      {
        if (0 != $("#special_ee01 p").length)
          return;
        var _lT = "TWFueSBwZW9wbGUgaGF2ZSBjb250cmlidXRlZCB0byBjb21wb25lbnRzIG9mIEFmZmluaXR5IGluIHRoZSBwYXN0LCBkaXJlY3RseSBhbmQgaW5kaXJlY3RseS48YnI+DQoNCldlIHdhbnRlZCB0byBleHByZXNzIGEgc3BlY2lhbCBzYWx1dGF0aW9uIHRvIHRoZSBmb2xsb3dpbmcgcGVvcGxlOjxicj4NCg0KSmlmaSBFcml5YXRhbjxicj4NCkFuZHJlIEdhdXRoaWVyPGJyPg0KV2Fzc2VmIEhhcm91bjxicj4NClJvaGFuIEpheWFyYWo8YnI+DQpKdXJnZW4gTGVzY2huZXI8YnI+DQpLb3JuZWwgTWFydG9uPGJyPg0KWWFzaXIgTW9oYW1tYWQ8YnI+DQpEYXJyZW4gUGVnZzxicj4NClNhdW15YSBSYW5qYW4gU2FodTxicj4NCkFuZHJldyBTa293cm9uc2tpPGJyPg0KTHVpcyBUYWxhdmVyYTxicj4NClJvZ2VyIFRhd2E8YnI+DQpTdW1hbnRoIFZhc3U8YnI+DQpNaWNoYWVsIFdpbnNlcjxicj4=";
        $(this).append($("<br><br>"));
        $(this).append($("<p style='font-size:0.4em;color:#666;'>" + base64_decode(_lT) + "</p>"));
      });
  });
