const WebSocket = require('ws');

// Game Configuration
const WORLD_SIZE = 500; // Size of the main game square (pixels)
const PLAYER_SIZE = 20; // Size of each player square (pixels)
const MOVEMENT_SPEED = 5; // How many pixels a player moves per key press

// Server Setup
const PORT = process.env.PORT || 8080; // Render will set process.env.PORT
const wss = new WebSocket.Server({ port: PORT });

console.log(`WebSocket server started on port ${PORT}`);

// Global game state
const players = {}; // Stores player data: { playerId: { x, y, color, name } }
let nextPlayerId = 1; // Simple ID counter

// Utility function to generate a random color for new players
function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

wss.on('connection', ws => {
    // Assign a unique ID to the new player
    const playerId = `player-${nextPlayerId++}`;
    const playerColor = getRandomColor();
    const playerName = `Player ${playerId.split('-')[1]}`; // Simple default name

    // Initialize player position in the center
    const initialX = (WORLD_SIZE / 2) - (PLAYER_SIZE / 2);
    const initialY = (WORLD_SIZE / 2) - (PLAYER_SIZE / 2);

    players[playerId] = {
        x: initialX,
        y: initialY,
        color: playerColor,
        name: playerName,
        id: playerId // Store ID in player object for easy client lookup
    };

    ws.id = playerId; // Attach the ID to the WebSocket connection for easy lookup

    console.log(`Player ${playerId} connected.`);

    // 1. Send the new player their own ID and initial state
    ws.send(JSON.stringify({
        type: 'init',
        playerId: ws.id,
        playerState: players[playerId],
        worldSize: WORLD_SIZE,
        playerSize: PLAYER_SIZE
    }));

    // 2. Send the new player the current state of all existing players
    ws.send(JSON.stringify({
        type: 'currentPlayers',
        players: players
    }));

    // 3. Broadcast to all other players that a new player has joined
    wss.clients.forEach(client => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: 'playerJoined',
                player: players[playerId]
            }));
        }
    });

    ws.on('message', message => {
        let parsedMessage;
        try {
            parsedMessage = JSON.parse(message);
        } catch (e) {
            console.error(`Invalid JSON received from ${ws.id}: ${message}`);
            return;
        }

        switch (parsedMessage.type) {
            case 'movement':
                const player = players[ws.id];
                if (!player) return; // Player not found (shouldn't happen)

                let newX = player.x;
                let newY = player.y;

                switch (parsedMessage.direction) {
                    case 'w': // Up
                        newY = Math.max(0, player.y - MOVEMENT_SPEED);
                        break;
                    case 'a': // Left
                        newX = Math.max(0, player.x - MOVEMENT_SPEED);
                        break;
                    case 's': // Down
                        newY = Math.min(WORLD_SIZE - PLAYER_SIZE, player.y + MOVEMENT_SPEED);
                        break;
                    case 'd': // Right
                        newX = Math.min(WORLD_SIZE - PLAYER_SIZE, player.x + MOVEMENT_SPEED);
                        break;
                }

                // Update player position if it changed
                if (newX !== player.x || newY !== player.y) {
                    player.x = newX;
                    player.y = newY;

                    // Broadcast the updated position to all clients
                    wss.clients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({
                                type: 'playerMoved',
                                playerId: ws.id,
                                x: player.x,
                                y: player.y
                            }));
                        }
                    });
                }
                break;

            case 'chat':
                // For a simple chat, you can broadcast the message to all
                console.log(`Chat from ${player.name}: ${parsedMessage.message}`);
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'chat',
                            sender: player.name,
                            message: parsedMessage.message
                        }));
                    }
                });
                break;

            // Add more message types for other game actions
            default:
                console.warn(`Unknown message type received from ${ws.id}: ${parsedMessage.type}`);
        }
    });

    ws.on('close', () => {
        console.log(`Player ${ws.id} disconnected.`);
        delete players[ws.id]; // Remove player from our game state

        // Broadcast to all remaining clients that this player has left
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                    type: 'playerLeft',
                    playerId: ws.id
                }));
            }
        });
    });

    ws.on('error', error => {
        console.error(`WebSocket error for player ${ws.id}:`, error);
    });
});
