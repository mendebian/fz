const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

app.get('/rooms', (req, res) => {
  const roomList = Object.keys(rooms).map(room => ({
    id: room,
    name: rooms[room].roomName,
    count: Object.keys(rooms[room].players).length
  }));
  res.json(roomList);
});

function initializeRoom(data) {
  if (!rooms[data.id]) {
    rooms[data.id] = {
      roomId: data.id,
      roomName: data.name,
      pitch: {
        width: 1100,
        height: 750,
        marginX: 400,
        marginY: 400,
        goalSide: 125,
      },
      score: {
        home: 0,
        away: 0
      },
      ball: {
        x: (1100 / 2) + 400,
        y: (750 / 2) + 400,
        radius: 10,
        velocityX: 0,
        velocityY: 0,
        friction: 0.98,
        acceleration: 0.3,
        mass: 4,
        angle: 0,
        active: true,
        scorer: null,
        assister: null
      },
      players: {},
      alignment: {
        home: [
          { x: 600, y: 775 },
          { x: 700, y: 650 },
          { x: 700, y: 900 },
          { x: 800, y: 775 }
        ],
        away: [
          { x: 1300, y: 775 },
          { x: 1200, y: 650 },
          { x: 1200, y: 900 },
          { x: 1100, y: 775 }
        ]
      },
      places: { home: [0, 1, 2, 3], away: [0, 1, 2, 3] },
      gameLoopRunning: false
    };
  }
}

function distanceBetween(x1, y1, x2, y2) {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return Math.sqrt(dx * dx + dy * dy);
}

function isCollidingCircle(x1, y1, radius1, x2, y2, radius2) {
  const distance = distanceBetween(x1, y1, x2, y2);
  return distance < radius1 + radius2;
}

function resolveCollision(x1, y1, radius1, x2, y2, radius2, mass1, mass2) {
  const distance = distanceBetween(x1, y1, x2, y2);

  if (distance < radius1 + radius2) {
    const overlap = radius1 + radius2 - distance;
    const angle = Math.atan2(y2 - y1, x2 - x1);

    const force = (mass1 + mass2) / 2;

    return {
      x: Math.cos(angle) * overlap * force * 0.1,
      y: Math.sin(angle) * overlap * force * 0.1
    };
  }

  return { x: 0, y: 0 };
}

