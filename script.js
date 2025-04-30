const board = document.getElementById("board");
const loginButton = document.getElementById("loginSubmit"); // 🔥 DODANE!
let socket = null;
const API_BASE = "https://chessence-backend.onrender.com";
let activeUserNick = null; // 🧠 aktualnie zalogowany użytkownik w tej karcie

try {
  socket = io(API_BASE);
  socket.on("connect", () => {
	const connectionOverlay = document.getElementById("connectionOverlay");
	if (connectionOverlay) {
	  connectionOverlay.classList.add("hidden");
	
	  // Opcjonalnie całkowicie usuń z DOM po animacji:
	  setTimeout(() => {
	    connectionOverlay.style.display = "none";
	  }, 600); // Daj czas na fade-out (500ms + trochę zapasu)
	}
    socketId = socket.id;
    console.log("🆔 Moje socket.id:", socketId);
  });  
  console.log("🟢 Połączono z serwerem socket.io");
} catch (e) {
  console.warn("🔴 Nie można połączyć z serwerem socket.io (tryb online wyłączony)");
}

socket.on('refreshFriends', async () => {
  window.cachedUsers = null;
  await refreshUsers();

  // 🔥 ZAWSZE odśwież zaproszenia
  await renderInvites();

  const activeTabBtn = document.querySelector('.tab-button.active');

  if (activeTabBtn?.id === 'tab-friends') {
    await renderFriendsList();
  }
});

let currentPopupID = 0;
let currentGameInvite = null; // zapamiętaj dane zaproszenia
let currentRoomCode = null;
let lastSentMove = null;
let socketId = null;
let isAnimationRunning = false;
let viewingFriendProfile = false; // ⬅️ dodane na górze pliku
let currentlyViewedUser = null; // 🧠 aktualnie oglądany użytkownik (do podglądu)
let viewingFriendId = null;

let currentTurn = 'w'; // w - biały, b - czarny
let isBotRunning = false;
let selected = null;
let enPassantTarget = null; // {x, y}
let whiteKingMoved = false;
let blackKingMoved = false;
let whiteRookMoved = [false, false]; // [a1, h1]
let blackRookMoved = [false, false]; // [a8, h8]
let legalMoves = [];
let moveLog = [];
let playerColor = null; // kolor gracza ('w' lub 'b')
let botColor = null;    // bot dostanie przeciwny kolor
let stockfishPVBWorker = new Worker('stockfish.js');
let stockfishEvalWorker = new Worker('stockfish.js');
let stockfishBVBWorker = new Worker('stockfish.js');
let gameMode = null; // domyślnie: gracz vs bot
let pvpSubmode = null; // "online" | "hotseat" | null
let gameEnded = false;
let botDifficultyW = 5;
let botDifficultyB = 5;
let promotionContext = null;
const baseXP = 100;
const achievementQueue = [];
let isAchievementVisible = false;
let isInputLocked = false;
let hasLostPiece = false;
const initialCapturedCounts = {
  P: 0, N: 0, B: 0, R: 0, Q: 0
};
let capturedByWhite = { ...initialCapturedCounts };
let capturedByBlack = { ...initialCapturedCounts };
let previousCapturedByWhite = {};
let previousCapturedByBlack = {};

let achievements = JSON.parse(localStorage.getItem("achievements") || "{}");

// Lista osiągnięć: ID => {name, description, image}
const achievementsList = [
  { id: "first_win", name: "Pierwsza Krew", description: "Wygraj swoją pierwszą grę w trybie PvB", image: "win_1.png" },
  { id: "win_5", name: "Seria Zwycięstw", description: "Wygraj 5 gier w trybie PvB", image: "win_5.png" },
  { id: "win_50", name: "On a Roll", description: "Wygraj 50 gier w trybie PvB", image: "win_50.png" },
  { id: "win_200", name: "Nie do Zatrzymania", description: "Wygraj 200 gier w trybie PvB", image: "win_200.png" },

  { id: "bot_0", name: "Pierwsze Kliknięcie", description: "Pokonaj bota na poziomie Begginer", image: "bot_0.png" },
  { id: "bot_1", name: "Pierwsze Starcie", description: "Pokonaj bota na poziomie Novice", image: "bot_1.png" },
  { id: "bot_2", name: "Algorytm Pokonany", description: "Pokonaj bota na poziomie Easy", image: "bot_2.png" },
  { id: "bot_3", name: "Chłodna Głowa", description: "Pokonaj bota na poziomie Normal", image: "bot_3.png" },
  { id: "bot_4", name: "Ogarnięta Kombinacja", description: "Pokonaj bota na poziomie Skilled", image: "bot_4.png" },
  { id: "bot_5", name: "Inteligentna Ofensywa", description: "Pokonaj bota na poziomie Dread", image: "bot_5.png" },
  { id: "bot_6", name: "Szachowy Inżynier", description: "Pokonaj bota na poziomie Expert", image: "bot_6.png" },
  { id: "bot_7", name: "Wytrwały Strateg", description: "Pokonaj bota na poziomie Nightmare", image: "bot_7.png" },
  { id: "bot_8", name: "Arcymistrz Kodów", description: "Pokonaj bota na poziomie Insane", image: "bot_8.png" },
  { id: "bot_9", name: "Sztuczna Pokora", description: "Pokonaj bota na poziomie Hell", image: "bot_9.png" },
  { id: "bot_10", name: "Mistrz Strategii", description: "Pokonaj bota na poziomie ???", image: "bot_10.png" },

  { id: "promotion", name: "Promocja!", description: "Promuj pionka w trybie PvB", image: "promotion.png" },
  { id: "castling", name: "Roszada!", description: "Wykonaj roszadę w trybie PvB", image: "castling.png" },
  { id: "enpassant", name: "Znikający Pionek", description: "Wykonaj bicie w przelocie w trybie PvB", image: "enpassant.png" },
  
  { id: "win_white", name: "Białe na Biało", description: "Wygraj jako białe w trybie PvB", image: "win_white.png" },
  { id: "win_black", name: "Czarny Rycerz", description: "Wygraj jako czarne w trybie PvB", image: "win_black.png" },
  { id: "first_draw", name: "Honorowy Remis", description: "Zakończ swoją pierwszą grę remisem w trybie PvB", image: "first_draw.png" },
  { id: "first_loss", name: "Szkoła Życia", description: "Przegraj pierwszy raz z botem", image: "first_loss.png" },
  
  { id: "no_piece_lost", name: "Żelazna Dyscyplina", description: "Wygraj grę bez straty żadnej figury", image: "no_piece_lost.png" },
  { id: "revenge", name: "Zemsta", description: "Pokonaj bota, z którym wcześniej przegrałeś", image: "revenge.png" },
  {id: "scholars_mate",name: "Szewczyk!",description: "Wygraj partię matem szewczyka",image: "scholars_mate.png"},
  
  { id: "win_streak_3", name: "Rozgrzewka", description: "Wygraj 3 gry z rzędu w trybie PvB z botem powyżej 3 poziomu trudności", image: "streak_3.png" },
  { id: "win_streak_5", name: "Niepokonany", description: "Wygraj 5 gier z rzędu w trybie PvB z botem powyżej 3 poziomu trudności", image: "streak_5.png" },

];

const levelRewards = [
  { level: 1, type: "avatar", id: "avatar3.png" },
  { level: 1, type: "background", id: "bg1.png" },
  { level: 2, type: "avatar", id: "avatar4.png" },
  { level: 3, type: "avatar", id: "avatar5.png" },
  { level: 4, type: "avatar", id: "avatar6.png" },
  { level: 4, type: "background", id: "bg2.png" },
  { level: 5, type: "avatar", id: "avatar7.png" },
  { level: 5, type: "background", id: "bg3.png" },
  { level: 5, type: "frame", id: "bronze_frame" },
  { level: 6, type: "avatar", id: "avatar8.png" },
  { level: 7, type: "avatar", id: "avatar9.png" },
  { level: 8, type: "avatar", id: "avatar10.png" },
  { level: 9, type: "avatar", id: "avatar11.png" },
  { level: 10, type: "avatar", id: "avatar12.png" },
  { level: 10, type: "background", id: "bg4.png" },
  { level: 10, type: "frame", id: "silver_frame" },
  { level: 20, type: "frame", id: "gold_frame" },
  { level: 30, type: "frame", id: "platinum_frame" },
  { level: 40, type: "frame", id: "diamond_frame" },
  { level: 50, type: "frame", id: "ruby_frame" }
  // dodawaj dalej: { level: X, type: "avatar" | "background", id: "plik.png" }
];

const defaultUnlockedRewards = [
  { type: "avatar", id: "avatar1.png" },
  { type: "avatar", id: "avatar2.png" },
  { type: "background", id: "bg0.png" },
  { type: "frame", id: "default_frame" }
];


const colorButtons = document.getElementById("colorButtons");
const difficultyPVB = document.getElementById("difficultyPVBContainer");
const difficultyBVB = document.getElementById("difficultyBVBContainer");

// Unicode figur
const pieces = {
  r: '♜', n: '♞', b: '♝', q: '♛', k: '♚', p: '♟',
  R: '♖', N: '♘', B: '♗', Q: '♕', K: '♔', P: '♙'
};

async function registerUser(nick, password) {
  const response = await fetch(`${API_BASE}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nick, password })
  });

  if (!response.ok) {
    throw new Error('Rejestracja nie powiodła się.');
  }
}

async function loginUser(nick, password) {
  const response = await fetch(`${API_BASE}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nick, password })
  });

  console.log(`📨 Odpowiedź z loginu, status HTTP:`, response.status);

  if (!response.ok) {
    throw new Error('Błąd logowania');
  }

  const data = await response.json();
  console.log(`📋 Dane po zalogowaniu:`, data);

  return data.user;
}

async function getProfile(nick) {
  console.log(`🌍 Pobieram profil użytkownika: ${nick}`);
  const response = await fetch(`${API_BASE}/api/profile/${nick}`);
  console.log(`📥 Status odpowiedzi profilu: ${response.status}`);

  if (!response.ok) {
    throw new Error('Nie znaleziono profilu.');
  }

  const data = await response.json();
  console.log(`📋 Dane profilu z serwera:`, data);
  return data.user;
}

// Wyślij zaproszenie do znajomego
async function sendFriendRequest(targetNick) {
  const myNick = localStorage.getItem("currentUser");
  if (!myNick) {
    showFloatingStatus("Musisz być zalogowany", "showPopup");
    return;
  }

  if (!targetNick) {
    showFloatingStatus("Podaj nick znajomego.", "showPopup");
    return;
  }

  const users = await getUsers();
  const currentUserData = users[myNick];
  const targetUserData = users[targetNick];

  if (!currentUserData) {
    showFloatingStatus("Brak danych użytkownika.", "showPopup");
    return;
  }

  // 🔥 NOWA BLOKADA: czy istnieje gracz do którego wysyłasz zaproszenie
  if (!targetUserData) {
    showFloatingStatus(`Użytkownik ${targetNick} nie istnieje.`, "showPopup");
    return;
  }
	
  // 🔥 BLOKADA 1: Próba dodania siebie
  if (myNick === targetNick) {
    showFloatingStatus("Nie możesz dodać siebie do znajomych.", "showPopup");
    return;
  }

  // 🔥 BLOKADA 2: Target już jest na liście znajomych
  if (currentUserData.friends?.includes(targetNick)) {
    showFloatingStatus(`Użytkownik ${targetNick} jest już na Twojej liście znajomych.`, "showPopup");
    return;
  }

  // 🔥 BLOKADA 3: Zaproszenie już wysłane (pendingInvites)
  if (currentUserData.pendingInvites?.includes(targetNick)) {
    showFloatingStatus(`Wysłałeś już zaproszenie do ${targetNick}.`, "showPopup");
    return;
  }

  try {
    socket.emit('sendFriendRequest', {
      from: myNick,
      to: targetNick
    });

    showFloatingStatus(`Zaproszenie do ${targetNick} wysłane.`, "info");

    setTimeout(async () => {
      await refreshUsers();
      await renderFriendsList();
      await renderInvites();
    }, 500);
  } catch (error) {
    console.error(error);
    showFloatingStatus(error.message || "Błąd wysyłania zaproszenia", "showPopup");
  }
}


// Akceptuj zaproszenie od znajomego
async function acceptFriendRequestAPI(senderNick, receiverNick) {
  console.log('ACCEPT API PAYLOAD:', { sender: senderNick, receiver: receiverNick }); // <-- NOWE

  const response = await fetch(`${API_BASE}/api/friends/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sender: senderNick, receiver: receiverNick })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Nie udało się zaakceptować zaproszenia: ${errText}`);
  }
}

// Odrzuć zaproszenie od znajomego
async function declineFriendRequestAPI(senderNick, receiverNick) {
  const response = await fetch(`${API_BASE}/api/friends/decline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sender: senderNick, receiver: receiverNick })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Nie udało się odrzucić zaproszenia: ${errText}`);
  }
}

// Usuń znajomego
async function removeFriend(friendNick) {
  const myNick = localStorage.getItem("currentUser");
  if (!myNick) {
    showFloatingStatus("Musisz być zalogowany", "showPopup");
    return;
  }

  try {
    await removeFriendAPI(myNick, friendNick);

    // 🔥 Emisja socketowa po usunięciu znajomego
    socket.emit('friendListUpdated', { friend: friendNick });

    // ❌ NIE rób tu ręcznego refreshUsers
    // Poczekaj na socket.on('refreshFriends')

    showFloatingStatus("Usunięto znajomego", "info");
  } catch (error) {
    console.error(error);
    showFloatingStatus(error.message, "showPopup");
  }
}

async function saveProfileToServer(nick, profileData) {
  await fetch(`${API_BASE}/api/profile/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nick,
      ui: profileData.ui
    })
  });
}

async function tryRegister() {
  const nick = document.getElementById("registerNickname").value.trim();
  const password = document.getElementById("registerPassword").value.trim();
  const confirmPassword = document.getElementById("registerConfirmPassword").value.trim();

  if (nick.length < 3) {
    return showPopupAdvanced({ message: "Nick musi mieć co najmniej 3 znaki.", confirm: false });
  }
  if (password.length < 4) {
    return showPopupAdvanced({ message: "Hasło musi mieć co najmniej 4 znaki.", confirm: false });
  }
  if (password !== confirmPassword) {
    return showPopupAdvanced({ message: "Hasła nie są takie same.", confirm: false });
  }

  try {
    const response = await fetch(`${API_BASE}/api/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nick, password })
    });

    if (response.ok) {
      // PO FETCHU pokazujemy OSOBNY popup sukcesu
      showPopupAdvanced({
        message: "✅ Rejestracja zakończona sukcesem! Kliknij OK aby przejść do logowania.",
        confirm: false,
        onConfirm: () => {
          showScreen("loginScreen");
        }
      });
    } else {
      const data = await response.json();
      showPopupAdvanced({
        message: data.error || "Rejestracja nie powiodła się. Być może nick już istnieje.",
        confirm: false
      });
    }
  } catch (error) {
    console.error(error);
    showPopupAdvanced({
      message: "Błąd połączenia z serwerem.",
      confirm: false
    });
  }
}

function promotePawn(isWhite, isBot) {
  newPieceElem.dataset.promotion = "true";
  if (isBot) {
    return isWhite ? 'Q' : 'q';
  }

  return null; // tryMove() musi przerwać, a handleClick() powinno dokończyć po wyborze
}


// Startowa pozycja
let boardState = [
  ['r','n','b','q','k','b','n','r'],
  ['p','p','p','p','p','p','p','p'],
  ['','','','','','','',''],
  ['','','','','','','',''],
  ['','','','','','','',''],
  ['','','','','','','',''],
  ['P','P','P','P','P','P','P','P'],
  ['R','N','B','Q','K','B','N','R']
];
function logMove(fromX, fromY, toX, toY, piece, captured = '', promotion = '', castling = '') {
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];

  let moveStr = '';

  if (castling) {
    moveStr = castling; // 'O-O' lub 'O-O-O'
  } else {
    const from = files[fromX] + ranks[fromY];
    const to = files[toX] + ranks[toY];

    const isCapture = !!captured;

    if (piece.toLowerCase() === 'p') {
      moveStr = isCapture ? `${files[fromX]}x${to}` : `${to}`;
    } else {
      moveStr = piece.toUpperCase();
      if (isCapture) moveStr += `x`;
      moveStr += to;
    }

    if (promotion) moveStr += `=${promotion.toUpperCase()}`;

    // jeśli to był mat – sprawdź status
    const enemyKing = currentTurn === 'w' ? 'k' : 'K';
    const kingPos = findKing(currentTurn === 'w' ? 'b' : 'w');
    if (isSquareAttacked(kingPos.x, kingPos.y, currentTurn)) {
      const tempHasMoves = hasLegalMoves(currentTurn === 'w' ? 'b' : 'w');
      if (!tempHasMoves) {
        moveStr += "#";
      } else {
        moveStr += "+";
      }
    }
  }

  moveLog.push(moveStr);

  const logList = document.getElementById('logList');
  const li = document.createElement('li');
  li.textContent = moveStr;
  logList.appendChild(li);
  logList.scrollTop = logList.scrollHeight;
}

// Obsługa suwaków poziomu trudności
document.getElementById("difficultyWhite").addEventListener("input", (e) => {
  const val = parseInt(e.target.value);
  botDifficultyW = val;
  document.getElementById("difficultyWhiteValue").innerText = val;
});

document.getElementById("difficultyBlack").addEventListener("input", (e) => {
  const val = parseInt(e.target.value);
  botDifficultyB = val;
  document.getElementById("difficultyBlackValue").innerText = val;
});

function showNotification(message) {
  const notification = document.createElement("div");
  notification.innerText = message;
  notification.style.position = "fixed";
  notification.style.top = "20px";
  notification.style.left = "50%";
  notification.style.transform = "translateX(-50%)";
  notification.style.padding = "10px 20px";
  notification.style.backgroundColor = "#4CAF50";
  notification.style.color = "white";
  notification.style.fontSize = "16px";
  notification.style.borderRadius = "8px";
  notification.style.zIndex = "9999";
  notification.style.boxShadow = "0 2px 6px rgba(0,0,0,0.3)";
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.remove();
  }, 3000); // znika po 3 sekundach
}

function renderBoard() {
  board.innerHTML = '';
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const square = document.createElement('div');
      square.classList.add('square');
      square.classList.add((x + y) % 2 === 0 ? 'white' : 'black');
      square.dataset.x = x;
      square.dataset.y = y;

      // zaznaczenie wybranej figury
      if (selected && selected.x === x && selected.y === y) {
        square.classList.add('selected');
      }

      // podpowiedzi możliwych ruchów
      if (Array.isArray(legalMoves)) {
        for (const move of legalMoves) {
          if (move.x === x && move.y === y) {
            const target = boardState[y][x];
            if (target && pieceColor(target) !== currentTurn) {
              square.classList.add('highlight', 'capture');
            } else {
              square.classList.add('highlight', 'move');
            }
          }
        }
      }

    const piece = boardState[y][x];
    if (piece) {
      const pieceElem = document.createElement('span');
		pieceElem.classList.add('piece');
		const isWhite = piece === piece.toUpperCase();
		pieceElem.setAttribute('data-piece', isWhite ? 'w' + piece : 'b' + piece);

		pieceElem.textContent = pieces[piece];
      square.appendChild(pieceElem);
		}	

      square.addEventListener('click', () => handleClick(x, y));
      board.appendChild(square);
    }
  }
}

