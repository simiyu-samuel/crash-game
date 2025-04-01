const WebSocket = require("ws");
const server = new WebSocket.Server({ port: 3000 });

let clients = new Map(); // Store clients and their balance
let bets = new Map();
let multiplier = 1.0;
let gameInterval;
let isGameRunning = false;
let gameHistory = [];

function startGame() {
  if (isGameRunning) return;
  isGameRunning = true;
  multiplier = 1.0;
  bets.clear();

  gameInterval = setInterval(() => {
    multiplier += 0.01 * (Math.random() * 2 + 0.5); // Variable increase rate
    broadcast({ type: "multiplier_update", multiplier });

    bets.forEach((bet, client) => {
      if (bet.autoCashout && multiplier >= bet.autoCashout) {
        cashOut(client, bet);
      }
    });

    if (Math.random() < 0.02 || multiplier >= 100 + Math.random() * 100) {
      endGame();
    }
  }, 100);
}

function endGame() {
  clearInterval(gameInterval);
  isGameRunning = false;
  gameHistory.unshift(multiplier.toFixed(2) + "x");
  if (gameHistory.length > 10) gameHistory.pop();
  broadcast({ type: "crash", multiplier, gameHistory });
  bets.clear();
  setTimeout(startGame, 5000); // Restart after 5s
}

function cashOut(client, bet) {
  if (!bet) return;
  const winnings = bet.amount * multiplier;
  client.send(JSON.stringify({ type: "cashout", multiplier, winnings }));
  clients.get(client).balance += winnings;
  bets.delete(client);
}

function broadcast(data) {
  clients.forEach((user, client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

server.on("connection", (ws) => {
  clients.set(ws, { balance: 1000 }); // Default balance
  ws.send(JSON.stringify({ type: "init", balance: 1000, gameHistory }));

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);
      const user = clients.get(ws);

      if (data.type === "place_bet" && !isGameRunning) {
        if (data.amount > 0 && data.amount <= user.balance) {
          user.balance -= data.amount;
          bets.set(ws, { amount: data.amount, autoCashout: data.autoCashout });
          ws.send(
            JSON.stringify({ type: "bet_confirmed", balance: user.balance })
          );
        } else {
          ws.send(
            JSON.stringify({ type: "error", message: "Invalid bet amount" })
          );
        }
      }

      if (data.type === "cashout") {
        cashOut(ws, bets.get(ws));
      }
    } catch (e) {
      ws.send(JSON.stringify({ type: "error", message: "Invalid request" }));
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
    bets.delete(ws);
  });
});

startGame();
console.log("Crash game server running on ws://localhost:3000");
