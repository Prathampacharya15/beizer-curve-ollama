import * as THREE from "three";
import { samplePathPoints } from "./curveMath";

export const createTubeMaterial = (colorHex) => {
  const color = new THREE.Color(colorHex);
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: color },
      uProgress: { value: 1.0 },
      uOpacity: { value: 1.0 },
      // New uniforms for world-space reveal
      uRevealMode: { value: 0 }, // 0 = path-based, 1 = world-space
      uRevealAxis: { value: 0 }, // 0 = X-axis, 1 = Y-axis
      uRevealDirection: { value: 1 }, // 1 = positive, -1 = negative
      uBoundsMin: { value: new THREE.Vector2(-10, -10) },
      uBoundsMax: { value: new THREE.Vector2(10, 10) },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      void main(){
        vUv = uv;
        // Pass world position to fragment shader
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uProgress;
      uniform float uOpacity;
      uniform int uRevealMode;
      uniform int uRevealAxis;
      uniform float uRevealDirection;
      uniform vec2 uBoundsMin;
      uniform vec2 uBoundsMax;
      
      varying vec2 vUv;
      varying vec3 vWorldPos;
      
      void main(){
        float revealValue;
        
        if (uRevealMode == 1) {
          // World-space directional reveal
          float coord = uRevealAxis == 0 ? vWorldPos.x : vWorldPos.y;
          float minBound = uRevealAxis == 0 ? uBoundsMin.x : uBoundsMin.y;
          float maxBound = uRevealAxis == 0 ? uBoundsMax.x : uBoundsMax.y;
          
          // Normalize coordinate to 0-1 range
          float normalized = (coord - minBound) / (maxBound - minBound);
          
          // Apply direction
          if (uRevealDirection < 0.0) {
            normalized = 1.0 - normalized;
          }
          
          revealValue = normalized;
        } else {
          // Path-based reveal (original behavior)
          revealValue = vUv.x;
        }
        
        if (revealValue > uProgress) discard;
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

  // Compute bounding box for world-space reveal animations
  geometry.computeBoundingBox();
  const bbox = geometry.boundingBox;

  // Update material uniforms with bounding box
  material.uniforms.uBoundsMin.value.set(bbox.min.x, bbox.min.y);
  material.uniforms.uBoundsMax.value.set(bbox.max.x, bbox.max.y);

  tubeRef.current = mesh;
  tubeMaterialRef.current = material;
  scene.add(mesh);
};
