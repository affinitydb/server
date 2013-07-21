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
    var lP = new Prez();

    // Make sure the tab is activated in all circumstances.
    if (!lP.active)
    {
      if (top === self)
        $("#thecanvas").trigger("activate_tab");
      else if (window.parent.location.href.indexOf("#tab-promo") >0)
        window.parent.$("#tab-promo").trigger("activate_tab");
    }
  });

/**
 * PrezRenderCtx
 * The rendering context for the "live" presentation.
 */
function PrezRenderCtx(pCanvas, pDrawFunc)
{
  var lThis = this;
  this.c2d = pCanvas.get(0).getContext("2d"); // The 2d-ctx; will throw an exception when not supported.
  this.c2d.setTransform(1, 0, 0, 1, 0, 0);
  this.slideNum = 0; // The current slide.
  this.slideStep = 0; // The current sub-step in the current slide.
  this.fastStep = false; // True when the current step was reached by fast-stepping (i.e. forced).
  this.slideMode = 0 // The current mode (sql/affinity/...); for now, the whole slide is in 1 mode at a time.
  this.slideNumSteps = 0; // The number of sub-steps in the current slide (for progress indicator).
  this.slideNumModes = 0; // The number of modes in the current slide (for progress indicator).
  this.timeTick = 50; // The elapsed time between each frame, in ms.
  this.time = 0; // The animation time, in ticks (time just keeps increasing until the slide changes).
  this.drawFunc = pDrawFunc; // The function that redraws the canvas.
  this.changeCursor = function(pType) { pCanvas.css("cursor", pType); }
  this.updateCanvasSize = function() { pCanvas.attr("width", pCanvas.width()); pCanvas.attr("height", pCanvas.height()); }
  this.setSlideNum = function(pDeck, pNum) { lThis.slideNum = pNum; if (lThis.slideNum < 0 || lThis.slideNum >= pDeck.getNumSlides()) lThis.slideNum = 0; }
  this.nextSlide = function(pDeck) { lThis.slideNum++; if (lThis.slideNum >= pDeck.getNumSlides()) lThis.slideNum = 0; }
  this.prevSlide = function(pDeck) { lThis.slideNum--; if (lThis.slideNum < 0) lThis.slideNum = pDeck.getNumSlides() - 1; }
  this.resetSlide = function() { lThis.slideStep = 0; lThis.fastStep = false; lThis.slideMode = 0; }
  this.clampPct = function(pPct) { return pPct < 0 ? 0 : (pPct > 1 ? 1 : pPct); }
  this.slideModes = ["affinity", "sql", "docdb", "graphdb"];

  // For color transitions.
  var lChannels = [{mask:0xff0000, shift:16}, {mask:0x00ff00, shift:8}, {mask:0x0000ff, shift:0}];
  var lEvalChannel =
    function(pChannel, pParams)
    {
      var _lFrom = (pParams.from & pChannel.mask) >> pChannel.shift;
      var _lTo = (pParams.to & pChannel.mask) >> pChannel.shift;
      var _lV = (_lTo > _lFrom ? Math.floor(_lFrom + ((_lTo - _lFrom) * pParams.pct)) : Math.floor(_lTo + ((_lFrom - _lTo) * (1.0 - pParams.pct)))).toString(16);
      return _lV.length > 1 ? _lV : ("0" + _lV);
    }
  this.calcColor =
    function(pParams/*{from:hex, to:hex, pct:in [0.0, 1.0]}*/)
    {
      return "#" + lEvalChannel(lChannels[0], pParams) + lEvalChannel(lChannels[1], pParams) + lEvalChannel(lChannels[2], pParams);
    }
}
PrezRenderCtx.TABSIZE = 20;

/**
 * PrezSlideDeck
 */
function PrezSlideDeck()
{
  var lThis = this;
  var lSlides = $(".slide");  
  this.getNumSlides = function() { return lSlides.length; }
  this.getCurSlide = function(pCtx) { return $(lSlides[pCtx.slideNum]); }
}

/**
 * PrezSlideDriver
 * The logic required to drive the PrezScene's contents
 * from the html definition of a slide, over time.
 */
function PrezSlideDriver(pDeck, pScene, pCtx)
{
  var lThis = this;
  var lSlide = null, lSlidePromoStyle = null;
  var lFontSizes;
  var lNumSteps = 0;
  var lCanvas = $("#thecanvas");
  var lAllModes = pCtx.slideModes;
  var lSlideModes = [];
  var lDrawTimer = null;

  var lWithBullet = function(pHtmlElm) { return pHtmlElm.hasClass("bullet_none") ? "none" : "default"; }
  var lExtractVs = function(pHtmlElm, pMode) { var _lC = pHtmlElm.attr('class'); if (undefined == _lC) { return null; } var _lR = _lC.split(/\s+/).filter(function(_pC) { return undefined != _pC.match(/^vs_/); }); if (pMode == "affinity") _lR.push("vs_affinity"); return _lR; }
  var lProcessHtmlElm =
    function(pHtml, pMode, pAdder, pContainer, pLevel)
    {
      var _lHtml = $(pHtml);
      var _lLevel = (undefined != pLevel) ? pLevel : 0;
      var _lPromoStyle = _lHtml.attr("promostyle");
      if (undefined != _lPromoStyle)
        _lPromoStyle = $.parseJSON(_lPromoStyle);
      if (_lHtml.hasClass("jsmodel"))
        pAdder(new PrezElm_ObjGraph(_lHtml.text()), pContainer);
      else if (_lHtml.hasClass("mathgraph"))
        pAdder(new PrezElm_MathGraph(_lHtml.text()), pContainer);
      else if (_lHtml.hasClass("staticgraph"))
        pAdder(new PrezElm_StaticGraph(_lHtml.text(), pCtx.slideStep), pContainer);
      else if (_lHtml.hasClass("vspacer"))
        pAdder(new PrezElm_VSpacer(parseInt(_lHtml.text()), (undefined != _lPromoStyle && 'delay' in _lPromoStyle) ? _lPromoStyle.delay : null), pContainer);
      else if (_lHtml.hasClass("urllink"))
        pAdder(new PrezElm_Url(_lHtml, _lLevel), pContainer);
      else if (_lHtml.hasClass("code_comparator"))
        pAdder(new PrezElm_CodeComparator(_lHtml), pContainer);
      else if (_lHtml.hasClass("container_horizontal") || _lHtml.hasClass("container_vertical"))
      {
        var _lCntOpt = {};
        var _lWidthPct = (undefined != _lPromoStyle && 'width_pct' in _lPromoStyle) ? _lPromoStyle.width_pct : null;
        if (undefined != _lWidthPct)
          _lCntOpt.widthPct = _lWidthPct;
        var _lCnt = new PrezContainer(_lHtml.hasClass("container_horizontal") ? 'horizontal' : 'vertical', 'custom', _lCntOpt);
        pAdder(_lCnt, pContainer);
        var _lLIs = _lHtml.children("ul").children("li");
        for (var _iLI = 0; _iLI < _lLIs.length; _iLI++)
          lProcessHtmlElm($(_lLIs[_iLI]), pMode, pAdder, _lCnt);
      }
      else if (0 != _lHtml.children("ul").length)
      {
        var _lTxt = _lHtml.children("p");
        if (undefined != _lTxt && undefined != _lTxt.html())
          pAdder(new PrezElm_FadeInTxt(_lTxt.html(), {mode:pMode, level:_lLevel, bullet:lWithBullet(_lTxt.first()), highlights:lExtractVs(_lTxt.first(), pMode), fontsizes:lFontSizes, code_snippet:_lTxt.hasClass("code_snippet"), tooltip:_lTxt.attr("tooltip")}), pContainer);
        var _lLIs = _lHtml.children("ul").children("li");
        for (var _iLI = 0; _iLI < _lLIs.length; _iLI++)
          lProcessHtmlElm(_lLIs[_iLI], pMode, pAdder, pContainer, _lLevel + 1);
      }
      else
        pAdder(new PrezElm_FadeInTxt(_lHtml.html(), {mode:pMode, level:_lLevel, bullet:lWithBullet(_lHtml), highlights:lExtractVs(_lHtml, pMode), fontsizes:lFontSizes, code_snippet:_lHtml.hasClass("code_snippet"), tooltip:_lHtml.attr("tooltip")}), pContainer);
    }
  var lImmediateAdder = function(pPrezElm, pContainer) { pScene.addElementTo(pCtx, pPrezElm, pContainer); }
  var lDelayedAdder = function(pPrezElm, pContainer) { pScene.delayAddElementTo(pCtx, pPrezElm, pContainer); }
  var lAddCurrentStep =
    function()
    {
      // Review: What if the step is not represented in the current mode? will this be needed?
      // Review: In that case, the widget's < > logic should be based on the modes of this step only (i.e. every 'next' should be guarantied to have an effect)
      var _lStepModes = {}
      lSlide.find(".step_" + pCtx.slideStep).each(function(_pI, _pE) { var _lE = $(_pE); lAllModes.forEach(function(_pM) { if (_lE.hasClass("mode_" + _pM)) _lStepModes[_pM] = 1; }); });
      if (countProperties(_lStepModes) > 2)
      {
        var _lAdder = pScene.hasDelayedElements() ? lDelayedAdder : lImmediateAdder;
        _lAdder(new PrezElm_LRButtons(function() {lThis.prevMode();}, function() {lThis.nextMode()}));
      }
      var _lCnt = null, _lCntLeft = null, _lCntRight = null;
      if (countProperties(_lStepModes) > 1)
      {
        var _lSideBySide = true; // This could become a mode/option activated by a ui-button/html-class; for now, I just want to experiment manually.
        if (_lSideBySide)
        {
          _lCnt = new PrezContainer('horizontal', 'comparison', {fillFrame:"#eeeeee", strokeFrame:"#999999"});
          _lCntLeft = new PrezContainer('vertical', 'comparison_left', {strokeFrame:"#999999"});
          _lCntRight = new PrezContainer('vertical', 'comparison_right');
          lImmediateAdder(_lCntLeft, _lCnt);
          lImmediateAdder(_lCntRight, _lCnt);
          lImmediateAdder(_lCnt);
          _lCnt.layout(pCtx);
        }
        else
        {
          _lCntRight = new PrezContainer('vertical', 'comparison_right');
          _lCntLeft = _lCntRight;
          lImmediateAdder(_lCntRight);
        }
      }
      lSlide.find(".step_" + pCtx.slideStep + ".mode_all").each(function(_i, _e) { lProcessHtmlElm(_e, "all", lDelayedAdder, _lCntLeft); });
      if (_lSideBySide)
        lSlide.find(".step_" + pCtx.slideStep + ".mode_affinity").each(function(_i, _e) { lProcessHtmlElm(_e, "affinity", lDelayedAdder, _lCntLeft); });
      var _lCurMode = lAllModes[pCtx.slideMode];
      if (_lCurMode != 'affinity' || !_lSideBySide)
        lSlide.find(".step_" + pCtx.slideStep + ".mode_" + _lCurMode).each(function(_i, _e) { lProcessHtmlElm(_e, _lCurMode, lDelayedAdder, _lCntRight); });
    }

  var lSlideCurModeIdx = function() { for (var _iM = 0; _iM < lSlideModes.length; _iM++) if (lSlideModes[_iM].i == pCtx.slideMode) return _iM; return -1; }
  var lModeTransitionRunning = false;
  var lChangeMode =
    function(pNewMode, pDirection)
    {
      if (lModeTransitionRunning)
        return;
      var _lCntRight = pScene.getElementsByLabel('comparison_right');
      if (0 == _lCntRight.length)
        return;
      pScene.removeDelayedElements(lAllModes[pCtx.slideMode]);
      var _lFadeIn =
        function(_pTransition, _pCntRight)
        {
          lModeTransitionRunning = false;
          pScene.removeElement(_pTransition);
          var _lCnt = _pCntRight[0].getParent();
          _lCnt.removeElement(_pCntRight[0]);
          pCtx.slideMode = pNewMode;
          var _lCntRight = new PrezContainer('vertical', 'comparison_right');
          lImmediateAdder(_lCntRight, _lCnt);
          var _lCurMode = lAllModes[pCtx.slideMode];
          if (_lCnt.label != 'comparison' || _lCurMode != 'affinity')
            lSlide.find(".step_" + pCtx.slideStep + ".mode_" + _lCurMode).each(function(_i, _e) { lProcessHtmlElm(_e, _lCurMode, lDelayedAdder, _lCntRight); });
          pScene.layout(pCtx);
        }
      pScene.addElement(pCtx, new PrezTransition_Basic(_lCntRight, _lFadeIn, {direction:pDirection}));
      lModeTransitionRunning = true;
    }

  var lIdleInterval = (5500 / pCtx.timeTick);
  var lStayOnSlide = false;
  var lHeartBeat =
    function()
    {
      // Advance time.
      pCtx.time++;

      // If the user remains idle for too long, move on automatically.
      if ((pCtx.time - pScene.lastModifTime()) > lIdleInterval && !pScene.hasDelayedElements())
        lThis.moveForward(false);

      // Render.
      // var _lT0 = new Date().getTime();
      pCtx.drawFunc(pCtx);
      // console.log("render frame: " + (new Date().getTime() - _lT0) + " ms (at " + _lT0 + ")");
    }

  this.start = function() { if (undefined == lDrawTimer && undefined != pCtx.drawFunc) { lDrawTimer = setInterval(lHeartBeat, pCtx.timeTick); } }
  this.stop = function() { clearInterval(lDrawTimer); lDrawTimer = null; }
  this.pauseResume = function() { if (undefined == lDrawTimer) lThis.start(); else lThis.stop(); }
  this.stayOnSlide = function() { lStayOnSlide = true; }
  this.initSlide =
    function()
    {
      // Set a # suffix, for direct navigation.
      window.location.hash = pCtx.slideNum + 1;

      // Grab the slide's html definition.
      lStayOnSlide = false;
      lSlide = pDeck.getCurSlide(pCtx);
      lSlidePromoStyle = lSlide.attr("promostyle");
      if (undefined != lSlidePromoStyle)
        lSlidePromoStyle = $.parseJSON(lSlidePromoStyle);
      lIdleInterval = ((undefined != lSlidePromoStyle && 'idledelay' in lSlidePromoStyle) ? lSlidePromoStyle.idledelay : 5500) / pCtx.timeTick;
      lFontSizes = ((undefined != lSlidePromoStyle && 'fontsizes' in lSlidePromoStyle) ? lSlidePromoStyle.fontsizes : [18, 12]);
      lIntraDelayInMs = ((undefined != lSlidePromoStyle && 'intradelay' in lSlidePromoStyle) ? lSlidePromoStyle.intradelay : 2000);
      pScene.setIntraDelayInMs(lIntraDelayInMs);

      // Count the total number of steps on this slide.
      for (lNumSteps = 0;; lNumSteps++)
        if (0 == lSlide.find(".step_" + lNumSteps).length)
          break;
      pCtx.slideNumSteps = lNumSteps;

      // Determine what modes are represented on this slide.
      lSlideModes.splice(0);
      for (var _iM = 0; _iM < lAllModes.length; _iM++)
        if (lSlide.find(".mode_" + lAllModes[_iM]).length > 0)
          lSlideModes.push({m:lAllModes[_iM], i:_iM});
      pCtx.slideNumModes = lSlideModes.length;

      // Clear the scene.
      pScene.clear(pCtx);
      pCtx.resetSlide();
      pCtx.slideMode = lSlideModes.length > 0 ? lSlideModes[0].i : 0;

      // Start the scene.
      pScene.addElement(pCtx, new PrezElm_Bkg(lCanvas.width(), lCanvas.height(), lSlidePromoStyle));
      lSlide.find("h1").each(function(_i, _e){ pScene.addElement(pCtx, new PrezElm_Title($(_e).text(), "24pt Helvetica", pDeck)); });
      lAddCurrentStep();
    }
  this.nextStep =
    function(pFast)
    {
      if (pCtx.slideStep >= lNumSteps - 1)
        return;
      var _lNumSpacers, _lNumOthers;
      var _lKeepTrailingSpacer = (pCtx.slideStep < lNumSteps - 1);
      do
      {
        pCtx.slideStep++;
        pCtx.fastStep = pFast;
        _lNumSpacers = _lNumOthers = 0;
        if (pFast)
          lSlide.find(".step_" + pCtx.slideStep).each(function(_pI, _pE) { var _lE = $(_pE); if (_lE.hasClass("vspacer")) _lNumSpacers++; else _lNumOthers++; });
        if (_lKeepTrailingSpacer && pCtx.slideStep == lNumSteps - 1)
          _lKeepTrailingSpacer = (1 == _lNumSpacers && 0 == _lNumOthers);
        lAddCurrentStep();
      } while (_lNumSpacers > 0 && _lNumOthers == 0);
      if (pFast && pScene.hasDelayedElements() && (pCtx.slideStep <= lNumSteps - 1 || !_lKeepTrailingSpacer))
        pScene.flushDelayedElements(pCtx);
    }
  this.nextMode =
    function()
    {
      if (lSlideModes.length < 2) return;
      var _lMidx = lSlideCurModeIdx();
      var _lNewMode = -1 == _lMidx ? 0 : ((_lMidx < lSlideModes.length - 1) ? lSlideModes[_lMidx + 1].i : lSlideModes[0].i);
      lChangeMode(_lNewMode, 'left');
    }
  this.prevMode =
    function()
    {
      if (lSlideModes.length < 2) return;
      var _lMidx = lSlideCurModeIdx();
      var _lNewMode = -1 == _lMidx ? 0 : ((_lMidx > 0) ? lSlideModes[_lMidx - 1].i : lSlideModes[lSlideModes.length - 1].i);
      lChangeMode(_lNewMode, 'right');
    }
  this.nextSlide = function() { pCtx.nextSlide(pDeck); lThis.initSlide(); }
  this.prevSlide = function() { pCtx.prevSlide(pDeck); lThis.initSlide(); }
  this.moveForward =
    function(pFast)
    {
      if (undefined == lDrawTimer)
        lThis.start();
      else if (pScene.hasDelayedElements())
        pScene.flushDelayedElements(pCtx);
      else if (pCtx.slideStep < lNumSteps - 1)
        lThis.nextStep(pFast);
      else if (lSlideModes.length > 1 && pCtx.slideMode < lSlideModes[lSlideModes.length - 1].i)
        lThis.nextMode();
      else if (!lStayOnSlide)
        lThis.nextSlide();
    }
}

