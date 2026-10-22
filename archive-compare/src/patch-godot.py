# Copies the Godot web export into ../godot/ (the published page) and patches its page: COOP/COEP service worker,
# thread pool size from ?threads=N, and window.__fairbenchDone() for the result. Usage: python3 -I patch-godot.py <fairbench dir>
import pathlib, shutil, sys
root = pathlib.Path(sys.argv[1])
src, dst = root / 'godot' / 'dist', root.parent / 'godot'
shutil.rmtree(dst, ignore_errors=True)
shutil.copytree(src, dst, ignore=shutil.ignore_patterns('.gdignore'))
page = dst / 'index.html'
html = page.read_text()
html = html.replace('<head>', '<head>\n<script src="../coi-serviceworker.js"></script>', 1)
hook = '''const fbQuery = new URLSearchParams(location.search);
// Capped at hardware threads - 1, as JoltPhysics.js caps its workers, so both get the same count on small CPUs.
const fbThreads = Math.max(1, Math.min(+(fbQuery.get('threads') || 4), (navigator.hardwareConcurrency || 2) - 1));
GODOT_CONFIG.godotPoolSize = fbThreads; // Godot's WorkerThreadPool, which its Jolt job system uses
GODOT_CONFIG.emscriptenPoolSize = fbThreads + 8;
// Godot checks Jolt's update error and warns once per kind when a fixed buffer overflows; record which ones did.
const fbOverflow = new Set();
GODOT_CONFIG.onPrintError = (...a) => {
	const m = a.join(' ').match(/Jolt Physics (contact constraint buffer|manifold cache|body pair cache) exceeded/);
	if (m) fbOverflow.add(m[1]);
	console.error(...a);
};
window.__fairbenchDone = (r) => {
	const gl = document.createElement('canvas').getContext('webgl2');
	const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
	const result = { ...r, workers: fbThreads, joltOverflow: [...fbOverflow], crossOriginIsolated, hardwareConcurrency: navigator.hardwareConcurrency, gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null, userAgent: navigator.userAgent };
	window.__RESULT__ = result;
	parent.postMessage({ type: 'fairbench-result', result }, '*');
};
const engine = new Engine(GODOT_CONFIG);'''
assert html.count('const engine = new Engine(GODOT_CONFIG);') == 1
html = html.replace('const engine = new Engine(GODOT_CONFIG);', hook)
page.write_text(html)
print('patched', page)
