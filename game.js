// --- KONFIGURASJON ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 800;
canvas.height = 600;

const DIM = { cat: 48, mouse: 32, cheese: 24, trap: 32, wall: 32, box: 32 };
const mouseSettings = { acc: 0.8, topSpeed: 5, friction: 0.9 };
const catSettings = { acc: 0.25, topSpeed: 8, friction: 0.96 };

const sprites = {
    cat: new Image(), mouse: new Image(), cheese: new Image(),
    trap: new Image(), wall: new Image(), box: new Image()
};
sprites.cat.src = 'assets/cat.png';
sprites.mouse.src = 'assets/mouse.png';
sprites.cheese.src = 'assets/cheese.png';
sprites.trap.src = 'assets/trap.png';
sprites.wall.src = 'assets/wall.png';
sprites.box.src = 'assets/box.png';

let gameState = {
    isStarted: false,
    myId: null,
    players: {},
    obstacles: [],
    cheese: { x: 0, y: 0 },
    traps: [],
    seed: 0,
    scoreGoal: 10,
    roleTimer: 120
};

const keys = {};
window.addEventListener('keydown', e => keys[e.key] = true);
window.addEventListener('keyup', e => keys[e.key] = false);

// --- MATTE & ARENA ---
function seededRandom(s) {
    const x = Math.sin(s) * 10000;
    return x - Math.floor(x);
}

function initArena(seed) {
    gameState.seed = seed;
    gameState.obstacles = [];
    let s = seed;
    for (let i = 0; i < 15; i++) {
        const type = seededRandom(s++) > 0.5 ? 'wall' : 'box';
        gameState.obstacles.push({
            x: Math.floor(seededRandom(s++) * (canvas.width / 32)) * 32,
            y: Math.floor(seededRandom(s++) * (canvas.height / 32)) * 32,
            w: 32 * (1 + Math.floor(seededRandom(s++) * 3)),
            h: 32 * (1 + Math.floor(seededRandom(s++) * 2)),
            type: type
        });
    }
    spawnCheese(seed + 99);
}

function spawnCheese(s) {
    gameState.cheese = {
        x: 50 + seededRandom(s) * (canvas.width - 100),
        y: 50 + seededRandom(s + 1) * (canvas.height - 100)
    };
}

// --- HOVED-LOOP ---
function update() {
    if (!gameState.isStarted || !gameState.myId) return;

    const me = gameState.players[gameState.myId];
    if (!me) return;

    // Frys-logikk
    if (me.frozen > 0) {
        me.frozen -= 1/60;
        syncPosition(me);
        return;
    }

    const settings = me.role === 'cat' ? catSettings : mouseSettings;

    // Bevegelse
    let oldX = me.x;
    let oldY = me.y;

    if (keys['ArrowUp'] || keys['w']) me.vy -= settings.acc;
    if (keys['ArrowDown'] || keys['s']) me.vy += settings.acc;
    if (keys['ArrowLeft'] || keys['a']) me.vx -= settings.acc;
    if (keys['ArrowRight'] || keys['d']) me.vx += settings.acc;

    me.vx *= settings.friction;
    me.vy *= settings.friction;
    me.x += me.vx;
    me.y += me.vy;

    // Kollisjon vegger og hindre
    if (me.x < 0 || me.x > canvas.width) me.x = oldX;
    if (me.y < 0 || me.y > canvas.height) me.y = oldY;

    gameState.obstacles.forEach(obs => {
        if (me.x + 10 > obs.x && me.x - 10 < obs.x + obs.w &&
            me.y + 10 > obs.y && me.y - 10 < obs.y + obs.h) {
            me.x = oldX; me.y = oldY;
        }
    });

    // Animasjon-logikk
    if (Math.abs(me.vx) > 0.1 || Math.abs(me.vy) > 0.1) {
        me.gameFrame = (me.gameFrame || 0) + 1;
        me.frameX = Math.floor(me.gameFrame / 7) % 4; // Antar 4 frames
    }

    // Sjekk ost (kun mus)
    if (me.role === 'mouse') {
        const dist = Math.hypot(me.x - gameState.cheese.x, me.y - gameState.cheese.y);
        if (dist < 25) {
            me.score++;
            spawnCheese(Date.now());
            if (isHost) broadcastScore(me.id, me.score, gameState.cheese);
        }
    }

    // Sjekk feller
    gameState.traps.forEach((trap, index) => {
        const dist = Math.hypot(me.x - trap.x, me.y - trap.y);
        if (me.role === 'mouse' && dist < 20) {
            me.frozen = 5;
            me.x = Math.random() * canvas.width;
            me.y = Math.random() * canvas.height;
            gameState.traps.splice(index, 1);
        }
    });

    syncPosition(me);
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Tegn hinder
    gameState.obstacles.forEach(obs => {
        const img = obs.type === 'wall' ? sprites.wall : sprites.box;
        for (let x = 0; x < obs.w; x += 32) {
            for (let y = 0; y < obs.h; y += 32) {
                ctx.drawImage(img, obs.x + x, obs.y + y, 32, 32);
            }
        }
    });

    // 2. Tegn feller og ost
    gameState.traps.forEach(t => ctx.drawImage(sprites.trap, t.x - 16, t.y - 16, 32, 32));
    ctx.drawImage(sprites.cheese, gameState.cheese.x - 12, gameState.cheese.y - 12, 24, 24);

    // 3. Tegn spillere
    Object.values(gameState.players).forEach(p => {
        ctx.save();
        ctx.translate(p.x, p.y);
        if (p.vx < 0) ctx.scale(-1, 1);

        if (p.role === 'cat') {
            const fx = (p.frameX || 0) * DIM.cat;
            ctx.drawImage(sprites.cat, fx, 0, DIM.cat, DIM.cat, -24, -24, 48, 48);
        } else {
            ctx.drawImage(sprites.mouse, -16, -16, 32, 32);
        }
        ctx.restore();

        // Navn og nedtelling
        ctx.fillStyle = p.frozen > 0 ? "cyan" : "white";
        ctx.font = "bold 12px Arial";
        ctx.textAlign = "center";
        let label = p.name;
        if (p.frozen > 0) label = `❄️ ${Math.ceil(p.frozen)}s`;
        ctx.fillText(label, p.x, p.y - 30);
    });

    updateLeaderboardUI();
    requestAnimationFrame(draw);
}

function updateLeaderboardUI() {
    const lb = document.getElementById('leaderboard');
    if (!lb) return;
    const sorted = Object.values(gameState.players).sort((a,b) => b.score - a.score);
    lb.innerHTML = sorted.map(p => `<div style="color:${p.color}">${p.name}: ${p.score}</div>`).join('');
}

// Start loopen
draw();
setInterval(update, 1000/60);
