import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

/**
 * カメラの起動
 */
export async function startCamera(videoEl) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: "user",
      width: { ideal: 1280 },
      height: { ideal: 720 }
    }
  });

  videoEl.srcObject = stream;
  await videoEl.play();
  return stream;
}

/**
 * MediaPipe FaceLandmarker の初期化
 */
export async function createFaceLandmarker() {
  try {
    const vision = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
    const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: "/mediapipe/face_landmarker.task" },
      runningMode: "VIDEO",
      numFaces: 1
    });
    return faceLandmarker;
  } catch (e) {
    console.error("createFaceLandmarker error", e);
    throw e;
  }
}