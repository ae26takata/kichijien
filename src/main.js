import * as THREE from "three";
import { GUI } from "lil-gui";
import { startCamera, createFaceLandmarker } from "./app.js";
import {
  correctedX,
  calculateDepth,
  calculateRotationZ,
  landmarkToWorld
} from "./utils/arUtils.js";

// DOM 要素
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");

// 調整用パラメータ
const params = {
  filterPath: "/assets/mask.png",
  xOffsetNorm: 0.05,
  yOffsetNorm: -0.05,
  baseScale: 0.1,
  depthFactor: 0.1,
  mirrored: true
};

const filterOptions = {
  "イチゴフレーム (mask.png)": "/assets/mask.png"
};

// --- Three.js セットアップ ---
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true });
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(window.devicePixelRatio || 1);
renderer.setSize(Math.max(1, canvas.width || 1), Math.max(1, canvas.height || 1), false);

const scene = new THREE.Scene();
const camera3d = new THREE.PerspectiveCamera(70, 1, 0.01, 10);
camera3d.position.z = 1;

const textureLoader = new THREE.TextureLoader();

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

gui.add(params, "filterPath", filterOptions)
  .name("Filter")
  .onChange((path) => {
    textureLoader.load(path, (newTex) => {
      newTex.flipY = false;
      plane.material.map = newTex;
      plane.material.needsUpdate = true;
    });
  });

const folderTransform = gui.addFolder("Position & Scale");
folderTransform.add(params, "xOffsetNorm", -0.5, 0.5, 0.01).name("X Offset");
folderTransform.add(params, "yOffsetNorm", -0.5, 0.5, 0.01).name("Y Offset");
folderTransform.add(params, "baseScale", 0.01, 1.0, 0.01).name("Scale");
folderTransform.add(params, "depthFactor", 0.0, 1.0, 0.01).name("Depth Factor");

gui.add(params, "mirrored")
  .name("Mirror Mode")
  .onChange((isMirrored) => {
    video.style.transform = isMirrored ? "scaleX(-1)" : "scaleX(1)";
  });

/**
 * Canvas サイズ同期
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

        const lx = correctedX(leftEye.x, params.mirrored);
        const rx = correctedX(rightEye.x, params.mirrored);
        const faceWidthNorm = Math.abs(rx - lx);

        // 深度計算
        const zDepth = calculateDepth(faceWidthNorm, params.depthFactor);

        // 位置計算
        const adjNoseX = nose.x + params.xOffsetNorm;
        const adjNoseY = nose.y + params.yOffsetNorm;
        const worldPos = landmarkToWorld(adjNoseX, adjNoseY, zDepth, camera3d, params.mirrored);
        plane.position.copy(worldPos);

        // 回転計算
        plane.rotation.z = calculateRotationZ(leftEye, rightEye, params.mirrored);

        // スケール計算
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