import * as THREE from "three";

export const computeControlPoints = (
  anchorPointsRef,
  controlPointsRef,
  sceneRef,
  updateExisting = false
) => {
  const anchors = anchorPointsRef.current;
  const n = anchors.length;
  const cps = controlPointsRef.current;
  const scene = sceneRef.current;

  if (n < 2) {
    cps.forEach((cobj) => {
      if (cobj?.sphere && scene) {
        scene.remove(cobj.sphere);
        cobj.sphere.geometry.dispose();
        cobj.sphere.material.dispose();
      }
    });
    controlPointsRef.current = [];
    return;
  }

  for (let i = n - 1; i < cps.length; i++) {
    const cobj = cps[i];
    if (cobj?.sphere && scene) {
      scene.remove(cobj.sphere);
      cobj.sphere.geometry.dispose();
      cobj.sphere.material.dispose();
    }
  }

  for (let i = 0; i < n - 1; i++) {
    const p0 = anchors[i];
    const p1 = anchors[i + 1];
    const midpoint = new THREE.Vector3().addVectors(p0, p1).multiplyScalar(0.5);
    const dir = new THREE.Vector3().subVectors(p1, p0);
    const offsetMag = Math.max(0.4, dir.length() * 0.25);
    const offset = new THREE.Vector3(-dir.y, dir.x, 0)
      .normalize()
      .multiplyScalar(offsetMag);
    const c = new THREE.Vector3().addVectors(midpoint, offset);

    if (updateExisting && cps[i]) {
      if (!cps[i].manual) cps[i].c.copy(c);
    } else {
      cps[i] = { c, sphere: cps[i]?.sphere || null, manual: cps[i]?.manual || false };
    }
  }

  cps.length = n - 1;
};

export const samplePathPoints = (anchors, controls, perSegment = 80) => {
    const pts = [];
    if (anchors.length < 2) return pts;
    for (let i = 0; i < anchors.length - 1; i++) {
      const p0 = anchors[i].clone();
      const p1 = anchors[i + 1].clone();
      const cp = controls[i].c.clone();
      const curve = new THREE.QuadraticBezierCurve3(p0, cp, p1);
      const segmentPoints = curve.getPoints(perSegment);
      // avoid duplicate points at joints
      if (i > 0) segmentPoints.shift();
      pts.push(...segmentPoints);
    }
    return pts;
  };