function getFEN() {
  let fen = '';
  for (let y = 0; y < 8; y++) {
    let empty = 0;
    for (let x = 0; x < 8; x++) {
      const piece = boardState[y][x];
      if (!piece) {
        empty++;
      } else {
        if (empty > 0) {
          fen += empty;
          empty = 0;
        }
        fen += piece;
      }
    }
    if (empty > 0) fen += empty;
    if (y < 7) fen += '/';
  }

  fen += ` ${currentTurn} - - 0 1`; // uproszczony FEN, bez roszad/en passant – Stockfish sobie poradzi

  return fen;
}

function clearHighlights() {
  document.querySelectorAll('.square.highlight').forEach(el => el.classList.remove('highlight'));
}

function highlightLegalMoves(x, y) {
  if (!boardState[y] || !boardState[y][x]) return [];

  const legalMoves = getLegalMoves(x, y);
  clearHighlights();

  legalMoves.forEach(({ x: mx, y: my }) => {
    const square = document.querySelector(`.square[data-x="${mx}"][data-y="${my}"]`);
    if (square) square.classList.add('highlight');
  });
}

function animatePieceMove(pieceElem, fromSquare, toSquare, duration = 500, callback) {
  const boardEl = document.getElementById('board');
  const fromRect = fromSquare.getBoundingClientRect();
  const toRect = toSquare.getBoundingClientRect();

  const dx = toRect.left - fromRect.left;
  const dy = toRect.top - fromRect.top;

  let baseRotation = boardEl.classList.contains('rotated') ? "rotate(180deg) " : "";

  pieceElem.style.transition = `transform ${duration}ms ease`;
  pieceElem.style.transform = `${baseRotation}translate(${dx}px, ${dy}px)`;

  pieceElem.addEventListener('transitionend', function handler() {
    isAnimationRunning = false;
    pieceElem.style.transition = '';
    pieceElem.style.transform = '';
    pieceElem.removeEventListener('transitionend', handler);

    // Usuń z pola startowego tylko jeśli nadal tam istnieje (unik duplikacji)
    if (fromSquare.contains(pieceElem)) {
      fromSquare.removeChild(pieceElem);
    }

    // Jeśli na polu docelowym coś już jest – usuń (np. przy biciu)
    const existing = toSquare.querySelector('.piece');
    if (existing) {
      toSquare.removeChild(existing);
    }

    toSquare.appendChild(pieceElem);

    if (typeof callback === 'function') {
      callback();
    }
  });
}

function getPromotedPiece() {
  return new Promise(resolve => {
    const buttons = document.querySelectorAll('.promotion-option');
    buttons.forEach(button => {
      button.addEventListener('click', () => {
        resolve(button.dataset.piece);
      }, { once: true });
    });
  });
}

function tryMove(sx, sy, dx, dy, simulate = false, promotion = null, isRemote = false) {
  const piece = boardState[sy][sx];
  const target = boardState[dy][dx];
  
  if (!piece || (target && pieceColor(target) === pieceColor(piece))) return false;
  if (target && target.toLowerCase() === 'k') return false;

  const dxAbs = Math.abs(dx - sx);
  const dyAbs = Math.abs(dy - sy);
  const dirX = Math.sign(dx - sx);
  const dirY = Math.sign(dy - sy);

  const move = (fromY, fromX, toY, toX, newPiece = piece) => {
    boardState[toY][toX] = newPiece;
    boardState[fromY][fromX] = '';
  };

  switch (piece.toLowerCase()) {
    case 'p': {
      const isWhite = piece === 'P';
      const direction = isWhite ? -1 : 1;
      const startRow = isWhite ? 6 : 1;
      const lastRow = isWhite ? 0 : 7;
      const isPromotion = dy === lastRow;
      let newPiece = piece;

      if (isPromotion) {
        const isOurPiece = !simulate && (
          (gameMode === "online" && currentTurn === playerColor) ||
          (gameMode !== "online" && pieceColor(boardState[sy][sx]) === currentTurn)
        );
        if (isOurPiece && !isBotTurn() && !isRemote) {
          promotionContext = { sx, sy, dx, dy, isWhite };
          showPromotionModal(isWhite);
          return "promotion";
        } else {
          if (promotion && !simulate) {
            newPiece = isWhite ? promotion.toUpperCase() : promotion.toLowerCase();
          } else {
            newPiece = promotionContext?.piece
              ? (isWhite ? promotionContext.piece.toUpperCase() : promotionContext.piece.toLowerCase())
              : (isWhite ? 'Q' : 'q');
          }
        }
      }

      if (dx === sx && dy - sy === direction && !target) {
        move(sy, sx, dy, dx, newPiece);
        if (!simulate) enPassantTarget = null;
        break;
      }

      if (sy === startRow &&
          dx === sx &&
          dy - sy === 2 * direction &&
          !boardState[sy + direction][sx] &&
          !boardState[dy][dx]) {
        move(sy, sx, dy, dx, newPiece);
        if (!simulate) enPassantTarget = { x: dx, y: sy + direction };
        break;
      }

      // Bicie pionkiem lub en passant
      if (dxAbs === 1 && dy - sy === direction) {
        // Normalne bicie
        if (target && pieceColor(target) !== pieceColor(piece)) {
          move(sy, sx, dy, dx, newPiece);
          if (!simulate) enPassantTarget = null;
          return true;
        }

        // En passant
        if (
          enPassantTarget &&
          enPassantTarget.x === dx &&
          enPassantTarget.y === dy &&
          boardState[sy][dx] && 
          pieceColor(boardState[sy][dx]) !== pieceColor(piece)
        ) {
          move(sy, sx, dy, dx, newPiece);
          if (!simulate) {
            boardState[sy][dx] = '';
            enPassantTarget = null;
            if (gameMode === "pvb" && !achievements["enpassant"]) {
              window.enPassantCaptured = true;
            }
          }
          return true;
        }
        return false;
      }

      return false;
    }

    case 'n':
      if ((dxAbs === 2 && dyAbs === 1) || (dxAbs === 1 && dyAbs === 2)) {
        move(sy, sx, dy, dx);
        break;
      }
      return false;

    case 'b':
      if (dxAbs === dyAbs && clearPath(sx, sy, dx, dy)) {
        move(sy, sx, dy, dx);
        break;
      }
      return false;

    case 'r':
      if ((sx === dx || sy === dy) && clearPath(sx, sy, dx, dy)) {
        move(sy, sx, dy, dx);
        break;
      }
      return false;

    case 'q':
      if ((sx === dx || sy === dy || dxAbs === dyAbs) && clearPath(sx, sy, dx, dy)) {
        move(sy, sx, dy, dx);
        break;
      }
      return false;

    case 'k': {
      const isWhite = piece === 'K';
      const kingMoved = isWhite ? whiteKingMoved : blackKingMoved;
      const rookMoved = isWhite ? whiteRookMoved : blackRookMoved;

      if (dxAbs <= 1 && dyAbs <= 1) {
        move(sy, sx, dy, dx);
        if (!simulate) {
          if (isWhite) whiteKingMoved = true;
          else blackKingMoved = true;
        }
        break;
      }

      // Krótka roszada
      if (!kingMoved && dx === sx + 2 && sy === dy &&
          boardState[sy][sx + 1] === '' &&
          boardState[sy][sx + 2] === '' &&
          boardState[sy][sx + 3]?.toLowerCase() === 'r' &&
          !rookMoved[1] &&
          !isSquareAttacked(sx, sy, isWhite ? 'b' : 'w') &&
          !isSquareAttacked(sx + 1, sy, isWhite ? 'b' : 'w') &&
          !isSquareAttacked(sx + 2, sy, isWhite ? 'b' : 'w')) {

        if (!simulate && gameMode === "pvb" && !achievements["castling"]) {
          window.castlingCaptured = true;
        }

        if (!simulate) {
          boardState[sy][sx + 2] = piece;
          boardState[sy][sx + 1] = boardState[sy][sx + 3];
          boardState[sy][sx] = '';
          boardState[sy][sx + 3] = '';
          if (isWhite) {
            whiteKingMoved = true;
            whiteRookMoved[1] = true;
          } else {
            blackKingMoved = true;
            blackRookMoved[1] = true;
          }
        } else {
          move(sy, sx, dy, dx);
        }
        return true;
      }

      // Długa roszada
      if (!kingMoved && dx === sx - 2 && sy === dy &&
          boardState[sy][sx - 1] === '' &&
          boardState[sy][sx - 2] === '' &&
          boardState[sy][sx - 3] === '' &&
          boardState[sy][sx - 4]?.toLowerCase() === 'r' &&
          !rookMoved[0] &&
          !isSquareAttacked(sx, sy, isWhite ? 'b' : 'w') &&
          !isSquareAttacked(sx - 1, sy, isWhite ? 'b' : 'w') &&
          !isSquareAttacked(sx - 2, sy, isWhite ? 'b' : 'w')) {

        if (!simulate && gameMode === "pvb" && !achievements["castling"]) {
          window.castlingCaptured = true;
        }

        if (!simulate) {
          boardState[sy][sx - 2] = piece;
          boardState[sy][sx - 1] = boardState[sy][sx - 4];
          boardState[sy][sx] = '';
          boardState[sy][sx - 4] = '';
          if (isWhite) {
            whiteKingMoved = true;
            whiteRookMoved[0] = true;
          } else {
            blackKingMoved = true;
            blackRookMoved[0] = true;
          }
        } else {
          move(sy, sx, dy, dx);
        }
        return true;
      }

      return false;
    }
  }

  if (simulate) {
    const tempColor = pieceColor(piece);
    const king = findKing(tempColor);
    if (isSquareAttacked(king.x, king.y, tempColor === 'w' ? 'b' : 'w')) {
      return false;
    }
  }

  return true;
}


function isBotTurn() {
  return (gameMode === 'pvb' && currentTurn !== playerColor) || gameMode === 'bvb';
}
function getCurrentBotLevel() {
  const difficultySlider = document.getElementById("difficultyPVB");
  return difficultySlider ? parseInt(difficultySlider.value, 10) : 5; // domyślnie 5
}

function updateGameStatus() {
  const msg = document.getElementById("status");
  if (!msg) return;
  msg.classList.remove("showPopup");
  
  const endScreen = document.getElementById("endScreen");
  const endMessage = document.getElementById("endMessage");
  const boardWrapper = document.getElementById("board").parentElement;

  msg.style.display = "block";
  endScreen.style.display = "none";
  boardWrapper.classList.remove("shake", "board-warning");

  const isWhite = currentTurn === 'w';
  const kingSymbol = isWhite ? 'K' : 'k';

  // Znajdź aktualną pozycję króla
  let kingX = -1, kingY = -1;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      if (boardState[y][x] === kingSymbol) {
        kingX = x;
        kingY = y;
      }
    }
  }

  const inCheck = isSquareAttacked(kingX, kingY, isWhite ? 'b' : 'w');

  // Czy ma jakikolwiek legalny ruch?
  let hasLegalMove = false;
  outer:
  for (let sy = 0; sy < 8; sy++) {
    for (let sx = 0; sx < 8; sx++) {
      const piece = boardState[sy][sx];
      if (!piece || pieceColor(piece) !== currentTurn) continue;

      for (let dy = 0; dy < 8; dy++) {
        for (let dx = 0; dx < 8; dx++) {
          const tempBoard = JSON.parse(JSON.stringify(boardState));
          const tempEnPassant = enPassantTarget ? { ...enPassantTarget } : null;

          if (tryMove(sx, sy, dx, dy, true)) {
            boardState = tempBoard;
            enPassantTarget = tempEnPassant;
            hasLegalMove = true;
            break outer;
          }

          boardState = tempBoard;
          enPassantTarget = tempEnPassant;
        }
      }
    }
  }

  // 🔥 Logika zakończenia gry
  if (inCheck && !hasLegalMove) {
    updateStatus("🔥 SZACH-MAT!");
    msg.classList.add("showPopup");

    const mateOverlay = document.getElementById("mateOverlay");
    mateOverlay.classList.remove("show-mate");
    void mateOverlay.offsetWidth;
    mateOverlay.style.display = "flex";
    mateOverlay.classList.add("show-mate");

    setTimeout(() => {
      mateOverlay.classList.remove("show-mate");
      mateOverlay.style.display = "none";
    }, 2500);

    endScreen.style.display = "flex";
    endMessage.textContent = (currentTurn === 'w' ? "Czarne" : "Białe") + " wygrywają!";

    if (gameMode === "pvb") {
      const playerWon = currentTurn !== playerColor;
      window.xpPendingResult = playerWon ? "win" : "loss";
      window.lastMoveLogLength = moveLog.length;
      window.lastMoveLogFinalMove = moveLog.at(-1) ?? "";

      if (typeof window.xpBotLevelAtEnd === "undefined") {
        window.xpBotLevelAtEnd = getCurrentBotLevel();
      }
    window.hasLostPieceFinal = hasLostPiece;
      // 🔥 Przyznaj XP natychmiast po zakończeniu
      awardXP(window.xpPendingResult);
	if (window.xpPendingResult === "win") {
  	updateStatsOnWin();
        }

      delete window.xpPendingResult;
    }


    gameEnded = true;

  } else if (!inCheck && !hasLegalMove) {
    updateStatus("🤝 PAT – REMIS");
    msg.classList.add("showPopup");

    endScreen.style.display = "block";
    endMessage.textContent = "Partia zakończona remisem.";

    if (gameMode === "pvb") {
      window.xpPendingResult = "draw";
      window.xpBotLevelAtEnd = getCurrentBotLevel();

      // 🔥 Przyznaj XP natychmiast po remisie
      awardXP(window.xpPendingResult);
      delete window.xpPendingResult;
    }

    gameEnded = true;

  } else if (inCheck && hasLegalMove) {
    updateStatus("🚨 SZACH dla " + (currentTurn === 'w' ? "białych" : "czarnych") + "!");
    msg.classList.add("showPopup");
    boardWrapper.classList.add("shake", "board-warning");
    setTimeout(() => {
      boardWrapper.classList.remove("shake", "board-warning");
    }, 500);

  } else {
    updateStatus("Ruch: " + (currentTurn === 'w' ? "biały" : "czarny"));
  }
}


function updateStatus(newText) {
  const msg = document.getElementById("status");

  // Zanim zniknie, odtwórz statusPopOut
  msg.style.animation = "none";
  void msg.offsetWidth;
  msg.style.animation = "statusPopOut 0.3s ease-out";

  setTimeout(() => {
    msg.innerText = newText;

    // Reset animacji wejścia
    msg.style.animation = "none";
    void msg.offsetWidth;
    msg.style.animation = "statusPop 0.3s ease-out";
  }, 300);
}


function updateBotLabels() {
  const topBotLabel = document.getElementById("topBotLabel");
  const bottomBotLabel = document.getElementById("bottomBotLabel");

  if (!topBotLabel || !bottomBotLabel) return;

  topBotLabel.style.display = "none";
  bottomBotLabel.style.display = "none";

  if (gameMode === "bvb") {
    topBotLabel.textContent = `🤖 Bot (czarny) – poziom ${botDifficultyB}`;
    bottomBotLabel.textContent = `🤖 Bot (biały) – poziom ${botDifficultyW}`;
    topBotLabel.style.display = "block";
    bottomBotLabel.style.display = "block";
  } else if (gameMode === "pvb") {
    const botSide = playerColor === "w" ? "czarny" : "biały";
	const skill = botSide === "czarny" ? botDifficultyB : botDifficultyW;
	const skillName = difficultyNames[skill] || `Poziom ${skill}`;
	topBotLabel.textContent = `🤖 Bot (${botSide}) – ${skillName}`;

	// Zmieniamy kolor tak jak w PvB
	for (let i = 0; i <= 10; i++) {
	  topBotLabel.classList.remove(`difficulty-color-${i}`);
	}
	topBotLabel.classList.add(`difficulty-color-${skill}`);

	// Usuń poprzedni efekt glitch (jeśli był)
	topBotLabel.classList.remove("glitch");

	// Glitch tylko dla poziomu 10 (???)
	if (skill === 10) {
	  topBotLabel.classList.add("glitch", "glitch-glow");
	  startGlitchNames();
	} else {
	  topBotLabel.classList.remove("glitch", "glitch-glow");
	  stopGlitchNames();
	}
	// Styl epickiej etykiety tylko dla poziomów 9 (Hell) i 10 (???)
	if (skill >= 9) {
	  topBotLabel.classList.add("epic");
	} else {
	  topBotLabel.classList.remove("epic");
	}

    topBotLabel.style.display = "block";
    bottomBotLabel.style.display = "none";
  }
}


