const ROOM_PREFIX = "MUSE-";
let peer = null, connections = [], hostConn = null, isHost = false;

function initHost() {
    isHost = true;
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    peer = new Peer(ROOM_PREFIX + code);
    peer.on('open', id => {
        document.getElementById('my-code').innerText = code;
        document.getElementById('open-lobby-btn').classList.add('hidden');
        setupLocalPlayer(id, document.getElementById('host-name').value || "Vert");
    });
    peer.on('connection', conn => {
        connections.push(conn);
        conn.on('data', data => handleData(data, conn));
    });
}

function joinGame() {
    const code = document.getElementById('join-code').value;
    const name = document.getElementById('player-name').value || "Gjest";
    peer = new Peer();
    peer.on('open', id => {
        setupLocalPlayer(id, name);
        hostConn = peer.connect(ROOM_PREFIX + code);
        hostConn.on('open', () => {
            hostConn.send({ type: 'LOBBY_JOIN', name });
            document.getElementById('join-lobby-info').classList.remove('hidden');
            document.getElementById('join-conn-btn').classList.add('hidden');
        });
        hostConn.on('data', data => handleData(data, hostConn));
    });
}

function handleData(data, sender) {
    if (isHost && data.type === 'LOBBY_JOIN') {
        gameState.players[sender.peer] = { id: sender.peer, name: data.name, x: 1200, y: 1000, score: 0, role: 'mouse', frozen: 0, facing: 1 };
        updateLobbyUI();
        connections.forEach(c => c.send({ type: 'LOBBY_UPDATE', players: gameState.players }));
    }
    if (data.type === 'LOBBY_UPDATE') {
        gameState.players = data.players;
        updateLobbyUI();
    }
    if (data.type === 'START_CONTROL') {
        gameState.players = data.players;
        gameState.isStarted = true;
        initArena(data.seed);
        showScreen('game-ui');
    }
    if (data.type === 'POS_UPDATE' && data.id !== gameState.myId) {
        if (gameState.players[data.id]) Object.assign(gameState.players[data.id], data);
    }
    if (data.type === 'TAG_EVENT') {
        if (data.targetId === gameState.myId) {
            gameState.players[gameState.myId].frozen = 5;
            gameState.players[gameState.myId].x = 200 + Math.random() * (WORLD.width - 400);
            gameState.players[gameState.myId].y = 200 + Math.random() * (WORLD.height - 400);
        }
    }
    if (data.type === 'SCORE_UPDATE') {
        if (data.cheese) gameState.cheese = data.cheese;
        if (gameState.players[data.id]) gameState.players[data.id].score = data.score;
        checkWinCondition();
    }
    if (isHost && data.type === 'SCORE_REQUEST') {
        gameState.players[data.id].score++;
        gameState.cheese = { x: 200 + Math.random()*(WORLD.width-400), y: 200 + Math.random()*(WORLD.height-400) };
        broadcast({ type: 'SCORE_UPDATE', id: data.id, score: gameState.players[data.id].score, cheese: gameState.cheese });
    }
    if (data.type === 'TRAP_PLACE') {
        gameState.traps.push(data.trap);
    }
}

function updateLobbyUI() {
    const list = Object.values(gameState.players).map(p => `<div class="player-tag">${p.name}</div>`).join('');
    const container = isHost ? document.getElementById('host-player-list') : document.getElementById('join-player-list');
    if (container) container.innerHTML = list;
    if (isHost && Object.keys(gameState.players).length > 1) document.getElementById('start-btn').classList.remove('hidden');
}

function startGame() {
    const ids = Object.keys(gameState.players);
    const catId = ids[Math.floor(Math.random() * ids.length)];
    const seed = document.getElementById('host-seed').value || "123";
    ids.forEach(id => {
        gameState.players[id].role = (id === catId ? 'cat' : 'mouse');
        gameState.players[id].score = 0;
    });
    const msg = { type: 'START_CONTROL', seed, players: gameState.players };
    connections.forEach(c => c.send(msg));
    handleData(msg);
}

function syncPosition(me) {
    const data = { type: 'POS_UPDATE', id: me.id, x: me.x, y: me.y, vx: me.vx, vy: me.vy, role: me.role, frozen: me.frozen, facing: me.facing, frameX: me.frameX };
    broadcast(data);
}

function processTag(targetId, catId) {
    broadcast({ type: 'TAG_EVENT', targetId });
    gameState.players[catId].score++;
    broadcast({ type: 'SCORE_UPDATE', id: catId, score: gameState.players[catId].score });
}

function requestScore(id) {
    if (isHost) {
        gameState.players[id].score++;
        gameState.cheese = { x: 200 + Math.random()*(WORLD.width-400), y: 200 + Math.random()*(WORLD.height-400) };
        broadcast({ type: 'SCORE_UPDATE', id, score: gameState.players[id].score, cheese: gameState.cheese });
    } else {
        hostConn.send({ type: 'SCORE_REQUEST', id });
    }
}

function broadcastTrap(trap) {
    broadcast({ type: 'TRAP_PLACE', trap });
    gameState.traps.push(trap);
}

function broadcast(data) {
    if (isHost) connections.forEach(c => c.send(data));
    else if (hostConn) hostConn.send(data);
}

function setupLocalPlayer(id, name) {
    gameState.myId = id;
    gameState.players[id] = { id, name, x: 1200, y: 1000, vx: 0, vy: 0, score: 0, role: 'mouse', frozen: 0, facing: 1 };
    updateLobbyUI();
}

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}

function checkWinCondition() {
    const sorted = Object.values(gameState.players).sort((a,b) => b.score - a.score);
    if (sorted[0].score >= gameState.scoreGoal && gameState.isStarted) {
        gameState.isStarted = false;
        confetti({ particleCount: 200, spread: 70, origin: { y: 0.6 } });
        
        document.getElementById('p1').innerText = `1. ${sorted[0].name}`;
        document.getElementById('p2').innerText = `2. ${sorted[1] ? sorted[1].name : '-'}`;
        document.getElementById('p3').innerText = `3. ${sorted[2] ? sorted[2].name : '-'}`;
        showScreen('winner-screen');
    }
}
