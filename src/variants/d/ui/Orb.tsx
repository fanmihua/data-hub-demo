import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { dpr, useRafLoop } from '../../../core/fx/hooks';
import { useSite } from '../../../core/provider';

/**
 * 会呼吸的光球（由 B 版 Orb.tsx 移植改造）：AI 助手的头像与状态。
 * - state：idle 空闲 / focus 聚焦（更亮、流速更快）/ thinking 思考（快速翻涌）/ speaking 回答（像说话一样起伏）；
 * - size：光球本体直径（CSS 像素），光晕向外溢出，不占布局；
 * - WebGL：一页最多一个上下文。size ≥ 40 的光球先到先得那一个上下文，其余（以及 size < 40 的小头像）用 CSS 光球；
 *   WebGL 不可用或上下文丢失时也退回 CSS；DPR 上限 1.5；离开视口 / 标签页隐藏时暂停（useRafLoop）；
 * - 关闭特效时只画一帧终态，CSS 光球不转。
 */
export type OrbState = 'idle' | 'focus' | 'thinking' | 'speaking';

const VERT = `attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`;

/* 片元着色器：B 版球面 fbm 噪声 + 菲涅尔边光 + 外圈光晕；球半径 0.30（画布短边），画布比光球大 1/0.6 倍 */
const FRAG = `
precision highp float;
uniform vec2 uRes;uniform float uTime;uniform vec2 uLight;
uniform float uEnergy;uniform float uPulse;uniform float uDark;uniform float uFx;
uniform vec3 uC1;uniform vec3 uC2;uniform vec3 uC3;uniform vec3 uC4;
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
void main(){
  float mn=min(uRes.x,uRes.y);
  vec2 p=(gl_FragCoord.xy-.5*uRes)/mn;
  float t=uTime;
  float r=length(p);
  float ang=atan(p.y,p.x);
  float R=.30*(1.+.018*sin(t*1.3)*uFx+.03*uPulse+.018*uEnergy);
  float wob=snoise(vec3(cos(ang)*1.15+t*.13,sin(ang)*1.15-t*.11,t*.32))*(.012+.016*uEnergy+.05*uPulse)*uFx;
  float Rw=R*(1.+wob);
  float d=r-Rw;
  float aa=1.6/mn;
  float inside=1.-smoothstep(-aa,aa,d);
  vec3 col=vec3(0.);
  if(r<Rw+aa*3.){
    float k=clamp(r/Rw,0.,1.);
    vec3 n=vec3(p/Rw,sqrt(max(0.,1.-k*k)));
    float sp=.22+.22*uEnergy+.45*uPulse;
    vec3 q=n*.8;
    float f1=snoise(q+vec3(t*sp*.34,-t*sp*.22,t*sp*.16));
    float f2=snoise(q*1.3+vec3(-t*sp*.26,t*sp*.3,3.7)+f1*.8);
    float f3=snoise(q*1.9+vec3(t*sp*.18,7.1,-t*sp*.24)+f2*.6);
    col=uC1;
    col=mix(col,uC2,smoothstep(-.25,.75,f1)*.7);
    col=mix(col,uC3,smoothstep(.05,.8,f2)*.58);
    col=mix(col,uC4,smoothstep(.35,.95,f3*.6+f1*.35+(.2-n.y)*.25)*.42);
    float silk=sin((f2*2.2+f1*1.4+n.y*1.6)*3.1416);
    col+=vec3(.06)*smoothstep(.55,1.,silk)*(1.-uDark*.4);
    vec3 L=normalize(vec3(uLight,.85));
    float diff=clamp(dot(n,L),0.,1.);
    float fres=pow(1.-n.z,2.3);
    vec3 H=normalize(L+vec3(0.,0.,1.));
    float spec=pow(clamp(dot(n,H),0.,1.),48.);
    col*=.74+.36*diff;
    col=mix(col,vec3(1.),(1.-uDark)*(.08+.28*pow(diff,4.)));
    col+=fres*mix(uC3,vec3(1.),.45)*(.42+.45*uEnergy);
    col+=spec*(.42+.2*uEnergy);
    col+=uC1*(1.-k)*.1*(1.+uEnergy);
  }
  float dd=max(d,0.);
  float halo=exp(-dd*mix(16.,9.,uEnergy))*(.22+.34*uEnergy+.24*uPulse);
  float rim=exp(-abs(d)*110.)*.2*(1.+uEnergy);
  vec3 hc=mix(uC1,uC3,.5+.5*sin(ang+t*.4*uFx));
  hc=mix(hc,uC2,.3);
  float ha=clamp((halo+rim)*mix(.8,1.15,uDark),0.,1.);
  float a=inside+(1.-inside)*ha;
  vec3 c=col*inside+(1.-inside)*hc*ha;
  gl_FragColor=vec4(c,a);
}`;

