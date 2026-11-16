export const SKY_VERT = `
varying vec3 vDir;
void main(){
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

export const SKY_FRAG = `
precision highp float;
varying vec3 vDir;
uniform vec3 uZenith, uHorizon, uGround, uSunColor, uNightColor, uSunDir, uGalactic;
uniform float uNight, uSpace, uStars, uTime;

float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float hash31(vec3 p){
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float vnoise3(vec3 p){
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash31(i), n100 = hash31(i + vec3(1,0,0));
  float n010 = hash31(i + vec3(0,1,0)), n110 = hash31(i + vec3(1,1,0));
  float n001 = hash31(i + vec3(0,0,1)), n101 = hash31(i + vec3(1,0,1));
  float n011 = hash31(i + vec3(0,1,1)), n111 = hash31(i + vec3(1,1,1));
  return mix(mix(mix(n000,n100,f.x), mix(n010,n110,f.x), f.y),
             mix(mix(n001,n101,f.x), mix(n011,n111,f.x), f.y), f.z);
}
float fbm3(vec3 p){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++){ s += a * vnoise3(p); p *= 2.03; a *= 0.5; }
  return s;
}

vec3 starfield(vec3 d){
  vec3 col = vec3(0.0);
  for (int i = 0; i < 3; i++){
    float scale = 210.0 + float(i) * 245.0;
    float cutoff = 0.958 - float(i) * 0.014;
    float az = atan(d.z, d.x);
    float el = asin(clamp(d.y, -1.0, 1.0));
    vec2 uv = vec2(az / 6.2831853 + 0.5, el / 3.1415926 + 0.5) * scale;
    vec2 cell = floor(uv);
    vec2 f = fract(uv) - 0.5;
    float rnd = hash12(cell + float(i) * 43.7);
    if (rnd < cutoff) continue;
    float bright = pow((rnd - cutoff) / (1.0 - cutoff), 2.6);
    vec2 off = vec2(hash12(cell + 5.1), hash12(cell + 9.7)) - 0.5;
    float dist = length(f - off);
    float core = smoothstep(0.042, 0.0, dist);
    float halo = exp(-dist * dist * 190.0) * 0.12;
    float tw = 0.78 + 0.22 * sin(uTime * 1.8 + rnd * 80.0);
    vec3 tint = mix(vec3(0.68, 0.81, 1.0), vec3(1.0, 0.84, 0.66), hash12(cell + 17.3));
    col += tint * (core * (0.32 + 2.7 * bright) + halo * bright) * tw;
  }
  return col;
}