/**
 * PrezContainer
 * A bounding box in the PrezScene, with top-down or left-right flow.
 */
function PrezContainer(pOrientation, pLabel, pOptions)
{
  var lThis = this;
  var lParent = null;
  var lMuted = false;
  var lElements = [];
  var lX = 10, lY = 5, lNextY = 0, lWidthConstraint = null;
  // ---
  var lGetOption = function(_pWhat, _pDefault) { return (undefined != pOptions && _pWhat in pOptions) ? pOptions[_pWhat] : _pDefault; }
  var lWidthPct = lGetOption('widthPct', 1.0);
  var lStrokeFrame = lGetOption('strokeFrame', null);
  var lFillFrame = lGetOption('fillFrame', null);
  // ---
  this.label = pLabel;
  this.setParent = function(pCtx, pParent) { lParent = pParent; }
  this.getParent = function() { return lParent; }
  this.setWidthConstraint = function(pWidthConstraint) { lWidthConstraint = pWidthConstraint; }
  this.getWidthConstraint = function() { return lWidthConstraint; }
  this.getEffectiveWidthConstraint = function(pCtx) { return lWidthPct * (undefined != lWidthConstraint ? lWidthConstraint : (undefined != lParent ? lParent.getEffectiveWidthConstraint(pCtx) : (pCtx.c2d.canvas.width - 20))); }
  this.setPos = function(pPos) { if ('x' in pPos) lX = pPos.x; if ('y' in pPos) { lNextY = (lNextY - lY) + pPos.y; lY = pPos.y; } }
  this.getPos = function() { return {x:lX, y:lY}; }
  this.evalHeight =
    function(pCtx)
    {
      if (0 == lElements.length)
        return 0;
      if (pOrientation == 'horizontal')
      {
        var _lH = 0;
        lElements.forEach(function(_pE) { var _lHe = _pE.evalHeight(pCtx); if (_lHe > _lH) _lH = _lHe; });
        return _lH;
      }
      return lNextY - lY;
    }
  this.mute = function(pMuted) { lMuted = pMuted; }
  // ---
  this.clear = function(pCtx) { lElements.splice(0); lNextY = lY; }
  this.render =
    function(pCtx)
    {
      if (lMuted)
        return;
      var _lW = null, _lH = null;
      var _lInitWH = function() { if (undefined == _lW) { _lW = lThis.getEffectiveWidthConstraint(pCtx); } if (undefined == _lH) { _lH = lThis.evalHeight(pCtx); } }
      if (undefined != lFillFrame)
      {
        _lInitWH();
        pCtx.c2d.fillStyle = lFillFrame;
        pCtx.c2d.globalAlpha = 0.5;
        pCtx.c2d.fillRect(lX, lY, _lW, _lH);
        pCtx.c2d.globalAlpha = 1.0;
      }
      if (undefined != lStrokeFrame)
      {
        _lInitWH();
        pCtx.c2d.strokeStyle = lStrokeFrame;
        pCtx.c2d.strokeRect(lX, lY, _lW, _lH);
      }
      // var _lProfiling = [];
      var _lSimpleRender = function(_pE) { _pE.render(pCtx); }
      // var _lProfiledRender = function(_pE) { var _lT0 = new Date().getTime(); _pE.render(pCtx); _lProfiling.push({name:_pE.constructor.toString().match(/function ([a-zA-Z0-9\_]+)/)[1], time:new Date().getTime() - _lT0}); }
      lElements.forEach(_lSimpleRender);
      // if (_lProfiling.length > 0)
      //   console.log(myStringify(_lProfiling));
    }
  this.postRender = function(pCtx) { lElements.forEach(function(_pE) { if ('postRender' in _pE) _pE.postRender(pCtx); }); }
  this.layout =
    function(pCtx)
    {
      if (0 == lElements.length)
        return;
      // var _lProfiling = [];
      // var _lT0 = new Date().getTime();
      if (pOrientation == "horizontal")
      {
        var _lW = lThis.getEffectiveWidthConstraint(pCtx);
        var _lWe = Math.floor(_lW / lElements.length);
        for (var _iE = 0, _lX = lX; _iE < lElements.length; _iE++, _lX += _lWe)
        {
          var _lE = lElements[_iE];
          if ('inLayout' in _lE && !_lE.inLayout()) // Note: Because I add transitions directly to the scene right now, their position is not always computed correctly in case of a relayout... just avoid this, for now.
            continue;
          _lE.setPos({x:_lX, y:lY});
          _lE.setWidthConstraint(_lWe);
          if (_lE.hasOwnProperty('layout'))
          {
            // var _lT1 = new Date().getTime();
            _lE.layout(pCtx);
            // _lProfiling.push({name:_lE.constructor.toString().match(/function ([a-zA-Z0-9\_]+)/)[1], time:new Date().getTime() - _lT1});
          }
        }
      }
      else
      {
        lNextY = lY;
        for (var _iE = 0; _iE < lElements.length; _iE++)
        {
          var _lE = lElements[_iE];
          if ('inLayout' in _lE && !_lE.inLayout())
            continue;
          _lE.setPos({x:lX, y:lNextY});
          if (_lE.hasOwnProperty('layout'))
          {
            // var _lT1 = new Date().getTime();
            _lE.layout(pCtx);
            // _lProfiling.push({name:_lE.constructor.toString().match(/function ([a-zA-Z0-9\_]+)/)[1], time:new Date().getTime() - _lT1});
          }
          lNextY += _lE.evalHeight(pCtx);
        }
      }
      // if (_lProfiling.length > 0)
      //   console.log("layout: " + myStringify(_lProfiling));
    }
  // ---
  this.onMouseDown = function(pCtx, pPos) { lElements.forEach(function(_pE) { if (_pE.hasOwnProperty('onMouseDown')) _pE.onMouseDown(pCtx, pPos); }); }
  this.onMouseMove = function(pCtx, pPos) { lElements.forEach(function(_pE) { if (_pE.hasOwnProperty('onMouseMove')) _pE.onMouseMove(pCtx, pPos); }); }
  this.onMouseUp = function(pCtx, pPos) { lElements.forEach(function(_pE) { if (_pE.hasOwnProperty('onMouseUp')) _pE.onMouseUp(pCtx, pPos); }); }  
  this.onMouseWheel = function(pCtx, pInfo) { lElements.forEach(function(_pE) { if (_pE.hasOwnProperty('onMouseWheel')) _pE.onMouseWheel(pCtx, pInfo); }); }
  // ---
  this.addElement =
    function(pCtx, pElm)
    {
      var _lHorizontal = (pOrientation == "horizontal");
      if (!_lHorizontal)
        pElm.setPos({x:lX, y:lNextY});
      lElements.push(pElm);
      pElm.setParent(pCtx, lThis);
      if (_lHorizontal)
        lThis.layout(pCtx);
      else
        lNextY += pElm.evalHeight(pCtx);
    }
  this.removeElement =
    function(pElm)
    {
      for (var _iE = 0; _iE < lElements.length; _iE++)
      {
        var _lE = lElements[_iE];
        if (_lE == pElm)
          { lElements.splice(_iE, 1); break; }
        else if ('removeElement' in _lE)
          _lE.removeElement(pElm);
      }
    }
  this.getElementsByLabel =
    function(pLabel)
    {
      var lRes = [];
      for (var _iE = 0; _iE < lElements.length; _iE++)
      {
        var _lE = lElements[_iE];
        if ('getElementsByLabel' in _lE)
          lRes = lRes.concat(_lE.getElementsByLabel(pLabel));
        if ('label' in _lE && _lE.label == pLabel)
          lRes.push(_lE);
      }
      return lRes;
    }      
}

/**
 * PrezScene
 * The animated scene corresponding to the current slide;
 * contains the PrezElm_* elements corresponding to
 * the html definition of the slide, at a given time.
 */
function PrezScene()
{
  var lThis = this;
  var lContainer = new PrezContainer('vertical', 'scene');
  var lDelayAddTS = 2000; // Default delay (in ms) between each 'delayed' element insertion.
  var lDelayedElements = [];
  var lLastModifTime = 0;
  this.clear = function(pCtx) { lContainer.clear(pCtx); lDelayedElements.splice(0); lLastModifTime = pCtx.time; }
  this.render = function(pCtx) { lContainer.render(pCtx); lContainer.postRender(pCtx); }
  this.lastModifTime = function() { return lLastModifTime; }
  this.layout = function(pCtx) { lContainer.layout(pCtx); }
  this.setIntraDelayInMs = function(pDelayInMs) { lDelayAddTS = pDelayInMs; }
  // ---
  this.onMouseDown = function(pCtx, pPos) { lContainer.onMouseDown(pCtx, pPos); }
  this.onMouseMove = function(pCtx, pPos) { lContainer.onMouseMove(pCtx, pPos);  }
  this.onMouseUp = function(pCtx, pPos) { lContainer.onMouseUp(pCtx, pPos); }  
  this.onMouseWheel = function(pCtx, pInfo) { lContainer.onMouseWheel(pCtx, pInfo); }
  // ---
  this.addElement = function(pCtx, pElm) { lContainer.addElement(pCtx, pElm); lLastModifTime = pCtx.time; }
  this.removeElement = function(pElm) { lContainer.removeElement(pElm); }
  this.getElementsByLabel = function(pLabel) { return lContainer.getElementsByLabel(pLabel); }
  // ---
  this.addElementTo =
    function(pCtx, pElm, pParent)
    {
      if (undefined != pParent)
      {
        pParent.addElement(pCtx, pElm);
        lLastModifTime = pCtx.time;
        lThis.layout(pCtx);
      }
      else
        lThis.addElement(pCtx, pElm);
    }
  this.delayAddElementTo =
    function(pCtx, pElm, pParent)
    {
      lDelayedElements.push({elm:pElm, parent:pParent});
      var _lNext =
        function()
        {
          if (0 == lDelayedElements.length)
            return;
          var _lElm = lDelayedElements.splice(0, 1)[0];
          lThis.addElementTo(pCtx, _lElm.elm, _lElm.parent);
          if (lDelayedElements.length > 0)
          {
            var _lDelay = 'getDelay' in _lElm ? _lElm.getDelay() : lDelayAddTS;
            setTimeout(_lNext, _lDelay);
          }
        }
      if (1 == lDelayedElements.length)
        setTimeout(_lNext, 'getDelay' in pElm ? pElm.getDelay() : lDelayAddTS);
    }
  this.removeDelayedElements =
    function(pMode)
    {
      for (var _iDe = lDelayedElements.length - 1; _iDe >= 0; _iDe--)
      {
        var _lDe = lDelayedElements[_iDe];
        if ('getMode' in _lDe && _lDe.getMode() == pMode)
          lDelayedElements.splice(_iDe, 1);
      }
    }
  this.hasDelayedElements = function() { return lDelayedElements.length > 0; }
  this.flushDelayedElements = function(pCtx) { lDelayedElements.forEach(function(_pE) { lThis.addElementTo(pCtx, _pE.elm, _pE.parent); }); lDelayedElements.splice(0); }
}

/**
 * drawStreamingSchema
 * An animated schema of streaming on devices, visually suggesting the
 * performance advantages of the p2p-like approach.
 */