function getPseudoLegalMoves(x, y) {
  const piece = boardState[y][x];
  if (!piece) return [];

  const moves = [];
  const color = pieceColor(piece);
  const opponent = color === 'w' ? 'b' : 'w';
  const dir = color === 'w' ? -1 : 1;

  const push = (dx, dy) => {
    if (dx >= 0 && dx < 8 && dy >= 0 && dy < 8) {
      const target = boardState[dy][dx];
      if (!target || pieceColor(target) !== color) {
        moves.push({ x: dx, y: dy });
      }
    }
  };

  if (piece.toLowerCase() === 'p') {
    const forwardY = y + dir;
    if (!boardState[forwardY]?.[x]) moves.push({ x, y: forwardY });
    if ((color === 'w' && y === 6) || (color === 'b' && y === 1)) {
      const doubleY = y + dir * 2;
      if (!boardState[forwardY]?.[x] && !boardState[doubleY]?.[x]) {
        moves.push({ x, y: doubleY });
      }
    }
    // Bicia
    for (const dx of [-1, 1]) {
      const cx = x + dx;
      const cy = y + dir;
      if (cx >= 0 && cx < 8 && cy >= 0 && cy < 8) {
        const target = boardState[cy][cx];
        if (target && pieceColor(target) === opponent) {
          moves.push({ x: cx, y: cy });
        }
        // 🔥 En passant
        if (
          enPassantTarget &&
          enPassantTarget.x === cx &&
          enPassantTarget.y === cy
        ) {
          moves.push({ x: cx, y: cy });
        }
      }
    }
  } else if (piece.toLowerCase() === 'n') {
    for (const [dx, dy] of [[-2, -1], [-1, -2], [1, -2], [2, -1],
                            [2, 1], [1, 2], [-1, 2], [-2, 1]]) {
      const cx = x + dx, cy = y + dy;
      if (cx >= 0 && cx < 8 && cy >= 0 && cy < 8) {
        const target = boardState[cy][cx];
        if (!target || pieceColor(target) === opponent) {
          moves.push({ x: cx, y: cy });
        }
      }
    }
  } else if (piece.toLowerCase() === 'b' || piece.toLowerCase() === 'q') {
    for (const [dx, dy] of [[1,1],[1,-1],[-1,1],[-1,-1]]) {
      for (let i = 1; i < 8; i++) {
        const cx = x + dx * i, cy = y + dy * i;
        if (cx < 0 || cy < 0 || cx >= 8 || cy >= 8) break;
        const target = boardState[cy][cx];
        if (!target) moves.push({ x: cx, y: cy });
        else {
          if (pieceColor(target) === opponent) moves.push({ x: cx, y: cy });
          break;
        }
      }
    }
  }

  if (piece.toLowerCase() === 'r' || piece.toLowerCase() === 'q') {
    for (const [dx, dy] of [[0,1],[1,0],[-1,0],[0,-1]]) {
      for (let i = 1; i < 8; i++) {
        const cx = x + dx * i, cy = y + dy * i;
        if (cx < 0 || cy < 0 || cx >= 8 || cy >= 8) break;
        const target = boardState[cy][cx];
        if (!target) moves.push({ x: cx, y: cy });
        else {
          if (pieceColor(target) === opponent) moves.push({ x: cx, y: cy });
          break;
        }
      }
    }
  }

if (piece.toLowerCase() === 'k') {
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx !== 0 || dy !== 0) {
        const cx = x + dx, cy = y + dy;
        if (cx >= 0 && cx < 8 && cy >= 0 && cy < 8) {
          const target = boardState[cy][cx];
          if (!target || pieceColor(target) !== color) {
            moves.push({ x: cx, y: cy });
          }
        }
      }
    }
  }

  // 🔥 Roszada (uwzględniona tylko jako podpowiedź)
  const isWhite = color === 'w';
  const sy = isWhite ? 7 : 0;
  const kingMoved = isWhite ? whiteKingMoved : blackKingMoved;
  const rookMoved = isWhite ? whiteRookMoved : blackRookMoved;

  if (!kingMoved) {
    // Krótka roszada (g6)
    if (
      !rookMoved[1] &&
      !boardState[sy][5] &&
      !boardState[sy][6] &&
      !isSquareAttacked(4, sy, opponent) &&
      !isSquareAttacked(5, sy, opponent) &&
      !isSquareAttacked(6, sy, opponent)
    ) {
      moves.push({ x: 6, y: sy });
    }

    // Długa roszada (c1 / c8)
    if (
      !rookMoved[0] &&
      !boardState[sy][1] &&
      !boardState[sy][2] &&
      !boardState[sy][3] &&
      !isSquareAttacked(4, sy, opponent) &&
      !isSquareAttacked(3, sy, opponent) &&
      !isSquareAttacked(2, sy, opponent)
    ) {
      moves.push({ x: 2, y: sy });
    }
  }
}

  return moves;
}

// ⚠️ Ta funkcja ma zastąpić Twoją aktualną wersję getLegalMoves
function getLegalMoves(x, y) {
  const piece = boardState[y][x];
  if (!piece || pieceColor(piece) !== currentTurn) return [];

  const pseudoMoves = getPseudoLegalMoves(x, y);
  const legalMoves = [];

  for (const move of pseudoMoves) {
    const dx = move.x;
    const dy = move.y;

    // 🔁 Zapisz aktualny stan
    const tempBoard = JSON.parse(JSON.stringify(boardState));
    const tempEnPassant = enPassantTarget ? { ...enPassantTarget } : null;

    const moved = tryMove(x, y, dx, dy, true); // 🧠 simulate = true

    // 🔁 Przywróć planszę
    boardState = tempBoard;
    enPassantTarget = tempEnPassant;

    if (moved) {
      legalMoves.push({ x: dx, y: dy });
    }
  }

  return legalMoves;
}

function hasLegalMoves(color) {
  for (let sy = 0; sy < 8; sy++) {
    for (let sx = 0; sx < 8; sx++) {
      const piece = boardState[sy][sx];
      if (!piece || pieceColor(piece) !== color) continue;

      const legal = getLegalMoves(sx, sy);
      if (legal.length > 0) return true;
    }
  }
  return false;
}


function getCaptureMoves(sx, sy) {
  const allMoves = getLegalMoves(sx, sy);
  // Ruchy, w których docelowa komórka nie jest pusta, traktujemy jako bicie
  return allMoves.filter(move => boardState[move.y][move.x] !== '');
}

function getAllMoves(color) {
  let moves = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const piece = boardState[y][x];
      if (piece && pieceColor(piece) === color) {
        const legal = getLegalMoves(x, y);
        legal.forEach(move => {
          moves.push({ sx: x, sy: y, dx: move.x, dy: move.y });
        });
      }
    }
  }
  // Sortowanie ruchów – na przykład: ruchy, w których zbija się figurę o wyższej wartości, są pierwsze.
  moves.sort((a, b) => {
    let pieceA = boardState[a.dy][a.dx];
    let pieceB = boardState[b.dy][b.dx];
    return evaluatePiece(pieceB) - evaluatePiece(pieceA);
  });
  return moves;
}

function pieceColor(p) {
  return p === p.toUpperCase() ? 'w' : 'b';
}
function updateCapturedDisplay() {
  const pieceOrder = ["Q", "R", "B", "N", "P"];
  const whiteBox = document.getElementById("capturedByWhite");
  const blackBox = document.getElementById("capturedByBlack");
  whiteBox.innerHTML = "";
  blackBox.innerHTML = "";

  // Kto na górze, kto na dole
  let topColor, bottomColor;

  if (gameMode === 'online') {
    topColor = playerColor === 'w' ? 'b' : 'w';
    bottomColor = playerColor;
  } else if (gameMode === 'pvb') {
    topColor = playerColor === 'w' ? 'b' : 'w';
    bottomColor = playerColor;
  } else {
    topColor = 'b';
    bottomColor = 'w';
  }  

  const topCaptured = topColor === 'w' ? capturedByWhite : capturedByBlack;
  const bottomCaptured = bottomColor === 'w' ? capturedByWhite : capturedByBlack;

  const topPrevious = topColor === 'w' ? previousCapturedByWhite : previousCapturedByBlack;
  const bottomPrevious = bottomColor === 'w' ? previousCapturedByWhite : previousCapturedByBlack;

  for (const piece of pieceOrder) {
    const topCount = topCaptured[piece] || 0;
    const bottomCount = bottomCaptured[piece] || 0;

    const topSymbol = topColor === 'w' ? pieces[piece] : pieces[piece.toLowerCase()];
    const bottomSymbol = bottomColor === 'w' ? pieces[piece] : pieces[piece.toLowerCase()];

    const topContainer = document.createElement("div");
    topContainer.classList.add("captured-icon");
    topContainer.innerHTML = `
      <span class="captured-symbol">${topSymbol}</span>
      <span class="captured-count">${topCount}</span>
    `;
    if ((topPrevious[piece] || 0) !== topCount) {
      topContainer.classList.add("pulse");
      setTimeout(() => topContainer.classList.remove("pulse"), 400);
    }
    blackBox.appendChild(topContainer);

    const bottomContainer = document.createElement("div");
    bottomContainer.classList.add("captured-icon");
    bottomContainer.innerHTML = `
      <span class="captured-symbol">${bottomSymbol}</span>
      <span class="captured-count">${bottomCount}</span>
    `;
    if ((bottomPrevious[piece] || 0) !== bottomCount) {
      bottomContainer.classList.add("pulse");
      setTimeout(() => bottomContainer.classList.remove("pulse"), 400);
    }
    whiteBox.appendChild(bottomContainer);
  }

  // Zapisz nowy stan jako poprzedni
  previousCapturedByWhite = { ...capturedByWhite };
  previousCapturedByBlack = { ...capturedByBlack };
}

function handleClick(x, y) {
  console.log("🔍 currentTurn:", currentTurn, "| playerColor:", playerColor, "| isInputLocked:", isInputLocked);
  if (gameMode === "online" && currentTurn !== playerColor) {
    console.log("⛔ To nie Twoja tura!");
    return;
  } 
  console.log("tura: ", currentTurn);
  if (isAnimationRunning) {
    console.log("⏳ Animacja trwa – klik zablokowany");
    return;
  }  
   
  if (isInputLocked) return;

  const piece = boardState[y][x];
  clearHighlights();

  if (!selected) {
    if (!piece || pieceColor(piece) !== currentTurn) return;
    selected = { x, y };
    legalMoves = getLegalMoves(x, y);
    renderBoard();
    highlightLegalMoves(x, y);
    return;
  }

  const { x: sx, y: sy } = selected;

  if (sx === x && sy === y) {
    selected = null;
    legalMoves = [];
    renderBoard();
    return;
  }

  if (piece && pieceColor(piece) === currentTurn) {
    selected = { x, y };
    legalMoves = getLegalMoves(x, y);
    renderBoard();
    highlightLegalMoves(x, y);
    return;
  }

  const moveIsLegal = legalMoves.some(m => m.x === x && m.y === y);
  if (!moveIsLegal) {
    selected = null;
    legalMoves = [];
    renderBoard();
    return;
  }

  const attackerPiece = boardState[sy][sx];
  const victimPiece = boardState[y][x];
  if (victimPiece && pieceColor(victimPiece) === playerColor && victimPiece.toLowerCase() !== 'p') {
  hasLostPiece = true; // 🔥 straciłeś figurę (ale nie pionka)
  }

// 🔄 ONLINE – zanim wyślemy, spraadź czy promocja
if (gameMode === "online") {
  if (currentTurn !== playerColor) return;
  if (isInputLocked) {
    console.log("🔒 Zablokowane wejście – oczekuję na zakończenie animacji");
    return;
  }

  const result = tryMove(sx, sy, x, y, false); // ⚠️ użyj tryMove ZANIM coś wyślesz

  if (result === "promotion") {
    // ✅ Poczekaj na handlePromotionChoice()
    return;
  }

  isInputLocked = true;
  console.log("📤 Wysyłam ruch do pokoju:", currentRoomCode);

  lastSentMove = JSON.parse(JSON.stringify({
    from: { x: sx, y: sy },
    to: { x, y },
    promotion: promotionContext?.piece || null,
    attackerPiece,
    victimPiece,
  }));

  socket.emit("move", {
    roomCode: currentRoomCode || document.getElementById("roomCodeInput")?.value.trim().toUpperCase(),
    from: { x: sx, y: sy },
    to: { x, y },
    promotion: promotionContext?.piece || null,
    senderId: socketId,
  });

  selected = null;
  legalMoves = [];
  return;
}

  // 🔄 POZOSTAŁE TRYBY (lokalne, PvB, PvP)
  const result = tryMove(sx, sy, x, y);
  if (result === "promotion") return;

  if (result === true) {
    isInputLocked = true;

    const fromSquare = document.querySelector(`.square[data-x="${sx}"][data-y="${sy}"]`);
    const toSquare = document.querySelector(`.square[data-x="${x}"][data-y="${y}"]`);
    const pieceElem = fromSquare?.querySelector('.piece');
    const movedPiece = boardState[y][x];

    if (victimPiece && victimPiece.toLowerCase() !== 'k') {
      const color = pieceColor(attackerPiece);
      const type = victimPiece.toUpperCase();
      if (color === 'w') capturedByWhite[type]++;
      else capturedByBlack[type]++;
      updateCapturedDisplay();
    }

    logMove(sx, sy, x, y, movedPiece, victimPiece || '');

const onFinish = () => {
  currentTurn = currentTurn === 'w' ? 'b' : 'w';
  renderBoard();
  updateGameStatus();
  
  // 🔥 DODAJ TEN FRAGMENT:
  if (gameMode === "pvb") {
    (async () => {
      const users = await getUsers();

      if (window.castlingCaptured) {
        unlockAchievement("castling", users);
        window.castlingCaptured = false;
      }
      if (window.enPassantCaptured) {
        unlockAchievement("enpassant", users);
        window.enPassantCaptured = false;
      }
    })();
  }

  updateEvaluationBar();
  isInputLocked = false;

  if (gameMode === "pvb" && currentTurn !== playerColor) {
    setTimeout(runAIMove, 500);
  } else if (gameMode === "bvb") {
    setTimeout(runBotVsBot, 500);
  }
};

    if (pieceElem && fromSquare && toSquare) {
      animatePieceMove(pieceElem, fromSquare, toSquare, 500, onFinish);
    } else {
      onFinish();
    }
  }

  selected = null;
  legalMoves = [];
}


function clearPath(sx, sy, dx, dy) {
  const dirX = Math.sign(dx - sx);
  const dirY = Math.sign(dy - sy);
  let x = sx + dirX;
  let y = sy + dirY;
  
  while (x !== dx || y !== dy) {
    // Sprawdź, czy współrzędne są w zakresie
    if (x < 0 || x >= 8 || y < 0 || y >= 8) return false;
    if (boardState[y][x] !== '') return false;
    x += dirX;
    y += dirY;
  }
  return true;
}

function evaluateBoard() {
  const values = {
    'p': 10, 'n': 30, 'b': 30, 'r': 50, 'q': 90, 'k': 900,
    'P': 10, 'N': 30, 'B': 30, 'R': 50, 'Q': 90, 'K': 900
  };

  let score = 0;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const piece = boardState[y][x];
      if (piece) {
        // Dodaj wartość, jeśli biała, odejmij jeśli czarna
        score += (piece === piece.toUpperCase() ? values[piece] : -values[piece]);
      }
    }
  }
  return score;
}

function evaluatePiece(piece) {
  // Używamy standardowych wartości (pion = 1, skoczek = 3, goniec = 3, wieża = 5, hetman = 9, król = 4 lub 5)
  // Król nie powinien być zbierany, ale przydatny do porównań w QS – tutaj przyjmujemy 4.
  const values = {
    'p': 1,
    'n': 3,
    'b': 3,
    'r': 5,
    'q': 9,
    'k': 4
  };
  return values[piece.toLowerCase()] || 0;
}

function resetStockfishPVBWorker() {
  console.log("🔁 [resetStockfishPVBWorker] Restartuję worker PvB");
  if (stockfishPVBWorker) stockfishPVBWorker.terminate();

  stockfishPVBWorker = new Worker("stockfish.js");

  stockfishPVBWorker.onmessage = function (e) {
    const line = String(e.data);
    console.log("📨 [Stockfish PvB] Odebrano:", line);
    const bestMoves = window._botBestMoves ?? [];

    if (line.includes("uciok")) {
      console.log("✅ [Stockfish PvB] Gotowy – wysyłam pozycję i go");
      const fen = getFEN();
      const level = botColor === 'w' ? botDifficultyW : botDifficultyB;
      const depthMap = [1,1,1,2,2,3,4,6,8,10,12];
      const multiPVMap = [10,10,7,6,5,4,3,2,2,1,1];
      const depth = depthMap[level];
      const multiPV = multiPVMap[level];

      stockfishPVBWorker.postMessage(`setoption name MultiPV value ${multiPV}`);
      stockfishPVBWorker.postMessage(`position fen ${fen}`);
      stockfishPVBWorker.postMessage(`go depth ${depth}`);
    }

    if (line.startsWith("info") && line.includes(" pv ")) {
      const move = line.split(" pv ")[1].split(" ")[0];
      if (move && !bestMoves.includes(move)) {
        bestMoves.push(move);
        isInputLocked = false;
      }
    }

    if (line.startsWith("bestmove")) {
      console.log("✅ [Stockfish PvB] bestmove:", line);
      const move = bestMoves[0] || line.split(" ")[1];
      if (!move || move === "(none)") return;

      const sx = move.charCodeAt(0) - 97;
      const sy = 8 - parseInt(move[1]);
      const dx = move.charCodeAt(2) - 97;
      const dy = 8 - parseInt(move[3]);

      const fromSquareElem = document.querySelector(`.square[data-x="${sx}"][data-y="${sy}"]`);
      const toSquareElem = document.querySelector(`.square[data-x="${dx}"][data-y="${dy}"]`);
      const pieceElem = fromSquareElem?.querySelector('.piece');

      const tempBoard = JSON.parse(JSON.stringify(boardState));
      tryMove(sx, sy, dx, dy, false);

      const movedPiece = boardState[dy][dx];
      const attackerPiece = tempBoard[sy][sx];
      const victimPiece = tempBoard[dy][dx];

      if (victimPiece && victimPiece.toLowerCase() !== 'k') {
        const color = pieceColor(attackerPiece);
        const type = victimPiece.toUpperCase();
        if (color === 'w') capturedByWhite[type]++;
        else capturedByBlack[type]++;
        updateCapturedDisplay();
      }

      logMove(sx, sy, dx, dy, movedPiece, victimPiece || '');
      currentTurn = currentTurn === 'w' ? 'b' : 'w';

      const onFinish = () => {
        renderBoard();
        updateGameStatus();
        updateEvaluationBar();
      };

      if (pieceElem) {
        animatePieceMove(pieceElem, fromSquareElem, toSquareElem, 500, () => {
          setTimeout(onFinish, 0);
        });
      } else {
        console.warn("❌ [Bot] Nie znaleziono figury do animacji – wykonuję bez animacji");
        onFinish();
      }

      window._botBestMoves = [];
    }
  };
}


function runAIMove() {
  if (gameEnded || gameMode !== "pvb") return;
console.log("🤖 [runAIMove] Wywołano – gameEnded:", gameEnded, "| currentTurn:", currentTurn, "| playerColor:", playerColor, "| botColor:", botColor);
  // zainicjalizuj listę najlepszych ruchów globalnie
  window._botBestMoves = [];

if (!stockfishPVBWorker) {
  resetStockfishPVBWorker();
  setTimeout(() => {
    stockfishPVBWorker.postMessage("uci");
  }, 100); // 100ms bufor na zainicjalizowanie workera
} else {
  stockfishPVBWorker.postMessage("uci");
}
}
  // Obsługa wyboru koloru
document.getElementById('chooseWhite').addEventListener('click', function() {
  playerColor = 'w';
  botColor = 'b';
  // Podświetl wybrany przycisk:
  this.classList.add('selected');
  document.getElementById('chooseBlack').classList.remove('selected');
  document.getElementById('startGame').disabled = false;
});

document.getElementById('chooseBlack').addEventListener('click', function() {
  playerColor = 'b';
  botColor = 'w';
  // Podświetl wybrany przycisk:
  this.classList.add('selected');
  document.getElementById('chooseWhite').classList.remove('selected');
  document.getElementById('startGame').disabled = false;
});

function toggleModeButtons(activeButton) {
  ["modePVP", "modePVB", "modeBVB"].forEach(id => {
    document.getElementById(id).classList.remove("selected");
  });
  if (activeButton) activeButton.classList.add("selected");

  const colorButtons = document.getElementById("colorButtons");
  const difficultyPVB = document.getElementById("difficultyPVBContainer");
  const difficultyBVB = document.getElementById("difficultyBVBContainer");

  colorButtons.style.display = "none";
  difficultyPVB.style.display = "none";
  difficultyBVB.style.display = "none";

  if (gameMode === "pvb") {
    colorButtons.style.display = "flex";
    difficultyPVB.style.display = "block";
  } else if (gameMode === "bvb") {
    difficultyBVB.style.display = "block";
  }

  document.getElementById("startGame").disabled = (gameMode === "pvb" && !playerColor);
}

