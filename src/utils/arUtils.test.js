import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  correctedX,
  calculateNdc,
  calculateDepth,
  calculateRotationZ,
  landmarkToWorld
} from "./arUtils.js";

describe("arUtils - 座標系・計算ユーティリティ", () => {

  describe("correctedX (鏡像補正)", () => {
    it("鏡像モード有効時、X座標が反転すること (0.2 -> 0.8)", () => {
      expect(correctedX(0.2, true)).toBeCloseTo(0.8);
    });

    it("鏡像モード無効時、X座標が維持されること (0.2 -> 0.2)", () => {
      expect(correctedX(0.2, false)).toBeCloseTo(0.2);
    });
  });

  describe("calculateNdc (正規化座標からNDCへの変換)", () => {
    it("画面中央 (0.5, 0.5) は NDC (0, 0) に変換されること", () => {
      const { ndcX, ndcY } = calculateNdc(0.5, 0.5, true);
      expect(ndcX).toBeCloseTo(0);
      expect(ndcY).toBeCloseTo(0);
    });

    it("画面左上 (鏡像時 0.0, 0.0) は NDC (1, 1) に変換されること", () => {
      const { ndcX, ndcY } = calculateNdc(0.0, 0.0, true);
      expect(ndcX).toBeCloseTo(1);
      expect(ndcY).toBeCloseTo(1);
    });
  });

  describe("calculateDepth (顔幅による深度制御)", () => {
    it("顔が大きく映る (幅0.5) ほど、Z値が小さく（手前に）なること", () => {
      const depthNear = calculateDepth(0.5, 0.1);
      const depthFar = calculateDepth(0.1, 0.1);
      expect(depthNear).toBeLessThan(depthFar);
    });

    it("範囲外の計算結果も 0.05 〜 0.95 にクランプされること", () => {
      expect(calculateDepth(10, 1.0)).toBe(0.05); // 最小限度
      expect(calculateDepth(-10, 1.0)).toBe(0.95); // 最大限度
    });
  });

  describe("calculateRotationZ (目の角度)", () => {
    it("両目が水平な場合、回転角は 0 ラジアンになること", () => {
      // MediaPipe の仕様：leftEye(#33)は向かって右(0.6)、rightEye(#263)は向かって左(0.4)
      const leftEye = { x: 0.6, y: 0.5 };
      const rightEye = { x: 0.4, y: 0.5 };

      const rot = calculateRotationZ(leftEye, rightEye, true);
      expect(rot).toBeCloseTo(0);
    });

    it("顔が右に傾いている場合（右目が下がる）、時計回り（負の回転角）になること", () => {
      const leftEye = { x: 0.6, y: 0.4 };  // 左目が上
      const rightEye = { x: 0.4, y: 0.6 }; // 右目が下（画面上でYが大きい）

      const rot = calculateRotationZ(leftEye, rightEye, true);
      // Three.js では時計回り回転は負の値になるのが正しい
      expect(rot).toBeLessThan(0);
    });
  });

  describe("landmarkToWorld (3Dワールド座標変換)", () => {
    it("PerspectiveCamera を使って Vector3 オブジェクトが正しく返されること", () => {
      const camera = new THREE.PerspectiveCamera(70, 1, 0.01, 10);
      camera.position.z = 1;
      camera.updateProjectionMatrix();

      const worldPos = landmarkToWorld(0.5, 0.5, 0.5, camera, true);
      
      expect(worldPos).toBeInstanceOf(THREE.Vector3);
      expect(worldPos.x).toBeCloseTo(0);
      expect(worldPos.y).toBeCloseTo(0);
    });
  });

});