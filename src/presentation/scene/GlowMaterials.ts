import * as THREE from 'three';

const GLOW_VERTEX = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aYear;
  attribute float aTemporal;
  attribute float aOpacity;
  varying vec3 vColor;
  varying float vFade;
  varying float vStar;
  varying float vOpacity;
  uniform float uSizeScale;
  uniform float uPixelRatio;
  uniform float uYearFrom;
  uniform float uYearTo;
  uniform float uFadeYears;
  uniform float uPulse;
  uniform float uOpacity;

  void main() {
    vColor = aColor;
    vStar = 1.0 - aTemporal;
    vOpacity = aOpacity > 0.0 ? aOpacity : uOpacity;

    // 时间区间外且参与时间裁剪的点直接裁出裁剪空间（常驻层 aTemporal=0 不受影响）
    if (aTemporal > 0.5 && (aYear < uYearFrom || aYear > uYearTo)) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      vFade = 0.0;
      return;
    }

    float fade = 1.0;
    if (aTemporal > 0.5 && uFadeYears > 0.0) {
      float t = clamp((uYearTo - aYear) / uFadeYears, 0.0, 1.0);
      fade = t * t * (3.0 - 2.0 * t);
    }
    vFade = fade;

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uSizeScale * uPixelRatio * (300.0 / -mvPosition.z);
    gl_PointSize = clamp(gl_PointSize, 1.0, 128.0) * fade * (1.0 + 0.35 * uPulse);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const GLOW_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vFade;
  varying float vStar;
  varying float vOpacity;
  uniform float uPulse;
  uniform float uStarVisible;

  void main() {
    vec2 coord = gl_PointCoord - 0.5;
    float d = length(coord) * 2.0;
    float alpha = exp(-4.5 * d * d);
    float starMask = mix(1.0, uStarVisible, vStar);
    gl_FragColor = vec4(vColor, alpha * vOpacity * vFade * (1.0 + 0.3 * uPulse) * starMask);
  }
`;

/** 年份范围外的节点被剔除；uFadeYears 控制回放时的亮度渐入跨度（0 表示不渐入） */
export function createGlowPointsMaterial(sizeScale = 1, opacity = 1): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSizeScale: { value: sizeScale },
      uOpacity: { value: opacity },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
      uYearFrom: { value: -99999 },
      uYearTo: { value: 99999 },
      uFadeYears: { value: 0 },
      uPulse: { value: 0 },
      uStarVisible: { value: 1 },
    },
    vertexShader: GLOW_VERTEX,
    fragmentShader: GLOW_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
}


