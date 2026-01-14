const ROOM_PREFIX = "MUSE-";
let peer = null, connections = [], hostConn = null, isHost = false;

function initHost() {
    isHost = true;
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    peer = new Peer(ROOM_PREFIX + code);
    peer.on('open', (id) => {
        document.getElementById('my-code').innerText = code;
        document.getElementById('start-btn').classList.remove('hidden');
        setupLocalPlayer(id, document.getElementById('host-name').value || "Host");
    });
    peer.on('connection', (conn) => {
        connections.push(conn);
        conn.on('data', (data) => handleIncomingData(data, conn));
    });
}

function joinGame() {
    isHost = false;
    const code = document.getElementById('join-code').value;
    const name = document.getElementById('player-name').value || "Spiller";
    peer = new Peer();
    peer.on('open', (id) => {
        setupLocalPlayer(id, name);
        hostConn = peer.connect(ROOM_PREFIX + code);
        hostConn.on('open', () => {
            hostConn.send({ type: 'JOIN', name, color: gameState.players[id].color });
            showScreen('game-ui');
        });
        hostConn.on('data', (data) => handleIncomingData(data, hostConn));
    });
}

function handleIncomingData(data, sender) {
    switch (data.type) {
        case 'JOIN':
            gameState.players[sender.peer] = { id: sender.peer, name: data.name, x: 400, y: 300, vx: 0, vy: 0, score: 0, role: 'mouse', frozen: 0 };
            break;
        case 'START_CONTROL':
            gameState.seed = data.seed; gameState.scoreGoal = data.scoreGoal;
            gameState.players = data.players; gameState.isStarted = true;
            initArena(data.seed); showScreen('game-ui');
            break;
        case 'POS_UPDATE':
            if (gameState.players[data.id]) Object.assign(gameState.players[data.id], data);
            break;
        case 'SCORE_UPDATE':
            gameState.players[data.id].score = data.score; gameState.cheese = data.cheese;
            checkWinCondition();
            break;
        case 'TAG_EVENT':
            if (data.targetId === gameState.myId) {
                const me = gameState.players[gameState.myId];
                me.frozen = 5; me.x = Math.random() * WORLD.width; me.y = Math.random() * WORLD.height;
            }
            break;
        case 'ROLE_SWAP':
            Object.keys(gameState.players).forEach(id => gameState.players[id].role = (id === data.catId) ? 'cat' : 'mouse');
            break;
    }
}

function syncPosition(me) {
    const data = { type: 'POS_UPDATE', id: me.id, x: me.x, y: me.y, vx: me.vx, vy: me.vy, role: me.role, frozen: me.frozen, frameX: me.frameX };
    if (isHost) connections.forEach(c => c.send(data)); else if (hostConn) hostConn.send(data);
}

function sendTagEvent(targetId) {
    broadcast({ type: 'TAG_EVENT', targetId });
    if (isHost) {
        gameState.players[gameState.myId].score++;
        broadcastScore(gameState.myId, gameState.players[gameState.myId].score, gameState.cheese);
    }
}

function broadcastScore(id, score, cheese) { broadcast({ type: 'SCORE_UPDATE', id, score, cheese }); }
function broadcast(data) { if (isHost) connections.forEach(c => c.send(data)); else if (hostConn) hostConn.send(data); }

function startGame() {
    const seed = Math.floor(Math.random() * 9999);
    const ids = Object.keys(gameState.players);
    const catId = ids[Math.floor(Math.random() * ids.length)];
    ids.forEach(id => gameState.players[id].role = (id === catId) ? 'cat' : 'mouse');
    const msg = { type: 'START_CONTROL', seed, scoreGoal: 10, players: gameState.players };
    broadcast(msg); handleIncomingData(msg);
}

function setupLocalPlayer(id, name) {
    gameState.myId = id;
    gameState.players[id] = { id, name, x: 400, y: 300, vx: 0, vy: 0, score: 0, role: 'mouse', frozen: 0 };
}

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}

function checkWinCondition() {
    const winner = Object.values(gameState.players).find(p => p.score >= gameState.scoreGoal);
    if (winner && gameState.isStarted) {
        gameState.isStarted = false;
        showWinnerScreen(gameState.players);
    }
}

function showWinnerScreen(players) {
    const sorted = Object.values(players).sort((a,b) => b.score - a.score);
    const ui = document.getElementById('game-ui');
    const div = document.createElement('div');
    div.className = 'screen'; div.style.position = 'absolute'; div.style.zIndex = '100';
    div.innerHTML = `<h1 class="game-title">FERDIG!</h1><div class="podium-container">
        <div class="podium-step podium-2">2. ${sorted[1]?.name || '-'}</div>
        <div class="podium-step podium-1">1. ${sorted[0]?.name || '-'}</div>
        <div class="podium-step podium-3">3. ${sorted[2]?.name || '-'}</div>
    </div><button onclick="location.reload()" class="primary-btn">MENY</button>`;
    ui.appendChild(div);
    confetti({ particleCount: 200, spread: 70, origin: { y: 0.6 } });
}
