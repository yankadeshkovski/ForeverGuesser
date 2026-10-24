import { useEffect, useRef } from "react";
import * as $3Dmol from "3dmol";

export default function MolViewer({ molblock }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!molblock) return;
    const viewer = $3Dmol.createViewer(ref.current, { backgroundColor: "white" });
    viewer.addModel(molblock, "mol");
    viewer.setStyle({}, { stick: {} });
    viewer.zoomTo();
    viewer.render();
    return () => viewer.clear();
  }, [molblock]);

  return <div ref={ref} style={{ width: 400, height: 300, position: "relative" }} />;
}