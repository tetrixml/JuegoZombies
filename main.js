import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// 1. CONFIGURACIÓN
const CONFIG = {
  tile: 4,                 
  alturaPared: 4.2,        
  jugador: {
    velocidad: 6,          
    radio: 0.5,            
    alturaOjos: 1.7,       
    sensibilidad: 0.0022   
  },
  contactoZombi: 1.15,     
  escudoDuracion: 10,      
  vidaZombi: 2,            

  
  armas: [
    { id: 'pistola', nombre: 'PISTOLA', archivo: 'models/pistola.glb',
      municionInicial: 10, municionPorCaja: 8, municionMax: 60,   
      cadencia: 0.22,        
      dispersion: 0.004,     
      retroceso: 1.0,
      pos: [0.22, -0.20, -0.55], escala: 1.7, colorTrazador: 0xffd27a },
    { id: 'rifle', nombre: 'RIFLE DE ASALTO', archivo: 'models/rifle.glb',
      municionInicial: 10, municionPorCaja: 10, municionMax: 90,
      cadencia: 0.42,        
      dispersion: 0.012,     
      retroceso: 1.6,
      pos: [0.20, -0.23, -0.42], escala: 0.95, colorTrazador: 0x9affc0 }
  ],

  zombis: {
    normal: { archivo: 'models/zombie.glb',      velocidad: 3.0, deteccion: 18, escala: 0.85 },
    cono:   { archivo: 'models/zombie_cono.glb', velocidad: 4.6, deteccion: 22, escala: 0.85 } 
  }
};

// 2. MAPA DEL NIVEL 
const MAPA_TXT = [
  "################################",
  "#...........#..................#",
  "#......B.ZC.#..C.Z......B...EEE#",
  "#.....ZB....#......Z..#..X..EEE#",
  "#...........A..X......#..XC.EEE#",
  "#.........Z...ZX.C..C.#.Z..AEEE#",
  "#.......Z......XH.A...#.Z.C..Z.#",
  "##...###########################",
  "#.....C......X.......#.........#",
  "#..Z....A...ZX.Z...Z.#...Z.....#",
  "#...C...........X.Z.H#....B....#",
  "#.........#...C.X....A..Z.B....#",
  "#.Z..B...C#.....X..Z...C....Z..#",
  "#....B...H#.....X...B...A.C....#",
  "###########################...##",
  "#.......#.......X..#....B......#",
  "#.....B.#.Z...Z.X..#....BZ..Z..#",
  "#..........A....X.C#.Z.........#",
  "#..S............X..#....C...C..#",
  "#.......#..Z..........X........#",
  "#.....A.#...B.Z..A..CZX....H...#",
  "#.......#...B.........X...BB...#",
  "################################"
];
const FILAS = MAPA_TXT.length;
const COLS = MAPA_TXT[0].length;
const T = CONFIG.tile;
const ALTO = CONFIG.alturaPared;


const mapa = [];              
const entidadesMapa = [];     
let inicioJugador = { c: 1, r: 1 };
for (let r = 0; r < FILAS; r++) {
  mapa[r] = [];
  for (let c = 0; c < COLS; c++) {
    const ch = MAPA_TXT[r][c];
    if (ch === 'S') { inicioJugador = { c, r }; mapa[r][c] = '.'; }
    else if ('ZCAH'.includes(ch)) { entidadesMapa.push({ tipo: ch, c, r }); mapa[r][c] = '.'; }
    else mapa[r][c] = ch;
  }
}

const centroX = c => (c + 0.5) * T;
const centroZ = r => (r + 0.5) * T;

// 3. UTILIDADES DE MAPA: COLISIONES Y PATHFINDING
const SOLIDOS = new Set(['#', 'B', 'X']);             
const celdaDe = v => Math.floor(v / T);
function esSolida(c, r) {
  if (c < 0 || r < 0 || c >= COLS || r >= FILAS) return true;
  return SOLIDOS.has(mapa[r][c]);
}


function colisiona(x, z, radio) {
  const c0 = celdaDe(x - radio), c1 = celdaDe(x + radio);
  const r0 = celdaDe(z - radio), r1 = celdaDe(z + radio);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (!esSolida(c, r)) continue;
      const minX = c * T, maxX = minX + T, minZ = r * T, maxZ = minZ + T;
      const px = Math.max(minX, Math.min(x, maxX));    // punto más cercano de la casilla
      const pz = Math.max(minZ, Math.min(z, maxZ));
      if ((x - px) ** 2 + (z - pz) ** 2 < radio * radio) return true;
    }
  }
  return false;
}

function moverConColision(pos, dx, dz, radio) {
  if (!colisiona(pos.x + dx, pos.z, radio)) pos.x += dx;
  if (!colisiona(pos.x, pos.z + dz, radio)) pos.z += dz;
}

function caminoLibre(ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, dist = Math.hypot(dx, dz);
  if (dist > 30) return false;
  const pasos = Math.ceil(dist / 0.5);
  for (let i = 1; i < pasos; i++) {
    if (colisiona(ax + dx * i / pasos, az + dz * i / pasos, 0.5)) return false;
  }
  return true;
}

const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const campo = new Int16Array(COLS * FILAS).fill(-1);
const celdaCampo = { c: -999, r: -999 };
function actualizarCampo(forzar = false) {
  const pc = celdaDe(jugador.pos.x), pr = celdaDe(jugador.pos.z);
  if (!forzar && pc === celdaCampo.c && pr === celdaCampo.r) return;   // solo si cambió de casilla
  celdaCampo.c = pc; celdaCampo.r = pr;
  campo.fill(-1);
  const cola = [pc + pr * COLS];
  campo[cola[0]] = 0;
  for (let i = 0; i < cola.length; i++) {
    const idx = cola[i], c = idx % COLS, r = (idx / COLS) | 0;
    for (const [dc, dr] of DIRS4) {
      const nc = c + dc, nr = r + dr;
      if (esSolida(nc, nr)) continue;
      const ni = nc + nr * COLS;
      if (campo[ni] !== -1) continue;
      campo[ni] = campo[idx] + 1;
      cola.push(ni);
    }
  }
}

