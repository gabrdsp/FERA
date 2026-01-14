const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);

app.use(express.static(__dirname + '/public'));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

var players = {};

io.on('connection', (socket) => {
    console.log('Cliente conectado (Ainda na tela de login):', socket.id);

    // NOTA: Não criamos mais o jogador aqui automaticamente!
    // Apenas enviamos quem JÁ está jogando para o cliente poder ver o fundo (opcional)
    // socket.emit('currentPlayers', players); 

    // --- NOVO: Evento de Login/Entrar no Jogo ---
    socket.on('joinGame', (userData) => {
        console.log('Jogador entrou no mundo:', userData.username);

        // Cria o jogador definitivamente
        players[socket.id] = {
            rotation: 0,
            x: Math.floor(Math.random() * 110) + 320, 
            y: Math.floor(Math.random() * 100) + 550, 
            playerId: socket.id,
            color: Math.random() * 0xffffff,
            username: userData.username, // Usa o nome que veio do formulário
            anim: 'stop'
        };

        // 1. Envia para quem acabou de entrar a lista de quem já está lá
        socket.emit('currentPlayers', players);

        // 2. Avisa todo mundo que chegou gente nova
        socket.broadcast.emit('newPlayer', players[socket.id]);
    });

    socket.on('disconnect', () => {
        console.log('Jogador desconectou:', socket.id);
        // Só remove se ele chegou a entrar no jogo
        if (players[socket.id]) {
            delete players[socket.id];
            io.emit('disconnectPlayer', socket.id);
        }
    });

    socket.on('playerMovement', (movementData) => {
        if (players[socket.id]) {
            players[socket.id].x = movementData.x;
            players[socket.id].y = movementData.y;
            players[socket.id].rotation = movementData.rotation;
            players[socket.id].anim = movementData.anim; 

            socket.broadcast.emit('playerMoved', players[socket.id]);
        }
    });

    socket.on('chatInput', (message) => {
        // Só envia chat se o jogador estiver logado
        if (players[socket.id]) {
            io.emit('chatMessage', { playerId: socket.id, message: message });
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor FERA rodando em http://localhost:${PORT}`);
});