function updateStartGameButton() {
  const startGameBtn = document.getElementById("startGame");

  if (gameMode === "pvp") {
    if (pvpSubmode === "hotseat") {
      startGameBtn.style.display = "block";
      startGameBtn.disabled = false;
    } else if (pvpSubmode === "online") {
      startGameBtn.style.display = "none";
    } else {
      startGameBtn.style.display = "block";
      startGameBtn.disabled = true;
    }
  } else if (gameMode === "pvb" || gameMode === "bvb") {
    startGameBtn.style.display = "block";
    startGameBtn.disabled = !playerColor; // tylko blokuj, jeśli nie wybrano koloru
  } else {
    startGameBtn.style.display = "block";
    startGameBtn.disabled = true; // domyślnie zablokowany
  }
}
  
// Tryb gry – Gracz vs Gracz
document.getElementById("modePVP").addEventListener("click", () => {
  const alreadyActive = gameMode === "pvp";

	if (alreadyActive) {
	  gameMode = null;
	  toggleModeButtons(null);
	  startShiftReset();
	  lastGameMode = null;

	  // 🔧 Schowaj wszystko związane z PvP
	  document.getElementById("pvpSubmodeButtons").style.display = "none";
	  document.getElementById("onlineUI").style.display = "none";
	  document.getElementById("chooseOnline").classList.remove("selected");
	  document.getElementById("chooseHotseat").classList.remove("selected");
	  document.getElementById("startGame").disabled = true;
	  return;
	}



  gameMode = "pvp";
  toggleModeButtons(document.getElementById("modePVP"));

  // 📌 Pokaż subopcji PvP natychmiast
  document.getElementById("pvpSubmodeButtons").style.display = "flex";
  document.getElementById("colorButtons").style.display = "none";
  document.getElementById("difficultyPVBContainer").style.display = "none";
  document.getElementById("difficultyBVBContainer").style.display = "none";

  // 📌 Uruchom przesunięcie UI bez opóźnienia
  startShiftReset();
  startShiftTo("pvp");
  document.getElementById("startGame").disabled = true;
  updateStartGameButton();
});


document.getElementById("chooseHotseat").addEventListener("click", () => {
  if (pvpSubmode === "hotseat") {
    // 🔁 Odklikuję hotseat
    pvpSubmode = null;
    document.getElementById("chooseHotseat").classList.remove("selected");
    document.getElementById("startGame").disabled = true;
    return;
  }

  pvpSubmode = "hotseat";
  document.getElementById("chooseHotseat").classList.add("selected");
  document.getElementById("chooseOnline").classList.remove("selected");
  document.getElementById("onlineUI").style.display = "none";
  document.getElementById("startGame").disabled = false;
  updateStartGameButton();
});


document.getElementById("chooseOnline").addEventListener("click", () => {
  if (pvpSubmode === "online") {
    // 🔁 Odklikuję online
    pvpSubmode = null;
    document.getElementById("chooseOnline").classList.remove("selected");
    document.getElementById("onlineUI").style.display = "none";
    document.getElementById("startGame").disabled = true;
    return;
  }

  pvpSubmode = "online";
  document.getElementById("chooseOnline").classList.add("selected");
  document.getElementById("chooseHotseat").classList.remove("selected");
  document.getElementById("onlineUI").style.display = "flex";
  document.getElementById("startGame").disabled = false;
  updateStartGameButton();
});


// Tryb gry – Gracz vs Bot
document.getElementById("modePVB").addEventListener("click", () => {
  document.getElementById("pvpSubmodeButtons").style.display = "none";
  document.getElementById("onlineUI").style.display = "none";
  const alreadyActive = gameMode === "pvb";
  if (alreadyActive) {
    gameMode = null;
    toggleModeButtons(null);
    startShiftReset();
    lastGameMode = null;
    document.getElementById("startGame").disabled = true; // 🔧 dodane
    return;
  }


  gameMode = "pvb";
  toggleModeButtons(document.getElementById("modePVB"));

  startShiftTo("pvb");
  updateStartGameButton();
  document.getElementById("modePVB").classList.add("selected");
  document.getElementById("modePVP").classList.remove("selected");
  document.getElementById("modeBVB").classList.remove("selected");

  document.getElementById("colorButtons").style.display = "flex";
  document.getElementById("difficultyPVBContainer").style.display = "block";
  document.getElementById("difficultyBVBContainer").style.display = "none";
  document.getElementById("startGame").disabled = true;
  // Ustaw kolor i nazwę trudności od razu po wejściu do PvB
	const val = parseInt(document.getElementById("difficultyPVB").value, 10);
	const pvblabel = document.getElementById("difficultyPVBName");
	if (val === 10) {
	  pvblabel.classList.add("glitch", "glitch-glow");
	  startGlitchNames();
	} else {
	  pvblabel.classList.remove("glitch", "glitch-glow");
	  stopGlitchNames();
	}
	const name = difficultyNames[val] || `Poziom ${val}`;
	const nameElem = document.getElementById("difficultyPVBName");

	for (let i = 0; i <= 10; i++) {
	  nameElem.classList.remove(`difficulty-color-${i}`);
	}
	nameElem.innerText = name;
	nameElem.classList.add(`difficulty-color-${val}`);

	document.getElementById("difficultyPVBDesc").innerText = difficultyDescriptions[val] || "";
});

// Tryb gry – Bot vs Bot
document.getElementById("modeBVB").addEventListener("click", () => {
  document.getElementById("pvpSubmodeButtons").style.display = "none";
  document.getElementById("onlineUI").style.display = "none";
  const alreadyActive = gameMode === "bvb";
  if (alreadyActive) {
    gameMode = null;
    toggleModeButtons(null);
    startShiftReset();
	document.getElementById("startGame").disabled = true; // 🔧 dodane
    lastGameMode = null;
    return;
  }

  gameMode = "bvb";
  toggleModeButtons(document.getElementById("modeBVB"));

  startShiftTo("bvb");
  updateStartGameButton();
  document.getElementById("modeBVB").classList.add("selected");
  document.getElementById("modePVB").classList.remove("selected");
  document.getElementById("modePVP").classList.remove("selected");

  document.getElementById("colorButtons").style.display = "none";
  document.getElementById("difficultyPVBContainer").style.display = "none";
document.getElementById("difficultyBVBContainer").style.display = "block";
document.getElementById("difficultyWhite").style.display = "inline-block";
document.getElementById("difficultyBlack").style.display = "inline-block";
document.getElementById("difficultyWhiteValue").style.display = "inline";
document.getElementById("difficultyBlackValue").style.display = "inline";

document.querySelector('label[for="difficultyWhite"]').style.display = "inline";
document.querySelector('label[for="difficultyBlack"]').style.display = "inline";
document.getElementById("startGame").disabled = false;
});


const startBox = document.querySelector(".start-box");
const startLogo = document.getElementById("startLogo");
let lastGameMode = null;

function startShiftReset() {
  startBox.style.transition = "transform 0.4s ease, scale 0.4s ease";
  startLogo.style.transition = "transform 0.4s ease, scale 0.4s ease";
  startBox.style.transform = "translateY(0) scale(1)";
  startLogo.style.transform = "translateY(0) scale(1)";
  document.getElementById("startGame").style.display = "block";
  document.getElementById("startGame").disabled = true;
}

function startShiftTo(mode) {
  startBox.style.transition = "transform 0.4s ease";
  startLogo.style.transition = "transform 0.4s ease";

  const height = window.innerHeight;

  const configs = {
    small: {
      pvb: { box: "-14vh", logo: "-7vh" },
      bvb: { box: "-11vh", logo: "-7vh" }
    },
    medium: {
      pvb: { box: "-17vh", logo: "-9vh" },
      bvb: { box: "-14vh", logo: "-9vh" }
    },
    large: {
      pvb: { box: "-20vh", logo: "-12vh" },
      bvb: { box: "-18vh", logo: "-12vh" }
    }
  };

  let profile;

  if (height <= 768) {
    profile = configs.small;
  } else if (height <= 900) {
    profile = configs.medium;
  } else {
    profile = configs.large;
  }

	if (mode === "pvb") {
	  const scale = (height <= 768) ? " scale(0.9)" : "";
	  startBox.style.transform = `translateY(${profile.pvb.box})${scale}`;
	  startLogo.style.transform = `translateY(${profile.pvb.logo})${scale}`;
	} else if (mode === "bvb") {
	  const scale = (height <= 768) ? " scale(0.9)" : "";
	  startBox.style.transform = `translateY(${profile.bvb.box})${scale}`;
	  startLogo.style.transform = `translateY(${profile.bvb.logo})${scale}`;
	} else if (mode === "pvp") {
	  const scale = (height <= 768) ? " scale(0.9)" : "";
	  startBox.style.transform = `translateY(${profile.pvb.box})${scale}`;
	  startLogo.style.transform = `translateY(${profile.pvb.logo})${scale}`;
}

// ⬇️ Zawsze zapamiętuj tryb, niezależnie od tego, czy to pierwszy raz
lastGameMode = mode;
}


function runBotVsBot() {
  if (gameEnded || isBotRunning || gameMode !== "bvb") return;
  isBotRunning = true;

  const fen = getFEN();
  const level = currentTurn === 'w' ? botDifficultyW : botDifficultyB;

  const depthMap = [1, 1, 2, 3, 4, 5, 6, 7, 9, 11, 13];
  const multiPVMap = [10, 10, 7, 6, 5, 4, 3, 2, 2, 1, 1];
  const errorChanceMap = [0.95, 0.8, 0.6, 0.45, 0.3, 0.2, 0.15, 0.1, 0.05, 0.01, 0];

  const depth = depthMap[level];
  const multiPV = multiPVMap[level];
  const errorChance = errorChanceMap[level];
  const bestMoves = [];

  stockfishBVBWorker.postMessage("uci");

	stockfishBVBWorker.onmessage = function (e) {
    const line = String(e.data);

    if (line.includes("uciok")) {
      stockfishBVBWorker.postMessage(`setoption name MultiPV value ${multiPV}`);
      stockfishBVBWorker.postMessage(`position fen ${fen}`);
      stockfishBVBWorker.postMessage(`go depth ${depth}`);
    }

    if (line.startsWith("info") && line.includes(" pv ")) {
      const move = line.split(" pv ")[1].split(" ")[0];
      if (move && !bestMoves.includes(move)) {
        bestMoves.push(move);
      }
    }

    if (line.startsWith("bestmove")) {
      let chosenMove;

      if (line.includes("bestmove (none)")) return;

      if (bestMoves.length === 0) {
        chosenMove = line.split(" ")[1];
      } else {
        const shouldMakeMistake = Math.random() < errorChance;
        const worseMoves = bestMoves.slice(1);
        chosenMove = shouldMakeMistake
          ? (worseMoves[Math.floor(Math.random() * worseMoves.length)] || bestMoves[0])
          : bestMoves[0];
      }

      const sx = chosenMove.charCodeAt(0) - 97;
      const sy = 8 - parseInt(chosenMove[1]);
      const dx = chosenMove.charCodeAt(2) - 97;
      const dy = 8 - parseInt(chosenMove[3]);

      const fromSquareElem = document.querySelector(`.square[data-x="${sx}"][data-y="${sy}"]`);
      const toSquareElem = document.querySelector(`.square[data-x="${dx}"][data-y="${dy}"]`);
      const pieceElem = fromSquareElem?.querySelector('.piece');

      const tempBoard = JSON.parse(JSON.stringify(boardState));
      tryMove(sx, sy, dx, dy, false);

      const movedPiece = boardState[dy][dx];
      const captured = tempBoard[dy][dx] && pieceColor(tempBoard[dy][dx]) !== currentTurn ? tempBoard[dy][dx] : '';
      const attackerPiece = tempBoard[sy][sx];
      const victimPiece = tempBoard[dy][dx];
      
      if (victimPiece && victimPiece.toLowerCase() !== 'k') {
        const color = pieceColor(attackerPiece); // kto zbił
        const type = victimPiece.toUpperCase();
        if (color === 'w') {
          capturedByWhite[type]++;
        } else {
          capturedByBlack[type]++;
        }
        updateCapturedDisplay();
      }
      
      


      logMove(sx, sy, dx, dy, movedPiece, captured);

      currentTurn = currentTurn === 'w' ? 'b' : 'w';

      const onFinish = () => {
        renderBoard();
        updateGameStatus();
        updateEvaluationBar();
        if (!gameEnded) setTimeout(runBotVsBot, 600);
      };

      if (pieceElem) {
        animatePieceMove(pieceElem, fromSquareElem, toSquareElem, 400, () => {
          setTimeout(onFinish, 0);
        });
      } else {
        onFinish();
      }

      isBotRunning = false;
    }
  };
}


  // Domyślnie ukryj wszystko
  colorButtons.style.display = "none";
difficultyPVB.style.display = "none";
difficultyBVB.style.display = "none";


  // Ukryj suwaki i etykiety
  ["difficultyWhite", "difficultyBlack", "difficultyValueW", "difficultyValueB"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });

  const labelW = document.querySelector('label[for="difficultyWhite"]');
  if (labelW) labelW.style.display = "none";
  const labelB = document.querySelector('label[for="difficultyBlack"]');
  if (labelB) labelB.style.display = "none";


document.getElementById('startGame').addEventListener('click', function () {
  if (gameMode === "online") {
    // Gra online już wystartowała – nie rób nic
    return;
  }  
  document.getElementById("profileScreen").style.display = "none";
  document.getElementById("startScreen").style.display = "none";
  document.getElementById("gameScreen").style.display = "block";

  applySavedAvatar();
  applySavedBackground();
  rebindPopupButtons();
  hasAwardedXP = false; // 🔄 Reset flagi przy nowej grze
  currentTurn = 'w';
  // 🔁 Uaktualnij poziomy trudności botów na starcie gry
	if (gameMode === "pvb") {
	  const val = parseInt(document.getElementById("difficultyPVB").value || "5");
	  if (playerColor === 'w') {
		botDifficultyB = val;
	  } else {
		botDifficultyW = val;
	  }
	window.xpBotLevelAtEnd = getCurrentBotLevel();
	} else if (gameMode === "bvb") {
	  botDifficultyW = parseInt(document.getElementById("difficultyWhite").value || "5");
	  botDifficultyB = parseInt(document.getElementById("difficultyBlack").value || "5");
	}
resetGame(false);
isInputLocked = false;

if (gameMode === "pvb") {
  console.log("🔁 [startGame] runAIMove() po starcie gry PvB");
  setTimeout(() => {
    runAIMove();
  }, 200);
}


if (gameMode === "bvb") {
  runBotVsBot();
  return;
}

if (gameMode === "pvp-hotseat") {
  document.getElementById("board").classList.remove("rotated");
  return;
}

if (playerColor === 'b') {
  document.getElementById("board").classList.add("rotated");
  setTimeout(() => {
    runAIMove();
  }, 600);
} else {
  document.getElementById("board").classList.remove("rotated");
}
  // Dynamiczne przypisanie etykiet boxów w zależności od koloru gracza
const topLabel = document.querySelector(".captured-top .capture-label");
const bottomLabel = document.querySelector(".captured-bottom .capture-label");

let topPlayerColor = 'b';
let bottomPlayerColor = 'w';

if (gameMode === 'pvp' || gameMode === 'bvb') {
  topPlayerColor = 'b';
  bottomPlayerColor = 'w';
} else if (gameMode === 'pvb') {
  topPlayerColor = playerColor === 'w' ? 'b' : 'w';
  bottomPlayerColor = playerColor;
}

document.querySelector(".captured-top .capture-label").textContent =
  `Zbite przez ${topPlayerColor === 'w' ? "białe" : "czarne"}`;
document.querySelector(".captured-bottom .capture-label").textContent =
  `Zbite przez ${bottomPlayerColor === 'w' ? "białe" : "czarne"}`;
});

function showStartMenu() {
	if (gameMode === "online" && currentRoomCode && socket) {
	  // Jeśli był tryb online, wyślij leaveRoom
	  socket.emit("leaveRoom", { roomCode: currentRoomCode });
	  currentRoomCode = null;
	  gameMode = null;
	  pvpSubmode = null;
	} else {
	  // Jeśli był tryb offline, po prostu resetuj dane gry
	  gameMode = null;
	  pvpSubmode = null;
	}

	// 🎯 Przyznaj zaległy XP tylko przy wejściu do menu
	if (!hasAwardedXP && typeof window.xpPendingResult !== "undefined") {
	  awardXP(window.xpPendingResult);
	  delete window.xpPendingResult;
	  hasAwardedXP = true; // ✅ Zabezpieczenie
	}
	if (stockfishBVBWorker) {
	  stockfishBVBWorker.terminate();
	  stockfishBVBWorker = new Worker("stockfish.js");
	}

	resetStockfishPVBWorker();

  document.getElementById('chooseWhite').classList.remove('selected');
  document.getElementById('chooseBlack').classList.remove('selected');
  document.getElementById('startGame').disabled = true;

  document.getElementById('startScreen').style.display = 'flex';
  document.getElementById('board').classList.remove('rotated');

  isBotRunning = false;
  window._botBestMoves = []; // 🛠️ koniecznie resetuj między partiami
}

function resetGame(showMenuAfter) {
	if (stockfishBVBWorker) {
	  stockfishBVBWorker.terminate();
	  stockfishBVBWorker = new Worker("stockfish.js");
	}

	resetStockfishPVBWorker();


	isBotRunning = false;
  boardState = [
    ['r','n','b','q','k','b','n','r'],
    ['p','p','p','p','p','p','p','p'],
    ['','','','','','','',''],
    ['','','','','','','',''],
    ['','','','','','','',''],
    ['','','','','','','',''],
    ['P','P','P','P','P','P','P','P'],
    ['R','N','B','Q','K','B','N','R']
  ];
  currentTurn = 'w';
  selected = null;
  enPassantTarget = null;
  whiteKingMoved = false;
  blackKingMoved = false;
  whiteRookMoved = [false, false];
  blackRookMoved = [false, false];
  document.getElementById("endScreen").style.display = "none";
  document.getElementById("boardContainer").classList.remove("board-mate");
  capturedByWhite = { ...initialCapturedCounts };
  capturedByBlack = { ...initialCapturedCounts };
  updateCapturedDisplay();  
  renderBoard();
const botInfo = document.getElementById("botDifficultyDisplay");
  updateGameStatus();
  clearHighlights();
  updateBotLabels();
  updateEvaluationBar();
  moveLog = [];
  gameEnded = false;
  isInputLocked = false;
  hasLostPiece = false;
  hasAwardedXP = false;
  delete window.xpBotLevelAtEnd;
  document.getElementById('logList').innerHTML = '';
  promotionContext = null;
  document.getElementById("promotionModal").style.display = "none";



  // Jeżeli chcemy powrócić do menu, to je pokażemy
  if (showMenuAfter) {
  if (showMenuAfter && typeof window.previousLevelBeforeAward !== "undefined" && playerLevel > window.previousLevelBeforeAward) {
  triggerLevelUpAnimation();
  // tylko raz!
  delete window.previousLevelBeforeAward;
	}
    showStartMenu();
  }
  document.getElementById("gameScreen").style.display = "block";
  window._botBestMoves = []; // 🛠️ koniecznie resetuj między partiami
}

