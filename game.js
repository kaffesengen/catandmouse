const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const WORLD = { width: 2500, height: 2000 };
let camera = { x: 0, y: 0, zoom: 1.5 };

const DIM = { cat: 64, mouse: 40, cheese: 32, wall: 32 };
const mouseSettings = { acc: 1.1, topSpeed: 7, friction: 0.88 };
const catSettings = { acc: 0.35, topSpeed: 10, friction: 0.95 };

const sprites = { 
    cat: new Image(), mouse: new Image(), cheese: new Image(), 
    trap: new Image(), wall: new Image(), box: new Image() 
};
sprites.cat.src = 'assets/cat.png'; sprites.mouse.src = 'assets/mouse.png'; sprites.cheese.src = 'assets/cheese.png';
sprites.trap.src = 'assets/trap.png'; sprites.wall.src = 'assets/wall.png'; sprites.box.src = 'assets/box.png';

let gameState = { isStarted: false, myId: null, players: {}, obstacles: [], cheese: {x:0,y:0}, traps: [], roleTimer: 120, scoreGoal: 10 };
const keys = {};
const mobileKeys = { up: false, down: false, left: false, right: false };

// Responsiv kontroll-fiks
const setupBtn = (id, key) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    const start = (e) => { e.preventDefault(); mobileKeys[key] = true; };
    const end = (e) => { e.preventDefault(); mobileKeys[key] = false; };
    btn.addEventListener('touchstart', start); btn.addEventListener('touchend', end);
    btn.addEventListener('mousedown', start); btn.addEventListener('mouseup', end);
};
setupBtn('btn-up', 'up'); setupBtn('btn-down', 'down'); setupBtn('btn-left', 'left'); setupBtn('btn-right', 'right');
document.getElementById('btn-trap').addEventListener('click', () => placeTrap());

window.onkeydown = e => {
    keys[e.key.toLowerCase()] = true;
    if (e.code === 'KeyE' || e.code === 'Enter' || e.code === 'Space') placeTrap();
};
window.onkeyup = e => keys[e.key.toLowerCase()] = false;

function initArena(seedStr) {
    gameState.obstacles = [];
    let seed = 123;
    if (seedStr) {
        for (let i = 0; i < seedStr.length; i++) seed += seedStr.charCodeAt(i);
    }
    let s = seed;
    const rng = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };

    // Yttervegger
    for(let x=0; x<WORLD.width; x+=32) {
        gameState.obstacles.push({x, y:0, w:32, h:32, type:'wall'});
        gameState.obstacles.push({x, y:WORLD.height-32, w:32, h:32, type:'wall'});
    }
    for(let y=0; y<WORLD.height; y+=32) {
        gameState.obstacles.push({x:0, y, w:32, h:32, type:'wall'});
        gameState.obstacles.push({x:WORLD.width-32, y, w:32, h:32, type:'wall'});
    }

    // Innvendige vegger i linjer
    for(let i=0; i<25; i++) {
        let x = Math.floor(rng() * (WORLD.width / 32)) * 32;
        let y = Math.floor(rng() * (WORLD.height / 32)) * 32;
        let isH = rng() > 0.5;
        let len = 4 + Math.floor(rng() * 6);
        for(let j=0; j<len; j++) {
            let wx = isH ? x + (j * 32) : x;
            let wy = isH ? y : y + (j * 32);
            if(wx > 32 && wx < WORLD.width-64 && wy > 32 && wy < WORLD.height-64) {
                gameState.obstacles.push({ x: wx, y: wy, w: 32, h: 32, type: 'wall' });
            }
        }
    }
    // Strøbokser
    for(let i=0; i<40; i++) {
        gameState.obstacles.push({ x: 100+rng()*(WORLD.width-200), y: 100+rng()*(WORLD.height-200), w: 32, h: 32, type: 'box' });
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

    // Kollisjon
    const radius = 15;
    gameState.obstacles.forEach(o => {
        if (me.x + radius > o.x && me.x - radius < o.x + o.w && me.y + radius > o.y && me.y - radius < o.y + o.h) {
            me.x = oldX; me.y = oldY;
        }
    });

    // Retning og Animasjon
    if (Math.abs(me.vx) > 0.2) me.facing = me.vx > 0 ? 1 : -1;
    if (Math.abs(me.vx) > 0.2 || Math.abs(me.vy) > 0.2) {
        me.animT = (me.animT || 0) + 1;
        me.frameX = Math.floor(me.animT / 7) % 4;
    } else { me.frameX = 0; }

    camera.x = me.x - (window.innerWidth / camera.zoom) / 2;
    camera.y = me.y - (window.innerHeight / camera.zoom) / 2;

    // Grenser for kamera
    camera.x = Math.max(0, Math.min(camera.x, WORLD.width - window.innerWidth / camera.zoom));
    camera.y = Math.max(0, Math.min(camera.y, WORLD.height - window.innerHeight / camera.zoom));

    if (me.role === 'mouse' && Math.hypot(me.x - gameState.cheese.x, me.y - gameState.cheese.y) < 35) {
        requestScore(me.id);
    }

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
    
    if (!gameState.isStarted) {
        requestAnimationFrame(draw);
        return;
    }

    ctx.save();
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    // Bakgrunn
    ctx.fillStyle = "#555";
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);

    // Objekter
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
    el.innerHTML = sorted.map(p => `<div>${p.name}: ${p.score}</div>`).join('');
}

function placeTrap() {
    const me = gameState.players[gameState.myId];
    if (me && me.role === 'cat' && me.frozen <= 0) {
        broadcastTrap({ x: me.x, y: me.y });
    }
}

draw();
setInterval(update, 1000/60);
