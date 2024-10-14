const elements = {
    gameArea: document.getElementById('gameArea'),
    pitch: document.getElementById('pitch'),
    camera: document.getElementById('camera'),
    inputMessage: document.getElementById('inputMessage'),
    ping: document.getElementById('ping'),
    chat: document.getElementById('chatMessages'),
    score: document.getElementById('score'),
    goalOverlay: document.getElementById('goalOverlay'),
    goal: document.getElementById('goal'),
    author: document.getElementById('author'),
    fullscreenButton: document.getElementById('fullscreen'),
    kickButton: document.getElementById('kick'),
    joyStick: document.getElementById('joy')
};
const setup = JSON.parse(sessionStorage.getItem("setupData"));
const socket = io(setup.serverAddress);
let socketId = null;
let cameraX = 0, cameraY = 0;
let screen = { width: window.innerWidth, height: window.innerHeight };
let players = {}, ball = {}, score = {};
let keysPressed = {}, kickPressed = false;
let stickAngle = null; 
let currentAngle = null;
let teamColors = null;

if (setup.mobileControls) {
    const controller = setup.mobileControls;
    
    new JoyStick('joy', {}, function (stickData) {
        if (Math.abs(stickData.x) > 5 || Math.abs(stickData.y) > 5) { 
            stickAngle = Math.atan2(-stickData.y, stickData.x);
        } else {
            stickAngle = null;
        }
    });
    
    const joy = elements.joyStick;
    joy.style.opacity = `${controller.opacity}%`;
    joy.style.left = `${controller.margin}px`;
    joy.style.bottom = `${controller.margin}px`;
    
    const kick = elements.kickButton;
    kick.style.opacity = `${controller.opacity}%`;
    kick.style.right = `${parseFloat(controller.margin) + 15}px`;
    kick.style.bottom = `${parseFloat(controller.margin) + 15}px`;
    kick.style.display = 'flex';
    
    kick.addEventListener('touchstart', () => kickBall(true));
    kick.addEventListener('touchend', () => kickBall(false));
}

elements.fullscreenButton.addEventListener('click', () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
});

setInterval(() => {
    const start = Date.now();

    socket.emit("ping", () => {
        const duration = Date.now() - start;
        elements.ping.textContent = `${duration > 999 ? 999 : duration}ms`;
    });
}, 1000);

socket.on('connect', () => {
    socket.emit('playerData', JSON.parse(sessionStorage.getItem("playerData")));
    socketId = socket.id;
    
    movePlayer();
});

socket.on('update', (data) => {
    players = data.players;
    ball = data.ball;
    score = data.score;

    drawGame();
});

socket.on('colors', (data) => {
    teamColors = data;
    
    Object.entries(teamColors).forEach(([team, color]) => {
        document.getElementById(`${team}Colors`).style.background = `linear-gradient(to right, ${color[0]} 50%, ${color[1]} 50%)`;
    });
});

socket.on('chat', (data) => {
    const { entity, content } = data;
    const message = document.createElement('p');
    
    const nickname = document.createElement('span');
    nickname.textContent = entity.nickname;
    nickname.style.color = entity.color;
    nickname.style.fontWeight = 600;

    if (content.type === 'connection') {
        message.style.color = 'yellow';
        message.appendChild(nickname);
        message.appendChild(document.createTextNode(`${content.connected ? ' has joined' : ' has left' }`));
    } else if (content.type === 'message') {
        message.appendChild(nickname);
        message.appendChild(document.createTextNode(' ' + content.body.text));
    }

    elements.chat.appendChild(message);
    elements.chat.scrollTop = elements.chat.scrollHeight;
});

socket.on('goal', (data) => {
    const { team, author: goalAuthor } = data;
    
    elements.goal.style.color = teamColors[team][0];
    elements.goal.style.textShadow = `3px 3px 0px ${teamColors[team][1]}, 5px 5px 5px #000000`;
    elements.goalOverlay.style.display = 'flex';

    elements.author.textContent = `${goalAuthor.nickname} ${team === goalAuthor.team ? '' : '(o.g.)' }`;
    elements.author.style.color = teamColors[team][1];
    elements.author.style.backgroundColor = teamColors[team][0];
    
    setTimeout(() => {
        elements.goalOverlay.style.display = 'none';
    }, 1000);
});

function sendMessage() {
    const messageText = elements.inputMessage.value.trim();
    if (messageText !== "") {
        socket.emit('chat', { type: 'message', body: { text: messageText }});
        elements.inputMessage.value = '';
    }

    elements.inputMessage.blur();
}

function drawGame() {
    elements.score.textContent = `${score.home}:${score.away}`;
    
    updatePlayerElements();
    updateBallElement();

    if (socketId in players) {
        updateCamera(players[socketId], ball);
    }
}

