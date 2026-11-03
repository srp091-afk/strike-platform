"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Points, PointMaterial } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { AdditiveBlending, BackSide, CanvasTexture, Color, type Group, type ShaderMaterial } from "three";

export type PlasmaState = "idle" | "listening" | "thinking" | "speaking";

/** Симплекс-шум 3D (Ashima Arts / Ian McEwan, MIT). */
const SIMPLEX = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
`;

const CORE_VERTEX = /* glsl */ `
${SIMPLEX}
uniform float uTime;
uniform float uLevel;
uniform float uBass;
uniform float uTreble;
uniform float uTurb;
varying vec3 vNormalW;
varying vec3 vPos;
varying vec3 vView;
varying float vDisp;

void main() {
  vec3 dir = normalize(position);
  // Турбулентность (частота шума) растёт с громкостью голоса: поверхность «кипит» мельче и быстрее.
  float freq = 1.0 + uTurb * 1.4;
  float slow = snoise(dir * 1.5 * freq + vec3(0.0, uTime * 0.22, uTime * 0.14));
  float fast = snoise(dir * 4.2 * freq - vec3(uTime * 0.5, 0.0, uTime * 0.3));
  float wave = sin(dir.y * 8.0 - uTime * 4.5) * 0.5 + sin(dir.x * 5.0 + dir.z * 5.0 - uTime * 3.0) * 0.5;
  float disp = slow * (0.022 + uBass * 0.08)
             + fast * (0.006 + uTreble * 0.035)
             + wave * uLevel * 0.025;
  vec3 displaced = position + normal * disp;
  vDisp = disp;
  vPos = displaced;
  vNormalW = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(displaced, 1.0);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const CORE_FRAGMENT = /* glsl */ `
${SIMPLEX}
uniform float uTime;
uniform float uLevel;
uniform float uTurb;
uniform vec3 uDeep;
uniform vec3 uCrimson;
uniform vec3 uHot;
uniform vec3 uBright;
varying vec3 vNormalW;
varying vec3 vPos;
varying vec3 vView;
varying float vDisp;

void main() {
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(vView);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 2.2);
  float freq = 1.0 + uTurb * 1.3;
  float t = uTime;

  // Тёмная малиновая плазма: два слоя шума между глубоким бордо и кармином.
  float plasma = snoise(vPos * 1.6 * freq + vec3(0.0, t * 0.2, t * 0.1)) * 0.5 + 0.5;
  float plasma2 = snoise(vPos * 3.2 * freq - vec3(t * 0.25, t * 0.1, 0.0)) * 0.5 + 0.5;
  vec3 col = mix(uDeep, uCrimson * 0.6, smoothstep(0.15, 0.95, plasma));
  col = mix(col, uCrimson * 0.9, plasma2 * 0.2);

  // Волокнистые «нейронные» разряды: ridged-шум с доменным искажением, три масштаба нитей.
  vec3 q = vPos * 1.15 * freq;
  q += 0.65 * vec3(
    snoise(q * 0.8 + vec3(t * 0.10, 0.0, 0.0)),
    snoise(q * 0.8 + vec3(7.3, -t * 0.12, 0.0)),
    snoise(q * 0.8 + vec3(13.1, 0.0, t * 0.09))
  );
  float vA = pow(1.0 - abs(snoise(q * 1.7)), 9.0);
  float vB = pow(1.0 - abs(snoise(q * 3.3 + 5.0)), 11.0);
  float vC = pow(1.0 - abs(snoise(q * 6.4 - 3.0)), 14.0);
  float glow = 0.45 + uLevel * 1.6;
  col += uHot * (vA * 0.7 + vB * 0.5 + vC * 0.35) * glow;
  // Раскалённые узлы там, где нити пересекаются.
  col += uBright * pow(vA * vB, 0.7) * (0.25 + uLevel * 1.1);

  // Искры внутри сферы.
  float spark = smoothstep(0.93, 1.0, snoise(vPos * 24.0 * freq + t * 0.6));
  col += uBright * spark * (0.18 + uLevel * 0.6);

  // Кармин на ободке и общее внутреннее свечение.
  col += uHot * fres * (0.32 + uLevel * 1.1);
  col += uBright * pow(fres, 4.0) * (0.12 + uLevel * 0.5);
  gl_FragColor = vec4(col, 1.0);
}
`;

const HALO_VERTEX = /* glsl */ `
varying vec3 vNormalW;
varying vec3 vView;
void main() {
  vNormalW = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const HALO_FRAGMENT = /* glsl */ `
uniform float uLevel;
uniform vec3 uColor;
varying vec3 vNormalW;
varying vec3 vView;
void main() {
  float rim = pow(max(dot(normalize(vNormalW), normalize(vView)), 0.0), 3.2);
  float alpha = rim * (0.3 + uLevel * 0.9);
  gl_FragColor = vec4(uColor * (0.9 + uLevel * 1.2), alpha);
}
`;

const WAVES_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** Горизонтальная звуковая визуализация: столбики расходятся от центра к краям и затухают, как на референсе. */
const WAVES_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uLevel;
uniform float uBass;
uniform vec3 uColor;
varying vec2 vUv;

float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }

void main() {
  float dx = abs(vUv.x - 0.5) * 2.0;
  float y = abs(vUv.y - 0.5) * 2.0;
  float bars = 110.0;
  float idx = floor(dx * bars);
  float h = mix(hash(idx), 0.5 + 0.5 * sin(uTime * 7.0 + idx * 2.1 - dx * 14.0), 0.6);

  float envelope = pow(max(1.0 - dx, 0.0), 1.5) * smoothstep(0.0, 0.1, dx);
  float amp = (0.05 + uLevel * 1.15 + uBass * 0.45) * envelope * (0.2 + 0.8 * h);
  float barMask = smoothstep(0.44, 0.2, abs(fract(dx * bars) - 0.5));
  float body = smoothstep(amp, amp - 0.1, y) * barMask;

  float line = exp(-y * 70.0) * (1.0 - dx) * 0.75;
  float haze = exp(-y * 3.5) * envelope * (0.12 + uLevel * 1.2) * 0.6;
  float a = body * 0.9 + line + haze;
  gl_FragColor = vec4(uColor * a, a);
}
`;

/** Детерминированный генератор (mulberry32): точки не должны меняться между рендерами. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function useOrbitPoints(count: number, seed: number, near: number, spread: number) {
  return useMemo(() => {
    const random = seeded(seed);
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(2 * random() - 1);
      const radius = near + random() * spread;
      positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[index * 3 + 1] = radius * Math.cos(phi);
      positions[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }
    return positions;
  }, [count, seed, near, spread]);
}

/** Уровни голоса из частотного спектра: общий, низы (бас) и верха. Без анализатора — синтетическая «речь». */
function readAudio(analyser: AnalyserNode | null, data: Uint8Array<ArrayBuffer>, time: number) {
  if (!analyser) {
    const level = 0.45 + 0.25 * Math.sin(time * 6.5) * Math.sin(time * 2.3);
    return { level, bass: level, treble: level * 0.6 };
  }
  analyser.getByteFrequencyData(data);
  const third = Math.floor(data.length / 3);
  const average = (from: number, to: number) => {
    let sum = 0;
    for (let index = from; index < to; index += 1) sum += data[index]!;
    return sum / Math.max(1, to - from) / 255;
  };
  const bass = Math.min(1, average(0, third) * 1.6);
  const treble = Math.min(1, average(third * 2, data.length) * 3);
  return { level: Math.min(1, average(0, data.length) * 2.4), bass, treble };
}

function Plasma({ state, analyserRef }: { state: PlasmaState; analyserRef: RefObject<AnalyserNode | null> }) {
  const viewport = useThree((s) => s.viewport);
  const group = useRef<Group>(null);
  const core = useRef<ShaderMaterial>(null);
  const halo = useRef<ShaderMaterial>(null);
  const waves = useRef<ShaderMaterial>(null);
  const orbit = useRef<Group>(null);
  const data = useRef(new Uint8Array(new ArrayBuffer(128)));
  const smooth = useRef({ level: 0, bass: 0, treble: 0, turb: 0, scale: 1, speed: 1, time: 0 });
  const sparks = useOrbitPoints(1500, 7, 1.4, 0.6);
  const softDot = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.35, "rgba(255,255,255,0.45)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    return new CanvasTexture(canvas);
  }, []);
  const bokeh = useOrbitPoints(90, 21, 1.3, 0.9);

  const coreUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uLevel: { value: 0 },
      uBass: { value: 0 },
      uTreble: { value: 0 },
      uTurb: { value: 0 },
      uDeep: { value: new Color("#150008") },
      uCrimson: { value: new Color("#7a0624") },
      uHot: { value: new Color("#ff1f45") },
      uBright: { value: new Color("#ff9db0") },
    }),
    [],
  );
  const haloUniforms = useMemo(() => ({ uLevel: { value: 0 }, uColor: { value: new Color("#ff2d55") } }), []);
  const waveUniforms = useMemo(
    () => ({ uTime: { value: 0 }, uLevel: { value: 0 }, uBass: { value: 0 }, uColor: { value: new Color("#ff3358") } }),
    [],
  );

  useFrame((frame, delta) => {
    const s = smooth.current;
    const analyser = analyserRef.current;
    const clock = frame.clock.elapsedTime;

    let target = { level: 0, bass: 0, treble: 0 };
    let targetScale = 1;
    let targetSpeed = 1;

    if (state === "speaking") {
      target = readAudio(analyser, data.current, clock);
      targetScale = 1.05;
      targetSpeed = 2;
    } else if (state === "listening") {
      // Пользователь говорит: сфера сжимается и мелко «дрожит».
      const tremble = 0.12 + 0.1 * Math.abs(Math.sin(clock * 21));
      target = { level: tremble, bass: tremble * 0.5, treble: tremble * 1.2 };
      targetScale = 0.82;
      targetSpeed = 1.6;
    } else if (state === "thinking") {
      const pulse = 0.2 + 0.12 * Math.sin(clock * 5);
      target = { level: pulse, bass: pulse, treble: pulse * 0.5 };
      targetScale = 0.97;
      targetSpeed = 3;
    } else {
      const breathe = 0.5 + 0.5 * Math.sin(clock * 1.4);
      target = { level: 0.03, bass: 0.02 + breathe * 0.05, treble: 0.01 };
      targetScale = 1 + breathe * 0.04;
    }

    // Атака быстрая (удар голоса), спад медленнее: форма «перетекает», а не мигает.
    const attack = 1 - Math.exp(-delta * 18);
    const release = 1 - Math.exp(-delta * 6);
    const follow = (current: number, next: number) => current + (next - current) * (next > current ? attack : release);
    s.level = follow(s.level, target.level);
    s.bass = follow(s.bass, target.bass);
    s.treble = follow(s.treble, target.treble);
    s.turb += (target.level - s.turb) * (1 - Math.exp(-delta * 4));
    s.scale += (targetScale - s.scale) * (1 - Math.exp(-delta * 7));
    s.speed += (targetSpeed - s.speed) * (1 - Math.exp(-delta * 3));
    s.time += delta * s.speed;

    if (core.current) {
      core.current.uniforms.uTime!.value = s.time;
      core.current.uniforms.uLevel!.value = s.level;
      core.current.uniforms.uBass!.value = s.bass;
      core.current.uniforms.uTreble!.value = s.treble;
      core.current.uniforms.uTurb!.value = s.turb;
    }
    if (halo.current) halo.current.uniforms.uLevel!.value = s.level;
    if (waves.current) {
      waves.current.uniforms.uTime!.value = s.time;
      waves.current.uniforms.uLevel!.value = s.level;
      waves.current.uniforms.uBass!.value = s.bass;
    }
    if (group.current) {
      group.current.scale.setScalar(s.scale);
      group.current.rotation.y += delta * 0.12 * s.speed;
      group.current.rotation.x = Math.sin(s.time * 0.2) * 0.12;
    }
    if (orbit.current) {
      orbit.current.rotation.y -= delta * 0.05 * s.speed;
      orbit.current.rotation.z += delta * 0.02;
      const k = 1 + s.level * 0.2;
      orbit.current.scale.set(k, k * 0.68, k); // облако сплюснуто, чтобы частицы не упирались в края канваса
    }
  });

  // Плоскость волн лежит позади сферы (z = -0.8) и перекрывает весь кадр по ширине.
  const wavesWidth = viewport.width * 1.25;

  return (
    <>
      <mesh position={[0, 0, -0.8]}>
        <planeGeometry args={[wavesWidth, 2.2]} />
        <shaderMaterial
          ref={waves}
          vertexShader={WAVES_VERTEX}
          fragmentShader={WAVES_FRAGMENT}
          uniforms={waveUniforms}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>

      <group ref={group}>
        <mesh>
          <sphereGeometry args={[1, 192, 192]} />
          <shaderMaterial ref={core} vertexShader={CORE_VERTEX} fragmentShader={CORE_FRAGMENT} uniforms={coreUniforms} />
        </mesh>
        <mesh scale={1.4}>
          <sphereGeometry args={[1, 64, 64]} />
          <shaderMaterial
            ref={halo}
            vertexShader={HALO_VERTEX}
            fragmentShader={HALO_FRAGMENT}
            uniforms={haloUniforms}
            transparent
            depthWrite={false}
            side={BackSide}
            blending={AdditiveBlending}
          />
        </mesh>
      </group>

      <group ref={orbit}>
        <Points positions={sparks} stride={3} frustumCulled={false}>
          <PointMaterial
            transparent
            map={softDot}
            color="#ff2a4a"
            size={0.045}
            sizeAttenuation
            depthWrite={false}
            blending={AdditiveBlending}
          />
        </Points>
        {/* Крупные размытые алые частицы по краям — «боке». */}
        <Points positions={bokeh} stride={3} frustumCulled={false}>
          <PointMaterial
            transparent
            map={softDot}
            opacity={0.5}
            color="#ff1f45"
            size={0.38}
            sizeAttenuation
            depthWrite={false}
            blending={AdditiveBlending}
          />
        </Points>
      </group>
    </>
  );
}

function hasWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Плазменная 3D-сфера на WebGL: шейдер с симплекс-шумом, искажаемый спектром голоса, и звуковые волны по бокам. */
export function PlasmaSphere({
  state,
  analyserRef,
}: {
  state: PlasmaState;
  analyserRef: RefObject<AnalyserNode | null>;
}) {
  const [webgl, setWebgl] = useState<boolean | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWebgl(hasWebGL());
  }, []);

  return (
    <div aria-hidden className="relative h-72 w-full max-w-6xl [mask-image:radial-gradient(ellipse_at_center,black_60%,transparent_98%)] sm:h-[26rem]">
      {webgl === false ? (
        <div className="absolute inset-x-[20%] inset-y-[8%] rounded-full bg-[conic-gradient(from_0deg,#150008,#8c0428,#ff2d55,#8c0428,#150008)] opacity-80 blur-2xl" />
      ) : null}
      {webgl ? (
        <Canvas
          camera={{ position: [0, 0, 4.2], fov: 45 }}
          dpr={[1, 2]}
          gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
        >
          <Plasma state={state} analyserRef={analyserRef} />
        </Canvas>
      ) : null}
    </div>
  );
}
