export const attachKeyboardHandlers = ({
  selectedRef,
  anchorPointsRef,
  controlPointsRef,
  computeControlPoints,
  redrawAll,
  activeWidthRef,
  activeColorRef,
}) => {
  const onKeyDown = (e) => {
    if (e.key !== "Delete") return;
    if (!selectedRef.current) return;

    const sel = selectedRef.current;

    // -------------------------
    // DELETE ANCHOR
    // -------------------------
    if (sel.type === "anchor") {
      anchorPointsRef.current.splice(sel.index, 1);
    }

    // -------------------------
    // RESET SINGLE CONTROL POINT (cp1 or cp2)
    // -------------------------
    if (sel.type === "control") {
      const seg = controlPointsRef.current[sel.segment];
      if (seg && seg[sel.which]) {
        seg[sel.which].manual = false;   // reset manual state
      }
    }

    // Recompute and redraw cubic curve
    computeControlPoints(anchorPointsRef, controlPointsRef, null, true);
    redrawAll(activeWidthRef.current, activeColorRef.current);

    selectedRef.current = null;
  };

  window.addEventListener("keydown", onKeyDown);

  return () => {
    window.removeEventListener("keydown", onKeyDown);
  };
};