function updateBallPhysics(room) {
    const ball = room.ball;
    const pitch = room.pitch;

    ball.x += ball.velocityX;
    ball.y += ball.velocityY;

    ball.velocityX *= ball.friction;
    ball.velocityY *= ball.friction;

    ball.angle += Math.sqrt(ball.velocityX ** 2 + ball.velocityY ** 2) / ball.radius * (ball.velocityX >= 0 ? 1 : -1);

    if (ball.x + ball.radius > pitch.width + pitch.marginX) {
        if (ball.y - ball.radius > (pitch.height / 2) + pitch.marginY - pitch.goalSide - 10 &&
            ball.y + ball.radius < (pitch.height / 2) + pitch.marginY + pitch.goalSide + 10) {
        
            if (ball.y - ball.radius < (pitch.height / 2) + pitch.marginY - pitch.goalSide) {
                ball.y = (pitch.height / 2) + pitch.marginY - pitch.goalSide + ball.radius;
                ball.velocityY = -ball.velocityY * 0.3;
            }
            if (ball.y + ball.radius > (pitch.height / 2) + pitch.marginY + pitch.goalSide) {
                ball.y = (pitch.height / 2) + pitch.marginY + pitch.goalSide - ball.radius;
                ball.velocityY = -ball.velocityY * 0.3; 
            }
            if (ball.x + ball.radius > pitch.width + pitch.marginX + 85) {
                ball.x = pitch.width + pitch.marginX + 85 - ball.radius;
                ball.velocityX = -ball.velocityX * 0.3;
            }
            
            if (ball.x + ball.radius > pitch.width + pitch.marginX + (ball.radius * 2)) {
                goalEvent(room, "home");
            }  
        } else {
            ball.x = pitch.width + pitch.marginX - ball.radius;
            ball.velocityX = -ball.velocityX * 0.5; 
        }
    }

    if (ball.x - ball.radius < pitch.marginX) {
        if (ball.y - ball.radius > (pitch.height / 2) + pitch.marginY - pitch.goalSide - 10 &&
            ball.y + ball.radius < (pitch.height / 2) + pitch.marginY + pitch.goalSide + 10) {
        
            if (ball.y - ball.radius < (pitch.height / 2) + pitch.marginY - pitch.goalSide) {
                ball.y = (pitch.height / 2) + pitch.marginY - pitch.goalSide + ball.radius;
                ball.velocityY = -ball.velocityY * 0.3;
            }
        
            if (ball.y + ball.radius > (pitch.height / 2) + pitch.marginY + pitch.goalSide) {
                ball.y = (pitch.height / 2) + pitch.marginY + pitch.goalSide - ball.radius;
                ball.velocityY = -ball.velocityY * 0.3;
            }

            if (ball.x - ball.radius < pitch.marginX - 85) {
                ball.x = pitch.marginX - 85 + ball.radius;
                ball.velocityX = -ball.velocityX * 0.3;
            }

            if (ball.x - ball.radius < pitch.marginX - (ball.radius * 2)) {
                goalEvent(room, "away");
            }
        } else {
            ball.x = pitch.marginX + ball.radius;
            ball.velocityX = -ball.velocityX * 0.5;
        }
    }

    if (ball.y + ball.radius > pitch.height + pitch.marginY) {
        ball.y = pitch.height + pitch.marginY - ball.radius;
        ball.velocityY = -ball.velocityY * 0.5; 
    }

    if (ball.y - ball.radius < pitch.marginY) {
        ball.y = pitch.marginY + ball.radius;
        ball.velocityY = -ball.velocityY * 0.5; 
    }
}

function goalEvent(room, team) {
  if (room.ball.active) {
    room.ball.active = false;
    room.score[team] += 1;
    io.to(room.roomId).emit('goal', { team: team, scorer: room.ball.scorer, assister: room.ball.assister });

    setTimeout(() => {
      room.ball.x = (room.pitch.width / 2) + room.pitch.marginX;
      room.ball.y = (room.pitch.height / 2) + room.pitch.marginY;
      room.ball.velocityX = 0;
      room.ball.velocityY = 0;

      for (const id in room.players) {
        if (room.players[id].team) {
          const spawn = room.players[id].spawn;
          room.players[id].x = room.alignment[room.players[id].team][spawn].x;
          room.players[id].y = room.alignment[room.players[id].team][spawn].y;
          room.players[id].angle = null;
        }
      }

      if (room.score[team] === 5) {
        room.score.home = 0;
        room.score.away = 0;
      }
      
      room.ball.assister = null;
      room.ball.scorer = null;
      room.ball.active = true;
    }, 2000);
  }
}

function updatePhysics(room) {
  updateBallPhysics(room);

  const players = room.players;
  const ball = room.ball;

  Object.keys(players).forEach((id1) => {
    const player1 = players[id1];
    Object.keys(players).forEach((id2) => {
      if (id1 !== id2) {
        const player2 = players[id2];
        if (isCollidingCircle(player1.x, player1.y, player1.radius, player2.x, player2.y, player2.radius)) {
          const { x, y } = resolveCollision(player1.x, player1.y, player1.radius, player2.x, player2.y, player2.radius, player1.mass, player2.mass);
          player1.x -= x;
          player1.y -= y;
          player2.x += x;
          player2.y += y;
        }
      }
    });
    
    if (isCollidingCircle(player1.x, player1.y, player1.radius, ball.x, ball.y, ball.radius)) {
      const { x, y } = resolveCollision(player1.x, player1.y, player1.radius, ball.x, ball.y, ball.radius, player1.mass, ball.mass);
      ball.x += x;
      ball.y += y;
      const angle = Math.atan2(y, x);
      ball.velocityX += Math.cos(angle) * ball.acceleration;
      ball.velocityY += Math.sin(angle) * ball.acceleration;

      player1.x -= x / 2;
      player1.y -= y / 2;
    }
  });
}