// 4. ESCENA, CÁMARA, LUCES Y RENDER
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.autoClear = false;                       
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070a07);
scene.fog = new THREE.FogExp2(0x070a07, 0.03);    

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 150);
camera.rotation.order = 'YXZ';
scene.add(camera);

const linterna = new THREE.SpotLight(0xfff2d0, 70, 34, 0.5, 0.55, 1.4);
camera.add(linterna);
linterna.position.set(0.1, -0.1, 0);
linterna.target.position.set(0, 0, -5);
camera.add(linterna.target);

scene.add(new THREE.AmbientLight(0x5a6a5a, 0.9));
scene.add(new THREE.HemisphereLight(0x8899aa, 0x1a1a14, 0.4));

const escenaArma = new THREE.Scene();
const camaraArma = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 10);
escenaArma.add(new THREE.AmbientLight(0xffffff, 1.5));
const luzArma = new THREE.DirectionalLight(0xfff0dd, 2.4);
luzArma.position.set(1, 2, 1.5);
escenaArma.add(luzArma);
const sosteArma = new THREE.Group();              
escenaArma.add(sosteArma);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = camaraArma.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix(); camaraArma.updateProjectionMatrix();
});

// 5. TEXTURAS PROCEDURALES (dibujadas con canvas, no necesitan archivos)
function crearTextura(tam, dibujar, repX = 1, repY = 1) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = tam;
  dibujar(cv.getContext('2d'), tam);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repX, repY);
  tex.anisotropy = 4;
  return tex;
}
function ruidoCanvas(ctx, tam, cantidad, claro = 255, oscuro = 0, alfa = 0.06) {
  for (let i = 0; i < cantidad; i++) {
    const v = Math.random() < 0.5 ? oscuro : claro;
    ctx.fillStyle = `rgba(${v},${v},${v},${alfa})`;
    ctx.fillRect(Math.random() * tam, Math.random() * tam, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
}
const texSuelo = crearTextura(512, (ctx, s) => {            // losas de hormigón con manchas
  ctx.fillStyle = '#585b54'; ctx.fillRect(0, 0, s, s);
  ruidoCanvas(ctx, s, 5000);
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = 'rgba(15,15,10,0.12)';
    ctx.beginPath(); ctx.arc(Math.random() * s, Math.random() * s, 15 + Math.random() * 40, 0, 7); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, s, s); ctx.beginPath(); ctx.moveTo(s / 2, 0); ctx.lineTo(s / 2, s); ctx.moveTo(0, s / 2); ctx.lineTo(s, s / 2); ctx.stroke();
}, COLS * T / 8, FILAS * T / 8);
const texPared = crearTextura(512, (ctx, s) => {            // panel metálico verde oliva con franja de peligro
  ctx.fillStyle = '#4b5444'; ctx.fillRect(0, 0, s, s);
  ruidoCanvas(ctx, s, 4000);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 0, s, 28);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 3;
  ctx.strokeRect(6, 6, s - 12, s - 12); ctx.beginPath(); ctx.moveTo(s / 2, 6); ctx.lineTo(s / 2, s - 6); ctx.stroke();
  ctx.fillStyle = 'rgba(200,200,190,0.35)';
  for (const [x, y] of [[20, 20], [s - 20, 20], [20, s - 60], [s - 20, s - 60], [s / 2 - 12, 20], [s / 2 + 12, 20]]) { ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill(); }
  ctx.save(); ctx.beginPath(); ctx.rect(0, s - 50, s, 50); ctx.clip();   // franja amarilla/negra
  ctx.fillStyle = '#d9a514'; ctx.fillRect(0, s - 50, s, 50);
  ctx.fillStyle = '#1b1b1b';
  for (let x = -60; x < s + 60; x += 50) { ctx.beginPath(); ctx.moveTo(x, s); ctx.lineTo(x + 25, s); ctx.lineTo(x + 50, s - 50); ctx.lineTo(x + 25, s - 50); ctx.fill(); }
  ctx.restore();
  ctx.fillStyle = 'rgba(230,230,210,0.5)'; ctx.font = 'bold 34px monospace'; ctx.fillText('SECTOR ' + (1 + Math.floor(Math.random() * 9)) + '-' + String.fromCharCode(65 + Math.floor(Math.random() * 6)), 40, 130);
});
const texTecho = crearTextura(256, (ctx, s) => {
  ctx.fillStyle = '#2e312c'; ctx.fillRect(0, 0, s, s); ruidoCanvas(ctx, s, 1500);
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 3; ctx.strokeRect(0, 0, s, s);
}, COLS * T / 8, FILAS * T / 8);
const texCaja = crearTextura(256, (ctx, s) => {             // contenedor militar con refuerzos y rótulo
  ctx.fillStyle = '#5b6b3e'; ctx.fillRect(0, 0, s, s); ruidoCanvas(ctx, s, 2500);
  ctx.strokeStyle = '#2f3a20'; ctx.lineWidth = 10; ctx.strokeRect(5, 5, s - 10, s - 10);
  ctx.beginPath(); ctx.moveTo(10, 10); ctx.lineTo(s - 10, s - 10); ctx.moveTo(s - 10, 10); ctx.lineTo(10, s - 10); ctx.stroke();
  ctx.fillStyle = '#e8e2c0'; ctx.font = 'bold 26px monospace'; ctx.fillText('US ARMY', 60, 110); ctx.fillText('MIL-0' + Math.floor(Math.random() * 90 + 10), 66, 150);
});
const texSacos = crearTextura(256, (ctx, s) => {            // sacos de arena
  ctx.fillStyle = '#a89468'; ctx.fillRect(0, 0, s, s); ruidoCanvas(ctx, s, 3000);
  ctx.strokeStyle = 'rgba(60,45,20,0.8)'; ctx.lineWidth = 3;
  for (let y = 0; y < 4; y++) for (let x = 0; x < 3; x++) { ctx.strokeRect(x * 85 - (y % 2) * 40, y * 64, 85, 64); }
});

