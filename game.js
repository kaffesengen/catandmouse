const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const WORLD = { width: 2500, height: 2000 };
let camera = { x: 0, y: 0, zoom: 1.6 };

const DIM = { cat: 64, mouse: 40, cheese: 32, wall: 32 };
const mouseSettings = { acc: 1.1, topSpeed: 7, friction: 0.88 };
const catSettings = { acc: 0.35, topSpeed: 10, friction: 0.95 };

const sprites = { cat: new Image(), mouse: new Image(), cheese: new Image(), trap: new Image(), wall: new Image(), box: new Image() };
sprites.cat.src = 'assets/cat.png'; sprites.mouse.src = 'assets/mouse.png'; sprites.cheese.src = 'assets/cheese.png';
sprites.trap.src = 'assets/trap.png'; sprites.wall.src = 'assets/wall.png'; sprites.box.src = 'assets/box.png';

const sounds = { tag: document.getElementById('snd-tag'), cheese: document.getElementById('snd-cheese'), trap: document.getElementById('snd-trap') };

let gameState = { isStarted: false, myId: null, players: {}, obstacles: [], cheese: {x:0,y:0}, traps: [], roleTimer: 120, scoreGoal: 10 };
const keys = {};
const mobileKeys = { up: false, down: false, left: false, right: false };

// Mobil-knapper
const setupBtn = (id, key) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.ontouchstart = (e) => { e.preventDefault(); mobileKeys[key] = true; };
    btn.ontouchend = (e) => { e.preventDefault(); mobileKeys[key] = false; };
};
setupBtn('btn-up', 'up'); setupBtn('btn-down', 'down'); setupBtn('btn-left', 'left'); setupBtn('btn-right', 'right');
document.getElementById('btn-trap').onclick = () => { placeTrap(); };

window.onkeydown = e => {
    keys[e.key.toLowerCase()] = true;
    if (e.code === 'KeyE' || e.code === 'Enter') placeTrap();
};
window.onkeyup = e => keys[e.key.toLowerCase()] = false;

function initArena(seedStr) {
    gameState.obstacles = [];
    let seed = 0;
    if (seedStr) {
        for (let i = 0; i < seedStr.length; i++) seed += seedStr.charCodeAt(i);
    } else {
        seed = Math.random() * 10000;
    }
    
    let s = seed;
    const rng = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };

    // Vegger i linjer
    for(let i=0; i<30; i++) {
        let x = Math.floor(rng() * (WORLD.width / 32)) * 32;
        let y = Math.floor(rng() * (WORLD.height / 32)) * 32;
        let isH = rng() > 0.5;
        let len = 4 + Math.floor(rng() * 8);
        for(let j=0; j<len; j++) {
            let wx = isH ? x + (j * 32) : x;
            let wy = isH ? y : y + (j * 32);
            if(wx < WORLD.width - 32 && wy < WORLD.height - 32) {
                gameState.obstacles.push({ x: wx, y: wy, w: 32, h: 32, type: 'wall' });
            }
        }
    }
    // Strø-bokser
    for(let i=0; i<50; i++) {
        gameState.obstacles.push({ x: rng()*(WORLD.width-32), y: rng()*(WORLD.height-32), w: 32, h: 32, type: 'box' });
    }
    gameState.cheese = { x: WORLD.width/2, y: WORLD.height/2 };
}