function gameLoop(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  updatePhysics(room);

  Object.keys(room.players).forEach((id) => {
    const player = room.players[id];
    if (player.angle !== null) {
      const speed = 2.4;
      player.x += Math.cos(player.angle) * speed;
      player.y += Math.sin(player.angle) * speed;
    }
  });

  io.to(roomId).emit('update', { players: room.players, ball: room.ball, score: room.score });

  setTimeout(() => gameLoop(roomId), 1000 / 60);
}

io.on('connection', (socket) => {
  socket.on('joinRoom', (data) => {
    const { nickname, roomData } = data;

    if (!roomData || !nickname) {
      socket.disconnect();
      return;
    }
    
    const roomId = roomData.id;
    
    initializeRoom(roomData);
    const room = rooms[roomId];

    socket.join(roomId);

    if (room.places.home.length > 0 || room.places.away.length > 0) {
      const team = room.places.home.length >= room.places.away.length ? 'home' : 'away';
      const spawn = room.places[team].shift();

      room.players[socket.id] = {
        x: room.alignment[team][spawn].x,
        y: room.alignment[team][spawn].y,
        nickname: nickname.slice(0, 24),
        radius: 20,
        mass: 10,
        range: 10,
        team: team,
        spawn: spawn,
        angle: null
      };
    } else {
      room.players[socket.id] = {
        nickname: nickname.slice(0, 24),
      };
    }

    io.to(roomId).emit('chat', { 
      entity: room.players[socket.id], 
      content: { type: 'connection', connected: true } 
    });

    socket.emit('update', { players: room.players, ball: room.ball, score: room.score });

    if (!room.gameLoopRunning) {
      room.gameLoopRunning = true;
      gameLoop(roomId);
    }

    socket.on('chat', (data) => {
      if (data?.body?.text) {
        if (data.body.text.length > 128) {
          data.body.text = data.body.text.slice(0, 128);
        }
      }
      
      io.to(roomId).emit('chat', { 
        entity: room.players[socket.id], 
        content: data 
      });
    });
    
    socket.on("ping", callback => callback());
    
    socket.on('move', (angle) => {
      const player = room.players[socket.id];
      if (player) {
        player.angle = (angle !== null) ? angle : null;
      }
    });

    socket.on('kick', () => {
      const player = room.players[socket.id];
      if (!player) return;

      const distanceToBall = distanceBetween(player.x, player.y, room.ball.x, room.ball.y);
      const detectionRange = player.radius + room.ball.radius + player.range;

      if (distanceToBall <= detectionRange) {
        const angle = Math.atan2(room.ball.y - player.y, room.ball.x - player.x);
        const kickForce = 8;
        
        room.ball.velocityX += Math.cos(angle) * kickForce;
        room.ball.velocityY += Math.sin(angle) * kickForce;

        room.ball.assister = room.ball.scorer;
        room.ball.scorer = { id: socket.id, nickname: player.nickname, team: player.team };

        io.to(roomId).emit('update', { players: room.players, ball: room.ball, score: room.score });
      }
    });

    socket.on('disconnect', () => {
      const player = room.players[socket.id];

      if (player && player.team) {
        room.places[player.team].push(player.spawn);
      }

      delete room.players[socket.id];

      io.to(roomId).emit('update', { players: room.players, ball: room.ball, score: room.score });
      io.to(roomId).emit('chat', { entity: player, content: { type: 'connection', connected: false } });

      if (Object.keys(room.players).length === 0) {
        delete rooms[roomId];
      }
    });
  });
});

server.listen(3000, () => {
  console.log('Server is running...');
});
