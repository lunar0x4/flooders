const axios = require('axios');
const WebSocket = require('ws');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const readline = require('readline');

puppeteer.use(StealthPlugin());

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const FIREBASE_API_KEY = "AIzaSyCA-cTOnX19f6LFnDVVsHXya3k6ByP_MnU";

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function generateRandomName(prefix, botNumber) {
    const randomChars = Math.random().toString(36).substring(2, 5);
    return `${prefix}_${randomChars}${botNumber}`;
}

async function getCookiesFromBlooket(gameId) {
    console.log('[+] Getting cookies from puppeteer, this will only launch once per run.');
    const browser = await puppeteer.launch({ 
        headless: true,
        pipe: true,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-features=TranslateUI',
            '--disable-ipc-flooding-protection',
            '--disable-features=HttpsUpgrades',
            '--disable-sync',
            '--disable-default-apps',
            '--disable-extensions',
            '--disable-component-extensions-with-background-pages',
            '--disable-domain-reliability',
            '--disable-client-side-phishing-detection',
            '--disable-crash-reporter',
            '--disable-breakpad',
            '--disable-component-update',
            '--disable-logging',
            '--disable-bundled-ppapi-flash',
            '--disable-print-preview',
            '--disable-notifications',
            '--no-default-browser-check',
            '--no-first-run',
            '--no-pings',
            '--no-experiments',
            '--no-zygote',
            '--single-process',
            '--memory-pressure-off',
            '--max_old_space_size=256'
        ]
    });
    const page = await browser.newPage();
    
    await page.goto('https://play.blooket.com/play');
    
    await page.evaluate(() => {
        const input = document.querySelector('input[placeholder="Game ID"]');
        if (input) input.value = '';
    });
    
    await page.type('input[placeholder="Game ID"]', gameId, { delay: 50 });
    await page.keyboard.press('Enter');
    
    await page.waitForFunction(
        () => window.location.pathname.includes('/play/register'),
        { timeout: 15000 }
    ).catch(() => console.log('[!] Didn\'t redirect to register page'));
    
    const cookies = await page.cookies();
    await browser.close();
    
    console.log('[+] Got cookies successfully!');
    return cookies.map(c => `${c.name}=${c.value}`).join('; ');
}

async function joinBlooketBot(gameId, username, cookieString) {
    try {
        const joinResponse = await axios.put('https://fb.blooket.com/c/firebase/join', {
            id: gameId,
            name: username
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Cookie': cookieString,
                'Origin': 'https://play.blooket.com',
                'Referer': 'https://play.blooket.com/play'
            }
        });
        
        if (!joinResponse.data.success) {
            return null;
        }
        
        const { fbShardURL, fbToken } = joinResponse.data;
        
        const signInResponse = await axios.post(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${FIREBASE_API_KEY}`, {
            token: fbToken,
            returnSecureToken: true
        });
        
        const { idToken } = signInResponse.data;
        
        const wsUrl = fbShardURL.replace('https://', 'wss://') + '.ws?v=5';
        const ws = new WebSocket(wsUrl);
        
        let messageId = 1;
        let joined = false;
        
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                if (!joined) {
                    ws.close();
                    resolve(null);
                }
            }, 10000);
            
            ws.on('open', () => {
                ws.send(JSON.stringify({
                    t: "d",
                    d: { r: messageId++, a: "s", b: { c: { "sdk.js.10-10-0": 1 } } }
                }));
                
                ws.send(JSON.stringify({
                    t: "d",
                    d: { r: messageId++, a: "auth", b: { cred: idToken } }
                }));
                
                setTimeout(() => {
                    ws.send(JSON.stringify({
                        t: "d",
                        d: { r: messageId++, a: "p", b: { p: `/${gameId}/c/${username}`, d: { b: "Sheep" } } }
                    }));
                }, 500);
                
                setTimeout(() => {
                    ws.send(JSON.stringify({
                        t: "d",
                        d: { r: messageId++, a: "q", b: { p: `/${gameId}`, h: "" } }
                    }));
                }, 1000);
            });
            
            ws.on('message', (data) => {
                const msg = data.toString();
                if (msg.includes('"a":"d"') && !joined) {
                    joined = true;
                    clearTimeout(timeout);
                    console.log(`[✓] ${username} joined the game!`);
                    resolve({ ws, username });
                }
            });
            
            ws.on('error', () => {
                clearTimeout(timeout);
                resolve(null);
            });
        });
        
    } catch(error) {
        return null;
    }
}

async function main() {
    console.log(`╔═══════════════════════════════════════════╗
║         BLOOKET MASS JOINER BOT           ║
║   By lunar0x4 - spam blooket games with   ║
║                 bots!                     ║
╚═══════════════════════════════════════════╝`);
    
    rl.question('Enter Game ID: ', async (gameId) => {
        rl.question('Number of bots to spawn: ', async (botCount) => {
            rl.question('Username prefix (e.g., "htu"): ', async (prefix) => {
                rl.close();
                    
                const count = parseInt(botCount);
                    
                if (isNaN(count) || count <= 0) {
                    console.log('[-] Invalid bot count!');
                    return;
                }
                    
                console.log(`\n[+] Target Game: ${gameId}`);
                console.log(`[+] Bot Count: ${count}`);
                console.log(`[+] Username Prefix: ${prefix}`);
                
                const cookieString = await getCookiesFromBlooket(gameId);
                    
                console.log(`[+] Spawning ${count} bots...\n`);
                    
                const bots = [];
                 for (let i = 1; i <= count; i++) {
                    const username = generateRandomName(prefix, i);
                    const bot = await joinBlooketBot(gameId, username, cookieString);
                    if (bot) {
                        bots.push(bot);
                    }
                    await delay(50); // change to what u want, lower = better, 1000 = 1 second
                }
                    
                console.log(`\n[✓] ${bots.length}/${count} bots successfully joined!`);
            });
        });
    });
}

main().catch(console.error);
