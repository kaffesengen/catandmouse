// --- 1. INITIALISERING OG PEER-OPPSETT ---
const ROOM_PREFIX = "MUSE-"; // Gjør koden mer unik
let peer = null;
let connections = []; // For Host: Alle tilkoblede klienter
let hostConn = null;  // For Joiner: Koblingen til host
let isHost = false;

// --- 2. HOST-LOGIKK (Serveren) ---
function initHost() {
    isHost = true;
    const shortCode = Math.floor(1000 + Math.random() * 9000).toString();
    const peerId = ROOM_PREFIX + shortCode;

    peer = new Peer(peerId);

    peer.on('open', (id) => {
        document.getElementById('my-code').innerText = shortCode;
        document.getElementById('start-btn').classList.remove('hidden');
        setupLocalPlayer(id, document.getElementById('host-name').value || "Host");
    });

    peer.on('connection', (conn) => {
        connections.push(conn);
        conn.on('open', () => {
            console.log("Ny spiller koblet til!");
        });
        conn.on('data', (data) => handleIncomingData(data, conn));
    });
}

// --- 3. JOIN-LOGIKK (Klienten) ---
function joinGame() {
    isHost = false;
    const code = document.getElementById('join-code').value;
    const peerId = ROOM_PREFIX + code;
    const name = document.getElementById('player-name').value || "Spiller";

    peer = new Peer(); // Får tilfeldig ID

    peer.on('open', (myId) => {
        setupLocalPlayer(myId, name);
        hostConn = peer.connect(peerId);
        
        hostConn.on('open', () => {
            hostConn.send({ 
                type: 'JOIN', 
                name: name, 
                color: gameState.players[myId].color 
            });
            showScreen('game-ui');
        });

        hostConn.on('data', (data) => handleIncomingData(data, hostConn));
    });
}

// --- 4. DATAHÅNDTERING ---
function handleIncomingData(data, sender) {
    switch (data.type) {
        case 'JOIN':
            // Host mottar info om ny spiller
            gameState.players[sender.peer] = {
                id: sender.peer, name: data.name, color: data.color,
                x: 100, y: 100, vx: 0, vy: 0, score: 0, role: 'mouse', frozen: 0
            };
            break;

        case 'START_CONTROL':
            // Alle mottar start-signal fra host
            gameState.seed = data.seed;
            gameState.scoreGoal = data.scoreGoal;
            gameState.players = data.players;
            gameState.isStarted = true;
            initArena(data.seed);
            showScreen('game-ui');
            break;

        case 'POS_UPDATE':
            // Oppdater andre spilleres posisjon
            if (gameState.players[data.id]) {
                const p = gameState.players[data.id];
                p.x = data.x; p.y = data.y;
                p.vx = data.vx; p.vy = data.vy;
                p.role = data.role; p.frozen = data.frozen;
                p.frameX = data.frameX;
            }
            break;

        case 'SCORE_UPDATE':
            // Synkroniser poeng og osteposisjon
            gameState.players[data.id].score = data.score;
            gameState.cheese = data.cheese;
            checkWinCondition();
            break;

        case 'TAG_EVENT':
            // En mus ble tatt
            if (data.targetId === gameState.myId) {
                gameState.players[gameState.myId].frozen = 5;
                gameState.players[gameState.myId].x = Math.random() * 800;
                gameState.players[gameState.myId].y = Math.random() * 600;
            }
            break;

        case 'TRAP_PLACE':
            gameState.traps.push(data.trap);
            break;
            
        case 'ROLE_SWAP':
            // Host tvinger frem ny katt
            Object.keys(gameState.players).forEach(id => {
                gameState.players[id].role = (id === data.catId) ? 'cat' : 'mouse';
            });
            break;
    }
}

// --- 5. SPILL-LOGIKK KOMMUNIKASJON ---

