import * as THREE from "three";

export const setupScene = ({
  mountRef,
  sceneRef,
  cameraRef,
  rendererRef,
  raycasterRef,
}) => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x121212);
  sceneRef.current = scene;

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(0, 0, 12);
  cameraRef.current = camera;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  rendererRef.current = renderer;

  mountRef.current.appendChild(renderer.domElement);

  raycasterRef.current = new THREE.Raycaster();

  return { scene, camera, renderer };
};
