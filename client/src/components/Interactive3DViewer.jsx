import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  Group,
  Button,
  Text,
  Badge,
  ActionIcon,
  Tooltip,
  Paper,
  Stack,
  Box,
  SegmentedControl,
} from "@mantine/core";
import {
  IconRotate3d,
  IconZoomReset,
  IconEye,
  IconDownload,
  IconArrowsMaximize,
  IconCamera,
  IconHelp,
} from "@tabler/icons-react";

/**
 * Generates a crisp billboard text sprite for 3D annotations.
 */
function createTextSprite(text, {
  textColor = "#ffffff",
  bgColor = "rgba(13, 22, 38, 0.82)",
  borderColor = "#38bdf8",
  fontSize = 26,
  scale = [90, 24, 1],
} = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = 384;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");

  // Background pill
  ctx.fillStyle = bgColor;
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(8, 8, 368, 80, 16);
  ctx.fill();
  ctx.stroke();

  // Text
  ctx.font = `bold ${fontSize}px "Inter", "Segoe UI", Roboto, sans-serif`;
  ctx.fillStyle = textColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 192, 48);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({
    map: texture,
    depthTest: false,
    depthWrite: false,
    transparent: true,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(scale[0], scale[1], scale[2]);
  return sprite;
}

/**
 * Creates a thick 3D cylinder/tube between two points
 */
function createCylinderConnectingPoints(p1, p2, radius, material) {
  const v1 = new THREE.Vector3(...p1);
  const v2 = new THREE.Vector3(...p2);
  const dir = new THREE.Vector3().subVectors(v2, v1);
  const length = dir.length();
  if (length < 1e-4) return new THREE.Group();

  const geom = new THREE.CylinderGeometry(radius, radius, length, 16);
  geom.translate(0, length / 2, 0);
  geom.rotateX(Math.PI / 2);

  const mesh = new THREE.Mesh(geom, material);
  mesh.position.copy(v1);
  mesh.lookAt(v2);
  return mesh;
}

export function Interactive3DViewer({
  calcResult,
  formMounts = [],
  height = "100%",
  fullscreen = false,
  onDownloadPNG,
}) {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const animFrameIdRef = useRef(null);
  const centerTargetRef = useRef(new THREE.Vector3(2300, 0, 100));
  const defaultCamPosRef = useRef(new THREE.Vector3(2800, -800, 600));

  const [autoRotate, setAutoRotate] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [activePreset, setActivePreset] = useState("iso");

  // Extract vectors & coordinates
  const cg = calcResult?.inputs_echo?.cg || [2371.09, -28.66, 131.61];
  const traVec = calcResult?.tra?.vector || [0, 1, 0];
  const etraVec = calcResult?.eTRA?.vector || [0, 1, 0];
  const etraNearest = calcResult?.eTRA_nearest_point_mm || cg;
  const offsetDistance = calcResult?.cg_to_eTRA_offset_mm ?? 0;
  const misalignmentDeg = calcResult?.misalignment_3D_deg ?? 0;

  const mounts = (formMounts && formMounts.length > 0)
    ? formMounts
    : (calcResult?.inputs_echo?.mounts || []);

  const TRACE_DISTANCES = [-400, -200, 0, 200, 400];

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // ── Setup Scene ───────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0c121e");
    sceneRef.current = scene;

    const width = container.clientWidth || 800;
    const heightPx = container.clientHeight || 500;

    // ── Setup Camera (Z is UP for Automotive/Aero Dynamics) ───
    const camera = new THREE.PerspectiveCamera(45, width / heightPx, 1, 100000);
    camera.up.set(0, 0, 1); // Z-axis is Vertical
    cameraRef.current = camera;

    // ── Setup Renderer ────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true, // enables crisp canvas snapshot download
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, heightPx);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.innerHTML = "";
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // ── Setup Orbit Controls ──────────────────────────────────
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.screenSpacePanning = true;
    controls.maxDistance = 15000;
    controls.minDistance = 50;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 1.6;
    controlsRef.current = controls;

    // ── Lighting ──────────────────────────────────────────────
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight1.position.set(3000, -2000, 2500);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x7090b0, 0.7);
    dirLight2.position.set(-2000, 2000, -1000);
    scene.add(dirLight2);

    // ── Geometry Data Calculation ─────────────────────────────
    const traTrace = TRACE_DISTANCES.map((d) => [
      cg[0] + d * traVec[0],
      cg[1] + d * traVec[1],
      cg[2] + d * traVec[2],
    ]);

    const etraTrace = TRACE_DISTANCES.map((d) => [
      etraNearest[0] + d * etraVec[0],
      etraNearest[1] + d * etraVec[1],
      etraNearest[2] + d * etraVec[2],
    ]);

    // Compute bounding box around all key points
    const allPoints = [
      cg,
      etraNearest,
      ...traTrace,
      ...etraTrace,
      ...mounts.map((m) => [m.x, m.y, m.z]),
    ];

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    allPoints.forEach(([x, y, z]) => {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    });

    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    const midZ = (minZ + maxZ) / 2;
    const maxSpan = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 600);

    const centerTarget = new THREE.Vector3(midX, midY, midZ);
    centerTargetRef.current = centerTarget;
    controls.target.copy(centerTarget);

    // Isometric starting position
    const defaultCam = new THREE.Vector3(
      midX + maxSpan * 1.55,
      midY - maxSpan * 1.75,
      midZ + maxSpan * 1.25
    );
    defaultCamPosRef.current = defaultCam;
    camera.position.copy(defaultCam);
    camera.lookAt(centerTarget);

    // ── Visual Elements Group ─────────────────────────────────
    const rootGroup = new THREE.Group();
    scene.add(rootGroup);

    const labelsGroup = new THREE.Group();
    rootGroup.add(labelsGroup);

    // ── 1. Reference Floor & Bounding Grid ─────────────────────
    const floorZ = minZ - 60;
    const gridHelper = new THREE.GridHelper(maxSpan * 2.2, 22, 0x38bdf8, 0x1e293b);
    gridHelper.rotation.x = Math.PI / 2; // Orient to XY plane
    gridHelper.position.set(midX, midY, floorZ);
    rootGroup.add(gridHelper);

    // Bounding wireframe cage
    const boxGeom = new THREE.BoxGeometry(maxX - minX + 80, maxY - minY + 80, maxZ - minZ + 80);
    const boxEdges = new THREE.EdgesGeometry(boxGeom);
    const boxLine = new THREE.LineSegments(
      boxEdges,
      new THREE.LineBasicMaterial({ color: 0x22324d, transparent: true, opacity: 0.6 })
    );
    boxLine.position.set(midX, midY, midZ);
    rootGroup.add(boxLine);

    // ── 2. Axes Helper & Annotations ──────────────────────────
    const axesOrigin = new THREE.Vector3(minX - 40, minY - 40, floorZ);
    const axisLength = maxSpan * 0.45;

    // X Axis (Longitudinal) - Red
    const xEnd = axesOrigin.clone().add(new THREE.Vector3(axisLength, 0, 0));
    rootGroup.add(createCylinderConnectingPoints(axesOrigin.toArray(), xEnd.toArray(), 2.5, new THREE.MeshStandardMaterial({ color: 0xef4444 })));
    const xLabel = createTextSprite("X [Longitudinal]", { textColor: "#ef4444", borderColor: "#ef4444", fontSize: 24, scale: [110, 28, 1] });
    xLabel.position.copy(xEnd).add(new THREE.Vector3(25, 0, 0));
    labelsGroup.add(xLabel);

    // Y Axis (Lateral) - Green
    const yEnd = axesOrigin.clone().add(new THREE.Vector3(0, axisLength, 0));
    rootGroup.add(createCylinderConnectingPoints(axesOrigin.toArray(), yEnd.toArray(), 2.5, new THREE.MeshStandardMaterial({ color: 0x22c55e })));
    const yLabel = createTextSprite("Y [Lateral]", { textColor: "#22c55e", borderColor: "#22c55e", fontSize: 24, scale: [90, 28, 1] });
    yLabel.position.copy(yEnd).add(new THREE.Vector3(0, 25, 0));
    labelsGroup.add(yLabel);

    // Z Axis (Vertical) - Blue
    const zEnd = axesOrigin.clone().add(new THREE.Vector3(0, 0, axisLength));
    rootGroup.add(createCylinderConnectingPoints(axesOrigin.toArray(), zEnd.toArray(), 2.5, new THREE.MeshStandardMaterial({ color: 0x3b82f6 })));
    const zLabel = createTextSprite("Z [Vertical]", { textColor: "#38bdf8", borderColor: "#38bdf8", fontSize: 24, scale: [90, 28, 1] });
    zLabel.position.copy(zEnd).add(new THREE.Vector3(0, 0, 25));
    labelsGroup.add(zLabel);

    // ── 3. TRA (Torque Roll Axis) ──────────────────────────────
    // Solid smooth 3D tube for TRA
    const traMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00a8ff,
      emissiveIntensity: 0.35,
      roughness: 0.2,
      metalness: 0.4,
    });
    const traStart = traTrace[0];
    const traEnd = traTrace[traTrace.length - 1];
    rootGroup.add(createCylinderConnectingPoints(traStart, traEnd, 4.5, traMat));

    // Station points and spheres for TRA
    const traStationMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00f0ff,
      emissiveIntensity: 0.6,
      roughness: 0.1,
    });
    traTrace.forEach((pt, idx) => {
      const stationDist = TRACE_DISTANCES[idx];
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(7, 16, 16), traStationMat);
      sphere.position.set(...pt);
      rootGroup.add(sphere);

      const sign = stationDist >= 0 ? `+${stationDist}` : `${stationDist}`;
      const sprite = createTextSprite(`TRA ${sign}`, {
        textColor: "#00f0ff",
        borderColor: "#00b4d8",
        fontSize: 22,
        scale: [72, 22, 1],
      });
      sprite.position.set(pt[0] + 15, pt[1], pt[2] + 18);
      labelsGroup.add(sprite);
    });

    // ── 4. eTRA (Elastic Torque Roll Axis) ─────────────────────
    const etraMat = new THREE.MeshStandardMaterial({
      color: 0xf72585,
      emissive: 0xd90429,
      emissiveIntensity: 0.4,
      roughness: 0.2,
      metalness: 0.4,
    });
    const etraStart = etraTrace[0];
    const etraEnd = etraTrace[etraTrace.length - 1];
    rootGroup.add(createCylinderConnectingPoints(etraStart, etraEnd, 4.5, etraMat));

    // Station spheres for eTRA
    const etraStationMat = new THREE.MeshStandardMaterial({
      color: 0xf72585,
      emissive: 0xf72585,
      emissiveIntensity: 0.6,
      roughness: 0.1,
    });
    etraTrace.forEach((pt, idx) => {
      const stationDist = TRACE_DISTANCES[idx];
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(7, 16, 16), etraStationMat);
      sphere.position.set(...pt);
      rootGroup.add(sphere);

      const sign = stationDist >= 0 ? `+${stationDist}` : `${stationDist}`;
      const sprite = createTextSprite(`eTRA ${sign}`, {
        textColor: "#ff4d94",
        borderColor: "#f72585",
        fontSize: 22,
        scale: [78, 22, 1],
      });
      sprite.position.set(pt[0] - 15, pt[1], pt[2] - 18);
      labelsGroup.add(sprite);
    });

    // ── 5. Engine Center of Gravity (CG) ──────────────────────
    const cgMat = new THREE.MeshStandardMaterial({
      color: 0xffbe0b,
      emissive: 0xffa000,
      emissiveIntensity: 0.6,
      roughness: 0.15,
      metalness: 0.5,
    });
    const cgMesh = new THREE.Mesh(new THREE.SphereGeometry(15, 24, 24), cgMat);
    cgMesh.position.set(...cg);
    rootGroup.add(cgMesh);

    // Subtle pulsating ring around CG
    const cgRingGeom = new THREE.RingGeometry(20, 24, 32);
    const cgRingMat = new THREE.MeshBasicMaterial({
      color: 0xffbe0b,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.5,
    });
    const cgRing = new THREE.Mesh(cgRingGeom, cgRingMat);
    cgRing.position.set(...cg);
    rootGroup.add(cgRing);

    const cgLabel = createTextSprite("Engine CG", {
      textColor: "#ffd166",
      borderColor: "#ffbe0b",
      bgColor: "rgba(35, 25, 5, 0.85)",
      fontSize: 26,
      scale: [95, 26, 1],
    });
    cgLabel.position.set(cg[0], cg[1], cg[2] + 32);
    labelsGroup.add(cgLabel);

    // ── 6. 3D eTRA Nearest Point ──────────────────────────────
    const etraNearestMat = new THREE.MeshStandardMaterial({
      color: 0xfb5607,
      emissive: 0xd84315,
      emissiveIntensity: 0.6,
      roughness: 0.2,
      metalness: 0.5,
    });
    const etraNearMesh = new THREE.Mesh(new THREE.SphereGeometry(14, 24, 24), etraNearestMat);
    etraNearMesh.position.set(...etraNearest);
    rootGroup.add(etraNearMesh);

    const nearLabel = createTextSprite("eTRA Nearest Pt", {
      textColor: "#ff7b00",
      borderColor: "#fb5607",
      bgColor: "rgba(35, 18, 5, 0.85)",
      fontSize: 24,
      scale: [120, 26, 1],
    });
    nearLabel.position.set(etraNearest[0], etraNearest[1], etraNearest[2] - 30);
    labelsGroup.add(nearLabel);

    // ── 7. 3D Offset Line (connecting CG to eTRA Nearest) ─────
    const offsetMat = new THREE.LineDashedMaterial({
      color: 0xe2e8f0,
      dashSize: 8,
      gapSize: 4,
      linewidth: 2,
    });
    const offsetGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(...cg),
      new THREE.Vector3(...etraNearest),
    ]);
    const offsetLine = new THREE.Line(offsetGeom, offsetMat);
    offsetLine.computeLineDistances();
    rootGroup.add(offsetLine);

    // Offset distance badge in the middle
    const midOffset = [
      (cg[0] + etraNearest[0]) / 2,
      (cg[1] + etraNearest[1]) / 2,
      (cg[2] + etraNearest[2]) / 2,
    ];
    const offsetLabel = createTextSprite(`Offset = ${offsetDistance.toFixed(1)} mm`, {
      textColor: "#e2e8f0",
      borderColor: "#94a3b8",
      bgColor: "rgba(15, 23, 42, 0.85)",
      fontSize: 22,
      scale: [130, 24, 1],
    });
    offsetLabel.position.set(midOffset[0], midOffset[1], midOffset[2] + 16);
    labelsGroup.add(offsetLabel);

    // ── 8. Mounts (M1, M2, M3) ────────────────────────────────
    const mountColorPalette = {
      "M1 (LH)": { color: 0x06d6a0, hex: "#06d6a0" },
      "M2 (RH)": { color: 0x8338ec, hex: "#8338ec" },
      "M3 (RR)": { color: 0xff9f1c, hex: "#ff9f1c" },
    };

    mounts.forEach((m, idx) => {
      const colInfo = mountColorPalette[m.name] || {
        color: idx === 0 ? 0x06d6a0 : idx === 1 ? 0x8338ec : 0xff9f1c,
        hex: idx === 0 ? "#06d6a0" : idx === 1 ? "#8338ec" : "#ff9f1c",
      };

      // 3D Pyramid (Tetrahedron/Cone) marker
      const mountGeom = new THREE.ConeGeometry(15, 26, 4);
      mountGeom.rotateX(Math.PI / 2); // Point upwards in Z
      const mountMat = new THREE.MeshStandardMaterial({
        color: colInfo.color,
        emissive: colInfo.color,
        emissiveIntensity: 0.35,
        roughness: 0.3,
        metalness: 0.5,
      });
      const mountMesh = new THREE.Mesh(mountGeom, mountMat);
      mountMesh.position.set(m.x, m.y, m.z);
      rootGroup.add(mountMesh);

      // Mount base indicator connecting to ground
      const dropLineGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(m.x, m.y, m.z),
        new THREE.Vector3(m.x, m.y, floorZ),
      ]);
      const dropLine = new THREE.Line(
        dropLineGeom,
        new THREE.LineDashedMaterial({ color: colInfo.color, dashSize: 4, gapSize: 4, opacity: 0.3, transparent: true })
      );
      dropLine.computeLineDistances();
      rootGroup.add(dropLine);

      // Mount Label
      const mLabel = createTextSprite(m.name, {
        textColor: colInfo.hex,
        borderColor: colInfo.hex,
        fontSize: 24,
        scale: [95, 26, 1],
      });
      mLabel.position.set(m.x, m.y, m.z + 28);
      labelsGroup.add(mLabel);
    });

    // ── Resize Observer ───────────────────────────────────────
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // ── Animation Loop ────────────────────────────────────────
    let time = 0;
    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate);
      time += 0.02;

      // Subtle pulse on CG ring
      if (cgRing) {
        cgRing.rotation.z = time * 0.5;
        cgRing.scale.setScalar(1 + 0.08 * Math.sin(time * 3));
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // ── Cleanup ───────────────────────────────────────────────
    return () => {
      resizeObserver.disconnect();
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [calcResult, formMounts]);

  // Sync auto-rotation state with controls
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = autoRotate;
    }
  }, [autoRotate]);

  // Camera preset handlers
  const setCameraView = (viewKey) => {
    if (!cameraRef.current || !controlsRef.current) return;
    const target = centerTargetRef.current;
    const maxSpan = 900;
    setActivePreset(viewKey);

    switch (viewKey) {
      case "iso":
        cameraRef.current.position.set(
          target.x + maxSpan * 1.5,
          target.y - maxSpan * 1.7,
          target.z + maxSpan * 1.2
        );
        break;
      case "top": // XY Plane (looking straight down +Z)
        cameraRef.current.position.set(target.x, target.y, target.z + maxSpan * 2.8);
        break;
      case "front": // YZ Plane (looking along +X)
        cameraRef.current.position.set(target.x + maxSpan * 2.8, target.y, target.z);
        break;
      case "side": // ZX Plane (looking along +Y)
        cameraRef.current.position.set(target.x, target.y - maxSpan * 2.8, target.z);
        break;
      default:
        break;
    }
    cameraRef.current.lookAt(target);
    controlsRef.current.target.copy(target);
    controlsRef.current.update();
  };

  const handleReset = () => {
    if (!cameraRef.current || !controlsRef.current) return;
    cameraRef.current.position.copy(defaultCamPosRef.current);
    controlsRef.current.target.copy(centerTargetRef.current);
    controlsRef.current.update();
    setActivePreset("iso");
  };

  const handleCaptureSnapshot = () => {
    if (!rendererRef.current) return;
    const dataUrl = rendererRef.current.domElement.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `engine_nvh_3d_interactive_snapshot_${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Box
      style={{
        position: "relative",
        width: "100%",
        height: height,
        minHeight: fullscreen ? "74vh" : 480,
        borderRadius: 8,
        overflow: "hidden",
        border: "1px solid #30363d",
        background: "#0c121e",
      }}
    >
      {/* 3D WebGL Canvas Container */}
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          cursor: "grab",
        }}
        onMouseDown={(e) => {
          if (e.currentTarget) e.currentTarget.style.cursor = "grabbing";
        }}
        onMouseUp={(e) => {
          if (e.currentTarget) e.currentTarget.style.cursor = "grab";
        }}
      />

      {/* Top Floating Controls Toolbar */}
      <Paper
        p={6}
        radius="md"
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          background: "rgba(15, 23, 42, 0.85)",
          backdropFilter: "blur(10px)",
          border: "1px solid #334155",
          zIndex: 10,
        }}
      >
        <Group gap={6} wrap="wrap">
          <SegmentedControl
            size="xs"
            value={activePreset}
            onChange={(val) => setCameraView(val)}
            data={[
              { label: "Iso 3D", value: "iso" },
              { label: "Front (YZ)", value: "front" },
              { label: "Top (XY)", value: "top" },
              { label: "Side (ZX)", value: "side" },
            ]}
          />

          <Tooltip label={autoRotate ? "Pause Auto-Rotation" : "Start 3D Turntable Auto-Rotation"}>
            <ActionIcon
              size="sm"
              variant={autoRotate ? "filled" : "default"}
              color="indigo"
              onClick={() => setAutoRotate((prev) => !prev)}
            >
              <IconRotate3d size={15} />
            </ActionIcon>
          </Tooltip>

          <Tooltip label="Reset Camera Position">
            <ActionIcon size="sm" variant="default" onClick={handleReset}>
              <IconZoomReset size={15} />
            </ActionIcon>
          </Tooltip>

          <Tooltip label="Capture High-Res Snapshot (PNG)">
            <ActionIcon size="sm" variant="light" color="cyan" onClick={handleCaptureSnapshot}>
              <IconCamera size={15} />
            </ActionIcon>
          </Tooltip>

          {onDownloadPNG && (
            <Tooltip label="Download Full-Res Matplotlib Plot">
              <ActionIcon size="sm" variant="light" color="teal" onClick={onDownloadPNG}>
                <IconDownload size={15} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      </Paper>

      {/* Top-Left Telemetry & Legend Card */}
      <Paper
        p="xs"
        radius="md"
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          background: "rgba(13, 22, 38, 0.88)",
          backdropFilter: "blur(10px)",
          border: "1px solid #334155",
          zIndex: 10,
          maxWidth: 300,
        }}
      >
        <Stack gap={4}>
          <Group justify="space-between" gap="xs">
            <Text fw={700} size="xs" c="bright">
              3D Dynamic Geometry
            </Text>
            <Badge size="xs" color="blue" variant="light">
              Interactive WebGL
            </Badge>
          </Group>

          <Group gap={8} wrap="wrap" mt={2}>
            <Group gap={4}>
              <Box style={{ width: 10, height: 10, borderRadius: "50%", background: "#00f0ff" }} />
              <Text size="11px" c="cyan" fw={600}>TRA</Text>
            </Group>
            <Group gap={4}>
              <Box style={{ width: 10, height: 10, borderRadius: "50%", background: "#f72585" }} />
              <Text size="11px" c="pink" fw={600}>eTRA</Text>
            </Group>
            <Group gap={4}>
              <Box style={{ width: 10, height: 10, borderRadius: "50%", background: "#ffbe0b" }} />
              <Text size="11px" c="yellow" fw={600}>Engine CG</Text>
            </Group>
            <Group gap={4}>
              <Box style={{ width: 10, height: 10, borderRadius: "50%", background: "#fb5607" }} />
              <Text size="11px" c="orange" fw={600}>eTRA Nearest</Text>
            </Group>
            <Group gap={4}>
              <Box style={{ width: 8, height: 8, background: "#06d6a0", transform: "rotate(45deg)" }} />
              <Text size="11px" c="teal" fw={600}>M1</Text>
            </Group>
            <Group gap={4}>
              <Box style={{ width: 8, height: 8, background: "#8338ec", transform: "rotate(45deg)" }} />
              <Text size="11px" c="violet" fw={600}>M2</Text>
            </Group>
            <Group gap={4}>
              <Box style={{ width: 8, height: 8, background: "#ff9f1c", transform: "rotate(45deg)" }} />
              <Text size="11px" c="amber" fw={600}>M3</Text>
            </Group>
          </Group>

          <Box mt={4} pt={4} style={{ borderTop: "1px solid #1e293b" }}>
            <Group justify="space-between" gap="xs">
              <Text size="10px" c="dimmed">3D Misalignment:</Text>
              <Text size="10px" fw={700} c={misalignmentDeg <= 5 ? "green" : "orange"}>
                {misalignmentDeg.toFixed(2)}°
              </Text>
            </Group>
            <Group justify="space-between" gap="xs">
              <Text size="10px" c="dimmed">3D CG-eTRA Offset:</Text>
              <Text size="10px" fw={700} c={offsetDistance <= 25 ? "green" : "orange"}>
                {offsetDistance.toFixed(1)} mm
              </Text>
            </Group>
          </Box>
        </Stack>
      </Paper>

      {/* Bottom User Interaction Hint Bar */}
      <Box
        style={{
          position: "absolute",
          bottom: 10,
          left: "50%",
          transform: "translateX(-50%)",
          background: "rgba(15, 23, 42, 0.75)",
          backdropFilter: "blur(6px)",
          padding: "4px 14px",
          borderRadius: 20,
          border: "1px solid rgba(51, 65, 85, 0.6)",
          zIndex: 10,
          pointerEvents: "none",
        }}
      >
        <Text size="11px" c="dimmed">
          🖱️ <b>Left Click + Drag:</b> Rotate 3D &nbsp;|&nbsp; <b>Right Click:</b> Pan &nbsp;|&nbsp; <b>Scroll:</b> Zoom
        </Text>
      </Box>
    </Box>
  );
}
