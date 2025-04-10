const express = require('express');
const fs = require('fs');
const path = require('path');
const { makeid } = require('./gen-id');
const { upload } = require('./mega');
const pino = require("pino");
const { 
    makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    Browsers, 
    makeCacheableSignalKeyStore,
    DisconnectReason
} = require('@whiskeysockets/baileys');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Global state
let botState = {
    isChatbotActive: true,
    currentSession: null,
    lastBioUpdate: null
};

// Session configuration
const SESSION_TEMP_DIR = './temp';
const SESSION_PREFIX = 'CRISS-AI-';

// Initialize Express
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Helper functions
function removeFile(FilePath) {
    if (!fs.existsSync(FilePath)) return false;
    fs.rmSync(FilePath, { recursive: true, force: true });
}

function selectRandomItem(array) {
    return array[Math.floor(Math.random() * array.length)];
}

function generateRandomSessionId() {
    const prefix = "3EB";
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let randomText = prefix;
    for (let i = prefix.length; i < 22; i++) {
        randomText += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return randomText;
}

// 1. Session Initialization
async function initializeWhatsAppSession() {
    const sessionId = makeid();
    const sessionDir = path.join(SESSION_TEMP_DIR, sessionId);
    
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    
    const sock = makeWASocket({
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
        },
        printQRInTerminal: false,
        generateHighQualityLinkPreview: true,
        logger: pino({ level: "fatal" }),
        syncFullHistory: false,
        browser: Browsers.macOS(selectRandomItem(["Safari"]))
    });

    sock.ev.on('creds.update', saveCreds);
    
    return { sock, sessionDir };
}

// 2. Chatbot Core Functionality
async function setupChatbotHandlers(sock) {
    // Message handler
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message.message) return;

        const text = message.message.conversation || '';
        const sender = message.key.remoteJid;

        // Command handling
        if (text.startsWith('!')) {
            await handleCommand(sock, sender, text);
            return;
        }

        // Regular message processing
        if (botState.isChatbotActive) {
            await processMessage(sock, sender, text);
        }
    });

    // Connection handler
    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === "open") {
            console.log(`✅ Connected as ${sock.user.id}`);
            
            // Auto-bio update
            setInterval(() => updateBio(sock), 60000);
            
            // Session backup
            await backupSession(sock);
        } 
        else if (connection === "close" && lastDisconnect?.error?.output?.statusCode !== 401) {
            console.log("Connection closed, reconnecting...");
            await delay(1000);
            setupChatbotHandlers(sock);
        }
    });
}

// 3. Command Handling
async function handleCommand(sock, sender, command) {
    command = command.toLowerCase().trim();
    
    switch(command) {
        case '!chatbot on':
            botState.isChatbotActive = true;
            await sock.sendMessage(sender, { text: '🤖 Chatbot activated' });
            break;
            
        case '!chatbot off':
            botState.isChatbotActive = false;
            await sock.sendMessage(sender, { text: '🤖 Chatbot deactivated' });
            break;
            
        case '!status':
            const status = botState.isChatbotActive ? 'active ✅' : 'inactive ❌';
            await sock.sendMessage(sender, { 
                text: `Bot Status: ${status}\nLast Bio Update: ${botState.lastBioUpdate || 'Never'}` 
            });
            break;
            
        default:
            await sock.sendMessage(sender, { text: 'Unknown command. Try !chatbot on/off' });
    }
}

// 4. Message Processing
async function processMessage(sock, sender, text) {
    try {
        const response = await axios.post('https://api.gurusensei.workers.dev/llama', {
            message: text
        });

        await sock.sendMessage(sender, { 
            text: response.data.response,
            contextInfo: {
                externalAdReply: {
                    title: "CRISS-AI Response",
                    body: "Powered by Llama API",
                    thumbnailUrl: "https://files.catbox.moe/gs8gi2.jpg",
                    sourceUrl: "https://whatsapp.com/channel/0029Vb0HIV2G3R3s2II4181g"
                }
            }
        });
    } catch (error) {
        console.error('API error:', error);
        await sock.sendMessage(sender, { text: '⚠️ Error processing your message' });
    }
}

// 5. Session Backup
async function backupSession(sock) {
    try {
        const sessionId = generateRandomSessionId();
        const credsPath = path.join(SESSION_TEMP_DIR, sock.user.id, 'creds.json');
        
        if (fs.existsSync(credsPath)) {
            const megaUrl = await upload(fs.createReadStream(credsPath), `${sessionId}.json`);
            const sessionCode = SESSION_PREFIX + megaUrl.replace('https://mega.nz/file/', '');
            
            await sock.sendMessage(sock.user.id, { 
                text: sessionCode,
                contextInfo: {
                    externalAdReply: {
                        title: "Session Backup",
                        thumbnailUrl: "https://files.catbox.moe/gs8gi2.jpg",
                        sourceUrl: "https://github.com/criss-vevo/CRISS-AI"
                    }
                }
            });
            
            botState.currentSession = sessionCode;
        }
    } catch (error) {
        console.error('Session backup failed:', error);
    }
}

// 6. Bio Update
async function updateBio(sock) {
    try {
        const now = new Date().toLocaleString();
        await sock.updateProfileStatus(`🤖 Active | ${now}`);
        botState.lastBioUpdate = now;
    } catch (error) {
        console.error('Bio update failed:', error);
    }
}

// Main initialization
async function startBot() {
    try {
        const { sock, sessionDir } = await initializeWhatsAppSession();
        botState.currentSession = sessionDir;
        
        await setupChatbotHandlers(sock);
        
        // Cleanup on exit
        process.on('exit', () => {
            removeFile(sessionDir);
        });
        
        return sock;
    } catch (error) {
        console.error('Bot initialization failed:', error);
        process.exit(1);
    }
}

// Start the server and bot
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    startBot().then(() => {
        console.log('WhatsApp bot initialized');
    });
});

module.exports = app;