function updatePlayerElements() {
    const fragment = document.createDocumentFragment();
    const existingPlayerIds = new Set();

    for (const id in players) {
        const player = players[id];
        existingPlayerIds.add(id);

        if (!player.team) continue;

        let playerDiv = document.getElementById(`player-${id}`);

        if (!playerDiv) {
            playerDiv = document.createElement('div');
            playerDiv.className = 'player';
            playerDiv.id = `player-${id}`;
            playerDiv.style.backgroundColor = player.color;

            const nickname = document.createElement('p');
            nickname.className = 'nickname';
            nickname.textContent = player.nickname;
            nickname.style.color = teamColors[player.team][1];
            nickname.style.backgroundColor = teamColors[player.team][0];

            playerDiv.appendChild(nickname);
            fragment.appendChild(playerDiv);
        }

        playerDiv.style.left = `${player.x - player.radius}px`;
        playerDiv.style.top = `${player.y - player.radius}px`;
    }

    elements.pitch.appendChild(fragment);

    const playerDivs = document.querySelectorAll('[id^="player-"]');
    playerDivs.forEach(playerDiv => {
        const id = playerDiv.id.replace('player-', '');
        if (!existingPlayerIds.has(id)) {
            playerDiv.remove();
        }
    });
}

function updateBallElement() {
    let ballDiv = document.getElementById('ball');

    if (!ballDiv) {
        ballDiv = document.createElement('div');
        ballDiv.className = 'ball';
        ballDiv.id = 'ball';
        elements.pitch.appendChild(ballDiv);
    }

    ballDiv.style.transform = `rotate(${ball.angle}rad)`;
    ballDiv.style.left = `${ball.x - ball.radius}px`;
    ballDiv.style.top = `${ball.y - ball.radius}px`;
}

function updateCamera(player, ball) {
    let targetX, targetY;
    
    if (player.team) {
        const { x: playerX, y: playerY } = player;
        const distanceX = Math.abs(playerX - ball.x);
        const distanceY = Math.abs(playerY - ball.y);

        if (distanceX > screen.width || distanceY > screen.height) {
            targetX = playerX - elements.camera.clientWidth / 2;
            targetY = playerY - elements.camera.clientHeight / 2;
        } else {
            const midX = (playerX + ball.x) / 2;
            const midY = (playerY + ball.y) / 2;
    
            targetX = midX - elements.camera.clientWidth / 2;
            targetY = midY - elements.camera.clientHeight / 2;
        }
    } else {
        targetX = ball.x - elements.camera.clientWidth / 2;
        targetY = ball.y - elements.camera.clientHeight / 2;
    }

    cameraX = lerp(cameraX, targetX, 0.1);
    cameraY = lerp(cameraY, targetY, 0.1);

    const maxX = elements.gameArea.clientWidth - elements.camera.clientWidth;
    const maxY = elements.gameArea.clientHeight - elements.camera.clientHeight;

    elements.gameArea.style.left = `-${Math.max(0, Math.min(cameraX, maxX))}px`;
    elements.gameArea.style.top = `-${Math.max(0, Math.min(cameraY, maxY))}px`;
}

function lerp(start, end, t) {
    return start + (end - start) * t;
}

document.addEventListener('keydown', function(event) {
    if (elements.inputMessage === document.activeElement) return;

    if (event.key === ' ') {
        kickBall(true);
    } else {
        keysPressed[event.key.toLowerCase()] = true;
    }
});

document.addEventListener('keyup', function(event) {
    if (event.key.toLowerCase() === 't') { 
        keysPressed = {};
        elements.inputMessage.focus();
        return;
    }
    
    if (event.key === 'Enter' && elements.inputMessage === document.activeElement) {
        sendMessage();
        return;
    }

    if (elements.inputMessage === document.activeElement) return;

    if (event.key === ' ') {
        kickBall(false);
    } else {
        delete keysPressed[event.key.toLowerCase()];
    }
});

function kickBall(state) {
    const player = document.getElementById(`player-${socketId}`);
    
    if (state) {
        kickPressed = true;
        player.classList.add('player-active');
    } else {
        kickPressed = false;
        player.classList.remove('player-active');
    }
}

function movePlayer() {
    const angle = calculateAngle();

    if (angle !== currentAngle) {
        currentAngle = angle;
        socket.emit('move', currentAngle);
    }

    if (kickPressed) {
        const player = players[socketId];
        const detectionRange = player.radius + ball.radius + player.range;

        if (distanceBetween(player.x, player.y, ball.x, ball.y) <= detectionRange) {
            socket.emit('kick');
            kickPressed = false;
        }
    }

    setTimeout(movePlayer, 1000 / 30);
}

function distanceBetween(x1, y1, x2, y2) {
    const dx = x1 - x2;
    const dy = y1 - y2;
    return Math.sqrt(dx * dx + dy * dy);
}

function calculateAngle() {
    if (setup.mobileControls && stickAngle !== null) return stickAngle;
    
    if (keysPressed['w'] && keysPressed['a']) return 5 * Math.PI / 4;
    if (keysPressed['w'] && keysPressed['d']) return -Math.PI / 4;
    if (keysPressed['s'] && keysPressed['a']) return 3 * Math.PI / 4;
    if (keysPressed['s'] && keysPressed['d']) return Math.PI / 4;

    if (keysPressed['w']) return -Math.PI / 2;
    if (keysPressed['a']) return Math.PI;
    if (keysPressed['s']) return Math.PI / 2;
    if (keysPressed['d']) return 0;

    return null;
}
