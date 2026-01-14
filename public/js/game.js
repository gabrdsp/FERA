// Variáveis globais para guardar as infos vindas do HTML
var currentUsername = "";
var currentElement = "fogo"; // Valor padrão

// Esta função será chamada pelo HTML quando o jogador clicar em "Entrar"
window.launchGame = function(username, element) {
    // 1. Guarda os dados
    currentUsername = username;
    if(element) currentElement = element;

    // 2. Configura o Phaser
    const config = {
        type: Phaser.AUTO,
        width: 800, 
        height: 600,
        parent: 'game-container', // Vai injetar o canvas na div correta
        transparent: true, // Fundo transparente para mesclar se necessário
        physics: {
            default: 'arcade',
            arcade: {
                debug: false, 
                gravity: { y: 0 }
            }
        },
        scene: {
            preload: preload,
            create: create,
            update: update
        }
    };

    // 3. INICIA O JOGO AGORA (Só neste momento o mapa será desenhado)
    const game = new Phaser.Game(config);
};

// --- FUNÇÕES DO PHASER ---

function preload() {
    this.load.image('bosque-teste', 'assets/bosque-teste.png');
    this.load.spritesheet('player', 'assets/spritesheet.png', { 
        frameWidth: 32, frameHeight: 34 
    });
}

function create() {
    var self = this;
    const mapWidth = 750;
    const mapHeight = 931;

    this.physics.world.setBounds(0, 0, mapWidth, mapHeight);
    this.add.image(0, 0, 'bosque-teste').setOrigin(0, 0);

    // --- CONEXÃO COM O SERVIDOR ---
    this.socket = io();

    // Assim que conectar, já avisa: "Entrei com esse nome!"
    this.socket.on('connect', () => {
        // Envia o evento que o server.js está esperando
        self.socket.emit('joinGame', { 
            username: currentUsername,
            element: currentElement 
        });
    });

    this.otherPlayers = this.physics.add.group();
    this.walls = this.physics.add.staticGroup();

    // Paredes do Mapa
    createWall(self, mapWidth/2, -10, mapWidth, 20);   
    createWall(self, mapWidth/2, mapHeight + 10, mapWidth, 20);  
    createWall(self, -10, mapHeight/2, 20, mapHeight);   
    createWall(self, mapWidth + 10, mapHeight/2, 20, mapHeight);

    // Animações
    this.anims.create({ key: 'down', frames: this.anims.generateFrameNumbers('player', { start: 0, end: 5 }), frameRate: 10, repeat: -1 });
    this.anims.create({ key: 'up', frames: this.anims.generateFrameNumbers('player', { start: 6, end: 11 }), frameRate: 10, repeat: -1 });
    this.anims.create({ key: 'left', frames: this.anims.generateFrameNumbers('player', { start: 12, end: 17 }), frameRate: 10, repeat: -1 });
    this.anims.create({ key: 'right', frames: this.anims.generateFrameNumbers('player', { start: 18, end: 23 }), frameRate: 10, repeat: -1 });

    // Configuração do Chat
    const chatInput = document.getElementById('chat-input');
    this.input.keyboard.removeCapture('SPACE'); 
    
    // Removemos ouvintes antigos para evitar duplicação se relogar (boa prática)
    const newChatInput = chatInput.cloneNode(true);
    chatInput.parentNode.replaceChild(newChatInput, chatInput);
    
    newChatInput.addEventListener('keydown', function(event) {
        event.stopPropagation();
        if (event.key === 'Enter' && newChatInput.value.trim() !== "") {
            self.socket.emit('chatInput', newChatInput.value);
            newChatInput.value = ''; newChatInput.blur(); 
        }
    });
    newChatInput.addEventListener('focus', () => { self.isTyping = true; });
    newChatInput.addEventListener('blur', () => { self.isTyping = false; });

    // -- OUVINTES DO SOCKET --
    this.socket.on('currentPlayers', function (players) {
        self.otherPlayers.clear(true, true);
        Object.keys(players).forEach(function (id) {
            if (players[id].playerId === self.socket.id) {
                addPlayer(self, players[id]);
            } else {
                addOtherPlayers(self, players[id]);
            }
        });
    });

    this.socket.on('newPlayer', function (playerInfo) {
        addOtherPlayers(self, playerInfo);
    });

    this.socket.on('disconnectPlayer', function (playerId) {
        self.otherPlayers.getChildren().forEach(function (otherPlayer) {
            if (playerId === otherPlayer.playerId) {
                if (otherPlayer.nameText) otherPlayer.nameText.destroy();
                if (otherPlayer.chatBubble) otherPlayer.chatBubble.destroy();
                otherPlayer.destroy();
            }
        });
    });

    this.socket.on('playerMoved', function (playerInfo) {
        self.otherPlayers.getChildren().forEach(function (otherPlayer) {
            if (playerInfo.playerId === otherPlayer.playerId) {
                otherPlayer.setPosition(playerInfo.x, playerInfo.y);
                if (playerInfo.anim && playerInfo.anim !== 'stop') {
                    otherPlayer.anims.play(playerInfo.anim, true);
                } else {
                    otherPlayer.anims.stop();
                }
                if (otherPlayer.nameText) otherPlayer.nameText.setPosition(playerInfo.x, playerInfo.y + 40);
                if (otherPlayer.chatBubble) otherPlayer.chatBubble.setPosition(playerInfo.x, playerInfo.y - 50);
            }
        });
    });

    this.socket.on('chatMessage', function (data) {
        if (self.player && data.playerId === self.socket.id) {
            showChatBubble(self, self.player, data.message);
        } else {
            self.otherPlayers.getChildren().forEach(function (otherPlayer) {
                if (data.playerId === otherPlayer.playerId) {
                    showChatBubble(self, otherPlayer, data.message);
                }
            });
        }
    });

    this.cursors = this.input.keyboard.createCursorKeys();
    this.cameras.main.setBounds(0, 0, mapWidth, mapHeight);
    this.cameras.main.setZoom(1.5);
}