function texturaBrillo(r, g, b) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const ctx = cv.getContext('2d'); const gr = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, `rgba(${r},${g},${b},1)`); gr.addColorStop(0.4, `rgba(${r},${g},${b},0.45)`); gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = gr; ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}

// 6. CONSTRUCCIÓN DEL ESCENARIO
const luces = [];   
function construirNivel() {
  // Suelo y techo
  const suelo = new THREE.Mesh(new THREE.PlaneGeometry(COLS * T, FILAS * T),
    new THREE.MeshStandardMaterial({ map: texSuelo, roughness: 0.95 }));
  suelo.rotation.x = -Math.PI / 2; suelo.position.set(COLS * T / 2, 0, FILAS * T / 2);
  scene.add(suelo);
  const techo = new THREE.Mesh(new THREE.PlaneGeometry(COLS * T, FILAS * T),
    new THREE.MeshStandardMaterial({ map: texTecho, roughness: 1 }));
  techo.rotation.x = Math.PI / 2; techo.position.set(COLS * T / 2, ALTO, FILAS * T / 2);
  scene.add(techo);

  // Paredes
  const visibles = [];
  for (let r = 0; r < FILAS; r++) for (let c = 0; c < COLS; c++) {
    if (mapa[r][c] !== '#') continue;
    let toca = false;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const nc = c + dc, nr = r + dr;
      if (nc >= 0 && nr >= 0 && nc < COLS && nr < FILAS && mapa[nr][nc] !== '#') toca = true;
    }
    if (toca) visibles.push([c, r]);
  }
  const paredes = new THREE.InstancedMesh(new THREE.BoxGeometry(T, ALTO, T),
    new THREE.MeshStandardMaterial({ map: texPared, roughness: 0.8, metalness: 0.2 }), visibles.length);
  const m4 = new THREE.Matrix4();
  visibles.forEach(([c, r], i) => { m4.makeTranslation(centroX(c), ALTO / 2, centroZ(r)); paredes.setMatrixAt(i, m4); });
  scene.add(paredes);

  // Obstáculos
  const matCaja = new THREE.MeshStandardMaterial({ map: texCaja, roughness: 0.85 });
  const matSaco = new THREE.MeshStandardMaterial({ map: texSacos, roughness: 1 });
  for (let r = 0; r < FILAS; r++) for (let c = 0; c < COLS; c++) {
    const ch = mapa[r][c];
    if (ch === 'B') {
      const base = new THREE.Mesh(new THREE.BoxGeometry(3.1, 2.1, 3.1), matCaja);
      base.position.set(centroX(c), 1.05, centroZ(r)); base.rotation.y = (Math.random() - 0.5) * 0.25;
      scene.add(base);
      if (Math.random() < 0.6) {            
        const tope = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.2, 1.7), matCaja);
        tope.position.set(centroX(c) + (Math.random() - 0.5) * 0.6, 2.7, centroZ(r)); tope.rotation.y = Math.random() * 1.5;
        scene.add(tope);
      }
    } else if (ch === 'X') {
      const saco = new THREE.Mesh(new THREE.BoxGeometry(3.8, 1.3, 3.8), matSaco);
      saco.position.set(centroX(c), 0.65, centroZ(r));
      scene.add(saco);
    }
  }

  const puntosLuz = [[4, 18, 0xfff0d0, false], [13, 18, 0xffe6b0, true], [25, 18, 0xfff0d0, false],
    [25, 10, 0xffe6b0, false], [15, 10, 0xfff0d0, true], [5, 10, 0xffd8a0, false],
    [6, 4, 0xfff0d0, false], [17, 3, 0xffe6b0, true], [26, 3, 0xb8ffc8, false], [23, 14, 0xff5040, true]];
  for (const [c, r, color, parpadea] of puntosLuz) {
    const lampara = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 0.6),
      new THREE.MeshBasicMaterial({ color }));
    lampara.position.set(centroX(c), ALTO - 0.06, centroZ(r)); scene.add(lampara);
    const luz = new THREE.PointLight(color, 32, 26, 2);
    luz.position.set(centroX(c), ALTO - 0.8, centroZ(r)); scene.add(luz);
    luces.push({ luz, base: 32, parpadea });
  }

  construirZonaExtraccion();
}

function construirZonaExtraccion() {
  let c0 = 99, c1 = -1, r0 = 99, r1 = -1;
  for (let r = 0; r < FILAS; r++) for (let c = 0; c < COLS; c++) if (mapa[r][c] === 'E') {
    c0 = Math.min(c0, c); c1 = Math.max(c1, c); r0 = Math.min(r0, r); r1 = Math.max(r1, r);
  }
  const ancho = (c1 - c0 + 1) * T, largo = (r1 - r0 + 1) * T;
  const cx = (c0 + c1 + 1) * T / 2, cz = (r0 + r1 + 1) * T / 2;
  const texPad = crearTextura(256, (ctx, s) => {
    ctx.fillStyle = '#0c2a14'; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = '#6dff8a'; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(s / 2, s / 2, s * 0.4, 0, 7); ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeRect(10, 10, s - 20, s - 20);
    ctx.fillStyle = '#6dff8a'; ctx.font = 'bold 120px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('H', s / 2, s / 2 + 6);
  });
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(ancho, largo), new THREE.MeshBasicMaterial({ map: texPad }));
  pad.rotation.x = -Math.PI / 2; pad.position.set(cx, 0.03, cz); scene.add(pad);
  const rayo = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, ALTO, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x55ff88, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
  rayo.position.set(cx, ALTO / 2, cz); scene.add(rayo);
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
  const ctx = cv.getContext('2d'); ctx.fillStyle = '#9dffb2'; ctx.font = 'bold 54px monospace'; ctx.textAlign = 'center'; ctx.fillText('EXTRACCIÓN', 256, 80);
  const cartel = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }));
  cartel.scale.set(7, 1.75, 1); cartel.position.set(cx, 3.2, cz); scene.add(cartel);
}


