/* ============================================================
   1. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
   ============================================================ */
let scene, camera, renderer, clock;
let playerGroup;
let road, roadGrid = [], roadSideLines = [];
let buildings = [], buildingWindows = [];
let distantBuildings = [];
let streetLights = [], halos = [];
let obstacles = [];
let coins = [];
let particles = [];
let speedLines = [];
let playerTrail = [];
let dustPool = [];

let gameState = 'start';
let lane = 1;
const LANE_X = [-2.5, 0, 2.5];
const LANE_WIDTH = 2.5;

let distance = 0;
let speed = 18;
const START_SPEED = 18;
const MAX_SPEED = 55;

let coinsThisRun = 0;
let best = Number(localStorage.getItem('neonRunner3DBest') || 0);

let soundOn = localStorage.getItem('neonRunner3DSound') !== 'off';
let audioCtx = null;

let spawnTimer = 0;
let coinTimer = 0;

const playerState = {
  x: 0, y: 0, vy: 0, targetX: 0,
  isJumping: false, isSliding: false,
  slideTimer: 0, hitboxScale: 1.0,
  alive: true,
  runPhase: 0
};

const GRAVITY = -65;
const JUMP_FORCE = 22;
const SLIDE_DURATION = 0.7;
const PLAYER_BASE_HEIGHT = 2.6;
const SLIDE_HITBOX_SCALE = 0.5;

/* ============================================================
   2. UI
   ============================================================ */
