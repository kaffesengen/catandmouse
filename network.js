const ROOM_PREFIX = "MUSE-";
let peer = null, connections = [], hostConn = null, isHost = false;

function initHost() {
    isHost = true;
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    peer = new Peer(ROOM_PREFIX + code);
    peer.on('open', id => {
        document.getElementById('my-code').innerText = code;
        document.getElementById('start-btn').classList.remove('hidden');
        setupLocalPlayer(id, document.getElementById('host-name').value || "Vert");
    });
    peer.on('connection', conn => {
        connections.push(conn);
        conn.on('data', data => handleIncomingData(data, conn));
    });
}

function joinGame() {
    isHost = false;
    const code = document.getElementById('join-code').value;
    const name = document.getElementById('player-name').value || "Spiller";
    peer = new Peer();
    peer.on('open', id => {
        setupLocalPlayer(id, name);
        hostConn = peer.connect(ROOM_PREFIX + code);
        hostConn.on('open', () => {
            hostConn.send({ type: 'JOIN', name });
            showScreen('game-ui');
        });
        hostConn.on('data', data => handleIncomingData(data, hostConn));
    });
}

function handleIncomingData(data, sender) {
    switch(data.type) {
        case 'JOIN':
            gameState.players[sender.peer] = { id: sender.peer, name: data.name, x: 500, y: 500, score: 0, role: 'mouse', frozen: 0 };
            break;
        case 'START_CONTROL':
            gameState.players = data.players; gameState.isStarted = true;
            initArena(data.seed); showScreen('game-ui');
            break;
        case 'POS_UPDATE':
            if(gameState.players[data.id]) Object.assign(gameState.players[data.id], data);
            break;
        case 'TAG_EVENT':
            if(data.targetId === gameState.myId) {
                const me = gameState.players[gameState.myId];
                me.frozen = 5; // Fryser i 5 sekunder
                setTimeout(() => { // Spawner på nytt
                    me.x = Math.random() * WORLD.width;
                    me.y = Math.random() * WORLD.height;
                }, 5000);
            }
            break;
    }
}

function syncPosition(me) {
    const data = { type: 'POS_UPDATE', id: me.id, x: me.x, y: me.y, vx: me.vx, vy: me.vy, role: me.role, frozen: me.frozen, frameX: me.frameX, facing: me.facing };
    if(isHost) connections.forEach(c => c.send(data)); else if(hostConn) hostConn.send(data);
}

function sendTagEvent(targetId) {
    const msg = { type: 'TAG_EVENT', targetId };
    if(isHost) connections.forEach(c => c.send(msg)); else hostConn.send(msg);
    if(isHost) { gameState.players[gameState.myId].score++; }
}

function startGame() {
    const ids = Object.keys(gameState.players);
    const catId = ids[Math.floor(Math.random() * ids.length)];
    ids.forEach(id => gameState.players[id].role = (id === catId ? 'cat' : 'mouse'));
    const msg = { type: 'START_CONTROL', seed: Math.random(), players: gameState.players };
    if(isHost) connections.forEach(c => c.send(msg));
    handleIncomingData(msg);
}

function setupLocalPlayer(id, name) {
    gameState.myId = id;
    gameState.players[id] = { id, name, x: 1000, y: 1000, vx: 0, vy: 0, score: 0, role: 'mouse', frozen: 0, facing: 1 };
}

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}

window.onkeydown = e => {
    if(e.code === 'Space' && gameState.isStarted) {
        const me = gameState.players[gameState.myId];
        if(me && me.role === 'cat') {
            const trap = { x: me.x, y: me.y };
            gameState.traps.push(trap); // Legg til lokalt og send til alle
        }
    }
};
