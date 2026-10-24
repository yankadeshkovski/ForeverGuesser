// 3Dmol and RDKit are CommonJS/UMD packages. Depending on the bundler, a dynamic import() of
// one exposes its API either as named exports or only under `.default`, so `mod.createViewer`
// can be undefined ("createViewer is not a function") and the viewer silently never appears.
// These helpers accept both shapes.
export async function load3Dmol() {
  const mod = await import('3dmol')
  return typeof mod.createViewer === 'function' ? mod : mod.default
}

export async function loadRDKit() {
  const mod = await import('@rdkit/rdkit')
  // RDKit's loader sets module.exports = init and module.exports.default = init
  return typeof mod.default === 'function' ? mod.default : (mod.default?.default ?? mod)
}
// 3Dmol never frees its own resources: each viewer keeps a WebGL context, a 25 ms
// spin timer, a window "resize" listener, a ResizeObserver and an IntersectionObserver
// alive after you call viewer.clear(). Browsers allow ~16 live WebGL contexts, and when
// that is exceeded 3Dmol's lost-context handler starts re-creating contexts for every
// canvas on the page, which is how a page ends up blank or the tab goes black.
//
// Always give each viewer its OWN child element (host) and dispose it with this helper.
export function createHost(parent) {
  const host = document.createElement('div')
  host.style.cssText = 'position:absolute;inset:0'
  parent.appendChild(host)
  return host
}

export function disposeViewer(viewer) {
  if (!viewer) return
  try {
    viewer.spin(false)                 // stop the 25 ms rotation timer
    viewer.divwatcher?.disconnect()    // 3Dmol's own ResizeObserver
    viewer.intwatcher?.disconnect()    // 3Dmol's own IntersectionObserver
    const canvas = viewer.getCanvas?.()
    viewer.container?.remove()         // detach first: a detached host has size 0, so stray resize() calls do nothing
    const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl')
    gl?.getExtension('WEBGL_lose_context')?.loseContext() // release the GPU context now, not at GC
  } catch (err) {
    console.warn('disposeViewer failed', err)
  }
}
