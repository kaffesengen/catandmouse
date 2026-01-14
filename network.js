// --- 1. INITIALISERING ---
let peer = null;
let conn = null; // For klienter: koblingen til host
let connections = []; // For host: liste over alle tilkoblede spillere
let isHost = false;

const ROOM_PREFIX = "MUSE-"; // Gjør koden mer unik på PeerJS-serveren

// --- 2. HOST-LOGIKK ---
function initHost() {
    isHost = true;
    const shortCode = Math.floor(1000 + Math.random() * 9000).toString();
    const peerId = ROOM_PREFIX + shortCode;

    peer = new Peer(peerId);

    peer.on('open', (id) => {
        document.getElementById('my-code').innerText = shortCode;
        document.getElementById('start-btn').classList.remove('hidden');
        console.log("Hosting med ID: " + id);
        
        // Legg til verten selv som spiller
        const myName = document.getElementById('host-name').value || "Host";
        setupLocalPlayer(peerId, myName);
    });

    peer.on('connection', (connection) => {
        connections.push(connection);
        setupConnection(connection);
    });
}

// --- 3. JOIN-LOGIKK ---
function joinGame() {
    isHost = false;
    const code = document.getElementById('join-code').value;
    const peerId = ROOM_PREFIX + code;
    const myName = document.getElementById('player-name').value || "Spiller";

    peer = new Peer(); // Klienten får en tilfeldig ID

    peer.on('open', (id) => {
        setupLocalPlayer(id, myName);
        conn = peer.connect(peerId);
        setupConnection(conn);
    });
}

// --- 4. KOMMUNIKASJON ---
function setupConnection(connection) {
    connection.on('open', () => {
        console.log("Koblet til!");
        if (!isHost) {
            // Send info om meg selv til hosten
            const me = gameState.players[gameState.myId];
            connection.send({ type: 'JOIN', name: me.name, color: me.color });
            showScreen('game-ui');
        }
    });

    connection.on('data', (data) => {
        handleMessage(data, connection);
    });
}

function handleMessage(data, senderConn) {
    switch (data.type) {
        case 'JOIN':
            // Host mottar ny spiller
            const newId = senderConn.peer;
            gameState.players[newId] = {
                id: newId,
                name: data.name,
                color: data.color || `hsl(${Math.random() * 360}, 70%, 50%)`,
                x: 100, y: 100, vx: 0, vy: 0,
                score: 0, role: 'mouse', frozen: 0
            };
            broadcastGameState(); // Fortell alle om den nye spilleren
            break;

        case 'START_CONTROL':
            // Alle mottar start-signal fra host
            gameState.seed = data.seed;
            gameState.scoreGoal = data.scoreGoal;
            gameState.isStarted = true;
            initArena(data.seed);
            gameState.players = data.players; // Synkroniser alle spillere
            showScreen('game-ui');
            break;

        case 'POS_UPDATE':
            // Oppdater posisjon til en annen spiller
            if (gameState.players[data.id]) {
                gameState.players[data.id].x = data.x;
                gameState.players[data.id].y = data.y;
                gameState.players[data.id].role = data.role;
                gameState.players[data.id].frozen = data.frozen;
            }
            break;

        case 'SCORE_EVENT':
            // Noen tok ost eller ble tatt
            gameState.players[data.id].score = data.score;
            if (data.newCheese) gameState.cheese = data.newCheese;
            checkWinCondition();
            break;
    }
}

// --- 5. HJELPEFUNKSJONER ---

function setupLocalPlayer(id, name) {
    gameState.myId = id;
    gameState.players[id] = {
        id: id,
        name: name,
        color: `hsl(${Math.random() * 360}, 70%, 50%)`,
        x: 400, y: 300, vx: 0, vy: 0,
        score: 0, role: 'mouse', frozen: 0
    };
}

// Send min posisjon til de andre
function syncPosition(me) {
    const data = {
        type: 'POS_UPDATE',
        id: me.id,
        x: me.x,
        y: me.y,
        role: me.role,
        frozen: me.frozen
    };

    if (isHost) {
        connections.forEach(c => c.send(data));
    } else if (conn) {
        conn.send(data);
    }
}

// Host starter spillet
function startGame() {
    const seed = document.getElementById('seed').value || Math.floor(Math.random() * 9999);
    const goal = document.getElementById('goal-score').value || 10;
    
    // Velg en tilfeldig katt
    const playerIds = Object.keys(gameState.players);
    const randomCatId = playerIds[Math.floor(Math.random() * playerIds.length)];
    
    playerIds.forEach(id => {
        gameState.players[id].role = (id === randomCatId) ? 'cat' : 'mouse';
    });

    const startMsg = {
        type: 'START_CONTROL',
        seed: parseInt(seed),
        scoreGoal: parseInt(goal),
        players: gameState.players
    };

    connections.forEach(c => c.send(startMsg));
    handleMessage(startMsg); // Start lokalt også
}

function broadcastGameState() {
    if (!isHost) return;
    // Her kan hosten sende ut hele gameState om nødvendig
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById('game-ui').classList.add('hidden');
    document.getElementById(screenId).classList.remove('hidden');
}

// Sjekk om noen har vunnet (Kahoot-stil)
function checkWinCondition() {
    const winner = Object.values(gameState.players).find(p => p.score >= gameState.scoreGoal);
    if (winner) {
        gameState.isStarted = false;
        alert("VI HAR EN VINNER: " + winner.name + "!");
        // Her kan du legge til en finere UI-animasjon senere
    }
}