function update() {
    if (!this.player) return;

    if (this.isTyping) {
        this.player.body.setVelocity(0);
        if (this.player.anims.isPlaying) this.player.anims.stop();
        return; 
    }

    const speed = 160;
    this.player.body.setVelocity(0);
    let currentAnim = 'stop';

    if (this.cursors.left.isDown) {
        this.player.body.setVelocityX(-speed); this.player.anims.play('left', true); currentAnim = 'left';
    } else if (this.cursors.right.isDown) {
        this.player.body.setVelocityX(speed); this.player.anims.play('right', true); currentAnim = 'right';
    } else if (this.cursors.up.isDown) {
        this.player.body.setVelocityY(-speed); this.player.anims.play('up', true); currentAnim = 'up';
    } else if (this.cursors.down.isDown) {
        this.player.body.setVelocityY(speed); this.player.anims.play('down', true); currentAnim = 'down';
    } else {
        this.player.anims.stop(); currentAnim = 'stop';
    }

    if (this.player.nameText) this.player.nameText.setPosition(this.player.x, this.player.y + 40);
    if (this.player.chatBubble) this.player.chatBubble.setPosition(this.player.x, this.player.y - 50);

    var x = this.player.x; var y = this.player.y; var r = this.player.rotation;
    if (this.player.oldPosition && (x !== this.player.oldPosition.x || y !== this.player.oldPosition.y || currentAnim !== this.player.oldPosition.anim)) {
        this.socket.emit('playerMovement', { x: this.player.x, y: this.player.y, rotation: this.player.rotation, anim: currentAnim });
    }
    this.player.oldPosition = { x: this.player.x, y: this.player.y, rotation: this.player.rotation, anim: currentAnim };
}

// --- FUNÇÕES AUXILIARES ---
function addPlayer(self, playerInfo) {
    self.player = self.physics.add.sprite(playerInfo.x, playerInfo.y, 'player', 0);
    self.player.setScale(2); 
    self.player.setOrigin(0.5, 0.5);
    self.player.setCollideWorldBounds(true);
    self.player.setTint(playerInfo.color);
    self.player.body.setSize(20, 10);
    self.player.body.setOffset(6, 24);
    self.physics.add.collider(self.player, self.walls);
    self.player.nameText = self.add.text(playerInfo.x, playerInfo.y + 40, playerInfo.username, { fontSize: '16px', fill: '#ffffff', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5);
    self.cameras.main.startFollow(self.player, true);
}

function addOtherPlayers(self, playerInfo) {
    const otherPlayer = self.physics.add.sprite(playerInfo.x, playerInfo.y, 'player', 0);
    otherPlayer.setScale(2);
    otherPlayer.setTint(playerInfo.color);
    otherPlayer.playerId = playerInfo.playerId;
    otherPlayer.body.setImmovable(true);
    self.otherPlayers.add(otherPlayer);
    otherPlayer.nameText = self.add.text(playerInfo.x, playerInfo.y + 40, playerInfo.username, { fontSize: '16px', fill: '#ffffff', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5);
}

function showChatBubble(scene, sprite, text) {
    if (sprite.chatBubble) sprite.chatBubble.destroy();
    sprite.chatBubble = scene.add.text(sprite.x, sprite.y - 50, text, { fontSize: '18px', fontFamily: 'Arial', fill: '#ffff00', backgroundColor: 'rgba(0,0,0,0.5)', padding: { x: 10, y: 5 }, align: 'center' }).setOrigin(0.5);
    scene.time.delayedCall(4000, () => { if (sprite.chatBubble) { sprite.chatBubble.destroy(); sprite.chatBubble = null; } }, [], scene);
}

function createWall(scene, x, y, width, height) {
    let wall = scene.add.rectangle(x, y, width, height, 0x00ff00, 0); 
    scene.physics.add.existing(wall, true); 
    scene.walls.add(wall);
}