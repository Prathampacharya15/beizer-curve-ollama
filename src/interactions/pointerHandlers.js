import * as THREE from "three";

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
}) => {
  // ------------------------------
  // GET WORLD POSITION UNDER CURSOR
  // ------------------------------
  const getPointerPlaneIntersection = (event) => {
    const rect = rendererRef.current.domElement.getBoundingClientRect();
    mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const hit = new THREE.Vector3();
    raycasterRef.current.ray.intersectPlane(plane, hit);
    return hit;
  };

  // ------------------------------
  // POINTER DOWN
  // ------------------------------
  const onPointerDown = (event) => {
    if (!rendererRef.current) return;
    event.preventDefault();

    // ----------------------------------------
    // FREEHAND MODE — START NEW FREEHAND PATH
    // ----------------------------------------
    if (isFreehandRef.current) {
      const p = getPointerPlaneIntersection(event);
      anchorPointsRef.current = [p.clone()];
      draggingRef.current.active = true;
      return;
    }

    // ----------------------------------------
    // NORMAL CLICK HANDLING (ANCHOR / CP PICK)
    // ----------------------------------------
    const rect = rendererRef.current.domElement.getBoundingClientRect();
    mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);

    // Collect all control point spheres (cp1 + cp2)
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

    const clickable = [...anchorMeshesRef.current, ...controlSpheres];

    const hit = raycasterRef.current.intersectObjects(clickable, false);

    // ----------------------------------------
    // HIT ANCHOR / CONTROL
    // ----------------------------------------
    if (hit.length > 0) {
      const obj = hit[0].object;
      const ud = obj.userData;

      // -------------------
      // ANCHOR SELECTED
      // -------------------
      if (ud.type === "anchor") {
        draggingRef.current = {
          active: true,
          type: "anchor",
          index: ud.index,
        };
        selectedRef.current = { type: "anchor", index: ud.index };
        return;
      }

      // -------------------
      // CP1 / CP2 SELECTED
      // -------------------
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

    // ----------------------------------------
    // CLICK EMPTY → ADD ANCHOR POINT
    // ----------------------------------------
    if (isDrawingRef.current) {
      const p = getPointerPlaneIntersection(event);
      anchorPointsRef.current.push(p.clone());

      computeControlPoints(anchorPointsRef, controlPointsRef, sceneRef, true);
      redrawAll(activeWidthRef.current, activeColorRef.current);
    }
  };

  // ------------------------------
  // POINTER MOVE
  // ------------------------------
  const onPointerMove = (event) => {
    if (!draggingRef.current.active) return;
    event.preventDefault();

    const p = getPointerPlaneIntersection(event);
    const d = draggingRef.current;

    // ----------------------------------------
    // FREEHAND DRAWING MODE
    // ----------------------------------------
    if (isFreehandRef.current) {
      const pts = anchorPointsRef.current;
      const last = pts[pts.length - 1];

      if (!last || last.distanceTo(p) > 0.05) {
        pts.push(p.clone());
      }

      computeControlPoints(anchorPointsRef, controlPointsRef, sceneRef, false);
      rebuildTube(activeWidthRef.current, activeColorRef.current);
      return;
    }

    // ----------------------------------------
    // DRAGGING ANCHOR
    // ----------------------------------------
    if (d.type === "anchor") {
      anchorPointsRef.current[d.index].copy(p);

      // Update LEFT seg cp2 if not manual
      if (d.index > 0) {
        const seg = controlPointsRef.current[d.index - 1];
        if (seg && !seg.cp2.manual) {
          const A = anchorPointsRef.current[d.index - 1];
          const B = anchorPointsRef.current[d.index];
          const dir = new THREE.Vector3().subVectors(B, A);
          seg.cp2.pos.copy(A.clone().add(dir.clone().multiplyScalar(0.66)));
          seg.cp2.sphere.position.copy(seg.cp2.pos);
        }
      }

      // Update RIGHT seg cp1 if not manual
      if (d.index < anchorPointsRef.current.length - 1) {
        const seg = controlPointsRef.current[d.index];
        if (seg && !seg.cp1.manual) {
          const A = anchorPointsRef.current[d.index];
          const B = anchorPointsRef.current[d.index + 1];
          const dir = new THREE.Vector3().subVectors(B, A);
          seg.cp1.pos.copy(A.clone().add(dir.clone().multiplyScalar(0.33)));
          seg.cp1.sphere.position.copy(seg.cp1.pos);
        }
      }
    }

    // ----------------------------------------
    // DRAGGING CONTROL POINT (cp1 / cp2)
    // ----------------------------------------
    if (d.type === "control") {
      const seg = controlPointsRef.current[d.segment];
      if (!seg) return;

      const cp = seg[d.which];
      cp.pos.copy(p);
      if (cp.sphere) cp.sphere.position.copy(p);
    }

    // LIVE REBUILD TUBE + MESH POSITION UPDATE
    rebuildTube(activeWidthRef.current, activeColorRef.current);

    anchorMeshesRef.current.forEach((m, i) =>
      m.position.copy(anchorPointsRef.current[i])
    );
  };

  // ------------------------------
  // POINTER UP
  // ------------------------------
  const onPointerUp = () => {
    draggingRef.current.active = false;
  };

  // Attach listeners
  rendererRef.current.domElement.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);

  return () => {
    rendererRef.current.domElement.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  };
};
