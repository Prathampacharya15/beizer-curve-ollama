import * as THREE from "three";
import { samplePathPoints } from "./curveMath";

export const createTubeMaterial = (colorHex) => {
  const color = new THREE.Color(colorHex);
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: color },
      uProgress: { value: 1.0 },
      uOpacity: { value: 1.0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main(){
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uProgress;
      uniform float uOpacity;
      varying vec2 vUv;
      void main(){
        if (vUv.x > uProgress) discard;
        gl_FragColor = vec4(uColor, uOpacity);
      }
    `,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  });
};


// ----------------------------------------------------
// 🎯 Smooth Curve Class — FIXES ALL KINKS
// ----------------------------------------------------
class SmoothSampledCurve extends THREE.Curve {
  constructor(points) {
    super();
    this.points = points;

    // Precompute smoothed tangents
    this.tangents = [];

    for (let i = 0; i < points.length; i++) {
      const prev = points[Math.max(i - 1, 0)];
      const next = points[Math.min(i + 1, points.length - 1)];

      const t = new THREE.Vector3().subVectors(next, prev).normalize();
      this.tangents.push(t);
    }
  }

  getPoint(t) {
    const idx = t * (this.points.length - 1);
    const i = Math.floor(idx);
    const frac = idx - i;

    const p0 = this.points[i];
    const p1 = this.points[i + 1] || p0;

    return new THREE.Vector3().lerpVectors(p0, p1, frac);
  }

  // 🔥 CRITICAL — Smooth tangent for TubeGeometry
  getTangent(t) {
    const idx = t * (this.tangents.length - 1);
    const i = Math.floor(idx);
    const frac = idx - i;

    const t0 = this.tangents[i];
    const t1 = this.tangents[i + 1] || t0;

    return new THREE.Vector3().lerpVectors(t0, t1, frac).normalize();
  }
}



// ----------------------------------------------------
// 🎯 REBUILD TUBE — with kink-free smooth normals
// ----------------------------------------------------
export const rebuildTube = (
  sceneRef,
  anchorPointsRef,
  controlPointsRef,
  tubeRef,
  tubeMaterialRef,
  radius,
  colorHex,
  closed = false
) => {
  const scene = sceneRef.current;
  if (!scene) return;

  // Remove old tube
  if (tubeRef.current) {
    tubeRef.current.geometry.dispose();
    tubeRef.current.material.dispose();
    scene.remove(tubeRef.current);
    tubeRef.current = null;
    tubeMaterialRef.current = null;
  }

  if (anchorPointsRef.current.length < 2) return;

  // Sample cubic Bézier points
  const sampled = samplePathPoints(
    anchorPointsRef.current,
    controlPointsRef.current,
    300
  );

  if (sampled.length < 2) return;

  // Use smooth curve (fixes kinks)
  const curve = new SmoothSampledCurve(sampled);

  // Tube resolution
  const tubularSegments = Math.min(6000, sampled.length * 3);

  const geometry = new THREE.TubeGeometry(
    curve,
    tubularSegments,
    radius,
    64,      // more radial segments = smoother curvature
    closed
  );

  const material = createTubeMaterial(colorHex);
  const mesh = new THREE.Mesh(geometry, material);

  tubeRef.current = mesh;
  tubeMaterialRef.current = material;
  scene.add(mesh);
};
