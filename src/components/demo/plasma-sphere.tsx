"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Points, PointMaterial } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { AdditiveBlending, BackSide, Color, type Group, type ShaderMaterial } from "three";

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
varying vec3 vNormalW;
varying vec3 vPos;
varying vec3 vView;
varying float vDisp;

void main() {
  vec3 dir = normalize(position);
  // Медленное «дыхание» плазмы + быстрая рябь, амплитуда которых растёт с голосом.
  float slow = snoise(dir * 1.5 + vec3(0.0, uTime * 0.22, uTime * 0.14));
  float fast = snoise(dir * 4.2 - vec3(uTime * 0.5, 0.0, uTime * 0.3));
  // Волны, бегущие от полюса к полюсу в такт речи.
  float wave = sin(dir.y * 8.0 - uTime * 4.5) * 0.5 + sin(dir.x * 5.0 + dir.z * 5.0 - uTime * 3.0) * 0.5;
  float disp = slow * (0.07 + uBass * 0.34)
             + fast * (0.015 + uTreble * 0.12)
             + wave * uLevel * 0.1;
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
uniform vec3 uDeep;
uniform vec3 uViolet;
uniform vec3 uNeon;
uniform vec3 uAccent;
varying vec3 vNormalW;
varying vec3 vPos;
varying vec3 vView;
varying float vDisp;

void main() {
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(vView);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 2.4);

  // Переливающаяся плазма: два слоя шума, смешанные между глубоким космосом и фиолетовым.
  float plasma = snoise(vPos * 1.7 + vec3(0.0, uTime * 0.2, uTime * 0.1)) * 0.5 + 0.5;
  float plasma2 = snoise(vPos * 3.4 - vec3(uTime * 0.28, uTime * 0.12, 0.0)) * 0.5 + 0.5;
  vec3 col = mix(uDeep, uViolet, smoothstep(0.15, 0.85, plasma));
  col = mix(col, uAccent, plasma2 * 0.32 + max(vDisp, 0.0) * 1.4);

  // «Нейросеть»: тонкие светящиеся нити из ridged-шума в двух масштабах.
  float veinA = pow(1.0 - abs(snoise(vPos * 2.5 + vec3(uTime * 0.12, 0.0, uTime * 0.08))), 7.0);
  float veinB = pow(1.0 - abs(snoise(vPos * 5.2 - vec3(0.0, uTime * 0.18, 0.0))), 9.0);
  float glow = 0.55 + uLevel * 1.7;
  col += uNeon * (veinA * 0.95 + veinB * 0.55) * glow;

  // Светящийся ободок и внутреннее свечение.
  col += uViolet * fres * (0.9 + uLevel * 1.4);
  col += uNeon * pow(fres, 3.0) * (0.5 + uLevel);
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
  float rim = pow(max(dot(normalize(vNormalW), normalize(vView)), 0.0), 2.2);
  float alpha = rim * (0.35 + uLevel * 0.9);
  gl_FragColor = vec4(uColor * (0.8 + uLevel), alpha);
}
`;

/** Детерминированный генератор (mulberry32): точки орбиты не должны меняться между рендерами. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function useOrbitPoints(count: number) {
  return useMemo(() => {
    const random = seeded(7);
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(2 * random() - 1);
      const radius = 1.45 + random() * 0.55;
      positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[index * 3 + 1] = radius * Math.cos(phi);
      positions[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }
    return positions;
  }, [count]);
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
  const group = useRef<Group>(null);
  const core = useRef<ShaderMaterial>(null);
  const halo = useRef<ShaderMaterial>(null);
  const orbit = useRef<Group>(null);
  const data = useRef(new Uint8Array(new ArrayBuffer(128)));
  const smooth = useRef({ level: 0, bass: 0, treble: 0, scale: 1, speed: 1, time: 0 });
  const orbitPoints = useOrbitPoints(1400);

  const coreUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uLevel: { value: 0 },
      uBass: { value: 0 },
      uTreble: { value: 0 },
      uDeep: { value: new Color("#04041c") },
      uViolet: { value: new Color("#5b2bd6") },
      uNeon: { value: new Color("#5d8bff") },
      uAccent: { value: new Color("#a63cff") },
    }),
    [],
  );
  const haloUniforms = useMemo(() => ({ uLevel: { value: 0 }, uColor: { value: new Color("#6d4bff") } }), []);

  useFrame((frame, delta) => {
    const s = smooth.current;
    const analyser = analyserRef.current;

    let target = { level: 0, bass: 0, treble: 0 };
    let targetScale = 1;
    let targetSpeed = 1;

    if (state === "speaking") {
      target = readAudio(analyser, data.current, frame.clock.elapsedTime);
      targetScale = 1.04;
      targetSpeed = 2;
    } else if (state === "listening") {
      // Сжимается и мелко «дрожит», реагируя на тишину в ожидании речи.
      const tremble = 0.12 + 0.1 * Math.abs(Math.sin(frame.clock.elapsedTime * 21));
      target = { level: tremble, bass: tremble * 0.5, treble: tremble * 1.2 };
      targetScale = 0.8;
      targetSpeed = 1.6;
    } else if (state === "thinking") {
      const pulse = 0.2 + 0.12 * Math.sin(frame.clock.elapsedTime * 5);
      target = { level: pulse, bass: pulse, treble: pulse * 0.5 };
      targetScale = 0.96;
      targetSpeed = 3;
    } else {
      const breathe = 0.5 + 0.5 * Math.sin(frame.clock.elapsedTime * 1.4);
      target = { level: 0.03, bass: 0.02 + breathe * 0.05, treble: 0.01 };
      targetScale = 1 + breathe * 0.04;
    }

    // Лёгкое сглаживание: атака быстрая (удар голоса), спад медленнее — форма «перетекает», а не мигает.
    const attack = 1 - Math.exp(-delta * 18);
    const release = 1 - Math.exp(-delta * 6);
    const follow = (current: number, next: number) => current + (next - current) * (next > current ? attack : release);
    s.level = follow(s.level, target.level);
    s.bass = follow(s.bass, target.bass);
    s.treble = follow(s.treble, target.treble);
    s.scale += (targetScale - s.scale) * (1 - Math.exp(-delta * 7));
    s.speed += (targetSpeed - s.speed) * (1 - Math.exp(-delta * 3));
    s.time += delta * s.speed;

    if (core.current) {
      core.current.uniforms.uTime!.value = s.time;
      core.current.uniforms.uLevel!.value = s.level;
      core.current.uniforms.uBass!.value = s.bass;
      core.current.uniforms.uTreble!.value = s.treble;
    }
    if (halo.current) halo.current.uniforms.uLevel!.value = s.level;
    if (group.current) {
      group.current.scale.setScalar(s.scale);
      group.current.rotation.y += delta * 0.12 * s.speed;
      group.current.rotation.x = Math.sin(s.time * 0.2) * 0.12;
    }
    if (orbit.current) {
      orbit.current.rotation.y -= delta * 0.05 * s.speed;
      orbit.current.rotation.z += delta * 0.02;
      orbit.current.scale.setScalar(1 + s.level * 0.18);
    }
  });

  return (
    <>
      <group ref={group}>
        <mesh>
          <sphereGeometry args={[1, 192, 192]} />
          <shaderMaterial ref={core} vertexShader={CORE_VERTEX} fragmentShader={CORE_FRAGMENT} uniforms={coreUniforms} />
        </mesh>
        <mesh scale={1.22}>
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
        <Points positions={orbitPoints} stride={3} frustumCulled={false}>
          <PointMaterial
            transparent
            color="#8f7bff"
            size={0.018}
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

/** Плазменная 3D-сфера на WebGL: шейдер с симплекс-шумом, искажаемый спектром голоса. */
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
    <div aria-hidden className="relative size-72 sm:size-[26rem]">
      {webgl === false ? (
        <div className="absolute inset-[12%] rounded-full bg-[conic-gradient(from_0deg,#04041c,#5b2bd6,#5d8bff,#a63cff,#04041c)] opacity-80 blur-2xl" />
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
