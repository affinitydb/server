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
    lP = new Prez();

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
  this.slideMode = 0 // The current mode (sql/affinity/...); for now, the whole slide is in 1 mode at a time.
  this.slideNumSteps = 0; // The number of sub-steps in the current slide (for progress indicator).
  this.slideNumModes = 0; // The number of modes in the current slide (for progress indicator).
  this.timeTick = 50; // The elapsed time between each frame, in ms.
  this.time = 0; // The animation time, in ticks (time just keeps increasing until the slide changes).
  this.drawFunc = pDrawFunc; // The function that redraws the canvas.
  this.updateCanvasSize = function() { pCanvas.attr("width", pCanvas.width()); pCanvas.attr("height", pCanvas.height()); }
  this.nextSlide = function(pDeck) { lThis.slideNum++; if (lThis.slideNum >= pDeck.getNumSlides()) lThis.slideNum = 0; }
  this.prevSlide = function(pDeck) { lThis.slideNum--; if (lThis.slideNum < 0) lThis.slideNum = pDeck.getNumSlides() - 1; }
  this.resetSlide = function() { lThis.slideStep = 0; lThis.slideMode = 0; }
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
  var lExtractVs = function(pHtmlElm, pMode) { var _lR = pHtmlElm.attr('class').split(/\s+/).filter(function(_pC) { return undefined != _pC.match(/^vs_/); }); if (pMode == "affinity") _lR.push("vs_affinity"); return _lR; }
  var lProcessHtmlElm =
    function(pHtml, pMode, pAdder, pContainer)
    {
      var _lHtml = $(pHtml);
      var _lPromoStyle = _lHtml.attr("promostyle");
      if (undefined != _lPromoStyle)
        _lPromoStyle = $.parseJSON(_lPromoStyle);
      if (_lHtml.hasClass("jsmodel"))
        pAdder(new PrezElm_ObjGraph(_lHtml.text()), pContainer);
      else if (_lHtml.hasClass("mathgraph"))
        pAdder(new PrezElm_MathGraph(_lHtml.text()), pContainer);
      else if (_lHtml.hasClass("vspacer"))
        pAdder(new PrezElm_VSpacer(parseInt(_lHtml.text()), (undefined != _lPromoStyle && 'delay' in _lPromoStyle) ? _lPromoStyle.delay : null), pContainer);
      else if (_lHtml.hasClass("bigurllink"))
        pAdder(new PrezElm_BigUrl(_lHtml.text(), _lHtml.attr("url")), pContainer);
      else if (_lHtml.hasClass("container_horizontal") || _lHtml.hasClass("container_vertical"))
      {
        var _lCnt = new PrezContainer(_lHtml.hasClass("container_horizontal") ? 'horizontal' : 'vertical', 'custom');
        pAdder(_lCnt, pContainer);
        var _lLIs = _lHtml.children("ul").children("li");
        for (var _iLI = 0; _iLI < _lLIs.length; _iLI++)
          lProcessHtmlElm($(_lLIs[_iLI]), pMode, pAdder, _lCnt);
      }
      else if (0 != _lHtml.children("ul").length)
      {
        var _lTxt = _lHtml.children("p");
        pAdder(new PrezElm_FadeInTxt(_lTxt.html(), {mode:pMode, bullet:lWithBullet(_lTxt.first()), highlights:lExtractVs(_lTxt.first(), pMode), fontsizes:lFontSizes}), pContainer);
        var _lLIs = _lHtml.find("li");
        for (var _iLI = 0; _iLI < _lLIs.length; _iLI++)
        {
          var _lLI = $(_lLIs[_iLI]);
          if (_lLI.hasClass("vspacer"))
            pAdder(new PrezElm_VSpacer(parseInt(_lLI.text()), null), pContainer);
          else
            pAdder(new PrezElm_FadeInTxt(_lLI.html(), {mode:pMode, level:1, bullet:lWithBullet(_lLI), highlights:lExtractVs(_lLI, pMode), fontsizes:lFontSizes}), pContainer);
        }
      }
      else
        pAdder(new PrezElm_FadeInTxt(_lHtml.html(), {mode:pMode, bullet:lWithBullet(_lHtml), highlights:lExtractVs(_lHtml, pMode), fontsizes:lFontSizes}), pContainer);
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
  var lHeartBeat =
    function()
    {
      // Advance time.
      pCtx.time++;
      
      // If the user remains idle for too long, move on automatically.
      if ((pCtx.time - pScene.lastModifTime()) > lIdleInterval && !pScene.hasDelayedElements())
        lThis.moveForward();

      // Render.
      pCtx.drawFunc(pCtx);
    }

  this.start = function() { if (undefined == lDrawTimer && undefined != pCtx.drawFunc) { lDrawTimer = setInterval(lHeartBeat, pCtx.timeTick); } }
  this.stop = function() { clearInterval(lDrawTimer); lDrawTimer = null; }
  this.pauseResume = function() { if (undefined == lDrawTimer) lThis.start(); else lThis.stop(); }
  this.initSlide =
    function()
    {
      // Grab the slide's html definition.
      lSlide = pDeck.getCurSlide(pCtx);
      lSlidePromoStyle = lSlide.attr("promostyle");
      if (undefined != lSlidePromoStyle)
        lSlidePromoStyle = $.parseJSON(lSlidePromoStyle);
      lIdleInterval = ((undefined != lSlidePromoStyle && 'idledelay' in lSlidePromoStyle) ? lSlidePromoStyle.idledelay : 5500) / pCtx.timeTick;
      lFontSizes = ((undefined != lSlidePromoStyle && 'fontsizes' in lSlidePromoStyle) ? lSlidePromoStyle.fontsizes : [18, 12]);

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
    function()
    {
      if (pCtx.slideStep >= lNumSteps - 1)
        return;
      pCtx.slideStep++;
      lAddCurrentStep();
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
    function()
    {
      if (undefined == lDrawTimer)
        lThis.start();
      else if (pScene.hasDelayedElements())
        pScene.flushDelayedElements(pCtx);
      else if (pCtx.slideStep < lNumSteps - 1)
        lThis.nextStep();
      else if (lSlideModes.length > 1 && pCtx.slideMode < lSlideModes[lSlideModes.length - 1].i)
        lThis.nextMode();
      else
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
  var lStrokeFrame = lGetOption('strokeFrame', null);
  var lFillFrame = lGetOption('fillFrame', null);
  // ---
  this.label = pLabel;
  this.setParent = function(pCtx, pParent) { lParent = pParent; }
  this.getParent = function() { return lParent; }
  this.setWidthConstraint = function(pWidthConstraint) { lWidthConstraint = pWidthConstraint; }
  this.getWidthConstraint = function() { return lWidthConstraint; }
  this.getEffectiveWidthConstraint = function(pCtx) { return undefined != lWidthConstraint ? lWidthConstraint : (undefined != lParent ? lParent.getEffectiveWidthConstraint(pCtx) : (pCtx.c2d.canvas.width - 20)); }
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
      lElements.forEach(function(_pE) { _pE.render(pCtx); });
    }
  this.postRender = function(pCtx) { lElements.forEach(function(_pE) { if ('postRender' in _pE) _pE.postRender(pCtx); }); }
  this.layout =
    function(pCtx)
    {
      if (0 == lElements.length)
        return;
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
            _lE.layout(pCtx);
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
            _lE.layout(pCtx);
          lNextY += _lE.evalHeight(pCtx);
        }
      }
    }
  // ---
  this.onMouseDown = function(pCtx, pPos) { lElements.forEach(function(_pE) { if (_pE.hasOwnProperty('onMouseDown')) _pE.onMouseDown(pCtx, pPos); }); }
  this.onMouseMove = function(pCtx, pPos) { lElements.forEach(function(_pE) { if (_pE.hasOwnProperty('onMouseMove')) _pE.onMouseMove(pCtx, pPos); }); }
  this.onMouseUp = function(pCtx, pPos) { lElements.forEach(function(_pE) { if (_pE.hasOwnProperty('onMouseUp')) _pE.onMouseUp(pCtx, pPos); }); }  
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
  // ---
  this.onMouseDown = function(pCtx, pPos) { lContainer.onMouseDown(pCtx, pPos); }
  this.onMouseMove = function(pCtx, pPos) { lContainer.onMouseMove(pCtx, pPos);  }
  this.onMouseUp = function(pCtx, pPos) { lContainer.onMouseUp(pCtx, pPos); }  
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
        setTimeout(_lNext, 'getDelay' in pElm ? pElm.getDelay() : 500);
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
function drawStreamingSchema(pCtx, pBox, pImages, pLogo, pJitter)
{
  var lMargins = {x:100, y:40};
  var lPctr = {x:pBox.x + 0.5 * (pBox.w - pImages[0].width), y:pBox.y + 0.5 * (pBox.h - pImages[0].height)};
  var lJitter1 = pJitter ? {x:10 * Math.cos(2 * Math.PI * 0.123 * pCtx.time / 50), y:10 * Math.sin(2 * Math.PI * 0.123 * pCtx.time / 50)} : {x:0, y:0};
  var lJitter2 = pJitter ? {x:10 * Math.cos(2 * Math.PI * 0.365 * pCtx.time / 50), y:10 * Math.sin(2 * Math.PI * 0.365 * pCtx.time / 50)} : {x:0, y:0};
  // Draw the images (server in the center, devices on the edge).
  if (pCtx.slideNum < 2) pCtx.c2d.drawImage(pImages[0], lPctr.x, lPctr.y);
  if (pCtx.slideNum < 1) pCtx.c2d.drawImage(pImages[1], lJitter1.x + pBox.x + lMargins.x, lJitter1.y + pBox.y + lMargins.y);
  if (pCtx.slideNum < 3) pCtx.c2d.drawImage(pImages[2], lJitter2.x + pBox.x + pBox.w - pImages[2].width - lMargins.x, lJitter1.y + pBox.y + lMargins.y);
  if (pCtx.slideNum < 2) pCtx.c2d.drawImage(pImages[3], lJitter1.x + pBox.x + pBox.w - pImages[3].width - lMargins.x, lJitter2.y + pBox.y + pBox.h - pImages[3].height - lMargins.y);
  if (pCtx.slideNum < 1) pCtx.c2d.drawImage(pImages[4], lJitter2.x + pBox.x + lMargins.x, lJitter2.y + pBox.y + pBox.h - pImages[4].height - lMargins.y);
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
  if (pCtx.slideNum < 1) lDrawStraightArrow({x:pBox.x + pImages[1].width + lMargins.x, y:pBox.y + 0.5 * pImages[1].height + lMargins.y}, lPctr);
  if (pCtx.slideNum < 2) lDrawStraightArrow({x:lPctr.x + pImages[0].width, y:lPctr.y + pImages[0].height}, {x:pBox.x + pBox.w - pImages[2].width - lMargins.x, y:pBox.y + pBox.h - 0.5 * pImages[3].height - lMargins.y}, true);
  if (pCtx.slideNum < 2) lDrawStraightArrow({x:lPctr.x + pImages[0].width, y:lPctr.y}, {x:pBox.x + pBox.w - pImages[2].width - lMargins.x, y:pBox.y + 0.5 * pImages[2].height + lMargins.y}, true);
  if (pCtx.slideNum < 1) lDrawStraightArrow({x:pBox.x + pImages[4].width + lMargins.x, y:pBox.y + pBox.h - 0.5 * pImages[4].height - lMargins.y}, {x:lPctr.x, y:lPctr.y + pImages[0].height});
  // Draw arrows from the devices to themselves (fast).
  var lCrvArrows =
    [{x:lJitter1.x + pBox.x + pImages[1].width + lMargins.x, y:lJitter1.y + pBox.y + 0.75 * pImages[1].height + lMargins.y},
    {x:lJitter2.x + pBox.x + pBox.w - pImages[2].width - lMargins.x, y:lJitter1.y + pBox.y + 0.75 * pImages[2].height + lMargins.y},
    {x:lJitter1.x + pBox.x + pBox.w - pImages[3].width - lMargins.x, y:lJitter2.y + pBox.y + pBox.h - 0.25 * pImages[3].height - lMargins.y},
    {x:lJitter2.x + pBox.x + pImages[4].width + lMargins.x, y:lJitter2.y + pBox.y + pBox.h - 0.25 * pImages[4].height - lMargins.y}];
  var lDrawAffinity = function(pCrvIdx) { lDrawArc(lCrvArrows[pCrvIdx]); pCtx.c2d.drawImage(pLogo, lCrvArrows[pCrvIdx].x - 0.5 * pLogo.width, lCrvArrows[pCrvIdx].y + 30); }
  if (pCtx.slideNum < 1) lDrawAffinity(0);
  if (pCtx.slideNum < 3) lDrawAffinity(1);
  if (pCtx.slideNum < 2) lDrawAffinity(2);
  if (pCtx.slideNum < 1) lDrawAffinity(3);
}

/**
 * PrezElm_Bkg
 * An animated background (evokes a graph).
 */
function PrezElm_Bkg(pW, pH, pPromoStyle)
{
  if (undefined == pPromoStyle)
    pPromoStyle = {theme:"graph"};
  var lParent = null;
  var lVertices = [];
  var lUrl = $("#promo_url").text();
  var lCopyright = $("#copyright").text();
  var lHelp = $("#help").text();
  var lStreamingImages = null;
  var lLogo = new Image(); lLogo.src = $("#logo_src").text();
  for (var iV = 0; iV < 8; iV++)
    lVertices.push({radius:20 + 100 * Math.random(), orbit:20 + 200 * Math.random(), xc:pW * Math.random(), yc:pH * Math.random(), ostart:Math.random(), links:{}});
  for (var iE = 0; iE < 15; iE++)
    { var lV1 = Math.floor(Math.random() * lVertices.length); var lV2 = Math.floor(Math.random() * lVertices.length); if (lV1 == lV2) continue; lVertices[lV1].links[lV2.toString()] = 1; }
  var lSpeedCtrl = 2500.0;
  var lDimCtx = {w:1, h:1};
  var lSlideTransitionInfo = {prevSlideNum:0, curSlideNum:0, prevSlideLastScale:1.0, transitionTime:0}
  var lLastScaleVal = 1.0;
  var lAnimateVertices =
    function(pCtx)
    {
      for (var _iV = 0; _iV < lVertices.length; _iV++)
      {
        var _lV = lVertices[_iV];
        var _lA = 2 * Math.PI * ((lSpeedCtrl * _lV.ostart + pCtx.time) % lSpeedCtrl) / lSpeedCtrl;
        _lV.x = _lV.xc + _lV.orbit * Math.cos(_lA);
        _lV.y = _lV.yc + _lV.orbit * Math.sin(_lA);
      }
    }
  var lRenderVertices =
    function(pCtx)
    {
      pCtx.c2d.fillStyle = "#dedede";
      pCtx.c2d.strokeStyle = "#dedede";
      pCtx.c2d.lineWidth = 3;
      for (var _iV = 0; _iV < lVertices.length; _iV++)
      {
        var _lV = lVertices[_iV];
        pCtx.c2d.beginPath();
        pCtx.c2d.arc(_lV.x, _lV.y, _lV.radius, 0, 2 * Math.PI, false);
        pCtx.c2d.closePath();
        pCtx.c2d.fill();
        for (var _iE in _lV.links)
        {
          pCtx.c2d.beginPath();
          pCtx.c2d.moveTo(_lV.x, _lV.y);
          pCtx.c2d.lineTo(lVertices[parseInt(_iE)].x, lVertices[parseInt(_iE)].y);
          pCtx.c2d.stroke();
        }
      }
    }
  var lRenderDraft =
    function(pCtx)
    {
      pCtx.c2d.save();
      pCtx.c2d.font = "60pt Helvetica";
      pCtx.c2d.fillStyle = "#dedede";
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
      case "streaming":
      {
        if (undefined == lStreamingImages)
        {
          var _lSIsrc = ["serverrack.png", "winecooler.png", "coffee_maker.png", "oven.png", "cooling.png"]
          lStreamingImages = [];
          for (var _iSrc = 0; _iSrc < _lSIsrc.length; _iSrc++)
            { _lI = new Image(); _lI.src = "../images/dsms/" + _lSIsrc[_iSrc]; lStreamingImages.push(_lI); }
        }
        var _lBox = {x:0, y:0, w:pCtx.c2d.canvas.width, h:pCtx.c2d.canvas.height};
        var _lScale = (pCtx.slideNum < 2) ? Math.max(0.5, pCtx.clampPct(60 / pCtx.time)) : (0.6 + (lSlideTransitionInfo.prevSlideLastScaleVal - 0.6) * pCtx.clampPct((pCtx.time - lSlideTransitionInfo.transitionTime) / 30.0));
        lLastScaleVal = _lScale;
        pCtx.c2d.save();
        pCtx.c2d.translate(_lBox.w - _lBox.w * _lScale, (_lBox.h - _lBox.h * _lScale) * 0.25);
        pCtx.c2d.scale(_lScale, _lScale);
        pCtx.c2d.globalAlpha = pCtx.clampPct((30 / pCtx.time) + 0.30);
        drawStreamingSchema(pCtx, _lBox, lStreamingImages, lLogo, true);
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
      pCtx.c2d.drawImage(lLogo, lX + _lW - lLogo.width, lY);
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
}

/**
 * PrezTextInBox
 */
function PrezTextInBox(pHtmlText, pAttributes/*fontsize, fontattr, fonttype, linespacing, para_prolog, alinea */)
{
  var lThis = this;
  var lHasStyles = false;
  var lExtractWords =
    function()
    {
      var _lWords = pHtmlText.match(/(\<b\>)|(\<\/b\>)|(\<i\>)|(\<\/i\>)|(\s*[^\s\<]+\s*)/g);
      if (undefined == _lWords)
        return [];
      _lWords = _lWords.map(function(_pW) { return {text:_pW.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").trim() + " ", x:0, y:0}; });
      var _lStyle = null;
      for (var _iW = 0; _iW < _lWords.length; _iW++)
      {
        var _lW = _lWords[_iW];
        if (_lW.text == "<b> ") { _lStyle = "bold"; lHasStyles = true; }
        else if (_lW.text == "</b> ") _lStyle = null;
        else if (_lW.text == "<i> ") { _lStyle = "italic"; lHasStyles = true; }
        else if (_lW.text == "</i> ") _lStyle = null;
        else if (undefined != _lStyle) _lW.style = _lStyle;
      }
      return _lWords.filter(function(_pW) { return _pW.text != "<b> " && _pW.text != "</b> " && _pW.text != "<i> " && _pW.text != "</i> "; });
    }
  var lWords = lExtractWords();
  var lSimpleLine = false;
  var lSimpleText = lHasStyles ? null : lWords.map(function(_pW) { return _pW.text; }).join("");
  var lGetAttr = function(_pWhat, _pDefault) { return (undefined != pAttributes && _pWhat in pAttributes) ? pAttributes[_pWhat] : _pDefault; }
  var lFontPt = lGetAttr('font_size', 12);
  var lFont = lGetAttr('font_attr', "") + " " + lFontPt + "pt " + lGetAttr('font_type', "Helvetica");
  var lLineSpacing = lGetAttr('line_spacing', 6);
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
        var _lWw = pCtx.c2d.measureText(_lW.text).width;
        if (_lXw + _lWw > pBox.x + pBox.w)
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
          pCtx.c2d.fillText(_lW.text, _lW.x, _lW.y + lLineHeight - lLineSpacing);
        }
      }
      pCtx.c2d.globalAlpha = 1.0;
    }
  this.getHeight = function() { return lLineHeight + (lSimpleLine ? 0 : (lWords[lWords.length - 1].y - lWords[0].y)); }
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
  var lHasBullet = lGetOption('bullet', 'default') != 'none';
  var lHighlights = lGetOption('highlights', null);
  if (undefined != lHighlights && (0 == lHighlights.length || lHighlights.some(function(_pH) { return _pH == 'vs_all'; })))
    lHighlights = null;
  var lLevel = lGetOption('level', 0);
  var lFontPt = lGetOption('fontsizes', [18, 12])[lLevel];
  var lFont = (lHasBullet ? "" : "italic ") + lFontPt + "pt Helvetica";
  var lLineSpacing = 6;
  var lX = 10 + lLevel * 20, lY = 10, lLineHeight = lFontPt + (2 * lLineSpacing);
  var lMode = lGetOption('mode', null);
  var lTxtBox = new PrezTextInBox(pHtmlText, {font_size:lFontPt, font_attr:(lHasBullet ? "" : "italic"), font_type:"Helvetica", line_spacing:6, para_prolog:(lHasBullet ? lBulletTxt : "")});
  var lLayoutWords = function(pCtx) { lTxtBox.layoutWords(pCtx, {x:lX, y:lY, w:lParent.getEffectiveWidthConstraint(pCtx), h:0}); }
  this.render =
    function(pCtx)
    {
      if (lMuted)
        return;
      var _lHighlightFactor = (undefined == lHighlights || lHighlights.some(function(_pH) { return _pH == 'vs_' + pCtx.slideModes[pCtx.slideMode]; })) ? 1.0 : 0.25;
      var _lFadePct = _lHighlightFactor * pCtx.clampPct(4.0 * (pCtx.time - lT0) / 100.0);
      var _lFillStyle = (lMode == "all" ? "#111111" : (lMode == "affinity" ? "#114411" : "#441111"));
      pCtx.c2d.fillStyle = _lFillStyle;
      pCtx.c2d.globalAlpha = _lFadePct;
      lTxtBox.render(pCtx, {x:lX, y:lY});
      pCtx.c2d.globalAlpha = 1.0;
    }
  this.setParent = function(pCtx, pParent) { lT0 = pCtx.time; lParent = pParent; }
  this.getParent = function() { return lParent; }
  this.setPos = function(pPos) { if ('x' in pPos) lX = pPos.x + lLevel * 20; if ('y' in pPos) lY = pPos.y; }
  this.getPos = function() { return {x:lX, y:lY}; }
  this.evalHeight = function(pCtx) { lLayoutWords(pCtx); return lTxtBox.getHeight(); }
  this.mute = function(pMuted) { lMuted = pMuted; }
  this.getMode = function() { return lMode; }
}

/**
 * PrezElm_BigUrl
 */
function PrezElm_BigUrl(pText, pUrl)
{
  var lParent = null;
  var lX = 10, lY = 10;
  var lHover = false;
  this.render =
    function(pCtx)
    {
      pCtx.c2d.save();
      pCtx.c2d.font = "26pt Helvetica";
      var _lW = pCtx.c2d.measureText(pText).width;
      var _lX = 0.5 * (pCtx.c2d.canvas.width - _lW);
      pCtx.c2d.globalAlpha = lHover ? 1.0 : 0.8;
      pCtx.c2d.fillStyle = "#ffffff";
      pCtx.c2d.strokeStyle = "#000000";
      pCtx.c2d.fillRect(_lX - 10, lY - 8, _lW + 20, 48);
      pCtx.c2d.strokeRect(_lX - 10, lY - 8, _lW + 20, 48);
      pCtx.c2d.fillStyle = "#2087c6";
      pCtx.c2d.fillText(pText, 0.5 * (pCtx.c2d.canvas.width - pCtx.c2d.measureText(pText).width), lY + 30);
      pCtx.c2d.restore();
    }
  this.setParent = function(pCtx, pParent) { lParent = pParent; }
  this.getParent = function() { return lParent; }
  this.setPos = function(pPos) { if ('x' in pPos) lX = pPos.x; if ('y' in pPos) lY = pPos.y; }
  this.getPos = function() { return {x:lX, y:lY}; }
  this.evalHeight = function(pCtx) { return 30; }
  var lHitTest =
    function(pCtx, pPos)
    {
      pCtx.c2d.save();
      pCtx.c2d.font = "26pt Helvetica";
      var _lW = pCtx.c2d.measureText(pText).width;
      var _lX = 0.5 * (pCtx.c2d.canvas.width - _lW);
      pCtx.c2d.restore();
      return (pPos.y < lY || pPos.y > lY + 30 || pPos.x < _lX || pPos.x > _lX + _lW) ? 0 : 1;
    }
  this.onMouseMove = function(pCtx, pPos) { lHover = lHitTest(pCtx, pPos); }
  this.onMouseDown = function(pCtx, pPos) { if (lHitTest(pCtx, pPos)) { window.location.href = 'http://' + location.hostname + ":" + location.port + "/" + pUrl; } }
}

/**
 * PrezElm_MathGraph
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
      var _lWg = _lW * 0.85 - (50 + 10);
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
      pCtx.c2d.fillStyle = "#eeeeee";
      pCtx.c2d.globalAlpha = 0.85;
      pCtx.c2d.fillRect(_lX, _lY, _lW, _lH);
      pCtx.c2d.fillStyle = "#111111";
      pCtx.c2d.globalAlpha = 1.0;
      for (var _iT = 0; _iT < lModel.tooltips.length; _iT++)
      {
        var _lTxtBox = new PrezTextInBox(lModel.tooltips[_iT], {font_size:10, font_attr:"", font_type:"Helvetica", line_spacing:2, para_prolog:"", alinea:20});
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
      pCtx.c2d.font = "6pt Helvetica"
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
  var lSlideDriver = new PrezSlideDriver(lDeck, lScene, lCtx);
  lSlideDriver.initSlide();

  // Basic interactions.
  lCanvas.mousedown(function(e) { var _lOffset = lCanvas.offset(); lScene.onMouseDown(lCtx, {x:e.pageX - _lOffset.left, y:e.pageY - _lOffset.top}); });
  lCanvas.mousemove(function(e) { var _lOffset = lCanvas.offset(); lScene.onMouseMove(lCtx, {x:e.pageX - _lOffset.left, y:e.pageY - _lOffset.top}); });
  lCanvas.mouseup(function(e) { var _lOffset = lCanvas.offset(); lScene.onMouseUp(lCtx, {x:e.pageX - _lOffset.left, y:e.pageY - _lOffset.top}); });
  var lOnKeyDown =
    function(e)
    {
      switch (e.which)
      {
        case 32: lSlideDriver.moveForward(); break;
        case 37: lSlideDriver.prevSlide(); break;
        case 39: lSlideDriver.nextSlide(); break;
        case 188: lSlideDriver.prevMode(); break;
        case 190: lSlideDriver.nextMode(); break;
        case 80: lSlideDriver.pauseResume(); break;
        default: break;
      }
    }
  var lOnKeyUp = function(e) {}
  var lManageWindowEvents =
    function(_pOn)
    {
      var _lFunc = _pOn ? window.addEventListener : window.removeEventListener;
      _lFunc('resize', function() { lCtx.updateCanvasSize(); lScene.layout(lCtx); }, true);
      _lFunc('keydown', lOnKeyDown, true);
      _lFunc('keyup', lOnKeyUp, true);
    }
  var lTabPromo = (top === self) ? lCanvas : window.parent.$("#tab-promo");
  lTabPromo.bind("activate_tab", function() { lThis.active = true; lSlideDriver.start(); lManageWindowEvents(true); });
  lTabPromo.bind("deactivate_tab", function() { lManageWindowEvents(false); lSlideDriver.stop(); lThis.active = false; });

  lCtx.updateCanvasSize();
}

// TODO: flow timing weirdness sometimes
// TODO: work on next slides first
// TODO: support and use <pre>...
// ---
// idea: hovering over graphs could provide all the context (exact queries, data sets, schema etc.)
// TODO: optional log scale in mathgraph
// ---
// TODO: measure again size characteristics for that simple table (also: double-check sqlite with mysql; average couch and mongo, if still similar)
// TODO: if decide to use simple model, explain that graph corresponds to CREATE TABLE ...
