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

vec3 starfield(vec3 d){
  vec3 col = vec3(0.0);
  for (int i = 0; i < 2; i++){
    float scale = (i == 0) ? 260.0 : 520.0;
    float cutoff = (i == 0) ? 0.965 : 0.945;
    float az = atan(d.z, d.x);
    float el = asin(clamp(d.y, -1.0, 1.0));
    vec2 uv = vec2(az / 6.2831853 + 0.5, el / 3.1415926 + 0.5) * scale;
    vec2 cell = floor(uv);
    vec2 f = fract(uv) - 0.5;
    float rnd = hash12(cell + float(i) * 43.7);
    if (rnd < cutoff) continue;
    float bright = pow((rnd - cutoff) / (1.0 - cutoff), 3.0);
    vec2 off = vec2(hash12(cell + 5.1), hash12(cell + 9.7)) - 0.5;
    float dist = length(f - off);
    float core = smoothstep(0.048, 0.0, dist);
    float tw = 0.75 + 0.25 * sin(uTime * 1.9 + rnd * 60.0);
    vec3 tint = mix(vec3(0.72, 0.84, 1.0), vec3(1.0, 0.86, 0.68), hash12(cell + 17.3));
    col += tint * core * (0.35 + 2.3 * bright) * tw;
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
  base = mix(base, vec3(0.0025, 0.005, 0.011) * (1.0 - 0.4 * uNight), uSpace);

  vec3 night = uNightColor + uSunColor * 0.018 * pow(az, 4.0) * pow(1.0 - clamp(h, 0.0, 1.0), 2.0);
  base = mix(base, night, uNight);

  vec3 col = base;
  col += uSunColor * (pow(sd, 10.0) * 0.28 + pow(sd, 120.0) * 0.55) * (1.0 - 0.55 * uSpace);
  col += uSunColor * smoothstep(0.99990, 0.99997, sd) * 5.5;

  float starAmt = uStars;
  if (starAmt > 0.001){
    float band = exp(-pow(dot(d, uGalactic) / 0.30, 2.0));
    col += vec3(0.10, 0.13, 0.26) * band * 0.55 * starAmt;
    col += starfield(d) * starAmt;
  }
  col += vec3(0.16, 0.36, 0.85) * uSpace * exp(-abs(h) * 34.0) * 0.22;
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
uniform sampler2D uDay, uNightMap, uCloud;
uniform vec3 uSunDir;
uniform float uReveal, uCloudShift;

void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  float sd = dot(N, uSunDir);
  float day = smoothstep(-0.16, 0.28, sd);
  vec4 dayTex = texture2D(uDay, vUv);
  float land = dayTex.a;
  vec3 albedo = dayTex.rgb;
  albedo = mix(vec3(dot(albedo, vec3(0.299, 0.587, 0.114))), albedo, 1.16);
  albedo = pow(max(albedo, vec3(0.0)), vec3(0.92));

  vec4 cloud = texture2D(uCloud, vec2(vUv.x + uCloudShift, vUv.y));
  float cloudA = cloud.a * 0.78 * smoothstep(-0.22, 0.30, sd);

  vec3 H = normalize(uSunDir + V);
  float spec = pow(max(dot(N, H), 0.0), 140.0) * (1.0 - land) * smoothstep(-0.05, 0.35, sd);

  vec3 col = albedo * (0.018 + 1.22 * day);
  col += vec3(1.0, 0.82, 0.58) * spec * 1.1;
  col = mix(col, vec3(0.88, 0.91, 0.95) * (0.12 + 0.86 * day), clamp(cloudA * 0.45, 0.0, 0.42));

  float term = exp(-pow(sd / 0.20, 2.0)) * (1.0 - abs(day - 0.5) * 2.0);
  col += vec3(1.0, 0.42, 0.12) * term * 0.14;

  vec3 lights = texture2D(uNightMap, vUv).rgb;
  col += lights * smoothstep(0.20, -0.18, sd) * (1.0 - cloudA * 0.55) * 1.25;

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
uniform float uReveal, uStrength;
void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  float rim = pow(1.0 - abs(dot(N, V)), 3.2);
  float sun = smoothstep(-0.35, 0.55, dot(N, uSunDir));
  float warm = pow(clamp(1.0 - abs(dot(N, uSunDir)) * 2.1, 0.0, 1.0), 3.0);
  vec3 col = mix(uColor, vec3(1.0, 0.44, 0.16), warm * 0.55);
  float a = rim * (0.16 + 0.95 * sun) * uStrength * uReveal;
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
