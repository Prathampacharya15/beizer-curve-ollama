import * as THREE from "three";

const SCENE_LIMIT = 6; // clamp bounds

const clamp = (v) => Math.max(-SCENE_LIMIT, Math.min(SCENE_LIMIT, v));

export function executeAICommands({
  commands,
  anchorPointsRef,
  controlPointsRef,
  computeControlPoints,
  rebuildTube,
  redrawAll,
  sceneRef,
  tubeRef,
  tubeMaterialRef,
  activeWidthRef,
  activeColorRef,
  anchorMeshesRef,
}) {
  let geometryChanged = false;

  commands.forEach((cmd) => {
    switch (cmd.type) {

      /* ---------------- CREATE ---------------- */
      case "create": {
        anchorPointsRef.current = cmd.points.map(
          ([x, y]) => new THREE.Vector3(clamp(x), clamp(y), 0)
        );
        geometryChanged = true;
        break;
      }

      /* ---------------- MOVE ---------------- */
      case "move": {
        const idx = cmd.index - 1;
        const p = anchorPointsRef.current[idx];
        if (!p) return;

        p.set(clamp(cmd.to[0]), clamp(cmd.to[1]), p.z);
        geometryChanged = true;
        break;
      }

      /* ---------------- INSERT ---------------- */
      case "insert": {
        const i = cmd.after;
        if (!anchorPointsRef.current[i]) return;

        const p = new THREE.Vector3(
          clamp(cmd.at[0]),
          clamp(cmd.at[1]),
          0
        );

        anchorPointsRef.current.splice(i, 0, p);
        geometryChanged = true;
        break;
      }

      /* ---------------- DELETE ---------------- */
      case "delete": {
        const idx = cmd.index - 1;
        if (anchorPointsRef.current.length <= 2) return;

        anchorPointsRef.current.splice(idx, 1);
        geometryChanged = true;
        break;
      }

      /* ---------------- SMOOTH ---------------- */
      case "smooth": {
        // just re-run control auto-smoothing
        geometryChanged = true;
        break;
      }
    }
  });

  if (!geometryChanged) return;

  // Use redrawAll to fully regenerate the scene visuals (anchors, lines, tube)
  redrawAll(activeWidthRef.current, activeColorRef.current);
}