// Sender din posisjon til andre
function syncPosition(me) {
    const data = {
        type: 'POS_UPDATE', id: me.id, x: me.x, y: me.y, 
        vx: me.vx, vy: me.vy, role: me.role, 
        frozen: me.frozen, frameX: me.frameX
    };
    broadcast(data);
    
    // Host sjekker kollisjon mellom katt og mus
    if (isHost && me.role === 'cat') {
        Object.values(gameState.players).forEach(p => {
            if (p.role === 'mouse' && p.frozen <= 0) {
                const dist = Math.hypot(me.x - p.x, me.y - p.y);
                if (dist < 30) {
                    me.score++;
                    broadcast({ type: 'TAG_EVENT', targetId: p.id });
                    broadcast({ type: 'SCORE_UPDATE', id: me.id, score: me.score, cheese: gameState.cheese });
                }
            }
        });
    }
}

// Host sender ut oppdaterte poeng
function broadcastScore(playerId, newScore, newCheese) {
    broadcast({ type: 'SCORE_UPDATE', id: playerId, score: newScore, cheese: newCheese });
}

// Funksjon for å sende til alle
function broadcast(data) {
    if (isHost) {
        connections.forEach(c => c.send(data));
    } else if (hostConn) {
        hostConn.send(data);
    }
}

// Startknappen hos verten
function startGame() {
    const seed = parseInt(document.getElementById('seed').value) || Math.floor(Math.random() * 9999);
    const goal = parseInt(document.getElementById('goal-score').value) || 10;
    
    // Velg tilfeldig katt ved start
    const ids = Object.keys(gameState.players);
    const catId = ids[Math.floor(Math.random() * ids.length)];
    
    ids.forEach(id => {
        gameState.players[id].role = (id === catId) ? 'cat' : 'mouse';
    });

    const startMsg = {
        type: 'START_CONTROL', seed, scoreGoal: goal, players: gameState.players
    };
    broadcast(startMsg);
    handleIncomingData(startMsg); // Start for host også

    // Start timer for rollebytte (2 min)
    setInterval(() => {
        if (!gameState.isStarted) return;
        const newCatId = ids[Math.floor(Math.random() * ids.length)];
        broadcast({ type: 'ROLE_SWAP', catId: newCatId });
        handleIncomingData({ type: 'ROLE_SWAP', catId: newCatId });
    }, 120000);
}

// --- 6. UTILITY ---
function setupLocalPlayer(id, name) {
    gameState.myId = id;
    gameState.players[id] = {
        id: id, name: name, 
        color: `hsl(${Math.random() * 360}, 70%, 50%)`,
        x: 400, y: 300, vx: 0, vy: 0, score: 0, role: 'mouse', frozen: 0
    };
}

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}

function checkWinCondition() {
    const sorted = Object.values(gameState.players).sort((a,b) => b.score - a.score);
    if (sorted[0].score >= gameState.scoreGoal) {
        gameState.isStarted = false;
        showWinnerScreen(gameState.players);
    }
}

function showWinnerScreen(players) {
    const sorted = Object.values(players).sort((a, b) => b.score - a.score);
    const ui = document.getElementById('game-ui');
    
    // Lag en enkel vinner-overlay
    const overlay = document.createElement('div');
    overlay.className = 'screen';
    overlay.style.position = 'absolute';
    overlay.style.zIndex = '100';
    overlay.innerHTML = `
        <h1 class="game-title">MÅLGANG!</h1>
        <div class="podium-container">
            <div class="podium-step podium-2">2. ${sorted[1]?.name || '-'}</div>
            <div class="podium-step podium-1">1. ${sorted[0]?.name || '-'}</div>
            <div class="podium-step podium-3">3. ${sorted[2]?.name || '-'}</div>
        </div>
        <button onclick="location.reload()" class="primary-btn" style="margin-top:20px">Til hovedmeny</button>
    `;
    ui.appendChild(overlay);

    confetti({ particleCount: 200, spread: 70, origin: { y: 0.6 } });
}

// Lytt etter mellomrom for å legge feller (kun for katt)
window.addEventListener('keydown', e => {
    if (e.code === 'Space' && gameState.isStarted) {
        const me = gameState.players[gameState.myId];
        if (me && me.role === 'cat' && me.frozen <= 0) {
            const trap = { x: me.x, y: me.y };
            broadcast({ type: 'TRAP_PLACE', trap });
            gameState.traps.push(trap);
        }
    }
});
