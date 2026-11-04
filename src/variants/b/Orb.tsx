import { useEffect, useRef, useState } from 'react';
import { colorToRgba, cssVar, dpr, useElementSize, useRafLoop } from '../../core/fx/hooks';
import { useSite } from '../../core/provider';
import { finePointer } from './lib';

/**
 * WebGL 呼吸光球。
 * - 球面：3D simplex 噪声的两层 fbm 在球面法线上流动，颜色取 accent + 极光色标；
 *   边缘再用一层角向噪声扰动，形成「呼吸」的轮廓；菲涅尔边光 + 高光 + 外圈光晕。
 * - energy（检索框聚焦）让光更亮、流速更快；pulse（每次键入）让轮廓抖动、呼吸加快后衰减。
 * - 指针靠近时球心朝指针偏移，光照方向跟着指针。
 * - 只用一个 WebGL 上下文；DPR 上限 1.5；离开视口 / 标签页隐藏时暂停（useRafLoop）。
 * - fx 关闭时只画一帧终态；WebGL 不可用或上下文丢失时退回 CSS 光球。
 */

const VERT = `attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`;

const FRAG = `
precision highp float;
uniform vec2 uRes;uniform float uTime;uniform vec2 uOff;uniform vec2 uLight;
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
float fbm(vec3 p){float s=0.,a=.5;for(int i=0;i<3;i++){s+=a*snoise(p);p=p*2.03+vec3(1.7,9.2,3.1);a*=.5;}return s;}
void main(){
  float mn=min(uRes.x,uRes.y);
  vec2 uv=(gl_FragCoord.xy-.5*uRes)/mn;
  vec2 p=uv-uOff;
  float t=uTime;
  float r=length(p);
  float ang=atan(p.y,p.x);
  float R=.30*(1.+.018*sin(t*1.3)*uFx+.03*uPulse+.018*uEnergy);
  float wob=snoise(vec3(cos(ang)*1.15+t*.13,sin(ang)*1.15-t*.11,t*.32))*(.014+.018*uEnergy+.045*uPulse)*uFx;
  float Rw=R*(1.+wob);
  float d=r-Rw;
  float aa=1.6/mn;
  float inside=1.-smoothstep(-aa,aa,d);
  vec3 col=vec3(0.);
  if(r<Rw+aa*3.){
    float k=clamp(r/Rw,0.,1.);
    vec3 n=vec3(p/Rw,sqrt(max(0.,1.-k*k)));
    float sp=.22+.2*uEnergy+.42*uPulse;
    vec3 q=n*.8;
    float f1=snoise(q+vec3(t*sp*.34,-t*sp*.22,t*sp*.16));
    float f2=snoise(q*1.3+vec3(-t*sp*.26,t*sp*.3,3.7)+f1*.8);
    float f3=snoise(q*1.9+vec3(t*sp*.18,7.1,-t*sp*.24)+f2*.6);
    col=uC1;
    col=mix(col,uC2,smoothstep(-.25,.75,f1)*.72);
    col=mix(col,uC3,smoothstep(.05,.8,f2)*.62);
    col=mix(col,uC4,smoothstep(.3,.95,f3*.6+f1*.35+(.2-n.y)*.25)*.5);
    float silk=sin((f2*2.2+f1*1.4+n.y*1.6)*3.1416);
    col+=vec3(.06)*smoothstep(.55,1.,silk)*(1.-uDark*.4);
    vec3 L=normalize(vec3(uLight,.85));
    float diff=clamp(dot(n,L),0.,1.);
    float fres=pow(1.-n.z,2.3);
    vec3 H=normalize(L+vec3(0.,0.,1.));
    float spec=pow(clamp(dot(n,H),0.,1.),48.);
    col*=.74+.36*diff;
    col=mix(col,vec3(1.),(1.-uDark)*(.1+.3*pow(diff,4.)));
    col+=fres*mix(uC3,vec3(1.),.4)*(.45+.45*uEnergy);
    col+=spec*(.4+.2*uEnergy);
    col+=uC1*(1.-k)*.1*(1.+uEnergy);
  }
  float dd=max(d,0.);
  float halo=exp(-dd*mix(15.,9.,uEnergy))*(.26+.34*uEnergy+.22*uPulse);
  float rim=exp(-abs(d)*110.)*.22*(1.+uEnergy);
  vec3 hc=mix(uC1,uC3,.5+.5*sin(ang+t*.4*uFx));
  hc=mix(hc,uC2,.3);
  float ha=clamp((halo+rim)*mix(.8,1.15,uDark),0.,1.);
  float a=inside+(1.-inside)*ha;
  vec3 c=col*inside+(1.-inside)*hc*ha;
  gl_FragColor=vec4(c,a);
}`;

