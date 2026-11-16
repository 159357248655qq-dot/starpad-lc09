set +e
cd "D:/Downloads/新建文件夹/火箭发射台3D"
for p in build/three.module.js examples/jsm/controls/OrbitControls.js examples/jsm/loaders/GLTFLoader.js examples/jsm/utils/BufferGeometryUtils.js examples/jsm/postprocessing/EffectComposer.js examples/jsm/postprocessing/RenderPass.js examples/jsm/postprocessing/UnrealBloomPass.js examples/jsm/postprocessing/ShaderPass.js examples/jsm/postprocessing/OutputPass.js examples/jsm/postprocessing/Pass.js examples/jsm/postprocessing/MaskPass.js examples/jsm/shaders/CopyShader.js examples/jsm/shaders/OutputShader.js examples/jsm/shaders/LuminosityHighPassShader.js; do
  mkdir -p "vendor/three@0.160.0/$(dirname "$p")"
  code=$(curl -sL -m 40 -w "%{http_code}" "https://unpkg.com/three@0.160.0/$p" -o "vendor/three@0.160.0/$p")
  echo "$code $(stat -c %s "vendor/three@0.160.0/$p" 2>/dev/null) $p"
done