// 7. CARGA DE MODELOS GLB 

const cargador = new GLTFLoader();
const modelosZombi = {};     

async function cargarModelos() {
  for (const arma of CONFIG.armas) {                       
    const gltf = await cargador.loadAsync(arma.archivo);
    arma.objeto = gltf.scene;
    arma.objeto.position.set(...arma.pos);
    arma.objeto.scale.setScalar(arma.escala);
    arma.objeto.visible = false;
    sosteArma.add(arma.objeto);
    arma.muzzle = arma.objeto.getObjectByName('Muzzle') || arma.objeto;
    arma.fogonazo = new THREE.Sprite(new THREE.SpriteMaterial({ map: texturaBrillo(255, 190, 90), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    arma.fogonazo.scale.set(0.3, 0.3, 1); arma.fogonazo.visible = false;
    arma.luzFogonazo = new THREE.PointLight(0xffaa44, 4, 3); arma.luzFogonazo.visible = false;
    arma.muzzle.add(arma.fogonazo, arma.luzFogonazo);
    arma.municion = arma.municionInicial;
    arma.enfriamiento = 0;
  }
  for (const [tipo, def] of Object.entries(CONFIG.zombis)) {  
    modelosZombi[tipo] = (await cargador.loadAsync(def.archivo)).scene;
  }
}

// 8. SONIDO 
let ctxAudio = null;
function audio() {
  if (!ctxAudio) { try { ctxAudio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* sin audio */ } }
  return ctxAudio;
}
function tono(frec, dur, tipo = 'square', vol = 0.1, frecFin = null) {
  const a = audio(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain();
  o.type = tipo; o.frequency.setValueAtTime(frec, a.currentTime);
  if (frecFin) o.frequency.exponentialRampToValueAtTime(frecFin, a.currentTime + dur);
  g.gain.setValueAtTime(vol, a.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
  o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + dur);
}
function ruidoBlanco(dur, vol = 0.2, filtro = 1800) {
  const a = audio(); if (!a) return;
  const n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = a.createBufferSource(); s.buffer = buf;
  const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filtro;
  const g = a.createGain(); g.gain.value = vol;
  s.connect(f).connect(g).connect(a.destination); s.start();
}
const sonido = {
  pistola() { ruidoBlanco(0.12, 0.35, 3500); tono(180, 0.1, 'square', 0.12, 60); },
  rifle()   { ruidoBlanco(0.2, 0.45, 2200); tono(110, 0.18, 'sawtooth', 0.15, 40); },
  vacio()   { tono(900, 0.04, 'square', 0.08); },
  impacto() { tono(220, 0.12, 'sawtooth', 0.12, 90); },
  muerte()  { tono(160, 0.5, 'sawtooth', 0.14, 40); },
  gruñido() { tono(90, 0.45, 'sawtooth', 0.1, 55); },
  recoger() { tono(600, 0.08, 'sine', 0.12, 1200); setTimeout(() => tono(900, 0.1, 'sine', 0.1, 1500), 80); },
  escudo()  { tono(300, 0.4, 'sine', 0.14, 900); },
  derrota() { tono(300, 1.0, 'sawtooth', 0.18, 50); },
  victoria(){ [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tono(f, 0.25, 'triangle', 0.14), i * 140)); }
};


// 9. JUGADOR Y ARMAS 

const jugador = { pos: new THREE.Vector3(), yaw: 0, pitch: 0, escudo: 0 };
const teclas = {};                          
let armaActual = 0;                        
let cambio = null;                          
let retroceso = 0;                          
let balanceo = { x: 0, y: 0 };              
let bobFase = 0;

function posicionarJugador() {
  jugador.pos.set(centroX(inicioJugador.c), 0, centroZ(inicioJugador.r));
  jugador.yaw = -Math.PI / 2;               
  jugador.pitch = 0;
  jugador.escudo = 0;
  actualizarCamara(0, false);
}

function actualizarCamara(t, caminando) {
  const bob = caminando ? Math.sin(t * 9) * 0.045 : 0;
  camera.position.set(jugador.pos.x, CONFIG.jugador.alturaOjos + bob, jugador.pos.z);
  camera.rotation.set(jugador.pitch, jugador.yaw, 0);
}

function mostrarArma(i) {
  CONFIG.armas.forEach((a, k) => { a.objeto.visible = (k === i); });
  armaActual = i;
}
function cambiarArma(destino) {
  if (destino === armaActual || cambio || estado !== 'JUGANDO') return;
  cambio = { t: 0, destino, hecho: false };
}

function actualizarArma(dt, caminando) {
  const arma = CONFIG.armas[armaActual];
  arma.enfriamiento = Math.max(0, arma.enfriamiento - dt);
  let bajada = 0;
  if (cambio) {
    cambio.t += dt / 0.4;
    if (cambio.t >= 0.5 && !cambio.hecho) { mostrarArma(cambio.destino); cambio.hecho = true; actualizarHUD(); }
    bajada = -Math.sin(Math.min(cambio.t, 1) * Math.PI) * 0.45;
    if (cambio.t >= 1) cambio = null;
  }
  bobFase += dt * (caminando ? 10 : 2);
  const bx = caminando ? Math.sin(bobFase * 0.5) * 0.012 : Math.sin(bobFase) * 0.002;
  const by = caminando ? Math.abs(Math.sin(bobFase * 0.5)) * 0.012 : Math.sin(bobFase * 1.3) * 0.002;
  balanceo.x *= Math.max(0, 1 - dt * 8); balanceo.y *= Math.max(0, 1 - dt * 8);
  retroceso = Math.max(0, retroceso - dt * 7);
  sosteArma.position.set(bx + balanceo.x, by + bajada + balanceo.y, retroceso * 0.07);
  sosteArma.rotation.x = retroceso * 0.14;
  // el fogonazo dura muy poco
  if (arma.fogonazo.visible && arma.tFogonazo < performance.now()) { arma.fogonazo.visible = false; arma.luzFogonazo.visible = false; }
}


// 10. ZOMBIS 

let zombis = [];           
let hitboxes = [];         
const _tmp = new THREE.Vector3();

function crearZombi(tipo, c, r) {
  const def = CONFIG.zombis[tipo];
  const modelo = modelosZombi[tipo].clone(true);
  modelo.traverse(o => { if (o.isMesh) o.material = o.material.clone(); });   
  modelo.scale.setScalar(def.escala);

  const grupo = new THREE.Group();
  const pivote = new THREE.Group();
  pivote.add(modelo); grupo.add(pivote);
  grupo.position.set(centroX(c), 0, centroZ(r));
  grupo.rotation.y = Math.random() * Math.PI * 2;

  const caja = new THREE.Box3().setFromObject(modelo);
  const tam = caja.getSize(new THREE.Vector3());
  const hitbox = new THREE.Mesh(new THREE.BoxGeometry(0.95, tam.y, 0.95), new THREE.MeshBasicMaterial({ visible: false }));
  hitbox.position.y = tam.y / 2;
  grupo.add(hitbox);

  const z = {
    tipo, def, grupo, pivote, modelo, hitbox,
    pos: grupo.position,                     
    estado: 'INACTIVO',                      
    vida: CONFIG.vidaZombi,
    yaw: grupo.rotation.y,
    fase: Math.random() * 6, alzado: 0,      
    veJugador: false, tVision: Math.random() * 0.3,
    flash: 0, aturdido: 0, tMuerte: 0,
    partes: {
      brazoI: modelo.getObjectByName('ArmL'), brazoD: modelo.getObjectByName('ArmR'),
      piernaI: modelo.getObjectByName('LegL'), piernaD: modelo.getObjectByName('LegR'),
      torso: modelo.getObjectByName('Torso'), cabeza: modelo.getObjectByName('Head'),
      cono: modelo.getObjectByName('Cone')
    }
  };
  hitbox.userData.zombi = z;
  scene.add(grupo);
  zombis.push(z); hitboxes.push(hitbox);
  return z;
}

function activarZombi(z) {
  if (z.estado !== 'INACTIVO') return;
  z.estado = 'ACTIVO';
  sonido.gruñido();
}

function recibirImpacto(z, punto) {
  if (z.estado === 'MUERTO') return;
  z.vida -= 1;
  z.flash = 0.12;
  activarZombi(z);                                          
  emitir(punto, matBaba, 10, 3);                            
  sonido.impacto();
  mostrarHitMarker(z.vida <= 0);
  if (z.vida === 1) {                                       
    if (z.partes.cono) z.partes.cono.visible = false;      
    else if (z.partes.brazoI) z.partes.brazoI.visible = false;   
    z.aturdido = 0.25;
  } else if (z.vida <= 0) matarZombi(z);
}

function matarZombi(z) {
  z.estado = 'MUERTO';                                      
  z.tMuerte = 0;
  hitboxes = hitboxes.filter(h => h !== z.hitbox);          
  sonido.muerte();
  actualizarHUD();
}

function actualizarZombi(z, dt, t) {
  const P = z.partes;

  if (z.estado === 'MUERTO') {
    z.tMuerte += dt;
    z.pivote.rotation.x = -Math.min(z.tMuerte / 0.5, 1) * Math.PI / 2;
    if (z.tMuerte > 8) z.grupo.position.y -= dt * 0.5;      // se hunde y se elimina
    if (z.tMuerte > 11) { scene.remove(z.grupo); z.eliminado = true; }
    return;
  }

  const dx = jugador.pos.x - z.pos.x, dz = jugador.pos.z - z.pos.z;
  const dist = Math.hypot(dx, dz);

  if (z.flash > 0) {
    z.flash -= dt;
    const e = z.flash > 0 ? 1 : 0;
    z.modelo.traverse(o => { if (o.isMesh && o.material.emissive) o.material.emissive.setRGB(0.9 * e, 0.05 * e, 0.05 * e); });
  }

  if (z.estado === 'INACTIVO') {
    if (P.torso) { P.torso.rotation.z = Math.sin(t * 1.2 + z.fase) * 0.05; P.torso.rotation.x = 0.05; }
    if (P.cabeza) P.cabeza.rotation.z = Math.sin(t * 0.8 + z.fase) * 0.08;
    if (P.brazoI) P.brazoI.rotation.x = -0.15 + Math.sin(t + z.fase) * 0.05;
    if (P.brazoD) P.brazoD.rotation.x = -0.15 + Math.sin(t + z.fase + 1) * 0.05;
    const dCamino = campo[celdaDe(z.pos.x) + celdaDe(z.pos.z) * COLS] * T;
    if (dist < z.def.deteccion && dCamino >= 0 && dCamino < z.def.deteccion * 1.6) activarZombi(z);
    return;
  }

  z.alzado += (1 - z.alzado) * Math.min(1, dt * 4);         
  if (dist < CONFIG.contactoZombi) {
    if (jugador.escudo > 0) {
      z.aturdido = 1.0;
      moverConColision(z.pos, -dx / (dist || 1) * 4, -dz / (dist || 1) * 4, 0.55);
    } else { perder(); return; }
  }

  if (z.aturdido > 0) z.aturdido -= dt;
  else {
    z.tVision -= dt;
    if (z.tVision <= 0) { z.tVision = 0.25; z.veJugador = caminoLibre(z.pos.x, z.pos.z, jugador.pos.x, jugador.pos.z); }

    let objX = jugador.pos.x, objZ = jugador.pos.z;
    if (!z.veJugador) {
      const c = celdaDe(z.pos.x), r = celdaDe(z.pos.z);
      let mejor = campo[c + r * COLS], sig = null;
      for (const [dc, dr] of DIRS4) {
        const nc = c + dc, nr = r + dr;
        if (esSolida(nc, nr)) continue;
        const d = campo[nc + nr * COLS];
        if (d !== -1 && d < mejor) { mejor = d; sig = [nc, nr]; }
      }
      if (sig) { objX = centroX(sig[0]); objZ = centroZ(sig[1]); }
    }
    const ax = objX - z.pos.x, az = objZ - z.pos.z, ad = Math.hypot(ax, az) || 1;
    const vel = z.def.velocidad * dt;
    moverConColision(z.pos, ax / ad * vel, az / ad * vel, 0.55);
    // Girar suavemente hacia donde camina (el modelo mira hacia +Z)
    const objetivoYaw = Math.atan2(ax, az);
    let dif = objetivoYaw - z.yaw; dif = Math.atan2(Math.sin(dif), Math.cos(dif));
    z.yaw += dif * Math.min(1, dt * 8);
    z.grupo.rotation.y = z.yaw;
    z.fase += dt * z.def.velocidad * 2.6;                   
  }

  const f = z.fase, a = z.alzado;
  if (P.piernaI) P.piernaI.rotation.x = Math.sin(f) * 0.7;
  if (P.piernaD) P.piernaD.rotation.x = -Math.sin(f) * 0.7;
  if (P.brazoI) P.brazoI.rotation.x = (-0.15 - 1.3 * a) + Math.sin(f) * 0.1;
  if (P.brazoD) P.brazoD.rotation.x = (-0.15 - 1.3 * a) - Math.sin(f) * 0.1;
  if (P.torso) { P.torso.rotation.x = 0.1 + 0.12 * a; P.torso.rotation.z = Math.sin(f) * 0.06; }
  if (P.cabeza) P.cabeza.rotation.z = Math.sin(f * 0.5) * 0.12;
  z.modelo.position.y = Math.abs(Math.sin(f)) * 0.05;
}

function separarZombis() {
  const vivos = zombis.filter(z => z.estado === 'ACTIVO');
  for (let i = 0; i < vivos.length; i++) for (let j = i + 1; j < vivos.length; j++) {
    const a = vivos[i], b = vivos[j];
    const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz);
    if (d > 0.001 && d < 1.0) {
      const p = (1.0 - d) / 2;
      moverConColision(a.pos, -dx / d * p, -dz / d * p, 0.55);
      moverConColision(b.pos, dx / d * p, dz / d * p, 0.55);
    }
  }
}

// 11. COLECCIONABLES 
let coleccionables = [];
const texEtiqueta = crearTextura(128, (ctx, s) => {
  ctx.fillStyle = '#4a5a30'; ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = '#f2c230'; ctx.fillRect(0, 40, s, 48);
  ctx.fillStyle = '#1b1b1b'; ctx.font = 'bold 26px monospace'; ctx.textAlign = 'center'; ctx.fillText('AMMO', s / 2, 74);
});
function crearColeccionable(tipo, c, r) {
  const grupo = new THREE.Group();
  let halo;
  if (tipo === 'A') {            
    const caja = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.55, 0.6), new THREE.MeshStandardMaterial({ map: texEtiqueta, roughness: 0.7, emissive: 0x222211 }));
    const asa = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.08), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    asa.position.y = 0.32;
    grupo.add(caja, asa);
    halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: texturaBrillo(255, 210, 80), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  } else {                       
    const esfera = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1),
      new THREE.MeshStandardMaterial({ color: 0x2299ff, emissive: 0x1166ff, emissiveIntensity: 1.3, transparent: true, opacity: 0.85, roughness: 0.2 }));
    const anillo = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.04, 8, 28), new THREE.MeshBasicMaterial({ color: 0x66ccff }));
    anillo.rotation.x = Math.PI / 2;
    grupo.add(esfera, anillo);
    halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: texturaBrillo(80, 170, 255), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  }
  halo.scale.set(2.2, 2.2, 1); grupo.add(halo);
  grupo.position.set(centroX(c), 0.8, centroZ(r));
  scene.add(grupo);
  coleccionables.push({ tipo, grupo, fase: Math.random() * 6, recogido: false });
}