type GLState = {
  gl: WebGLRenderingContext;
  prog: WebGLProgram;
  buf: WebGLBuffer;
  u: Record<string, WebGLUniformLocation | null>;
};

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
  for (const n of ['uRes', 'uTime', 'uOff', 'uLight', 'uEnergy', 'uPulse', 'uDark', 'uFx', 'uC1', 'uC2', 'uC3', 'uC4']) u[n] = gl.getUniformLocation(prog, n);
  gl.clearColor(0, 0, 0, 0);
  return { gl, prog, buf, u };
}

export interface OrbSignal { energy: number; pulse: number; thinking: boolean }

export function Orb({ signal, className = '' }: { signal: OrbSignal; className?: string }) {
  const { fx, isDark, accent } = useSite();
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<GLState | null>(null);
  const [mode, setMode] = useState<'gl' | 'css'>('gl');
  const size = useElementSize(wrap);
  const st = useRef({ energy: 0, pulse: 0, ox: 0, oy: 0, tox: 0, toy: 0, lx: -0.35, ly: 0.5, tlx: -0.35, tly: 0.5, time: 6.5 });
  const colors = useRef<number[][]>([]);
  const sig = useRef(signal);
  sig.current = signal;

  // 键入时给一次脉冲
  const lastPulse = useRef(signal.pulse);
  useEffect(() => {
    if (signal.pulse !== lastPulse.current) { st.current.pulse = Math.min(1, st.current.pulse + 0.32); lastPulse.current = signal.pulse; }
  }, [signal.pulse]);

  // 初始化 WebGL；StrictMode 会先卸载再挂载，所以只在画布真正离开文档后才释放上下文
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const s = initGL(c);
    if (!s) { setMode('css'); return; }
    glRef.current = s;
    const lost = (e: Event) => { e.preventDefault(); glRef.current = null; setMode('css'); };
    c.addEventListener('webglcontextlost', lost);
    return () => {
      c.removeEventListener('webglcontextlost', lost);
      glRef.current = null;
      setTimeout(() => { if (!c.isConnected) s.gl.getExtension('WEBGL_lose_context')?.loseContext(); }, 0);
    };
  }, []);

  // 读主题色（换色、换明暗时重新读）
  useEffect(() => {
    const el = wrap.current ?? document.documentElement;
    const read = (name: string, fb: string) => { const v = cssVar(name, el) || fb; return colorToRgba(v).slice(0, 3); };
    colors.current = [read('--accent', accent.hex), read('--vb-au-2', '#2F7BFF'), read('--vb-au-3', '#19C6C1'), read('--vb-au-4', '#FFB38A')];
    if (!fx.motion) draw();
  }, [accent.hex, isDark]); // eslint-disable-line react-hooks/exhaustive-deps

  // 画布尺寸
  useEffect(() => {
    const c = canvas.current;
    if (!c || !size.width) return;
    const k = dpr(1.5);
    c.width = Math.round(size.width * k);
    c.height = Math.round(size.height * k);
    if (!fx.motion) draw();
  }, [size.width, size.height]); // eslint-disable-line react-hooks/exhaustive-deps

  // 指针靠近时偏移
  useEffect(() => {
    if (!fx.motion || !finePointer()) return;
    const on = (e: PointerEvent) => {
      const el = wrap.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const rad = r.width * 0.3;
      const dx = (e.clientX - (r.left + r.width / 2)) / rad, dy = (e.clientY - (r.top + r.height / 2)) / rad;
      const d = Math.hypot(dx, dy);
      const near = Math.max(0, Math.min(1, (4.5 - d) / 3.5));
      const k = Math.min(1, d) / (d || 1);
      st.current.tox = dx * k * 0.045 * near;
      st.current.toy = -dy * k * 0.045 * near;
      st.current.tlx = -0.35 + (dx / (d || 1)) * 0.7 * near;
      st.current.tly = 0.5 - (dy / (d || 1)) * 0.5 * near;
    };
    window.addEventListener('pointermove', on, { passive: true });
    return () => window.removeEventListener('pointermove', on);
  }, [fx.motion]);

  function draw() {
    const s = glRef.current, c = canvas.current;
    if (!s || !c || !c.width || colors.current.length < 4) return;
    const { gl, u } = s;
    const v = st.current;
    gl.viewport(0, 0, c.width, c.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(u.uRes, c.width, c.height);
    gl.uniform1f(u.uTime, v.time);
    gl.uniform2f(u.uOff, v.ox, v.oy);
    gl.uniform2f(u.uLight, v.lx, v.ly);
    gl.uniform1f(u.uEnergy, fx.motion ? v.energy : Math.max(v.energy, 0.25));
    gl.uniform1f(u.uPulse, v.pulse);
    gl.uniform1f(u.uDark, isDark ? 1 : 0);
    gl.uniform1f(u.uFx, fx.intensity >= 1 ? 1 : 0.55);
    const [a, b, cc, d] = colors.current;
    gl.uniform3f(u.uC1, a[0], a[1], a[2]);
    gl.uniform3f(u.uC2, b[0], b[1], b[2]);
    gl.uniform3f(u.uC3, cc[0], cc[1], cc[2]);
    gl.uniform3f(u.uC4, d[0], d[1], d[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  useRafLoop((_t, dt) => {
    const v = st.current, s = sig.current;
    const targetE = Math.max(s.energy, s.thinking ? 0.85 : 0);
    v.energy += (targetE - v.energy) * Math.min(1, dt * 3.2);
    if (s.thinking) v.pulse = Math.max(v.pulse, 0.55);
    v.pulse *= Math.exp(-dt * 1.8);
    const ease = Math.min(1, dt * 2.6);
    v.ox += (v.tox - v.ox) * ease; v.oy += (v.toy - v.oy) * ease;
    v.lx += (v.tlx - v.lx) * ease; v.ly += (v.tly - v.ly) * ease;
    v.time += dt * (fx.intensity >= 1 ? 1 : 0.6) * (1 + v.energy * 0.6 + v.pulse * 1.2);
    draw();
  }, { active: mode === 'gl' && fx.motion, target: wrap });

  // 关闭特效：聚焦等状态变化时补画一帧
  useEffect(() => { if (!fx.motion) { st.current.energy = signal.energy; draw(); } }, [fx.motion, signal.energy, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={wrap} className={`vb-orb ${className}${signal.energy > 0 ? ' is-awake' : ''}${signal.thinking ? ' is-thinking' : ''}`} aria-hidden="true">
      {mode === 'gl' ? <canvas ref={canvas} className="vb-orb-canvas" /> : <OrbCss />}
    </div>
  );
}

/** CSS 光球：WebGL 不可用时的回退，也用在看板页和「问数据」弹窗里（不占 WebGL 上下文） */
export function OrbCss({ small = false }: { small?: boolean }) {
  return (
    <span className={`vb-orb-css${small ? ' is-small' : ''}`} aria-hidden="true">
      <i className="vb-orb-css-halo" />
      <i className="vb-orb-css-body" />
      <i className="vb-orb-css-swirl" />
      <i className="vb-orb-css-shine" />
    </span>
  );
}
