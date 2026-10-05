import * as THREE from "three";

// Vector3 の再生成コストを抑えるための内部用変数
const tmpVec = new THREE.Vector3();

/**
 * 鏡像反転補正
 * @param {number} x - 0..1 の正規化X座標
 * @param {boolean} mirrored - 鏡像モードかどうか
 * @returns {number} 補正後のX座標
 */
export function correctedX(x, mirrored = true) {
  return mirrored ? 1 - x : x;
}

/**
 * 正規化座標 (0..1) を NDC（Normalized Device Coordinates: -1..1）に変換
 * @param {number} xNorm - 0..1
 * @param {number} yNorm - 0..1
 * @param {boolean} mirrored
 * @returns {{ ndcX: number, ndcY: number }}
 */
export function calculateNdc(xNorm, yNorm, mirrored = true) {
  const xCorr = correctedX(xNorm, mirrored);
  const ndcX = xCorr * 2 - 1;
  const ndcY = -(yNorm * 2 - 1);
  return { ndcX, ndcY };
}

/**
 * 顔幅に応じた Z深度の算出
 * @param {number} faceWidthNorm - 顔の横幅 (0..1)
 * @param {number} depthFactor - 深度係数
 * @returns {number} 0.05 ~ 0.95 にクランプされた Z値
 */
export function calculateDepth(faceWidthNorm, depthFactor = 0.1) {
  return THREE.MathUtils.clamp(0.5 - faceWidthNorm * depthFactor, 0.05, 0.95);
}

/**
 * 2点（両目）の傾きから Z軸回転角度（ラジアン）を算出
 * @param {{x: number, y: number}} leftEye
 * @param {{x: number, y: number}} rightEye
 * @param {boolean} mirrored
 * @returns {number} 回転角度（ラジアン）
 */
export function calculateRotationZ(leftEye, rightEye, mirrored = true) {
  const lx = correctedX(leftEye.x, mirrored);
  const rx = correctedX(rightEye.x, mirrored);
  const dx = rx - lx;
  const dy = rightEye.y - leftEye.y;
  return -Math.atan2(dy, dx);
}

/**
 * 正規化座標 -> 3D ワールド座標変換
 * @param {number} xNorm 
 * @param {number} yNorm 
 * @param {number} z 
 * @param {THREE.Camera} camera 
 * @param {boolean} mirrored 
 * @returns {THREE.Vector3} ワールド座標
 */
export function landmarkToWorld(xNorm, yNorm, z, camera, mirrored = true) {
  const { ndcX, ndcY } = calculateNdc(xNorm, yNorm, mirrored);
  tmpVec.set(ndcX, ndcY, z);
  tmpVec.unproject(camera);
  return tmpVec.clone();
}