const difficultyNames = [
  "Beginner", "Novice", "Easy", "Normal", "Skilled", "Dread",
  "Expert", "Nightmare", "Insane", "Hell", "???"
];
const difficultyDescriptions = [
  "Ruchy losowe. Nie wie, co robi.",
  "Zna zasady, ale nie rozumie gry.",
  "Zdarza mu się coś zauważyć.",
  "Myśli na jedną turę do przodu.",
  "Popełnia mniej błędów niż Ty.",
  "Szuka szans. Czasem je tworzy.",
  "Gra metodycznie i bez emocji.",
  "Widzi więcej, niż zdążyłeś zaplanować.",
  "Wymusza błędy. Twoje, nie swoje.",
  "Wie więcej, niż myślisz.",
  "Cokolwiek to jest, nie gra fair."
];
const glitchCycle = ["???", "UNKNOWN", "EXE", "∅", "ERROR", "???"];
let glitchIndex = 0;
let glitchInterval = null;
function startGlitchNames() {
  stopGlitchNames();

  glitchInterval = setInterval(() => {
    glitchIndex = (glitchIndex + 1) % glitchCycle.length;
    const newName = glitchCycle[glitchIndex];

    const label = document.getElementById("topBotLabel");
    const pvblabel = document.getElementById("difficultyPVBName");

    // Nazwa dla topBotLabel
    if (label.classList.contains("difficulty-color-10") && gameMode === "pvb") {
      const botSideText = playerColor === "w" ? "czarny" : "biały";
      label.textContent = `🤖 Bot (${botSideText}) – ${newName}`;
    }

    // Nazwa w menu wyboru
    if (pvblabel.classList.contains("difficulty-color-10")) {
      // jeśli to pierwszy wpis (czyli ???), to dodaj spację, żeby wymusić rerender
		if (newName === "???" && glitchIndex === 0) {
		  pvblabel.textContent = "??? ";
		} else {
		  pvblabel.textContent = newName;
		}
    }
	// Dodaj glitch do PvB menu
	if (pvblabel.classList.contains("difficulty-color-10")) {
	  pvblabel.classList.add("glitch");
	  pvblabel.classList.remove("glitch");
	void pvblabel.offsetWidth; // wymuszenie reflow
	pvblabel.classList.add("glitch");
	} else {
	  pvblabel.classList.remove("glitch");
	}
  }, 1200);
}

function stopGlitchNames() {
  clearInterval(glitchInterval);
  glitchIndex = 0;
  document.getElementById("difficultyPVBName").classList.remove("glitch");
}


document.getElementById("difficultyPVB").addEventListener("input", (e) => {
	const val = parseInt(e.target.value);
	const name = difficultyNames[val] || `Poziom ${val}`;
	const nameElem = document.getElementById("difficultyPVBName");

	// usuń stare klasy kolorów
	for (let i = 0; i <= 10; i++) {
	  nameElem.classList.remove(`difficulty-color-${i}`);
	}

	nameElem.innerText = name;
	nameElem.classList.add(`difficulty-color-${val}`);
	document.getElementById("difficultyPVBDesc").innerText = difficultyDescriptions[val] || "";
	if (val === 10) {
	  nameElem.classList.remove("glitch");
	  void nameElem.offsetWidth; // reflow
	  nameElem.classList.add("glitch", "glitch-glow");
	  startGlitchNames();
	} else {
	  nameElem.classList.remove("glitch", "glitch-glow");
	  stopGlitchNames();
	}

  if (playerColor === "w") botDifficultyB = val;
  
  else botDifficultyW = val;

  updateBotLabels();
});

document.getElementById("difficultyWhite").addEventListener("input", (e) => {
  document.getElementById("difficultyWhiteValue").innerText = e.target.value;
});

document.getElementById("difficultyBlack").addEventListener("input", (e) => {
  document.getElementById("difficultyBlackValue").innerText = e.target.value;
});


function evaluateWithStockfish(callback) {
  const fen = getFEN();
  let bestScore = null;
  const isWhitePerspective = true; // zawsze pokazujemy przewagę białych
  const adjustedScore = isWhitePerspective ? bestScore : -bestScore;

  const worker = stockfishEvalWorker;
  worker.postMessage("uci");

  let ready = false;
  let evaluationRequested = false;

  worker.onmessage = function (e) {
    const line = String(e.data);

    if (line.includes("uciok")) {
      ready = true;
    }

    if (ready && !evaluationRequested) {
      evaluationRequested = true;
      worker.postMessage(`position fen ${fen}`);
      worker.postMessage(`go depth 15`);
    }

    if (line.startsWith("info") && line.includes("score")) {
      // Sprawdzamy czy to ocena mata czy centypionów
      if (line.includes("score mate")) {
        const match = line.match(/score mate (-?\d+)/);
        if (match) {
          const mateIn = parseInt(match[1], 10);
          // Przekształcamy mat w wysoką wartość (np. mate in 1 = ±1000, mate in 5 = ±950)
          bestScore = (mateIn > 0 ? 1000 - mateIn * 10 : -1000 - mateIn * 10);
        }
      } else if (line.includes("score cp")) {
        const match = line.match(/score cp (-?\d+)/);
        if (match) {
          bestScore = parseInt(match[1], 10);
        }
      }
    }

    if (line.startsWith("bestmove") && bestScore !== null) {
      callback(bestScore);
    }
  };
}

function updateEvaluationBar() {
  const tooltip = document.getElementById("evalTooltip");
  if (tooltip) {
    tooltip.style.display = "block";
    tooltip.textContent = "Analiza...";
  }

  evaluateWithStockfish((evaluation) => {
    const maxEval = 1000;
    const clampedEval = Math.max(-maxEval, Math.min(maxEval, evaluation));
    const whitePercent = ((clampedEval + maxEval) / (2 * maxEval)) * 100;

    const bar = document.getElementById("evalFill");
    if (bar) {
      bar.style.height = `${whitePercent}%`;
    }

    const evalScore = document.getElementById("evalScore");
    if (evalScore) {
      const score = (clampedEval / 100).toFixed(1);
      evalScore.textContent = (clampedEval > 0 ? "+" : "") + score;
    }

    if (tooltip) {
      tooltip.style.display = "none";
    }
  });
}

function findKing(color) {
  const target = color === 'w' ? 'K' : 'k';
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      if (boardState[y][x] === target) return { x, y };
    }
  }
  return { x: -1, y: -1 }; // fallback
}
function canPieceAttack(sx, sy, dx, dy) {
  const piece = boardState[sy][sx];
  if (!piece) return false;

  const color = pieceColor(piece);
  const target = boardState[dy][dx];
  if (target && pieceColor(target) === color) return false;

  const dxAbs = Math.abs(dx - sx);
  const dyAbs = Math.abs(dy - sy);

  switch (piece.toLowerCase()) {
    case 'p': {
      const direction = color === 'w' ? -1 : 1;
      return dxAbs === 1 && dy - sy === direction;
    }
    case 'n': return (dxAbs === 2 && dyAbs === 1) || (dxAbs === 1 && dyAbs === 2);
    case 'b': return dxAbs === dyAbs && clearPath(sx, sy, dx, dy);
    case 'r': return (sx === dx || sy === dy) && clearPath(sx, sy, dx, dy);
    case 'q': return (sx === dx || sy === dy || dxAbs === dyAbs) && clearPath(sx, sy, dx, dy);
    case 'k': return dxAbs <= 1 && dyAbs <= 1;
    default: return false;
  }
}

function isSquareAttacked(x, y, byColor) {
  for (let sy = 0; sy < 8; sy++) {
    for (let sx = 0; sx < 8; sx++) {
      const piece = boardState[sy][sx];
      if (piece && pieceColor(piece) === byColor) {
        if (canPieceAttack(sx, sy, x, y)) {
          return true;
        }
      }
    }
  }
  return false;
}

async function handlePromotionChoice(pieceCode, isWhite) {
  const users = await getUsers();

  if (!promotionContext) return;

  const { sx, sy, dx, dy } = promotionContext;
  promotionContext.piece = pieceCode;

  // 🔄 W trybie online: tylko emit i return
  if (gameMode === "online") {
    isInputLocked = true;
    socket.emit("move", {
      roomCode: currentRoomCode,
      from: { x: sx, y: sy },
      to: { x: dx, y: dy },
      promotion: pieceCode,
      senderId: socketId,
    });
    document.getElementById("promotionModal").style.display = "none";
    promotionContext = null;
    selected = null;
    legalMoves = [];
  
    if (gameMode === "pvb") unlockAchievement("promotion", users);  
    return;
  }

  // 🔄 Lokalne tryby (PvB, Hotseat)
  const attackerPiece = boardState[sy][sx];
  const victimPiece = boardState[dy][dx];
  const newPiece = isWhite ? pieceCode.toUpperCase() : pieceCode.toLowerCase();

  boardState[dy][dx] = newPiece;
  boardState[sy][sx] = '';

  logMove(sx, sy, dx, dy, newPiece, victimPiece || '', pieceCode);
  document.getElementById("promotionModal").style.display = "none";

  const fromSquare = document.querySelector(`.square[data-x="${sx}"][data-y="${sy}"]`);
  const toSquare = document.querySelector(`.square[data-x="${dx}"][data-y="${dy}"]`);
  const pieceElem = fromSquare?.querySelector('.piece');

  const onFinish = () => {
    currentTurn = currentTurn === 'w' ? 'b' : 'w';
    renderBoard();
    updateTurnStatus();
    updateGameStatus();
    updateEvaluationBar();
    isInputLocked = false;

    if (gameMode === "pvb" && currentTurn !== playerColor) {
      setTimeout(runAIMove, 500);
    }
  };

  if (pieceElem && fromSquare && toSquare) {
    animatePieceMove(pieceElem, fromSquare, toSquare, 500, onFinish);
  } else {
    onFinish();
  }

  promotionContext = null;

  if (gameMode === "pvb") unlockAchievement("promotion", users);
}

// Przypisanie kliknięć
document.querySelectorAll(".promotion-option").forEach(button => {
  button.addEventListener("click", () => {
    const pieceCode = button.dataset.piece;
    handlePromotionChoice(pieceCode, currentTurn === 'w');
  });
});

function getXpThreshold(level) {
  return baseXP + (Number.isFinite(level) ? level : 0) * 20;
}


async function enforceLocksByLevel() {
  const avatarGrid = document.querySelectorAll(".avatar-grid-avatar img, .avatar-grid-background img");

  avatarGrid.forEach(el => {
    const type = el.dataset.type;
    const id = el.dataset.id;
    const reward = levelRewards.find(r => r.type === type && r.id === id);
    const isUnlocked = isRewardUnlocked(type, id);

    el.classList.toggle("locked", !isUnlocked);

    // znajdź lub utwórz kontener-widoczny
    let wrapper = el.parentElement;
    if (!wrapper.classList.contains("avatar-grid-entry")) {
      const entry = document.createElement("div");
      entry.className = "avatar-grid-entry";
      el.replaceWith(entry);
      entry.appendChild(el);
      wrapper = entry;
    }

    const oldNote = wrapper.querySelector(".reward-note");
    if (oldNote) oldNote.remove();

    if (reward && !isUnlocked) {
      const note = document.createElement("div");
      note.className = "reward-note";
      note.innerText = `Odblokuj na poziomie ${reward.level}`;
      wrapper.appendChild(note);
    }
  });
}

async function updateProfileUI() {
  const users = await getUsers();
  const currentUser = activeUserNick || localStorage.getItem("currentUser");
  
  let viewedUser = null;

  if (viewingFriendProfile && viewingFriendId) {
    const nick = Object.keys(users).find(nick => users[nick].id === viewingFriendId);
    viewedUser = users[nick];
  } else {
    viewedUser = users[currentUser];
  }

  if (!viewedUser) return;

  const xp = viewedUser.xp || 0;
  const level = viewedUser.level || 0;
  const xpForNextLevel = getXpThreshold(level);
  const percent = Math.min((xp / xpForNextLevel) * 100, 100);

  const bar = document.getElementById("xpBarFill");
  const counter = document.getElementById("xpCounter");
  const levelText = document.getElementById("playerLevel");

  if (bar) bar.style.width = `${percent}%`;
  if (counter) counter.textContent = `${xp} / ${xpForNextLevel} XP`;
  if (levelText) levelText.textContent = `Poziom ${level}`;

  // 🔄 DODATKOWO: pasek w nagłówku (jeśli istnieje)
  const headerXPBar = document.querySelector(".xp-fill");
  if (headerXPBar && headerXPBar !== bar) {
    headerXPBar.style.width = `${percent}%`;
  }
}

async function validateFriendsList() {
  const users = await getUsers();
  const currentUser = activeUserNick || localStorage.getItem("currentUser");
  if (!currentUser || !users[currentUser]) return;

  const me = users[currentUser];
  const validNicks = new Set(Object.keys(users)); // 🔥 zmienione z ID na nicki

  const oldFriends = me.friends || [];
  const newFriends = oldFriends.filter(nick => validNicks.has(nick)); // 🔥 zmienione na nicki

  if (oldFriends.length !== newFriends.length) {
    console.warn("⚠️ Wykryto nieistniejących znajomych – lista została poprawiona.");
    me.friends = newFriends;
    await saveUsers(users);
    await refreshUsers()
    renderFriendsList();
  }
}


function checkLevelRewards(newLevel) {

const unlocked = levelRewards.filter(r => r.level === newLevel);
console.log("Odblokowywanie nagród dla poziomu:", newLevel, unlocked);


  // Zapisz do localStorage, jeśli trzeba (na przyszłość)
  for (const reward of unlocked) {
    const key = `${reward.type}_${reward.id}`;
    localStorage.setItem(`unlocked_${key}`, "true");
  }
}

function showPopupAdvanced({ message, input = false, confirm = false, onConfirm = null, onCancel = null }) {
  const thisPopupID = ++currentPopupID; // 🔥 nadaj ID temu popupowi
  const popupContainer = document.getElementById("popupContainer");
  const popupMessage = document.getElementById("popupMessage");
  const popupInput = document.getElementById("popupInput");
  const popupConfirmBtn = document.getElementById("popupConfirmBtn");
  const popupCancelBtn = document.getElementById("popupCancelBtn");
  const popupButtons = document.getElementById("popupButtons");

  // Reset popup
  popupMessage.textContent = message || "";
  popupInput.value = "";
  popupInput.classList.toggle('popup-hidden', !input);

  if (confirm) {
    popupCancelBtn.classList.remove('popup-hidden');
  } else {
    popupCancelBtn.classList.add('popup-hidden');
  }

  popupButtons.classList.remove("single-button", "double-button");
  popupButtons.classList.add(confirm ? "double-button" : "single-button");

  popupContainer.classList.remove("popup-hidden");

const cleanUp = () => {
  const thisCleanupID = currentPopupID; // zapisz ID popupu, który ma się wyczyścić

  popupContainer.classList.add("popup-hidden");

  setTimeout(() => {
    if (thisCleanupID === currentPopupID) {
      // ✅ Czyścimy tylko jeśli popup nie został nadpisany nowym
      popupMessage.textContent = "";
      popupInput.value = "";
      popupInput.classList.add("popup-hidden");
      popupButtons.classList.remove("single-button", "double-button");
      popupConfirmBtn.onclick = null;
      popupCancelBtn.onclick = null;
      popupConfirmBtn.classList.remove("popup-hidden");
      popupCancelBtn.classList.add("popup-hidden");
    }
  }, 400); // 400ms opóźnienia na animację
};

popupConfirmBtn.onclick = async () => {
  const value = input ? popupInput.value : true;
  if (onConfirm) {
    const result = await onConfirm(value);

    if (result !== false) {
      cleanUp(); // ✅ CleanUp tylko jeśli onConfirm zwróci true lub undefined
    }
    // jeśli onConfirm zwróci false ➔ popup nie zamyka się automatycznie
  } else {
    cleanUp();
  }
};

  popupCancelBtn.onclick = () => {
    cleanUp();
    if (onCancel) onCancel();
  };
}

function showLevelRewardsPopup(level) {
  const unlocked = levelRewards.filter(r => r.level === level);
  if (unlocked.length === 0) return;

  const modal = document.createElement("div");
  modal.className = "level-reward-modal";
  modal.innerHTML = `
    <h2>🎁 Nowe nagrody za poziom ${level}</h2>
    <div class="reward-grid">
      ${unlocked.map(r => {
		const src = r.type === "avatar"
		  ? `img/avatars/${r.id}`
		  : r.type === "background"
		  ? `img/backgrounds/${r.id}`
		  : r.type === "frame"
		  ? `img/frames/${r.id}.png`
		  : "";
        const label = r.type === "avatar" ? "Awatar" : r.type === "background" ? "Tło profilu" : r.type === "frame" ? "Ramka prestiżu" : r.type;
        return `
          <div class="reward-item">
            <div class="reward-label">${label}</div>
            <img src="${src}" class="reward-img">
          </div>`;
      }).join("")}
    </div>
    <button class="close-reward-modal">Zamknij</button>
  `;
  document.body.appendChild(modal);
  document.querySelector(".close-reward-modal").onclick = () => modal.remove();
}


function triggerLevelUpAnimation() {
  const overlay = document.getElementById("levelOverlay");
  overlay.style.display = "flex";
  overlay.classList.add("show-level");

  setTimeout(() => {
    overlay.style.display = "none";
    overlay.classList.remove("show-level");
  }, 2500);
}

async function saveProfile() {
  const selectedAvatar = localStorage.getItem("selectedAvatar") || "avatar1.png";
  const selectedBackground = localStorage.getItem("selectedBackground") || "bg0.png";
  const selectedFrame = localStorage.getItem("selectedFrame") || "default_frame";
  
  const profileData = {
    ui: {
      avatar: selectedAvatar,
      background: selectedBackground,
      frame: selectedFrame
    }
  };

  const nick = localStorage.getItem("currentUser"); // <-- pobieramy nick
  if (!nick) {
    showNotification("Nie jesteś zalogowany!");
    return;
  }

  await saveProfileToServer(nick, profileData);

  showNotification("Zapisano zmiany profilu!");
}


function logout() {
  window.cachedUsers = null;
  activeUserNick = null; // 🧠 wyczyść sesję w pamięci
  localStorage.removeItem("currentUser");
  showScreen("loginScreen");
  document.getElementById("startScreen").style.display = "none";
  document.getElementById("profileScreen").style.display = "none";
}

