const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Verdensstørrelse (mye større enn skjermen)
const WORLD = { width: 2500, height: 2000 };
let camera = { x: 0, y: 0 };

const DIM = { cat: 48, mouse: 32, cheese: 24, trap: 32, wall: 32 };
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
    isStarted: false, myId: null, players: {}, obstacles: [],
    cheese: { x: 0, y: 0 }, traps: [], seed: 0, scoreGoal: 10, roleTimer: 120
};

const keys = {};
window.addEventListener('keydown', e => keys[e.key] = true);
window.addEventListener('keyup', e => keys[e.key] = false);

function seededRandom(s) {
    const x = Math.sin(s) * 10000;
    return x - Math.floor(x);
}

function initArena(seed) {
    gameState.seed = seed;
    gameState.obstacles = [];
    let s = seed;
    for (let i = 0; i < 40; i++) {
        const type = seededRandom(s++) > 0.5 ? 'wall' : 'box';
        gameState.obstacles.push({
            x: Math.floor(seededRandom(s++) * (WORLD.width / 32)) * 32,
            y: Math.floor(seededRandom(s++) * (WORLD.height / 32)) * 32,
            w: 32 * (1 + Math.floor(seededRandom(s++) * 4)),
            h: 32 * (1 + Math.floor(seededRandom(s++) * 3)),
            type: type
        });
    }
    spawnCheese(seed + 123);
}

function spawnCheese(s) {
    gameState.cheese = {
        x: 100 + seededRandom(s) * (WORLD.width - 200),
        y: 100 + seededRandom(s + 1) * (WORLD.height - 200)
    };
}

function update() {
    if (!gameState.isStarted || !gameState.myId) return;
    const me = gameState.players[gameState.myId];
    if (!me) return;

    // Timer-nedtelling
    if (gameState.roleTimer > 0) {
        gameState.roleTimer -= 1/60;
        const m = Math.floor(gameState.roleTimer / 60);
        const s = Math.floor(gameState.roleTimer % 60);
        document.getElementById('timer').innerText = `${m}:${s.toString().padStart(2, '0')}`;
    }

    if (me.frozen > 0) {
        me.frozen -= 1/60;
        me.vx = 0; me.vy = 0;
        syncPosition(me);
        return;
    }

    const settings = me.role === 'cat' ? catSettings : mouseSettings;
    let oldX = me.x, oldY = me.y;

    if (keys['ArrowUp'] || keys['w']) me.vy -= settings.acc;
    if (keys['ArrowDown'] || keys['s']) me.vy += settings.acc;
    if (keys['ArrowLeft'] || keys['a']) me.vx -= settings.acc;
    if (keys['ArrowRight'] || keys['d']) me.vx += settings.acc;

    me.vx *= settings.friction; me.vy *= settings.friction;
    me.x += me.vx; me.y += me.vy;

    // Kollisjon verden og hindre
    me.x = Math.max(0, Math.min(me.x, WORLD.width));
    me.y = Math.max(0, Math.min(me.y, WORLD.height));

    gameState.obstacles.forEach(obs => {
        if (me.x + 12 > obs.x && me.x - 12 < obs.x + obs.w &&
            me.y + 12 > obs.y && me.y - 12 < obs.y + obs.h) {
            me.x = oldX; me.y = oldY;
        }
    });

    // Kamerafølging
    camera.x = me.x - window.innerWidth / 2;
    camera.y = me.y - window.innerHeight / 2;

    // Animasjon
    if (Math.abs(me.vx) > 0.1 || Math.abs(me.vy) > 0.1) {
        me.gameFrame = (me.gameFrame || 0) + 1;
        me.frameX = Math.floor(me.gameFrame / 7) % 4;
    }

    // Ost (kun mus)
    if (me.role === 'mouse') {
        if (Math.hypot(me.x - gameState.cheese.x, me.y - gameState.cheese.y) < 30) {
            me.score++;
            spawnCheese(Date.now());
            if (isHost) broadcastScore(me.id, me.score, gameState.cheese);
        }
    }

    // Jakt (kun katt sjekker om den tar noen)
    if (me.role === 'cat') {
        Object.values(gameState.players).forEach(p => {
            if (p.role === 'mouse' && p.frozen <= 0 && Math.hypot(me.x - p.x, me.y - p.y) < 40) {
                sendTagEvent(p.id);
            }
        });
    }

    syncPosition(me);
}

function draw() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    // Bakgrunnsrutenett
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    for(let x=0; x<WORLD.width; x+=100) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x, WORLD.height); ctx.stroke(); }

    // Hindre
    gameState.obstacles.forEach(obs => {
        const img = obs.type === 'wall' ? sprites.wall : sprites.box;
        for (let x = 0; x < obs.w; x += 32) {
            for (let y = 0; y < obs.h; y += 32) { ctx.drawImage(img, obs.x + x, obs.y + y, 32, 32); }
        }
    });

    // Feller og ost
    gameState.traps.forEach(t => ctx.drawImage(sprites.trap, t.x - 16, t.y - 16, 32, 32));
    ctx.drawImage(sprites.cheese, gameState.cheese.x - 12, gameState.cheese.y - 12, 24, 24);

    // Spillere
    Object.values(gameState.players).forEach(p => {
        ctx.save();
        ctx.translate(p.x, p.y);
        if (p.vx < 0) ctx.scale(-1, 1);
        if (p.role === 'cat') {
            ctx.drawImage(sprites.cat, (p.frameX || 0) * 48, 0, 48, 48, -24, -24, 48, 48);
        } else {
            ctx.drawImage(sprites.mouse, -16, -16, 32, 32);
        }
        ctx.restore();
        ctx.fillStyle = p.frozen > 0 ? "cyan" : "white";
        ctx.font = "bold 14px Arial"; ctx.textAlign = "center";
        ctx.fillText(p.frozen > 0 ? `❄️ ${Math.ceil(p.frozen)}` : p.name, p.x, p.y - 35);
    });

    ctx.restore();
    updateLeaderboardUI();
    requestAnimationFrame(draw);
}

function updateLeaderboardUI() {
    const lb = document.getElementById('leaderboard');
    if (!lb) return;
    const sorted = Object.values(gameState.players).sort((a,b) => b.score - a.score);
    lb.innerHTML = sorted.map(p => `<div style="color:${p.role==='cat'?'red':'blue'}">${p.name}: ${p.score}</div>`).join('');
}

draw();
setInterval(update, 1000/60);
