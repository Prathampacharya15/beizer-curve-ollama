import gsap from "gsap";
import * as THREE from "three";

export const animateDisappear = (tubeMaterialRef, hideSpheres, duration, direction) => {
  const mat = tubeMaterialRef.current;
  if (!mat) return;

  hideSpheres();

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
  });
};

export const animateColor = (
  tubeMaterialRef,
  activeColorRef,
  setLineColor,
  redrawAll,
  toColor,
  duration
) => {
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
      activeColorRef.current = toColor;
      setLineColor(toColor);
      redrawAll();
    },
  });
};

export const animateWidth = (
  activeWidthRef,
  setLineWidth,
  rebuildTube,
  activeColorRef,
  toWidth,
  duration
) => {
  const start = activeWidthRef.current;
  const obj = { t: 0 };

  gsap.to(obj, {
    t: 1,
    duration,
    ease: "power1.inOut",
    onUpdate: () => {
      const val = start + (toWidth - start) * obj.t;
      activeWidthRef.current = val;
      rebuildTube(val, activeColorRef.current);
    },
    onComplete: () => {
      activeWidthRef.current = toWidth;
      setLineWidth(toWidth);
      rebuildTube(toWidth, activeColorRef.current);
    },
  });
};

export const animatePulse = (tubeMaterialRef, duration, times) => {
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
