import React, { useRef, useEffect, useState } from "react";
import * as THREE from "three";
import { generateCurveFromPrompt } from "../ai/gemini";
import AIChatBox from "./AIChatBox";
import { createHandleLine, updateHandleLine } from "../three/handleLines";
import { createNumberLabel } from "../three/numberLabel";
import { executeAICommands } from "./aiCommandExecutor";

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
  const mirrorHandlesRef = useRef(false);

  // UI state
  const [isFreehand, setIsFreehand] = useState(false);
  const isFreehandRef = useRef(false);
  const isEditingAnchorInputRef = useRef(false);


  const [anchorInput, setAnchorInput] = useState(null);

  const [isDrawing, setIsDrawing] = useState(true);
  const [lineColor, setLineColor] = useState("#00ff00");
  const [lineWidth, setLineWidth] = useState(0.02);
  const [animType, setAnimType] = useState("disappear-start-to-end");
  const [timeLine, setTimeLine] = useState(3);
  const [selectedAnchorPos, setSelectedAnchorPos] = useState(null);
  const [mirrorHandles, setMirrorHandles] = useState(false)

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

      // 🔢 Number label
      i = i + 1;
      const label = createNumberLabel(i.toString());
      label.position.set(0, 0.45, 0); // above sphere
      mesh.add(label);

      sceneRef.current.add(mesh);
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

    controlPointsRef.current.forEach((seg, i) => {
      const A = anchorPointsRef.current[i];
      const B = anchorPointsRef.current[i + 1];

      if (!seg.line1) {
        seg.line1 = createHandleLine(A, seg.cp1.pos);
        sceneRef.current.add(seg.line1);
      } else {
        updateHandleLine(seg.line1, A, seg.cp1.pos);
      }

      if (!seg.line2) {
        seg.line2 = createHandleLine(B, seg.cp2.pos);
        sceneRef.current.add(seg.line2);
      } else {
        updateHandleLine(seg.line2, B, seg.cp2.pos);
      }
    });


  };

  const hideSpheres = () => {
    anchorMeshesRef.current.forEach((m) => (m.visible = false));
    controlPointsRef.current.forEach((seg) => {
      if (seg?.cp1?.sphere) seg.cp1.sphere.visible = false;
      if (seg?.cp2?.sphere) seg.cp2.sphere.visible = false;
      if (seg?.line1) seg.line1.visible = false;
      if (seg?.line2) seg.line2.visible = false;
    });
  };

  const showSpheres = () => {
    anchorMeshesRef.current.forEach((m) => (m.visible = true));
    controlPointsRef.current.forEach((seg) => {
      if (seg?.cp1?.sphere) seg.cp1.sphere.visible = true;
      if (seg?.cp2?.sphere) seg.cp2.sphere.visible = true;
      if (seg?.line1) seg.line1.visible = true;
      if (seg?.line2) seg.line2.visible = true;
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
      setSelectedAnchorPos,
      mirrorHandlesRef,
      anchorInput,
      isEditingAnchorInputRef,
      setAnchorInput,


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
        } catch (err) { }
      }

      anchorMeshesRef.current.forEach((m) => {
        try {
          if (m.geometry) m.geometry.dispose();
          if (m.material) m.material.dispose();
          scene.remove(m);
        } catch (err) { }
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
        } catch (err) { }
      });

      // remove canvas
      if (rendererRef.current && mountRef.current?.contains(rendererRef.current.domElement)) {
        mountRef.current.removeChild(rendererRef.current.domElement);
      }
      if (rendererRef.current) {
        try {
          rendererRef.current.dispose();
        } catch (err) { }
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


  useEffect(() => {
    mirrorHandlesRef.current = mirrorHandles;
    console.log("ON");
  }, [mirrorHandles]);

  useEffect(() => {
    if (!selectedAnchorPos || anchorInput) return;

    setAnchorInput({
      x: selectedAnchorPos.x.toFixed(4),
      y: selectedAnchorPos.y.toFixed(4),
    });
  }, [selectedAnchorPos]);




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
        animateDisappear(tubeMaterialRef, hideSpheres, showSpheres, timeLine, "start-to-end");
        break;
      case "disappear-end-to-start":
        animateDisappear(tubeMaterialRef, hideSpheres, showSpheres, timeLine, "end-to-start");
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
      } catch (err) { }
    });
    anchorMeshesRef.current = [];
    anchorPointsRef.current = [];

    controlPointsRef.current.forEach(seg => {
      if (seg.line1) {
        scene.remove(seg.line1);
        seg.line1.geometry.dispose();
        seg.line1.material.dispose();
      }
      if (seg.line2) {
        scene.remove(seg.line2);
        seg.line2.geometry.dispose();
        seg.line2.material.dispose();
      }
    });

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
      } catch (err) { }
    });
    controlPointsRef.current = [];

    // remove tube
    if (tubeRef.current) {
      try {
        if (tubeRef.current.geometry) tubeRef.current.geometry.dispose();
        if (tubeRef.current.material) tubeRef.current.material.dispose();
        scene.remove(tubeRef.current);
      } catch (err) { }
    }
    tubeRef.current = null;
    tubeMaterialRef.current = null;

    selectedRef.current = null;
    setSelectedAnchorPos(null);
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

    // 🛑 CLEANUP: Remove ALL control spheres before recomputing
    // This prevents "orphaned" spheres when the segments array shrinks
    controlPointsRef.current.forEach((seg) => {
      if (seg.cp1?.sphere) {
        sceneRef.current.remove(seg.cp1.sphere);
        seg.cp1.sphere.geometry.dispose();
        seg.cp1.sphere.material.dispose();
        seg.cp1.sphere = null;
      }
      if (seg.cp2?.sphere) {
        sceneRef.current.remove(seg.cp2.sphere);
        seg.cp2.sphere.geometry.dispose();
        seg.cp2.sphere.material.dispose();
        seg.cp2.sphere = null;
      }
      if (seg.line1) {
        sceneRef.current.remove(seg.line1);
        seg.line1.geometry.dispose();
        seg.line1.material.dispose();
        seg.line1 = null;
      }
      if (seg.line2) {
        sceneRef.current.remove(seg.line2);
        seg.line2.geometry.dispose();
        seg.line2.material.dispose();
        seg.line2 = null;
      }
    });

    computeControlPoints(anchorPointsRef, controlPointsRef, sceneRef, true);
    redrawAll(lineWidth, lineColor);

    selectedRef.current = null;
    setSelectedAnchorPos(null);
  };




  // const handleAICreateCurve = async (prompt) => {
  //   try {
  //     const result = await window.ai.generateCurve(prompt);

  //     // -----------------------------
  //     // FORMAT A: Direct geometry
  //     // -----------------------------
  //     if (result.anchors && result.controls) {

  //       // 1️⃣ Apply anchors ONLY
  //       anchorPointsRef.current = result.anchors.map(
  //         (p) => new THREE.Vector3(p.x, p.y, p.z ?? 0)
  //       );

  //       // 2️⃣ ⚠️ CLEAR control points completely
  //       controlPointsRef.current = [];

  //       // 3️⃣ Rebuild canonical cubic controls
  //       computeControlPoints(
  //         anchorPointsRef,
  //         controlPointsRef,
  //         sceneRef,
  //         false
  //       );

  //       // 4️⃣ OPTIONAL: override with AI controls (safe)
  //       result.controls.forEach((seg, i) => {
  //         const cpSeg = controlPointsRef.current[i];
  //         if (!cpSeg) return;

  //         cpSeg.cp1.pos.set(seg.cp1.x, seg.cp1.y, seg.cp1.z ?? 0);
  //         cpSeg.cp2.pos.set(seg.cp2.x, seg.cp2.y, seg.cp2.z ?? 0);

  //         cpSeg.cp1.manual = true;
  //         cpSeg.cp2.manual = true;
  //       });

  //       // 5️⃣ Full redraw (tube + spheres)
  //       redrawAll(lineWidth, lineColor);
  //       return;
  //     }

  //     // -----------------------------
  //     // FORMAT B: Commands
  //     // -----------------------------
  //     if (result.commands) {
  //       executeAICommands({
  //         commands: result.commands,
  //         anchorPointsRef,
  //         controlPointsRef,
  //         computeControlPoints,
  //         redrawAll,
  //         sceneRef,
  //         activeWidthRef,
  //         activeColorRef,
  //       });
  //       return;
  //     }

  //     throw new Error("Unknown AI response format");

  //   } catch (err) {
  //     console.error("AI failed:", err);
  //     alert("AI failed to process request");
  //   }
  // };



  const handleAICreateCurve = async (prompt) => {
    try {
      const result = await window.ai.generateCurve(prompt);

      if (!Array.isArray(result.commands)) {
        throw new Error("AI did not return commands");
      }

      executeAICommands({
        commands: result.commands,
        anchorPointsRef,
        controlPointsRef,
        computeControlPoints,
        redrawAll,
        rebuildTube,
        sceneRef,
        activeWidthRef,
        activeColorRef,
        anchorMeshesRef,
        tubeRef,
        tubeMaterialRef,
      });

    } catch (err) {
      console.error("AI failed:", err);
      alert("AI could not understand the request");
    }
  };



  const updateSelectedAnchorPosition = (axis, value) => {
    if (!selectedRef.current) return;
    if (selectedRef.current.type !== "anchor") return;

    const index = selectedRef.current.index;
    const p = anchorPointsRef.current[index];

    if (!p) return;

    // Update axis
    if (axis === "x") p.x = value;
    if (axis === "y") p.y = value;
    if (axis === "z") p.z = value;

    // Recompute curve
    computeControlPoints(anchorPointsRef, controlPointsRef, sceneRef, true);
    redrawAll(activeWidthRef.current, activeColorRef.current);

    // Update UI state
    setSelectedAnchorPos({
      x: p.x,
      y: p.y,
      z: p.z,
    });
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
        selectedAnchorPos={selectedAnchorPos}
        onAnchorPositionChange={updateSelectedAnchorPosition}
        mirrorHandles={mirrorHandles}
        setMirrorHandles={setMirrorHandles}
        anchorInput={anchorInput}
        setAnchorInput={setAnchorInput}



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
