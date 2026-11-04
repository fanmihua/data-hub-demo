import { useEffect, useRef, useState } from 'react';
import { useSize } from '../lib';
import { useSite } from '../../../core/provider';
import { colorToRgba, cssVar, dpr, useRafLoop } from '../../../core/fx/hooks';

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

/* 3D simplex noise（Ashima Arts / Stefan Gustavson，MIT） + 域扭曲，混出斜切色带的流动色 */
const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;
uniform float uTime;
uniform float uAmp;
uniform vec3 uC0; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3; uniform vec3 uC4;
uniform float uDark;

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2(uv.x * aspect * 0.42, uv.y);
  float t = uTime;
  vec2 q = vec2(snoise(vec3(p * 1.1, t * 0.07)), snoise(vec3(p * 1.1 + 7.3, t * 0.07)));
  vec2 r = p + q * 0.42 * uAmp;
  float n1 = snoise(vec3(r * vec2(0.9, 1.6), t * 0.09));
  float n2 = snoise(vec3(r * vec2(1.4, 2.4) + 3.7, t * 0.11));
  float n3 = snoise(vec3(r * 2.2 + 11.0, t * 0.13));

  float g = uv.x + n1 * 0.22 + (uv.y - 0.5) * 0.18;
  vec3 col = mix(uC0, uC1, smoothstep(-0.05, 0.38, g));
  col = mix(col, uC2, smoothstep(0.32, 0.66, g + n2 * 0.16));
  col = mix(col, uC3, smoothstep(0.6, 0.98, g - n2 * 0.12));
  // 深空藏青的暗流
  col = mix(col, uC0, smoothstep(0.35, 0.95, n2) * 0.55);
  // 少量信号橙
  col = mix(col, uC4, smoothstep(0.55, 0.92, n3) * smoothstep(0.25, 0.75, uv.x) * 0.7);
  // 细腻高光
  col += vec3(0.07) * smoothstep(0.2, 0.95, n1) * (1.0 - uDark * 0.4);
  // 颗粒
  float grain = fract(sin(dot(mod(gl_FragCoord.xy, 64.0), vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  col += grain * 0.018;
  gl_FragColor = vec4(col, 1.0);
}
`;

interface GLState {
  gl: WebGLRenderingContext;
  prog: WebGLProgram;
  buf: WebGLBuffer;
  u: Record<string, WebGLUniformLocation | null>;
}

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { const log = gl.getShaderInfoLog(sh); gl.deleteShader(sh); throw new Error(log ?? 'shader'); }
  return sh;
}

function initGL(canvas: HTMLCanvasElement): GLState | null {
  try {
    if (/[?&]gl=off\b/.test(location.hash)) return null;
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: 'low-power' }) as WebGLRenderingContext | null;
    if (!gl) return null;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u: GLState['u'] = {};
    for (const n of ['uRes', 'uTime', 'uAmp', 'uC0', 'uC1', 'uC2', 'uC3', 'uC4', 'uDark']) u[n] = gl.getUniformLocation(prog, n);
    return { gl, prog, buf, u };
  } catch {
    return null;
  }
}

/** 色带配色：accent + 深空藏青 + 紫 + 青 + 少量橙；深色模式下整体压暗一点 */
function palette(dark: boolean) {
  const c = (v: string) => colorToRgba(v).slice(0, 3);
  const acc = c(cssVar('--accent') || '#2D5ED4');
  return dark
    ? [c('#0B1A44'), acc, c('#7B5CF0'), c('#2AB7D3'), c('#F2873F')]
    : [c('#10215A'), acc, c('#7A5AF5'), c('#22B5D6'), c('#F07A2A')];
}

/**
 * WebGL 斜切流动色带（Stripe 式）。容器用 CSS skewY(-8deg) 斜切，canvas 只负责颜色流动。
 * - 分辨率按 CSS 尺寸 × 0.6 × DPR(≤1.5) 渲染，颜色是平滑场，放大不失真；
 * - fx 关闭：只画一帧终态；fx 轻量：速度、扭曲减半；
 * - WebGL 不可用或上下文丢失：退回 CSS 渐变（.is-fallback）。
 */
export function Ribbon() {
  const { fx, isDark, accent } = useSite();
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<GLState | null>(null);
  const [failed, setFailed] = useState(false);
  const size = useSize(wrap);
  const fxRef = useRef(fx);
  fxRef.current = fx;
  const clock = useRef(14);

  const render = (t: number) => {
    const s = glRef.current, cv = canvas.current;
    if (!s || !cv) return;
    const { gl, u } = s;
    gl.viewport(0, 0, cv.width, cv.height);
    gl.uniform2f(u.uRes, cv.width, cv.height);
    gl.uniform1f(u.uTime, t);
    gl.uniform1f(u.uAmp, fxRef.current.intensity >= 1 ? 1 : 0.7);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  // 卸载时释放上下文；延迟一拍，避免 StrictMode 的「卸载 → 立即重挂」把同一块 canvas 的上下文弄丢
  const releaseTimer = useRef(0);
  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    clearTimeout(releaseTimer.current);
    const s = glRef.current ?? initGL(cv);
    if (!s) { setFailed(true); return; }
    glRef.current = s;
    // 先按当前布局尺寸设置一次分辨率，不必等 ResizeObserver
    const box = wrap.current;
    if (box && box.offsetWidth) {
      const scale = dpr(1.5) * 0.6;
      cv.width = Math.max(2, Math.round(box.offsetWidth * scale));
      cv.height = Math.max(2, Math.round(box.offsetHeight * scale));
    }
    const lost = (e: Event) => { e.preventDefault(); glRef.current = null; setFailed(true); };
    cv.addEventListener('webglcontextlost', lost);
    return () => {
      cv.removeEventListener('webglcontextlost', lost);
      releaseTimer.current = window.setTimeout(() => {
        const g = glRef.current?.gl;
        glRef.current = null;
        g?.getExtension('WEBGL_lose_context')?.loseContext();
      }, 0);
    };
  }, []);

  useEffect(() => {
    const s = glRef.current;
    if (!s) return;
    const cols = palette(isDark);
    ['uC0', 'uC1', 'uC2', 'uC3', 'uC4'].forEach((n, i) => s.gl.uniform3f(s.u[n], cols[i][0], cols[i][1], cols[i][2]));
    s.gl.uniform1f(s.u.uDark, isDark ? 1 : 0);
    render(clock.current);
  }, [isDark, accent.hex, failed]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !size.width || !glRef.current) return;
    const scale = dpr(1.5) * 0.6;
    cv.width = Math.max(2, Math.round(size.width * scale));
    cv.height = Math.max(2, Math.round(size.height * scale));
    render(clock.current);
  }, [size.width, size.height]); // eslint-disable-line react-hooks/exhaustive-deps

  useRafLoop((_t, dt) => {
    clock.current += dt * fxRef.current.intensity;
    render(clock.current);
  }, { active: fx.motion && !failed, target: wrap, fps: 60 });

  return (
    <div className="va-ribbon" aria-hidden="true">
      <div ref={wrap} className={`va-ribbon-band${failed ? ' is-fallback' : ''}`}>
        {!failed && <canvas ref={canvas} className="va-ribbon-canvas" />}
        <div className="va-ribbon-lines" />
        <div className="va-ribbon-ticks" />
      </div>
    </div>
  );
}