function drawStreamingSchema(pCtx, pBox, pImages, pLogo, pJitter, pTransitions)
{
  var lMargins = {x:100, y:40};
  var lPctr = {x:pBox.x + 0.5 * (pBox.w - pImages[0].width), y:pBox.y + 0.5 * (pBox.h - pImages[0].height)};
  var lJitter1 = pJitter ? {x:10 * Math.cos(2 * Math.PI * 0.123 * pCtx.time / 50), y:10 * Math.sin(2 * Math.PI * 0.123 * pCtx.time / 50)} : {x:0, y:0};
  var lJitter2 = pJitter ? {x:10 * Math.cos(2 * Math.PI * 0.365 * pCtx.time / 50), y:10 * Math.sin(2 * Math.PI * 0.365 * pCtx.time / 50)} : {x:0, y:0};
  // Draw the images (server in the center, devices on the edge).
  if (pCtx.slideNum < pTransitions[1]) pCtx.c2d.drawImage(pImages[0], lPctr.x, lPctr.y);
  if (pCtx.slideNum < pTransitions[0]) pCtx.c2d.drawImage(pImages[1], lJitter1.x + pBox.x + lMargins.x, lJitter1.y + pBox.y + lMargins.y);
  if (pCtx.slideNum < pTransitions[2]) pCtx.c2d.drawImage(pImages[2], lJitter2.x + pBox.x + pBox.w - pImages[2].width - lMargins.x, lJitter1.y + pBox.y + lMargins.y);
  if (pCtx.slideNum < pTransitions[1]) pCtx.c2d.drawImage(pImages[3], lJitter1.x + pBox.x + pBox.w - pImages[3].width - lMargins.x, lJitter2.y + pBox.y + pBox.h - pImages[3].height - lMargins.y);
  if (pCtx.slideNum < pTransitions[0]) pCtx.c2d.drawImage(pImages[4], lJitter2.x + pBox.x + lMargins.x, lJitter2.y + pBox.y + pBox.h - pImages[4].height - lMargins.y);
  var lDrawStraightArrow =
    function(p1, p2, pInvert)
    {
      var lLen = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
      var lSpacing = 10;
      var lNumDots = lLen / lSpacing;
      var lHighlighted = Math.floor(((pCtx.time % 120) / 120) * lNumDots);
      if (pInvert)
        lHighlighted = Math.floor(lNumDots - lHighlighted);
      var lAngle = Math.atan((p2.y - p1.y) / (p2.x - p1.x));
      for (var iD = 1; iD <= lNumDots; iD++)
      {
        pCtx.c2d.fillStyle = (lHighlighted == iD) ? "#000000" : "#888888";
        var lX = p1.x + lSpacing * Math.cos(lAngle) * iD;
        var lY = p1.y + lSpacing * Math.sin(lAngle) * iD;
        pCtx.c2d.beginPath();
        pCtx.c2d.arc(lX, lY, (lHighlighted == iD) ? 3 : 2, 0, 2 * Math.PI, false);
        pCtx.c2d.closePath();
        pCtx.c2d.fill();
      }
    }
  var lDrawArc =
    function(p)
    {
      var lHighlighted = Math.floor(((pCtx.time % 5) / 5) * 16);
      for (var _a = 0, _i = 0; _a < 2 * Math.PI; _a += 0.125 * Math.PI, _i++)
      {
        pCtx.c2d.fillStyle = (lHighlighted == _i) ? "#104363" : "#2087c6";
        var lX = p.x + Math.cos(_a) * 20;
        var lY = p.y + Math.sin(_a) * 20;
        pCtx.c2d.beginPath();
        pCtx.c2d.arc(lX, lY, (lHighlighted == _i) ? 4 : 3, 0, 2 * Math.PI, false);
        pCtx.c2d.closePath();
        pCtx.c2d.fill();
      }
    }
  // Draw arrows from the devices to server (slow).
  if (pCtx.slideNum < pTransitions[0]) lDrawStraightArrow({x:pBox.x + pImages[1].width + lMargins.x, y:pBox.y + 0.5 * pImages[1].height + lMargins.y}, lPctr);
  if (pCtx.slideNum < pTransitions[1]) lDrawStraightArrow({x:lPctr.x + pImages[0].width, y:lPctr.y}, {x:pBox.x + pBox.w - pImages[2].width - lMargins.x, y:pBox.y + 0.5 * pImages[2].height + lMargins.y}, true);
  if (pCtx.slideNum < pTransitions[1]) lDrawStraightArrow({x:lPctr.x + pImages[0].width, y:lPctr.y + pImages[0].height}, {x:pBox.x + pBox.w - pImages[3].width - lMargins.x, y:pBox.y + pBox.h - 0.5 * pImages[3].height - lMargins.y}, true);
  if (pCtx.slideNum < pTransitions[0]) lDrawStraightArrow({x:pBox.x + pImages[4].width + lMargins.x, y:pBox.y + pBox.h - 0.5 * pImages[4].height - lMargins.y}, {x:lPctr.x, y:lPctr.y + pImages[0].height});
  // Draw arrows from the devices to themselves (fast).
  var lCrvArrows =
    [{x:lJitter1.x + pBox.x + pImages[1].width + lMargins.x, y:lJitter1.y + pBox.y + 0.75 * pImages[1].height + lMargins.y},
    {x:lJitter2.x + pBox.x + pBox.w - pImages[2].width - lMargins.x, y:lJitter1.y + pBox.y + 0.75 * pImages[2].height + lMargins.y},
    {x:lJitter1.x + pBox.x + pBox.w - pImages[3].width - lMargins.x, y:lJitter2.y + pBox.y + pBox.h - 0.25 * pImages[3].height - lMargins.y},
    {x:lJitter2.x + pBox.x + pImages[4].width + lMargins.x, y:lJitter2.y + pBox.y + pBox.h - 0.25 * pImages[4].height - lMargins.y}];
  var lDrawAffinity = function(pCrvIdx) { lDrawArc(lCrvArrows[pCrvIdx]); pCtx.c2d.drawImage(pLogo, lCrvArrows[pCrvIdx].x - 0.5 * pLogo.width, lCrvArrows[pCrvIdx].y + 30); }
  if (pCtx.slideNum < pTransitions[0]) lDrawAffinity(0);
  if (pCtx.slideNum < pTransitions[2]) lDrawAffinity(1);
  if (pCtx.slideNum < pTransitions[1]) lDrawAffinity(2);
  if (pCtx.slideNum < pTransitions[0]) lDrawAffinity(3);
}

/**
 * PrezElm_Bkg
 * An animated background (evokes a graph).
 */
function PrezElm_Bkg_Images()
{
  this.images = [];
  this.spark = new Image(); this.spark.src = "../images/dsms/spark.png";
  var lSIsrc = ["serverrack.png", "home1.png", "coffee_maker.png", "home2.png", "home3.png"];
  for (var iSrc = 0; iSrc < lSIsrc.length; iSrc++)
    { lI = new Image(); lI.src = "../images/dsms/" + lSIsrc[iSrc]; this.images.push(lI); }
}
var gBkgImages = new PrezElm_Bkg_Images();
function PrezElm_Bkg(pW, pH, pPromoStyle)
{
  if (undefined == pPromoStyle)
    pPromoStyle = {theme:"graph"};
  var lParent = null;
  var lVertices = [];
  var lUrl = $("#promo_url").text();
  var lCopyright = $("#copyright").text();
  var lHelp = $("#help").text();
  var lStreamingImages = gBkgImages.images;
  var lLogo = new Image(); lLogo.src = $("#logo_src").text();
  for (var iV = 0; iV < 8; iV++)
    lVertices.push({radius:20 + 100 * Math.random(), orbit:20 + 200 * Math.random(), xc:pW * Math.random(), yc:pH * Math.random(), ostart:Math.random(), links:{}});
  for (var iE = 0; iE < 15; iE++)
    { var lV1 = Math.floor(Math.random() * lVertices.length); var lV2 = Math.floor(Math.random() * lVertices.length); if (lV1 == lV2) continue; lVertices[lV1].links[lV2.toString()] = 0.1; }
  var lSpeedCtrl = 2500.0;
  var lDimCtx = {w:1, h:1};
  var lSlideTransitionInfo = {prevSlideNum:0, curSlideNum:0, prevSlideLastScale:1.0, transitionTime:0}
  var lLastScaleVal = 1.0;
  var lSubtleGrey = "#dedede";
  var lAnimateVertices =
    function(pCtx)
    {
      for (var _iV = 0; _iV < lVertices.length; _iV++)
      {
        var _lV = lVertices[_iV];
        var _lA = 2 * Math.PI * ((lSpeedCtrl * _lV.ostart + pCtx.time) % lSpeedCtrl) / lSpeedCtrl;
        _lV.x = _lV.xc + _lV.orbit * Math.cos(_lA);
        _lV.y = _lV.yc + _lV.orbit * Math.sin(_lA);
        for (var _iE in _lV.links)
        {
          _lV.links[_iE] += 0.1;
          if (_lV.links[_iE] > 10) _lV.links[_iE] = 0.1;
        }
      }
    }
  var lRenderVertices =
    function(pCtx, pWithSparks)
    {
      pCtx.c2d.fillStyle = lSubtleGrey;
      pCtx.c2d.strokeStyle = lSubtleGrey;
      pCtx.c2d.lineWidth = 3;
      for (var _iV = 0; _iV < lVertices.length; _iV++)
      {
        var _lV = lVertices[_iV];
        for (var _iE in _lV.links)
        {
          var _lVto = lVertices[parseInt(_iE)];
          pCtx.c2d.beginPath();
          pCtx.c2d.moveTo(_lV.x, _lV.y);
          pCtx.c2d.lineTo(_lVto.x, _lVto.y);
          pCtx.c2d.stroke();
          if (true == pWithSparks)
          {
            var _lDist = Math.pow(2.0, _lV.links[_iE]) / 1000.0;
            var _lVspark = {x:_lV.x + (_lVto.x - _lV.x) * _lDist - 0.5 * gBkgImages.spark.width, y:_lV.y + (_lVto.y - _lV.y) * _lDist - 0.5 * gBkgImages.spark.height};
            pCtx.c2d.drawImage(gBkgImages.spark, _lVspark.x, _lVspark.y);
          }
        }
      }
      for (var _iV = 0; _iV < lVertices.length; _iV++)
      {
        var _lV = lVertices[_iV];
        pCtx.c2d.beginPath();
        pCtx.c2d.arc(_lV.x, _lV.y, _lV.radius, 0, 2 * Math.PI, false);
        pCtx.c2d.closePath();
        pCtx.c2d.fill();
      }
    }
  var lRenderDraft =
    function(pCtx)
    {
      pCtx.c2d.save();
      pCtx.c2d.font = "60pt Helvetica";
      pCtx.c2d.fillStyle = lSubtleGrey;
      pCtx.c2d.rotate(-0.25 * Math.PI);
      for (var _iX = -lDimCtx.w; _iX < lDimCtx.w; _iX += 200)
        for (var _iY = -lDimCtx.h; _iY < lDimCtx.h; _iY += 600)
          pCtx.c2d.fillText("DRAFT", -_iY, _iX);
      pCtx.c2d.restore();
    }
  var lRenderOsdb =
    function(pCtx)
    {
      pCtx.c2d.save();
      pCtx.c2d.font = "60pt Helvetica";
      pCtx.c2d.fillStyle = "#2087c6";
      pCtx.c2d.globalAlpha = 0.2+ pCtx.clampPct(0.5 * Math.cos(pCtx.time / (50 * Math.PI)));
      pCtx.c2d.fillText("Open-Source Graph DB", 0.5 * (pCtx.c2d.canvas.width - pCtx.c2d.measureText("Open-Source Graph DB").width), lDimCtx.h - 20);
      pCtx.c2d.restore();
    }
  var lRenderUrl =
    function(pCtx)
    {
      pCtx.c2d.font = "18px Helvetica";
      pCtx.c2d.fillStyle = "#2087c6";
      var _lWurl = pCtx.c2d.measureText(lUrl).width;
      pCtx.c2d.fillText(lUrl, lDimCtx.w - _lWurl - 20, lDimCtx.h - 5);
      pCtx.c2d.font = "9px Helvetica";
      pCtx.c2d.fillStyle = "#000000";
      var _lWcpr = pCtx.c2d.measureText(lCopyright).width;
      pCtx.c2d.fillText(lCopyright, 10, lDimCtx.h - 5);
      var _lWhlp = pCtx.c2d.measureText(lHelp).width;
      pCtx.c2d.fillText(lHelp, _lWcpr + 0.5 * (pCtx.c2d.canvas.width - _lWcpr - _lWurl - _lWhlp), lDimCtx.h - 5);
    }
  var lStartFrame =
    function(pCtx)
    {
      // Reset transfos and background.
      pCtx.c2d.setTransform(1, 0, 0, 1, 0, 0);
      pCtx.c2d.fillStyle = "#e4e4e4";
      pCtx.c2d.fillRect(0, 0, lDimCtx.w, lDimCtx.h);
    }
  this.render = function(pCtx)
  {
    if (pCtx.slideNum != lSlideTransitionInfo.curSlideNum)
    {
      lSlideTransitionInfo.prevSlideNum = lSlideTransitionInfo.curSlideNum;
      lSlideTransitionInfo.curSlideNum = pCtx.slideNum;
      lSlideTransitionInfo.prevSlideLastScaleVal = lLastScaleVal;
      lSlideTransitionInfo.transitionTime = pCtx.time;
    }

    lDimCtx.w = pCtx.c2d.canvas.width;
    lDimCtx.h = pCtx.c2d.canvas.height;
    lStartFrame(pCtx);
    switch (pPromoStyle.theme)
    {
      default:
      case "graph": lAnimateVertices(pCtx); lRenderVertices(pCtx); lRenderOsdb(pCtx); break;
      case "graph-quiet": lAnimateVertices(pCtx); lRenderVertices(pCtx); break;
      case "graph-ng": lAnimateVertices(pCtx); lRenderVertices(pCtx, true); break;
      case "streaming":
      {
        var _lBox = {x:0, y:0, w:pCtx.c2d.canvas.width, h:pCtx.c2d.canvas.height};
        var _lTheme0 = ('themeVersion' in pPromoStyle) ? ('wsn_sdw' != pPromoStyle.themeVersion) : true;
        var _lTstart = (_lTheme0 || pCtx.slideNum > 1) ? 0 : lSlideTransitionInfo.transitionTime;
        var _lScale = (pCtx.slideNum < (_lTheme0 ? 5 : 6)) ? Math.max(_lTheme0 ? 0.5 : 0.4, pCtx.clampPct(60 / (pCtx.time - _lTstart))) : (0.6 + (lSlideTransitionInfo.prevSlideLastScaleVal - 0.6) * pCtx.clampPct((pCtx.time - lSlideTransitionInfo.transitionTime) / 30.0));
        lLastScaleVal = _lScale;
        pCtx.c2d.save();
        pCtx.c2d.translate(_lBox.w - _lBox.w * _lScale, (_lBox.h - _lBox.h * _lScale) * 0.25);
        pCtx.c2d.scale(_lScale, _lScale);
        pCtx.c2d.globalAlpha = pCtx.clampPct((30 / (pCtx.time - _lTstart)) + 0.30);
        drawStreamingSchema(pCtx, _lBox, lStreamingImages, lLogo, true, _lTheme0 ? [1,5,6] : [2,6,7]);
        pCtx.c2d.restore();
        break;
      }
    }
    //lRenderDraft(pCtx);
    lRenderUrl(pCtx);
  }
  this.setParent = function(pCtx, pParent) { lParent = pParent; }
  this.getParent = function() { return lParent; }
  this.setPos = function(pPos) {}
  this.getPos = function() { return {x:0, y:0}; }
  this.evalHeight = function(pCtx) { return 0; }
}

