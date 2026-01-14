const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const WORLD = { width: 3000, height: 2500 };
let camera = { x: 0, y: 0, zoom: 1.5 };

const DIM = { cat: 64, mouse: 40, cheese: 30, wall: 32 };
const mouseSettings = { acc: 1.0, topSpeed: 7, friction: 0.88 };
const catSettings = { acc: 0.35, topSpeed: 10, friction: 0.95 };

const sprites = { cat: new Image(), mouse: new Image(), cheese: new Image(), trap: new Image(), wall: new Image(), box: new Image() };
sprites.cat.src = 'assets/cat.png'; sprites.mouse.src = 'assets/mouse.png'; sprites.cheese.src = 'assets/cheese.png';
sprites.trap.src = 'assets/trap.png'; sprites.wall.src = 'assets/wall.png'; sprites.box.src = 'assets/box.png';

const sounds = { tag: document.getElementById('snd-tag'), cheese: document.getElementById('snd-cheese') };

let gameState = { isStarted: false, myId: null, players: {}, obstacles: [], cheese: {x:0,y:0}, traps: [], roleTimer: 120 };
const keys = {};
const mobileKeys = { up: false, down: false, left: false, right: false };

// Oppsett for mobilknapper
const setupBtn = (id, key) => {
    const btn = document.getElementById(id);
    btn.ontouchstart = (e) => { e.preventDefault(); mobileKeys[key] = true; };
    btn.ontouchend = (e) => { e.preventDefault(); mobileKeys[key] = false; };
};
setupBtn('btn-up', 'up'); setupBtn('btn-down', 'down'); setupBtn('btn-left', 'left'); setupBtn('btn-right', 'right');

window.onkeydown = e => keys[e.key.toLowerCase()] = true;
window.onkeyup = e => keys[e.key.toLowerCase()] = false;

function initArena(seed) {
    gameState.obstacles = [];
    let s = seed * 12345;
    const rng = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };

    // Generer vegger i rette linjer
    for(let i=0; i<25; i++) {
        let x = Math.floor(rng() * (WORLD.width / 32)) * 32;
        let y = Math.floor(rng() * (WORLD.height / 32)) * 32;
        let isHorizontal = rng() > 0.5;
        let length = 4 + Math.floor(rng() * 10);

        for(let j=0; j<length; j++) {
            let wx = isHorizontal ? x + (j * 32) : x;
            let wy = isHorizontal ? y : y + (j * 32);
            if(wx < WORLD.width - 32 && wy < WORLD.height - 32) {
                gameState.obstacles.push({ x: wx, y: wy, w: 32, h: 32, type: 'wall' });
            }
        }
    }
    // Strøbokser
    for(let i=0; i<45; i++) {
        gameState.obstacles.push({ x: rng()*(WORLD.width-32), y: rng()*(WORLD.height-32), w: 32, h: 32, type: 'box' });
    }
    gameState.cheese = { x: WORLD.width/2, y: WORLD.height/2 };
}

function update() {
    if (!gameState.isStarted || !gameState.myId) return;
    const me = gameState.players[gameState.myId];
    if (!me) return;

    if (me.frozen > 0) {
        me.frozen -= 1/60;
        me.vx = 0; me.vy = 0;
        syncPosition(me);
        return;
    }

    const settings = me.role === 'cat' ? catSettings : mouseSettings;
    let oldX = me.x, oldY = me.y;

    if (keys['w'] || keys['arrowup'] || mobileKeys.up) me.vy -= settings.acc;
    if (keys['s'] || keys['arrowdown'] || mobileKeys.down) me.vy += settings.acc;
    if (keys['a'] || keys['arrowleft'] || mobileKeys.left) me.vx -= settings.acc;
    if (keys['d'] || keys['arrowright'] || mobileKeys.right) me.vx += settings.acc;

    me.vx *= settings.friction; me.vy *= settings.friction;
    me.x += me.vx; me.y += me.vy;

    // Kollisjon med hindre
    gameState.obstacles.forEach(o => {
        if (me.x + 15 > o.x && me.x - 15 < o.x + o.w && me.y + 15 > o.y && me.y - 15 < o.y + o.h) {
            me.x = oldX; me.y = oldY;
        }
    });

    // Retning og animasjon (Fikset: stopper på frame 0)
    if (Math.abs(me.vx) > 0.2) me.facing = me.vx > 0 ? 1 : -1;
    if (Math.abs(me.vx) > 0.2 || Math.abs(me.vy) > 0.2) {
        me.animTimer = (me.animTimer || 0) + 1;
        me.frameX = Math.floor(me.animTimer / 7) % 4; 
    } else {
        me.frameX = 0; // Aldri usynlig når man står stille
    }

    camera.x = me.x - (window.innerWidth / camera.zoom) / 2;
    camera.y = me.y - (window.innerHeight / camera.zoom) / 2;

    if (isHost && me.role === 'cat') {
        Object.values(gameState.players).forEach(p => {
            if (p.role === 'mouse' && p.frozen <= 0 && Math.hypot(me.x - p.x, me.y - p.y) < 45) {
                sendTagEvent(p.id, me.id);
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

    gameState.obstacles.forEach(o => ctx.drawImage(o.type==='wall'?sprites.wall:sprites.box, o.x, o.y, 32, 32));
    ctx.drawImage(sprites.cheese, gameState.cheese.x-15, gameState.cheese.y-15, 30, 30);

    Object.values(gameState.players).forEach(p => {
        ctx.save();
        ctx.translate(p.x, p.y);
        if (p.facing === -1) ctx.scale(-1, 1);
        
        const s = p.role === 'cat' ? 64 : 40;
        if (p.role === 'cat') {
            ctx.drawImage(sprites.cat, (p.frameX || 0) * 48, 0, 48, 48, -s/2, -s/2, s, s);
        } else {
            ctx.drawImage(sprites.mouse, -s/2, -s/2, s, s);
        }
        ctx.restore();
        
        ctx.fillStyle = "white"; ctx.font = "bold 12px Arial"; ctx.textAlign = "center";
        ctx.fillText(p.frozen > 0 ? "❄️ FRYST" : p.name, p.x, p.y - 40);
    });

    ctx.restore();
    requestAnimationFrame(draw);
}
draw();
setInterval(update, 1000/60);
