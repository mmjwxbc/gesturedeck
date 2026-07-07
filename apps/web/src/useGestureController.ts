import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { FilesetResolver, HandLandmarker, type NormalizedLandmark } from "@mediapipe/tasks-vision";

export type GestureCommand = "goto_1" | "goto_2" | "goto_3" | "goto_4" | "prev" | "next";

type Options = {
  videoRef: RefObject<HTMLVideoElement | null>;
  enabled: boolean;
  onCommand: (command: GestureCommand) => void;
};

type GestureState = {
  status: string;
  lastGesture: string;
  lastCommand: string;
};

const WASM_ROOT = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.20/wasm";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task";

function isFingerOpen(landmarks: NormalizedLandmark[], tip: number, pip: number): boolean {
  return landmarks[tip].y < landmarks[pip].y;
}

function countRaisedFingers(landmarks: NormalizedLandmark[]): number {
  const index = isFingerOpen(landmarks, 8, 6);
  const middle = isFingerOpen(landmarks, 12, 10);
  const ring = isFingerOpen(landmarks, 16, 14);
  const pinky = isFingerOpen(landmarks, 20, 18);
  return [index, middle, ring, pinky].filter(Boolean).length;
}

function commandFromFingerCount(count: number): GestureCommand | null {
  if (count === 1) return "goto_1";
  if (count === 2) return "goto_2";
  if (count === 3) return "goto_3";
  if (count === 4) return "goto_4";
  return null;
}

export function useGestureController({ videoRef, enabled, onCommand }: Options): GestureState {
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const stableGestureRef = useRef<string>("none");
  const stableFramesRef = useRef(0);
  const lastTriggerAtRef = useRef(0);
  const yHistoryRef = useRef<number[]>([]);
  const onCommandRef = useRef(onCommand);

  const [state, setState] = useState<GestureState>({
    status: "idle",
    lastGesture: "none",
    lastCommand: "none",
  });

  useEffect(() => {
    onCommandRef.current = onCommand;
  }, [onCommand]);

  const trigger = useCallback((command: GestureCommand) => {
    const now = Date.now();
    if (now - lastTriggerAtRef.current < 1100) return;
    lastTriggerAtRef.current = now;
    setState((previous) => ({ ...previous, lastCommand: command }));
    onCommandRef.current(command);
  }, []);

  const analyzeHand = useCallback(
    (landmarks: NormalizedLandmark[]): void => {
      const wristY = landmarks[0].y;
      const history = yHistoryRef.current;
      history.push(wristY);
      if (history.length > 12) history.shift();

      let candidate: GestureCommand | null = null;
      let label = "none";

      if (history.length >= 8) {
        const deltaY = history[0] - history[history.length - 1];
        if (deltaY > 0.16) {
          candidate = "prev";
          label = "swipe_up";
          history.length = 0;
        } else if (deltaY < -0.16) {
          candidate = "next";
          label = "swipe_down";
          history.length = 0;
        }
      }

      if (!candidate) {
        const count = countRaisedFingers(landmarks);
        candidate = commandFromFingerCount(count);
        label = candidate ? `${count}_finger` : "none";
      }

      if (label === stableGestureRef.current) {
        stableFramesRef.current += 1;
      } else {
        stableGestureRef.current = label;
        stableFramesRef.current = 1;
      }

      setState((previous) => ({ ...previous, lastGesture: label }));

      if (candidate && stableFramesRef.current >= 8) {
        trigger(candidate);
        stableFramesRef.current = 0;
      }
    },
    [trigger],
  );

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      if (!enabled) return;
      setState((previous) => ({ ...previous, status: "loading model" }));
      const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
      if (cancelled) return;

      landmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: 1,
      });

      if (cancelled) return;
      setState((previous) => ({ ...previous, status: "running" }));

      const loop = () => {
        const video = videoRef.current;
        const landmarker = landmarkerRef.current;
        if (video && landmarker && video.readyState >= 2 && video.currentTime !== lastVideoTimeRef.current) {
          lastVideoTimeRef.current = video.currentTime;
          const result = landmarker.detectForVideo(video, performance.now());
          const landmarks = result.landmarks?.[0];
          if (landmarks) analyzeHand(landmarks);
        }
        rafRef.current = requestAnimationFrame(loop);
      };

      rafRef.current = requestAnimationFrame(loop);
    }

    setup().catch((error) => {
      console.error(error);
      setState((previous) => ({ ...previous, status: "gesture error" }));
    });

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
      setState((previous) => ({ ...previous, status: "idle" }));
    };
  }, [analyzeHand, enabled, videoRef]);

  return state;
}