/**
 * PrezElm_VSpacer
 */
function PrezElm_VSpacer(pH, pDelay)
{
  var lParent = null;
  var lX, lY;
  this.render = function(pCtx) {}
  this.setParent = function(pCtx, pParent) { lParent = pParent; }
  this.getParent = function() { return lParent; }
  this.setPos = function(pPos) { if ('x' in pPos) lX = pPos.x; if ('y' in pPos) lY = pPos.y; }
  this.getPos = function() { return {x:lX, y:lY}; }
  this.evalHeight = function(pCtx) { return pH; }
  this.getDelay = function() { return pDelay; }
}

/**
 * PrezElm_Title
 */
function PrezElm_Title(pText, pFont, pDeck)
{
  var lParent = null;
  var lX = 10, lY = 10;
  var lLogo = new Image(); lLogo.src = $("#logo_src").text();
  this.render =
    function(pCtx)
    {
      pCtx.c2d.fillStyle = "#111111"
      pCtx.c2d.strokeStyle = "#111111";
      pCtx.c2d.lineWidth = 1;
      pCtx.c2d.font = pFont;
      // Draw the title.
      pCtx.c2d.fillText(pText, lX, lY + 30);
      // Draw the logo.
      var _lW = lParent.getEffectiveWidthConstraint(pCtx) - lX;
      pCtx.c2d.drawImage(lLogo, lX + _lW - lLogo.width - 5, lY - 8);
      // Draw the separating line.
      pCtx.c2d.beginPath();
      pCtx.c2d.moveTo(lX, lY + 35);
      pCtx.c2d.lineTo(_lW, lY + 35);
      pCtx.c2d.stroke();
      // Draw an indicator of the current slide.
      pCtx.c2d.fillStyle = "#999999"
      pCtx.c2d.font = "10pt Helvetica";
      pCtx.c2d.fillText("" + (1 + pCtx.slideNum) + "/" + pDeck.getNumSlides(), lX + _lW - lLogo.width - 95, lY + 30);
      // Draw an indicator of the current sub-step.
      if (pCtx.slideNumSteps + pCtx.slideNumModes - pCtx.slideStep - pCtx.slideMode - 1 > 0)
      {
        var _lFlashPct = 0.5 + (1 + Math.sin(2 * Math.PI * (pCtx.time % 50) / 50.0)) * 0.25;
        var _lXpie = lX + _lW - lLogo.width - 50;
        var _lYpie = lY + 22;
        pCtx.c2d.globalAlpha = _lFlashPct;
        pCtx.c2d.fillStyle = "#aaaaaa"
        pCtx.c2d.beginPath();
        pCtx.c2d.arc(_lXpie, _lYpie, 10, 0, 2 * Math.PI, false);
        pCtx.c2d.fill();
        pCtx.c2d.fillStyle = "#999999"
        pCtx.c2d.beginPath();
        pCtx.c2d.moveTo(_lXpie, _lYpie);
        pCtx.c2d.arc(_lXpie, _lYpie, 10, -Math.PI * 0.5, (2.0 * Math.PI * (pCtx.slideStep + pCtx.slideMode + 1) / (pCtx.slideNumSteps + pCtx.slideNumModes)) - (Math.PI * 0.5), false);
        pCtx.c2d.closePath();
        pCtx.c2d.fill();
        pCtx.c2d.globalAlpha = 1.0;
      }
    }
  this.setParent = function(pCtx, pParent) { lParent = pParent; }
  this.getParent = function() { return lParent; }
  this.setPos = function(pPos) { if ('x' in pPos) lX = pPos.x; if ('y' in pPos) lY = pPos.y; }
  this.getPos = function() { return {y:lY}; }
  this.evalHeight = function(pCtx) { return 50; }
  this.onMouseDown =
    function(pCtx, pPos)
    {
      var _lX0 = lParent.getEffectiveWidthConstraint(pCtx) - lX - lLogo.width - 5;
      if (pPos.x >= _lX0 && pPos.y < lY + 35)
        window.location.href = 'http://' + location.hostname + ":" + location.port;
    };
  this.onMouseMove =
    function(pCtx, pPos)
    {
      var _lX0 = lParent.getEffectiveWidthConstraint(pCtx) - lX - lLogo.width - 5;
      pCtx.changeCursor((pPos.x >= _lX0 && pPos.y < lY + 35) ? "pointer" : "default");
    };
}

/**
 * PrezTextInBox
 */
