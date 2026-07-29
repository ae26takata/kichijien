import * as THREE from "three";
import { startCamera, createFaceLandmarker } from "./app.js";

// 設定・状態管理
const mirrored = true;
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");

// Three.js 用一時ベクトル
const tmpVec = new THREE.Vector3();

// --- Three.js セットアップ ---
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true });
renderer.setClearColor(0x000000, 0); // 透明背景
renderer.setPixelRatio(window.devicePixelRatio || 1);
renderer.setSize(Math.max(1, canvas.width || 1), Math.max(1, canvas.height || 1), false);

const scene = new THREE.Scene();
const camera3d = new THREE.PerspectiveCamera(70, 1, 0.01, 10);
camera3d.position.z = 1;

// マスクメッシュの生成
const texture = new THREE.TextureLoader().load("/assets/mask.png", (tex) => {
  tex.flipY = false;
});
const plane = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({ map: texture, transparent: true })
);
scene.add(plane);

// 初期可視性とスケール
plane.visible = true;
plane.position.set(0, 0, 0);
plane.scale.set(0.2, 0.2, 1);

/**
 * 鏡像補正関数
 */
function correctedX(x) {
  return mirrored ? 1 - x : x;
}

/**
 * 安全な Canvas サイズ同期
 */
let _lastCanvasW = 0;
let _lastCanvasH = 0;
function syncCanvasSizeToVideo(videoEl, canvasEl, rendererEl, cameraEl) {
  const displayWidth = Math.round(videoEl.clientWidth || 0);
  const displayHeight = Math.round(videoEl.clientHeight || 0);

  if (!displayWidth || !displayHeight) return;

  const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
  const newW = Math.max(1, Math.round(displayWidth * dpr));
  const newH = Math.max(1, Math.round(displayHeight * dpr));

  if (newW === _lastCanvasW && newH === _lastCanvasH) return;

  _lastCanvasW = newW;
  _lastCanvasH = newH;

  canvasEl.width = newW;
  canvasEl.height = newH;

  rendererEl.setPixelRatio(dpr);
  rendererEl.setSize(newW, newH, false);

  cameraEl.aspect = newW / newH;
  cameraEl.updateProjectionMatrix();

  canvasEl.style.width = "100%";
  canvasEl.style.height = "100%";
}

/**
 * 正規化座標 (0..1) -> Three.js 3D ワールド座標変換
 */
function landmarkToWorld(xNorm, yNorm, z = 0.5, cameraEl) {
  const xCorr = correctedX(xNorm);

  // NDC（Normalized Device Coordinates: -1..1）変換
  const ndcX = xCorr * 2 - 1;
  const ndcY = -(yNorm * 2 - 1);

  tmpVec.set(ndcX, ndcY, z);
  tmpVec.unproject(cameraEl);
  return tmpVec.clone();
}

/**
 * メイン処理
 */
async function main() {
  await startCamera(video);

  video.style.display = "block";
  video.removeAttribute("hidden");
  video.muted = true;
  video.playsInline = true;
  await video.play().catch((e) => console.warn("video.play() failed", e));

  // 初回同期
  syncCanvasSizeToVideo(video, canvas, renderer, camera3d);

  // MediaPipe 初期化
  const faceLandmarker = await createFaceLandmarker();
  console.log("main: faceLandmarker ready");

  // リサイズイベント登録
  window.addEventListener("resize", () =>
    syncCanvasSizeToVideo(video, canvas, renderer, camera3d)
  );

  // 描画ループ
  async function renderLoop(flm) {
    syncCanvasSizeToVideo(video, canvas, renderer, camera3d);

    try {
      const results = flm.detectForVideo(video, performance.now());
      if (results && results.faceLandmarks && results.faceLandmarks.length > 0) {
        const lm = results.faceLandmarks[0];
        const nose = lm[1];
        const leftEye = lm[33];
        const rightEye = lm[263];

        // 目の左右（補正済み）
        const lx = correctedX(leftEye.x);
        const rx = correctedX(rightEye.x);

        // 顔の横幅（0..1）
        const faceWidthNorm = Math.abs(rx - lx);

        // 深度設定
        const depthFactor = 0.1;
        const zDepth = THREE.MathUtils.clamp(0.5 - faceWidthNorm * depthFactor, 0.05, 0.95);

        // 位置補正オフセット
        const xOffsetNorm = 0.05;
        const yOffsetNorm = -0.05;

        // ワールド位置へ変換して更新
        const adjNoseX = nose.x + xOffsetNorm;
        const adjNoseY = nose.y + yOffsetNorm;
        const worldPos = landmarkToWorld(adjNoseX, adjNoseY, zDepth, camera3d);
        plane.position.copy(worldPos);

        // 回転（目のラインに合わせる）
        const dx = rx - lx;
        const dy = rightEye.y - leftEye.y;
        plane.rotation.z = -Math.atan2(dy, dx);

        // スケール設定
        const baseScale = 0.1;
        const finalScale = Math.max(0.02, faceWidthNorm * baseScale);
        plane.scale.set(finalScale, finalScale, 1);

        plane.visible = true;
      }
    } catch (e) {
      console.error("renderLoop error", e);
    }

    renderer.render(scene, camera3d);
    requestAnimationFrame(() => renderLoop(flm));
  }

  renderLoop(faceLandmarker);
}

main().catch((e) => console.error("main error", e));