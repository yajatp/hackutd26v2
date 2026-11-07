"use client";

import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { XR, createXRStore } from "@react-three/xr";
import { Text } from "@react-three/drei";
import type { Mesh } from "three";

const store = createXRStore();

function SpinningCube() {
  const ref = useRef<Mesh>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt;
  });
  return (
    <mesh ref={ref} position={[0, 1.3, -1]}>
      <boxGeometry args={[0.2, 0.2, 0.2]} />
      <meshStandardMaterial color="#22c55e" />
    </mesh>
  );
}

export default function Scene() {
  const [support, setSupport] = useState("checking...");

  useEffect(() => {
    const xr = (navigator as Navigator & { xr?: { isSessionSupported(mode: string): Promise<boolean> } }).xr;
    if (!xr) return setSupport("no WebXR in this browser");
    xr.isSessionSupported("immersive-ar").then(ok => setSupport(ok ? "immersive-ar supported" : "immersive-ar NOT supported"));
  }, []);

  return (
    <div style={{ height: "100vh", background: "#0b0b0f", color: "white" }}>
      <div style={{ position: "absolute", zIndex: 1, padding: 16, display: "flex", gap: 12, alignItems: "center" }}>
        <button onClick={() => store.enterAR()} style={{ padding: "12px 20px", fontSize: 18, background: "#22c55e", color: "black", borderRadius: 8 }}>
          Enter AR
        </button>
        <span data-testid="xr-support">{support}</span>
      </div>
      <Canvas>
        <XR store={store}>
          <ambientLight intensity={0.8} />
          <directionalLight position={[1, 2, 1]} />
          <SpinningCube />
          <Text position={[0, 1.55, -1]} fontSize={0.06} color="white" anchorX="center">
            HackUTD passthrough test
          </Text>
        </XR>
      </Canvas>
    </div>
  );
}
