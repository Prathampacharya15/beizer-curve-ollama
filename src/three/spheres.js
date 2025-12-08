import * as THREE from "three";

export const makeSphere = (pos, hexColor = 0x4444ff, radius = 0.16) => {
  const geo = new THREE.SphereGeometry(radius, 16, 16);
  const mat = new THREE.MeshBasicMaterial({ color: hexColor });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(pos);
  return mesh;
};
