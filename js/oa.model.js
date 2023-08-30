OA.Model = function(userSetting, isPattern2D) {

  THREE.Object3D.call(this);

  /*
  custom events list:
      movePoint:
          positionChange

      editPlane:
          visibleChange
      model:
          faceAdded
          facesClipped
          contourStateChange
          updated
          editModeChange
          angleChange - angle
          zchange - t
          faceCreateModeChange - mode
  */

  //private
  var _def = {
    cardW: 100,
    cardH: 100,
    gridNum: 20,
    initAngle: 90,
    gridZstep: 5,
    domContainer: document
  };
  var contourRepo  = new OA.ContourRepo();
  var editPlane = null;
  var _setting = $.extend({}, _def, userSetting);
  var cardW = _setting.cardW,
    cardH = _setting.cardH;
  var maxWidth = cardW > cardH ? cardW : cardH;
  var mf = OA.Utils.mf;
  var gridStep = mf(maxWidth / _setting.gridNum);

  var initEditT = _setting.gridZstep;//mf(_setting.gridNum / 4) * gridStep;
  if (initEditT > cardH) {
    initEditT = cardH - _setting.gridZstep;
    if (initEditT < 0) {
      initEditT = 0;
    }
  }
  initEditT = mf(initEditT);
  var movePoint;
  var model = this;
  var userFaces = [];
  var modelSavedFace = null;
  var clippedFaces = [];
  var cloned180ClippedFaces = [];
  var baseVFace, baseHFace;
  var edges = [];
  var raycaster = null;
  var cardAngle;
  var undoRedoAry = [];
  var refreshFaceGroup = new THREE.Object3D();
  var cameraCtrl = {
    noZoom: false,
    noRotate: false
  };

  var intersectionLines = new THREE.Object3D();
  var $model = $(this);
  var foldable = true;
  var liveContour = null;
  var $domConainer = $(_setting.domContainer);

  var faceCreateModeType = {"faces":0, "hole":1, "pull": 2};
  var faceCreateMode = faceCreateModeType.faces;

  var cardMode = 0;
  var cardModeType = {"edit":0, "display":1};

  var contourStateType = {
    "NO_EDITING": 0,
    "EDITING": 1,
    "CLOSE": 2
  };
  var foldType = {
    "valley": 0,
    "mountain": 1
  };
  var createFace = OA.Utils.createFace;

  this.contourState = contourStateType.NO_EDITING;

  this.foldLines = {
    mountain: [],
    valley: []
  };

  var foldLineGroup = new THREE.Object3D();

  var modeType = {
    "pattern3D": 0,
    "pattern2D": 1
  };


  var model2D = null;
  var mode = modeType.pattern3D
  if (isPattern2D === true) {
      mode = modeType.pattern2D
  } else {
    var setting2D = $.extend({}, _setting, {
      initAngle: 180,
      gridNum: 1
    });
    model2D = new OA.Model(setting2D, true);
    model2D.unbindEvents();
    mode = modeType.pattern3D;
  }


  var bindEvents = function() {
    $domConainer.bind("mousewheel", onMousewheel);
    $domConainer.bind("mousemove", onDocumentMouseMove);
    $domConainer.bind("mousedown", onMousedown);
    $domConainer.bind("mouseup", onMouseup);
    $model.bind("editModeChange", function(e, flag){
        drawIntersectionLine(editPlane.getT());
    });
    $model.bind("faceCreateModeChange", function(e, mode) {
        drawIntersectionLine(editPlane.getT());
    });
    $model.bind("facesClipped", function(e, mode) {
        drawIntersectionLine(editPlane.getT());
    });

  };


  var unbindEvents = function() {
    $domConainer.unbind("mousewheel", onMousewheel);
    $domConainer.unbind("mousemove", onDocumentMouseMove);
    $domConainer.unbind("mousedown", onMousedown);
    $domConainer.bind("mouseup", onMouseup);
    $model.unbind();
  };

  function getHoverPosition(intersector) {
    if (intersector.face === null) {
      //OA.log(intersector)
    }
    var intersectorObj = intersector.object;
    var cx = Math.floor((intersector.point.x / gridStep) + 0.5) * gridStep,
      cy = Math.floor((intersector.point.y / gridStep) + 0.5) * gridStep,
      cz = 0;
    if (intersectorObj.parent instanceof OA.Face) {
      cz = intersectorObj.parent.getT && intersectorObj.parent.getT();
    } else {
      console.error("do not get correct intersector position!");
    }
    return new THREE.Vector3(cx, cy, cz);
  }

  function formatFloat(num, pos) {
    var size = Math.pow(10, pos);
    return Math.round(num * size) / size;
  }

  function onDocumentMouseMove(event) {

  }

  function enterContourEditingState() {

    model.contourState = contourStateType.EDITING;
    if (liveContour == null) {
      liveContour = new OA.Contour({
        gridStep: gridStep,
        faceCreateMode: faceCreateMode,
        t: editPlane.getT(),
        cardH: cardH,
        cardW: cardW
      });
      model.add(liveContour);
    }
    //cameraCtrl.enabled = false;
    movePoint.setColorByIndex(1);
    $model.trigger("contourStateChange", model.contourState);
  }

  function enterContourNoEditingState() {
    model.contourState = contourStateType.NO_EDITING;
    model.remove(liveContour);
    liveContour = null;
    //cameraCtrl.enabled = true;
    movePoint.setColorByIndex(0);
    $model.trigger("contourStateChange", model.contourState);
  }

  function enterContourCloseState() {
    if (liveContour != null && liveContour.checkClosed()) {
      if (liveContour instanceof OA.Contour) {
        contourRepo.push(liveContour.getPosition3Ds());
      } else if (liveContour instanceof OA.ExContour) {
        contourRepo.push(liveContour.getPoint2Ds());
      }
    }

    model.contourState = contourStateType.CLOSE;
    movePoint.setColorByIndex(2);
    $model.trigger("contourStateChange", model.contourState);
  }


  function addFaceByContour(contour) {
    if (!contour) {
      return;
    }
    //push subdivision contour to repo
    if(contour.subdivisionLevel > 1){
      if (contour instanceof OA.Contour) {
        contourRepo.push(contour.getPosition3Ds());
      } else if (contour instanceof OA.ExContour) {
        contourRepo.push(contour.getPoint2Ds());
      }
    }
    var point2Ds = contour.getPoint2Ds();
    var newFace = createFace(point2Ds, "VFACE", contour.t, {
      faceCreateMode: faceCreateMode
    });
    if (newFace) {
      userFaces.push(newFace);
      $model.trigger("faceAdded", newFace);
      clipFaces(userFaces);
    }
  }

  function clipFaces(orgFaces) {
    //orgFaces = $.merge($.merge([], orgFaces), loadedFaces);
    var clipper = new OA.Clipper({
      baseFaces: [baseVFace, baseHFace],
      faces: orgFaces,
      angle: cardAngle,
      cardW: cardW,
      cardH: cardH
    });

    if (clipper.doClip(cardAngle)) {
      clippedFaces = clipper;
      if (mode === modeType.pattern3D) {
        //for 2D plattern display
        cloned180ClippedFaces = model.doCloneClippedFaces(180);
      }
      updateModel(clippedFaces);

      $model.trigger("facesClipped", {faces: clippedFaces});
    }
  }

  function onMousedown(event) {

    event.preventDefault();
    if (movePoint.inEditplane) {
      cameraCtrl.noZoom = true;
      cameraCtrl.noRotate = true;

      if (event.which === 1) {
        if (liveContour === null) {
          enterContourEditingState();
        }

        if (!liveContour.checkClosed()) {
          var p = movePoint.getPosition3D();
          liveContour.addPosition3D(p);
          if (liveContour.checkClosed()) {
            enterContourCloseState();
          }
        } else {
          if (liveContour) {
            addFaceByContour(liveContour);
            contourRepo.setIndex(liveContour.getPosition3Ds());
          }
          enterContourNoEditingState();
        }

      } else if (event.which === 3) {

        if (model.contourState === contourStateType.EDITING) {
          if (liveContour.getPointSize() > 1) {
            liveContour.undo();
          } else if (liveContour.getPointSize() === 1) {
            liveContour.undo();
            enterContourNoEditingState();
            event.stopImmediatePropagation();
          }
        } else if (model.contourState === contourStateType.CLOSE) {
          $domConainer.bind("mousemove", onDragContour);
        }

      }

    }
  }

  function onDragContour(event) {
    liveContour.moveTo(movePoint.getPosition3D(), editPlane.getT());
  }

  function onMouseup(event) {
    $domConainer.unbind("mousemove", onDragContour);
    event.preventDefault();
    cameraCtrl.noZoom = false;
    cameraCtrl.noRotate = false;
  }

  function moveEditPlane(newDist) {

     //=========Move editPlane for hole editing
    if (faceCreateMode === faceCreateModeType.hole) {
      var minFt = 99999;
      var maxFt = -1;
      var faceoverlayEditPlaneT = 0;
      var editT = editPlane.getT();

      $.each(clippedFaces, function(i, f) {
        if (f.oaInfo.type === "HFACE") {
          return true;
        }
        var ft = f.getT();
        if (ft === 0) {
          return true;
        }
        if (ft > editT && ft < minFt) {
          minFt = ft;
        }
        if (ft < editT && ft > maxFt) {
          maxFt = ft;
        }
      });

      if (newDist - editT > 0) {
        newDist = minFt;
      } else {
        newDist = maxFt;
      }

    }
    //========

 //    console.error("=======");
 //   $.each(clippedFaces, function(i, f) {
 //        if (f.oaInfo.type === "VFACE") {
 //          console.error("VT: "+ f.getT());
 //        }
 //      });
 // console.error("=======");

    $model.trigger("zchange", newDist);

    if (newDist >= 0 && newDist < cardH) {
      editPlane.position.z = newDist + 0.1;
      editPlane.setT(newDist);
      movePoint.setT(newDist);
    }

    if (model.contourState === contourStateType.CLOSE) {
      liveContour.moveTo(null, editPlane.getT());
    }
    drawIntersectionLine(newDist);
  }

  function drawIntersectionLine(newDist) {

    if (!editPlane.isVisible) {
      OA.Utils.cleanObject3D(intersectionLines);
      return;
    }
    var geometry = new THREE.Geometry();
    var et = newDist;
    OA.Utils.cleanObject3D(intersectionLines);
    var gridColor = editPlane.getObjectByName("addingLines").material.color.getHex();

    $.each(clippedFaces, function(i, f) {
      if (f.oaInfo.type === "HFACE") {
        var exPolygons = f.getExPolygons();
        var t = f.getT();
        $.each(exPolygons, function(j, expolygon) {
          var path = expolygon.outer;
          var bounds = ClipperLib.JS.BoundsOfPath(path, 1);
          var minZ = t + bounds.top;
          var maxZ = t + bounds.bottom;
          if (et >= minZ && et <= maxZ) {
            var p1 = new THREE.Vector3(bounds.left, t, et);
            var p2 = new THREE.Vector3(bounds.right, t, et);
            geometry.vertices.push(p1, p2);
          }
        });
      }
    });
    var borderMat = new THREE.LineBasicMaterial({
      linewidth: 3,
      color: gridColor
    });

    var line = new THREE.Line(geometry, borderMat, THREE.LinePieces);
    line.position.y = 0.3;
    line.position.z = -0.5;
    intersectionLines.add(line);
  }

  function onMousewheel(event, delta, deltaX, deltaY) {
    if (event.ctrlKey) {
      event.preventDefault();
    }

    if (editPlane.isVisible && model.contourState !== contourStateType.EDITING) {
      var d = ((deltaY < 0) ? 1 : -1);
      //OA.log(delta, deltaX, deltaY);
      var newDist = editPlane.getT() + _setting.gridZstep* d// mf(editPlane.getT() + gridStep * d);
      //console.error("ePlanelZ: " + newDist);
      moveEditPlane(newDist);
    }
    if (foldable) {
      var d = ((deltaY < 0) ? -1 : 1);
      //OA.log(delta, deltaX, deltaY);
      var newAngle = cardAngle + d * 5;
      if (newAngle >= 0 && newAngle <= 180) {
        oaModel.setCardAngle(newAngle);
      }
    }

  }

  this.resetCardAngle = function() {
    model.setCardAngle(_setting.initAngle);
  };

  var init = function() {

    if (mode === modeType.pattern2D) {
      model.add(refreshFaceGroup);
      model.add(foldLineGroup);
      // movePoint = new OA.Point({
      //   scale: gridStep
      // });
      // movePoint.position.x = cardW / 2;
      // movePoint.position.y = gridStep * 2;
      // movePoint.position.z = initEditT;
      // model.add(movePoint);
      return model;
    }
    var editBufferY = gridStep * 4;
    var pEditAry = [
      [0, editBufferY],
      [cardW, editBufferY],
      [cardW, -cardH],
      [0, -cardH]
    ];
    editPlane = createFace(OA.Utils.ary2Point2Ds(pEditAry), "VFACE", 0, {
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      borderColor: 0x5399E3,
      addingLine: [
        [0, 0],
        [cardW, 0]
      ],
      gridData: {
        w: cardW,
        h: cardH,
        s: gridStep,
        color: 0x1F6CBD,
        opacity: 0.3,
        extendY: editBufferY
      },
      name: "editPlane"
    });
    editPlane.position.z = initEditT;
    editPlane.setT(initEditT);
    var planeMesh = editPlane.getFaceMesh();
    planeMesh.receiveShadow = false;
    planeMesh.castShadow = false;
    editPlane.setGridColorByIndex(0);
    model.add(editPlane);

    movePoint = new OA.Point({
      scale: gridStep
    });
    movePoint.position.x = cardW / 2;
    movePoint.position.y = gridStep * 2;
    movePoint.position.z = initEditT;
    model.add(movePoint);

    model.add(intersectionLines);
    //custom events binding
    $(movePoint).bind("positionChange", function(e, pos3D) {
      if (movePoint.isVisible) {
        switchHighlight(true, pos3D);
      }
    });

    $(editPlane).bind("visibleChange", function(e, isVisible){
        if (isVisible === false) {
            switchHighlight(false);
        }else{
            switchHighlight(true, movePoint.getPosition3D());
        }
    });

    $model.bind("facesClipped", function(e, clippedFaces) {
        switchHighlight(true, movePoint.getPosition3D());
    });


    $model.bind("facesAdded", function(e, newFace) {
        undoRedoAry = [];
    });

    var pAryV = [
      [0, 0],
      [cardW, 0],
      [cardW, -cardH],
      [0, -cardH]
    ];
    //base vface
    baseVFace = createFace(OA.Utils.ary2Point2Ds(pAryV), "VFACE", 0, {
      name: "baseVFace"
    });
    refreshFaceGroup.add(baseVFace);
    clippedFaces.push(baseVFace);

    var pAryH = [
      [0, 0],
      [cardW, 0],
      [cardW, cardH],
      [0, cardH]
    ];
    //base hface
    baseHFace = createFace(OA.Utils.ary2Point2Ds(pAryH), "HFACE", 0, {
      name: "baseHFace"
    });

    refreshFaceGroup.add(baseHFace);
    clippedFaces.push(baseHFace);
    model.add(refreshFaceGroup);

    bindEvents();
    model.setCardAngle(cardAngle);

    //========
    // OA.Utils.cleanObject3D(model);
    // var tFace = new OA.Face({
    //   contours: OA.Utils.getTestExPolygonTree(),
    //   //   contours
    //   type: "HFACE"
    // });

    //  faces.push(tFace);
    //  model.add(tFace);

    cloned180ClippedFaces = model.doCloneClippedFaces(180);

    return model;
  };


  function switchHighlight(isEnable, pos3D) {
    var vt = pos3D && pos3D.z;
    var ht = pos3D && pos3D.y;
    // console.error("z " + t);
    $.each(clippedFaces, function(i, f) {
      if (isEnable) {
        var ft = f.getT();
        if (f.oaInfo.type === "VFACE") {
          if (vt === ft) {
            f.highlight(true);
          } else {
            f.highlight(false);
          }
        } else {
          if (ht === ft) {
            f.highlight(true);
          } else {
            f.highlight(false);
          }
        }
      } else {
        f.highlight(false);
      }
    });
  }


  function getFoldLine(l1, l2, type1, type2) {
    var m = OA.Utils.maxMinFns;
    var minP = m.minP;
    var maxP = m.maxP;
    var isIn = m.isIn;
    var maxLP = m.maxLP;
    var minLP = m.minLP;
    var maxMinLP = m.maxMinLP;
    var minMaxLP = m.minMaxLP;
    var p3D_L1P1 = OA.Utils.D2To3(l1.pnts[0], l1.t, type1);
    var p3D_L2P1 = OA.Utils.D2To3(l2.pnts[0], l2.t, type2);
    var foldLine = null;
    if (l1.pnts[0].Y === l2.pnts[0].Y && p3D_L1P1.y === p3D_L2P1.y) {
      if (isIn(minP(l1.pnts), l2.pnts) || isIn(maxP(l1.pnts), l2.pnts) || isIn(maxP(l2.pnts), l1.pnts)) {
        foldLine = [minMaxLP(l1.pnts, l2.pnts), maxMinLP(l1.pnts, l2.pnts)];
      }
    }
    return foldLine;
  }

  var buildFoldLine = function (clippedFaces){

    var vupper = [ /*{  t: 0, pnts: [X:0, Y:0] }*/  ];
    var vlower = [ ];
    var hupper = [ ];
    var hlower = [ ];
    var mountainLine = [];
    var valleyLine=[];
    //collect Fold line
    $.each(clippedFaces, function(i, f) {
      //var contours = f.getExPolygons();
      //f.updateUpperLower2Ds(contours, true);
      var t = f.getT();
      var uppers = f.oaInfo.upper2Ds;
      var lowers = f.oaInfo.lower2Ds;
      var type = f.oaInfo.type;

      $.each(uppers, function(j, pnts) {
        var obj = {
          t: t,
          pnts: pnts
        };
        if (type === "HFACE") {
          hupper.push(obj);
        } else if (type === "VFACE") {
          vupper.push(obj);
        }
      });
      $.each(lowers, function(k, pnts) {
        var obj = {
          t: t,
          pnts: pnts
        };
        if (type === "HFACE") {
          hlower.push(obj);
        } else if (type === "VFACE") {
          vlower.push(obj);
        }
      });
    });

    //find mountain line
    $.each(vupper, function(i, vuLine){
        $.each(hlower, function(j, hlLine){
            var foldLine = getFoldLine(vuLine, hlLine, "VFACE", "HFACE");
            if(foldLine){
              mountainLine.push(foldLine);
            }
        });
    });
    //find valley line
    $.each(hupper, function(i, huLine){
        $.each(vlower, function(j, vlLine){
            var foldLine = getFoldLine(huLine, vlLine, "HFACE", "VFACE");
            if(foldLine){
              valleyLine.push(foldLine);
            }
        });
    });

    return {
      mountain: mountainLine,
      valley: valleyLine
    };

  };

  this.doCloneClippedFaces = function(angle) {
    var ary = [];
    if (angle === undefined) {
      angle = 90;
    }
    var _setting2D = {
      oaMode: modeType.pattern2D
    };
    $.each(clippedFaces, function(i, f) {
      var s = $.extend({}, f.oaInfo, _setting2D);
      var f = new OA.Face(s);
      f.setAngle(angle);
      ary.push(f);
    });

    model.foldLines = buildFoldLine(clippedFaces);

    return ary;
  };

  this.getCloneClippedFaces = function() {
     return cloned180ClippedFaces;
  };

  this.unbindEvents = function() {
    unbindEvents();
  };
  this.setClippedFaces = function(c) {
    clippedFaces = c;
  };

  this.updateModel = function(fs) {
    updateModel(fs);

  };

  this.build2DPattern = function() {
    //model2D.cardAngle = 180
    var clippedFaces = model.getCloneClippedFaces();
    model2D.setClippedFaces(clippedFaces);
    model2D.updateModel(clippedFaces);
    model2D.drawFoldLines(model.foldLines);

    return model2D;
  }

  this.drawFoldLines = function(foldLines) {
    OA.Utils.cleanObject3D(foldLineGroup);
    // if(foldLineGroup){
    //     model.remove(foldLineGroup);
    //     foldLineGroup = new THREE.Object3D();
    //     model.add(foldLineGroup);
    // }
    $.each(foldLines.mountain, function(i, ln) {
      drawFoldLine(ln, foldType.mountain);
    });

    $.each(foldLines.valley, function(i, ln) {
      drawFoldLine(ln, foldType.valley);
    });

    function drawFoldLine(ln, ftype) {
      var foldOpt = {
          color:0xffffff,
          linewidth: 1,
          dashSize: 1,
          gapSize: 0.5
      };
      if(ftype === foldType.mountain){
          foldOpt.dashSize = 1;
          foldOpt.gapSize = 0.5;
          //foldOpt.color = 0xDF3B39;
      }else{
          foldOpt.dashSize = 1;
          foldOpt.gapSize = 2;
          //foldOpt.color = 0x8ADF39;
      }

      var p1 = ln[0],
        p2 = ln[1];
      var d3p1 = new THREE.Vector3(p1.X+0.5, 0.2 , p1.Y);
      var d3p2 = new THREE.Vector3(p2.X-0.5, 0.2 , p2.Y);
      var geometry = new THREE.Geometry();
      geometry.vertices.push(d3p1, d3p2);

      geometry.computeLineDistances();
      var mat = new THREE.LineDashedMaterial({
        linewidth: foldOpt.linewidth,
        color: foldOpt.color,
        dashSize: foldOpt.dashSize,
        gapSize: foldOpt.gapSize,
        transparent: true,
        depthTest: false,
        depthWrite: false
      });

      var foldLine = new THREE.Line(geometry, mat);
      foldLineGroup.add(foldLine);
    }
  }

  function changeCardMode(cardMode) {
    if (cardMode === 0) {
      //edit
      model.showEditPlane(true);
      oaModel.setFoldable(false);
      oaModel.resetCardAngle();
    } else if (cardMode === 1) {
      //dispaly
      model.showEditPlane(false);
      model.setFoldable(true);
    }

  }


  this.switchCardMode = function() {
    if (model.contourState === contourStateType.NO_EDITING) {
      cardMode = (cardMode + 1) % 2;
      changeCardMode(cardMode);
    }
  };

  function getRealIntersector(intersects) {
    for (i = 0; i < intersects.length; i++) {
      intersector = intersects[i];
      return intersector;
    }
    return null;
  }

  this.showEditPlane = function(showFlag) {
    OA.Utils.setObject3DVisible(editPlane, !!showFlag);
    $(editPlane).trigger("visibleChange", showFlag);
    $model.trigger("editModeChange", showFlag);
    if (!showFlag) {
      movePoint.setVisible(false);
    } else {
      movePoint.setVisible(true);
    }
  };

  this.getEditMode = function(){
      return editPlane.isVisible;
  };

  function updateModel(faces) {
    //will get clipped face
    OA.Utils.cleanObject3D(refreshFaceGroup);
    for (var i = 0; i < faces.length; i++) {
      var f = faces[i];
      refreshFaceGroup.add(f);
    }
    $model.trigger("updated");
  }

  var updateCardAngle = function() {
    var faces = clippedFaces;
      //model.remove(refreshFaceGroup)
      //refreshFaceGroup = new THREE.Object3D();
      //OA.Utils.cleanObject3D(refreshFaceGroup);
      for (var i = 0; i < faces.length; i++) {
        var f = faces[i];
        f.setAngle(cardAngle);
      }
      $model.trigger("angleChange", cardAngle);
  };

  this.setCardAngle = function(degree) {
    if (cardAngle != degree && degree >= 0 && degree <= 180) {
      cardAngle = degree;
      updateCardAngle();
    }
  };

  this.getCardAngle = function() {
    return cardAngle;
  };

  this.setFoldable = function(canFold, angle) {
    foldable = canFold;
    if (angle != undefined && angle !== cardAngle) {
      model.setCardAngle(angle);
    }
  };

  this.setCameraCtrl = function(ctrl) {
    cameraCtrl = ctrl;
  };

  this.undo = function() {
    if (userFaces.length > 0) {
      undoRedoAry.push(userFaces.pop());
      clipFaces(userFaces);
    }
  };
  this.redo = function() {
    if (undoRedoAry.length > 0) {
      userFaces.push(undoRedoAry.pop());
      clipFaces(userFaces);
    }
  };
  this.tick = function(params) {
    raycaster = params.raycaster;

    if (editPlane.isVisible === true) {
      var intersects = raycaster.intersectObjects([editPlane.getObjectByName("faceBody")]);

      if (intersects.length > 0) {
        intersector = getRealIntersector(intersects);
        if (intersector) {
          var hoverPos = getHoverPosition(intersector);
          if (!movePoint.isEqualPosition(hoverPos)) {
            hoverPos.z = editPlane.getT();
            movePoint.setPosition3D(hoverPos);
            movePoint.inEditplane = true;
          }
          if (liveContour != null) {
            if (model.contourState === contourStateType.EDITING) {
              movePoint.setColorByIndex(1);

              try {
                //auto attract
                var pos3Ds = liveContour.getPosition3Ds();
                var movePointPos = movePoint.getPosition3D();
                var distFromFitstP;
                var plen = pos3Ds.length;

                var firstP = pos3Ds[0];
                var lastP = pos3Ds[plen - 1];
                // if (plen > 2 && (firstP.y === lastP.y || firstP.x === lastP.x)) {
                //   distFromFitstP = pos3Ds[0].distanceTo(movePoint.getPosition3D());
                //   if (distFromFitstP < gridStep * 2) {
                //     movePoint.setPosition3D(pos3Ds[0]);
                //     movePoint.setColorByIndex(2);
                //   }
                // }
                if (plen > 2) {
                  if (params.ctrlKey) {
                    movePoint.setPosition3D(firstP);
                    movePoint.setColorByIndex(2);
                  }
                }

                if (params.shiftKey) {
                  if (Math.abs(movePointPos.y - lastP.y) < 5*gridStep) {
                    movePointPos.y = lastP.y;
                  }else{
                    movePointPos.x = lastP.x;
                  }
                  movePoint.setPosition3D(movePointPos);
                }

                if (plen > 2 && OA.Utils.checkEqualPosition(pos3Ds[0], movePointPos)) {
                  movePoint.setColorByIndex(2);
                }
                liveContour.drawHoverLine(movePoint.getPosition3D());
              } catch (e) {
                console.error("!! distanceTo exception !!");
              }
            } else if (model.contourState === contourStateType.CLOSE) {

            }
          }
        }
      } else {
        movePoint.inEditplane = false;
      }
    } else {
      movePoint.inEditplane = false;
    }
  };


  this.getEditDepth = function(){
    return editPlane.getT();
  };

  this.setEditDepth = function(newDist){
     moveEditPlane(newDist);
  };

  this.clearAllFaces = function(){
    OA.Utils.cleanObject3D(refreshFaceGroup);
    clippedFaces = [];
    undoRedoAry = [];
    // $.each(userFaces, function(i, f){
    //   undoRedoAry.push(f);
    // });
    userFaces = [];
    //contourRepo = new OA.ContourRepo();
    clipFaces(userFaces);
  };

  this.setFaceCreateMode = function(mode) {

    faceCreateMode = faceCreateModeType[mode];
    if (liveContour != null) {
      liveContour.faceCreateMode = faceCreateMode;
    }
    editPlane.setGridColorByIndex(faceCreateMode);

    if (faceCreateMode === faceCreateModeType.hole) {
      //move editPlane to hole
      var editT = editPlane.getT();
      var isNeedPlane = true;
      $.each(clippedFaces, function(i, f) {
        var ft = f.getT();
        if (ft === editT) {
          isNeedPlane = false;
          return false;
        }
      });
      if (isNeedPlane) {
        moveEditPlane(-1);
      }
    }
    $model.trigger("faceCreateModeChange", mode);
  };

  this.getFaceCreateMode = function(){
    return faceCreateMode;
  };

  var getAllFaces = function(){
    var allFaces = [];

    $.each(userFaces, function(i, f){
       var fdata = {
        contours: f.oaInfo.contours,
        contoursType: f.oaInfo.contours.type === undefined ? "" : f.oaInfo.contours.type,
        type: f.oaInfo.type,
        mode: f.oaInfo.faceCreateMode,
        t: f.oaInfo.t,
        timestamp: f.timestamp
       };
       allFaces.push(fdata);
    });
    return allFaces;
  };

  this.getModel = function() {

    var fileObj = {
      settings: {
        cardW: _setting.cardW,
        cardH: _setting.cardH
      },
      faces: getAllFaces()
    };
    return fileObj;
  };

  this.setModel = function(fileObj) {
    if (fileObj && fileObj.faces) {
      var faces = fileObj.faces;
      var facesAry =  [];
      var len = facesAry.length;
      $.each(faces, function(i, fsetting) {
        var contours = fsetting.contours,
          type = fsetting.type,
          faceCreateMode = fsetting.mode,
          t = fsetting.t;
          contours.type = fsetting.contoursType;
          if(contours.type !== "expolygons"){
             contours = contours[0].outer;
          }
          newFace = createFace(contours, type, fsetting.t, {
            faceCreateMode: faceCreateMode,
            timestamp: fsetting.timestamp ? fsetting.timestamp : 0 //TODO: store timestamp into file
          });
        facesAry.push(newFace);
      });

      userFaces = facesAry;
      model.setModelSaved();
      clipFaces(userFaces);
    }
  };

  this.prevContour = function() {
    var ContourClass = OA.Contour;
    var posAry = contourRepo.getBefore();
    if (posAry) {
      if (posAry.type === "expolygons") {
        ContourClass = OA.ExContour;
      }
      model.showEditPlane(true);
      model.setFoldable(false);
      model.resetCardAngle();
      enterContourNoEditingState();
      liveContour = new ContourClass({
        gridStep: gridStep,
        t: editPlane.getT(),
        initData: posAry
      });
      model.add(liveContour);
      enterContourCloseState();
      model.setCardMode(0);
    }
  };

  this.nextContour = function() {
    var ContourClass = OA.Contour;
    var posAry = contourRepo.getAfter();
    if (posAry) {
      if (posAry.type === "expolygons") {
        ContourClass = OA.ExContour;
      }
      enterContourNoEditingState();
      model.showEditPlane(true);
      model.setFoldable(false);
      model.resetCardAngle();
      liveContour = new ContourClass({
        gridStep: gridStep,
        t: editPlane.getT(),
        initData: posAry
      });
      model.add(liveContour);
      enterContourCloseState();
      model.setCardMode(0);
    }
  };

  this.clearContour = function() {
      enterContourNoEditingState();
      model.setCardMode(0);
  };

  this.getFaceCreateMode = function (mode){
      return faceCreateMode
  };

  this.setCardMode = function(mode){
    if (model.contourState === contourStateType.NO_EDITING) {
      cardMode = mode;
      changeCardMode(cardMode);
    }
  };

  this.getCardMode = function(){
    return cardMode;
  };

  //public
  this.destory = function() {
    unbindEvents();
  };


  this.getSubLevel = function(){
    if(liveContour!=null){
      return liveContour.subLevel;
    }else{
      return 1;
    }
  };

 this.getLiveContourID = function(){
    var total = contourRepo.length;
    if(liveContour!=null&&liveContour.checkClosed()){
      var p3ds = liveContour.getPosition3Ds();

      if(p3ds && p3ds.cid!=undefined){
        return "Index:  " +p3ds.cid + " | Total:" + total;
      }
      return "---  | Total:" + total ;
    }else{
      return "---  | Total:" + total;
    }
  };

  this.contourRotateX = function() {
    if (liveContour != null && liveContour.checkClosed()) {
      liveContour.rotateX();
    }
  }

  this.subdivision = function(level, xLimit) {
    if (liveContour){
      liveContour.subdiv(level, xLimit);
      liveContour.subdivisionLevel = level;
    }
  };

  this.getUserFaces = function() {
    return userFaces;
  };


  this.getInitEditT  = function(){
    return initEditT;
  }

  this.setModelSaved = function() {
      var len = userFaces.length;
      if(len !=0){
        modelSavedFace = userFaces[len-1];
      }
  };

 this.checkModelSaved = function() {
    var res = false;
    var fLen = userFaces.length;
    if (fLen === 0) {
      res = true;
    } else if (userFaces[fLen-1] === modelSavedFace) {
      res = true;
    }
    return res;
  };

  this.getCardW = function() {
    return cardW;
  };

  this.setGridNum = function(num){
      _setting.gridNum = num;
      gridStep = mf(maxWidth / _setting.gridNum);
      var editBufferY = gridStep * 4;
      editPlane.drawGrid( {
        w: cardW,
        h: cardH,
        s: gridStep,
        color: 0x1F6CBD,
        opacity: 0.3,
        extendY: editBufferY
      });
      if(liveContour!=null){
        liveContour.setGridStep(gridStep);
      }
  };

  this.getCardH = function() {
    return cardH;
  };

  this.addTextContour = function(text, size, bold, italic) {
      enterContourNoEditingState();
      model.showEditPlane(true);
      model.setFoldable(false);
      model.resetCardAngle();
      var expolys = OA.Utils.createTextPolys(text, size, bold, italic);
      liveContour = new OA.ExContour({
        gridStep: gridStep,
        t: editPlane.getT(),
        initData: expolys,
        cardH: cardH,
        cardW: cardW
      });
      model.add(liveContour);
      enterContourCloseState();
      model.setCardMode(0);
  };


  this.contourAlignXCenter = function() {
      if(liveContour !=null && liveContour.checkClosed()){
        liveContour.alignXCenter();
      }
  };


this.moveContourTest = function(){
  liveContour.moveTest();
}

  return init();
};

OA.Model.prototype = Object.create(THREE.Object3D.prototype);