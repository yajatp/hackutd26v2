// The attack moment and motion polish for /twin (docs/TWIN-THEME.md "The attack moment").
// Preview: /twin/lab/fx.
export { diffFaults, fakedIds, confirmedFacilities, simulatedLine, failedLine, loudest, RESTS_ON_IT, type FxEvent, type FxKind, type FxNotice } from "./events";
export { approach, glitchSample, toastPose, waveAt, beaconAngle, chirpPlan, type GlitchSample } from "./motion";
export { useAttackFx, type AttackFx } from "./useAttackFx";
export { AlarmBeacon, type AlarmBeaconProps } from "./AlarmBeacon";
export { Shockwave, type ShockwaveProps } from "./Shockwave";
export { GlitchGauge, useGlitch, type GlitchGaugeProps } from "./Glitch";
export { Toast, drawToast, type ToastProps } from "./Toast";
export { chirp, unlockAudio, armAudioOnGesture, setMuted, isMuted, audioReady } from "./audio";
export { useEase, usePolish, type Vec3 } from "./ease";