type GLState = { gl: WebGLRenderingContext; u: Record<string, WebGLUniformLocation | null> };

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { gl.deleteShader(s); return null; }
  return s;
}

function initGL(canvas: HTMLCanvasElement): GLState | null {
  let gl: WebGLRenderingContext | null = null;
  try { gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' }); } catch { gl = null; }
  if (!gl || gl.isContextLost()) return null;
  const vs = compile(gl, gl.VERTEX_SHADER, VERT), fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  const buf = gl.createBuffer();
  if (!buf) return null;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.useProgram(prog);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const u: GLState['u'] = {};
  for (const n of ['uRes', 'uTime', 'uLight', 'uEnergy', 'uPulse', 'uDark', 'uFx', 'uC1', 'uC2', 'uC3', 'uC4']) u[n] = gl.getUniformLocation(prog, n);
  gl.clearColor(0, 0, 0, 0);
  return { gl, u };
}

/* 一页最多一个 WebGL 上下文：先到先得 */
let glOwner: object | null = null;
const acquire = (who: object) => { if (glOwner && glOwner !== who) return false; glOwner = who; return true; };
const release = (who: object) => { if (glOwner === who) glOwner = null; };

const hexRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const mixRgb = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);

export function Orb({ state, size }: { state: OrbState; size: number }) {
  const { fx, isDark, accent } = useSite();
  const wrap = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<GLState | null>(null);
  const [owner] = useState(() => ({}));
  const [mode, setMode] = useState<'gl' | 'css'>(size >= 40 ? 'gl' : 'css');
  const st = useRef({ energy: 0, pulse: 0, lx: -0.35, ly: 0.5, tlx: -0.35, tly: 0.5, time: 6.5 });
  const stateRef = useRef(state);
  stateRef.current = state;
  const colors = useRef<number[][]>([]);

  // 初始化 WebGL（StrictMode 会先卸载再挂载：只在画布真正离开文档后才释放上下文）
  useEffect(() => {
    if (size < 40) { setMode('css'); return; }
    const c = canvas.current;
    if (!c || !acquire(owner)) { setMode('css'); return; }
    const s = initGL(c);
    if (!s) { release(owner); setMode('css'); return; }
    glRef.current = s;
    const lost = (e: Event) => { e.preventDefault(); glRef.current = null; release(owner); setMode('css'); };
    c.addEventListener('webglcontextlost', lost);
    return () => {
      c.removeEventListener('webglcontextlost', lost);
      glRef.current = null;
      release(owner);
      setTimeout(() => { if (!c.isConnected) s.gl.getExtension('WEBGL_lose_context')?.loseContext(); }, 0);
    };
  }, [size >= 40]); // eslint-disable-line react-hooks/exhaustive-deps

  // 主题色：主色 → 主色提亮 → 青 → 桃
  useEffect(() => {
    const a = hexRgb(accent.hex);
    colors.current = [a, mixRgb(a, [1, 1, 1], isDark ? 0.5 : 0.42), isDark ? hexRgb('#3FE0D8') : hexRgb('#17B3AD'), hexRgb('#FFB48C')];
    draw();
  }, [accent.hex, isDark]); // eslint-disable-line react-hooks/exhaustive-deps

  // 画布尺寸：光球直径 = 画布短边 × 0.6
  useEffect(() => {
    const c = canvas.current;
    if (!c || mode !== 'gl') return;
    const k = dpr(1.5);
    const px = Math.round((size / 0.6) * k);
    c.width = px; c.height = px;
    // 先画一帧，首屏不必等第一个动画帧
    draw();
  }, [size, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // 指针方向决定光照方向（只在精确指针设备、允许动效时）
  useEffect(() => {
    if (!fx.motion || mode !== 'gl' || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const on = (e: PointerEvent) => {
      const el = wrap.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy) || 1;
      const near = Math.max(0, Math.min(1, 1 - d / (r.width * 8)));
      st.current.tlx = -0.35 + (dx / d) * 0.7 * near;
      st.current.tly = 0.5 - (dy / d) * 0.5 * near;
    };
    window.addEventListener('pointermove', on, { passive: true });
    return () => window.removeEventListener('pointermove', on);
  }, [fx.motion, mode]);

  function draw() {
    const s = glRef.current, c = canvas.current;
    if (!s || !c || !c.width || colors.current.length < 4) return;
    const { gl, u } = s;
    const v = st.current;
    const still = !fx.motion;
    gl.viewport(0, 0, c.width, c.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(u.uRes, c.width, c.height);
    gl.uniform1f(u.uTime, v.time);
    gl.uniform2f(u.uLight, v.lx, v.ly);
    const e = still ? (stateRef.current === 'idle' ? 0.25 : 0.7) : v.energy;
    gl.uniform1f(u.uEnergy, e);
    gl.uniform1f(u.uPulse, still ? 0 : v.pulse);
    gl.uniform1f(u.uDark, isDark ? 1 : 0);
    gl.uniform1f(u.uFx, fx.intensity >= 1 ? 1 : 0.55);
    const [a, b, cc, d] = colors.current;
    gl.uniform3f(u.uC1, a[0], a[1], a[2]);
    gl.uniform3f(u.uC2, b[0], b[1], b[2]);
    gl.uniform3f(u.uC3, cc[0], cc[1], cc[2]);
    gl.uniform3f(u.uC4, d[0], d[1], d[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  useRafLoop((t, dt) => {
    const v = st.current, s = stateRef.current;
    const targetE = s === 'focus' ? 1 : s === 'thinking' ? 0.9 : s === 'speaking' ? 0.65 : 0;
    v.energy += (targetE - v.energy) * Math.min(1, dt * 3.2);
    if (s === 'thinking') v.pulse = Math.max(v.pulse, 0.55);
    if (s === 'speaking') v.pulse = Math.max(v.pulse, 0.18 + 0.32 * (0.5 + 0.5 * Math.sin(t * 7.1)) * (0.5 + 0.5 * Math.sin(t * 2.3 + 1)));
    v.pulse *= Math.exp(-dt * 1.8);
    const ease = Math.min(1, dt * 2.6);
    v.lx += (v.tlx - v.lx) * ease; v.ly += (v.tly - v.ly) * ease;
    v.time += dt * (fx.intensity >= 1 ? 1 : 0.6) * (1 + v.energy * 0.6 + v.pulse * 1.2);
    draw();
  }, { active: mode === 'gl' && fx.motion, target: wrap });

  // 关闭特效：状态变化时补画一帧
  useEffect(() => { if (!fx.motion) draw(); }, [fx.motion, state, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <span ref={wrap} className={`vd-orb is-${state}${mode === 'css' ? ' is-css' : ''}`} style={{ '--vd-orb-size': `${size}px` } as CSSProperties} aria-hidden="true">
      <i className="vd-orb-halo" />
      {mode === 'gl'
        ? <canvas ref={canvas} className="vd-orb-canvas" />
        : (
          <span className="vd-orb-css">
            <i className="vd-orb-css-flow" />
            <i className="vd-orb-css-swirl" />
            <i className="vd-orb-css-shine" />
          </span>
        )}
    </span>
  );
}
