const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const WORLD = { width: 3000, height: 2500 };
let camera = { x: 0, y: 0, zoom: 1.5 }; // Zoomer inn litt mer

const DIM = { cat: 48, mouse: 32, cheese: 24, trap: 32, wall: 32 };
const mouseSettings = { acc: 0.9, topSpeed: 6, friction: 0.85 };
const catSettings = { acc: 0.25, topSpeed: 9, friction: 0.96 };

const sprites = { cat: new Image(), mouse: new Image(), cheese: new Image(), trap: new Image(), wall: new Image(), box: new Image() };
sprites.cat.src = 'assets/cat.png'; sprites.mouse.src = 'assets/mouse.png'; sprites.cheese.src = 'assets/cheese.png';
sprites.trap.src = 'assets/trap.png'; sprites.wall.src = 'assets/wall.png'; sprites.box.src = 'assets/box.png';

let gameState = { isStarted: false, myId: null, players: {}, obstacles: [], cheese: {x:0,y:0}, traps: [], roleTimer: 120 };
const keys = {};

// Event listeners for mobilknapper
const mobileKeys = { up: false, down: false, left: false, right: false };
const setupBtn = (id, key) => {
    const btn = document.getElementById(id);
    if(!btn) return;
    btn.onmousedown = btn.ontouchstart = () => { mobileKeys[key] = true; };
    btn.onmouseup = btn.ontouchend = () => { mobileKeys[key] = false; };
};
setupBtn('btn-up', 'up'); setupBtn('btn-down', 'down'); setupBtn('btn-left', 'left'); setupBtn('btn-right', 'right');
document.getElementById('btn-trap').onclick = () => { window.dispatchEvent(new KeyboardEvent('keydown', {code: 'Space'})); };

window.onkeydown = e => keys[e.key.toLowerCase()] = true;
window.onkeyup = e => keys[e.key.toLowerCase()] = false;

function seededRandom(s) { return (Math.sin(s) * 10000) % 1; }

function initArena(seed) {
    gameState.obstacles = [];
    let s = seed;
    // Boks-spredning
    for(let i=0; i<30; i++) {
        gameState.obstacles.push({ x: seededRandom(s++)*WORLD.width, y: seededRandom(s++)*WORLD.height, w: 32, h: 32, type: 'box' });
    }
    // Vegg-generering (linjer)
    for(let i=0; i<20; i++) {
        let x = Math.floor(seededRandom(s++)*WORLD.width/32)*32;
        let y = Math.floor(seededRandom(s++)*WORLD.height/32)*32;
        let isVert = seededRandom(s++) > 0.5;
        let len = 4 + Math.floor(seededRandom(s++)*6);
        for(let j=0; j<len; j++) {
            gameState.obstacles.push({ x: x + (isVert?0:j*32), y: y + (isVert?j*32:0), w: 32, h: 32, type: 'wall' });
        }
    }
    gameState.cheese = { x: WORLD.width/2, y: WORLD.height/2 };
}

function update() {
    if (!gameState.isStarted || !gameState.myId) return;
    const me = gameState.players[gameState.myId];
    if (!me) return;

    if (me.frozen > 0) { me.frozen -= 1/60; me.vx = 0; me.vy = 0; syncPosition(me); return; }

    const settings = me.role === 'cat' ? catSettings : mouseSettings;
    let oldX = me.x, oldY = me.y;

    if (keys['w'] || keys['arrowup'] || mobileKeys.up) me.vy -= settings.acc;
    if (keys['s'] || keys['arrowdown'] || mobileKeys.down) me.vy += settings.acc;
    if (keys['a'] || keys['arrowleft'] || mobileKeys.left) me.vx -= settings.acc;
    if (keys['d'] || keys['arrowright'] || mobileKeys.right) me.vx += settings.acc;

    me.vx *= settings.friction; me.vy *= settings.friction;
    me.x += me.vx; me.y += me.vy;

    // Kollisjon
    me.x = Math.max(0, Math.min(me.x, WORLD.width));
    me.y = Math.max(0, Math.min(me.y, WORLD.height));
    gameState.obstacles.forEach(obs => {
        if (me.x + 12 > obs.x && me.x - 12 < obs.x + obs.w && me.y + 12 > obs.y && me.y - 12 < obs.y + obs.h) {
            me.x = oldX; me.y = oldY;
        }
    });

    // Kamera
    camera.x = me.x - (window.innerWidth / camera.zoom) / 2;
    camera.y = me.y - (window.innerHeight / camera.zoom) / 2;

    // Animasjon og retning
    if (Math.abs(me.vx) > 0.1) me.facing = Math.sign(me.vx);
    if (Math.abs(me.vx) > 0.1 || Math.abs(me.vy) > 0.1) {
        me.gameFrame = (me.gameFrame || 0) + 1;
        me.frameX = Math.floor(me.gameFrame / 7) % 4;
    }

    // Jakt
    if (me.role === 'cat') {
        Object.values(gameState.players).forEach(p => {
            if (p.role === 'mouse' && p.frozen <= 0 && Math.hypot(me.x - p.x, me.y - p.y) < 45) {
                sendTagEvent(p.id);
            }
        });
    }

    syncPosition(me);
}

function draw() {
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    gameState.obstacles.forEach(obs => {
        ctx.drawImage(obs.type === 'wall' ? sprites.wall : sprites.box, obs.x, obs.y, 32, 32);
    });

    gameState.traps.forEach(t => ctx.drawImage(sprites.trap, t.x - 16, t.y - 16, 32, 32));
    ctx.drawImage(sprites.cheese, gameState.cheese.x - 12, gameState.cheese.y - 12, 24, 24);

    Object.values(gameState.players).forEach(p => {
        ctx.save();
        ctx.translate(p.x, p.y);
        // Fikset retning: Katten og musen ser der de går
        if (p.facing === -1) ctx.scale(-1, 1);
        
        if (p.role === 'cat') {
            ctx.drawImage(sprites.cat, (p.frameX || 0) * 48, 0, 48, 48, -24, -24, 48, 48);
        } else {
            ctx.drawImage(sprites.mouse, -16, -16, 32, 32);
        }
        ctx.restore();

        // Navn over spiller (tegnes utenfor skaleringen så den ikke speilvendes)
        ctx.fillStyle = p.frozen > 0 ? "cyan" : "white";
        ctx.font = "bold 10px Arial"; ctx.textAlign = "center";
        ctx.fillText(p.frozen > 0 ? `❄️ ${Math.ceil(p.frozen)}` : p.name, p.x, p.y - 30);
    });

    ctx.restore();
    requestAnimationFrame(draw);
}

setInterval(update, 1000/60);
draw();
