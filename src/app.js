// src/app.js
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

export async function startCamera(videoEl) {
  // const stream = await navigator.mediaDevices.getUserMedia({
  //   video: { facingMode: "user" }
  // });

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }
  });

  videoEl.srcObject = stream;
  await videoEl.play();
  return stream;
}

export async function createFaceLandmarker() {
  console.log('createFaceLandmarker: start');
  try {
    const vision = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
    console.log('vision loaded', vision);
    const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: "/mediapipe/face_landmarker.task" },
      runningMode: "VIDEO",
      numFaces: 1
    });
    console.log('faceLandmarker created');
    return faceLandmarker;
  } catch (e) {
    console.error('createFaceLandmarker error', e);
    throw e;
  }
}




// export async function createFaceLandmarker() {
//   const vision = await FilesetResolver.forVisionTasks(
//     "/node_modules/@mediapipe/tasks-vision/wasm"
//   );

//   const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
//     baseOptions: {
//       modelAssetPath:
//         "/node_modules/@mediapipe/tasks-vision/face_landmarker.task"
//     },
//     runningMode: "VIDEO",
//     numFaces: 1
//   });

//   return faceLandmarker;
// }