function update() {
    if (!gameState.isStarted || !gameState.myId) return;
    const me = gameState.players[gameState.myId];
    if (!me) return;

    if (me.frozen > 0) {
        me.frozen -= 1/60; me.vx = 0; me.vy = 0;
        syncPosition(me); return;
    }

    const set = me.role === 'cat' ? catSettings : mouseSettings;
    let oldX = me.x, oldY = me.y;

    if (keys['w'] || keys['arrowup'] || mobileKeys.up) me.vy -= set.acc;
    if (keys['s'] || keys['arrowdown'] || mobileKeys.down) me.vy += set.acc;
    if (keys['a'] || keys['arrowleft'] || mobileKeys.left) me.vx -= set.acc;
    if (keys['d'] || keys['arrowright'] || mobileKeys.right) me.vx += set.acc;

    me.vx *= set.friction; me.vy *= set.friction;
    me.x += me.vx; me.y += me.vy;

    // YTTERKANTER OG HINDRE
    const radius = 15;
    if (me.x < radius || me.x > WORLD.width - radius) me.x = oldX;
    if (me.y < radius || me.y > WORLD.height - radius) me.y = oldY;

    gameState.obstacles.forEach(o => {
        if (me.x + radius > o.x && me.x - radius < o.x + o.w && me.y + radius > o.y && me.y - radius < o.y + o.h) {
            me.x = oldX; me.y = oldY;
        }
    });

    // Retning og Animasjon (Stopp på frame 0)
    if (Math.abs(me.vx) > 0.2) me.facing = me.vx > 0 ? 1 : -1;
    if (Math.abs(me.vx) > 0.2 || Math.abs(me.vy) > 0.2) {
        me.animT = (me.animT || 0) + 1;
        me.frameX = Math.floor(me.animT / 7) % 4;
    } else {
        me.frameX = 0;
    }

    camera.x = me.x - (window.innerWidth / camera.zoom) / 2;
    camera.y = me.y - (window.innerHeight / camera.zoom) / 2;

    // OST-SJEKK (Lokalt for musa)
    if (me.role === 'mouse') {
        let d = Math.hypot(me.x - gameState.cheese.x, me.y - gameState.cheese.y);
        if (d < 35) requestScore(me.id);
    }

    // TAG-SJEKK (Kun Host sjekker kollisjon)
    if (isHost && me.role === 'cat') {
        Object.values(gameState.players).forEach(p => {
            if (p.role === 'mouse' && p.frozen <= 0 && Math.hypot(me.x - p.x, me.y - p.y) < 50) {
                processTag(p.id, me.id);
            }
        });
    }

    syncPosition(me);
}

function draw() {
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!gameState.isStarted) return;

    ctx.save();
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    // Bakgrunn / Bakken
    ctx.fillStyle = "#444";
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);

    // Tegn objekter
    gameState.obstacles.forEach(o => ctx.drawImage(o.type==='wall'?sprites.wall:sprites.box, o.x, o.y, 32, 32));
    gameState.traps.forEach(t => ctx.drawImage(sprites.trap, t.x - 16, t.y - 16, 32, 32));
    ctx.drawImage(sprites.cheese, gameState.cheese.x-16, gameState.cheese.y-16, 32, 32);

    Object.values(gameState.players).forEach(p => {
        ctx.save();
        ctx.translate(p.x, p.y);
        if (p.facing === -1) ctx.scale(-1, 1);
        
        let s = p.role === 'cat' ? 64 : 40;
        if (p.role === 'cat') {
            ctx.drawImage(sprites.cat, (p.frameX || 0)*48, 0, 48, 48, -s/2, -s/2, s, s);
        } else {
            ctx.drawImage(sprites.mouse, -s/2, -s/2, s, s);
        }
        ctx.restore();
        
        ctx.fillStyle = "white"; ctx.font = "bold 11px Arial"; ctx.textAlign = "center";
        ctx.fillText(p.frozen > 0 ? "❄️" : p.name, p.x, p.y - 35);
    });

    ctx.restore();
    updateLeaderboardUI();
    requestAnimationFrame(draw);
}

function updateLeaderboardUI() {
    const el = document.getElementById('leaderboard');
    if (!el) return;
    const sorted = Object.values(gameState.players).sort((a,b) => b.score - a.score);
    el.innerHTML = sorted.map(p => `<div style="color:${p.role==='cat'?'#e21b3c':'#1368ce'}">${p.name}: ${p.score}</div>`).join('');
}

function placeTrap() {
    const me = gameState.players[gameState.myId];
    if (me && me.role === 'cat' && me.frozen <= 0) {
        broadcastTrap({ x: me.x, y: me.y });
    }
}

draw();
setInterval(update, 1000/60);
