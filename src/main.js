import {
  FaceLandmarker,
  FilesetResolver
} from "@mediapipe/tasks-vision";

import * as THREE from "three";
import { startCamera, createFaceLandmarker } from "./app.js";

// 鏡像表示と補正
const mirrored = true;
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");

// Three.js 一時ベクタ
const tmpVec = new THREE.Vector3();

// Three.js セットアップ（初期サイズは後で同期）
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true });
renderer.setClearColor(0x000000, 0); // 透明背景
renderer.setPixelRatio(window.devicePixelRatio || 1);
renderer.setSize(Math.max(1, canvas.width || 1), Math.max(1, canvas.height || 1), false);

const scene = new THREE.Scene();
const camera3d = new THREE.PerspectiveCamera(70, 1, 0.01, 10);
camera3d.position.z = 1;

// マスク画像（上下反転を補正）
const texture = new THREE.TextureLoader().load("/assets/mask.png", (tex) => {
  tex.flipY = false;
});
const plane = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({ map: texture, transparent: true })
);
scene.add(plane);

// 初期可視化設定
plane.visible = true;
plane.position.set(0, 0, 0);
plane.scale.set(0.2, 0.2, 1);

// ミラー補正関数
function correctedX(x) {
  return mirrored ? 1 - x : x;
}

/*
  安全な canvas 同期
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

  canvasEl.style.width = '100%';
  canvasEl.style.height = '100%';
}

/*
  landmark -> Three.js world
  - ここでは canvas の内部ピクセル（canvas.width/height）を使って
    スクリーンピクセルに変換し、NDC を作って unproject する方式。
  - z は呼び出し側で動的に決める（顔幅に応じた深度）。
*/
function landmarkToWorld(xNorm, yNorm, z = 0.5, canvasEl, cameraEl) {
  const xCorr = correctedX(xNorm);

  // スクリーン（表示）ピクセル位置を計算
  // 注意: canvasEl.width/height は内部ピクセル数（dpr考慮済み）
  const sx = xCorr * canvasEl.clientWidth;
  const sy = yNorm * canvasEl.clientHeight;

  // NDC に変換（内部ピクセルではなく CSS 表示サイズを基準に）
  const ndcX = (sx / canvasEl.clientWidth) * 2 - 1;
  const ndcY = -((sy / canvasEl.clientHeight) * 2 - 1);

  tmpVec.set(ndcX, ndcY, z);
  tmpVec.unproject(cameraEl);
  return tmpVec.clone();
}

async function main() {
  // カメラ開始（高解像度を要求するよう app.js を修正している想定）
  await startCamera(video);

  // 強制表示と再生確保
  video.style.display = 'block';
  video.removeAttribute('hidden');
  video.muted = true;
  video.playsInline = true;
  await video.play().catch(e => console.warn('video.play() failed', e));

  // 初回同期
  syncCanvasSizeToVideo(video, canvas, renderer, camera3d);

  // MediaPipe 初期化
  const faceLandmarker = await createFaceLandmarker();
  console.log("main: faceLandmarker ready");

  // リサイズイベントで再同期
  window.addEventListener('resize', () => syncCanvasSizeToVideo(video, canvas, renderer, camera3d));

  // 描画ループ
  async function renderLoop(flm) {
    // 毎フレーム安全に同期
    syncCanvasSizeToVideo(video, canvas, renderer, camera3d);

    try {
      const results = flm.detectForVideo(video, performance.now());
      if (results && results.faceLandmarks && results.faceLandmarks.length > 0) {
        const lm = results.faceLandmarks[0];
        const nose = lm[1];
        const leftEye = lm[33];
        const rightEye = lm[263];

        // 目の左右（補正済み）
        // const lx = correctedX(leftEye.x);
        // const rx = correctedX(rightEye.x);

        // // 正規化幅（0..1）
        // const faceWidthNorm = Math.abs(rx - lx);

        // // 深度（顔幅に応じて近づける）
        // // 調整パラメータ depthFactor で見た目を変える
        // const depthFactor = 0.45; // 0.2〜0.6 を試す
        // // z は 0..1 の範囲で与える（unproject の z）
        // const zDepth = THREE.MathUtils.clamp(0.5 - faceWidthNorm * depthFactor, 0.05, 0.95);

        // // 位置（鼻中心） — canvas を渡して正確にスクリーン→NDC変換
        // const worldPos = landmarkToWorld(nose.x, nose.y, zDepth, canvas, camera3d);
        // plane.position.copy(worldPos);

        // // 回転（目のライン）
        // const dx = rx - lx;
        // const dy = rightEye.y - leftEye.y;
        // plane.rotation.z = -Math.atan2(dy, dx);

        // // スケール（正規化幅ベース、最小値を設定）
        // const baseScale = 0.55; // 見た目調整用（0.3〜0.8 を試す）
        // const finalScale = Math.max(0.05, faceWidthNorm * baseScale);
        // plane.scale.set(finalScale, finalScale, 1);

        // plane.visible = true;
        // 目の左右（補正済み）
        const lx = correctedX(leftEye.x);
        const rx = correctedX(rightEye.x);

        // 正規化幅（0..1）
        const faceWidthNorm = Math.abs(rx - lx);

        // 深度（顔幅に応じて近づける）
        const depthFactor = 0.1; // 必要なら 0.2〜0.6 を試す
        const zDepth = THREE.MathUtils.clamp(0.5 - faceWidthNorm * depthFactor, 0.05, 0.95);

        // --- 横オフセット（正規化座標） ---
        // 正の値で右へ、負の値で左へ移動します。
        // 今回は「少し左寄り」なので右へ寄せるため正の値を入れてあります。
        const xOffsetNorm = 0.05; // 試す値: 0.01, 0.02, 0.03
        const yOffsetNorm = -0.05; // 必要なら上下補正（正で下、負で上）

        // 鼻位置にオフセットを加えて world に変換
        const adjNoseX = nose.x + xOffsetNorm;
        const adjNoseY = nose.y + yOffsetNorm;
        const worldPos = landmarkToWorld(adjNoseX, adjNoseY, zDepth, canvas, camera3d);
        plane.position.copy(worldPos);

        // 回転（目のライン）
        const dx = rx - lx;
        const dy = rightEye.y - leftEye.y;
        plane.rotation.z = -Math.atan2(dy, dx);

        // スケール（正規化幅ベース、少し小さめに）
        const baseScale = 0.1; // 変更点：0.55 -> 0.48（小さくする）
        const finalScale = Math.max(0.02, faceWidthNorm * baseScale);
        plane.scale.set(finalScale, finalScale, 1);

        plane.visible = true;

      } else {
        // 顔が検出されないときは非表示にするか、前フレーム位置を維持する
        // plane.visible = false;
      }
    } catch (e) {
      console.error("renderLoop error", e);
    }

    renderer.render(scene, camera3d);
    requestAnimationFrame(() => renderLoop(flm));
  }

  // ループ開始
  renderLoop(faceLandmarker);
}

main().catch(e => console.error("main error", e));
