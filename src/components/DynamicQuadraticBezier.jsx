import React, { useRef, useEffect, useState } from "react";
import * as THREE from "three";

import ControlPanel from "./ControlPanel";
import { setupScene } from "../three/sceneSetup";
import { makeSphere } from "../three/spheres";
import { computeControlPoints } from "../three/curveMath";
import { rebuildTube } from "../three/tubeBuilder";

import {
  animateDisappear,
  animateColor,
  animateWidth,
  animatePulse,
} from "../animations/tubeAnimations";

import { attachPointerHandlers } from "../interactions/pointerHandlers";
import { attachKeyboardHandlers } from "../interactions/keyboardHandlers";

export default function DynamicQuadraticBezier() {
  const mountRef = useRef(null);
  const [isFreehand, setIsFreehand] = useState(false);
  const isFreehandRef = useRef(false);

  const [isDrawing, setIsDrawing] = useState(true);
  const [lineColor, setLineColor] = useState("#00ff00");
  const [lineWidth, setLineWidth] = useState(0.02);
  const [animType, setAnimType] = useState("disappear-start-to-end");
  const [timeLine, setTimeLine] = useState(3);

  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const raycasterRef = useRef(null);

  const activeColorRef = useRef(lineColor);
  const activeWidthRef = useRef(lineWidth);
  const mouseRef = useRef(new THREE.Vector2());

  const anchorPointsRef = useRef([]);
  const anchorMeshesRef = useRef([]);
  const controlPointsRef = useRef([]);

  const tubeRef = useRef(null);
  const tubeMaterialRef = useRef(null);

  const draggingRef = useRef({ active: false, type: null, index: -1, object: null });
  const isDrawingRef = useRef(true);
  const selectedRef = useRef(null);

  const redrawAll = (radius = activeWidthRef.current, colorHex = activeColorRef.current) => {
    computeControlPoints(anchorPointsRef, controlPointsRef, sceneRef, true);
    rebuildTube(
      sceneRef,
      anchorPointsRef,
      controlPointsRef,
      tubeRef,
      tubeMaterialRef,
      radius,
      colorHex
    );

    anchorMeshesRef.current.forEach((m) => {
      sceneRef.current.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    });
    anchorMeshesRef.current = [];

    anchorPointsRef.current.forEach((p, i) => {
      const mesh = makeSphere(p, 0x2196f3, 0.16);
      mesh.userData = { type: "anchor", index: i };
      sceneRef.current.add(mesh);
      anchorMeshesRef.current.push(mesh);
    });

    controlPointsRef.current.forEach((cobj, i) => {
      if (!cobj.sphere) {
        const mesh = makeSphere(cobj.c, 0xff5252, 0.14);
        mesh.userData = { type: "control", index: i };
        sceneRef.current.add(mesh);
        cobj.sphere = mesh;
      } else {
        cobj.sphere.position.copy(cobj.c);
        cobj.sphere.userData = { type: "control", index: i };
      }
    });
  };

  const hideSpheres = () => {
    anchorMeshesRef.current.forEach((m) => (m.visible = false));
    controlPointsRef.current.forEach((c) => c.sphere && (c.sphere.visible = false));
  };

  const showSpheres = () => {
    anchorMeshesRef.current.forEach((m) => (m.visible = true));
    controlPointsRef.current.forEach((c) => c.sphere && (c.sphere.visible = true));
  };

  useEffect(() => {
    setupScene({
      mountRef,
      sceneRef,
      cameraRef,
      rendererRef,
      raycasterRef,
    });

    const cleanupPointer = attachPointerHandlers({
      rendererRef,
      raycasterRef,
      cameraRef,
      mouseRef,
      anchorMeshesRef,
      controlPointsRef,
      draggingRef,
      selectedRef,
      isDrawingRef,
      isFreehandRef,
      anchorPointsRef,
      computeControlPoints: (update) =>
        computeControlPoints(anchorPointsRef, controlPointsRef, sceneRef, update),
      redrawAll,
      rebuildTube: (r, c) =>
        rebuildTube(
          sceneRef,
          anchorPointsRef,
          controlPointsRef,
          tubeRef,
          tubeMaterialRef,
          r,
          c
        ),
      activeWidthRef,
      activeColorRef,
    });

   const cleanupKeyboard = attachKeyboardHandlers({
  selectedRef,
  anchorPointsRef,
  controlPointsRef,
  computeControlPoints: (update) =>
    computeControlPoints(anchorPointsRef, controlPointsRef, sceneRef, update),
  redrawAll,
  activeWidthRef,
  activeColorRef,
});


    const animate = () => {
      requestAnimationFrame(animate);
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    };
    animate();

    return () => {
      cleanupPointer();
      cleanupKeyboard();
    };
  }, []);

  useEffect(() => {
    activeColorRef.current = lineColor;
    redrawAll(activeWidthRef.current, lineColor);
  }, [lineColor]);

  useEffect(() => {
    activeWidthRef.current = lineWidth;
    redrawAll(lineWidth, activeColorRef.current);
  }, [lineWidth]);
  useEffect(() => {
  isFreehandRef.current = isFreehand;
}, [isFreehand]);


  const startDrawing = () => {
    setIsDrawing(true);
    isDrawingRef.current = true;
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    isDrawingRef.current = false;
  };

  const runSelectedAnimation = () => {
    switch (animType) {
      case "disappear-start-to-end":
        animateDisappear(tubeMaterialRef, hideSpheres, timeLine, "start-to-end");
        break;
      case "disappear-end-to-start":
        animateDisappear(tubeMaterialRef, hideSpheres, timeLine, "end-to-start");
        break;
      case "color-change":
        animateColor(
          tubeMaterialRef,
          activeColorRef,
          setLineColor,
          redrawAll,
          "#ff6b6b",
          2.2
        );
        break;
      case "width-change":
        animateWidth(
          activeWidthRef,
          setLineWidth,
          (r, c) =>
            rebuildTube(
              sceneRef,
              anchorPointsRef,
              controlPointsRef,
              tubeRef,
              tubeMaterialRef,
              r,
              c
            ),
          activeColorRef,
          Math.max(0.02, lineWidth * 0.25),
          2
        );
        break;
      case "pulse":
        animatePulse(tubeMaterialRef, 0.9, 4);
        break;
      default:
        break;
    }
  };

  const clearAll = () => {
  const scene = sceneRef.current;
  if (!scene) return;

  // --- remove & dispose anchor meshes ---
  if (anchorMeshesRef.current && anchorMeshesRef.current.length) {
    anchorMeshesRef.current.forEach((m) => {
      try {
        if (m.geometry) m.geometry.dispose();
        if (m.material) m.material.dispose();
        scene.remove(m);
      } catch (err) {
        // ignore if already removed
      }
    });
  }
  anchorMeshesRef.current = [];
  anchorPointsRef.current = [];

  // --- remove & dispose control spheres ---
  if (controlPointsRef.current && controlPointsRef.current.length) {
    controlPointsRef.current.forEach((c) => {
      if (c && c.sphere) {
        try {
          if (c.sphere.geometry) c.sphere.geometry.dispose();
          if (c.sphere.material) c.sphere.material.dispose();
          scene.remove(c.sphere);
        } catch (err) {
          // ignore
        }
      }
    });
  }
  controlPointsRef.current = [];

  // --- remove & dispose tube ---
  if (tubeRef.current) {
    try {
      if (tubeRef.current.geometry) tubeRef.current.geometry.dispose();
      if (tubeRef.current.material) tubeRef.current.material.dispose();
      scene.remove(tubeRef.current);
    } catch (err) {
      // ignore
    }
  }
  tubeRef.current = null;
  tubeMaterialRef.current = null;

  // reset helpers
  selectedRef.current = null;
  draggingRef.current = { active: false, type: null, index: -1, object: null };

  // optional: ensure UI state synced
  activeWidthRef.current = lineWidth;
  activeColorRef.current = lineColor;
  isFreehandRef.current = isFreehand;

};



   const deleteSelected = () => {
  if (!selectedRef.current) return;
  const { type, index } = selectedRef.current;

  if (type === "anchor") {
    anchorPointsRef.current.splice(index, 1);
    computeControlPoints(anchorPointsRef, controlPointsRef, sceneRef, true);
    redrawAll(lineWidth, lineColor);
  } 
  else if (type === "control") {
    if (controlPointsRef.current[index]) {
      controlPointsRef.current[index].manual = false;
      computeControlPoints(anchorPointsRef, controlPointsRef, sceneRef, true);
      redrawAll(lineWidth, lineColor);
    }
  }

  selectedRef.current = null;
};


  return (
    <>
      <ControlPanel
    isDrawing={isDrawing}
    startDrawing={startDrawing}
    stopDrawing={stopDrawing}
    lineColor={lineColor}
    setLineColor={setLineColor}
    lineWidth={lineWidth}
    setLineWidth={setLineWidth}
    animType={animType}
    setAnimType={setAnimType}
    timeLine={timeLine}
    setTimeLine={setTimeLine}
    runSelectedAnimation={runSelectedAnimation}
    showSpheres={showSpheres}
    hideSpheres={hideSpheres}
    clearAll={clearAll}
    deleteSelected={deleteSelected}

    // Correct
    isFreehand={isFreehand}
    setIsFreehand={setIsFreehand}
/>


      <div
        ref={mountRef}
        style={{
          width: "100vw",
          height: "100vh",
          position: "absolute",
          left: 0,
          top: 0,
        }}
      />
    </>
  );
}