function PrezTextInBox(pHtmlText, pAttributes/*fontsize, fontattr, fonttype, linespacing, para_prolog, alinea*/)
{
  var lThis = this;
  var lHasStyles = false;
  var lLineBreak = {text:''};
  var lExtractWords =
    function(_pCodeSnippet)
    {
      var _lWords = [];
      var _lWordsRegex = /(\<b\>)|(\<\/b\>)|(\<i\>)|(\<\/i\>)|(\<br\>)|(\s*[^\s\<]+\s*)/g;
      if (_pCodeSnippet)
      {
        var _lLines = pHtmlText.match(/(.*[\n\r])/g);
        for (var _iL = 0; _iL < _lLines.length; _iL++)
        {
          var _lL = _lLines[_iL];
          var _lMargin = _lL.match(/^(\s*)/);
          if (undefined != _lMargin)
              _lL = _lL.substr(_lMargin[0].length);
          var _lLm = _lL.match(_lWordsRegex);
          if (undefined == _lLm) { /*alert("no word on line: " + _lLines[_iL]);*/ continue; }
          if (undefined != _lMargin)
              _lWords.push({margin:_lMargin[0]});
          _lWords = _lWords.concat(_lLm);
          _lWords.push(lLineBreak);
        }
      }
      else
        _lWords = pHtmlText.match(_lWordsRegex);
      if (undefined == _lWords)
        return [];
      _lWords = _lWords.map(function(_pW) { return _pW == lLineBreak ? _pW : {text:((_pW instanceof Object && 'margin' in _pW) ? _pW.margin : _pW.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").trim() + " "), x:0, y:0}; });
      var _lStyle = null;
      for (var _iW = 0; _iW < _lWords.length; _iW++)
      {
        var _lW = _lWords[_iW];
        if (_lW.text == "<b> ") { _lStyle = "bold"; lHasStyles = true; }
        else if (_lW.text == "</b> ") _lStyle = null;
        else if (_lW.text == "<i> ") { _lStyle = "italic"; lHasStyles = true; }
        else if (_lW.text == "</i> ") _lStyle = null;
        else if (_lW.text == "<br> ") _lWords[_iW] = lLineBreak;
        else if (undefined != _lStyle) _lW.style = _lStyle;
      }
      return _lWords.filter(function(_pW) { return _pW.text != "<b> " && _pW.text != "</b> " && _pW.text != "<i> " && _pW.text != "</i> "; });
    }
  var lGetAttr = function(_pWhat, _pDefault) { return (undefined != pAttributes && _pWhat in pAttributes) ? pAttributes[_pWhat] : _pDefault; }
  var lWords = lExtractWords(lGetAttr('code_snippet', false));
  var lSimpleLine = false;
  var lSimpleText = lHasStyles ? null : lWords.map(function(_pW) { return _pW.text; }).join("");
  var lFontPt = lGetAttr('font_size', 12);
  var lFont = lGetAttr('font_attr', "") + " " + lFontPt + "pt " + lGetAttr('font_type', "Helvetica");
  var lLineSpacing = lGetAttr('line_spacing', 10);
  var lAlinea = lGetAttr('alinea', 0);
  var lParaProlog = lGetAttr('para_prolog', "");
  var lHasParaProlog = (undefined != lParaProlog && lParaProlog.length > 0);
  var lLineHeight = lFontPt + (2 * lLineSpacing);
  this.layoutWords =
    function(pCtx, pBox)
    {
      pCtx.c2d.font = lFont;
      var _lPrologW = lHasParaProlog ? pCtx.c2d.measureText(lParaProlog).width : 0;
      if (!lHasStyles && (_lPrologW + pCtx.c2d.measureText(lSimpleText).width <= pBox.w))
        { lSimpleLine = true; return; }
      lSimpleLine = false;
      var _lXw = pBox.x + _lPrologW;
      var _lYw = pBox.y;
      var _lCurStyle = {bold:false, italic:false};
      for (var _iW = 0; _iW < lWords.length; _iW++)
      {
        var _lW = lWords[_iW];
        for (var _iStyle in _lCurStyle)
        {
          if (_lW.style == _iStyle) { if (!_lCurStyle[_iStyle]) { pCtx.c2d.font = _iStyle + " " + lFont; _lCurStyle[_iStyle] = true; break; } }
          else if (_lCurStyle[_iStyle]) { pCtx.c2d.font = lFont; _lCurStyle[_iStyle] = false; }
        }
        var _lLB = (_lW == lLineBreak);
        var _lWw = _lLB ? 0 : pCtx.c2d.measureText(_lW.text).width;
        if (_lLB || (_lXw + _lWw > pBox.x + pBox.w))
          { _lXw = pBox.x + _lPrologW + lAlinea; _lYw += lLineHeight; }
        _lW.x = _lXw; _lW.y = _lYw;
        _lXw += _lWw;
      }
    }
  this.render =
    function(pCtx, pPos)
    {
      pCtx.c2d.font = lFont;
      var _lFadePct = pCtx.c2d.globalAlpha;
      var _lPrologW = 0;
      if (lHasParaProlog)
      {
        pCtx.c2d.fillText(lParaProlog, pPos.x, pPos.y + lLineHeight - lLineSpacing);
        _lPrologW = pCtx.c2d.measureText(lParaProlog).width;
      }
      if (lSimpleLine)
        pCtx.c2d.fillText(lSimpleText, pPos.x + _lPrologW, pPos.y + lLineHeight - lLineSpacing);
      else
      {
        var _lBoldPct = _lFadePct * (0.6 + (1 + Math.sin(2 * Math.PI * (pCtx.time % 50) / 50.0)) * 0.25);
        var _lCurStyle = {bold:false, italic:false};
        for (var _iW = 0; _iW < lWords.length; _iW++)
        {
          var _lW = lWords[_iW];
          var _lWasBold = _lCurStyle.bold;
          for (var _iStyle in _lCurStyle)
          {
            if (_lW.style == _iStyle) { if (!_lCurStyle[_iStyle]) { pCtx.c2d.font = _iStyle + " " + lFont; _lCurStyle[_iStyle] = true; break; } }
            else if (_lCurStyle[_iStyle]) { pCtx.c2d.font = lFont; _lCurStyle[_iStyle] = false; }
          }
          if (_lCurStyle.bold)
            pCtx.c2d.globalAlpha = _lBoldPct;
          else if (_lWasBold)
            pCtx.c2d.globalAlpha = _lFadePct;
          if (_lW != lLineBreak)
            pCtx.c2d.fillText(_lW.text, _lW.x, _lW.y + lLineHeight - lLineSpacing);
        }
      }
      pCtx.c2d.globalAlpha = 1.0;
    }
  this.getHeight = function() { return lLineHeight + (lSimpleLine ? 0 : (lWords[lWords.length - 1].y - lWords[0].y)); }
}

/**
 * PrezElm_CodeComparator
 * This component aims at displaying non-trivial chunks of code, with side-by-side translations (e.g. pathsql <-> sqlite).
 * Because non-trivial code is typically quite long in the context of presentations, the view is in landscape and shows 1 side by default.
 * When hovering/clicking over specially marked spans, the view switches to a comparison mode.
 * TODO (one day): animations
 */
function PrezElm_CodeComparator(pHtml)
{
  var lThis = this;
  var lT0 = 0;
  var lMeta = $.parseJSON(pHtml.attr("meta"));
  var lLayout = lMeta.layout;
  var lFont = lMeta.font_size + "pt " + lMeta.font_type;
  var lParent = null;
  var lActiveSide = 'start_side' in lMeta ? lMeta.start_side : 0; // 0: left, 1: right
  var lSeparatorWidth = 'separator_width' in lMeta ? lMeta.separator_width : 20;
  var lHoverInfo = {active:0, x:0, y:0, curspan:null, curside:null};
  var lIsComparing = 0; // Whether or not the view is currently in comparison mode (2 columns).
  var lX = 0, lY = 0;
  var lLineHeight = 15;
  var lWidthConstraint = null;
  var lSides = pHtml.children("ul").children("li");
  var lScrollY = [0, 0];
  if (lSides.length > 2) { alert("More than 2 sides in code comparison!?"); return; }
  var lSpans = [[], []];
  var lSpansById = {};
  var lCleanText = function(pText) { return pText.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">"); }
  for (var iSide = 0; iSide < lSides.length; iSide++)
  {
    var lSc = $(lSides[iSide]).contents();
    for (var iSpan = 0; iSpan < lSc.length; iSpan++)
    {
      if (3 == lSc[iSpan].nodeType)
        lSpans[iSide].push({text:lCleanText($(lSc[iSpan]).text()), words:[]});
      else
        lSpans[iSide].push({idx:$(lSc[iSpan]).attr("idx"), html:lCleanText($(lSc[iSpan]).html()), words:[]});
    }
  }
  var lDirtyLayout = true;
  var lDoFlowLayout =
    function(pCtx, pFlowCtx)
    {
      // Note: no word-wrapping - let the user control in html.
      // Note: could be invoked more often/dynamically, e.g. for animations.
      var _lLineNoW = pCtx.c2d.measureText('999: ').width;
      var _lPos = {x:_lLineNoW, y:0};
      for (var _iSpan = 0; _iSpan < lSpans[pFlowCtx.side].length; _iSpan++)
      {
        var _lSpan = lSpans[pFlowCtx.side][_iSpan];
        var _lText = ('text' in _lSpan) ? _lSpan.text : _lSpan.html;
        _lSpan.words = _lText.match(/(\<br\>)|(\<\>)|([\n\r])|([\s]+)|([^\s]+)/g).map(function(_pW) { return {text:_pW}; });
        for (var _iW = 0; _iW < _lSpan.words.length; _iW++)
        {
          var _lW = _lSpan.words[_iW];
          if (_lW.text.match(/(\<br\>)|([\n\r])/)) { _lW.blank = true; _lPos.x = _lLineNoW; _lPos.y += pFlowCtx.lineHeight; pFlowCtx.lineno++; continue; }
          if (_lLineNoW == _lPos.x) _lW.lineno = pFlowCtx.lineno;
          _lW.width = pCtx.c2d.measureText(_lW.text).width;
          _lW.x = _lPos.x, _lW.y = _lPos.y;
          _lPos.x += _lW.width;
        }
      }
    }
  var lUpdateHoveringInfo =
    function(pCtx, pRenderCtx)
    {
      var _lOffsetY = pRenderCtx.box.y - lScrollY[pRenderCtx.side];
      if (lHoverInfo.active && undefined == lHoverInfo.curspan && lHoverInfo.y >= pRenderCtx.box.y && lHoverInfo.y <= pRenderCtx.box.y + pRenderCtx.box.h)
      {
        for (var _iSpan = 0; _iSpan < lSpans[pRenderCtx.side].length && (lHoverInfo.active && undefined == lHoverInfo.curspan); _iSpan++)
        {
          var _lSpan = lSpans[pRenderCtx.side][_iSpan];
          for (var _iW = 0; _iW < _lSpan.words.length; _iW++)
          {
            var _lW = _lSpan.words[_iW];
            if ('blank' in _lW) continue;
            if (lHoverInfo.x >= pRenderCtx.box.x + _lW.x && lHoverInfo.x <= pRenderCtx.box.x + _lW.x + _lW.width &&
              lHoverInfo.y >= _lOffsetY + _lW.y - pRenderCtx.lineHeight && lHoverInfo.y <= _lOffsetY + _lW.y)
                { lHoverInfo.curspan = _lSpan; lHoverInfo.curside = pRenderCtx.side; break; }
          }
        }
      }
    }
  var lRenderSpans =
    function(pCtx, pRenderCtx)
    {
      var _lBgColorIdx = 0;
      var _lOffsetY = pRenderCtx.box.y - lScrollY[pRenderCtx.side];
      for (var _iSpan = 0; _iSpan < lSpans[pRenderCtx.side].length; _iSpan++)
      {
        var _lSpan = lSpans[pRenderCtx.side][_iSpan];
        var _lFgColor = "#000000";
        if ('idx' in _lSpan)
          _lBgColorIdx = 1 - _lBgColorIdx;
        for (var _iW = 0; _iW < _lSpan.words.length; _iW++)
        {
          var _lW = _lSpan.words[_iW];
          if ('blank' in _lW) continue;
          if ('lineno' in _lW)
          {
            pCtx.c2d.fillStyle = "#222222";
            pCtx.c2d.fillText("" + _lW.lineno + ": ", pRenderCtx.box.x, _lOffsetY + _lW.y);
          }
          pCtx.c2d.fillStyle = _lFgColor;
          if ('idx' in _lSpan)
          {
            var _lSelected = undefined != lHoverInfo.curspan && 'idx' in lHoverInfo.curspan && lHoverInfo.curspan.idx == _lSpan.idx;
            pCtx.c2d.fillStyle = pRenderCtx.bgcolors[_lSelected ? 2 : _lBgColorIdx];
            pCtx.c2d.fillRect(pRenderCtx.box.x + _lW.x, _lOffsetY + _lW.y - pRenderCtx.lineHeight + 2, _lW.width, pRenderCtx.lineHeight)
            pCtx.c2d.fillStyle = _lSelected ? "#000044" : _lFgColor;
          }
          pCtx.c2d.fillText(_lW.text, pRenderCtx.box.x + _lW.x, _lOffsetY + _lW.y);
        }
      }
    }
  var lWithRectClipping =
    function(pCtx, pBox, pDrawFunction)
    {
      pCtx.c2d.save();
      pCtx.c2d.beginPath();
      pCtx.c2d.rect(pBox.x, pBox.y, pBox.w, pBox.h);
      pCtx.c2d.clip();
      pDrawFunction(pBox, pCtx);
      pCtx.c2d.restore();
    }
  this.render =
    function(pCtx)
    {
      pCtx.c2d.save();
      var _lFadePct = pCtx.clampPct(4.0 * (pCtx.time - lT0) / 100.0);
      var _lTotW = undefined != lWidthConstraint ? lWidthConstraint : lParent.getEffectiveWidthConstraint(pCtx);
      var _lW = Math.min(_lTotW, lLayout[2] - lLayout[0]);
      var _lH = lThis.evalHeight(pCtx) - lLayout[1];
      var _lX = lX + lLayout[0] + (_lTotW - _lW) * 0.5;
      var _lY = lY + lLayout[1];
      var _lTitle = function(_pText, _pX, _pY) { pCtx.c2d.save(); pCtx.c2d.fillStyle = "#000000"; pCtx.c2d.rotate(-0.5 * Math.PI); pCtx.c2d.fillText(_pText, _pX, _pY); pCtx.c2d.restore(); }
      var _lBackground = function(_pBox, _pStyle) { pCtx.c2d.fillStyle = _pStyle; pCtx.c2d.fillRect(_pBox.x, _pBox.y, _pBox.w, _pBox.h); }
      var _lContour =
        function(_pBox)
        {
          var __lBoxes = []
          if (lIsComparing) { __lBoxes.push([_pBox.x + _pBox.w - 36, _pBox.y + 10, 26, 26]); }
          else { __lBoxes.push([_pBox.x + _pBox.w - 36, _pBox.y + 10, 26, 13], [_pBox.x + _pBox.w - 36, _pBox.y + 23, 26, 13]); }
          pCtx.c2d.fillStyle = (lHoverInfo.x >= __lBoxes[0][0] && lHoverInfo.x <= __lBoxes[0][0] + 26 && lHoverInfo.y >= __lBoxes[0][1] && lHoverInfo.y <= __lBoxes[0][1] + 26) ? "#bbbbff" : "#7777ff";
          __lBoxes.forEach(function(__pB) { pCtx.c2d.fillRect(__pB[0], __pB[1], __pB[2], __pB[3]); });
          pCtx.c2d.strokeStyle = "#666666";
          pCtx.c2d.lineWidth = 6;
          pCtx.c2d.beginPath();
          pCtx.c2d.rect(_pBox.x, _pBox.y, _pBox.w, _pBox.h);
          pCtx.c2d.stroke();
          pCtx.c2d.lineWidth = 3;
          pCtx.c2d.beginPath();
          __lBoxes.forEach(function(__pB) { pCtx.c2d.rect(__pB[0], __pB[1], __pB[2], __pB[3]); });
          pCtx.c2d.stroke();
        }

      pCtx.c2d.globalAlpha = _lFadePct * 0.9;
      pCtx.c2d.font = lFont;

      lHoverInfo.curspan = null; lHoverInfo.curside = null;
      if (lIsComparing)
      {
        var _lHalfH = _lH * 0.5;
        var _lBoxes = [];
        var _lRenderCtxs = [];
        var _iSide;
        for (_iSide = 0; _iSide < 2; _iSide++)
        {
          _lBoxes.push({x:_lX, y:_lY + _iSide * (_lHalfH + lSeparatorWidth * 0.5), w:_lW, h:_lHalfH - lSeparatorWidth * 0.5});
          _lRenderCtxs.push({box:_lBoxes[_iSide], lineHeight:lLineHeight, bgcolors:["#bbbbbb", "#bbbbbb", "#7777ff"], side:_iSide});
          lUpdateHoveringInfo(pCtx, _lRenderCtxs[_iSide]);
        }
        for (_iSide = 0; _iSide < 2; _iSide++)
        {
          lWithRectClipping(
            pCtx, _lBoxes[_iSide],
            function(_pBox)
            {
              _lBackground(_pBox, "#d5d5d5");
              pCtx.c2d.fillRect(_pBox.x, _pBox.y, _pBox.w, _pBox.h);
              lRenderSpans(pCtx, _lRenderCtxs[_iSide]);
              _lContour(_pBox);
            });
          _lTitle(lMeta.titles[_iSide], -_lY - ((1 + _iSide) * _lHalfH) + (_lHalfH - pCtx.c2d.measureText(lMeta.titles[_iSide]).width) * 0.5, _lX - 5);
        }
      }
      else
      {
        lWithRectClipping(
          pCtx, {x:_lX, y:_lY, w:_lW, h:_lH},
          function(_pBox)
          {
            _lBackground(_pBox, "#e5e5e5");
            var _lRenderCtx = {box:_pBox, lineHeight:lLineHeight, bgcolors:["#bbbbbb", "#999999", "#7777ff"], side:lActiveSide};
            lUpdateHoveringInfo(pCtx, _lRenderCtx);
            lRenderSpans(pCtx, _lRenderCtx);
            _lContour(_pBox);
          });
        _lTitle(lMeta.titles[lActiveSide], -_lY - _lH + (_lH - pCtx.c2d.measureText(lMeta.titles[lActiveSide]).width) * 0.5, _lX - 5);
      }
      pCtx.c2d.restore();
    }
  this.setParent = function(pCtx, pParent) { lT0 = pCtx.time; lParent = pParent; }
  this.getParent = function() { return lParent; }
  this.setPos = function(pPos) { if ('x' in pPos) lX = pPos.x; if ('y' in pPos) lY = pPos.y; }
  this.getPos = function() { return {x:lX, y:lY}; }
  this.evalHeight =
    function(pCtx)
    {
      if (lDirtyLayout)
      {
        pCtx.c2d.font = lFont;
        lDoFlowLayout(pCtx, {lineHeight:lLineHeight, lineno:0, side:0});
        lDoFlowLayout(pCtx, {lineHeight:lLineHeight, lineno:0, side:1});
        lDirtyLayout = false;
      }
      return lLayout[3];
    }
  this.setWidthConstraint = function(pWidthConstraint) { lWidthConstraint = pWidthConstraint; }
  var lHitTest =
    function(pCtx, pPos)
    {
      var _lTotW = undefined != lWidthConstraint ? lWidthConstraint : lParent.getEffectiveWidthConstraint(pCtx);
      var _lW = Math.min(_lTotW, lLayout[2] - lLayout[0]);
      var _lH = lThis.evalHeight(pCtx) - lLayout[1];
      var _lX = lX + lLayout[0] + (_lTotW - _lW) * 0.5;
      var _lY = lY + lLayout[1];
      if (pPos.x < _lX || pPos.x >= _lX + _lW) return 0;
      if (pPos.y < _lY || pPos.y >= _lY + _lH) return 0;
      return 1;
    }
  this.onMouseMove = function(pCtx, pPos) { lHoverInfo.active = lHitTest(pCtx, pPos); lHoverInfo.x = pPos.x; lHoverInfo.y = pPos.y; lHoverInfo.curspan = null; lHoverInfo.curside = null; }
  this.onMouseDown =
    function(pCtx, pPos)
    {
      if (undefined != lHoverInfo.curspan)
      {
        var _lSpans = lSpans[1 - lHoverInfo.curside];
        for (var _iSpan = 0; _iSpan < _lSpans.length; _iSpan++)
          if ('idx' in _lSpans[_iSpan] && _lSpans[_iSpan].idx == lHoverInfo.curspan.idx)
          {
            lScrollY[1 - lHoverInfo.curside] = _lSpans[_iSpan].words[0].y - lLineHeight;
            if (!lIsComparing)
              lScrollY[lHoverInfo.curside] = lHoverInfo.curspan.words[0].y - lLineHeight;
            break;
          }
        lIsComparing = true;
      }
      else
      {
        var _lTotW = undefined != lWidthConstraint ? lWidthConstraint : lParent.getEffectiveWidthConstraint(pCtx);
        var _lW = Math.min(_lTotW, lLayout[2] - lLayout[0]);
        var _lH = lThis.evalHeight(pCtx) - lLayout[1];
        var _lX = lX + lLayout[0] + (_lTotW - _lW) * 0.5;
        var _lY = lY + lLayout[1];
        if (lHoverInfo.x >= _lX + _lW - 36 && lHoverInfo.x <= _lX + _lW && ((lHoverInfo.y >= _lY + 10 && lHoverInfo.y <= _lY + 36) || (lIsComparing && lHoverInfo.y >= _lY + 0.5 * _lH + lSeparatorWidth + 10 && lHoverInfo.y <= _lY + 0.5 * _lH + lSeparatorWidth + 36)))
        {
          lIsComparing = (1 - lIsComparing);
          if (!lIsComparing)
            lActiveSide = (lHoverInfo.y >= lY + lThis.evalHeight(pCtx) * 0.5) ? 1 : 0;
        }
      }
    }
  this.onMouseWheel =
    function(pCtx, pInfo)
    {
      if (!lHoverInfo.active)
        return;
      var _lScrolled = lIsComparing ? ((lHoverInfo.y >= lY + lLayout[1] + lThis.evalHeight(pCtx) * 0.5) ? 1 : 0) : lActiveSide;
      lScrollY[_lScrolled] += (pInfo.delta * 5);
      var _lMaxY = null;
      for (var _iSpan = lSpans[_lScrolled].length - 1; _iSpan >= 0 && undefined == _lMaxY; _iSpan--)
      {
        var _lSpan = lSpans[_lScrolled][_iSpan];
        if (0 == _lSpan.words.length) continue;
        for (var _iW = _lSpan.words.length - 1; _iW >= 0; _iW--)
          if ('y' in _lSpan.words[_iW]) { _lMaxY = _lSpan.words[_iW].y; break; }
      }
      lScrollY[_lScrolled] = Math.min(Math.max(0, lScrollY[_lScrolled]), _lMaxY - lLineHeight);
    }
}

/**
 * PrezElm_FadeInTxt
 */
function PrezElm_FadeInTxt(pHtmlText, pOptions)
{
  var lThis = this;
  var lT0 = 0;
  var lParent = null;
  var lMuted = false;
  var lBulletTxt = $("#bullet").text();
  var lGetOption = function(_pWhat, _pDefault) { return (undefined != pOptions && _pWhat in pOptions) ? pOptions[_pWhat] : _pDefault; }
  var lGetNth = function(_pArray, _pNth, _pDefault) { return (undefined != _pArray && _pNth < _pArray.length) ? _pArray[_pNth] : _pDefault; }
  var lHasBullet = lGetOption('bullet', 'default') != 'none';
  var lHighlights = lGetOption('highlights', null);
  if (undefined != lHighlights && (0 == lHighlights.length || lHighlights.some(function(_pH) { return _pH == 'vs_all'; })))
    lHighlights = null;
  var lIsCode = lGetOption('code_snippet', false);
  var lTooltipFunc = lGetOption('tooltip', null);
  var lTooltipModel = (undefined != lTooltipFunc ? eval(lTooltipFunc) : null);
  var lFontType = lGetOption('font', lIsCode ? 'Courier' : 'Helvetica');
  var lLevel = lGetOption('level', 0);
  var lFontPt = lGetNth(lGetOption('fontsizes', [18, 12]), lLevel, 10) - (lIsCode ? 2 : 0);
  var lFont = (lHasBullet ? "" : "italic ") + lFontPt + "pt " + lFontType;
  var lLineSpacing = 6;
  var lX = 10 + lLevel * PrezRenderCtx.TABSIZE, lY = 10, lLineHeight = lFontPt + (2 * lLineSpacing);
  var lMode = lGetOption('mode', null);
  var lTxtBox = new PrezTextInBox(pHtmlText, {font_size:lFontPt, font_attr:(lHasBullet ? "" : "italic"), font_type:lFontType, line_spacing:6, para_prolog:(lHasBullet ? lBulletTxt : ""), code_snippet:lIsCode});
  var lLayoutWords = function(pCtx) { lTxtBox.layoutWords(pCtx, {x:lX, y:lY, w:lParent.getEffectiveWidthConstraint(pCtx) - lLevel * PrezRenderCtx.TABSIZE, h:0}); }
  var lHover = 0;
  this.render =
    function(pCtx)
    {
      if (lMuted)
        return;
      var _lHighlightFactor = (undefined == lHighlights || lHighlights.some(function(_pH) { return _pH == 'vs_' + pCtx.slideModes[pCtx.slideMode]; })) ? 1.0 : 0.25;
      var _lFadePct = _lHighlightFactor * pCtx.clampPct(4.0 * (pCtx.time - lT0) / 100.0);
      var _lFillStyle = (lMode == "all" ? (lIsCode ? "#111188" : "#111111") : (lMode == "affinity" ? "#114411" : "#441111"));
      pCtx.c2d.fillStyle = _lFillStyle;
      pCtx.c2d.globalAlpha = _lFadePct;
      lTxtBox.render(pCtx, {x:lX, y:lY});
      pCtx.c2d.globalAlpha = 1.0;
    }
  this.postRender =
    function(pCtx)
    {
      if (1 != lHover || undefined == lTooltipModel)
        return;
      var _lW = lParent.getEffectiveWidthConstraint(pCtx);
      var _lH = lThis.evalHeight(pCtx);
      var _lFontType = 'font_type' in lTooltipModel ? lTooltipModel.font_type : "Helvetica";
      var _lFontSize = 'font_size' in lTooltipModel ? lTooltipModel.font_size : 10;
      pCtx.c2d.fillStyle = "#eeeeee";
      pCtx.c2d.globalAlpha = 0.85;
      pCtx.c2d.fillRect(lX, lY, _lW, _lH);
      pCtx.c2d.fillStyle = "#111111";
      pCtx.c2d.globalAlpha = 1.0;
      var _lY = lY;
      for (var _iT = 0; _iT < lTooltipModel.lines.length; _iT++)
      {
        var _lTxtBox = new PrezTextInBox(lTooltipModel.lines[_iT], {font_size:_lFontSize, font_attr:"", font_type:_lFontType, line_spacing:2, para_prolog:"", alinea:PrezRenderCtx.TABSIZE});
        _lTxtBox.layoutWords(pCtx, {x:lX + 10, y:_lY + 10, w:_lW - 20, h:_lH - 20});
        _lTxtBox.render(pCtx, {x:lX + 10, y:_lY + 10});
        _lY += _lTxtBox.getHeight();
      }
    }
  this.setParent = function(pCtx, pParent) { lT0 = pCtx.time; lParent = pParent; }
  this.getParent = function() { return lParent; }
  this.setPos = function(pPos) { if ('x' in pPos) lX = pPos.x + lLevel * PrezRenderCtx.TABSIZE; if ('y' in pPos) lY = pPos.y; }
  this.getPos = function() { return {x:lX, y:lY}; }
  this.evalHeight = function(pCtx) { lLayoutWords(pCtx); return lTxtBox.getHeight(); }
  this.mute = function(pMuted) { lMuted = pMuted; }
  this.getMode = function() { return lMode; }
  var lHitTest = function(pCtx, pPos) { return (pPos.y >= lY && pPos.y <= lY + lThis.evalHeight(pCtx) && pPos.x >= lX && pPos.x <= lX + lParent.getEffectiveWidthConstraint(pCtx)) ? 1 : 0; }
  this.onMouseMove = function(pCtx, pPos) { lHover = lHitTest(pCtx, pPos); }
}

/**
 * PrezElm_Url
 */
function PrezElm_Url(pHtml, pLevel)
{
  var lThis = this;
  var lParent = null;
  var lX = 10 + pLevel * PrezRenderCtx.TABSIZE, lY = 10;
  var lHover = false;
  var lText = pHtml.text();
  var lFullUrl = 'http://' + location.hostname + ":" + location.port + "/" + pHtml.attr("url");
  if (undefined == lText || 0 == lText.length)
    lText = lFullUrl;
  var lMetaAttr = pHtml.attr("meta");
  var lMeta = (undefined != lMetaAttr) ? $.parseJSON(pHtml.attr("meta")) : null;
  var lGetMeta = function(_pWhat, _pDefault) { return (undefined != lMeta && _pWhat in lMeta) ? lMeta[_pWhat] : _pDefault; }
  var lFontSize = lGetMeta('font_size', 26);
  var lFont = lFontSize + "pt " + lGetMeta('font_type', 'Helvetica');
  var lDoCenter = lGetMeta('center', false);
  var lWithBox = lGetMeta('withBox', false);
  this.render =
    function(pCtx)
    {
      pCtx.c2d.save();
      pCtx.c2d.font = lFont;
      var _lW = pCtx.c2d.measureText(lText).width;
      var _lX = lDoCenter ? 0.5 * (pCtx.c2d.canvas.width - _lW) : lX;
      pCtx.c2d.globalAlpha = lHover ? 1.0 : 0.7;
      pCtx.c2d.fillStyle = lGetMeta('fillStyle', "#ffffff");
      pCtx.c2d.strokeStyle = lGetMeta('strokeStyle', "#000000");
      if (lWithBox)
      {
        pCtx.c2d.fillRect(_lX - 10, lY, _lW + 20, lFontSize + 20); 
        pCtx.c2d.strokeRect(_lX - 10, lY, _lW + 20, lFontSize + 20);
      }
      pCtx.c2d.fillStyle = lGetMeta('textStyle', "#2087c6");
      pCtx.c2d.fillText(lText, _lX, lY + lFontSize + (lWithBox ? 14 : 1));
      pCtx.c2d.restore();
    }
  this.setParent = function(pCtx, pParent) { lParent = pParent; }
  this.getParent = function() { return lParent; }
  this.setPos = function(pPos) { if ('x' in pPos) lX = pPos.x + pLevel * PrezRenderCtx.TABSIZE; if ('y' in pPos) lY = pPos.y; }
  this.getPos = function() { return {x:lX, y:lY}; }
  this.evalHeight = function(pCtx) { return lFontSize + (lWithBox ? 20 : 2); }
  var lHitTest =
    function(pCtx, pPos)
    {
      pCtx.c2d.save();
      pCtx.c2d.font = lFont;
      var _lW = pCtx.c2d.measureText(lText).width;
      var _lH = lThis.evalHeight(pCtx);
      var _lX = lDoCenter ? 0.5 * (pCtx.c2d.canvas.width - _lW) : lX;
      pCtx.c2d.restore();
      return (pPos.y < lY || pPos.y > lY + _lH || pPos.x < _lX || pPos.x > _lX + _lW) ? 0 : 1;
    }
  this.onMouseMove = function(pCtx, pPos) { lHover = lHitTest(pCtx, pPos); }
  this.onMouseDown = function(pCtx, pPos) { if (lHitTest(pCtx, pPos)) window.location.href = lFullUrl; }
}

/**
 * PrezElm_MathGraph
 * A general-purpose function curve plotting widget.
 */
function PrezElm_MathGraph(pCode)
{
  var lThis = this;
  var lT0 = 0;
  var lParent = null;
  var lX = 10, lY = 10;
  var lWidthConstraint = null;
  var lModel = eval(pCode);
  var lHover = 0;
  var lXrange = {first:lModel.series[0].data[0][0], last:lModel.series[0].data[0][0], range:0, middle:lModel.series[0].data[0][0]};
  var lYrange = {first:lModel.series[0].data[0][1], last:lModel.series[0].data[0][1], range:0, middle:lModel.series[0].data[0][1]};
  lModel.series.forEach(function(_pS) { _pS.data.forEach(function(_pC) { if (_pC[0] > lXrange.last) lXrange.last = _pC[0]; if (_pC[0] < lXrange.first) lXrange.first = _pC[0]; if (_pC[1] > lYrange.last) lYrange.last = _pC[1]; if (_pC[1] < lYrange.first) lYrange.first = _pC[1]; }); });
  lXrange.range = lXrange.last - lXrange.first; lXrange.middle = (lXrange.first + lXrange.range * 0.5);
  lYrange.range = lYrange.last - lYrange.first; lYrange.middle = (lYrange.first + lYrange.range * 0.5);
  var lTicks = ['first', 'middle', 'last'];
  for (var iT = 0; iT < lTicks.length; iT++)
  {
    lXrange[lTicks[iT] + "_str"] = lXrange[lTicks[iT]].toFixed(lModel.x.decimals);
    lYrange[lTicks[iT] + "_str"] = lYrange[lTicks[iT]].toFixed(lModel.y.decimals);
  }
  this.render =
    function(pCtx)
    {
      var _lFadePct = pCtx.clampPct(4.0 * (pCtx.time - lT0) / 100.0);
      var _lTotW = undefined != lWidthConstraint ? lWidthConstraint : lParent.getEffectiveWidthConstraint(pCtx);
      var _lW = Math.min(_lTotW, lModel.layout[2] - lModel.layout[0]);
      var _lH = lThis.evalHeight(pCtx) - lModel.layout[1];
      var _lX = lX + lModel.layout[0] + (_lTotW - _lW) * 0.5;
      var _lY = lY + lModel.layout[1];
      pCtx.c2d.globalAlpha = _lFadePct * 0.7;
      pCtx.c2d.fillStyle = "#111111";
      pCtx.c2d.font = "9pt Helvetica";

      pCtx.c2d.save();
      // Frame.
      pCtx.c2d.fillStyle = "#eeeeee";
      pCtx.c2d.strokeStyle = "#999999";
      pCtx.c2d.globalAlpha = 0.8 * _lFadePct;
      pCtx.c2d.fillRect(_lX, _lY, _lW, _lH);
      pCtx.c2d.strokeRect(_lX, _lY, _lW, _lH);
      pCtx.c2d.fillStyle = "#000000";
      // Titles.
      pCtx.c2d.font = "bold 9pt Helvetica";
      pCtx.c2d.fillText(lModel.title, _lX + (_lW - pCtx.c2d.measureText(lModel.title).width) * 0.5, _lY + 10);
      if ('subtitle' in lModel)
      {
        pCtx.c2d.fillStyle = "#111111";
        pCtx.c2d.font = "8pt Helvetica";
        pCtx.c2d.fillText(lModel.subtitle, _lX + (_lW - pCtx.c2d.measureText(lModel.subtitle).width) * 0.5, _lY + 20);
      }
      pCtx.c2d.restore();

      // Axes.
      var _lXz = _lX + 50, _lYz = _lY + _lH - 30;
      var _lWg = _lW * (1.0 - ('legend_w_ratio' in lModel ? lModel.legend_w_ratio : 0.15)) - (50 + 10);
      var _lHg = _lH - (30 + 10);
      pCtx.c2d.beginPath();
      pCtx.c2d.moveTo(_lXz, _lYz);
      pCtx.c2d.lineTo(_lXz + _lWg, _lYz);
      pCtx.c2d.moveTo(_lXz, _lYz)
      pCtx.c2d.lineTo(_lXz, _lYz - _lHg);
      pCtx.c2d.stroke();
      // ---
      pCtx.c2d.fillText(lModel.x.name, _lXz + (_lWg - pCtx.c2d.measureText(lModel.x.name).width) * 0.5, _lY + _lH - 2);
      pCtx.c2d.save();
      pCtx.c2d.rotate(-0.5 * Math.PI);
      pCtx.c2d.fillText(lModel.y.name, -_lYz + (_lHg - pCtx.c2d.measureText(lModel.y.name).width) * 0.5, _lXz - 40);
      pCtx.c2d.restore();
      // ---
      pCtx.c2d.fillText(lXrange.first_str, _lXz + 5, _lYz + 10);
      pCtx.c2d.fillText(lXrange.middle_str, _lXz + (_lWg - pCtx.c2d.measureText(lXrange.middle_str).width) * 0.5, _lYz + 10);
      pCtx.c2d.fillText(lXrange.last_str, _lXz + _lWg - 5 - pCtx.c2d.measureText(lXrange.last_str).width, _lYz + 10);
      pCtx.c2d.fillText(lYrange.first_str, _lXz - pCtx.c2d.measureText(lYrange.first_str).width - 2, _lYz);
      pCtx.c2d.fillText(lYrange.middle_str, _lXz - pCtx.c2d.measureText(lYrange.middle_str).width - 2, 5 + _lYz - _lHg * 0.5);
      pCtx.c2d.fillText(lYrange.last_str, _lXz - pCtx.c2d.measureText(lYrange.last_str).width - 2, 10 + _lYz - _lHg);

      // Series.
      pCtx.c2d.save();
      pCtx.c2d.beginPath();
      pCtx.c2d.rect(_lXz, _lY, _lFadePct * _lWg, _lH);
      pCtx.c2d.rect(_lXz + _lWg, _lY, _lW - _lWg, _lH);
      pCtx.c2d.clip();
      var _lXfact = _lWg / lXrange.range;
      var _lYfact = _lHg / lYrange.range;
      var _lXlegend = _lX + _lWg + 55;
      var _lYlegend = _lY + 20;
      var _lDrawSeries =
        function(_pS)
        {
          pCtx.c2d.fillStyle = _pS.color;
          pCtx.c2d.strokeStyle = _pS.color;
          pCtx.c2d.beginPath();
          pCtx.c2d.moveTo(_lXz + (_pS.data[0][0] - lXrange.first) * _lXfact, _lYz - (_pS.data[0][1] - lYrange.first) * _lYfact);
          for (var _iD = 0; _iD < _pS.data.length; _iD++)
            pCtx.c2d.lineTo(_lXz + (_pS.data[_iD][0] - lXrange.first) * _lXfact, _lYz - (_pS.data[_iD][1] - lYrange.first) * _lYfact);
          pCtx.c2d.stroke();
          pCtx.c2d.fillText(_pS.name, _lXlegend, _lYlegend);
          _lYlegend += 14;
        }
      lModel.series.forEach(_lDrawSeries);
      pCtx.c2d.restore();

      pCtx.c2d.globalAlpha = 1.0;
    }
  this.postRender =
    function(pCtx)
    {
      if (1 != lHover)
        return;
      var _lTotW = undefined != lWidthConstraint ? lWidthConstraint : lParent.getEffectiveWidthConstraint(pCtx);
      var _lW = Math.min(_lTotW, lModel.layout[2] - lModel.layout[0]);
      var _lH = lThis.evalHeight(pCtx) - lModel.layout[1];
      var _lX = lX + lModel.layout[0] + (_lTotW - _lW) * 0.5;
      var _lY = lY + lModel.layout[1];
      var _lFontSize = 'tooltips_font_size' in lModel ? lModel.tooltips_font_size : 10;
      pCtx.c2d.fillStyle = "#eeeeee";
      pCtx.c2d.globalAlpha = 0.85;
      pCtx.c2d.fillRect(_lX, _lY, _lW, _lH);
      pCtx.c2d.fillStyle = "#111111";
      pCtx.c2d.globalAlpha = 1.0;
      for (var _iT = 0; _iT < lModel.tooltips.length; _iT++)
      {
        var _lTxtBox = new PrezTextInBox(lModel.tooltips[_iT], {font_size:_lFontSize, font_attr:"", font_type:"Helvetica", line_spacing:2, para_prolog:"", alinea:PrezRenderCtx.TABSIZE});
        _lTxtBox.layoutWords(pCtx, {x:_lX + 10, y:_lY + 10, w:_lW - 20, h:_lH - 20});
        _lTxtBox.render(pCtx, {x:_lX + 10, y:_lY + 10});
        _lY += _lTxtBox.getHeight();
      }
    }
  this.setParent = function(pCtx, pParent) { lT0 = pCtx.time; lParent = pParent; }
  this.getParent = function() { return lParent; }
  this.setPos = function(pPos) { if ('x' in pPos) lX = pPos.x; if ('y' in pPos) lY = pPos.y; }
  this.getPos = function() { return {x:lX, y:lY}; }
  this.evalHeight = function(pCtx) { return lModel.layout[3]; }
  this.setWidthConstraint = function(pWidthConstraint) { lWidthConstraint = pWidthConstraint; }
  var lHitTest =
    function(pCtx, pPos)
    {
      var _lTotW = undefined != lWidthConstraint ? lWidthConstraint : lParent.getEffectiveWidthConstraint(pCtx);
      var _lW = Math.min(_lTotW, lModel.layout[2] - lModel.layout[0]);
      var _lH = lThis.evalHeight(pCtx) - lModel.layout[1];
      var _lX = lX + lModel.layout[0] + (_lTotW - _lW) * 0.5;
      var _lY = lY + lModel.layout[1];
      if (pPos.x < _lX || pPos.x >= _lX + _lW) return 0;
      if (pPos.y < _lY || pPos.y >= _lY + _lH) return 0;
      return 1;
    }
  this.onMouseMove = function(pCtx, pPos) { if ('tooltips' in lModel) lHover = lHitTest(pCtx, pPos); }
}

/**
 * PrezElm_ObjGraph
 * A special widget to render inter-related PINs with properties.
 */
function PrezElm_ObjGraph(pCode)
{
  var lT0 = 0, lT0c = 0;
  var lParent = null;
  var lX = 10, lY = 10;
  var lModel = eval(pCode);
  var lInitialSchema = lModel[0];
  var lAdditionalProps = {};
  var lNumAdditionalProps = 0;
  var lMaxPropsPerObj = 1;
  var lLineHeight = 14;
  var lItemSize = {w:200, h:lMaxPropsPerObj * lLineHeight + 10};
  var lRoundRect =
    function(pCtx, pBox, pRadius)
    {
      pCtx.c2d.beginPath();
      pCtx.c2d.moveTo(pBox.x + pRadius, pBox.y);
      pCtx.c2d.bezierCurveTo(pBox.x, pBox.y, pBox.x, pBox.y, pBox.x, pBox.y + pRadius);
      pCtx.c2d.lineTo(pBox.x, pBox.y + pBox.h - pRadius);
      pCtx.c2d.bezierCurveTo(pBox.x, pBox.y + pBox.h, pBox.x, pBox.y + pBox.h, pBox.x + pRadius, pBox.y + pBox.h);
      pCtx.c2d.lineTo(pBox.x + pBox.w - pRadius, pBox.y + pBox.h);
      pCtx.c2d.bezierCurveTo(pBox.x + pBox.w, pBox.y + pBox.h, pBox.x + pBox.w, pBox.y + pBox.h, pBox.x + pBox.w, pBox.y + pBox.h - pRadius);
      pCtx.c2d.lineTo(pBox.x + pBox.w, pBox.y + pRadius);
      pCtx.c2d.bezierCurveTo(pBox.x + pBox.w, pBox.y, pBox.x + pBox.w, pBox.y, pBox.x + pBox.w - pRadius, pBox.y);
      pCtx.c2d.lineTo(pBox.x + pRadius, pBox.y);
      pCtx.c2d.closePath();
    }
  this.render =
    function(pCtx)
    {
      var lFadePct = pCtx.clampPct(4.0 * (pCtx.time - lT0) / 100.0);
      var lCurAdditionalPropPct = 4.0 * (pCtx.time - lT0c) / 100.0;
      var lCurAdditionalProp = Math.floor(lCurAdditionalPropPct);
      pCtx.c2d.font = "12pt Helvetica";
      for (var _iM = 1; _iM < lModel.length; _iM++)
      {
        var _lM = lModel[_iM];
        var _lX = lFadePct * _lM._x_ + (1 - lFadePct) * _lM._ix_;
        var _lY = lFadePct * lY + (1 - lFadePct) * _lM._iy_ + 100 * Math.sin(lFadePct * Math.PI);
        pCtx.c2d.globalAlpha = lFadePct * 0.7;
        pCtx.c2d.fillStyle = "#aaaaaa";
        lRoundRect(pCtx, {x:_lX, y:_lY, w:lItemSize.w - 20, h:lItemSize.h}, 30);
        pCtx.c2d.fill();
        pCtx.c2d.strokeStyle = "#aaaaaa";
        pCtx.c2d.lineWidth = 2;
        pCtx.c2d.globalAlpha = lFadePct;
        var _iPy = _lY + 15;
        for (var _iP in _lM)
        {
          if (_iP.match(/_\w+_/)) continue;
          if (_iP in lAdditionalProps)
          {
            if (lAdditionalProps[_iP] > lCurAdditionalProp) continue;
            var _lPct = pCtx.clampPct(lCurAdditionalPropPct - lAdditionalProps[_iP]);
            pCtx.c2d.fillStyle = pCtx.calcColor({from:0xff0000, to:0x000000, pct:_lPct});
            pCtx.c2d.strokeStyle = pCtx.calcColor({from:0xff0000, to:0xaaaaaa, pct:_lPct});
          }
          else
            pCtx.c2d.fillStyle = "#000000";
          pCtx.c2d.fillText(_iP + ":", _lX + 5, _iPy);
          var _lV = _lM[_iP];
          if (undefined != _lV && typeof(_lV) == "object")
          {
            pCtx.c2d.globalAlpha = lFadePct * 0.7;
            pCtx.c2d.beginPath();
            var _lVx = lFadePct * _lV._x_ + (1 - lFadePct) * _lV._ix_;
            var _lVy = lFadePct * lY + (1 - lFadePct) * _lV._iy_;
            var _lVxto = _lVx > _lX - 2 ? _lVx - 2 : _lVx + lItemSize.w - 18;
            pCtx.c2d.moveTo((_lVx > _lX - 2 ? _lX + lItemSize.w - 18 : _lX - 2), _iPy - 5);
            pCtx.c2d.lineTo(_lVxto, _lVy + 7);
            pCtx.c2d.stroke();
            pCtx.c2d.beginPath();
            pCtx.c2d.arc(_lVxto, _lVy + 5, 3, 0, 2 * Math.PI, true);
            pCtx.c2d.stroke();
            pCtx.c2d.globalAlpha = lFadePct;
          }
          else
          {
            pCtx.c2d.fillStyle = "#444444";
            var _lTxt = undefined == _lV ? "null" : _lV;
            pCtx.c2d.fillText(_lTxt, _lX + lItemSize.w - 25 - pCtx.c2d.measureText(_lTxt).width, _iPy)
          }
          _iPy += lLineHeight;
        }
      }
      pCtx.c2d.globalAlpha = 1.0;
      if (lCurAdditionalProp > lNumAdditionalProps + 5)
        lT0c = pCtx.time;
    }
  this.setParent =
    function(pCtx, pParent)
    {
      for (var _iM = 1; _iM < lModel.length; _iM++)
      {
        lModel[_iM]._x_ = 50 + lItemSize.w * (_iM - 1);
        lModel[_iM]._ix_ = pCtx.c2d.canvas.width * Math.random();
        lModel[_iM]._iy_ = pCtx.c2d.canvas.height * Math.random();
        var _lNumP = 0;
        for (var _iP in lModel[_iM])
        {
          if (_iP.match(/_\w+_/)) continue;
          _lNumP++;
          if (!(_iP in lInitialSchema) && !(_iP in lAdditionalProps))
            lAdditionalProps[_iP] = countProperties(lAdditionalProps) + 1;
        }
        if (_lNumP > lMaxPropsPerObj)
          lMaxPropsPerObj = _lNumP;
      }
      lNumAdditionalProps = countProperties(lAdditionalProps);
      lItemSize.h = lMaxPropsPerObj * lLineHeight + 10;
      lT0 = lT0c = pCtx.time; lParent = pParent;
    }
  this.getParent = function() { return lParent; }
  this.setPos = function(pPos) { if ('x' in pPos) lX = pPos.x; if ('y' in pPos) lY = pPos.y + 5; }
  this.getPos = function() { return {y:lY}; }
  this.evalHeight = function(pCtx) { return lItemSize.h + 10; }
}

/**
 * PrezElm_StaticGraph
 * A general-purpose widget to draw static user-defined primitives.
 * The coordinates specified in the user script are in [0, 1] (i.e. normalized to fit the size of the widget).
 */
function PrezElm_StaticGraph(pCode, pStartStep)
{
  var lThis = this;
  var lT0 = 0;
  var lParent = null;
  var lX = 10, lY = 10;
  var lWidthConstraint = null;
  var lModel = eval(pCode);
  var lDashed = new Image(); lDashed.src = $("#dashed_src").text();
  var lSpeed = ('speed' in lModel ? lModel.speed : 1);
  var lStartStep = pStartStep;
  var lAccelerate = false;
  var lDrawThickArrow =
    function(pCtx, pThck)
    {
      pCtx.c2d.moveTo(-pThck, -2 * pThck);
      pCtx.c2d.lineTo(pThck, -2 * pThck);
      pCtx.c2d.lineTo(pThck, pThck);
      pCtx.c2d.lineTo(2 * pThck, pThck);
      pCtx.c2d.lineTo(0, 2 * pThck);
      pCtx.c2d.lineTo(-2 * pThck, pThck);
      pCtx.c2d.lineTo(-pThck, pThck);
      pCtx.c2d.lineTo(-pThck, -2 * pThck);
    }
  var lDrawThickBidirArrow =
    function(pCtx, pXc, pYc, pThck)
    {
      pCtx.c2d.moveTo(pXc - pThck, pYc - pThck);
      pCtx.c2d.lineTo(pXc - 2 * pThck, pYc - pThck);
      pCtx.c2d.lineTo(pXc, pYc - 2 * pThck);
      pCtx.c2d.lineTo(pXc + 2 * pThck, pYc - pThck);
      pCtx.c2d.lineTo(pXc + pThck, pYc - pThck);
      pCtx.c2d.lineTo(pXc + pThck, pYc + pThck);
      pCtx.c2d.lineTo(pXc + 2 * pThck, pYc + pThck);
      pCtx.c2d.lineTo(pXc, pYc + 2 * pThck);
      pCtx.c2d.lineTo(pXc - 2 * pThck, pYc + pThck);
      pCtx.c2d.lineTo(pXc - pThck, pYc + pThck);
      pCtx.c2d.lineTo(pXc - pThck, pYc - pThck);
    }
  this.render =
    function(pCtx)
    {
      var _lFadePct = 0.9 * pCtx.clampPct(4.0 * (pCtx.time - lT0) / 100.0);
      var _lTotW = undefined != lWidthConstraint ? lWidthConstraint : lParent.getEffectiveWidthConstraint(pCtx);
      var _lW = Math.min(_lTotW, lModel.layout[2] - lModel.layout[0]);
      var _lH = lThis.evalHeight(pCtx) - lModel.layout[1];
      var _lX = lX + lModel.layout[0] + (_lTotW - _lW) * 0.5;
      var _lY = lY + lModel.layout[1];

      pCtx.c2d.save();
      pCtx.c2d.globalAlpha = _lFadePct;
      for (var _i = 0; _i < lModel.instructions.length; _i++)
      {
        var _lI = lModel.instructions[_i];
        if ('t' in _lI)
        {
          if (pCtx.slideStep > lStartStep && pCtx.fastStep)
            lAccelerate = true;
          if (pCtx.time - lT0 < _lI.t * 100.0 / lSpeed && !lAccelerate) continue;
          if ('duration' in _lI && pCtx.time - lT0 > (_lI.t + _lI.duration) * 100.0 / lSpeed) continue;
          pCtx.c2d.globalAlpha = _lFadePct * pCtx.clampPct((pCtx.time - lT0) / 50.0 - (lAccelerate ? 0 : _lI.t));
        }
        var _lOffx = 0; var _lOffy = 0;
        if ('fillStyle' in _lI)
          pCtx.c2d.fillStyle = _lI.fillStyle;
        if ('strokeStyle' in _lI)
          pCtx.c2d.strokeStyle = _lI.strokeStyle;
        pCtx.c2d.lineWidth = ('lineWidth' in _lI) ? _lI.lineWidth : 1;
        var _lAngle = ('angle' in _lI) ? _lI.angle : 90;
        switch (_lI.type)
        {
          case 'stroke':
            pCtx.c2d.beginPath();
            pCtx.c2d.moveTo(_lX + _lI.x0 * _lW, _lY + _lI.y0 * _lH);
            pCtx.c2d.lineTo(_lX + _lI.x1 * _lW, _lY + _lI.y1 * _lH);
            pCtx.c2d.stroke();
            break;
          case 'strokeCircle':
            pCtx.c2d.beginPath();
            pCtx.c2d.arc(_lX + _lI.x * _lW, _lY + _lI.y * _lH, _lI.radius, 0, 2 * Math.PI, true);
            pCtx.c2d.stroke();
            break;
          case 'strokeThickArrow':
            pCtx.c2d.save();
            pCtx.c2d.translate(_lX + _lI.x * _lW, _lY + _lI.y * _lH);
            pCtx.c2d.rotate(Math.PI * (_lAngle - 90) / 180);
            pCtx.c2d.beginPath();
            lDrawThickArrow(pCtx, _lI.thickness * Math.min(_lW, _lH));
            pCtx.c2d.stroke();
            pCtx.c2d.restore();
            break;
          case 'strokeThickVerticalArrowBidir':
            pCtx.c2d.beginPath();
            lDrawThickBidirArrow(pCtx, _lX + (_lI.x * _lW), _lY + (_lI.y * _lH), _lI.thickness * Math.min(_lW, _lH));
            pCtx.c2d.stroke();
            break;
          case 'strokeThickHorizontalArrowBidir':
            pCtx.c2d.save();
            pCtx.c2d.rotate(-0.5 * Math.PI);
            pCtx.c2d.beginPath();
            lDrawThickBidirArrow(pCtx, -_lY - (_lI.y * _lH), _lX + (_lI.x * _lW), _lI.thickness * Math.min(_lW, _lH));
            pCtx.c2d.stroke();
            pCtx.c2d.restore();
            break;
          case 'strokeDB':
          {
            var _lXc = _lX + _lI.x * _lW;
            var _lYc = _lY + _lI.y * _lH;
            var _lw = _lI.w * _lW;
            var _lh = _lI.h * _lH;
            pCtx.c2d.beginPath();
            pCtx.c2d.moveTo(_lXc + _lw , _lYc + 0.25 * _lh);
            pCtx.c2d.bezierCurveTo(_lXc + 0.9 * _lw, _lYc + 0.1 * _lh, _lXc + 0.1 * _lw, _lYc + 0.1 * _lh, _lXc, _lYc + 0.25 * _lh);
            pCtx.c2d.lineTo(_lXc, _lYc + 0.75 * _lh);
            pCtx.c2d.bezierCurveTo(_lXc + 0.1 * _lw, _lYc + 1.1 * _lh, _lXc + 0.9 * _lw, _lYc + 1.1 * _lh, _lXc + _lw, _lYc + 0.75 * _lh);
            pCtx.c2d.lineTo(_lXc + _lw, _lYc + 0.25 * _lh);
            pCtx.c2d.bezierCurveTo(_lXc + 0.9 * _lw, _lYc + 0.35 * _lh, _lXc + 0.1 * + _lw, _lYc + 0.35 * _lh, _lXc, _lYc + 0.25 * _lh);
            pCtx.c2d.stroke();
            break;
          }
          case 'fillRect':
            pCtx.c2d.fillRect(_lX + _lI.x * _lW, _lY + _lI.y * _lH, _lI.w * _lW, _lI.h * _lH);
            break;
          case 'fillText':
            pCtx.c2d.font = _lI.font;
            if ('dx' in _lI) _lOffx = pCtx.c2d.measureText(_lI.text).width * _lI.dx;
            if ('dy' in _lI) _lOffy = parseInt(_lI.font.match(/(.*\s)*([0-9]+)pt/)[2]) * _lI.dy;
            pCtx.c2d.fillText(_lI.text, _lX + _lI.x * _lW + _lOffx, _lY + _lI.y * _lH + _lOffy);
            break;
          case 'textBox':
            pCtx.c2d.save();
            pCtx.c2d.fillRect(_lX + _lI.x * _lW, _lY + _lI.y * _lH, _lI.w * _lW, _lI.h * _lH);
            if ('dashed' in _lI)
            {
              var _lPattern = pCtx.c2d.createPattern(lDashed, "repeat");
              pCtx.c2d.strokeStyle = _lPattern;
            }
            pCtx.c2d.beginPath();
            pCtx.c2d.rect(_lX + _lI.x * _lW, _lY + _lI.y * _lH, _lI.w * _lW, _lI.h * _lH);
            pCtx.c2d.stroke();
            pCtx.c2d.clip();
            pCtx.c2d.fillStyle = _lI.textStyle;
            pCtx.c2d.font = _lI.font;
            _lOffx = 0.5 * (_lI.w * _lW - pCtx.c2d.measureText(_lI.text).width);
            _lOffy = 1.2 * (_lI.h * _lH - parseInt(_lI.font.match(/(.*\s)*([0-9]+)pt/)[2]));
            pCtx.c2d.fillText(_lI.text, _lX + _lI.x * _lW + _lOffx, _lY + _lI.y * _lH + _lOffy);
            pCtx.c2d.restore();
            break;
        }
        pCtx.c2d.globalAlpha = _lFadePct;
      }
      pCtx.c2d.restore();
    }
  this.setParent = function(pCtx, pParent) { lT0 = pCtx.time; lParent = pParent; }
  this.getParent = function() { return lParent; }
  this.setPos = function(pPos) { if ('x' in pPos) lX = pPos.x; if ('y' in pPos) lY = pPos.y; }
  this.getPos = function() { return {x:lX, y:lY}; }
  this.evalHeight = function(pCtx) { return lModel.layout[3]; }
  this.setWidthConstraint = function(pWidthConstraint) { lWidthConstraint = pWidthConstraint; }
}

/**
 * PrezTransition
 */
function PrezElm_LRButtons(pOnLeft, pOnRight)
{
  var lThis = this;
  var lParent = null;
  var lT0 = 0;
  var lY = 0;
  var lHoverWhat = -1;
  var lXcRatio = 0.75;
  var lPrevW = null;
  this.render =
    function(pCtx)
    {
      var lFadePct = pCtx.clampPct(4.0 * (pCtx.time - lT0) / 100.0);
      var _lTotW = lParent.getEffectiveWidthConstraint(pCtx);
      var _lXc = Math.floor(_lTotW * lXcRatio);
      pCtx.c2d.globalAlpha = lFadePct * 0.7;
      pCtx.c2d.strokeStyle = "#000000";

      pCtx.c2d.fillStyle = lHoverWhat == 0 ? "#444444" : "#777777";
      pCtx.c2d.lineWidth = 1;
      pCtx.c2d.beginPath();
      pCtx.c2d.moveTo(_lXc, lY);
      pCtx.c2d.bezierCurveTo(_lXc - 75, lY, _lXc - 75, lY + 10, _lXc, lY + 10);
      pCtx.c2d.closePath();
      pCtx.c2d.fill();
      pCtx.c2d.stroke();

      pCtx.c2d.fillStyle = lHoverWhat == 1 ? "#444444" : "#777777";
      pCtx.c2d.beginPath();
      pCtx.c2d.moveTo(_lXc, lY);
      pCtx.c2d.bezierCurveTo(_lXc + 75, lY, _lXc + 75, lY + 10, _lXc, lY + 10);
      pCtx.c2d.closePath();
      pCtx.c2d.fill();
      pCtx.c2d.stroke();

      pCtx.c2d.fillStyle = "#000000";
      pCtx.c2d.font = "6pt Helvetica";
      if (undefined == lPrevW)
        lPrevW = pCtx.c2d.measureText("prev").width;
      pCtx.c2d.fillText("prev", _lXc - 15 - lPrevW, lY + 7);
      pCtx.c2d.fillText("next", _lXc + 15, lY + 7);

      pCtx.c2d.globalAlpha = 1.0;
    }
  this.setParent = function(pCtx, pParent) { lT0 = pCtx.time; lParent = pParent; }
  this.getParent = function() { return lParent; }
  this.setPos = function(pPos) { if ('y' in pPos) lY = pPos.y + 5; }
  this.getPos = function() { return {y:lY}; }
  this.evalHeight = function(pCtx) { return 20; }
  var lHitTest =
    function(pCtx, pPos)
    {
      if (pPos.y < lY || pPos.y >= lY + lThis.evalHeight(pCtx)) return -1;
      var _lTotW = lParent.getEffectiveWidthConstraint(pCtx);
      var _lXc = Math.floor(_lTotW * lXcRatio);
      if (pPos.x >= _lXc - 60 && pPos.x < _lXc) return 0;
      else if (pPos.x <= _lXc + 60 && pPos.x > _lXc) return 1;
      return -1;
    }
  this.onMouseMove = function(pCtx, pPos) { lHoverWhat = lHitTest(pCtx, pPos); }
  this.onMouseDown = function(pCtx, pPos) { var _lWhat = lHitTest(pCtx, pPos); if (0 == _lWhat) pOnLeft(); else if (1 == _lWhat) pOnRight(); }
}

/**
 * PrezTransition
 */
function PrezTransition_Basic(pElements, pOnFinished, pOptions)
{
  var lThis = this;
  var lParent = null;
  var lT0 = 0;
  var lX = 0, lY = 0;
  var lDelta = 0;
  var lGetOption = function(_pWhat, _pDefault) { return (undefined != pOptions && _pWhat in pOptions) ? pOptions[_pWhat] : _pDefault; }
  var lDuration = lGetOption('duration', 15); // Note: in time units (rendering context)
  var lDirection = lGetOption('direction', 'left');
  var lBmps = [];
  this.render =
    function(pCtx)
    {
      lDelta += 30 * Math.log(pCtx.time == lT0 ? 1.0 : (pCtx.time - lT0)); // Note: acceleration effect
      pCtx.c2d.save();
      pCtx.c2d.setTransform(1, 0, 0, 1, 0, 0);
      pCtx.c2d.globalAlpha = pCtx.clampPct((lDuration - pCtx.time + lT0) / lDuration);
      pCtx.c2d.beginPath();
      pCtx.c2d.rect(lX, lY, lBmps[0].width, lThis.evalHeight(pCtx));
      pCtx.c2d.clip();
      var _lY = lY;
      try
      {
        for (var _iB = 0; _iB < lBmps.length; _lY += lBmps[_iB].height, _iB++)
          pCtx.c2d.drawImage(lBmps[_iB], lDirection == 'left' ? (lX - lDelta) : (lX + lDelta), _lY);
      }
      catch (e) {} // REVIEW: Why do I hit this problem on some browsers?
      pCtx.c2d.restore();
      if (pCtx.time - lT0 > lDuration)
        pOnFinished(lThis, pElements);
    }
  this.setParent =
    function(pCtx, pParent)
    {
      lParent = pParent;
      lBmps.splice(0);
      lX = pElements[0].getPos().x;
      lY = pElements[0].getPos().y;
      for (var _iE = 0; _iE < pElements.length; _iE++)
      {
        var _lE = pElements[_iE];
        var _lIm = document.createElement('canvas');
        _lIm.setAttribute('width', _lE.getEffectiveWidthConstraint(pCtx));
        _lIm.setAttribute('height', _lE.evalHeight(pCtx));
        var _lTmpCtx = new PrezRenderCtx($(_lIm), null);
        _lTmpCtx.time = pCtx.time;
        var _lOrgPos = _lE.getPos();
        _lE.setPos({x:0, y:0}); _lE.layout(pCtx);
        _lE.render(_lTmpCtx);
        _lE.setPos(_lOrgPos); _lE.layout(pCtx);
        lBmps.push(_lIm);
        if ('mute' in _lE)
          _lE.mute(true);
      }
      lT0 = pCtx.time;
    }
  this.getParent = function() { return lParent; }
  this.setPos = function(pPos) { if ('x' in pPos) lX = pPos.x; if ('y' in pPos) lY = pPos.y; }
  this.getPos = function() { return {x:lX, y:lY}; }
  this.evalHeight = function(pCtx) { var _lH = 0; lBmps.forEach(function(_pB) { _lH += _pB.height; }); return _lH; }
  this.inLayout = function() { return false; }
}

/**
 * Prez.
 * A small slide presentation engine, for promotional/educational purposes,
 * to facilitate the presentation of comparisons with other technologies.
 */
function Prez()
{
  var lCtx;
  var lThis = this;
  var lCanvas = $("#thecanvas");
  var lDeck = new PrezSlideDeck();
  var lScene = new PrezScene();
  try { lCtx = new PrezRenderCtx(lCanvas, function(pCtx) { lScene.render(pCtx); }); } catch(e) { myLog("html5 canvas not supported"); disableTab("#tab-promo", true); return; }
  if (undefined != window.location.hash && typeof(window.location.hash) == "string" && window.location.hash.charAt(0) == '#')
    { lCtx.setSlideNum(lDeck, parseInt(window.location.hash.substr(1)) - 1); }
  var lSlideDriver = new PrezSlideDriver(lDeck, lScene, lCtx);
  lSlideDriver.initSlide();

  // Basic interactions.
  lCanvas.mousedown(function(e) { var _lOffset = lCanvas.offset(); lScene.onMouseDown(lCtx, {x:e.pageX - _lOffset.left, y:e.pageY - _lOffset.top}); });
  lCanvas.mousemove(function(e) { var _lOffset = lCanvas.offset(); lScene.onMouseMove(lCtx, {x:e.pageX - _lOffset.left, y:e.pageY - _lOffset.top}); });
  lCanvas.mouseup(function(e) { var _lOffset = lCanvas.offset(); lScene.onMouseUp(lCtx, {x:e.pageX - _lOffset.left, y:e.pageY - _lOffset.top}); });
  lOnWheel = function(e) { e = (undefined != e) ? e : window.event; var _lV = ('wheelDelta' in e ? -e.wheelDelta : e.detail); lScene.onMouseWheel(lCtx, {delta:_lV}); }
  var lOnKeyDown =
    function(e)
    {
      switch (e.which)
      {
        case 32: lSlideDriver.moveForward(true); break;
        case 37: lSlideDriver.prevSlide(); break;
        case 39: lSlideDriver.nextSlide(); break;
        case 188: lSlideDriver.prevMode(); break;
        case 190: lSlideDriver.nextMode(); break;
        case 80: lSlideDriver.pauseResume(); break;
        case 83: lSlideDriver.stayOnSlide(); break;
        default: break;
      }
    }
  var lOnKeyUp = function(e) {}
  var lManageWindowEvents =
    function(_pOn)
    {
      var _lFunc = _pOn ? window.addEventListener : window.removeEventListener;
      _lFunc('resize', function() { lCtx.updateCanvasSize(); lScene.layout(lCtx); }, true);
      _lFunc('mousewheel', lOnWheel, true);
      _lFunc('DOMMouseScroll', lOnWheel, true);
      _lFunc('keydown', lOnKeyDown, true);
      _lFunc('keyup', lOnKeyUp, true);
    }
  var lTabPromo = (top === self) ? lCanvas : window.parent.$("#tab-promo");
  lTabPromo.bind("activate_tab", function() { lThis.active = true; lSlideDriver.start(); lManageWindowEvents(true); });
  lTabPromo.bind("deactivate_tab", function() { lManageWindowEvents(false); lSlideDriver.stop(); lThis.active = false; });

  lCtx.updateCanvasSize();
}

// TODO: flow timing weirdness sometimes
// TODO: support and use <pre>...
// TODO: optional log scale in mathgraph
// TODO: measure again size characteristics for that simple table (also: double-check sqlite with mysql; average couch and mongo, if still similar)
