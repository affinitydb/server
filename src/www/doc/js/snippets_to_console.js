// Activate specially marked code fragments in the doc (using the .pathsql_snippet class).
$(document).ready(
  function() {
    // TOC.
    var lTocBar = $("#mvtocbar");
    $("#mvtoclist").change(
      function()
      {
        var _lCurPage = $("#mvtoclist option:selected").val();
        window.location.href = 'http://' + location.hostname + ":" + location.port + "/doc/" + escape(_lCurPage) + ".html";
      });

    // TODO: think about an implementation for search (possibly using a store).
    // var lSearch = $("<input id='mvtocsearch'>");
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
        var lEscapeCode = function() { return escape(lCode.text().replace(/\+/g, "\+")).replace(/\+/g, "%2B"); } // escape lCode.text(), and preserve '+' signs (e.g. for {+} in path expressions; by default '+' is automatically interpreted as a space).
        lWidget.append(lButton);
        lWidget.append(lPre);
        lWidget.append(lResult);
        $(_pE).replaceWith(lWidget);
        lCode.click(function() { window.open('http://' + location.hostname + ":" + location.port + "/?query=" + lEscapeCode() + "&storeid=docsample#tab-basic"); });
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
              beforeSend : function(req) { req.setRequestHeader('Authorization', "Basic ZG9jc2FtcGxlOg=="); }
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
  });