function actualizarColeccionables(dt, t) {
  for (const o of coleccionables) {
    if (o.recogido) continue;
    o.grupo.position.y = 0.8 + Math.sin(t * 2 + o.fase) * 0.12;   
    o.grupo.rotation.y += dt * 1.5;                                
    // ¿El jugador está lo bastante cerca para recogerlo?
    if (Math.hypot(o.grupo.position.x - jugador.pos.x, o.grupo.position.z - jugador.pos.z) < 1.7) {
      o.recogido = true; scene.remove(o.grupo); sonido.recoger();
      if (o.tipo === 'A') {
        CONFIG.armas.forEach(a => { a.municion = Math.min(a.municionMax, a.municion + a.municionPorCaja); });
        mostrarMensaje(`+${CONFIG.armas[0].municionPorCaja} balas pistola · +${CONFIG.armas[1].municionPorCaja} balas rifle`);
      } else {
        jugador.escudo = CONFIG.escudoDuracion; sonido.escudo();
        mostrarMensaje(`ESCUDO ACTIVADO: ${CONFIG.escudoDuracion} s`);
      }
      actualizarHUD();
    }
  }
}

// 12. DISPAROS (RF07) Y PARTÍCULAS
const raycaster = new THREE.Raycaster();
const matChispa = new THREE.MeshBasicMaterial({ color: 0xffcc66 });
const matBaba = new THREE.MeshBasicMaterial({ color: 0x8ccf3a });
const geoParticula = new THREE.BoxGeometry(0.07, 0.07, 0.07);
let particulas = [];
let trazadores = [];

