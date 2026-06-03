import * as THREE from "three";
import { registerFrameCallback } from "./navigation.js";

const SECTION_COUNT = 5;

export function initScene() {
  const canvas = document.querySelector("#three-canvas");
  if (!canvas) {
    throw new Error("Canvas #three-canvas introuvable");
  }

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070d);

  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 1.2, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.45));
  const point = new THREE.PointLight(0x88a7ff, 2.2, 50);
  point.position.set(0, 3.2, 8);
  scene.add(point);

  const corridorLength = 56;
  const zoneSpacing = corridorLength / (SECTION_COUNT - 1);

  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a2030,
    roughness: 0.88,
    metalness: 0.1,
  });
  const wallGeometry = new THREE.BoxGeometry(0.35, 6.5, corridorLength);
  const leftWall = new THREE.Mesh(wallGeometry, wallMaterial);
  leftWall.position.set(-4.8, 1.6, -corridorLength / 2);
  scene.add(leftWall);
  const rightWall = leftWall.clone();
  rightWall.position.x = 4.8;
  scene.add(rightWall);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(13, corridorLength),
    new THREE.MeshStandardMaterial({ color: 0x0f1320, roughness: 0.95, metalness: 0.04 })
  );
  floor.rotation.x = -Math.PI * 0.5;
  floor.position.set(0, -1.65, -corridorLength / 2);
  scene.add(floor);

  const ceiling = floor.clone();
  ceiling.rotation.x = Math.PI * 0.5;
  ceiling.position.y = 4.9;
  scene.add(ceiling);

  const zoneAccent = [0x6d93ff, 0x79f6d6, 0xff78a6, 0xc591ff, 0xffce73];
  const zoneObjects = [];

  for (let i = 0; i < SECTION_COUNT; i += 1) {
    const group = new THREE.Group();
    group.position.set(0, 0.8, -i * zoneSpacing);

    const gate = new THREE.Mesh(
      new THREE.TorusGeometry(1.4, 0.07, 20, 70),
      new THREE.MeshStandardMaterial({
        color: zoneAccent[i],
        emissive: zoneAccent[i],
        emissiveIntensity: 0.32,
        roughness: 0.35,
        metalness: 0.65,
      })
    );
    gate.rotation.y = Math.PI * 0.5;
    group.add(gate);

    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.45, 1),
      new THREE.MeshStandardMaterial({
        color: zoneAccent[i],
        emissive: zoneAccent[i],
        emissiveIntensity: 0.15,
        roughness: 0.45,
        metalness: 0.5,
        transparent: true,
        opacity: 0.82,
      })
    );
    group.add(core);
    scene.add(group);
    zoneObjects.push({ group, gate, core });
  }

  const particlePositions = new Float32Array(900 * 3);
  for (let i = 0; i < 900; i += 1) {
    const i3 = i * 3;
    particlePositions[i3] = (Math.random() - 0.5) * 11;
    particlePositions[i3 + 1] = Math.random() * 6 - 1;
    particlePositions[i3 + 2] = -Math.random() * corridorLength;
  }
  const particles = new THREE.Points(
    new THREE.BufferGeometry(),
    new THREE.PointsMaterial({ color: 0x90a6d8, size: 0.05, sizeAttenuation: true })
  );
  particles.geometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
  scene.add(particles);

  const cameraKeyframes = [
    { position: new THREE.Vector3(0.0, 1.45, 1.5), lookAt: new THREE.Vector3(0, 1.0, -6) },
    { position: new THREE.Vector3(-2.1, 1.0, -13), lookAt: new THREE.Vector3(1.2, 1.1, -20) },
    { position: new THREE.Vector3(2.2, 1.65, -27), lookAt: new THREE.Vector3(-1.0, 1.0, -34) },
    { position: new THREE.Vector3(-2.4, 1.1, -41), lookAt: new THREE.Vector3(1.0, 1.1, -48) },
    { position: new THREE.Vector3(2.0, 1.6, -55), lookAt: new THREE.Vector3(-0.6, 1.1, -63) },
  ];
  const tmpCamPos = new THREE.Vector3();
  const tmpCamLook = new THREE.Vector3();

  const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

  function sampleCameraState(progress) {
    const scaled = clamp(progress, 0, 1) * (SECTION_COUNT - 1);
    const fromIndex = Math.floor(scaled);
    const toIndex = Math.min(fromIndex + 1, SECTION_COUNT - 1);
    const t = scaled - fromIndex;
    const from = cameraKeyframes[fromIndex];
    const to = cameraKeyframes[toIndex];
    tmpCamPos.copy(from.position).lerp(to.position, t);
    tmpCamLook.copy(from.lookAt).lerp(to.lookAt, t);
    return { position: tmpCamPos, lookAt: tmpCamLook };
  }

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const clock = new THREE.Clock();
  const startMs = performance.now();

  registerFrameCallback((camProgress) => {
    const elapsed = clock.getElapsedTime();
    const cam = sampleCameraState(camProgress);
    camera.position.copy(cam.position);
    camera.position.x += Math.sin(elapsed * 0.33) * 0.07;
    camera.position.y += Math.sin(elapsed * 0.8) * 0.04;
    camera.lookAt(cam.lookAt);

    point.position.z = camera.position.z + 8;
    zoneObjects.forEach((zone, index) => {
      zone.group.position.z = -index * zoneSpacing;
      zone.gate.rotation.z = elapsed * (0.4 + index * 0.08);
      zone.core.rotation.y = elapsed * 0.55;
      const dist = Math.abs(camera.position.z - zone.group.position.z);
      zone.group.scale.setScalar(1 + clamp((6 - dist) * 0.06, 0, 0.25));
    });
    particles.rotation.y = elapsed * 0.03;

    renderer.render(scene, camera);
  });

  return { renderer, scene, camera, startedAt: startMs };
}