async function loadProfile() {
  if (!activeUserNick) {
    console.warn("Brak aktywnego użytkownika – nie wczytuję profilu.");
    return;
  }  
  const currentUser = activeUserNick || localStorage.getItem("currentUser");
  const users = await getUsers();
  const userData = users[currentUser];

  if (!userData) return;

  achievements = userData.achievements || {};

  const ui = userData.ui || {};
  const savedAvatar = ui.avatar || "avatar1.png";
  const savedBackground = ui.background || "bg0.png";
  const savedFrame = ui.frame || "default_frame";

  localStorage.setItem("selectedAvatar", savedAvatar);
  localStorage.setItem("selectedBackground", savedBackground);
  localStorage.setItem("selectedFrame", savedFrame);

  unlockedFrames = JSON.parse(localStorage.getItem("unlockedFrames") || "[]");
  currentFrame = savedFrame;

  updateProfileUI();
  applySavedAvatar();
  applySavedFrame();
}

function isRewardUnlocked(type, id) {
  const key = `unlocked_${type}_${id}`;
  const unlocked = localStorage.getItem(key) === "true";

  // sprawdź czy należy do domyślnie dostępnych
  const isDefault = defaultUnlockedRewards.some(r => r.type === type && r.id === id);
  return unlocked || isDefault;
}


const initialVal = parseInt(document.getElementById("difficultyPVB").value);
document.getElementById("difficultyPVBName").innerText = difficultyNames[initialVal];

async function resetProfile() {
showPopupAdvanced({
  message: "Na pewno zresetować cały postęp?",
  confirm: true,
  onConfirm: async () => {
    const currentUser = activeUserNick || localStorage.getItem("currentUser");
    const users = await getUsers();

    if (!users[currentUser]) return;

    users[currentUser].xp = 0;
    users[currentUser].level = 0;
    users[currentUser].achievements = {};
    users[currentUser].stats = { wins: 0 };
    users[currentUser].ui = {
      avatar: "avatar1.png",
      background: "bg0.png",
      frame: "default_frame"
    };

    // ✅ Dodatkowe czyszczenie globalnych danych powiązanych z osiągnięciami
    localStorage.setItem("winStreak", "0");
    localStorage.setItem("lostToBots", "[]");
    achievements = {};

    await saveUsers(users);
    loadProfile();
    updateAchievementsUI();
    updateProfileUI();
  }
});
}

function resetLevelRewards() {
  for (const r of levelRewards) {
    localStorage.removeItem(`unlocked_${r.type}_${r.id}`);
  }
}

async function openProfileScreen(friendId = null) {
  if (!activeUserNick) {
    console.warn("Brak aktywnej sesji. Powrót do ekranu logowania.");
    showScreen("loginScreen");
    return;
  }

  viewingFriendProfile = !!friendId;
  viewingFriendId = friendId;

  const isOwnProfile = !viewingFriendProfile;

  await refreshUsers();
  const users = await getUsers();
  await renderFriendsList();

document.getElementById("resetProgressBtn").style.display = isOwnProfile ? "inline-block" : "none";

if (isOwnProfile) {
  document.getElementById("backGeneralBtn").style.display = "inline-block";
  document.getElementById("backFriendBtn").style.display = "none";
} else {
  document.getElementById("backGeneralBtn").style.display = "none";
  document.getElementById("backFriendBtn").style.display = "inline-block";
}


  const backBtnEl = document.getElementById("backToOwnProfileBtn");

  const currentNick = localStorage.getItem("currentUser");
  const dataKey = viewingFriendProfile
    ? Object.keys(users).find(k => users[k].id === friendId)
    : currentNick;

  const userData = users[dataKey];
  if (!userData) {
    console.error("Nie znaleziono danych użytkownika dla profilu.");
    showPopup("Nie można załadować danych profilu.");
    return;
  }

  currentlyViewedUser = viewingFriendProfile ? userData : null;

  const screen = document.getElementById("profileScreen");
  if (screen) screen.style.display = "block";
  document.getElementById("startScreen").style.display = "none";
  document.getElementById("gameScreen").style.display = "none";
  document.getElementById("endScreen").style.display = "none";

  ["logoutBtn", "resetProgressBtn", "deleteAccountBtn", "backToOwnProfileBtn"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === "backToOwnProfileBtn") {
      el.style.display = viewingFriendProfile ? "block" : "none";
    } else {
      el.style.display = viewingFriendProfile ? "none" : "block";
    }
  });

  const avatar = userData.ui?.avatar || "avatar1.png";
  const background = userData.ui?.background || "bg0.png";
  const frame = userData.ui?.frame || "default_frame";

  const avatarEl = document.getElementById("profileAvatar");
  if (avatarEl) avatarEl.src = `img/avatars/${avatar}`;

  const bgEl = document.getElementById("profileBackgroundImage");
  if (bgEl) bgEl.src = `img/backgrounds/${background}`;

  const frameEl = document.getElementById("profileAvatarFrame");
  if (frameEl) frameEl.src = `img/frames/${frame}.png`;

  if (frameEl) frameEl.style.display = frame === "none" ? "none" : "block";

  document.querySelector(".player-nickname").textContent = userData.nick || "Brak";
  document.getElementById("playerLevel").textContent = `Poziom ${userData.level || 0}`;

  updateAchievementsUI();
  showProfileTabs();
  updateProfileUI();
  requestAnimationFrame(() =>
    requestAnimationFrame(() => openProfileTab("achievements"))
  );
}


function showProfileTabs() {
	const isOwnProfile = !viewingFriendProfile;
	// Pokaż/ukryj zakładkę znajomych
document.querySelectorAll(".profile-menu button").forEach(btn => {
  if (!btn?.id) return;
  const isFriendsTab = btn.id === "tab-friends";
  btn.style.display = viewingFriendProfile && isFriendsTab ? "none" : "inline-block";
});
const tabFriends = document.querySelector('#tab-friends') || document.querySelector('button[onclick="showFriendsTab()"]');
if (tabFriends) tabFriends.style.display = isOwnProfile ? "inline-block" : "none";


  // Ukryj interaktywne elementy
  const changeAvatarBtn = document.querySelector(".profile-avatar-container");
  const changeBgBtn = document.querySelector(".profile-background-container");

	if (viewingFriendProfile) {
	  document.querySelector(".profile-avatar-container").style.pointerEvents = "none";
	  document.querySelector(".profile-background-container").style.display = "none";
	} else {
	  document.querySelector(".profile-avatar-container").style.pointerEvents = "auto";
	  document.querySelector(".profile-background-container").style.display = "flex";
	}
}


function closeProfileScreen() {
  const isStartingOnlineGame = gameMode === "online" || pvpSubmode === "online";

  document.getElementById("profileScreen").style.display = "none";

  if (isStartingOnlineGame) {
    document.getElementById("gameScreen").style.display = "block"; // 🔥 przełącz na grę!
    document.getElementById("startScreen").style.display = "none";
  } else {
    document.getElementById("gameScreen").style.display = "none";
    document.getElementById("startScreen").style.display = "flex";
  }

  document.getElementById("endScreen").style.display = "none";

  viewingFriendProfile = false;
  viewingFriendId = null;
}

async function validateUnlockedRewards() {
  const currentUser = activeUserNick || localStorage.getItem("currentUser");
  const users = await getUsers();
  let changed = false;

  levelRewards.forEach(reward => {
    const key = `unlocked_${reward.type}_${reward.id}`;
    const requiredLevel = reward.level;
    const isUnlocked = localStorage.getItem(key) === "true";

const user = users[currentUser];
if (!user) return;

	if (isUnlocked && user.level < requiredLevel) {
      localStorage.removeItem(key);
      console.log(`❌ Cofnięto odblokowanie: ${key}`);

      if (reward.type === "avatar" && localStorage.getItem("selectedAvatar") === reward.id) {
        localStorage.setItem("selectedAvatar", "avatar1.png");
        changed = true;
      }
      if (reward.type === "background" && localStorage.getItem("selectedBackground") === reward.id) {
        localStorage.setItem("selectedBackground", "bg0.png");
        changed = true;
      }
      if (reward.type === "frame" && localStorage.getItem("selectedFrame") === reward.id) {
        localStorage.setItem("selectedFrame", "default_frame");
        changed = true;
      }
    }

	if (!isUnlocked && user.level >= requiredLevel) {
      localStorage.setItem(key, "true");
      console.log(`✅ Przyznano zaległą nagrodę: ${key}`);
      changed = true;
    }
  });

  if (changed && users[currentUser]) {
    users[currentUser].ui = {
      avatar: localStorage.getItem("selectedAvatar") || "avatar1.png",
      background: localStorage.getItem("selectedBackground") || "bg0.png",
      frame: localStorage.getItem("selectedFrame") || "default_frame"
    };
    await saveUsers(users);
    applySavedAvatar();
    applySavedBackground();
    applySavedFrame();
  }
}

async function showPromotionModal(isWhite) {
  const users = await getUsers();
  const modal = document.getElementById("promotionModal");
  modal.style.display = "block";

  // Dla każdego przycisku w oknie promocji:
  const buttons = modal.querySelectorAll(".promotion-option");
  buttons.forEach(btn => {
    btn.onclick = () => {
      const piece = btn.dataset.piece;
      handlePromotionChoice(piece, isWhite);
      modal.style.display = "none";
	  if (gameMode === "pvb") unlockAchievement("promotion", users);
    };
  });
}

async function awardXP(resultType) {
  const currentUser = activeUserNick || localStorage.getItem("currentUser");
  const users = await getUsers();

  if (!currentUser || !users[currentUser] || gameMode !== "pvb") return;
  if (hasAwardedXP) return;
  hasAwardedXP = true;

  const user = users[currentUser];
  user.xp = user.xp || 0;
  user.stats = user.stats || { wins: 0 };

  let xpGained = 0;
  const botLevel = typeof window.xpBotLevelAtEnd !== "undefined" ? window.xpBotLevelAtEnd : getCurrentBotLevel();
  const multipliers = [0.1, 0.2, 0.4, 0.6, 0.8, 1, 1.5, 2, 3, 4, 8];
  const multiplier = multipliers[botLevel] || 1;

  // 📋 Osiągnięcia za WIN
  if (resultType === "win") {
    if (playerColor === 'w') unlockAchievement("win_white", users);
    if (playerColor === 'b') unlockAchievement("win_black", users);
    if (!window.hasLostPieceFinal) unlockAchievement("no_piece_lost", users);

    xpGained = Math.floor(baseXP * multiplier);
    user.stats.wins++;

    unlockAchievement("first_win", users);

    unlockAchievement(`bot_${botLevel}`, users);


    const lostTo = JSON.parse(localStorage.getItem("lostToBots") || "[]");
    if (lostTo.includes(botLevel)) {
      unlockAchievement("revenge", users);
      const updated = lostTo.filter(l => l !== botLevel);
      localStorage.setItem("lostToBots", JSON.stringify(updated));
    }

    const moveLen = window.lastMoveLogLength ?? 0;
    const lastMove = window.lastMoveLogFinalMove ?? "";
    const moveCount = Math.ceil(moveLen / 2);
    if (moveCount <= 4 && lastMove.endsWith("#")) {
      unlockAchievement("scholars_mate", users);
    }
  }

  // 📋 Osiągnięcia za DRAW
  else if (resultType === "draw") {
    unlockAchievement("first_draw", users);
    xpGained = Math.floor(baseXP * multiplier * 0.5);
    localStorage.setItem("winStreak", "0");
  }

  // 📋 Osiągnięcia za LOSS
  else if (resultType === "loss") {
    unlockAchievement("first_loss", users);
    localStorage.setItem("winStreak", "0");
    const prev = JSON.parse(localStorage.getItem("lostToBots") || "[]");
    if (!prev.includes(botLevel)) {
      prev.push(botLevel);
      localStorage.setItem("lostToBots", JSON.stringify(prev));
    }
    return; // ⛔ zakończ bez XP
  }

  // 📋 XP i awans poziomu
  let previousLevel = user.level ?? 0;
  let level = user.level ?? 0;
  let totalXP = user.xp + xpGained;
  window.previousLevelBeforeAward = previousLevel;

  while (true) {
    const requiredXP = getXpThreshold(level);
    if (totalXP < requiredXP) break;
    totalXP -= requiredXP;
    level++;
    checkLevelRewards(level);
    triggerLevelUpAnimation();
    setTimeout(() => {
      showLevelRewardsPopup(level);
      enforceLocksByLevel();
      updateProfileUI();
    }, 2500);
  }

  user.xp = totalXP;
  user.level = level;
  await saveUsers(users);

  await saveProfile();
  updateProfileUI();
}


function hasLostKeyPieceDuringGame() {
  return hasLostPiece;
}

async function unlockAchievement(id, usersOverride = null) {
  const currentUser = activeUserNick || localStorage.getItem("currentUser");
  if (!currentUser) return;

  const users = usersOverride || await getUsers();
  if (!users[currentUser]) return;

  if (users[currentUser].achievements?.[id]) return; // Już zdobyte

  users[currentUser].achievements = users[currentUser].achievements || {};
  users[currentUser].achievements[id] = true;

  achievements = { ...users[currentUser].achievements };

  window.cachedUsers[currentUser].achievements = { ...users[currentUser].achievements };

  try {
    localStorage.setItem("users", JSON.stringify(window.cachedUsers));
  } catch (e) {
    console.error("Błąd zapisu users do localStorage:", e);
  }

  await saveUsers(users);

  const data = achievementsList.find(a => a.id === id);
  if (!data) return;

  achievementQueue.push(data);
  processAchievementQueue();
  updateAchievementsUI?.();
  await saveProfile();
}

async function updateStatsOnWin() {
  const currentUser = activeUserNick || localStorage.getItem("currentUser");
  if (!currentUser) return;

  const users = await getUsers();
  if (!users[currentUser]) return;

  // Aktualizacja liczników
  users[currentUser].stats = users[currentUser].stats || {};
  users[currentUser].stats.wins = (users[currentUser].stats.wins || 0) + 1;
  users[currentUser].stats.winStreak = (users[currentUser].stats.winStreak || 0) + 1;

  // Aktualizuj cachedUsers i localStorage
  window.cachedUsers[currentUser].stats = { ...users[currentUser].stats };
  try {
    localStorage.setItem("users", JSON.stringify(window.cachedUsers));
  } catch (e) {
    console.error("Błąd zapisu users do localStorage:", e);
  }

  await saveUsers(users);

  // 🔥 PRZYZNAWANIE OSIĄGNIĘĆ progresywnych
  if (users[currentUser].stats.wins >= 5) {
    await unlockAchievement('win_5');
  }
  if (users[currentUser].stats.wins >= 50) {
    await unlockAchievement('win_50');
  }
  if (users[currentUser].stats.wins >= 200) {
    await unlockAchievement('win_200');
  }
  if (users[currentUser].stats.winStreak >= 3) {
    await unlockAchievement('win_streak_3');
  }
  if (users[currentUser].stats.winStreak >= 5) {
    await unlockAchievement('win_streak_5');
  }
}

function processAchievementQueue() {
  if (isAchievementVisible || achievementQueue.length === 0) return;

  isAchievementVisible = true;
  const data = achievementQueue.shift();

  const overlay = document.createElement("div");
  overlay.className = "achievement-overlay";
  overlay.innerHTML = `
    <img src="img/achievements/${data.image}" alt="">
    <div>
      <strong>${data.name}</strong><br>
      <span>${data.description}</span>
    </div>
  `;
  document.body.appendChild(overlay);

	setTimeout(() => {
	  overlay.style.animation = "slideOut 0.4s ease-in forwards";

	  // dopiero po zakończeniu animacji wyjścia usuwamy i przetwarzamy dalej
	  setTimeout(() => {
		overlay.remove();
		isAchievementVisible = false;
		processAchievementQueue();
	  }, 400); // czas trwania animacji wyjścia
	}, 4000);
}

let currentAchievementsPage = 0;
const achievementsPerPage = 15;

async function updateAchievementsUI() {
  const users = await getUsers();
  const currentNick = localStorage.getItem("currentUser");

  const viewedId = viewingFriendProfile
    ? Object.keys(users).find(k => users[k].id === viewingFriendProfile)
    : currentNick;

  const viewedUser = currentlyViewedUser || users[viewedId];
  const viewedAchievements = viewedUser?.achievements || {};
  const viewedStats = viewedUser?.stats || {};

  const list = document.getElementById("achievementsList");
  if (!list) return;

  const totalPages = Math.ceil(achievementsList.length / achievementsPerPage);
  const start = currentAchievementsPage * achievementsPerPage;
  const end = start + achievementsPerPage;
  const visibleAchievements = achievementsList.slice(start, end);

  list.innerHTML = "";

  visibleAchievements.forEach(a => {
    const li = document.createElement("li");
    li.className = viewedAchievements[a.id] ? "unlocked" : "locked";

    let extra = "";

    if (["win_5", "win_50", "win_200"].includes(a.id)) {
      const goal = parseInt(a.id.split("_")[1]);
      const current = viewedStats.wins || 0;
      extra = `<div class="progress-counter">${Math.min(current, goal)} / ${goal}</div>`;
    } else if (a.id === "win_streak_3") {
	const current = users[currentNick] && viewedUser.id === users[currentNick].id
	  ? parseInt(localStorage.getItem("winStreak") || "0")
	  : 0;
      extra = `<div class="progress-counter">${Math.min(current, 3)} / 3</div>`;
    } else if (a.id === "win_streak_5") {
	const current = users[currentNick] && viewedUser.id === users[currentNick].id
	  ? parseInt(localStorage.getItem("winStreak") || "0")
	  : 0;
      extra = `<div class="progress-counter">${Math.min(current, 5)} / 5</div>`;
    }

    li.innerHTML = `
      <img class="achievement-icon" src="img/achievements/${a.image}" alt="">
      <div class="content">
        <div class="title">${a.name}</div>
        <div class="desc">${a.description}</div>
        ${extra}
      </div>
    `;

    list.appendChild(li);
  });

  const prevBtn = document.getElementById("prevAchievementsPage");
  const nextBtn = document.getElementById("nextAchievementsPage");
  if (prevBtn) prevBtn.disabled = currentAchievementsPage === 0;
  if (nextBtn) nextBtn.disabled = currentAchievementsPage >= totalPages - 1;
  const indicator = document.getElementById("achievementsPageIndicator");
  if (indicator) {
    indicator.textContent = `${currentAchievementsPage + 1} / ${totalPages}`;
  }
}