function emitir(pos, material, n, vel) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(geoParticula, material);
    m.position.copy(pos); scene.add(m);
    particulas.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * vel, Math.random() * vel * 0.8, (Math.random() - 0.5) * vel), vida: 0.4 + Math.random() * 0.4 });
  }
}
function actualizarParticulas(dt) {
  for (const p of particulas) {
    p.v.y -= 9.8 * dt; p.m.position.addScaledVector(p.v, dt); p.vida -= dt;
    p.m.scale.setScalar(Math.max(0.1, p.vida * 2));
    if (p.vida <= 0) scene.remove(p.m);
  }
  particulas = particulas.filter(p => p.vida > 0);
  for (const t of trazadores) {
    t.vida -= dt; t.linea.material.opacity = Math.max(0, t.vida / 0.07);
    if (t.vida <= 0) { scene.remove(t.linea); t.linea.geometry.dispose(); t.linea.material.dispose(); }
  }
  trazadores = trazadores.filter(t => t.vida > 0);
}

function distanciaHastaPared(origen, dir, max) {
  for (let d = 0; d < max; d += 0.15) {
    const x = origen.x + dir.x * d, y = origen.y + dir.y * d, z = origen.z + dir.z * d;
    if (y < 0 || y > ALTO) return d;
    const c = celdaDe(x), r = celdaDe(z);
    if (c < 0 || r < 0 || c >= COLS || r >= FILAS) return d;
    const ch = mapa[r][c];
    if (ch === '#' || ch === 'B') return d;
    if (ch === 'X' && y < 1.3) return d;
  }
  return max;
}