const hudDist = document.getElementById('hudDist');
const hudCoins = document.getElementById('hudCoins');
const hudBest = document.getElementById('hudBest');
const startScreen = document.getElementById('startScreen');
const pauseScreen = document.getElementById('pauseScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const finalDist = document.getElementById('finalDist');
const finalCoins = document.getElementById('finalCoins');
const finalBest = document.getElementById('finalBest');
const newRecordEl = document.getElementById('newRecord');
const startBtn = document.getElementById('startBtn');
const resumeBtn = document.getElementById('resumeBtn');
const restartBtn = document.getElementById('restartBtn');
const soundBtn = document.getElementById('soundBtn');

hudBest.textContent = best;

/* ============================================================
   3. ЗВУК
   ============================================================ */
function initAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { audioCtx = null; }
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

function playTone(freq, duration, type = 'sine', volume = 0.15, slideTo = null) {
  if (!soundOn || !audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, audioCtx.currentTime + duration);
  gain.gain.setValueAtTime(volume, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

const sfx = {
  jump:  () => playTone(400, 0.2, 'square', 0.1, 750),
  land:  () => playTone(140, 0.1, 'triangle', 0.12, 70),
  coin:  () => { playTone(900, 0.08, 'sine', 0.12); setTimeout(() => playTone(1350, 0.12, 'sine', 0.1), 60); },
  death: () => { playTone(280, 0.5, 'sawtooth', 0.2, 50); setTimeout(() => playTone(160, 0.6, 'sawtooth', 0.15, 30), 120); },
  pause: () => playTone(600, 0.1, 'sine', 0.08)
};

/* ============================================================
   4. РЕНДЕР + ОСВЕЩЕНИЕ
   ============================================================ */
function initThree() {
  const canvas = document.getElementById('game');

  scene = new THREE.Scene();
  // Неоновый фиолетовый туман — растворяет дальние объекты
  scene.fog = new THREE.FogExp2(0x1a0a3a, 0.012);

  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 400);
  camera.position.set(0, 5.5, 9);
  camera.lookAt(0, 1.5, -10);

  renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: false, powerPreference: 'high-performance'
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  if ('outputColorSpace' in renderer) {
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  clock = new THREE.Clock();

  setupLights();
  buildSky();
  buildWorld();
  buildPlayer();
  buildSpeedLines();

  window.addEventListener('resize', onResize);
}

function setupLights() {
  // Общий свет — холодный
  scene.add(new THREE.AmbientLight(0x334466, 0.9));

  // Hemisphere — небо фиолетовое, земля тёмная
  const hemi = new THREE.HemisphereLight(0x8844ff, 0x220033, 0.7);
  scene.add(hemi);

  // Главный свет с тенями
  const dir = new THREE.DirectionalLight(0xaaccff, 1.3);
  dir.position.set(10, 25, 8);
  dir.castShadow = true;
  dir.shadow.mapSize.set(2048, 2048);
  dir.shadow.camera.left = -30;
  dir.shadow.camera.right = 30;
  dir.shadow.camera.top = 30;
  dir.shadow.camera.bottom = -30;
  dir.shadow.camera.near = 1;
  dir.shadow.camera.far = 80;
  dir.shadow.bias = -0.0004;
  scene.add(dir);

  // Неоновые цвета — cyan / pink / purple
  const cyan = new THREE.PointLight(0x00ffff, 3, 35, 2);
  cyan.position.set(-12, 9, 8);
  scene.add(cyan);

  const pink = new THREE.PointLight(0xff2e63, 3, 35, 2);
  pink.position.set(12, 9, 8);
  scene.add(pink);

  const purple = new THREE.PointLight(0xa855f7, 2.5, 40, 2);
  purple.position.set(0, 12, -15);
  scene.add(purple);

  // Свет сверху над игроком
  const top = new THREE.PointLight(0xffffff, 1.5, 25, 2);
  top.position.set(0, 14, 2);
  scene.add(top);
}

/* ============================================================
   5. НЕБО СО ЗВЁЗДАМИ
   ============================================================ */
function buildSky() {
  const skyGeo = new THREE.SphereGeometry(200, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor:    { value: new THREE.Color(0x0a0525) },
      midColor:    { value: new THREE.Color(0x2a0a5e) },
      bottomColor: { value: new THREE.Color(0x661a80) }
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPosition = wp.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 bottomColor;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition).y;
        vec3 col;
        if (h > 0.0) col = mix(midColor, topColor, h);
        else col = mix(midColor, bottomColor, -h);
        gl_FragColor = vec4(col, 1.0);
      }
    `
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  // Звёзды
  const starGeo = new THREE.BufferGeometry();
  const starCount = 800;
  const positions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const r = 90 + Math.random() * 40;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI * 0.4; // только над горизонтом
    positions[i * 3]     = Math.cos(theta) * Math.sin(phi) * r;
    positions[i * 3 + 1] = Math.cos(phi) * r + 10;
    positions[i * 3 + 2] = Math.sin(theta) * Math.sin(phi) * r;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const starMat = new THREE.PointsMaterial({
    color: 0xffffff, size: 0.6, sizeAttenuation: true,
    transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  scene.add(new THREE.Points(starGeo, starMat));
}

/* ============================================================
   6. МИР
   ============================================================ */
function buildWorld() {
  // ---- Дорога ----
  const roadGeo = new THREE.PlaneGeometry(LANE_WIDTH * 3 + 0.8, 500, 1, 1);
  const roadMat = new THREE.MeshStandardMaterial({
    color: 0x0a0a18,
    roughness: 0.55,
    metalness: 0.85,
    emissive: 0x0a0a2a,
    emissiveIntensity: 0.4
  });
  road = new THREE.Mesh(roadGeo, roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.z = -240;
  road.receiveShadow = true;
  scene.add(road);

  // ---- Двигающаяся сетка на дороге ----
  const gridLineMat = new THREE.MeshBasicMaterial({
    color: 0x00ffff,
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  // Поперечные линии (движутся)
  for (let i = 0; i < 40; i++) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(LANE_WIDTH * 3 + 0.8, 0.08), gridLineMat);
    line.rotation.x = -Math.PI / 2;
    line.position.set(0, 0.015, -i * 8);
    roadGrid.push(line);
    scene.add(line);
  }

  // Продольные разделители полос (постоянные)
  const laneLineMat = new THREE.MeshBasicMaterial({
    color: 0x00ffff,
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending
  });
  for (let i = -1; i <= 1; i += 2) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 500), laneLineMat);
    line.rotation.x = -Math.PI / 2;
    line.position.set(i * LANE_WIDTH / 1.4, 0.02, -240);
    scene.add(line);
  }

  // ---- Боковые неоновые барьеры ----
  for (let side = -1; side <= 1; side += 2) {
    // Верхняя светящаяся лента
    const barGeo = new THREE.BoxGeometry(0.18, 0.12, 500);
    const barMat = new THREE.MeshBasicMaterial({
      color: side < 0 ? 0x00ffff : 0xff2e63
    });
    const bar = new THREE.Mesh(barGeo, barMat);
    bar.position.set(side * (LANE_WIDTH * 1.75 + 0.3), 0.85, -240);
    scene.add(bar);

    // Halo вокруг ленты
    const haloGeo = new THREE.BoxGeometry(0.55, 0.5, 500);
    const haloMat = new THREE.MeshBasicMaterial({
      color: side < 0 ? 0x00ffff : 0xff2e63,
      transparent: true, opacity: 0.18,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.position.set(side * (LANE_WIDTH * 1.75 + 0.3), 0.85, -240);
    scene.add(halo);

    // Нижний "бордюр"
    const curbGeo = new THREE.BoxGeometry(0.3, 0.3, 500);
    const curbMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e, roughness: 0.5, metalness: 0.6,
      emissive: side < 0 ? 0x004466 : 0x440022,
      emissiveIntensity: 0.8
    });
    const curb = new THREE.Mesh(curbGeo, curbMat);
    curb.position.set(side * (LANE_WIDTH * 1.75 + 0.15), 0.15, -240);
    curb.receiveShadow = true;
    scene.add(curb);
  }

  // ---- Земля ----
  const groundGeo = new THREE.PlaneGeometry(400, 500);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x050510,
    roughness: 1,
    metalness: 0.1
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.1;
  ground.position.z = -240;
  ground.receiveShadow = true;
  scene.add(ground);

  // ---- Здания по бокам ----
  const buildingPalette = [
    { base: 0x1a1a3a, emissive: 0x00ffff },
    { base: 0x2a0a3a, emissive: 0xff2e63 },
    { base: 0x1a0a2a, emissive: 0xa855f7 },
    { base: 0x0a1a2a, emissive: 0x00ffcc },
    { base: 0x2a1a0a, emissive: 0xffaa00 }
  ];

  for (let i = 0; i < 80; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const z = -i * 6 - Math.random() * 3;
    const w = 2 + Math.random() * 4;
    const h = 8 + Math.random() * 28;
    const d = 2 + Math.random() * 4;
    const x = side * (9 + Math.random() * 15);

    const pal = buildingPalette[Math.floor(Math.random() * buildingPalette.length)];
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshStandardMaterial({
      color: pal.base,
      roughness: 0.6,
      metalness: 0.5,
      emissive: pal.emissive,
      emissiveIntensity: 0.12
    });
    const b = new THREE.Mesh(geo, mat);
    b.position.set(x, h / 2, z);
    b.castShadow = true;
    b.receiveShadow = true;
    buildings.push(b);
    scene.add(b);

    // Окна — 2-3 колонки на каждой стороне
    const winColors = [0x00ffff, 0xff2e63, 0xa855f7, 0xffd93d, 0x00ffcc];
    for (let wy = 1.5; wy < h - 1; wy += 2.0) {
      if (Math.random() < 0.35) continue;
      const winColor = winColors[Math.floor(Math.random() * winColors.length)];
      const winMat = new THREE.MeshBasicMaterial({
        color: winColor,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const winGeo = new THREE.PlaneGeometry(w * 0.55, 0.35);
      const win = new THREE.Mesh(winGeo, winMat);
      win.position.set(x - side * (d / 2 + 0.02), wy, z);
      win.rotation.y = side < 0 ? -Math.PI / 2 : Math.PI / 2;
      buildingWindows.push(win);
      scene.add(win);
    }
  }

  // ---- Дальние силуэты зданий (для глубины) ----
  for (let i = 0; i < 60; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const z = -i * 10 - 40 - Math.random() * 10;
    const w = 6 + Math.random() * 10;
    const h = 20 + Math.random() * 60;
    const d = 6 + Math.random() * 10;
    const x = side * (25 + Math.random() * 30);

    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x080418,
      roughness: 0.9, metalness: 0.3,
      emissive: 0x220044,
      emissiveIntensity: 0.25
    });
    const b = new THREE.Mesh(geo, mat);
    b.position.set(x, h / 2, z);
    distantBuildings.push(b);
    scene.add(b);
  }

  // ---- Уличные фонари ----
  for (let i = 0; i < 50; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const z = -i * 10 - 5;
    const poleH = 7;
    const x = side * (LANE_WIDTH * 1.9 + 0.3);

    // Столб
    const poleGeo = new THREE.CylinderGeometry(0.08, 0.12, poleH, 8);
    const poleMat = new THREE.MeshStandardMaterial({
      color: 0x151528, metalness: 0.9, roughness: 0.35,
      emissive: 0x0a0a1a, emissiveIntensity: 0.3
    });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(x, poleH / 2, z);
    pole.castShadow = true;
    scene.add(pole);

    // Направляющая к дороге
    const armGeo = new THREE.BoxGeometry(1.2, 0.1, 0.1);
    const arm = new THREE.Mesh(armGeo, poleMat);
    arm.position.set(x - side * 0.6, poleH - 0.1, z);
    scene.add(arm);

    // Источник света (шар)
    const lampColor = side < 0 ? 0x00ffff : 0xff2e63;
    const lampGeo = new THREE.SphereGeometry(0.28, 16, 16);
    const lampMat = new THREE.MeshBasicMaterial({ color: lampColor });
    const lamp = new THREE.Mesh(lampGeo, lampMat);
    lamp.position.set(x - side * 1.0, poleH - 0.15, z);
    scene.add(lamp);

    // Halo вокруг лампы (свечение)
    const haloGeo = new THREE.SphereGeometry(0.7, 16, 16);
    const haloMat = new THREE.MeshBasicMaterial({
      color: lampColor, transparent: true, opacity: 0.35,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.position.copy(lamp.position);
    scene.add(halo);
    halos.push({ mesh: halo, baseScale: 1, phase: Math.random() * Math.PI * 2 });

    // PointLight — только для ближайших 10, чтобы не упал FPS
    if (i < 10) {
      const pl = new THREE.PointLight(lampColor, 2.2, 18, 2);
      pl.position.copy(lamp.position);
      scene.add(pl);
      streetLights.push({ light: pl, halo, baseZ: z });
    }
  }
}

/* ============================================================
   7. ИГРОК
   ============================================================ */
function buildPlayer() {
  playerGroup = new THREE.Group();

  // Корпус — светящийся
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x00b8ff,
    emissive: 0x00aaff,
    emissiveIntensity: 0.9,
    roughness: 0.25,
    metalness: 0.85
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.6), bodyMat);
  body.position.y = 1.4;
  body.castShadow = true;
  body.name = 'body';
  playerGroup.add(body);

  // Обводка корпуса (edges) — для неонового контура
  const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.92, 1.12, 0.62));
  const lineMat = new THREE.LineBasicMaterial({ color: 0x66ffff });
  const bodyEdges = new THREE.LineSegments(edges, lineMat);
  bodyEdges.position.y = 1.4;
  playerGroup.add(bodyEdges);

  // Голова
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0x00ffff,
    emissiveIntensity: 0.5,
    roughness: 0.25,
    metalness: 0.7
  });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.65, 0.65), headMat);
  head.position.y = 2.3;
  head.castShadow = true;
  head.name = 'head';
  playerGroup.add(head);

  // Визор — яркая полоска
  const visorMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
  const visor = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.18), visorMat);
  visor.position.set(0, 2.32, 0.34);
  playerGroup.add(visor);

  // Маленький PointLight на голове — легкое свечение вокруг персонажа
  const headLight = new THREE.PointLight(0x00ffff, 1.2, 6, 2);
  headLight.position.set(0, 2.3, 0);
  playerGroup.add(headLight);

  // Руки и ноги
  const limbMat = new THREE.MeshStandardMaterial({
    color: 0x0088ff,
    emissive: 0x0088ff,
    emissiveIntensity: 0.6,
    roughness: 0.4,
    metalness: 0.7
  });

  const armGeo = new THREE.BoxGeometry(0.25, 0.9, 0.25);
  const leftArm = new THREE.Mesh(armGeo, limbMat);
  leftArm.position.set(-0.6, 1.4, 0);
  leftArm.castShadow = true;
  leftArm.name = 'leftArm';
  playerGroup.add(leftArm);

  const rightArm = new THREE.Mesh(armGeo, limbMat);
  rightArm.position.set(0.6, 1.4, 0);
  rightArm.castShadow = true;
  rightArm.name = 'rightArm';
  playerGroup.add(rightArm);

  const legGeo = new THREE.BoxGeometry(0.3, 1.0, 0.3);
  const leftLeg = new THREE.Mesh(legGeo, limbMat);
  leftLeg.position.set(-0.25, 0.5, 0);
  leftLeg.castShadow = true;
  leftLeg.name = 'leftLeg';
  playerGroup.add(leftLeg);

  const rightLeg = new THREE.Mesh(legGeo, limbMat);
  rightLeg.position.set(0.25, 0.5, 0);
  rightLeg.castShadow = true;
  rightLeg.name = 'rightLeg';
  playerGroup.add(rightLeg);

  // Тень под игроком
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.75, 20),
    new THREE.MeshBasicMaterial({
      color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false
    })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  shadow.name = 'shadow';
  playerGroup.add(shadow);

  scene.add(playerGroup);

  // Инициализируем трейл
  const trailMat = new THREE.MeshBasicMaterial({
    color: 0x00ffff, transparent: true, opacity: 0.4,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  for (let i = 0; i < 6; i++) {
    const t = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), trailMat.clone());
    t.visible = false;
    scene.add(t);
    playerTrail.push({ mesh: t, life: 0 });
  }
}

/* ============================================================
   8. SPEED LINES (эффект скорости)
   ============================================================ */
function buildSpeedLines() {
  const colors = [0x00ffff, 0xff2e63, 0xa855f7, 0xffd93d];
  for (let i = 0; i < 30; i++) {
    const len = 1 + Math.random() * 3;
    const geo = new THREE.BoxGeometry(0.04, 0.04, len);
    const mat = new THREE.MeshBasicMaterial({
      color: colors[Math.floor(Math.random() * colors.length)],
      transparent: true, opacity: 0.7,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const line = new THREE.Mesh(geo, mat);
    const side = Math.random() < 0.5 ? -1 : 1;
    line.position.set(
      side * (4 + Math.random() * 12),
      0.5 + Math.random() * 8,
      -Math.random() * 100
    );
    line.userData.speedMult = 1 + Math.random() * 1.5;
    line.userData.baseOpacity = 0.5 + Math.random() * 0.4;
    scene.add(line);
    speedLines.push(line);
  }
}

/* ============================================================
   9. ПРЕПЯТСТВИЯ
   ============================================================ */
function createObstacle(type, laneIndex) {
  const group = new THREE.Group();
  const x = LANE_X[laneIndex];

  if (type === 'low') {
    const geo = new THREE.BoxGeometry(1.6, 1.0, 0.8);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xff2e63, emissive: 0xff2e63, emissiveIntensity: 1.1,
      roughness: 0.3, metalness: 0.7
    });
    const box = new THREE.Mesh(geo, mat);
    box.position.y = 0.5;
    box.castShadow = true;
    group.add(box);

    // Halo
    const haloGeo = new THREE.BoxGeometry(1.9, 1.3, 1.1);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xff2e63, transparent: true, opacity: 0.18,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.position.y = 0.5;
    group.add(halo);

    group.userData = { type: 'low', height: 1.0 };
  } else if (type === 'high') {
    const geo = new THREE.BoxGeometry(1.8, 0.7, 0.8);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffd93d, emissive: 0xffd93d, emissiveIntensity: 1.1,
      roughness: 0.3, metalness: 0.7
    });
    const box = new THREE.Mesh(geo, mat);
    box.position.y = 1.8;
    box.castShadow = true;
    group.add(box);

    // Halo
    const haloGeo = new THREE.BoxGeometry(2.1, 1.0, 1.1);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xffd93d, transparent: true, opacity: 0.2,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.position.y = 1.8;
    group.add(halo);

    // Стойки
    const poleMat = new THREE.MeshStandardMaterial({
      color: 0x333344, metalness: 0.95, roughness: 0.25,
      emissive: 0x221133, emissiveIntensity: 0.4
    });
    const poleGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.5, 8);
    for (let s = -1; s <= 1; s += 2) {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(s * 0.85, 0.75, 0);
      pole.castShadow = true;
      group.add(pole);
    }

    group.userData = { type: 'high', centerY: 1.8, height: 0.7 };
  } else {
    const geo = new THREE.BoxGeometry(2.2, 1.4, 0.9);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x9d4edd, emissive: 0x9d4edd, emissiveIntensity: 0.9,
      roughness: 0.3, metalness: 0.7
    });
    const box = new THREE.Mesh(geo, mat);
    box.position.y = 0.7;
    box.castShadow = true;
    group.add(box);

    const haloGeo = new THREE.BoxGeometry(2.5, 1.7, 1.2);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x9d4edd, transparent: true, opacity: 0.18,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.position.y = 0.7;
    group.add(halo);

    group.userData = { type: 'tall', height: 1.4 };
  }

  group.position.set(x, 0, -100);
  scene.add(group);
  return group;
}

/* ============================================================
   10. МОНЕТЫ
   ============================================================ */
function createCoin(laneIndex, y = 1.5) {
  const group = new THREE.Group();

  // Основной диск
  const coinMat = new THREE.MeshStandardMaterial({
    color: 0xffd93d, emissive: 0xffaa00, emissiveIntensity: 1.4,
    metalness: 1.0, roughness: 0.1
  });
  const coinMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.08, 24), coinMat);
  coinMesh.rotation.z = Math.PI / 2;
  coinMesh.castShadow = true;
  group.add(coinMesh);

  // Двойное кольцо
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffff88, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.025, 8, 32), ringMat);
  ring1.rotation.y = Math.PI / 2;
  group.add(ring1);

  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.015, 6, 32), ringMat);
  ring2.rotation.y = Math.PI / 2;
  ring2.userData.pulse = Math.random() * Math.PI * 2;
  group.add(ring2);

  // Halo сфера
  const haloMat = new THREE.MeshBasicMaterial({
    color: 0xffd93d, transparent: true, opacity: 0.25,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 16), haloMat);
  group.add(halo);

  // Свет
  const light = new THREE.PointLight(0xffd93d, 1.8, 5, 2);
  group.add(light);

  group.position.set(LANE_X[laneIndex], y, -100);
  group.userData = { lane: laneIndex, baseY: y, ring2, halo, light };
  scene.add(group);
  return group;
}

/* ============================================================
   11. ЧАСТИЦЫ
   ============================================================ */
function spawnParticles(pos, color, count = 15, size = 0.08, upward = true) {
  for (let i = 0; i < count; i++) {
    const geo = new THREE.SphereGeometry(size, 6, 6);
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const p = new THREE.Mesh(geo, mat);
    p.position.copy(pos);
    p.userData = {
      vel: new THREE.Vector3(
        (Math.random() - 0.5) * 8,
        upward ? Math.random() * 7 + 2 : (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 8
      ),
      life: 1,
      decay: 1 + Math.random() * 0.8
    };
    scene.add(p);
    particles.push(p);
  }
}

// Специальные частицы-звёздочки для сбора монет
function spawnSparkles(pos, color = 0xffd93d) {
  for (let i = 0; i < 10; i++) {
    const size = 0.06 + Math.random() * 0.06;
    const geo = new THREE.BoxGeometry(size * 3, size * 0.6, size * 0.6);
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const s = new THREE.Mesh(geo, mat);
    s.position.copy(pos);
    s.userData = {
      vel: new THREE.Vector3(
        (Math.random() - 0.5) * 6,
        Math.random() * 5 + 1,
        (Math.random() - 0.5) * 6
      ),
      rot: new THREE.Vector3(
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10
      ),
      life: 1,
      decay: 1.2 + Math.random() * 0.6
    };
    scene.add(s);
    particles.push(s);
  }
}

/* ============================================================
   12. УПРАВЛЕНИЕ
   ============================================================ */
function moveLane(dir) {
  if (gameState !== 'playing') return;
  const newLane = Math.max(0, Math.min(2, lane + dir));
  if (newLane !== lane) {
    lane = newLane;
    playerState.targetX = LANE_X[lane];
    playTone(500, 0.08, 'sine', 0.06, 700);
  }
}

function doJump() {
  if (gameState !== 'playing') return;
  if (!playerState.isJumping && !playerState.isSliding) {
    playerState.vy = JUMP_FORCE;
    playerState.isJumping = true;
    playerState.hitboxScale = 1.0;
    sfx.jump();
    spawnParticles(playerGroup.position.clone().setY(0.15), 0x00ffff, 14, 0.07, true);
  }
}

function doSlide() {
  if (gameState !== 'playing') return;
  playerState.isSliding = true;
  playerState.slideTimer = SLIDE_DURATION;
  playerState.hitboxScale = SLIDE_HITBOX_SCALE;
  if (playerState.isJumping) {
    playerState.vy = Math.min(playerState.vy, -20);
  }
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
    e.preventDefault(); doJump();
  } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
    e.preventDefault(); moveLane(-1);
  } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
    e.preventDefault(); moveLane(1);
  } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
    e.preventDefault(); doSlide();
  } else if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
    e.preventDefault();
    if (gameState === 'playing') pauseGame();
    else if (gameState === 'paused') resumeGame();
  } else if (e.key === 'Enter') {
    if (gameState === 'start' || gameState === 'over') startGame();
  }
}, { passive: false });

let touchStartX = 0, touchStartY = 0;
document.getElementById('game').addEventListener('touchstart', (e) => {
  e.preventDefault();
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}, { passive: false });

document.getElementById('game').addEventListener('touchend', (e) => {
  e.preventDefault();
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = e.changedTouches[0].clientY - touchStartY;
  if (Math.abs(dx) < 30 && Math.abs(dy) < 30) {
    if (gameState === 'start' || gameState === 'over') startGame();
    else doJump();
  } else if (Math.abs(dx) > Math.abs(dy)) {
    moveLane(dx > 0 ? 1 : -1);
  } else {
    if (dy > 0) doSlide();
    else doJump();
  }
}, { passive: false });

/* ============================================================
   13. ПРЕПЯТСТВИЕ НАД ГОЛОВОЙ
   ============================================================ */
function isObstacleOverhead() {
  for (const o of obstacles) {
    if (o.userData.type !== 'high') continue;
    if (Math.abs(o.position.x - playerGroup.position.x) > 1.0) continue;
    const dz = Math.abs(o.position.z - playerGroup.position.z);
    if (dz > 1.5) continue;
    const obsBottom = o.userData.centerY - o.userData.height / 2;
    if (PLAYER_BASE_HEIGHT > obsBottom) return true;
  }
  return false;
}

/* ============================================================
   14. ОБНОВЛЕНИЕ ИГРОКА
   ============================================================ */
function updatePlayer(dt) {
  playerGroup.position.x += (playerState.targetX - playerGroup.position.x) * Math.min(1, dt * 14);

  if (playerState.isJumping) {
    playerState.vy += GRAVITY * dt;
    playerGroup.position.y += playerState.vy * dt;
    if (playerGroup.position.y <= 0) {
      playerGroup.position.y = 0;
      playerState.vy = 0;
      playerState.isJumping = false;
      sfx.land();
      spawnParticles(playerGroup.position.clone().setY(0.1), 0x00ffff, 12, 0.06, false);
    }
  }

  // Скольжение
  if (playerState.isSliding) {
    playerState.slideTimer -= dt;
    if (playerState.slideTimer <= 0) {
      if (isObstacleOverhead()) {
        playerState.slideTimer = 0.15;
      } else {
        playerState.isSliding = false;
        playerState.hitboxScale = 1.0;
      }
    } else {
      playerState.hitboxScale = SLIDE_HITBOX_SCALE;
    }
  } else {
    playerState.hitboxScale = 1.0;
  }

  const targetScaleY = playerState.isSliding ? SLIDE_HITBOX_SCALE : 1.0;
  playerGroup.scale.y += (targetScaleY - playerGroup.scale.y) * Math.min(1, dt * 14);
  const scaleXZ = 1 + (1 - playerGroup.scale.y) * 0.35;
  playerGroup.scale.x = scaleXZ;
  playerGroup.scale.z = scaleXZ;

  // Анимация бега
  const t = performance.now() * 0.01;
  const leftLeg  = playerGroup.getObjectByName('leftLeg');
  const rightLeg = playerGroup.getObjectByName('rightLeg');
  const leftArm  = playerGroup.getObjectByName('leftArm');
  const rightArm = playerGroup.getObjectByName('rightArm');
  const body     = playerGroup.getObjectByName('body');
  const head     = playerGroup.getObjectByName('head');

  if (!playerState.isJumping && !playerState.isSliding) {
    const swing = Math.sin(t) * 0.55;
    if (leftLeg)  leftLeg.rotation.x = swing;
    if (rightLeg) rightLeg.rotation.x = -swing;
    if (leftArm)  leftArm.rotation.x = -swing;
    if (rightArm) rightArm.rotation.x = swing;
    if (body) body.position.y = 1.4 + Math.abs(Math.sin(t)) * 0.06;
    if (head) head.position.y = 2.3 + Math.abs(Math.sin(t)) * 0.06;

    // Пыль под ногами при беге
    if (Math.random() < 0.35) {
      const dustPos = playerGroup.position.clone();
      dustPos.y = 0.08;
      dustPos.z += 0.4;
      spawnParticles(dustPos, 0x004466, 1, 0.05, false);
    }
  } else {
    if (leftLeg)  leftLeg.rotation.x *= 0.85;
    if (rightLeg) rightLeg.rotation.x *= 0.85;
    if (leftArm)  leftArm.rotation.x *= 0.85;
    if (rightArm) rightArm.rotation.x *= 0.85;
  }

  // Тень
  const shadow = playerGroup.getObjectByName('shadow');
  if (shadow) {
    const h = playerGroup.position.y;
    const s = Math.max(0.35, 1 - h * 0.15);
    shadow.scale.set(s, s, 1);
    shadow.material.opacity = 0.5 * s;
  }

  // Трейл на высокой скорости
  const speedRatio = (speed - START_SPEED) / (MAX_SPEED - START_SPEED);
  if (speedRatio > 0.3 && Math.random() < speedRatio * 0.8) {
    const t2 = playerTrail.find(tr => tr.life <= 0);
    if (t2) {
      t2.mesh.visible = true;
      t2.mesh.position.copy(playerGroup.position);
      t2.mesh.position.y += 1.4;
      t2.life = 0.6;
      t2.mesh.material.opacity = 0.5;
      t2.mesh.scale.set(1, 1, 1);
    }
  }
  for (const tr of playerTrail) {
    if (tr.life > 0) {
      tr.life -= dt;
      tr.mesh.material.opacity = Math.max(0, tr.life * 0.8);
      tr.mesh.scale.multiplyScalar(1 + dt * 1.5);
      if (tr.life <= 0) tr.mesh.visible = false;
    }
  }
}

/* ============================================================
   15. ОБНОВЛЕНИЕ МИРА
   ============================================================ */
function updateWorld(dt) {
  speed = Math.min(MAX_SPEED, START_SPEED + distance * 0.015);
  distance += speed * dt;
  hudDist.textContent = Math.floor(distance);

  const speedRatio = (speed - START_SPEED) / (MAX_SPEED - START_SPEED);

  // Сетка на дороге
  const resetZ = 40;
  const gridSpacing = 8;
  for (const line of roadGrid) {
    line.position.z += speed * dt;
    if (line.position.z > resetZ) line.position.z -= gridSpacing * roadGrid.length;
    line.material.opacity = 0.2 + speedRatio * 0.3;
  }

  // Здания
  for (const b of buildings) {
    b.position.z += speed * dt;
    if (b.position.z > 30) b.position.z -= 60 * 6;
  }
  for (const w of buildingWindows) {
    w.position.z += speed * dt;
    if (w.position.z > 30) w.position.z -= 60 * 6;
  }
  for (const b of distantBuildings) {
    b.position.z += speed * dt * 0.6;
    if (b.position.z > 40) b.position.z -= 60 * 10;
  }

  // Фонари и halo
  for (const s of streetLights) {
    s.light.position.z += speed * dt;
    s.halo.position.z += speed * dt;
    if (s.light.position.z > 30) {
      s.light.position.z -= 12 * 10;
      s.halo.position.z -= 12 * 10;
    }
  }
  // Мерцание halo
  const time = performance.now() * 0.003;
  for (const h of halos) {
    const s = 1 + Math.sin(time + h.phase) * 0.15;
    h.mesh.scale.setScalar(s);
  }

  // Камера
  const camTargetX = playerGroup.position.x * 0.6;
  camera.position.x += (camTargetX - camera.position.x) * dt * 4;
  camera.position.y += (5.5 + playerGroup.position.y * 0.35 - camera.position.y) * dt * 4;
  camera.lookAt(playerGroup.position.x * 0.4, 1.5, -10);

  // Speed lines
  for (const sl of speedLines) {
    sl.position.z += speed * dt * sl.userData.speedMult;
    if (sl.position.z > 10) {
      sl.position.z = -120 - Math.random() * 40;
      const side = Math.random() < 0.5 ? -1 : 1;
      sl.position.x = side * (4 + Math.random() * 12);
      sl.position.y = 0.5 + Math.random() * 8;
    }
    sl.material.opacity = sl.userData.baseOpacity * speedRatio;
  }

  // Спавн препятствий
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawnTimer = Math.max(0.55, 1.4 - distance * 0.0015);
    const typeRoll = Math.random();
    let type;
    if (typeRoll < 0.55) type = 'low';
    else if (typeRoll < 0.85) type = 'high';
    else type = 'tall';

    let objLane;
    const freeLanes = [0, 1, 2].filter(l => l !== lane);
    if (freeLanes.length > 0 && Math.random() < 0.6) {
      objLane = freeLanes[Math.floor(Math.random() * freeLanes.length)];
    } else {
      objLane = Math.floor(Math.random() * 3);
    }

    const obstacle = createObstacle(type, objLane);
    obstacle.position.z = -100;
    obstacles.push(obstacle);
  }

  // Спавн монет
  coinTimer -= dt;
  if (coinTimer <= 0) {
    coinTimer = 1.2 + Math.random() * 1.5;
    const count = 3 + Math.floor(Math.random() * 3);
    const startLane = Math.floor(Math.random() * 3);
    const coinSpacing = 3.5;
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const y = 1.5 + Math.sin(t * Math.PI) * 1.2;
      const coin = createCoin(startLane, y);
      coin.position.z = -100 - i * coinSpacing;
      coins.push(coin);
    }
  }

  // Обновление препятствий
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const o = obstacles[i];
    o.position.z += speed * dt;
    if (o.position.z > 10) {
      scene.remove(o);
      obstacles.splice(i, 1);
      continue;
    }
    if (checkCollision(o)) {
      gameOver();
      return;
    }
  }

  // Обновление монет
  const timeMs = performance.now();
  for (let i = coins.length - 1; i >= 0; i--) {
    const c = coins[i];
    c.position.z += speed * dt;
    c.rotation.y += dt * 5;
    c.position.y = c.userData.baseY + Math.sin(timeMs * 0.003 + c.position.z) * 0.15;

    // Пульс колец и halo
    if (c.userData.ring2) {
      const p = 1 + Math.sin(timeMs * 0.005 + c.userData.ring2.userData.pulse) * 0.12;
      c.userData.ring2.scale.setScalar(p);
    }
    if (c.userData.halo) {
      const p = 1 + Math.sin(timeMs * 0.004 + c.position.z) * 0.15;
      c.userData.halo.scale.setScalar(p);
      c.userData.halo.material.opacity = 0.2 + Math.sin(timeMs * 0.006 + c.position.z) * 0.1;
    }

    if (c.position.z > 10) {
      scene.remove(c);
      coins.splice(i, 1);
      continue;
    }

    if (checkCoinCollect(c)) {
      coinsThisRun++;
      hudCoins.textContent = coinsThisRun;
      sfx.coin();
      spawnSparkles(c.position.clone(), 0xffd93d);
      spawnParticles(c.position.clone(), 0xffff88, 8, 0.06, true);
      scene.remove(c);
      coins.splice(i, 1);
    }
  }

  // Частицы
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.userData.vel.y += GRAVITY * 0.4 * dt;
    p.position.x += p.userData.vel.x * dt;
    p.position.y += p.userData.vel.y * dt;
    p.position.z += p.userData.vel.z * dt + speed * dt * 0.5;
    if (p.userData.rot) {
      p.rotation.x += p.userData.rot.x * dt;
      p.rotation.y += p.userData.rot.y * dt;
      p.rotation.z += p.userData.rot.z * dt;
    }
    p.userData.life -= dt * p.userData.decay;
    p.material.opacity = Math.max(0, p.userData.life);
    if (p.userData.life <= 0) {
      scene.remove(p);
      particles.splice(i, 1);
    }
  }
}

/* ============================================================
   16. СТОЛКНОВЕНИЯ
   ============================================================ */
function checkCollision(obstacle) {
  const dz = Math.abs(obstacle.position.z - playerGroup.position.z);
  if (dz > 1.2) return false;

  const dx = Math.abs(obstacle.position.x - playerGroup.position.x);
  if (dx > 1.0) return false;

  const type = obstacle.userData.type;
  const hitboxScale = playerState.hitboxScale;
  const playerFeet = playerGroup.position.y;
  const playerHead = playerFeet + PLAYER_BASE_HEIGHT * hitboxScale;

  if (type === 'low' || type === 'tall') {
    const obsTop = obstacle.userData.height;
    if (playerHead > 0 && playerFeet < obsTop) return true;
    return false;
  }

  if (type === 'high') {
    const obsBottom = obstacle.userData.centerY - obstacle.userData.height / 2;
    const obsTop    = obstacle.userData.centerY + obstacle.userData.height / 2;
    if (playerHead > obsBottom && playerFeet < obsTop) return true;
    return false;
  }
  return false;
}

function checkCoinCollect(coin) {
  if (Math.abs(coin.position.z - playerGroup.position.z) > 1.0) return false;
  if (Math.abs(coin.position.x - playerGroup.position.x) > 1.0) return false;
  const playerY = playerGroup.position.y;
  const playerHeight = PLAYER_BASE_HEIGHT * playerGroup.scale.y;
  const py = playerY + playerHeight / 2;
  return Math.abs(coin.position.y - py) < 1.3;
}

/* ============================================================
   17. УПРАВЛЕНИЕ ИГРОЙ
   ============================================================ */
function resetGame() {
  for (const o of obstacles) scene.remove(o);
  for (const c of coins) scene.remove(c);
  for (const p of particles) scene.remove(p);
  obstacles = [];
  coins = [];
  particles = [];

  distance = 0;
  speed = START_SPEED;
  coinsThisRun = 0;
  lane = 1;
  spawnTimer = 0.8;
  coinTimer = 1.5;

  playerState.x = 0;
  playerState.y = 0;
  playerState.vy = 0;
  playerState.targetX = 0;
  playerState.isJumping = false;
  playerState.isSliding = false;
  playerState.slideTimer = 0;
  playerState.hitboxScale = 1.0;
  playerState.alive = true;

  playerGroup.position.set(0, 0, 0);
  playerGroup.scale.set(1, 1, 1);
  playerGroup.rotation.set(0, 0, 0);

  for (const tr of playerTrail) {
    tr.life = 0;
    tr.mesh.visible = false;
  }

  hudDist.textContent = 0;
  hudCoins.textContent = 0;
}

function startGame() {
  initAudio();
  resetGame();
  gameState = 'playing';
  startScreen.classList.add('hidden');
  pauseScreen.classList.add('hidden');
  gameOverScreen.classList.add('hidden');
}

function pauseGame() {
  if (gameState === 'playing') {
    gameState = 'paused';
    pauseScreen.classList.remove('hidden');
    sfx.pause();
  }
}

function resumeGame() {
  if (gameState === 'paused') {
    gameState = 'playing';
    pauseScreen.classList.add('hidden');
    sfx.pause();
  }
}

function gameOver() {
  if (gameState === 'over') return;
  gameState = 'over';
  playerState.alive = false;
  sfx.death();

  spawnParticles(playerGroup.position.clone(), 0xff2e63, 40, 0.12, true);
  spawnParticles(playerGroup.position.clone(), 0xffd93d, 30, 0.1, true);
  spawnSparkles(playerGroup.position.clone(), 0xffffff);

  const isRecord = distance > best;
  if (isRecord) {
    best = Math.floor(distance);
    localStorage.setItem('neonRunner3DBest', best);
    hudBest.textContent = best;
  }

  finalDist.textContent = Math.floor(distance);
  finalCoins.textContent = coinsThisRun;
  finalBest.textContent = best;
  newRecordEl.style.display = isRecord ? 'block' : 'none';

  setTimeout(() => {
    if (gameState === 'over') gameOverScreen.classList.remove('hidden');
  }, 500);
}

/* ============================================================
   18. UI
   ============================================================ */
startBtn.addEventListener('click', startGame);
resumeBtn.addEventListener('click', resumeGame);
restartBtn.addEventListener('click', startGame);

soundBtn.addEventListener('click', () => {
  soundOn = !soundOn;
  localStorage.setItem('neonRunner3DSound', soundOn ? 'on' : 'off');
  soundBtn.classList.toggle('muted', !soundOn);
  if (soundOn) {
    initAudio();
    playTone(700, 0.1, 'sine', 0.1);
  }
});
soundBtn.classList.toggle('muted', !soundOn);

/* ============================================================
   19. РЕСАЙЗ
   ============================================================ */
function onResize() {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

/* ============================================================
   20. ГЛАВНЫЙ ЦИКЛ
   ============================================================ */
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (gameState === 'playing') {
    updatePlayer(dt);
    updateWorld(dt);
  } else if (gameState === 'over') {
    speed *= 0.92;
    // Анимация частиц после смерти
    for (const p of particles) {
      p.userData.vel.y += GRAVITY * 0.4 * dt;
      p.position.x += p.userData.vel.x * dt;
      p.position.y += p.userData.vel.y * dt;
      p.position.z += p.userData.vel.z * dt;
      if (p.userData.rot) {
        p.rotation.x += p.userData.rot.x * dt;
        p.rotation.y += p.userData.rot.y * dt;
      }
      p.userData.life -= dt * 0.8;
      p.material.opacity = Math.max(0, p.userData.life);
    }
  } else if (gameState === 'start') {
    // Медленное вращение камеры вокруг сцены
    const t = performance.now() * 0.0003;
    camera.position.x = Math.sin(t) * 3;
    camera.position.z = 9 + Math.cos(t) * 1;
    camera.position.y = 5.5 + Math.sin(t * 1.3) * 0.5;
    camera.lookAt(0, 1.5, -10);
    if (playerGroup) {
      playerGroup.rotation.y = Math.sin(t * 2) * 0.25;
      // Плавное покачивание ног в меню
      const t2 = performance.now() * 0.006;
      const ll = playerGroup.getObjectByName('leftLeg');
      const rl = playerGroup.getObjectByName('rightLeg');
      const la = playerGroup.getObjectByName('leftArm');
      const ra = playerGroup.getObjectByName('rightArm');
      const sw = Math.sin(t2) * 0.4;
      if (ll) ll.rotation.x = sw;
      if (rl) rl.rotation.x = -sw;
      if (la) la.rotation.x = -sw;
      if (ra) ra.rotation.x = sw;
    }
    // Мерцание halo
    const time = performance.now() * 0.003;
    for (const h of halos) {
      const s = 1 + Math.sin(time + h.phase) * 0.15;
      h.mesh.scale.setScalar(s);
    }
  }

  renderer.render(scene, camera);
}

/* ============================================================
   21. СТАРТ
   ============================================================ */
initThree();
animate();