function openProfileTab(tabName) {
  const content = document.getElementById("profileContent");
  if (!content) return;

  content.classList.add("fade-out");

  setTimeout(() => {
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('#profileScreen .profile-tab-content').forEach(tab => {
      tab.style.display = 'none';
      tab.classList.remove('fade-in');
    });

    const targetButton = document.getElementById(`tab-${tabName}`);
    const targetContent = document.getElementById(`tabContent-${tabName}`);
    if (targetButton) targetButton.classList.add('active');
    if (targetContent) {
      targetContent.style.display = 'block';
      targetContent.classList.add('fade-in');
    }

    // 📋 Przyciski
    const resetProgressBtn = document.getElementById("resetProgressBtn");
    const resetFriendBtn = document.getElementById("resetFriendBtn");
    const backGeneralBtn = document.getElementById("backGeneralBtn");
    const backFriendBtn = document.getElementById("backFriendBtn");
    const backToOwnProfileBtn = document.getElementById("backToOwnProfileBtn");

    if (viewingFriendProfile) {
      // 👤 Profil znajomego
      if (resetProgressBtn) resetProgressBtn.style.display = "none";
      if (resetFriendBtn) resetFriendBtn.style.display = "none";
      if (backGeneralBtn) backGeneralBtn.style.display = "none";
      if (backFriendBtn) backFriendBtn.style.display = "none";
      if (backToOwnProfileBtn) backToOwnProfileBtn.style.display = "inline-block";
    } else {
      // 🧍‍♂️ Mój własny profil
      if (backToOwnProfileBtn) backToOwnProfileBtn.style.display = "none";

      if (tabName === "friends") {
        if (resetProgressBtn) resetProgressBtn.style.display = "none";
        if (resetFriendBtn) resetFriendBtn.style.display = "inline-block";
        if (backGeneralBtn) backGeneralBtn.style.display = "none";
        if (backFriendBtn) backFriendBtn.style.display = "inline-block";
      } else {
        if (resetProgressBtn) resetProgressBtn.style.display = "inline-block";
        if (resetFriendBtn) resetFriendBtn.style.display = "none";
        if (backGeneralBtn) backGeneralBtn.style.display = "inline-block";
        if (backFriendBtn) backFriendBtn.style.display = "none";
      }
    }

    content.classList.remove("fade-out");
    content.classList.add("fade-in");
    setTimeout(() => content.classList.remove("fade-in"), 250);
  }, 200);
}


async function showFriendsTab() {
  document.querySelectorAll(".profile-tab-content").forEach(el => el.style.display = "none");
  document.getElementById("friendsTab").style.display = "block";
  await refreshUsers()
  renderFriendsList();
  renderInvites(); // ⬅️ TO DODAJ!
}

async function renderFriendsList() {
  await refreshUsers(); // 🔥 pobieramy najnowsze users.json
  const users = await getUsers();
  const currentUser = localStorage.getItem("currentUser");
  if (!currentUser || !users[currentUser]) return;

  const myUser = users[currentUser];
  const container = document.getElementById("friendsList");
  if (!container) return;
  container.innerHTML = "";

  const uniqueFriends = [...new Set(myUser.friends || [])]; // 🔥 upewniamy się, że istnieje lista

  uniqueFriends.forEach(friendNick => {
    const friend = users[friendNick];
    if (!friend) return;

    const avatar = friend.ui?.avatar || "avatar1.png";
    const frame = friend.ui?.frame || "default_frame";
    const background = friend.ui?.background || "bg0.png";
    const level = typeof friend.level === "number" ? friend.level : 0;

    const div = document.createElement("div");
    div.className = "friend-entry";
    div.style.backgroundImage = `url('img/backgrounds/${background}')`;
    div.style.backgroundSize = "cover";
    div.style.backgroundPosition = "center";

    div.innerHTML = `
      <div class="friend-card-top">
        <div class="profile-avatar-wrapper">
          <img src="img/avatars/${avatar}" class="profile-avatar">
          <img src="img/frames/${frame}.png" class="profile-avatar-frame">
        </div>
        <div class="friend-info">
          <div class="nickname">${friendNick}</div>
          <div class="id-label">ID: ${friend.id}</div>
          <div class="level">Poziom ${level}</div>
        </div>
      </div>
      <div class="friend-card-bottom">
        <button onclick="inviteToGame('${friend.id}')">Zaproś do gry</button>
        <button onclick="viewFriendProfile('${friend.id}')">Profil</button>
        <button onclick="removeFriend('${friendNick}')">Usuń</button>
      </div>
    `;

    container.appendChild(div);
  });
}

async function renderInvites() {
  const inviteList = document.getElementById("inviteList");
  const users = await getUsers();
  const nick = localStorage.getItem("currentUser");
  const me = users[nick];

  if (!me) {
    inviteList.innerHTML = "<div class='friend-status-text'>Błąd ładowania danych.</div>";
    return;
  }

  const incoming = me.pendingFriends || [];  // odebrane zaproszenia
  const outgoing = me.pendingInvites || [];  // wysłane zaproszenia

  if (incoming.length === 0 && outgoing.length === 0) {
    inviteList.innerHTML = "<div class='friend-status-text'>Brak zaproszeń</div>";
    return;
  }

  inviteList.innerHTML = "";

  // 🔵 Odebrane zaproszenia — pełna karta
  incoming.forEach(senderNick => {
    const sender = users[senderNick];
    if (!sender) return;

    const avatar = sender.ui?.avatar || "avatar1.png";
    const frame = sender.ui?.frame || "default_frame";
    const background = sender.ui?.background || "bg0.png";
    const level = sender.level || 0;

    const inviteDiv = document.createElement("div");
    inviteDiv.className = "invite-entry styled-invite";
    inviteDiv.style.backgroundImage = `url('img/backgrounds/${background}')`;
    inviteDiv.innerHTML = `
      <div class="friend-card-top">
        <div class="profile-avatar-wrapper">
          <img src="img/avatars/${avatar}" class="profile-avatar">
          <img src="img/frames/${frame}.png" class="profile-avatar-frame">
        </div>
        <div class="friend-info">
          <div class="nickname">${senderNick}</div>
          <div class="id-label">ID: ${sender.id}</div>
          <div class="level">Poziom: ${level}</div>
        </div>
      </div>
      <div class="friend-card-bottom">
        <button onclick="acceptInvite('${senderNick}')">Akceptuj</button>
        <button onclick="rejectInvite('${senderNick}')">Odrzuć</button>
      </div>
    `;
    inviteList.appendChild(inviteDiv);
  });

  // 🟡 Wysłane zaproszenia — uproszczona informacja
  outgoing.forEach(receiverNick => {
    const receiver = users[receiverNick];
    if (!receiver) return;

    const simpleDiv = document.createElement("div");
    simpleDiv.className = "simple-invite";
    simpleDiv.style.background = "#222";
    simpleDiv.style.color = "#fff";
    simpleDiv.style.padding = "16px";
    simpleDiv.style.borderRadius = "12px";
    simpleDiv.style.textAlign = "center";
    simpleDiv.style.marginBottom = "12px";

    simpleDiv.innerHTML = `
      <div class="friend-status-text">
        Wysłano zaproszenie do <strong>${receiverNick}</strong>
      </div>
    `;

    inviteList.appendChild(simpleDiv);
  });
}

async function refreshUsers() {
  try {
    const response = await fetch(`${API_BASE}/api/users`);
    const data = await response.json();
    window.cachedUsers = data.users; // zawsze aktualizuj globalnie
  } catch (error) {
    console.error("❌ Błąd pobierania użytkowników:", error);
  }
}


// ✅ Akceptuj zaproszenie
async function acceptInvite(fromNick) {
  const myNick = localStorage.getItem("currentUser");
  if (!myNick) {
    showFloatingStatus("Musisz być zalogowany", "showPopup");
    return;
  }

  try {
    await acceptFriendRequestAPI(fromNick, myNick);

    socket.emit('friendListUpdated', { friend: fromNick });

    await refreshUsers();
    await renderFriendsList();
    await renderInvites();

    showFloatingStatus("Dodano do znajomych!", "info");
  } catch (error) {
    console.error(error);
    showFloatingStatus(error.message, "showPopup");
  }
}

// ✅ Odrzuć zaproszenie
async function rejectInvite(fromNick) {
  const myNick = localStorage.getItem("currentUser");
  if (!myNick) {
    showFloatingStatus("Musisz być zalogowany", "showPopup");
    return;
  }

  try {
    await declineFriendRequestAPI(fromNick, myNick);

    socket.emit('friendListUpdated', { friend: fromNick });

    await refreshUsers();
    await renderFriendsList();
    await renderInvites();

    showFloatingStatus("Zaproszenie odrzucone", "info");
  } catch (error) {
    console.error(error);
    showFloatingStatus(error.message, "showPopup");
  }
}

async function removeFriendAPI(myNick, friendNick) {
  const response = await fetch(`${API_BASE}/api/friends/remove`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user: myNick, friend: friendNick }) // 🔥 tutaj zmiana
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Błąd usuwania znajomego.");
  }
}

function inviteToGame(friendId) {
  const myNick = localStorage.getItem("currentUser");
  if (!myNick || !friendId) return;

  // Tworzysz pokój i wysyłasz zaproszenie
  socket.emit('createGameInvite', { fromNick: myNick, toFriendId: friendId });
}

// ✅ Usuń znajomego
async function removeFriend(friendNick) {
  const myNick = localStorage.getItem("currentUser");
  if (!myNick) {
    showFloatingStatus("Musisz być zalogowany", "showPopup");
    return;
  }

  try {
    await removeFriendAPI(myNick, friendNick);

    // 🔥 Emisja socketowa po usunięciu znajomego
    socket.emit('friendListUpdated', { friend: friendNick });

    // ❌ NIE rób lokalnego refreshUsers/renderFriendsList tutaj.
    // Poczekaj aż przyjdzie socket.on('refreshFriends')

    showFloatingStatus("Usunięto znajomego", "info");
  } catch (error) {
    console.error(error);
    showFloatingStatus(error.message, "showPopup");
  }
}

function showFloatingStatus(text, type = "info") {
  const div = document.createElement("div");
  div.textContent = text;
  div.style.position = "fixed";
  div.style.bottom = "40px";
  div.style.left = "50%";
  div.style.transform = "translateX(-50%)";
  div.style.background = type === "showPopup" ? "#aa2222" : "#222";
  div.style.color = "#fff";
  div.style.padding = "10px 16px";
  div.style.borderRadius = "8px";
  div.style.zIndex = 9999;
  div.style.fontSize = "14px";
  div.style.boxShadow = "0 0 10px rgba(0,0,0,0.5)";
  document.body.appendChild(div);

  setTimeout(() => div.remove(), 2500);
}

async function addFriend() {
  const input = document.getElementById("addFriendInput");
  const value = input.value.trim();
  const status = document.getElementById("friendStatus");

  if (!value) return;

  const users = await getUsers();
  const nick = localStorage.getItem("currentUser");
  const current = users[nick];
  if (!current) {
    status.textContent = "Błąd: nie można załadować profilu gracza.";
    return;
  }

  // 🧠 Szukamy po kluczach i po ID
  const entry = Object.entries(users).find(([key, u]) => key === value || u.id === value);
  if (!entry) {
    status.textContent = "Nie znaleziono takiego gracza.";
    return;
  }

  const [foundNick, friend] = entry;

  if (!current.friends) current.friends = [];
  if (current.friends.includes(friend.id)) {
    status.textContent = "Ten gracz jest już na Twojej liście.";
    return;
  }

  current.friends.push(friend.id);
  await saveUsers(users);
  await refreshUsers()
  renderFriendsList();
  status.textContent = `Dodano: ${foundNick}`;
  input.value = "";
}


function viewFriendProfile(friendId) {
  openProfileScreen(friendId); // zamiast otwierania modału – przechodzimy do pełnego widoku
}



function openAvatarSelector() {
  const avatarGrid = document.getElementById("avatarGridContainer");
  const frameGrid = document.getElementById("frameGridContainer");
  avatarGrid.innerHTML = "";
  frameGrid.innerHTML = "";

  const avatars = [
    "avatar1.png", "avatar2.png", "avatar3.png", "avatar4.png", "avatar5.png",
    "avatar6.png", "avatar7.png", "avatar8.png", "avatar9.png", "avatar10.png", 
    "avatar11.png", "avatar12.png"
  ];

  const frames = ["default_frame", "bronze_frame", "silver_frame", "gold_frame", "platinum_frame", "diamond_frame", "ruby_frame"];

  avatars.forEach(id => {
    const isUnlocked = isRewardUnlocked("avatar", id);
    const reward = levelRewards.find(r => r.type === "avatar" && r.id === id);
    const wrapper = document.createElement("div");
    wrapper.className = "avatar-grid-entry";

    const img = document.createElement("img");
    img.src = `img/avatars/${id}`;
    img.className = "avatar-option avatar-choice";
    img.dataset.type = "avatar";
    img.dataset.id = id;
    if (!isUnlocked) img.classList.add("locked");

	img.onclick = async () => {
	  if (!img.classList.contains("locked")) {
	    localStorage.setItem("selectedAvatar", id);
	    applySavedAvatar();
	    closeAvatarSelector();
	    await saveProfile();
	  }
	};

    wrapper.appendChild(img);

    if (!isUnlocked && reward) {
      const note = document.createElement("div");
      note.className = "reward-note";
      note.innerText = `Odblokuj na poziomie ${reward.level}`;
      wrapper.appendChild(note);
    }

    avatarGrid.appendChild(wrapper);
  });

  frames.forEach(id => {
    const isUnlocked = isRewardUnlocked("frame", id);
    const reward = levelRewards.find(r => r.type === "frame" && r.id === id);
    const wrapper = document.createElement("div");
    wrapper.className = "avatar-grid-entry";

    const img = document.createElement("img");
    img.src = `img/frames/${id}.png`;
    img.className = "frame-option";
    img.dataset.type = "frame";
    img.dataset.id = id;
    if (!isUnlocked) img.classList.add("locked");

    img.onclick = async () => {
      if (!img.classList.contains("locked")) {
        localStorage.setItem("selectedFrame", id);
        applySavedFrame();
        closeAvatarSelector();
	await saveProfile();
      }
    };

    wrapper.appendChild(img);

    if (!isUnlocked && reward) {
      const note = document.createElement("div");
      note.className = "reward-note";
      note.innerText = `Odblokuj na poziomie ${reward.level}`;
      wrapper.appendChild(note);
    }

    frameGrid.appendChild(wrapper);
  });

  document.getElementById("avatarSelector").style.display = "flex";
}



function openBackgroundSelector() {
  const container = document.getElementById("backgroundGridContainer");
  container.innerHTML = "";

  const backgrounds = ["bg0.png", "bg1.png", "bg2.png", "bg3.png", "bg4.png"];

  backgrounds.forEach(id => {
    const isUnlocked = isRewardUnlocked("background", id);
    const reward = levelRewards.find(r => r.type === "background" && r.id === id);

    const wrapper = document.createElement("div");
    wrapper.className = "avatar-grid-entry";

    const img = document.createElement("img");
    img.src = `img/backgrounds/${id}`;
    img.className = "avatar-option background-choice";
    img.dataset.type = "background";
    img.dataset.id = id;
    if (!isUnlocked) img.classList.add("locked");

    img.onclick = async () => {
      if (!img.classList.contains("locked")) {
        localStorage.setItem("selectedBackground", id);
        applySavedBackground();
        closeBackgroundSelector();
	await saveProfile();
      }
    };

    wrapper.appendChild(img);

    if (!isUnlocked && reward) {
      const note = document.createElement("div");
      note.className = "reward-note";
      note.innerText = `Odblokuj na poziomie ${reward.level}`;
      wrapper.appendChild(note);
    }

    container.appendChild(wrapper);
  });

  document.getElementById("backgroundSelector").style.display = "flex";
}

     

function refreshAvatarSelector() {
  document.querySelectorAll('.avatar-choice').forEach(option => {
    const avatar = option.dataset.avatar;
    const isUnlocked = isRewardUnlocked("avatar", avatar);
    option.classList.toggle("locked", !isUnlocked);

    const rewardInfo = levelRewards.find(r => r.type === "avatar" && r.id === avatar);
    if (!isUnlocked && rewardInfo) {
      option.title = `Odblokuj na poziomie ${rewardInfo.level}`;
    } else {
      option.title = "";
    }
  });
}

function refreshBackgroundSelector() {
  document.querySelectorAll('.background-choice').forEach(option => {
    const bg = option.dataset.bg;
    const isUnlocked = isRewardUnlocked("background", bg);
    option.classList.toggle("locked", !isUnlocked);

    const rewardInfo = levelRewards.find(r => r.type === "background" && r.id === bg);
    if (!isUnlocked && rewardInfo) {
      option.title = `Odblokuj na poziomie ${rewardInfo.level}`;
    } else {
      option.title = "";
    }
  });
}

function closeBackgroundSelector() {
  document.getElementById("backgroundSelector").style.display = "none";
}

document.querySelectorAll('#backgroundSelector .avatar-option').forEach(option => {
  option.addEventListener('click', () => {
    const bg = option.dataset.bg;
    localStorage.setItem('selectedBackground', bg);
    applySavedBackground();
    closeBackgroundSelector();
	saveProfile();
  });
});

function applySavedBackground() {
  const saved = localStorage.getItem('selectedBackground') || 'bg0.png';
  const img = document.getElementById("profileBackgroundImage");
  if (saved && img) {
    img.src = `img/backgrounds/${saved}`;
  }
}

function switchAvatarTab(tab) {
  document.querySelectorAll('.avatar-tab-button').forEach(btn => {
    btn.classList.remove('active');
  });

  document.querySelectorAll('.tab-content').forEach(tabEl => {
    tabEl.style.display = 'none';
  });

  if (tab === 'avatars') {
    document.getElementById('avatarTab').style.display = 'block';
    document.querySelector('.avatar-tab-button:nth-child(1)').classList.add('active');
  } else {
    document.getElementById('frameTab').style.display = 'block';
    document.querySelector('.avatar-tab-button:nth-child(2)').classList.add('active');
  }
}


function closeAvatarSelector() {
  document.getElementById("avatarSelector").style.display = "none";
}

// Avatar selection
document.querySelectorAll('.avatar-choice').forEach(option => {
  option.addEventListener('click', () => {
    const avatar = option.dataset.avatar;
    if (!avatar) return;
    localStorage.setItem('selectedAvatar', avatar);
    document.getElementById('profileAvatar').src = `img/avatars/${avatar}`;
    closeAvatarSelector();
  });
});	

// Background selection
document.querySelectorAll('.background-choice').forEach(option => {
  option.addEventListener('click', () => {
    const bg = option.dataset.bg;
    if (!bg) return;
    localStorage.setItem('selectedBackground', bg);
    applySavedBackground();
    closeBackgroundSelector();
	saveProfile();
  });
});

function applySavedAvatar() {
  const avatar = localStorage.getItem('selectedAvatar') || 'avatar1.png';
  const avatarImg = document.getElementById('profileAvatar');
  if (avatar && avatarImg) {
    avatarImg.src = `img/avatars/${avatar}`;
  }
}

function applySavedFrame() {
  const frame = localStorage.getItem('selectedFrame') || 'default_frame';
  const frameImg = document.getElementById('profileAvatarFrame');

  if (!frameImg) return;

  const unlocked = isRewardUnlocked("frame", frame);
  if (frame !== 'none' && unlocked) {
    frameImg.src = `img/frames/${frame}.png`;
    frameImg.style.display = "block";
  } else {
    frameImg.style.display = "none";
  }
}

