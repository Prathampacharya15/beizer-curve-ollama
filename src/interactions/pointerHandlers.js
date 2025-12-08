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
  tubeRef,
  tubeMaterialRef,
}) => {
  // ------------------------------
  // WORLD POSITION FROM MOUSE
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

    // ---------------------------------------------------
    // FREEHAND MODE - START STROKE
    // ---------------------------------------------------
    if (isFreehandRef.current) {
      const p = getPointerPlaneIntersection(event);
      anchorPointsRef.current = [p.clone()]; // reset stroke
      draggingRef.current.active = true;      // allow drawing while dragging
      return;
    }

    // ---------------------------------------------------
    // NORMAL MODE CLICK HANDLING
    // ---------------------------------------------------
    const rect = rendererRef.current.domElement.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const py = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    mouseRef.current.set(px, py);

    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);

    const clickable = [
      ...anchorMeshesRef.current,
      ...controlPointsRef.current.map((c) => c?.sphere).filter(Boolean),
    ];

    const hit = raycasterRef.current.intersectObjects(clickable, false);

    if (hit.length > 0) {
      const obj = hit[0].object;
      const ud = obj.userData;

      draggingRef.current = {
        active: true,
        type: ud.type,
        index: ud.index,
        object: obj,
      };

      selectedRef.current = { type: ud.type, index: ud.index };

      if (ud.type === "control") {
        controlPointsRef.current[ud.index].manual = true;
      }

      return;
    }

    // ---------------------------------------------------
    // If clicking empty space → add anchor point
    // ---------------------------------------------------
    if (isDrawingRef.current) {
      const p = getPointerPlaneIntersection(event);
      anchorPointsRef.current.push(p.clone());
      computeControlPoints(true);
      redrawAll(activeWidthRef.current, activeColorRef.current);
    }
  };

  // ------------------------------
  // POINTER MOVE
  // ------------------------------
  const onPointerMove = (event) => {
    if (!draggingRef.current.active) return;
    event.preventDefault();

    // ---------------------------------------------------
    // FREEHAND DRAWING MODE
    // ---------------------------------------------------
    if (isFreehandRef.current) {
      const p = getPointerPlaneIntersection(event);
      const pts = anchorPointsRef.current;
      const last = pts[pts.length - 1];

      // Add new point only if moved enough
      if (!last || last.distanceTo(p) > 0.05) {
        pts.push(p.clone());
      }

      // Auto control points
      computeControlPoints(anchorPointsRef, controlPointsRef, sceneRef, false);

      // Rebuild live
      rebuildTube(
        activeWidthRef.current,
        activeColorRef.current
      );

      return; // skip normal dragging
    }

    // ---------------------------------------------------
    // NORMAL DRAGGING OF ANCHORS / CONTROL POINTS
    // ---------------------------------------------------
    const p = getPointerPlaneIntersection(event);
    const d = draggingRef.current;

    // --------------------
    // DRAGGING ANCHOR
    // --------------------
    if (d.type === "anchor") {
      anchorPointsRef.current[d.index].copy(p);

      // Update left CP
      if (d.index - 1 >= 0) {
        const cp = controlPointsRef.current[d.index - 1];
        if (cp && !cp.manual) {
          const p0 = anchorPointsRef.current[d.index - 1];
          const p1 = anchorPointsRef.current[d.index];
          const mid = new THREE.Vector3().addVectors(p0, p1).multiplyScalar(0.5);
          const dir = new THREE.Vector3().subVectors(p1, p0);
          const off = new THREE.Vector3(-dir.y, dir.x, 0)
            .normalize()
            .multiplyScalar(Math.max(0.4, dir.length() * 0.25));
          cp.c.copy(mid.add(off));
          cp.sphere.position.copy(cp.c);
        }
      }

      // Update right CP
      if (d.index < anchorPointsRef.current.length - 1) {
        const cp = controlPointsRef.current[d.index];
        if (cp && !cp.manual) {
          const p0 = anchorPointsRef.current[d.index];
          const p1 = anchorPointsRef.current[d.index + 1];
          const mid = new THREE.Vector3().addVectors(p0, p1).multiplyScalar(0.5);
          const dir = new THREE.Vector3().subVectors(p1, p0);
          const off = new THREE.Vector3(-dir.y, dir.x, 0)
            .normalize()
            .multiplyScalar(Math.max(0.4, dir.length() * 0.25));
          cp.c.copy(mid.add(off));
          cp.sphere.position.copy(cp.c);
        }
      }
    }

    // --------------------
    // DRAGGING CONTROL POINT
    // --------------------
    else if (d.type === "control") {
      const cp = controlPointsRef.current[d.index];
      cp.c.copy(p);
      cp.sphere.position.copy(p);
    }

    // Rebuild tube after dragging
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