function disparar() {
  const arma = CONFIG.armas[armaActual];
  if (estado !== 'JUGANDO' || cambio || arma.enfriamiento > 0) return;
  if (arma.municion <= 0) {                                 
    sonido.vacio(); mostrarMensaje('¡SIN MUNICIÓN! Busca una caja de municiones');
    arma.enfriamiento = 0.3; return;
  }
  arma.municion -= 1;                                       
  arma.enfriamiento = arma.cadencia;
  retroceso = arma.retroceso;
  arma.fogonazo.visible = arma.luzFogonazo.visible = true;
  arma.fogonazo.material.rotation = Math.random() * 6;
  arma.tFogonazo = performance.now() + 55;
  (armaActual === 0 ? sonido.pistola : sonido.rifle)();

  camera.updateMatrixWorld(); scene.updateMatrixWorld();
  const origen = camera.getWorldPosition(new THREE.Vector3());
  const dir = camera.getWorldDirection(new THREE.Vector3());
  dir.x += (Math.random() - 0.5) * arma.dispersion * 2;
  dir.y += (Math.random() - 0.5) * arma.dispersion * 2;
  dir.normalize();

  raycaster.set(origen, dir);
  raycaster.far = 100;
  const impactos = raycaster.intersectObjects(hitboxes, false);
  const dPared = distanciaHastaPared(origen, dir, 100);
  let fin;
  if (impactos.length && impactos[0].distance < dPared) {    
    fin = impactos[0].point;
    recibirImpacto(impactos[0].object.userData.zombi, fin);
  } else {
    fin = origen.clone().addScaledVector(dir, Math.min(dPared, 100));
    if (dPared < 100) emitir(fin, matChispa, 6, 3);          
  }
  const desde = new THREE.Vector3(0.22, -0.18, -0.8).applyMatrix4(camera.matrixWorld);
  const linea = new THREE.Line(new THREE.BufferGeometry().setFromPoints([desde, fin]),
    new THREE.LineBasicMaterial({ color: arma.colorTrazador, transparent: true }));
  scene.add(linea); trazadores.push({ linea, vida: 0.07 });
  actualizarHUD();
}

// 13. HUD Y ESTADOS DEL JUEGO
let estado = 'CARGANDO';   
const $ = id => document.getElementById(id);
const hud = {
  ammo: $('ammoActual'), nombre: $('nombreArma'), slot1: $('slot1'), slot2: $('slot2'),
  zombis: $('zombisRestantes'), escudo: $('escudoBarra'), escudoRell: $('escudoRelleno'), escudoTxt: $('escudoTexto'),
  msg: $('mensaje'), hit: $('hitmarker'), danio: $('danio'), efectoEscudo: $('efectoEscudo'),
  overlay: $('overlay'), titulo: $('ovTitulo'), sub: $('ovSub'), boton: $('btnAccion'), controles: $('ovControles')
};
let tMensaje = 0;
function mostrarMensaje(txt, ms = 2200) {
  hud.msg.textContent = txt; hud.msg.classList.add('visible');
  clearTimeout(tMensaje); tMensaje = setTimeout(() => hud.msg.classList.remove('visible'), ms);
}
let tHit = 0;
function mostrarHitMarker(muerte) {
  hud.hit.classList.toggle('kill', muerte); hud.hit.classList.add('visible');
  clearTimeout(tHit); tHit = setTimeout(() => hud.hit.classList.remove('visible'), 120);
}
function actualizarHUD() {
  const a = CONFIG.armas[armaActual];
  hud.ammo.textContent = a.municion; hud.ammo.classList.toggle('vacio', a.municion === 0);
  hud.nombre.textContent = a.nombre;
  hud.slot1.textContent = `[1] PISTOLA ${CONFIG.armas[0].municion}`;
  hud.slot2.textContent = `[2] RIFLE ${CONFIG.armas[1].municion}`;
  hud.slot1.classList.toggle('activo', armaActual === 0); hud.slot2.classList.toggle('activo', armaActual === 1);
  hud.zombis.textContent = zombis.filter(z => z.estado !== 'MUERTO').length;
}
function mostrarOverlay(titulo, sub, boton, clase, conControles = false) {
  hud.titulo.textContent = titulo; hud.sub.textContent = sub; hud.boton.textContent = boton;
  hud.overlay.className = 'visible ' + clase; hud.controles.style.display = conControles ? 'block' : 'none';
}

function perder() {
  if (estado !== 'JUGANDO') return;
  estado = 'GAMEOVER'; sonido.derrota();
  hud.danio.classList.add('visible');
  document.exitPointerLock();
  mostrarOverlay('GAME OVER', 'Un zombi te atrapó antes de llegar a la extracción.', 'REINICIAR MISIÓN', 'derrota');
}
function ganar() {
  estado = 'VICTORIA'; sonido.victoria();
  document.exitPointerLock();
  mostrarOverlay('¡MISIÓN COMPLETADA!', 'Has llegado a la zona de extracción.', 'JUGAR DE NUEVO', 'victoria');
}

