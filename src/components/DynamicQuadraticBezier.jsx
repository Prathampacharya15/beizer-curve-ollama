import React, { useRef, useEffect, useState } from "react";
import * as THREE from "three";
import { generateCurveFromPrompt } from "../ai/gemini";
import AIChatBox from "./AIChatBox";


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

export default function DynamicCubicBezier() {
  const mountRef = useRef(null);

  // UI state
  const [isFreehand, setIsFreehand] = useState(false);
  const isFreehandRef = useRef(false);

  const [isDrawing, setIsDrawing] = useState(true);
  const [lineColor, setLineColor] = useState("#00ff00");
  const [lineWidth, setLineWidth] = useState(0.02);
  const [animType, setAnimType] = useState("disappear-start-to-end");
  const [timeLine, setTimeLine] = useState(3);

  // Three.js refs
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const raycasterRef = useRef(null);
  const mouseRef = useRef(new THREE.Vector2());
  const tangentLinesRef = useRef([]);

  const activeColorRef = useRef(lineColor);
  const activeWidthRef = useRef(lineWidth);

  // Core geometry refs
  const anchorPointsRef = useRef([]);
  const anchorMeshesRef = useRef([]);
  const controlPointsRef = useRef([]);

  const tubeRef = useRef(null);
  const tubeMaterialRef = useRef(null);

  const draggingRef = useRef({
    active: false,
    type: null,
    segment: null,
    which: null,
    index: null,
  });

  const isDrawingRef = useRef(true);
  const selectedRef = useRef(null);

  // ---------- Redraw all (tube + anchors + cp1/cp2 spheres) ----------
  const redrawAll = (radius = activeWidthRef.current, color = activeColorRef.current) => {
    // compute control points (wrapper in other files expects this signature)
    computeControlPoints(anchorPointsRef, controlPointsRef, sceneRef, true);

    // rebuild tube (use rebuildTube which expects sceneRef and refs)
    rebuildTube(
      sceneRef,
      anchorPointsRef,
      controlPointsRef,
      tubeRef,
      tubeMaterialRef,
      radius,
      color
    );

    // remove & dispose anchors
    const scene = sceneRef.current;
    if (!scene) return;

    anchorMeshesRef.current.forEach((m) => {
      try {
        scene.remove(m);
        if (m.geometry) m.geometry.dispose();
        if (m.material) m.material.dispose();
      } catch (err) {
        // ignore
      }
    });
    anchorMeshesRef.current = [];

    // add anchors
    anchorPointsRef.current.forEach((p, i) => {
      const mesh = makeSphere(p, 0x2196f3, 0.16);
      mesh.userData = { type: "anchor", index: i };
      scene.add(mesh);
      anchorMeshesRef.current.push(mesh);
    });

    // add/update control spheres for cp1/cp2
    controlPointsRef.current.forEach((seg, i) => {
  // CP1
  if (!seg.cp1.sphere) {
    const s1 = makeSphere(seg.cp1.pos, 0xff5252, 0.12);
    s1.userData = { type: "control", segment: i, which: "cp1" };
    sceneRef.current.add(s1);
    seg.cp1.sphere = s1;
  } else {
    seg.cp1.sphere.position.copy(seg.cp1.pos);
  }

  // CP2
  if (!seg.cp2.sphere) {
    const s2 = makeSphere(seg.cp2.pos, 0xff5252, 0.12);
    s2.userData = { type: "control", segment: i, which: "cp2" };
    sceneRef.current.add(s2);
    seg.cp2.sphere = s2;
  } else {
    seg.cp2.sphere.position.copy(seg.cp2.pos);
  }
});

  };

  const hideSpheres = () => {
    anchorMeshesRef.current.forEach((m) => (m.visible = false));
    controlPointsRef.current.forEach((seg) => {
      if (seg?.cp1?.sphere) seg.cp1.sphere.visible = false;
      if (seg?.cp2?.sphere) seg.cp2.sphere.visible = false;
    });
  };

  const showSpheres = () => {
    anchorMeshesRef.current.forEach((m) => (m.visible = true));
    controlPointsRef.current.forEach((seg) => {
      if (seg?.cp1?.sphere) seg.cp1.sphere.visible = true;
      if (seg?.cp2?.sphere) seg.cp2.sphere.visible = true;
    });
  };

  // ---------- Setup: scene, renderer, handlers ----------
  useEffect(() => {
    setupScene({
      mountRef,
      sceneRef,
      cameraRef,
      rendererRef,
      raycasterRef,
    });

    // pass wrappers so pointerHandlers and keyboard handlers can call computeControlPoints/rebuildTube correctly
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
      sceneRef,
      tubeRef,
      tubeMaterialRef,
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

    // render loop
    let raf = null;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };
    animate();

    return () => {
      // cleanup handlers
      cleanupPointer && cleanupPointer();
      cleanupKeyboard && cleanupKeyboard();

      cancelAnimationFrame(raf);

      // dispose objects
      const scene = sceneRef.current;
      if (tubeRef.current && scene) {
        try {
          if (tubeRef.current.geometry) tubeRef.current.geometry.dispose();
          if (tubeRef.current.material) tubeRef.current.material.dispose();
          scene.remove(tubeRef.current);
        } catch (err) {}
      }

      anchorMeshesRef.current.forEach((m) => {
        try {
          if (m.geometry) m.geometry.dispose();
          if (m.material) m.material.dispose();
          scene.remove(m);
        } catch (err) {}
      });

      controlPointsRef.current.forEach((seg) => {
        try {
          if (seg?.cp1?.sphere) {
            if (seg.cp1.sphere.geometry) seg.cp1.sphere.geometry.dispose();
            if (seg.cp1.sphere.material) seg.cp1.sphere.material.dispose();
            scene.remove(seg.cp1.sphere);
          }
          if (seg?.cp2?.sphere) {
            if (seg.cp2.sphere.geometry) seg.cp2.sphere.geometry.dispose();
            if (seg.cp2.sphere.material) seg.cp2.sphere.material.dispose();
            scene.remove(seg.cp2.sphere);
          }
        } catch (err) {}
      });

      // remove canvas
      if (rendererRef.current && mountRef.current?.contains(rendererRef.current.domElement)) {
        mountRef.current.removeChild(rendererRef.current.domElement);
      }
      if (rendererRef.current) {
        try {
          rendererRef.current.dispose();
        } catch (err) {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once

  // ---------- Sync color and width with UI ----------
  useEffect(() => {
    activeColorRef.current = lineColor;
    redrawAll(activeWidthRef.current, lineColor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineColor]);

  useEffect(() => {
    activeWidthRef.current = lineWidth;
    redrawAll(lineWidth, activeColorRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineWidth]);

  useEffect(() => {
    isFreehandRef.current = isFreehand;
  }, [isFreehand]);

  // ---------- UI helpers ----------
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
        // animateWidth expects a rebuild callback for efficiency
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

    // remove anchors
    anchorMeshesRef.current.forEach((m) => {
      try {
        if (m.geometry) m.geometry.dispose();
        if (m.material) m.material.dispose();
        scene.remove(m);
      } catch (err) {}
    });
    anchorMeshesRef.current = [];
    anchorPointsRef.current = [];

    // remove controls
    controlPointsRef.current.forEach((seg) => {
      try {
        if (seg?.cp1?.sphere) {
          if (seg.cp1.sphere.geometry) seg.cp1.sphere.geometry.dispose();
          if (seg.cp1.sphere.material) seg.cp1.sphere.material.dispose();
          scene.remove(seg.cp1.sphere);
        }
        if (seg?.cp2?.sphere) {
          if (seg.cp2.sphere.geometry) seg.cp2.sphere.geometry.dispose();
          if (seg.cp2.sphere.material) seg.cp2.sphere.material.dispose();
          scene.remove(seg.cp2.sphere);
        }
      } catch (err) {}
    });
    controlPointsRef.current = [];

    // remove tube
    if (tubeRef.current) {
      try {
        if (tubeRef.current.geometry) tubeRef.current.geometry.dispose();
        if (tubeRef.current.material) tubeRef.current.material.dispose();
        scene.remove(tubeRef.current);
      } catch (err) {}
    }
    tubeRef.current = null;
    tubeMaterialRef.current = null;

    selectedRef.current = null;
  };

 const deleteSelected = () => {
  if (!selectedRef.current) return;

  const sel = selectedRef.current;

  if (sel.type === "anchor") {
    anchorPointsRef.current.splice(sel.index, 1);
  }

  if (sel.type === "control") {
    const seg = controlPointsRef.current[sel.segment];
    if (!seg) return;

    seg[sel.which].manual = false;
  }

  computeControlPoints(anchorPointsRef, controlPointsRef, sceneRef, true);
  redrawAll(lineWidth, lineColor);

  selectedRef.current = null;
};

const handleAICreateCurve = async (prompt) => {
  try {
    const res = await fetch("http://localhost:5000/api/generate-curve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });

    const data = await res.json();

    if (!data.anchors || !data.controls) {
      throw new Error("Invalid AI response");
    }

    // Apply anchors
    anchorPointsRef.current = data.anchors.map(
      (p) => new THREE.Vector3(p.x, p.y, p.z)
    );

    // Apply controls
    controlPointsRef.current = data.controls.map((seg) => ({
      cp1: {
        pos: new THREE.Vector3(seg.cp1.x, seg.cp1.y, seg.cp1.z),
        manual: true,
        sphere: null,
      },
      cp2: {
        pos: new THREE.Vector3(seg.cp2.x, seg.cp2.y, seg.cp2.z),
        manual: true,
        sphere: null,
      },
    }));

    redrawAll(lineWidth, lineColor);
  } catch (err) {
    console.error("AI curve failed:", err);
    alert("AI failed to generate curve");
  }
};



  const applyAICreateCurve = (aiResult) => {
  if (!aiResult || aiResult.type !== "create_curve") return;

  // Clear everything first
  clearAll();

  // Convert anchors to Vector3
  anchorPointsRef.current = aiResult.anchors.map(
    ([x, y, z]) => new THREE.Vector3(x, y, z)
  );

  // Auto-generate cubic control points
  computeControlPointsCubic(
    anchorPointsRef,
    controlPointsRef,
    sceneRef,
    false
  );

  // Build visuals
  redrawAll(activeWidthRef.current, activeColorRef.current);
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
        isFreehand={isFreehand}
        setIsFreehand={setIsFreehand}
        onAICreateCurve={handleAICreateCurve}
        
      />
        <AIChatBox onSubmit={handleAICreateCurve} />

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
