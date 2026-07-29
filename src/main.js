import * as THREE from "three";
import { GUI } from "lil-gui";
import { startCamera, createFaceLandmarker } from "./app.js";

// DOM 要素
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");

// --- 調整用パラメータ設定 ---
const params = {
  filterPath: "/assets/mask.png", // 現在のフィルター画像
  xOffsetNorm: 0.05,             // 横位置補正
  yOffsetNorm: -0.05,            // 縦位置補正
  baseScale: 0.1,                // 基本スケール
  depthFactor: 0.1,              // 奥行き感（顔幅との係数）
  mirrored: true                 // 鏡像反転フラグ
};

// 選択可能なフィルターリスト（public/assets/ 配下に画像を置けば増やせます）
const filterOptions = {
  "イチゴフレーム (mask.png)": "/assets/mask.png"
  // 例: "ネコミミ": "/assets/cat_ears.png",
  // 例: "メガネ": "/assets/glasses.png"
};

// Three.js 用一時ベクトル
const tmpVec = new THREE.Vector3();

// --- Three.js セットアップ ---
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true });
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(window.devicePixelRatio || 1);
renderer.setSize(Math.max(1, canvas.width || 1), Math.max(1, canvas.height || 1), false);

const scene = new THREE.Scene();
const camera3d = new THREE.PerspectiveCamera(70, 1, 0.01, 10);
camera3d.position.z = 1;

// テクスチャローダー
const textureLoader = new THREE.TextureLoader();

// 初回マスクメッシュ生成
const texture = textureLoader.load(params.filterPath, (tex) => {
  tex.flipY = false;
});
const plane = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({ map: texture, transparent: true })
);
scene.add(plane);

plane.visible = true;
plane.position.set(0, 0, 0);
plane.scale.set(0.2, 0.2, 1);

// --- lil-gui のセットアップ ---
const gui = new GUI({ title: "AR Filter Controls" });

// 1. フィルター切替
gui.add(params, "filterPath", filterOptions)
  .name("Filter")
  .onChange((path) => {
    textureLoader.load(path, (newTex) => {
      newTex.flipY = false;
      plane.material.map = newTex;
      plane.material.needsUpdate = true;
    });
  });

// 2. 位置・サイズ・奥行きパラメータ
const folderTransform = gui.addFolder("Position & Scale");
folderTransform.add(params, "xOffsetNorm", -0.5, 0.5, 0.01).name("X Offset");
folderTransform.add(params, "yOffsetNorm", -0.5, 0.5, 0.01).name("Y Offset");
folderTransform.add(params, "baseScale", 0.01, 1.0, 0.01).name("Scale");
folderTransform.add(params, "depthFactor", 0.0, 1.0, 0.01).name("Depth Factor");

// 3. 鏡像切り替え（カメラ映像の反転と連動）
gui.add(params, "mirrored")
  .name("Mirror Mode")
  .onChange((isMirrored) => {
    if (isMirrored) {
      video.style.transform = "scaleX(-1)";
    } else {
      video.style.transform = "scaleX(1)";
    }
  });

/**
 * 鏡像補正関数
 */
function correctedX(x) {
  return params.mirrored ? 1 - x : x;
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

  syncCanvasSizeToVideo(video, canvas, renderer, camera3d);

  const faceLandmarker = await createFaceLandmarker();
  console.log("main: faceLandmarker ready");

  window.addEventListener("resize", () =>
    syncCanvasSizeToVideo(video, canvas, renderer, camera3d)
  );

  async function renderLoop(flm) {
    syncCanvasSizeToVideo(video, canvas, renderer, camera3d);

    try {
      const results = flm.detectForVideo(video, performance.now());
      if (results && results.faceLandmarks && results.faceLandmarks.length > 0) {
        const lm = results.faceLandmarks[0];
        const nose = lm[1];
        const leftEye = lm[33];
        const rightEye = lm[263];

        const lx = correctedX(leftEye.x);
        const rx = correctedX(rightEye.x);

        const faceWidthNorm = Math.abs(rx - lx);

        // GUI パラメータをリアルタイム反映
        const zDepth = THREE.MathUtils.clamp(
          0.5 - faceWidthNorm * params.depthFactor,
          0.05,
          0.95
        );

        const adjNoseX = nose.x + params.xOffsetNorm;
        const adjNoseY = nose.y + params.yOffsetNorm;
        const worldPos = landmarkToWorld(adjNoseX, adjNoseY, zDepth, camera3d);
        plane.position.copy(worldPos);

        const dx = rx - lx;
        const dy = rightEye.y - leftEye.y;
        plane.rotation.z = -Math.atan2(dy, dx);

        const finalScale = Math.max(0.02, faceWidthNorm * params.baseScale);
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