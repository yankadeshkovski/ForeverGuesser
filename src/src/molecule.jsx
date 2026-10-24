import { useEffect, useRef } from "react";
import * as threeDmol from "3dmol";
import { createHost, disposeViewer } from "./viewerUtils.js";
// Works whether the bundler exposes #Dmol as named exports or only under .default
const $3Dmol = typeof threeDmol.createViewer === "function" ? threeDmol : threeDmol.default;

// Same palette as the landing-page specimen (C lime, F red, O paper, S amber),
// plus a few extras so non-PFAS molecules from the presets still read well.
const COLORS = {
  C: "#d4ff55",
  F: "#ff604f",
  O: "#f4f4f0",
  S: "#ffb84d",
  H: "#7d8078",
  N: "#7fd1ff",
  Cl: "#8ee36f",
  Br: "#c9793f",
};

// Fills its parent (the parent must be position: relative with a real size).
// ONE viewer lives for as long as this component is mounted; new molecules are swapped in,
// so searching repeatedly never creates extra WebGL contexts.
export default function MolViewer({ molblock }) {
  const wrapRef = useRef(null);
  const viewerRef = useRef(null);

  // Create the viewer once, dispose it on unmount
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const host = createHost(wrap); // its own child element, never shared with another viewer
    let viewer;
    try {
      viewer = $3Dmol.createViewer(host, {
        backgroundColor: "#000000",
        backgroundAlpha: 0,
        antialias: true,
      });
      viewer.setProjection("perspective");
    } catch (err) {
      console.error("3D viewer failed to start", err);
      host.remove();
      return;
    }
    viewerRef.current = viewer;
    return () => {
      viewerRef.current = null;
      disposeViewer(viewer);
    };
  }, []);

  // Swap the model whenever a new molblock arrives (declared after the effect above, so it runs second)
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.spin(false);
    viewer.removeAllModels();
    if (molblock) {
      viewer.addModel(molblock, "sdf");
      viewer.setStyle(
        {},
        {
          stick: { radius: 0.13, colorscheme: COLORS },
          sphere: { scale: 0.25, colorscheme: COLORS },
        }
      );
      viewer.zoomTo();
      viewer.zoom(0.9);
      viewer.spin("y", 0.35);
    }
    viewer.render();
  }, [molblock]);

  return <div ref={wrapRef} className="p2-viewer" role="img" aria-label="Interactive 3D model of the molecule" />;
}
