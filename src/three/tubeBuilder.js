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

export const rebuildTube = (
  sceneRef,
  anchorPointsRef,
  controlPointsRef,
  tubeRef,
  tubeMaterialRef,
  radius,
  colorHex
) => {
  const scene = sceneRef.current;
  if (!scene) return;

  if (tubeRef.current) {
    tubeRef.current.geometry.dispose();
    tubeRef.current.material.dispose();
    scene.remove(tubeRef.current);
    tubeRef.current = null;
    tubeMaterialRef.current = null;
  }

  if (anchorPointsRef.current.length < 2) return;

  const sampled = samplePathPoints(
    anchorPointsRef.current,
    controlPointsRef.current,
    300   // smoother samples
);


  const path = new THREE.CatmullRomCurve3(sampled, false, "centripetal", 0.5);
  const geometry = new THREE.TubeGeometry(
    path,
    sampled.length * 2,
    radius,
    48,           // radial segments: smoother curve
    false
);


  const material = createTubeMaterial(colorHex);
  const mesh = new THREE.Mesh(geometry, material);

  tubeRef.current = mesh;
  tubeMaterialRef.current = material;
  scene.add(mesh);
};
