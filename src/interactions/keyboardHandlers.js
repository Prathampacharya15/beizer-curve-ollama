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

    const { type, index } = selectedRef.current;

    if (type === "anchor") {
      anchorPointsRef.current.splice(index, 1);
    }

    if (type === "control") {
      if (controlPointsRef.current[index]) {
        controlPointsRef.current[index].manual = false;
      }
    }

    computeControlPoints(true);
    redrawAll(activeWidthRef.current, activeColorRef.current);

    selectedRef.current = null;
  };

  window.addEventListener("keydown", onKeyDown);

  return () => {
    window.removeEventListener("keydown", onKeyDown);
  };
};
