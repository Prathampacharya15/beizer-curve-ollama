// DynamicQuadraticBezier.jsx
import React, { useRef, useEffect, useState } from "react";
import * as THREE from "three";
import gsap from "gsap";



export default function DynamicQuadraticBezier() {
  const mountRef = useRef(null);

  // UI state


  const [isDrawing, setIsDrawing] = useState(true);
  const [lineColor, setLineColor] = useState("#00ff00");
  const [lineWidth, setLineWidth] = useState(0.02);
  const [animType, setAnimType] = useState("disappear-start-to-end");
  const [shapeAnimType, setShapeAnimType] = useState("left-to-right"); // New state for shape animations
  const [timeLine, setTimeLine] = useState(3); // numeric, default 3s

  // internal refs
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const raycasterRef = useRef(null);
  const activeColorRef = useRef(lineColor);
  const activeWidthRef = useRef(lineWidth);
  const mouseRef = useRef(new THREE.Vector2());

  const anchorPointsRef = useRef([]); // THREE.Vector3[]
  const anchorMeshesRef = useRef([]); // Meshes for anchors
  const controlPointsRef = useRef([]); // { c: Vector3, sphere: Mesh|null, manual: bool } length = anchors-1
  const tubeRef = useRef(null); // Mesh
  const tubeMaterialRef = useRef(null);

  const draggingRef = useRef({ active: false, type: null, index: -1, object: null });

  // NEW: ref mirror of isDrawing so event handlers always see latest value
  const isDrawingRef = useRef(true);

  // NEW: which sphere is selected (for delete)
  const selectedRef = useRef(null);

  // create shader material for tube
  const createTubeMaterial = (colorHex) => {
    const color = new THREE.Color(colorHex);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: color },
        uProgress: { value: 1.0 }, // 0..1 visible portion
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
          // vUv.x goes 0..1 along the length of the tube geometry
          if (vUv.x > uProgress) discard;
          gl_FragColor = vec4(uColor, uOpacity);
        }
      `,
      transparent: true,
      depthTest: true,
      depthWrite: false,
    });
    return mat;
  };

  // helper: create sphere mesh (not added to scene here)
  const makeSphere = (pos, hexColor = 0x4444ff, radius = 0.16) => {
    const geo = new THREE.SphereGeometry(radius, 16, 16);
    const mat = new THREE.MeshBasicMaterial({ color: hexColor });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    return mesh;
  };

  // compute default control points between anchors (unless manual)
  const computeControlPoints = (updateExisting = false) => {
    const anchors = anchorPointsRef.current;
    const n = anchors.length;
    const cps = controlPointsRef.current;
    const scene = sceneRef.current;

    // If no or single anchor -> remove all control spheres and reset
    if (n < 2) {
      cps.forEach((cobj) => {
        if (cobj && cobj.sphere && scene) {
          scene.remove(cobj.sphere);
          if (cobj.sphere.geometry) cobj.sphere.geometry.dispose();
          if (cobj.sphere.material) cobj.sphere.material.dispose();
        }
      });
      controlPointsRef.current = [];
      return;
    }

    // If cps has extra entries beyond n-1, remove their spheres
    for (let i = n - 1; i < cps.length; i++) {
      const cobj = cps[i];
      if (cobj && cobj.sphere && scene) {
        scene.remove(cobj.sphere);
        if (cobj.sphere.geometry) cobj.sphere.geometry.dispose();
        if (cobj.sphere.material) cobj.sphere.material.dispose();
      }
    }

    // ensure length = n-1
    for (let i = 0; i < n - 1; i++) {
      const p0 = anchors[i];
      const p1 = anchors[i + 1];
      const midpoint = new THREE.Vector3().addVectors(p0, p1).multiplyScalar(0.5);
      const dir = new THREE.Vector3().subVectors(p1, p0);
      // offset magnitude relative to distance (so small segments produce small offsets)
      const offsetMag = Math.max(0.4, dir.length() * 0.25);
      const offset = new THREE.Vector3(-dir.y, dir.x, 0).normalize().multiplyScalar(offsetMag);
      const c = new THREE.Vector3().addVectors(midpoint, offset);

      if (updateExisting && cps[i]) {
        if (!cps[i].manual) {
          cps[i].c.copy(c);
        }
      } else {
        cps[i] = { c, sphere: cps[i]?.sphere || null, manual: cps[i]?.manual || false };
      }
    }
    cps.length = n - 1;
  };

  // sample full path by concatenating quadratic curves
  const samplePathPoints = (anchors, controls, perSegment = 80) => {
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

  // create/update tube mesh from sampled path using TubeGeometry via CatmullRom of sampled points
  const rebuildTube = (radius = lineWidth, colorHex = lineColor) => {
    const scene = sceneRef.current;
    if (!scene) return;
    // remove old tube
    if (tubeRef.current) {
      if (tubeRef.current.geometry) tubeRef.current.geometry.dispose();
      if (tubeRef.current.material) tubeRef.current.material.dispose();
      scene.remove(tubeRef.current);
      tubeRef.current = null;
      tubeMaterialRef.current = null;
    }

    if (anchorPointsRef.current.length < 2) return;

    const sampled = samplePathPoints(anchorPointsRef.current, controlPointsRef.current, 150);
    if (sampled.length < 2) return;

    // use CatmullRom from sampled points to produce smooth TubeGeometry input
    const path = new THREE.CatmullRomCurve3(sampled, false, "centripetal", 0.5);
    const tubularSegments = Math.max(8, sampled.length - 1);
    const geometry = new THREE.TubeGeometry(path, tubularSegments * 2, radius, 32, false);

    const material = createTubeMaterial(colorHex);
    tubeMaterialRef.current = material;

    const mesh = new THREE.Mesh(geometry, material);
    tubeRef.current = mesh;
    scene.add(mesh);
  };

  // create or update anchor & control spheres in the scene
  const refreshSpheres = () => {
    const scene = sceneRef.current;
    if (!scene) return;

    // remove existing anchor meshes from scene and dispose
    anchorMeshesRef.current.forEach((m) => {
      scene.remove(m);
      if (m.geometry) m.geometry.dispose();
      if (m.material) m.material.dispose();
    });
    anchorMeshesRef.current = [];

    // add anchors
    anchorPointsRef.current.forEach((p, i) => {
      const mesh = makeSphere(p, 0x2196f3, 0.16); // blue
      mesh.userData = { type: "anchor", index: i };
      scene.add(mesh);
      anchorMeshesRef.current.push(mesh);
    });

    // ensure control spheres exist or update them
    controlPointsRef.current.forEach((cobj, i) => {
      if (!cobj.sphere) {
        const mesh = makeSphere(cobj.c, 0xff5252, 0.14); // red
        mesh.userData = { type: "control", index: i };
        scene.add(mesh);
        cobj.sphere = mesh;
      } else {
        cobj.sphere.position.copy(cobj.c);
        cobj.sphere.userData = { type: "control", index: i };
      }
    });
  };

  // full redraw
  const redrawAll = (radius = lineWidth, colorHex = lineColor) => {
    computeControlPoints(true);
    rebuildTube(radius, colorHex);
    refreshSpheres();
  };

  // hide spheres (used during animations)
  const hideSpheres = () => {
    anchorMeshesRef.current.forEach((m) => (m.visible = false));
    controlPointsRef.current.forEach((c) => {
      if (c.sphere) c.sphere.visible = false;
    });
  };

  const showSpheres = () => {
    anchorMeshesRef.current.forEach((m) => (m.visible = true));
    controlPointsRef.current.forEach((c) => {
      if (c.sphere) c.sphere.visible = true;
    });
  };

  // animations
  const animateDisappear = ({ duration = timeLine, direction = "start-to-end" } = {}) => {
    if (!tubeRef.current || !tubeMaterialRef.current) return;
    hideSpheres();

    const mat = tubeMaterialRef.current;
    const from = direction === "start-to-end" ? 1.0 : 0.0;
    const to = direction === "start-to-end" ? 0.0 : 1.0;
    const obj = { p: from };

    gsap.to(obj, {
      p: to,
      duration,
      ease: "power2.inOut",
      onUpdate: () => {
        mat.uniforms.uProgress.value = obj.p;
      },
      onComplete: () => {
        // keep spheres hidden after disappear; or call showSpheres() if you want them back
      },
    });
  };

  const animateColor = ({ toColor = "#ff00ff", duration = 2.0 } = {}) => {
    if (!tubeMaterialRef.current) return;

    const start = activeColorRef.current;
    const col = new THREE.Color(start);
    const target = new THREE.Color(toColor);

    const obj = { r: col.r, g: col.g, b: col.b };

    gsap.to(obj, {
      r: target.r,
      g: target.g,
      b: target.b,
      duration,
      ease: "power1.inOut",
      onUpdate: () => {
        tubeMaterialRef.current.uniforms.uColor.value.setRGB(obj.r, obj.g, obj.b);
      },
      onComplete: () => {
        // ✅ HARD SYNC
        activeColorRef.current = toColor;
        setLineColor(toColor); // sync React state instantly
        redrawAll(activeWidthRef.current, toColor);
      },
    });
  };


  // animate width change by rebuilding geometry at intermediate widths
  const animateWidth = ({ toWidth = 0.04, duration = 2.0 } = {}) => {
    const start = activeWidthRef.current;
    const obj = { t: 0 };

    gsap.to(obj, {
      t: 1,
      duration,
      ease: "power1.inOut",
      onUpdate: () => {
        const val = start + (toWidth - start) * obj.t;
        activeWidthRef.current = val; // ✅ live sync
        rebuildTube(val, activeColorRef.current);
      },
      onComplete: () => {
        // ✅ HARD SYNC on finish
        activeWidthRef.current = toWidth;
        setLineWidth(toWidth);
        redrawAll(toWidth, activeColorRef.current);
      },
    });
  };


  const animatePulse = ({ duration = 1.0, times = 3 } = {}) => {
    if (!tubeMaterialRef.current) return;
    const mat = tubeMaterialRef.current;
    gsap.fromTo(
      mat.uniforms.uOpacity,
      { value: 0.2 },
      {
        value: 1.0,
        duration,
        repeat: times - 1,
        yoyo: true,
        ease: "sine.inOut",
      }
    );
  };

  // Shape reveal animation wrapper
  const animateShapeReveal = ({ direction = "left-to-right", duration = timeLine } = {}) => {
    if (!tubeRef.current || !tubeMaterialRef.current) return;

    hideSpheres();

    const mat = tubeMaterialRef.current;
    let axis = 0; // 0 = X, 1 = Y
    let dir = 1;  // 1 = positive, -1 = negative

    switch (direction) {
      case "left-to-right":
        axis = 0;
        dir = 1;
        break;
      case "right-to-left":
        axis = 0;
        dir = -1;
        break;
      case "top-to-bottom":
        axis = 1;
        dir = -1;
        break;
      case "bottom-to-top":
        axis = 1;
        dir = 1;
        break;
      default:
        axis = 0;
        dir = 1;
    }

    // Set world-space reveal mode
    mat.uniforms.uRevealMode.value = 1;
    mat.uniforms.uRevealAxis.value = axis;
    mat.uniforms.uRevealDirection.value = dir;

    const obj = { p: 0.0 };

    gsap.to(obj, {
      p: 1.0,
      duration,
      ease: "power2.inOut",
      onUpdate: () => {
        mat.uniforms.uProgress.value = obj.p;
      },
      onComplete: () => {
        // Reset to path-based mode for other animations
        mat.uniforms.uRevealMode.value = 0;
        hideSpheres();
      }
    });
  };

  const runShapeAnimation = () => {
    animateShapeReveal({ direction: shapeAnimType, duration: timeLine });
  };

  const runSelectedAnimation = () => {
    switch (animType) {
      case "disappear-start-to-end":
        animateDisappear({ duration: timeLine, direction: "start-to-end" });
        break;
      case "disappear-end-to-start":
        animateDisappear({ duration: timeLine, direction: "end-to-start" });
        break;
      case "color-change":
        animateColor({ toColor: "#ff6b6b", duration: 2.2 });
        break;
      case "width-change":
        animateWidth({ toWidth: Math.max(0.02, lineWidth * 0.25), duration: 2.0 });
        break;
      case "pulse":
        animatePulse({ duration: 0.9, times: 4 });
        break;
      default:
        animateDisappear({ duration: timeLine, direction: "start-to-end" });
    }
  };

  // initialization — run once
  useEffect(() => {
    // scene / camera / renderer
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

    // append canvas
    mountRef.current.appendChild(renderer.domElement);

    // raycaster
    raycasterRef.current = new THREE.Raycaster();

    // initial empty arrays
    anchorPointsRef.current = [];
    controlPointsRef.current = [];
    anchorMeshesRef.current = [];

    const getPointerPlaneIntersection = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);

      const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
      const intersection = new THREE.Vector3();
      raycasterRef.current.ray.intersectPlane(plane, intersection);
      return intersection;
    };

    const onPointerDown = (event) => {
      if (!rendererRef.current) return;
      event.preventDefault();
      const rect = rendererRef.current.domElement.getBoundingClientRect();
      const px = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const py = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      mouseRef.current.set(px, py);
      raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);

      // collect clickable meshes
      const clickable = [
        ...anchorMeshesRef.current,
        ...controlPointsRef.current
          .map((c) => (c.sphere ? c.sphere : null))
          .filter(Boolean),
      ];

      const intersects = raycasterRef.current.intersectObjects(clickable, false);

      if (intersects.length > 0) {
        // pick top-most
        const picked = intersects[0].object;
        const ud = picked.userData;
        draggingRef.current = {
          active: true,
          type: ud.type,
          index: ud.index,
          object: picked,
        };

        // mark selected
        selectedRef.current = { type: ud.type, index: ud.index };

        // If dragging a control, mark it manual
        if (ud.type === "control") {
          controlPointsRef.current[ud.index].manual = true;
        }
        return;
      }

      // If nothing clicked and drawing enabled -> add anchor point
      if (isDrawingRef.current) {
        const ip = getPointerPlaneIntersection(event);
        anchorPointsRef.current.push(ip.clone());
        computeControlPoints(true);
        redrawAll(lineWidth, lineColor);
      }
    };

    const onPointerMove = (event) => {
      if (!draggingRef.current.active) return;
      event.preventDefault();
      const intersection = getPointerPlaneIntersection(event);
      const d = draggingRef.current;
      if (d.type === "anchor") {
        // update anchor position and adjust neighboring control points if not manual
        anchorPointsRef.current[d.index].copy(intersection);

        // update control for segment d.index -1 (left) and d.index (right)
        if (d.index - 1 >= 0) {
          // left segment control index = d.index - 1
          if (
            controlPointsRef.current[d.index - 1] &&
            !controlPointsRef.current[d.index - 1].manual
          ) {
            // recompute control for segment [d.index-1]
            const p0 = anchorPointsRef.current[d.index - 1];
            const p1 = anchorPointsRef.current[d.index];
            const midpoint = new THREE.Vector3()
              .addVectors(p0, p1)
              .multiplyScalar(0.5);
            const dir = new THREE.Vector3().subVectors(p1, p0);
            const offsetMag = Math.max(0.4, dir.length() * 0.25);
            const offset = new THREE.Vector3(-dir.y, dir.x, 0)
              .normalize()
              .multiplyScalar(offsetMag);
            controlPointsRef.current[d.index - 1].c.copy(midpoint.add(offset));
            if (controlPointsRef.current[d.index - 1].sphere)
              controlPointsRef.current[d.index - 1].sphere.position.copy(
                controlPointsRef.current[d.index - 1].c
              );
          }
        }
        if (d.index < anchorPointsRef.current.length - 1) {
          // right segment control index = d.index
          if (
            controlPointsRef.current[d.index] &&
            !controlPointsRef.current[d.index].manual
          ) {
            const p0 = anchorPointsRef.current[d.index];
            const p1 = anchorPointsRef.current[d.index + 1];
            const midpoint = new THREE.Vector3()
              .addVectors(p0, p1)
              .multiplyScalar(0.5);
            const dir = new THREE.Vector3().subVectors(p1, p0);
            const offsetMag = Math.max(0.4, dir.length() * 0.25);
            const offset = new THREE.Vector3(-dir.y, dir.x, 0)
              .normalize()
              .multiplyScalar(offsetMag);
            controlPointsRef.current[d.index].c.copy(midpoint.add(offset));
            if (controlPointsRef.current[d.index].sphere)
              controlPointsRef.current[d.index].sphere.position.copy(
                controlPointsRef.current[d.index].c
              );
          }
        }
      } else if (d.type === "control") {
        // move control point and mark manual (already done on down)
        controlPointsRef.current[d.index].c.copy(intersection);
        if (controlPointsRef.current[d.index].sphere)
          controlPointsRef.current[d.index].sphere.position.copy(intersection);
      }

      // rebuild tube (live)
      rebuildTube(activeWidthRef.current, activeColorRef.current);

      // update anchor meshes positions live
      anchorMeshesRef.current.forEach((m, i) =>
        m.position.copy(anchorPointsRef.current[i])
      );
    };

    const onPointerUp = () => {
      if (draggingRef.current.active) {
        draggingRef.current = {
          active: false,
          type: null,
          index: -1,
          object: null,
        };
      }
    };

    // NEW: handle Delete key to delete selected anchor
    const onKeyDown = (e) => {
      if (e.key === "Delete" && selectedRef.current) {
        const { type, index } = selectedRef.current;

        if (type === "anchor") {
          // remove the selected anchor point
          anchorPointsRef.current.splice(index, 1);
          // After modifying anchors, recompute and redraw
          computeControlPoints(true);
          redrawAll(lineWidth, lineColor);
        }
        // if selected control point, we could reset it to auto
        if (type === "control") {
          if (controlPointsRef.current[index]) {
            controlPointsRef.current[index].manual = false;
            computeControlPoints(true);
            redrawAll(lineWidth, lineColor);
          }
        }

        selectedRef.current = null;
      }
    };

    rendererRef.current.domElement.addEventListener(
      "pointerdown",
      onPointerDown
    );
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("keydown", onKeyDown);

    // handle resize
    const onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    // render loop
    let raf = null;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    // cleanup
    return () => {
      cancelAnimationFrame(raf);
      if (rendererRef.current?.domElement) {
        rendererRef.current.domElement.removeEventListener(
          "pointerdown",
          onPointerDown
        );
      }
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);

      // dispose meshes
      if (tubeRef.current) {
        if (tubeRef.current.geometry) tubeRef.current.geometry.dispose();
        if (tubeRef.current.material) tubeRef.current.material.dispose();
        scene.remove(tubeRef.current);
      }
      anchorMeshesRef.current.forEach((m) => {
        if (m.geometry) m.geometry.dispose();
        if (m.material) m.material.dispose();
        scene.remove(m);
      });
      controlPointsRef.current.forEach((c) => {
        if (c && c.sphere) {
          if (c.sphere.geometry) c.sphere.geometry.dispose();
          if (c.sphere.material) c.sphere.material.dispose();
          scene.remove(c.sphere);
        }
      });
      if (rendererRef.current) {
        if (mountRef.current?.contains(rendererRef.current.domElement)) {
          mountRef.current.removeChild(rendererRef.current.domElement);
        }
        rendererRef.current.dispose();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once

  // keep tube in sync when color or width state changes via UI
  useEffect(() => {
    activeColorRef.current = lineColor;
    redrawAll(activeWidthRef.current, lineColor);
  }, [lineColor]);

  useEffect(() => {
    activeWidthRef.current = lineWidth;
    redrawAll(lineWidth, activeColorRef.current);
  }, [lineWidth]);


  // helpers exposed to UI
  const startDrawing = () => {
    setIsDrawing(true);
    isDrawingRef.current = true;
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    isDrawingRef.current = false;
  };

  const clearAll = () => {
    const scene = sceneRef.current;
    if (!scene) return;

    // remove anchors
    anchorPointsRef.current = [];
    anchorMeshesRef.current.forEach((m) => {
      if (m.geometry) m.geometry.dispose();
      if (m.material) m.material.dispose();
      scene.remove(m);
    });
    anchorMeshesRef.current = [];

    // remove controls
    controlPointsRef.current.forEach((c) => {
      if (c.sphere) {
        if (c.sphere.geometry) c.sphere.geometry.dispose();
        if (c.sphere.material) c.sphere.material.dispose();
        scene.remove(c.sphere);
      }
    });
    controlPointsRef.current = [];

    // remove tube
    if (tubeRef.current) {
      if (tubeRef.current.geometry) tubeRef.current.geometry.dispose();
      if (tubeRef.current.material) tubeRef.current.material.dispose();
      scene.remove(tubeRef.current);
      tubeRef.current = null;
      tubeMaterialRef.current = null;
    }

    selectedRef.current = null;
  };

  // Delete selected (from UI button)
  const deleteSelected = () => {
    if (!selectedRef.current) return;
    const { type, index } = selectedRef.current;

    if (type === "anchor") {
      anchorPointsRef.current.splice(index, 1);
      computeControlPoints(true);
      redrawAll(lineWidth, lineColor);
    } else if (type === "control") {
      if (controlPointsRef.current[index]) {
        controlPointsRef.current[index].manual = false;
        computeControlPoints(true);
        redrawAll(lineWidth, lineColor);
      }
    }

    selectedRef.current = null;
  };

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: 20,
          top: 20,
          zIndex: 10,
          width: 320,
          background: "rgba(20,20,25,0.75)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          padding: 16,
          borderRadius: 16,
          color: "white",
          fontFamily: "Inter, system-ui, sans-serif",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          boxShadow: "0 10px 40px rgba(0,0,0,0.4)",
          border: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 18, letterSpacing: 0.5 }}>
          Bezier Line Editor
        </div>

        {/* DRAW MODE */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={startDrawing}
            style={{
              flex: 1,
              padding: "8px 12px",
              borderRadius: 10,
              border: "none",
              background: isDrawing ? "#2ecc71" : "#2a2a2a",
              color: "white",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Start
          </button>
          <button
            onClick={stopDrawing}
            style={{
              flex: 1,
              padding: "8px 12px",
              borderRadius: 10,
              border: "none",
              background: !isDrawing ? "#e74c3c" : "#2a2a2a",
              color: "white",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Stop
          </button>
        </div>

        {/* COLOR + WIDTH */}
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>

            <input
              type="color"
              value={lineColor}
              onChange={(e) => setLineColor(e.target.value)}
              style={{ width: 34, height: 28, border: "none" }}
            />
          </label>

          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              Width: {lineWidth.toFixed(2)}
            </div>
            <input
              type="range"
              min="0.02"
              max="0.5"
              step="0.01"
              value={lineWidth}
              onChange={(e) => setLineWidth(parseFloat(e.target.value))}
              style={{ width: "100%" }}
            />
          </div>
        </div>

        {/* ANIMATION */}
        <div style={{ fontWeight: 600 }}>Animation</div>

        <select
          value={animType}
          onChange={(e) => setAnimType(e.target.value)}
          style={{
            background: "#1f1f1f",
            color: "white",
            border: "1px solid #333",
            padding: "8px 10px",
            borderRadius: 10,
          }}
        >
          <option value="disappear-start-to-end">Disappear start to end</option>
          <option value="disappear-end-to-start">Disappear end to start</option>
          <option value="color-change">Color</option>
          <option value="width-change">Width</option>
          <option value="pulse">Pulse</option>
        </select>

        {/* SHAPE ANIMATION */}
        <div style={{ fontWeight: 600, marginTop: 8 }}>Shape Reveal</div>

        <select
          value={shapeAnimType}
          onChange={(e) => setShapeAnimType(e.target.value)}
          style={{
            background: "#1f1f1f",
            color: "white",
            border: "1px solid #333",
            padding: "8px 10px",
            borderRadius: 10,
          }}
        >
          <option value="left-to-right">Left → Right</option>
          <option value="right-to-left">Right → Left</option>
          <option value="top-to-bottom">Top → Bottom</option>
          <option value="bottom-to-top">Bottom → Top</option>
        </select>

        {/* TIMELINE */}
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 12,
              opacity: 0.7,
            }}
          >
            <span>Timeline</span>
            <span>{timeLine}s</span>
          </div>
          <input
            type="range"
            min="1"
            max="20"
            step="1"
            value={timeLine}
            onChange={(e) => setTimeLine(Number(e.target.value))}
            style={{ width: "100%" }}
          />
        </div>


        {/* ACTIONS */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button
            onClick={runSelectedAnimation}
            style={{
              padding: "10px",
              borderRadius: 10,
              border: "none",
              background: "linear-gradient(135deg, #00c853, #64dd17)",
              color: "black",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Line Anim
          </button>

          <button
            onClick={runShapeAnimation}
            style={{
              padding: "10px",
              borderRadius: 10,
              border: "none",
              background: "linear-gradient(135deg, #2196f3, #00bcd4)",
              color: "white",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Shape Reveal
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
          <button
            onClick={clearAll}
            style={{
              padding: "10px",
              borderRadius: 10,
              border: "none",
              background: "#b71c1c",
              color: "white",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Clear
          </button>
        </div>

        {/* SPHERES */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button
            onClick={showSpheres}
            style={{
              padding: "8px",
              borderRadius: 10,
              border: "none",
              background: "#2a2a2a",
              color: "white",
              cursor: "pointer",
            }}
          >
            Show Points
          </button>

          <button
            onClick={hideSpheres}
            style={{
              padding: "8px",
              borderRadius: 10,
              border: "none",
              background: "#2a2a2a",
              color: "white",
              cursor: "pointer",
            }}
          >
            Hide Points
          </button>
        </div>

        {/* DELETE */}
        <button
          onClick={deleteSelected}
          style={{
            padding: "10px",
            borderRadius: 10,
            border: "none",
            background: "linear-gradient(135deg,#ff5252,#ff1744)",
            color: "white",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          🗑 Delete Selected
        </button>
      </div>


      <div
        ref={mountRef}
        style={{
          width: "100vw",
          height: "100vh",
          position: "absolute",
          left: 0,
          top: 0,
        }}
      />
    </>
  );
}
