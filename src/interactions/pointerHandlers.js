import * as THREE from "three";
import { updateHandleLine } from "../three/handleLines";

export const attachPointerHandlers = ({
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
  computeControlPoints,
  redrawAll,
  rebuildTube,
  activeWidthRef,
  activeColorRef,
  sceneRef,
  setSelectedAnchorPos,
  mirrorHandlesRef,
  isEditingAnchorInputRef,
  setAnchorInput,
}) => {
  // --------------------------------------------------
  // GET WORLD POSITION UNDER CURSOR (XY plane)
  // --------------------------------------------------
  const getPointerPlaneIntersection = (event) => {
    const rect = rendererRef.current.domElement.getBoundingClientRect();

    mouseRef.current.x =
      ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y =
      -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycasterRef.current.setFromCamera(
      mouseRef.current,
      cameraRef.current
    );

    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const hit = new THREE.Vector3();
    raycasterRef.current.ray.intersectPlane(plane, hit);
    return hit;
  };

  // --------------------------------------------------
  // POINTER DOWN
  // --------------------------------------------------
  const onPointerDown = (event) => {
    if (!rendererRef.current) return;
    event.preventDefault();

    // ---------------- FREEHAND START ----------------
    if (isFreehandRef.current) {
      const p = getPointerPlaneIntersection(event);
      anchorPointsRef.current = [p.clone()];
      draggingRef.current.active = true;
      return;
    }

    // ---------------- PICK OBJECT ----------------
    const rect = rendererRef.current.domElement.getBoundingClientRect();
    mouseRef.current.x =
      ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y =
      -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycasterRef.current.setFromCamera(
      mouseRef.current,
      cameraRef.current
    );

    // collect clickable objects
    const controlSpheres = [];
    controlPointsRef.current.forEach((seg, segIndex) => {
      if (seg?.cp1?.sphere) {
        seg.cp1.sphere.userData = {
          type: "control",
          segment: segIndex,
          which: "cp1",
        };
        controlSpheres.push(seg.cp1.sphere);
      }
      if (seg?.cp2?.sphere) {
        seg.cp2.sphere.userData = {
          type: "control",
          segment: segIndex,
          which: "cp2",
        };
        controlSpheres.push(seg.cp2.sphere);
      }
    });

    const clickable = [
      ...anchorMeshesRef.current,
      ...controlSpheres,
    ];

    const hit = raycasterRef.current.intersectObjects(clickable, false);

    // ---------------- HIT ANCHOR ----------------
    if (hit.length > 0) {
      const obj = hit[0].object;
      const ud = obj.userData;

      if (ud.type === "anchor") {
        draggingRef.current = {
          active: true,
          type: "anchor",
          index: ud.index,
        };

        selectedRef.current = {
          type: "anchor",
          index: ud.index,
        };

        const p = anchorPointsRef.current[ud.index];
        setSelectedAnchorPos({
          x: p.x,
          y: p.y,
          z: p.z,
        });

        return;
      }

      // ---------------- HIT CONTROL ----------------
      if (ud.type === "control") {
        draggingRef.current = {
          active: true,
          type: "control",
          segment: ud.segment,
          which: ud.which,
        };

        controlPointsRef.current[ud.segment][ud.which].manual = true;

        selectedRef.current = {
          type: "control",
          segment: ud.segment,
          which: ud.which,
        };

        return;
      }
    }

    // ---------------- ADD ANCHOR ----------------
    if (isDrawingRef.current) {
      const p = getPointerPlaneIntersection(event);
      anchorPointsRef.current.push(p.clone());

      computeControlPoints(
        anchorPointsRef,
        controlPointsRef,
        sceneRef,
        true
      );

      redrawAll(activeWidthRef.current, activeColorRef.current);
    }
  };

  // --------------------------------------------------
  // POINTER MOVE
  // --------------------------------------------------
  const onPointerMove = (event) => {
    if (!draggingRef.current.active) return;
    event.preventDefault();

    const p = getPointerPlaneIntersection(event);
    const d = draggingRef.current;

    // ---------------- FREEHAND DRAW ----------------
    if (isFreehandRef.current) {
      const pts = anchorPointsRef.current;
      const last = pts[pts.length - 1];

      if (!last || last.distanceTo(p) > 0.05) {
        pts.push(p.clone());
      }

      computeControlPoints(
        anchorPointsRef,
        controlPointsRef,
        sceneRef,
        false
      );
      rebuildTube(activeWidthRef.current, activeColorRef.current);
      return;
    }

    // ---------------- DRAG ANCHOR ----------------
    if (d.type === "anchor") {
      anchorPointsRef.current[d.index].copy(p);

      // live UI sync (only if selected & not typing)
      if (
        selectedRef.current &&
        selectedRef.current.type === "anchor" &&
        selectedRef.current.index === d.index &&
        !isEditingAnchorInputRef.current
      ) {
        setSelectedAnchorPos({
          x: p.x,
          y: p.y,
          z: p.z,
        });

        setAnchorInput({
          x: p.x.toFixed(4),
          y: p.y.toFixed(4),
        });
      }

      // update left segment cp2
      if (d.index > 0) {
        const seg = controlPointsRef.current[d.index - 1];
        if (seg && !seg.cp2.manual) {
          const A = anchorPointsRef.current[d.index - 1];
          const B = anchorPointsRef.current[d.index];
          const dir = new THREE.Vector3().subVectors(B, A);
          seg.cp2.pos.copy(A.clone().add(dir.multiplyScalar(0.66)));
          seg.cp2.sphere?.position.copy(seg.cp2.pos);
        }
      }

      // update right segment cp1
      if (d.index < anchorPointsRef.current.length - 1) {
        const seg = controlPointsRef.current[d.index];
        if (seg && !seg.cp1.manual) {
          const A = anchorPointsRef.current[d.index];
          const B = anchorPointsRef.current[d.index + 1];
          const dir = new THREE.Vector3().subVectors(B, A);
          seg.cp1.pos.copy(A.clone().add(dir.multiplyScalar(0.33)));
          seg.cp1.sphere?.position.copy(seg.cp1.pos);
        }
      }
    }

    // ---------------- DRAG CONTROL ----------------
    if (d.type === "control") {
      const seg = controlPointsRef.current[d.segment];
      if (!seg) return;

      const { cp1, cp2 } = seg;
      const A = anchorPointsRef.current[d.segment];
      const B = anchorPointsRef.current[d.segment + 1];

      seg[d.which].pos.copy(p);
      seg[d.which].manual = true;

      // mirror handles
      if (mirrorHandlesRef.current) {
        if (d.which === "cp1") {
          const v = new THREE.Vector3().subVectors(p, A);
          cp2.pos.copy(B.clone().sub(v));
        } else {
          const v = new THREE.Vector3().subVectors(p, B);
          cp1.pos.copy(A.clone().sub(v));
        }
      }

      cp1.sphere?.position.copy(cp1.pos);
      cp2.sphere?.position.copy(cp2.pos);
    }

    // ---------------- UPDATE HANDLE LINES ----------------
    controlPointsRef.current.forEach((seg, i) => {
      const A = anchorPointsRef.current[i];
      const B = anchorPointsRef.current[i + 1];
      if (seg.line1) updateHandleLine(seg.line1, A, seg.cp1.pos);
      if (seg.line2) updateHandleLine(seg.line2, B, seg.cp2.pos);
    });

    // ---------------- FINAL VISUAL UPDATE ----------------
    rebuildTube(activeWidthRef.current, activeColorRef.current);

    anchorMeshesRef.current.forEach((m, i) => {
      m.position.copy(anchorPointsRef.current[i]);
    });
  };

  // --------------------------------------------------
  // POINTER UP
  // --------------------------------------------------
  const onPointerUp = () => {
    draggingRef.current.active = false;
  };

  // --------------------------------------------------
  // ATTACH / CLEANUP
  // --------------------------------------------------
  rendererRef.current.domElement.addEventListener(
    "pointerdown",
    onPointerDown
  );
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);

  return () => {
    rendererRef.current.domElement.removeEventListener(
      "pointerdown",
      onPointerDown
    );
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  };
};
