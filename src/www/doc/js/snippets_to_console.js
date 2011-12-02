// Activate specially marked code fragments in the doc (using the .mvsql_snippet class).
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
    $(".mvsql_snippet").each(
      function(_pI, _pE)
      {
        var lCode = $(_pE).clone();
        var lPre = lCode.wrap('<pre>').parent();
        $(_pE).replaceWith(lPre);
        lCode.click(function() { window.open('http://' + location.hostname + ":" + location.port + "/?query=" + escape($(this).text()) + "&storeid=docsample"); });
        lCode.hover(function() { lCode.addClass("mvsql_snippet_highlighted"); lCode.css('cursor', 'pointer'); }, function() { lCode.removeClass("mvsql_snippet_highlighted"); });
      });
    $(".mvsql_inert").each(
      function(_pI, _pE)
      {
        var lCode = $(_pE).clone();
        var lPre = lCode.wrap('<pre>').parent();
        $(_pE).replaceWith(lPre);
      });
  });