// ⚠️ Ta funkcja nie istnieje w Twoim kodzie – wklej ją jako nową
function startGameOnline(color) {
  isOnlineGame = true;
  console.log("🎯 Multiplayer start jako", color);
if (!currentRoomCode) {
  const inputValue = document.getElementById("roomCodeInput")?.value?.trim()?.toUpperCase();
  if (inputValue) currentRoomCode = inputValue;
}

  gameMode = "online";
  playerColor = color;
  currentTurn = "w"; // ← ❌ ZAMIEŃ NA TO:

  resetGame(false);
  moveLog = [];
  renderBoard();

  const boardEl = document.getElementById("board");
  if (playerColor === "b") {
    boardEl.classList.add("rotated");
  } else {
    boardEl.classList.remove("rotated");
  }

  document.getElementById("startScreen").style.display = "none";
  document.getElementById("gameScreen").style.display = "block";

  document.getElementById("startGame")?.classList.add("hidden");

  // 🟡 WAŻNE: ustaw kolejność tury tylko dla gracza białego
  if (playerColor === "w") {
    currentTurn = "w";
    updateStatus("Twoja kolej");
  } else {
    currentTurn = "w"; // ⬅️ nadal białe zaczynają, ale czarny nie ma tury
    updateStatus("Tura przeciwnika");
  }
  updateCapturedDisplay();
}

function updateTurnStatus() {
  if (gameMode === "online") {
    if (currentTurn === playerColor) {
      updateStatus("🎯 Twoja kolej");
    } else {
      updateStatus("⏳ Tura przeciwnika");
    }
  } else {
    updateStatus(currentTurn === "w" ? "Białe na ruchu" : "Czarne na ruchu");
  }
  console.log("🧠 currentTurn:", currentTurn, "| playerColor:", playerColor);

}


function setOnlineStatus(msg) {
  document.getElementById("onlineStatus").innerText = msg;
}

// 🔵 Odbiór zaproszenia do gry
socket.on('incomingGameInvite', ({ fromNick, roomCode }) => {
  currentGameInvite = { fromNick, roomCode };
  document.getElementById('inviteMessage').innerText = `${fromNick} zaprasza Cię do gry!`;
  document.getElementById('gameInvitePopup').style.display = "flex"; // pokaż popup
});

// ✅ Kliknięcie "Akceptuj"
document.getElementById('acceptInviteBtn').addEventListener('click', () => {
  if (currentGameInvite) {
    socket.emit('acceptGameInvite', { roomCode: currentGameInvite.roomCode, nickname: localStorage.getItem('currentUser') });
    document.getElementById('gameInvitePopup').style.display = "none"; // schowaj popup
    currentGameInvite = null;
  }
});

// ❌ Kliknięcie "Odrzuć"
document.getElementById('declineInviteBtn').addEventListener('click', () => {
  document.getElementById('gameInvitePopup').style.display = "none"; // schowaj popup
  currentGameInvite = null;
});

// 🔵 Funkcja do wysłania zaproszenia do znajomego
function inviteFriendToGame(friendId) {
  const myNick = localStorage.getItem("currentUser");
  if (!myNick || !friendId) return;

  // Tworzysz pokój i wysyłasz zaproszenie
  socket.emit('createGameInvite', { fromNick: myNick, toFriendId: friendId });
}

socket.on('renderFriendsList', async () => {
  console.log("🔄 Odbieram renderFriendsList");
  await refreshUsers();
  renderFriendsList();
});

if (socket) {
  socket.on("roomCreated", ({ roomCode }) => {
    currentRoomCode = roomCode;
    document.getElementById("roomCodeInput").value = roomCode;
    setOnlineStatus(`📋 Kod pokoju: ${roomCode}`);
  });  
  
  socket.on("roomJoined", ({ roomCode }) => {
    currentRoomCode = roomCode;
    console.log("🎮 currentRoomCode ustawiony:", currentRoomCode);
  });  

  socket.on("roomError", ({ message }) => {
    setOnlineStatus(`❌ Błąd: ${message}`);
  });

socket.on("startGame", ({ colorMap, roomCode }) => {
// 🔥 Ukryj overlay szukania przeciwnika
const matchmakingOverlay = document.getElementById('matchmakingOverlay');
if (matchmakingOverlay) matchmakingOverlay.classList.add('popup-hidden');
  const myColor = colorMap[socket.id];
  startGameOnline(myColor);

  // ✅ Ustaw currentRoomCode na podstawie danych od serwera
  currentRoomCode = roomCode;
  console.log("📝 currentRoomCode ustawione na podstawie servera:", currentRoomCode);

  // ✅ Jeśli jesteś w profilu – zamknij profil
 if (document.getElementById("profileScreen").style.display === "block") {
    closeProfileScreen();
}

  // ✅ Przejdź do gry
  document.getElementById("startGame").click();
});

  socket.on("opponentMove", ({ from, to, promotion, senderId, newTurn }) => {
    console.log("📥 Otrzymano opponentMove:", { from, to, promotion, senderId, newTurn });
    
    const sx = from.x, sy = from.y, dx = to.x, dy = to.y;
    const isOwnMove = senderId === socketId;
  
    let attackerPiece = boardState[sy][sx];
    let victimPiece = boardState[dy][dx];
  
    if (isOwnMove && lastSentMove) {
      attackerPiece = lastSentMove.attackerPiece;
      victimPiece = lastSentMove.victimPiece;
    }
  
    if (typeof newTurn !== "undefined") {
      currentTurn = newTurn;
    }
  
    const result = tryMove(sx, sy, dx, dy, false, promotion || null, true);
  
    if (result === "promotion") {
      const isWhite = pieceColor(attackerPiece) === "w";
      const promo = promotion || "Q"; // ✅ poprawnie odczytaj z serwera
      const newPiece = isWhite ? promo.toUpperCase() : promo.toLowerCase();
      boardState[dy][dx] = newPiece;
      boardState[sy][sx] = '';
    }    
  
    if (victimPiece && victimPiece.toLowerCase() !== 'k') {
      const color = pieceColor(attackerPiece);
      const type = victimPiece.toUpperCase();
      if (color === 'w') capturedByWhite[type]++;
      else capturedByBlack[type]++;
      updateCapturedDisplay();
    }
  
    logMove(sx, sy, dx, dy, boardState[dy][dx], victimPiece || '');
  
    const fromSquare = document.querySelector(`.square[data-x="${sx}"][data-y="${sy}"]`);
    const toSquare = document.querySelector(`.square[data-x="${dx}"][data-y="${dy}"]`);
    const pieceElem = fromSquare?.querySelector('.piece');
    
    const onFinish = () => {
      renderBoard();
      updateCapturedDisplay();
      updateTurnStatus();
      updateGameStatus();
      updateEvaluationBar();
  
      // ⬇️ Zablokuj, dopóki to nie Twoja tura
      isInputLocked = currentTurn !== playerColor;
    };
  
    if (pieceElem && fromSquare && toSquare) {
      isAnimationRunning = true;
      animatePieceMove(pieceElem, fromSquare, toSquare, 500, onFinish);
    } else {
      onFinish();
    }
  
    lastSentMove = null;
  });
  

socket.on("opponentLeft", () => {
  showDisconnectedPopup("Przeciwnik opuścił grę 😢");
});
  
}

function rebindPopupButtons() {
  const popupConfirmBtn = document.getElementById("popupConfirmBtn");
  const popupCancelBtn = document.getElementById("popupCancelBtn");

  if (popupConfirmBtn) {
    popupConfirmBtn.onclick = null;
  }
  if (popupCancelBtn) {
    popupCancelBtn.onclick = null;
  }
}

function closeBackgroundSelector() {
  document.getElementById("backgroundSelector").style.display = "none";
}

document.querySelectorAll('#backgroundSelector .avatar-option').forEach(option => {
  option.addEventListener('click', () => {
    const bg = option.dataset.bg;
    localStorage.setItem('selectedBackground', bg);
    applySavedBackground();
    closeBackgroundSelector();
	saveProfile();
  });
});

window.addEventListener("load", () => {
  const height = window.innerHeight;
  const startWrapper = document.getElementById("startWrapper");

  if (height <= 770) {
    startWrapper.classList.add("scale-small-ui");
  }
});
function checkUpdatePopup() {
  const currentVersion = "0.6.0"; // 🔥 TU wpisujesz aktualną wersję gry
  const seenVersion = localStorage.getItem("seenUpdateVersion");

  if (seenVersion !== currentVersion) {
    showPopupAdvanced({
      message: "🚀 Nowa wersja Chessence! Odśwież stronę, aby wczytać aktualizację.",
      confirm: false,
      onConfirm: () => {
        localStorage.setItem("seenUpdateVersion", currentVersion);
      }
    });
  }
}
document.getElementById("prevAchievementsPage").addEventListener("click", () => {
  if (currentAchievementsPage > 0) {
    const list = document.getElementById("achievementsList");
    list.classList.add("fade-out");
    setTimeout(() => {
      currentAchievementsPage--;
      updateAchievementsUI();
      list.classList.remove("fade-out");
      list.classList.add("fade-in");
      setTimeout(() => list.classList.remove("fade-in"), 250);
    }, 200);
  }
});

document.getElementById("nextAchievementsPage").addEventListener("click", () => {
  const maxPage = Math.ceil(achievementsList.length / achievementsPerPage) - 1;
  if (currentAchievementsPage < maxPage) {
    const list = document.getElementById("achievementsList");
    list.classList.add("fade-out");
    setTimeout(() => {
      currentAchievementsPage++;
      updateAchievementsUI();
      list.classList.remove("fade-out");
      list.classList.add("fade-in");
      setTimeout(() => list.classList.remove("fade-in"), 250);
    }, 200);
  }
});

document.getElementById("exitButton").addEventListener("click", () => {
  if (typeof window !== "undefined" && window.close) {
    window.close(); // działa w Electronie
  }
});

document.getElementById("createRoomBtn").addEventListener("click", () => {
  if (!socket) return;
  const nickname = "Gracz"; // W przyszłości: pobierane z profilu
  socket.emit("createRoom", { nickname });
  setOnlineStatus("🕐 Tworzenie pokoju...");
});

document.getElementById("joinRoomBtn").addEventListener("click", () => {
  if (!socket) return;
  const roomCode = document.getElementById("roomCodeInput").value.trim().toUpperCase();
  if (!roomCode) {
    setOnlineStatus("❌ Wpisz kod pokoju");
    return;
  }
  const nickname = "Gracz";
  socket.emit("joinRoom", { roomCode, nickname });
  setOnlineStatus("🔄 Dołączanie do pokoju...");
});
const findMatchBtn = document.getElementById('findMatchBtn');
const matchmakingOverlay = document.getElementById('matchmakingOverlay');
const cancelMatchBtn = document.getElementById('cancelMatchBtn');

findMatchBtn.addEventListener('click', () => {
  socket.emit('matchmake', { nickname: activeUserNick  });
  matchmakingOverlay.classList.remove('popup-hidden');
});

cancelMatchBtn.addEventListener('click', () => {
  matchmakingOverlay.classList.add('popup-hidden');
  // Możesz ewentualnie rozważyć anulowanie wyszukiwania po stronie serwera (opcja zaawansowana na przyszłość)
});

renderBoard();

async function getUsers() {
  if (window.cachedUsers) {
    return window.cachedUsers;
  }

  const stored = localStorage.getItem("users");
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      window.cachedUsers = parsed; // 🔥 Jak ładujemy z localStorage też ustawiamy RAM
      return parsed;
    } catch (e) {
      console.error("Błąd parsowania użytkowników:", e);
    }
  }

  return {}; // Brak danych
}

async function saveUsers(users) {
  await fetch(`${API_BASE}/api/users/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ users }),
  });
}

function showScreen(screenId) {
  ["registerScreen", "loginScreen", "startScreen", "profileScreen", "gameScreen", "endScreen"]
    .forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = "none";
    });

  const target = document.getElementById(screenId);
  if (target) target.style.display = "flex";

  // 🔐 Ukrywaj guziki jeśli nie jesteśmy w grze
  const authControls = document.getElementById("authControls");
  if (authControls) {
    authControls.style.display = screenId === "startScreen" ? "block" : "none";
  }
}

async function startGameWithUser(nick) {
  try {
    // 🔥 Najpierw na pewno pobierz aktualnych użytkowników
    await refreshUsers();

    // 🔥 Pobierz dane gracza z aktualnych users
    const users = await getUsers();
    const user = users[nick];

    if (!user) {
      console.error('Nie znaleziono użytkownika w users po zalogowaniu.');
      showPopupAdvanced({
	  message: "Błąd ładowania danych użytkownika. Spróbuj zalogować się ponownie.",
	  confirm: false
	});
      showScreen("loginScreen");
      return;
    }

    activeUserNick = nick;
    localStorage.setItem("currentUser", nick);

    document.getElementById("playerNickname").textContent = nick;

    showScreen("startScreen");

    achievements = user.achievements || {};
    localStorage.setItem("selectedAvatar", user.ui?.avatar || "avatar1.png");
    localStorage.setItem("selectedBackground", user.ui?.background || "bg0.png");
    localStorage.setItem("selectedFrame", user.ui?.frame || "default_frame");

    unlockedFrames = user.unlockedFrames || [];
    currentFrame = user.ui?.frame || "default_frame";

    updateProfileUI();
    applySavedAvatar();
    applySavedFrame();

    await validateUnlockedRewards();
    await enforceLocksByLevel();
    await validateFriendsList();
    await renderFriendsList();

    socket.emit('registerPlayer', {
      nick: nick,
      id: user.id
    });

  } catch (error) {
    console.error('❌ Błąd startu gry:', error);
    showPopupAdvanced({
	  message: "Wystąpił błąd podczas uruchamiania gry.",
	  confirm: false
	});
    showScreen("loginScreen");
  }
}


window.addEventListener("DOMContentLoaded", () => {
  // wymuś logowanie
  localStorage.removeItem("currentUser");
  showScreen("loginScreen");
  document.getElementById("startScreen").style.display = "none";
  document.getElementById("profileScreen").style.display = "none";
  activeUserNick = null;
  checkUpdatePopup();
});



document.getElementById("switchToLogin").addEventListener("click", () => {
  showScreen("loginScreen");
});

document.getElementById("switchToRegister").addEventListener("click", () => {
  showScreen("registerScreen");
});

document.getElementById("registerSubmit").addEventListener("click", async () => {
  await tryRegister();
});


loginButton.addEventListener('click', async () => {
  const nick = document.getElementById('loginNickname').value.trim();
  const pass = document.getElementById('loginPassword').value.trim();

  if (!nick || !pass) {
    showFloatingStatus("Podaj nazwę użytkownika i hasło", "showPopup");
    return;
  }

  let loggedUser = null;
  try {
    loggedUser = await loginUser(nick, pass); // próbujemy się zalogować
  } catch (error) {
    console.error('❌ Błąd logowania:', error);
    showPopupAdvanced({
  message: "Logowanie nie powiodło się. Sprawdź dane.",
  confirm: false,
  onConfirm: () => {
    document.getElementById("loginPassword").value = ""; // 🔥 czyścimy hasło
  }
});
    return; // jeśli błąd, zatrzymujemy się
  }

  if (!loggedUser) {
    showPopupAdvanced({
  message: "Nie udało się zalogować. Spróbuj ponownie.",
  confirm: false,
  onConfirm: () => {
    document.getElementById("loginPassword").value = ""; // 🔥 czyścimy hasło
  }
});
    return;
  }

  await startGameWithUser(loggedUser.nick); // przekazujemy nick z serwera
});


document.getElementById("openProfileBtn").addEventListener("click", () => {
  viewingFriendProfile = false;
  openProfileScreen();
});
document.getElementById("logoutBtn").addEventListener("click", () => {
showPopupAdvanced({
  message: "Na pewno chcesz się wylogować?",
  confirm: true,
  onConfirm: () => {
    logout();
  }
});
});

document.getElementById("deleteAccountBtn").addEventListener("click", () => {
  showPopupAdvanced({
    message: "Aby usunąć konto, wpisz swoje hasło:",
    input: true,
    confirm: true,
    onConfirm: async (pass) => {
      if (!pass) return;

      const currentUser = activeUserNick || localStorage.getItem("currentUser");

      try {
        const response = await fetch(`${API_BASE}/api/users/delete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nick: currentUser, password: pass })
        });

        if (response.ok) {
          // 🔥 UWAGA! Teraz nie robimy nowego popupu OD RAZU
          setTimeout(() => { 
            showPopupAdvanced({
              message: "✅ Twoje konto zostało usunięte. Kliknij OK aby przejść na ekran rejestracji.",
              confirm: false,
              onConfirm: () => {
                localStorage.clear();
                activeUserNick = null;
                showScreen("registerScreen");
              }
            });
          }, 300); // 🔥 Po krótkim czasie, po cleanUp starego popupu
        } else {
          const errorText = await response.text();
          setTimeout(() => {
            showPopupAdvanced({
              message: errorText || "Nie udało się usunąć konta. Spróbuj ponownie.",
              confirm: false
            });
          }, 300);
        }
      } catch (error) {
        console.error(error);
        setTimeout(() => {
          showPopupAdvanced({
            message: "Błąd połączenia z serwerem.",
            confirm: false
          });
        }, 300);
      }
    }
  });
});


const resetProgressBtn = document.getElementById("resetProgressBtn");
if (resetProgressBtn) {
  resetProgressBtn.addEventListener("click", resetProfile);
}

const resetFriendBtn = document.getElementById("resetFriendBtn");
if (resetFriendBtn) {
  resetFriendBtn.addEventListener("click", resetProfile);
}

document.getElementById("profileAvatar").addEventListener("click", () => {
  openAvatarSelector();
});
function initBackToOwnProfileBtn() {
  const backBtn = document.getElementById("backToOwnProfileBtn");
  if (backBtn && !backBtn.hasAttribute("data-initialized")) {
    backBtn.addEventListener("click", () => {
      openProfileScreen(); // wraca do własnego profilu
    });
    backBtn.setAttribute("data-initialized", "true");
  }
}
document.addEventListener("DOMContentLoaded", () => {
  initBackToOwnProfileBtn(); // będzie dostępne po załadowaniu DOM
});
function showDisconnectedPopup(message) {
  const overlay = document.createElement("div");
  overlay.className = "disconnect-overlay";
  overlay.innerHTML = `
    <div class="disconnect-box">
      <div class="disconnect-message">${message}</div>
      <button id="returnToMenuBtn">Wróć do menu</button>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById("returnToMenuBtn").addEventListener("click", () => {
    overlay.remove();
    currentRoomCode = null;
    gameMode = null;
    pvpSubmode = null;
    showStartMenu();
  });
}
let currentVersion = "0.6.0"; // 🚀 Ustawiona wersja gry

socket.on('serverVersionUpdate', (data) => {
  if (!data || !data.version) return;

  if (data.version !== currentVersion) {
    const updatePopup = document.getElementById("updatePopup");
    const reloadBtn = document.getElementById("reloadGameBtn");

    if (updatePopup && reloadBtn) {
      updatePopup.classList.remove("popup-hidden");

      // Odblokuj guzik
      reloadBtn.disabled = false;
      reloadBtn.classList.add("active");

      reloadBtn.onclick = () => {
        location.reload(true); // Pełny reload strony
      };
    }
  }
});
