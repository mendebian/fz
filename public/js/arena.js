const socket = io(sessionStorage.getItem("serverAddress"));
const gameArea = document.getElementById('gameArea');
const pitch = document.getElementById('pitch');
const camera = document.getElementById('camera');
const controller = /Mobi|Android/i.test(navigator.userAgent) ? 'touch' : 'keyboard';
const inputMessage = document.getElementById('inputMessage');

let socketId = null;
let cameraX = 0, cameraY = 0;
let screen = { width: window.innerWidth, height: window.innerHeight };
let players = {}, ball = {}, score = {};
let keysPressed = {}, kickPressed = false;
let stickAngle = null; 
let teamColors = null;

if (controller === 'touch') {
    setupTouchControls();
}

setInterval(() => {
    const start = Date.now();

    socket.emit("ping", () => {
        const duration = Date.now() - start;
        document.getElementById('ping').textContent = `Ping ${duration > 999 ? 999 : duration}`;
    });
}, 1000);

function setupTouchControls() {
    const fullscreen = document.getElementById('fullscreen');
    const kick = document.getElementById('kick');

    fullscreen.style.display = 'flex';
    kick.style.display = 'flex';

    fullscreen.addEventListener('click', function () {
        document.documentElement.webkitRequestFullscreen();
        fullscreen.style.display = 'none';
    });

    new JoyStick('joy', {}, function (stickData) {
        if (Math.abs(stickData.x) > 5 || Math.abs(stickData.y) > 5) { 
            stickAngle = Math.atan2(-stickData.y, stickData.x);
        } else {
            stickAngle = null;
        }
    });

    kick.addEventListener('touchstart', () => kickBall(true));
    kick.addEventListener('touchend', () => kickBall(false));
}

socket.on('connect', () => {
    socket.emit('playerData', JSON.parse(sessionStorage.getItem("playerData")));
    socketId = socket.id;
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
    const entity = data.entity;
    const content = data.content;

    const chat = document.getElementById('chatMessages');
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

    chat.appendChild(message);

    chat.scrollTop = chat.scrollHeight;
});

socket.on('goal', (data) => {
    const goalOverlay = document.getElementById('goalOverlay');
    const goal = document.getElementById('goal');
    const author = document.getElementById('author');
    
    goal.style.color = teamColors[data.team][0];
    goal.style.textShadow = `3px 3px 0px ${teamColors[data.team][1]}, 5px 5px 5px #000000`;
    goalOverlay.style.display = 'flex';

    author.textContent = `${data.author.nickname} ${data.team === data.author.team ? '' : '(o.g.)' }`;
    author.style.color = teamColors[data.team][1];
    author.style.backgroundColor = teamColors[data.team][0];
    
    setTimeout(() => {
        goalOverlay.style.display = 'none';
    }, 1000);
});

function sendMessage() {
    if (inputMessage.value.trim() !== "") {
        socket.emit('chat', { type: 'message', body: { text: inputMessage.value.trim() }});
        inputMessage.value = '';
    }

    inputMessage.blur();
}

function drawGame() {
    document.getElementById('score').textContent = `${score.home}:${score.away}`;
    
    updatePlayerElements();
    updateBallElement();

    if (socketId in players) {
        updateCamera(players[socketId], ball);
    }
}

function updatePlayerElements() {
    for (const id in players) {
        const player = players[id];

        if (player.team) {
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
                pitch.appendChild(playerDiv);
            }
    
            playerDiv.style.left = `${player.x - player.radius}px`;
            playerDiv.style.top = `${player.y - player.radius}px`;
        }
    }

    const playerDivs = document.querySelectorAll('[id^="player-"]');

    playerDivs.forEach(playerDiv => {
        const id = playerDiv.id.replace('player-', '');
        if (!(id in players)) {
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
        pitch.appendChild(ballDiv);
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
            targetX = playerX - camera.clientWidth / 2;
            targetY = playerY - camera.clientHeight / 2;
        } else {
            const midX = (playerX + ball.x) / 2;
            const midY = (playerY + ball.y) / 2;
    
            targetX = midX - camera.clientWidth / 2;
            targetY = midY - camera.clientHeight / 2;
        }
    } else {
        targetX = ball.x - camera.clientWidth / 2;
        targetY = ball.y - camera.clientHeight / 2;
    }

    cameraX = lerp(cameraX, targetX, 0.1);
    cameraY = lerp(cameraY, targetY, 0.1);

    const maxX = gameArea.clientWidth - camera.clientWidth;
    const maxY = gameArea.clientHeight - camera.clientHeight;

    gameArea.style.left = `-${Math.max(0, Math.min(cameraX, maxX))}px`;
    gameArea.style.top = `-${Math.max(0, Math.min(cameraY, maxY))}px`;
}

function lerp(start, end, t) {
    return start + (end - start) * t;
}

document.addEventListener('keydown', function(event) {
    if (inputMessage === document.activeElement) return;

    if (event.key === ' ') {
        kickBall(true);
    } else {
        keysPressed[event.key.toLowerCase()] = true;
    }
});

document.addEventListener('keyup', function(event) {
    if (event.key.toLowerCase() === 't') { 
        keysPressed = [];
        inputMessage.focus();
        return;
    }
    
    if (event.key === 'Enter' && inputMessage === document.activeElement) {
        sendMessage();
        return;
    }

    if (inputMessage === document.activeElement) return;

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
    player.style.boxShadow = '0 0 0 10px rgba(255, 255, 255, 0.1)';
  } else {
    kickPressed = false;
    player.style.boxShadow = 'none';
  }
}

function movePlayer() {
    const angle = calculateAngle();
    
    if (kickPressed) {      
      const player = players[socket.id];
      const detectionRange = player.radius + ball.radius + player.range

      if (distanceBetween(player.x, player.y, ball.x, ball.y) <= detectionRange) {
        socket.emit('kick');
        kickPressed = false;
      }
    }
    
    if (angle !== null) {
        socket.emit('move', { direction: angle, speed: 2.8 });
    }
}

function distanceBetween(x1, y1, x2, y2) {
    const dx = x1 - x2;
    const dy = y1 - y2;
    return Math.sqrt(dx * dx + dy * dy);
}

function calculateAngle() {
    if (controller === 'touch' && stickAngle !== null) return stickAngle;
    
    if (keysPressed['w'] && keysPressed['a']) return 5 * Math.PI / 4;
    if (keysPressed['w'] && keysPressed['d']) return -Math.PI / 4;
    if (keysPressed['s'] && keysPressed['a']) return 3 * Math.PI / 4;
    if (keysPressed['s'] && keysPressed['d']) return Math.PI / 4

    if (keysPressed['w']) return -Math.PI / 2;
    if (keysPressed['a']) return Math.PI;
    if (keysPressed['s']) return Math.PI / 2;
    if (keysPressed['d']) return 0;

    return null;
}

setInterval(movePlayer, 1000 / 60);
