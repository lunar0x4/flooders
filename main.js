const fetch = require('node-fetch');
const WebSocket = require('ws');
const readline = require('readline');

function blue(text) {
    let faded = "";
    let green = 35;
    for (const character of text) {
        green += 3;
        if (green > 255) green = 255;
        faded += `\x1b[38;2;0;${green};220m${character}`;
    }
    return faded;
}

function red(text) {
    let faded = "";
    let green = 35;
    for (const character of text) {
        green += 3;
        if (green > 255) green = 255;
        faded += `\x1b[38;2;220;${Math.floor(green/2)};0m${character}`;
    }
    return faded;
}

function green(text) {
    let faded = "";
    let blue = 35;
    for (const character of text) {
        blue += 3;
        if (blue > 255) blue = 255;
        faded += `\x1b[38;2;0;220;${blue}m${character}`;
    }
    return faded;
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function generateRandomName() {
    const firstNames = ["Hugh", "Mike", "Ben", "Phil", "Barry", "Harry", "Jack", "Joe", "Tim", "Tom", "Dick", "Bob", "Bill", "Will", "John", "Jim", "Dan", "Sam", "Max", "Leo", "Ima", "Seymour", "Mike", "Lou", "Drew", "Justin", "Chris", "Pat", "Les", "Ray", "Lynn", "Gene", "Lee", "Kelly", "Morgan", "Casey", "Riley", "Cameron", "Jessie", "Jackie"];
    const lastNames = ["Jass", "Hunt", "Dee", "Butter", "Weener", "Small", "Long", "Johnson", "Wang", "Davis", "Brown", "Wilson", "Moore", "Taylor", "Anderson", "Cox", "Dick", "Fitz", "Hertz", "Koch", "Kuntz", "Lust", "Peacock", "Popp", "Putz", "Semenov", "Shuffler", "Staines", "Wax", "Weiner", "Willetts"];

    const randomLetters = Array.from({ length: 4 }, () =>
        String.fromCharCode(97 + Math.floor(Math.random() * 26))
    ).join("");

    return `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}${randomLetters}`;
}

function generateRandomUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

async function joinWayground(roomCode, botIndex) {
    const botName = generateRandomName();
    const botUid = generateRandomUID();
    
    console.log(green(`[Bot ${botIndex}] Spawning: ${botName}`));
    
    const checkRoomResponse = await fetch('https://wayground.com/play-api/v5/checkRoom', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Origin': 'https://wayground.com',
            'Referer': 'https://wayground.com/join'
        },
        body: JSON.stringify({ roomCode: roomCode })
    });

    const checkRoomData = await checkRoomResponse.json();
    const roomHash = checkRoomData.room.hash;
    
    const wsUrl = `wss://socket.wayground.com/_gsocket/main/?experiment=authRevamp&x-quizizz-uid=${botUid}&EIO=4&transport=websocket`;
    
    const ws = new WebSocket(wsUrl);
    let socketId = null;
    let serverId = null;
    let playerIp = null;
    let joined = false;
    
    ws.on('open', () => {
        ws.send('40');
    });
    
    ws.on('message', (data) => {
        const message = data.toString();
        
        if (message.startsWith('40') && !socketId) {
            try {
                const parsed = JSON.parse(message.substring(2));
                socketId = parsed.sid;
            } catch(e) {}
        }
        
        if (message.startsWith('42["handshakeData"') && !joined) {
            try {
                const handshakeData = JSON.parse(message.substring(2))[1];
                serverId = handshakeData.serverId;
                playerIp = handshakeData.ip;
                
                const joinPayload = {
                    roomHash: roomHash,
                    player: {
                        id: botName,
                        name: "",
                        origin: "web",
                        isGoogleAuth: false,
                        avatarId: Math.floor(Math.random() * 30) + 1,
                        startSource: "joinRoom",
                        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                        uid: botUid,
                        expName: "main_main",
                        expSlot: "8"
                    },
                    powerupInternalVersion: "20",
                    serverId: serverId,
                    ip: playerIp,
                    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    socketId: socketId,
                    authCookie: null,
                    socketExperiment: "authRevamp"
                };
                
                setTimeout(async () => {
                    try {
                        const joinResponse = await fetch('https://wayground.com/play-api/v5/join', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                                'Origin': 'https://wayground.com',
                                'Referer': 'https://wayground.com/join'
                            },
                            body: JSON.stringify(joinPayload)
                        });
                        
                        const joinData = await joinResponse.json();
                        joined = true;
                        console.log(blue(`[Bot ${botIndex}] ${botName} joined!`));
                    } catch(e) {
                        console.log(red(`[Bot ${botIndex}] ${botName} join error: ${e.message}`));
                    }
                }, 500);
            } catch(e) {}
        }
    });
    
    ws.on('error', (error) => {
        console.error(red(`[Bot ${botIndex}] ${botName} WebSocket error: ${error.message}`));
    });
    
    const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send('2');
        }
    }, 25000);
    
    return { ws, pingInterval, botName, botIndex };
}

async function spawnBots(roomCode, botCount) {
    console.log(blue(`\n[+] Target Room: ${roomCode}`));
    console.log(blue(`[+] Bot Count: ${botCount}`));
    console.log(blue(`[+] Spawning ${botCount} bots concurrently...\n`));
    
    const botPromises = [];
    for (let i = 0; i < botCount; i++) {
        botPromises.push(joinWayground(roomCode, i + 1));
    }
    
    const bots = await Promise.all(botPromises);
    
    console.log(green(`\n[✓] All ${botCount} bots spawned! Running for 60 seconds...\n`));
    
    await new Promise(resolve => setTimeout(resolve, 60000));
    
    console.log(blue(`\n[*] Disconnecting ${botCount} bots...`));
    bots.forEach(bot => {
        clearInterval(bot.pingInterval);
        bot.ws.close();
    });
    
    console.log(green(`[✓] All bots disconnected\n`));
    process.exit(0);
}

console.log(blue(`
╔═══════════════════════════════════════╗
║      lunar0x4's Quizizz Flooder       ║
║    Mass join tool - Use responsibly   ║
╚═══════════════════════════════════════╝
`));

rl.question(blue('Enter room code: '), (roomCode) => {
    rl.question(blue('How many bots to spawn? '), (botCount) => {
        const count = parseInt(botCount);
        if (isNaN(count) || count <= 0) {
            console.log(red('Invalid bot count! Please enter a positive number.'));
            rl.close();
            process.exit(1);
        }
        rl.close();
        spawnBots(roomCode, count).catch(console.error);
    });
});
