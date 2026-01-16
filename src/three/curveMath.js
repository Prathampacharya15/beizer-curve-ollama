// import * as THREE from "three";

// export const computeControlPoints = (
//   anchorPointsRef,
//   controlPointsRef,
//   sceneRef,
//   updateExisting = false
// ) => {
//   const anchors = anchorPointsRef.current;
//   const cps = controlPointsRef.current;
//   const n = anchors.length;

//   if (n < 2) {
//     controlPointsRef.current = [];
//     return;
//   }

//   const smoothFactor = 0.35; // controls curvature strength

//   for (let i = 0; i < n - 1; i++) {
//     const A = anchors[i];
//     const B = anchors[i + 1];

//     // tangent direction at A
//     let tangentA = new THREE.Vector3();
//     if (i === 0) tangentA.subVectors(anchors[i + 1], anchors[i]);
//     else tangentA.subVectors(anchors[i + 1], anchors[i - 1]);
//     tangentA.normalize();

//     // tangent direction at B
//     let tangentB = new THREE.Vector3();
//     if (i === n - 2) tangentB.subVectors(anchors[i + 1], anchors[i]);
//     else tangentB.subVectors(anchors[i + 2], anchors[i]);
//     tangentB.normalize();

//     const cp1Pos = A.clone().addScaledVector(tangentA, smoothFactor);
//     const cp2Pos = B.clone().addScaledVector(tangentB, -smoothFactor);

//     if (!cps[i]) cps[i] = {};
//     if (!cps[i].cp1) cps[i].cp1 = { pos: new THREE.Vector3(), manual: false };
//     if (!cps[i].cp2) cps[i].cp2 = { pos: new THREE.Vector3(), manual: false };

//     if (!updateExisting || !cps[i].cp1.manual)
//       cps[i].cp1.pos.copy(cp1Pos);

//     if (!updateExisting || !cps[i].cp2.manual)
//       cps[i].cp2.pos.copy(cp2Pos);
//   }

//   cps.length = n - 1;
// };


// export const samplePathPoints = (anchors, controls, perSegment = 100) => {
//   const pts = [];
//   if (anchors.length < 2) return pts;

//   for (let i = 0; i < anchors.length - 1; i++) {
//     const A = anchors[i].clone();
//     const B = anchors[i + 1].clone();

//     const cp1 = controls[i].cp1.pos.clone();
//     const cp2 = controls[i].cp2.pos.clone();

//     const curve = new THREE.CubicBezierCurve3(A, cp1, cp2, B);

//     const segPts = curve.getPoints(perSegment);
//     if (i > 0) segPts.shift();

//     pts.push(...segPts);
//   }

//   return pts;
// };




import * as THREE from "three";

/**
 * CUBIC BEZIER CONTROL POINT GENERATOR
 * One segment = two handles (cp1, cp2)
 */
export const computeControlPoints = (
  anchorPointsRef,
  controlPointsRef,
  sceneRef,
  updateExisting = false,
  isClosed = false
) => {
  const anchors = anchorPointsRef.current;
  const cps = controlPointsRef.current;
  const n = anchors.length;

  if (n < 2) {
    controlPointsRef.current = [];
    return;
  }

  const smoothFactor = 0.35;
  const numSegments = isClosed ? n : n - 1;

  for (let i = 0; i < numSegments; i++) {
    const A = anchors[i];
    const B = anchors[(i + 1) % n];

    // Tangents
    let tanA, tanB;

    if (isClosed && n > 2) {
      // Prev anchor with wrap-around
      const prevA = anchors[(i - 1 + n) % n];
      const nextA = anchors[(i + 1) % n];
      tanA = nextA.clone().sub(prevA);
      if (tanA.lengthSq() < 0.00001) tanA.copy(B).sub(A);
      tanA.normalize();

      // Next anchor with wrap-around
      const nextB = anchors[(i + 2) % n];
      const prevB = anchors[i];
      tanB = nextB.clone().sub(prevB);
      if (tanB.lengthSq() < 0.00001) tanB.copy(B).sub(A);
      tanB.normalize();
    } else {
      tanA = (i === 0)
        ? B.clone().sub(A)
        : anchors[i + 1].clone().sub(anchors[i - 1]);

      tanB = (i === n - 2)
        ? B.clone().sub(A)
        : (anchors[i + 2] ? anchors[i + 2].clone().sub(A) : B.clone().sub(A));

      tanA.normalize();
      tanB.normalize();
    }

    const cp1Pos = A.clone().addScaledVector(tanA, smoothFactor);
    const cp2Pos = B.clone().addScaledVector(tanB, -smoothFactor);

    // ---------- SAFE INIT ----------
    if (!cps[i]) {
      cps[i] = {
        cp1: { pos: new THREE.Vector3(), manual: false, sphere: null },
        cp2: { pos: new THREE.Vector3(), manual: false, sphere: null },
      };
    }

    if (!updateExisting || !cps[i].cp1.manual) {
      cps[i].cp1.pos.copy(cp1Pos);
    }

    if (!updateExisting || !cps[i].cp2.manual) {
      cps[i].cp2.pos.copy(cp2Pos);
    }
  }

  // Truncate if we have too many
  if (cps.length > numSegments) {
    cps.length = numSegments;
  }
};

/**
 * SAMPLE POINTS ALONG CUBIC PATH
 */
export const samplePathPoints = (anchors, controls, perSegment = 100) => {
  const pts = [];
  if (anchors.length < 2) return pts;

  // Sample all available control segments
  // For closed shapes, controls.length === anchors.length
  // For open shapes, controls.length === anchors.length - 1
  const numSegments = Math.min(controls.length, anchors.length);

  for (let i = 0; i < numSegments; i++) {
    const A = anchors[i];
    const B = anchors[(i + 1) % anchors.length]; // Wrap around for closed shapes

    const curve = new THREE.CubicBezierCurve3(
      A,
      controls[i].cp1.pos,
      controls[i].cp2.pos,
      B
    );

    const seg = curve.getPoints(perSegment);
    if (i > 0) seg.shift(); // Remove duplicate point except for first segment
    pts.push(...seg);
  }

  return pts;
};
