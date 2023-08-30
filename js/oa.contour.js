OA.Contour = function(userSetting) {
   THREE.Object3D.call(this);
   //private
   var _def = {
      point: {
         color: 0x498698
      },
      line: {
         color: 0x374F69,
         lineWidth: 2.5,
         opacity: 0.8
         //color: 0xE7AB6D
      },
      gridStep: 1,
      t: 0,
      faceCreateMode: 0,
      initData:null,
      cardW: 100,
      cardH: 100
   };
   var contour = this;
   var isClosed = false;
   var userPosition3Ds = [];
   var point2Ds = [];
   var lineGroup = null;
   var closeLine = null;
   var openLines = null;
   var pointGroup = null;
   var beforeSubdiv_point2Ds = null;
   contour.uppers = [];
   var _setting = $.extend({}, _def, userSetting);
   contour.t = _setting.t;
   var initData = _setting.initData;
   var cid = initData && initData.cid;
   var gridStep = _setting.gridStep;
   var hoverLine = null;
   var circleGroup = null;
   var baseT = null;
   var startPoint = null;
   var modifyFloatPoint = OA.Utils.modifyFloatPoint;
   var faceCreateModeType = {"faces":0, "hole":1, "pull": 2};
   this.subLevel = 1;
   contour.faceCreateMode = _setting.faceCreateMode;
   var init = function() {
      contour.t = _setting.t;
      contour.baseT = _setting.t;

      lineGroup = new THREE.Object3D();
      contour.add(lineGroup);
      lineGroup.position.z = 0.1;

      pointGroup = new THREE.Object3D();
      contour.add(pointGroup);
      pointGroup.position.z = 0.2;
      startPoint = new OA.Point({
         scale: _setting.gridStep
      });
      // if (initData != null) {
      //    point2Ds = initData;
      //    var bounds = ClipperLib.JS.BoundsOfPath(point2Ds, 1);
      //    var h = Math.abs(bounds.bottom - bounds.top);
      //    var w = Math.abs(bounds.left - bounds.right);
      //    point2Ds = movePoint2Ds(point2Ds, {X:w/2, Y:contour.t - h/2}, contour.t)
      //    close2DContour(true);
      // }
      if (initData != null) {
         userPosition3Ds = initData;
         closeContour(true);
      }

      return contour;
   };

   this.getPointSize = function() {
      return userPosition3Ds.length;
   };

   this.getPosition3Ds = function() {
      return userPosition3Ds;
   };


   function drawPoints(p3DAry, userOpt) {

      var defaultOpt = {
         color: _setting.point.color,
         radius: 0.6
      };
      var drawOpt = $.extend({}, defaultOpt, userOpt);

      if (pointGroup) {
         OA.Utils.cleanObject3D(pointGroup);
      }
      //pointGroup = new THREE.Object3D();
      var pLen = p3DAry.length;
      var radius = drawOpt.radius;
      var segments = 32;
      var p, r, c;
      var material;
      var circleGeometry;
      var circle;
      var isClosed = contour.checkClosed();
      for (var i = 0; i < pLen; ++i) {
         p = p3DAry[i];
         if (i == 0 && !isClosed) {
            circle = startPoint;
            circle.setColor(drawOpt.color);
         } else {
            if (i === 0 && !isClosed) {
               r = radius * 1.3;
            } else {
               r = radius;
            }
            circleGeometry = new THREE.CircleGeometry(r, segments);
            material = new THREE.MeshBasicMaterial({
               color: drawOpt.color,
               transparent: true,
               depthTest: false,
               depthWrite: false
            });
            circle = new THREE.Mesh(circleGeometry, material);
         }
         circle.position.x = p.x;
         circle.position.y = p.y;
         circle.position.z = p.z;
         pointGroup.add(circle);

      }
      pointGroup.position.z = 0.3;
      contour.add(pointGroup);
   }

   function addCloseLine(p3DAry, parent, lineMaterial) {
      var len = p3DAry.length;
      var p1 = p3DAry[0],
          p2 = p3DAry[len - 1];
      var geometry = new THREE.Geometry();
      geometry.vertices.push(p1, p2);
      geometry.computeLineDistances();

      var openPathMat = new THREE.LineDashedMaterial({
         linewidth: _setting.line.lineWidth,
         color: 0xFF8F19,
         opacity: _setting.line.opacity,
         dashSize: 1,
         gapSize: 0.5,
         transparent: true,
         depthTest: false,
         depthWrite: false
      });
      var closePathMat = lineMaterial.clone();

      var mat = contour.checkClosed() ? closePathMat : openPathMat;
      var closeLine = new THREE.Line(geometry, mat);
      parent.add(closeLine);
   }

   function addUpperLines(parent){
      var geometry = new THREE.Geometry();
      var len = contour.uppers.length;

      for (var i = 0; i < len; ++i) {
         var p1 = contour.uppers[i][0],
             p2 = contour.uppers[i][1];
         geometry.vertices.push(p1, p2);
      }
      var lineMaterial = new THREE.LineBasicMaterial({
         linewidth: 3,
         color: 0x993333,
         transparent: true,
         depthTest: false,
         depthWrite: false
      });
      var upperLines = new THREE.Line(geometry, lineMaterial, THREE.LinePieces);
      parent.add(upperLines);
   }

   function drawLines(p3DAry, userOpt) {
      var defaultOpt = {
         color: _setting.line.color,
         linewidth: _setting.line.lineWidth
      };
      var drawOpt = $.extend({}, defaultOpt, userOpt);

      if (openLines) {
         lineGroup.remove(openLines);
      }
      if(_setting.initData){
         lineGroup.position.z = 0.3;
      }
      if (p3DAry.length < 2) {
         return;
      }
      contour.uppers = [];
      var geometry = new THREE.Geometry();
      var len = p3DAry.length;
      for (var i = 0; i < len; ++i) {
         var p1, p2;

         if (i != len-1) {
            p1 = p3DAry[i];
            p2 = p3DAry[i+1];
         } else {
            p1 = p3DAry[i];
            p2 = p3DAry[0];
         }

         if (!contour.checkClosed()) {
            if (p1.y === p2.y) {
               contour.uppers.push([p1, p2]);
            }
         } else {
            if (p1.y === p2.y && p1.x > p2.x) {
               contour.uppers.push([p1, p2]);
            }
         }
         if (i != len - 1) {
            geometry.vertices.push(p1, p2);
         }
      }
      var lineMaterial = new THREE.LineBasicMaterial({
         linewidth: drawOpt.linewidth,
         color: drawOpt.color,
         transparent: true,
         depthTest: false,
         depthWrite: false
      });

      openLines = new THREE.Line(geometry, lineMaterial, THREE.LinePieces);
      addCloseLine(p3DAry, openLines, lineMaterial);
      if(contour.uppers.length > 0){
         addUpperLines(openLines);
      }
      lineGroup.add(openLines);
   };

   function updateContour(p3DAry, pointOpt, lineOpt) {
      drawLines(p3DAry, lineOpt);
      drawPoints(p3DAry, pointOpt);
   };


   this.alignXCenter = function(){
      var center = {X: cardW/2, Y: null};
      var newPoint2Ds = movePoint2Ds(point2Ds, center);
      point2Ds = newPoint2Ds;
      drawCloseCoutour();
   };

   this.moveTo = function(newPos, t) {
      var newPos2D;
      if (newPos) {
         newPos2D = OA.Utils.D3To2(newPos, t);
      }
      var newPoint2Ds = movePoint2Ds(point2Ds, newPos2D, t);
      point2Ds = newPoint2Ds;
      drawCloseCoutour();
   };

   // this.getPoint2D = function(){
   //    contour.updateMatrixWorld();
   //    var vector;
   //    var ary = [];
   //    var t = contour.t;
   //    for (var i = 0; i < pointGroup.children.length; i++) {
   //       vector = new THREE.Vector3();
   //       vector.setFromMatrixPosition(pointGroup.children[i].matrixWorld);
   //       ary.push([vector.x, t - vector.y]);
   //    }
   //    return ary;
   // };

   function getMiddlePointFromPath(path) {
      var bounds = ClipperLib.JS.BoundsOfPath(path, 1);
      var mpx = (bounds.left + bounds.right) / 2;
      var mpy = (bounds.top + bounds.bottom) / 2;
      return {
         X: mpx,
         Y: mpy
      };
   }

   function movePoint2Ds(ary, newPos, t) {
      var newAry = [];
      var mf = modifyFloatPoint;
      var difft = 0;
      if (t != undefined && t != contour.t) {
         difft = contour.t - t;
         contour.t = t;
      }
      var middlePoint = {
         X: 0,
         Y: 0
      };
      var target = {
         X: 0,
         Y: 0
      };
      if (newPos != undefined) {
         middlePoint = getMiddlePointFromPath(ary);
         middlePoint.X = Math.floor(middlePoint.X / gridStep) * gridStep;
         middlePoint.Y = Math.floor(middlePoint.Y / gridStep) * gridStep;
         target = {};
         target.X = newPos.X ===null ? null : Math.floor(newPos.X / gridStep) * gridStep;
         target.Y = newPos.Y ===null ? null : Math.floor(newPos.Y / gridStep) * gridStep - difft;
      } else if (difft != 0) {
         target.Y = target.Y - difft;
      }
      for (var i = 0; i < ary.length; i++) {
         var p = ary[i];
         p.X = newPos && newPos.X === null ? p.X : p.X - middlePoint.X + target.X;
         p.Y = newPos && newPos.Y === null ? p.Y : p.Y - middlePoint.Y + target.Y;
         newAry.push(p);
      }

      return newAry;
   }

   this.setGridStep = function(value){
      _setting.gridStep = value;
      gridStep = value
   };

   function fineTunePath(path, scale) {
      //debugger;
      if (OA.tunePath) {
         var tunedPath = ClipperLib.Clipper.CleanPolygon(path, 0.1);
         //var tunedPath = ClipperLib.JS.Clean(path, 0.1);
         //var tunedPath = ClipperLib.JS.Lighten(path,100);
         OA.Utils.modifyPathOrientation(tunedPath, true);
         // var tunedPath2 = null;
         // try {
         //    tunedPath2 = ClipperLib.Clipper.SimplifyPolygon(tunedPath, ClipperLib.PolyFillType.pftEvenOdd);
         // } catch (e) {
         //    tunedPath2 = null
         // }
         // if (tunedPath2) {
         //    tunedPath = tunedPath2;
         // }

         // if (scale) {
         //    var mp = getMiddlePointFromPath(tunedPath);
         //    if (scale > 0) {
         //       ClipperLib.JS.ScaleUpPath(tunedPath, scale);
         //    } else if (scale < 0) {
         //       ClipperLib.JS.ScaleDownPath(tunedPath, -1 * scale);
         //    }
         //    movePoint2Ds(tunedPath, mp);
         // }
         return tunedPath;
      } else {
         OA.Utils.modifyPathOrientation(path, true);
         return path;
      }

   }

   this.getPoint2Ds = function() {
      point2Ds.type = "paths";
      point2Ds.cid = cid;
      return point2Ds;
   };

   this.getUpper2Ds = function(){
      var upper2Ds = [];
      var upper3Ds = contour.uppers;
      var D3To2 = OA.Utils.D3To2;
      var t = contour.t;
      for (i = 0; i < upper3Ds.length; i++) {
         upper2Ds.push([D3To2(upper3Ds[i][0], t), D3To2(upper3Ds[i][1], t)]);
      }

      //d2->d3 and d3->d2 maybe an issue here
      return upper2Ds;
   };

   this.getContourData = function(){
      return {point2Ds: contour.getPoint2Ds(), uppers2Ds: contour.getUppers2Ds() };
   };

   function convertPoint2DsTo3Ds(p2Ds) {
      var closePos3Ds = [];
      var t = contour.t;
      for (var i = 0; i < p2Ds.length; i++) {
         var p3D = OA.Utils.D2To3(p2Ds[i], t, "VFACE");
         closePos3Ds.push(p3D);
      }
      return closePos3Ds;
   }

   function collectUpper2Ds(point2Ds){
      var ary = [];
      $.each(point2Ds, function(i, p2d){
         // if (p1.y === p2.y && p1.x > p2.x) {
         //    contour.uppers.push([p1, p2]);
         // }

         debugger;
      })
      return ary;
   }

   function drawCloseCoutour(isInitInput) {

      point2Ds = fineTunePath(point2Ds);//also modify Orientation 
      //upper2Ds = collectUpper2Ds(point2Ds);

      var closePos3Ds = convertPoint2DsTo3Ds(point2Ds);
      //collect uppers?
      var opt = {
         ptnStyle: {
            color: 0x5F8A37,
            radius: 0.6
         },
         lineStyle: {
            color: 0x376938
         }
      };

      if(_setting.initData){
         opt.ptnStyle.color = 0xBE6100;
         opt.lineStyle.color = 0xFA8000;
         opt.lineStyle.linewidth =3.5;
      }
      updateContour(closePos3Ds, opt.ptnStyle, opt.lineStyle);
   }

   function close2DContour(isInitInput) {
      isClosed = true;
      subLevel = 1;
      if (hoverLine) {
         lineGroup.remove(hoverLine);
      }
      if (point2Ds.length < 2) {
         return;
      }
      var t = contour.t;
      drawCloseCoutour(isInitInput);
   }

   function closeContour(isInitInput) {
      isClosed = true;
      subLevel = 1;
      if (hoverLine) {
         lineGroup.remove(hoverLine);
      }

      if (userPosition3Ds.length < 2) {
         return;
      }
      var t = contour.t;

      //generate point2Ds from position3Ds;
      for (var i = 0; i < userPosition3Ds.length; i++) {
         p = OA.Utils.D3To2(userPosition3Ds[i], t);
         point2Ds.push(p);
      }

      // resize contour
      // var mp =getMiddlePointFromPath(point2Ds);
      // ClipperLib.JS.ScaleUpPath(point2Ds, 2);
      // movePoint2Ds(point2Ds, mp.X, mp.Y);

      drawCloseCoutour(isInitInput);
   }

   this.rotateX = function() {
      if (!isClosed || !point2Ds || point2Ds.length === 0) {
         return;
      }
      var newP2Ary = [];
      var mp = getMiddlePointFromPath(point2Ds);
      var pLen = point2Ds.length;
      for (var i = 0; i < pLen; i++) {
         var P = {
            X: point2Ds[i].X * -1,
            Y: point2Ds[i].Y
         };
         newP2Ary.push(P);
      }
      newP2Ary = movePoint2Ds(newP2Ary, mp);
      point2Ds = newP2Ary;
      userPosition3Ds = convertPoint2DsTo3Ds(point2Ds);
      drawCloseCoutour();
   };

   //public
   this.subdiv = function(level, xLimit) {

      if (!isClosed || !point2Ds || point2Ds.length === 0) {
         return;
      }

      if(xLimit === undefined){
         xLimit = 1;
      }

      contour.subLevel = level;
      if (beforeSubdiv_point2Ds == null) {
         beforeSubdiv_point2Ds = point2Ds;
      }else{
         point2Ds = beforeSubdiv_point2Ds;
      }

      if (level > 1) {
         var newP2Ds = point2Ds;
         for (i = 0; i < level; i++) {
            newP2Ds = OA.Utils.subdivision(newP2Ds, xLimit);
         }
         point2Ds = newP2Ds;
      }
      userPosition3Ds = convertPoint2DsTo3Ds(point2Ds);
      drawCloseCoutour();
   };


   this.undo = function() {
      userPosition3Ds.pop();
      updateContour(userPosition3Ds);
      isClosed = false;
   };

   this.addPosition3D = function(inputP) {
      var plen = userPosition3Ds.length;
      //inputP = OA.Utils.adjustFloat(inputP);
      if(plen > 1 && OA.Utils.checkEqualPosition(inputP, userPosition3Ds[plen-1])){
         return;
      }
      if (plen > 2 && OA.Utils.checkEqualPosition(userPosition3Ds[0], inputP)) {
         userPosition3Ds.push(inputP);
         closeContour();
      } else {
         userPosition3Ds.push(inputP);
         updateContour(userPosition3Ds);
      }

   };

   this.checkClosed = function() {
      return isClosed;
   };


   this.drawHoverLine = function(movePosition3D) {
      if (!lineGroup) {
         return;
      }

      if (hoverLine) {
         lineGroup.remove(hoverLine);
      }
      var len = userPosition3Ds.length;
      if (len < 1) {
         return;
      }

      var p1 = movePosition3D,
          p2 = userPosition3Ds[len - 1],
          geometry = new THREE.Geometry();
      geometry.vertices.push(p1, p2);
      geometry.computeLineDistances();
      hoverLine = new THREE.Line(geometry, new THREE.LineDashedMaterial({
         linewidth: 2,
         color: _setting.line.color,
         opacity: _setting.line.opacity,
         transparent: true,
         dashSize: 4,
         gapSize: 1,
         transparent: true,
         depthTest: false,
         depthWrite: false
      }));


      var radius = 0.6;
      var segments = 32;
      var material = new THREE.MeshBasicMaterial({
         color: 0xD02C55,
         opacity: 1,
         transparent: true,
         depthTest: false,
         depthWrite: false
      });
      var circleGeometry = new THREE.CircleGeometry(radius, segments);
      var circle = new THREE.Mesh(circleGeometry, material);
      circle.position.x = p2.x;
      circle.position.y = p2.y;
      circle.position.z = p2.z;
      hoverLine.add(circle);
      hoverLine.position.z = 0.2;
      lineGroup.add(hoverLine);
   };

   return init();

};

OA.Contour.prototype = Object.create(THREE.Object3D.prototype);