function construirEntidades() {
  for (const e of entidadesMapa) {
    if (e.tipo === 'Z') crearZombi('normal', e.c, e.r);
    else if (e.tipo === 'C') crearZombi('cono', e.c, e.r);
    else crearColeccionable(e.tipo, e.c, e.r);
  }
}
function reiniciarPartida() {
  zombis.forEach(z => scene.remove(z.grupo));
  coleccionables.forEach(o => scene.remove(o.grupo));
  particulas.forEach(p => scene.remove(p.m));
  trazadores.forEach(t => scene.remove(t.linea));
  zombis = []; hitboxes = []; coleccionables = []; particulas = []; trazadores = [];
  CONFIG.armas.forEach(a => { a.municion = a.municionInicial; a.enfriamiento = 0; });
  cambio = null; mostrarArma(0);
  posicionarJugador(); actualizarCampo(true);
  construirEntidades();
  hud.danio.classList.remove('visible');
  estado = 'PAUSA'; actualizarHUD();
}

hud.boton.addEventListener('click', () => {
  audio() && audio().resume();
  if (estado === 'GAMEOVER' || estado === 'VICTORIA') reiniciarPartida();
  renderer.domElement.requestPointerLock();                
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === renderer.domElement) {   
    if (estado === 'MENU' || estado === 'PAUSA') { estado = 'JUGANDO'; hud.overlay.className = ''; }
  } else if (estado === 'JUGANDO') {                           
    estado = 'PAUSA'; mostrarOverlay('PAUSA', 'Partida en pausa.', 'CONTINUAR', 'pausa', true);
  }
});
document.addEventListener('mousemove', e => {                
  if (estado !== 'JUGANDO' || document.pointerLockElement !== renderer.domElement) return;
  jugador.yaw -= e.movementX * CONFIG.jugador.sensibilidad;
  jugador.pitch = Math.max(-1.45, Math.min(1.45, jugador.pitch - e.movementY * CONFIG.jugador.sensibilidad));
  balanceo.x -= e.movementX * 0.0004; balanceo.y += e.movementY * 0.0004;
  balanceo.x = Math.max(-0.05, Math.min(0.05, balanceo.x)); balanceo.y = Math.max(-0.04, Math.min(0.04, balanceo.y));
});
document.addEventListener('mousedown', e => {                
  if (e.button === 0 && document.pointerLockElement === renderer.domElement) disparar();
});
document.addEventListener('keydown', e => {
  teclas[e.code] = true;
  if (e.repeat) return;
  if (e.code === 'Digit1') cambiarArma(0);
  if (e.code === 'Digit2') cambiarArma(1);
});
document.addEventListener('keyup', e => { teclas[e.code] = false; });

// 14. BUCLE PRINCIPAL
const reloj = new THREE.Clock();
let tiempo = 0;

function actualizarJuego(dt) {
  const adelante = (teclas.KeyW ? 1 : 0) - (teclas.KeyS ? 1 : 0);
  const lado = (teclas.KeyD ? 1 : 0) - (teclas.KeyA ? 1 : 0);
  const caminando = adelante !== 0 || lado !== 0;
  if (caminando) {
    const fx = -Math.sin(jugador.yaw), fz = -Math.cos(jugador.yaw);   
    const rx = Math.cos(jugador.yaw), rz = -Math.sin(jugador.yaw);    
    let mx = fx * adelante + rx * lado, mz = fz * adelante + rz * lado;
    const m = Math.hypot(mx, mz); mx /= m; mz /= m;                   
    moverConColision(jugador.pos, mx * CONFIG.jugador.velocidad * dt, mz * CONFIG.jugador.velocidad * dt, CONFIG.jugador.radio);
  }
  actualizarCamara(tiempo, caminando);
  actualizarCampo();

  if (jugador.escudo > 0) {
    jugador.escudo = Math.max(0, jugador.escudo - dt);
    hud.escudo.classList.add('visible'); hud.efectoEscudo.classList.add('visible');
    hud.escudoRell.style.width = (jugador.escudo / CONFIG.escudoDuracion * 100) + '%';
    hud.escudoTxt.textContent = jugador.escudo.toFixed(1) + ' s';
  } else { hud.escudo.classList.remove('visible'); hud.efectoEscudo.classList.remove('visible'); }

  for (const z of zombis) { actualizarZombi(z, dt, tiempo); if (estado !== 'JUGANDO') return; }
  zombis = zombis.filter(z => !z.eliminado);
  separarZombis();
  actualizarColeccionables(dt, tiempo);
  actualizarParticulas(dt);
  actualizarArma(dt, caminando);

  for (const l of luces) if (l.parpadea) l.luz.intensity = l.base * (Math.random() < 0.06 ? 0.15 : (0.9 + Math.random() * 0.1));

  if (mapa[celdaDe(jugador.pos.z)][celdaDe(jugador.pos.x)] === 'E') ganar();
}

function bucle() {
  requestAnimationFrame(bucle);
  const dt = Math.min(reloj.getDelta(), 0.05);
  tiempo += dt;
  if (estado === 'JUGANDO') actualizarJuego(dt);
  else { for (const o of coleccionables) o.grupo.rotation.y += dt; }    
  renderer.clear();
  renderer.render(scene, camera);
  renderer.clearDepth();
  renderer.render(escenaArma, camaraArma);
}

(async function iniciar() {
  try {
    construirNivel();
    await cargarModelos();
    mostrarArma(0);
    posicionarJugador();
    actualizarCampo(true);
    construirEntidades();
    actualizarHUD();
    estado = 'MENU';
    mostrarOverlay('OPERACIÓN EXTRACCIÓN', 'Cruza la base militar infestada y llega a la zona de extracción.', 'INICIAR MISIÓN', 'menu', true);
  } catch (err) {
    console.error(err);
    $('ovTitulo').textContent = 'ERROR AL CARGAR';
    $('ovSub').textContent = 'No se pudieron cargar los modelos .glb. Abre el juego desde un servidor local (mira el README).';
    hud.overlay.className = 'visible derrota'; hud.boton.style.display = 'none';
  }
  bucle();
})();
