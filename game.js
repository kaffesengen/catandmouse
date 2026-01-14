// --- 1. KONFIGURASJON OG VARIABLER ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const mouseSettings = { acc: 0.8, topSpeed: 5, friction: 0.9, radius: 15 };
const catSettings = { acc: 0.25, topSpeed: 8, friction: 0.96, radius: 22 };

let gameState = {
    isStarted: false,
    myId: null,
    players: {}, // Inneholder alle spillere: { id: {x, y, vx, vy, role, color, score, name, frozen} }
    obstacles: [],
    cheese: [],
    traps: [],
    seed: 0,
    scoreGoal: 10,
    gameTimer: 120 // 2 minutter til neste katt-bytte
};

const keys = {};
window.addEventListener('keydown', e => keys[e.key] = true);
window.addEventListener('keyup', e => keys[e.key] = false);

// --- 2. HJELPEFUNKSJONER (SEED & MATTE) ---
function seededRandom(seed) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

// --- 3. SPILL-LOGIKK ---

// Generer banen likt for alle
function initArena(seed) {
    gameState.seed = seed;
    gameState.obstacles = [];
    let s = seed;
    for (let i = 0; i < 12; i++) {
        gameState.obstacles.push({
            x: seededRandom(s++) * (canvas.width - 100),
            y: seededRandom(s++) * (canvas.height - 100),
            w: 40 + seededRandom(s++) * 120,
            h: 40 + seededRandom(s++) * 120
        });
    }
    spawnCheese();
}

function spawnCheese() {
    let s = gameState.seed + Date.now(); // Tilfeldig men basert på tid
    gameState.cheese = {
        x: seededRandom(s++) * (canvas.width - 20),
        y: seededRandom(s++) * (canvas.height - 20)
    };
}

function update() {
    if (!gameState.isStarted || !gameState.myId) return;

    const me = gameState.players[gameState.myId];
    if (!me || me.frozen > 0) {
        if (me && me.frozen > 0) me.frozen -= 1/60; // Tell ned frys (60fps)
        return;
    }

    const settings = me.role === 'cat' ? catSettings : mouseSettings;

    // Bevegelse
    if (keys['ArrowUp'] || keys['w']) me.vy -= settings.acc;
    if (keys['ArrowDown'] || keys['s']) me.vy += settings.acc;
    if (keys['ArrowLeft'] || keys['a']) me.vx -= settings.acc;
    if (keys['ArrowRight'] || keys['d']) me.vx += settings.acc;

    // Friksjon og fart
    me.vx *= settings.friction;
    me.vy *= settings.friction;
    
    let speed = Math.sqrt(me.vx**2 + me.vy**2);
    if (speed > settings.topSpeed) {
        me.vx = (me.vx / speed) * settings.topSpeed;
        me.vy = (me.vy / speed) * settings.topSpeed;
    }

    // Lagre gammel posisjon for kollisjonshåndtering
    let oldX = me.x;
    let oldY = me.y;

    me.x += me.vx;
    me.y += me.vy;

    // Veggkollisjon
    if (me.x < 0 || me.x > canvas.width) me.x = oldX;
    if (me.y < 0 || me.y > canvas.height) me.y = oldY;

    // Hindring-kollisjon (Enkel boks)
    gameState.obstacles.forEach(obs => {
        if (me.x + settings.radius > obs.x && me.x - settings.radius < obs.x + obs.w &&
            me.y + settings.radius > obs.y && me.y - settings.radius < obs.y + obs.h) {
            me.x = oldX;
            me.y = oldY;
            me.vx = 0; me.vy = 0;
        }
    });

    // Sjekk om mus tar ost
    if (me.role === 'mouse') {
        let dist = Math.hypot(me.x - gameState.cheese.x, me.y - gameState.cheese.y);
        if (dist < 30) {
            me.score++;
            spawnCheese();
            broadcastGameState(); // Send beskjed til andre om ny score/ost
        }
    }

    // Katte-triks: Slipp felle (Eks: Trykk Mellomrom)
    if (me.role === 'cat' && keys[' ']) {
        // Logikk for å legge felle her
    }

    // Send din posisjon til de andre (kalles fra network.js)
    syncPosition(me);
}

// --- 4. TEGNING (DRAW) ---
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Tegn hindere
    ctx.fillStyle = "#4a4e69";
    gameState.obstacles.forEach(obs => {
        ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
        // Litt 3D-effekt
        ctx.strokeStyle = "#222";
        ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);
    });

    // Tegn ost
    ctx.font = "24px serif";
    ctx.fillText("🧀", gameState.cheese.x - 12, gameState.cheese.y + 12);

    // Tegn spillere
    Object.values(gameState.players).forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.role === 'cat' ? 22 : 15, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = p.role === 'cat' ? 'red' : 'white';
        ctx.stroke();

        // Navn og frys-nedtelling
        ctx.fillStyle = "black";
        ctx.font = "12px Arial";
        ctx.textAlign = "center";
        let label = p.name;
        if (p.frozen > 0) label = `❄️ ${Math.ceil(p.frozen)}s`;
        ctx.fillText(label, p.x, p.y - 30);
    });

    updateLeaderboard();
    requestAnimationFrame(draw);
}

// --- 5. UI OPPDATERING ---
function updateLeaderboard() {
    const list = Object.values(gameState.players).sort((a, b) => b.score - a.score);
    const container = document.getElementById('leaderboard');
    container.innerHTML = `<h4>Mål: ${gameState.scoreGoal}</h4>`;
    list.forEach(p => {
        container.innerHTML += `<div style="color:${p.color}">${p.name}: ${p.score}</div>`;
    });
}

// Start loopen
function gameLoop() {
    update();
    draw();
}
requestAnimationFrame(gameLoop);