void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  float sd = clamp(dot(d, uSunDir), 0.0, 1.0);
  vec3 sunFlat = normalize(vec3(uSunDir.x, 0.0, uSunDir.z) + 1e-4);
  float az = max(dot(normalize(vec3(d.x, 0.0, d.z) + 1e-4), sunFlat), 0.0);

  float grad = pow(1.0 - clamp(h, 0.0, 1.0), 4.0);
  vec3 base = mix(uZenith, uHorizon, grad);
  base += uSunColor * pow(az, 5.0) * pow(1.0 - clamp(h, 0.0, 1.0), 6.0) * 0.55 * (1.0 - uSpace);
  base = mix(base, uGround, smoothstep(0.02, -0.22, h));
  base = mix(base, vec3(0.0018, 0.0032, 0.0070) * (1.0 - 0.35 * uNight), uSpace);

  vec3 night = uNightColor + uSunColor * 0.018 * pow(az, 4.0) * pow(1.0 - clamp(h, 0.0, 1.0), 2.0);
  base = mix(base, night, uNight);

  vec3 col = base;
  col += uSunColor * (pow(sd, 10.0) * 0.26 + pow(sd, 120.0) * 0.48) * (1.0 - 0.82 * uSpace);
  col += uSunColor * smoothstep(0.99990, 0.99997, sd) * 4.2;

  float starAmt = uStars;
  if (starAmt > 0.001){
    float band = exp(-pow(dot(d, uGalactic) / 0.285, 2.0));
    float dust = fbm3(d * 3.1 + vec3(7.3, 2.1, 5.7));
    float lanes = smoothstep(0.42, 0.72, fbm3(d * 9.0 + vec3(1.7, 8.3, 3.9)));
    vec3 mw = vec3(0.038, 0.050, 0.092) * (0.40 + 1.15 * dust);
    mw *= mix(0.30, 1.0, lanes);
    col += mw * band * starAmt * 0.62;
    col += starfield(d) * starAmt;
  }
  gl_FragColor = vec4(col, 1.0);
}`;

export const EARTH_VERT = `
varying vec2 vUv;
varying vec3 vN;
varying vec3 vW;
void main(){
  vUv = uv;
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const EARTH_FRAG = `
precision highp float;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vW;
uniform sampler2D uDay, uNightMap, uCloud, uSpec;
uniform vec3 uSunDir;
uniform float uReveal, uCloudShift;

void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  float sd = dot(N, uSunDir);
  float day = smoothstep(-0.12, 0.18, sd);
  float dusk = exp(-pow(sd / 0.22, 2.0));

  vec3 albedo = texture2D(uDay, vUv).rgb;
  float ocean = smoothstep(0.35, 0.72, texture2D(uSpec, vUv).r);
  albedo = mix(albedo, albedo * vec3(0.62, 0.88, 1.06), ocean * 0.35);
  albedo = mix(vec3(dot(albedo, vec3(0.299, 0.587, 0.114))), albedo, 1.05);
  albedo = max(albedo, vec3(0.0));

  vec4 cloudTex = texture2D(uCloud, vec2(vUv.x + uCloudShift, vUv.y));
  float ca = cloudTex.a;

  vec3 H = normalize(uSunDir + V);
  float spec = pow(max(dot(N, H), 0.0), 240.0) * ocean
             * smoothstep(0.0, 0.35, sd) * (1.0 - ca * 0.75);

  vec3 col = albedo * (0.012 + 1.12 * day);
  col += vec3(1.0, 0.86, 0.68) * spec * 1.9;

  vec3 cloudCol = vec3(0.87, 0.90, 0.97) * (0.030 + 1.00 * day);
  col = mix(col, cloudCol, clamp(ca * 0.80, 0.0, 0.88));

  float limbHaze = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.4);
  col = mix(col, vec3(0.11, 0.36, 0.78) * (0.30 + 1.00 * day), limbHaze * 0.50 * day);

  col += vec3(1.0, 0.40, 0.16) * dusk * 0.055 * (1.0 - ca * 0.75);

  vec3 nightTex = texture2D(uNightMap, vUv).rgb;
  float nightLum = dot(nightTex, vec3(0.299, 0.587, 0.114));
  vec3 lights = nightTex * smoothstep(0.015, 0.16, nightLum) * 1.9;
  float nightMask = 1.0 - smoothstep(-0.16, 0.10, sd);
  col += lights * nightMask * (1.0 - ca * 0.78);

  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 4.5);
  col += vec3(0.10, 0.36, 0.95) * fres * (0.06 + 0.55 * day) * 0.35;

  col *= uReveal;
  gl_FragColor = vec4(col, 1.0);
}`;

export const ATMOS_VERT = `
varying vec3 vN;
varying vec3 vW;
void main(){
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const ATMOS_FRAG = `
precision highp float;
varying vec3 vN;
varying vec3 vW;
uniform vec3 uSunDir, uColor;
uniform float uReveal, uStrength, uPower;
void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  float rim = pow(1.0 - abs(dot(N, V)), uPower);
  float sun = smoothstep(-0.35, 0.45, dot(N, uSunDir));
  float warm = pow(clamp(1.0 - abs(dot(N, uSunDir)) * 2.6, 0.0, 1.0), 3.0);
  vec3 col = mix(uColor, vec3(0.56, 0.82, 1.0), sun * 0.55);
  col = mix(col, vec3(1.0, 0.58, 0.30), warm * 0.12);
  float a = rim * (0.06 + 0.85 * sun) * uStrength * uReveal;
  gl_FragColor = vec4(col * a, a);
}`;

export const BEAM_VERT = `
varying vec2 vUv;
varying vec3 vNv;
void main(){
  vUv = uv;
  vNv = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

export const BEAM_FRAG = `
varying vec2 vUv;
varying vec3 vNv;
uniform float uOpacity;
uniform vec3 uColor;
void main(){
  float edge = smoothstep(0.25, 1.0, abs(vNv.z));
  float a = pow(vUv.y, 2.2) * edge * 0.11 * uOpacity;
  gl_FragColor = vec4(uColor * a, a);
}`;
