const express = require('express');
const fs = require('fs');
const zlib = require('zlib');
const fetch = require('node-fetch');
const pino = require("pino");
const { makeid } = require('./gen-id');
const { upload } = require('./mega');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    Browsers,
    makeCacheableSignalKeyStore,
    DisconnectReason,
    getContentType,
} = require('@whiskeysockets/baileys');

const router = express.Router();

let isChatbotActive = true; // Default chatbot state

function removeFile(FilePath) {
    if (fs.existsSync(FilePath)) fs.rmSync(FilePath, { recursive: true, force: true });
}

function getCurrentDateTime() {
    const options = {
        timeZone: 'Africa/Nairobi',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    };
    return new Intl.DateTimeFormat('en-KE', options).format(new Date());
}

async function startAutoBioUpdate(bot) {
    setInterval(async () => {
        const bioText = `GIFTED-MD is online! 🚀\n"${getCurrentDateTime()}"`;
        await bot.updateProfileStatus(bioText);
        console.log(`Updated Bio: ${bioText}`);
    }, 60000);
}

async function handleChatbotMessage(bot, message) {
    const remoteJid = message.key.remoteJid;
    const messageContent = message.message.conversation || message.message.extendedTextMessage?.text;

    if (message.key.fromMe) return;

    try {
        const apiUrl = 'https://api.gurusensei.workers.dev/llama';
        const response = await fetch(`${apiUrl}?prompt=${encodeURIComponent(messageContent)}`);
        const data = await response.json();

        if (data && data.response?.response) {
            const replyText = data.response.response;
            await bot.sendPresenceUpdate("composing", remoteJid);
            await delay(1000);
            await bot.sendMessage(remoteJid, { text: replyText });
        } else {
            throw new Error('Invalid response from GPT API.');
        }
    } catch (err) {
        console.error("CHATBOT Error:", err.message);
        await bot.sendMessage(remoteJid, {
            text: "Sorry, I couldn't process your message. Please try again later."
        });
    }
}

async function handleCommand(bot, message) {
    const remoteJid = message.key.remoteJid;
    const messageContent = message.message.conversation || message.message.extendedTextMessage?.text;

    if (messageContent?.startsWith('!chatbot')) {
        const args = messageContent.split(' ');
        const command = args[1];

        if (command === 'on') {
            isChatbotActive = true;
            await bot.sendMessage(remoteJid, { text: 'Chatbot has been activated!' });
        } else if (command === 'off') {
            isChatbotActive = false;
            await bot.sendMessage(remoteJid, { text: 'Chatbot has been deactivated!' });
        } else {
            await bot.sendMessage(remoteJid, { text: 'Usage: !chatbot [on/off]' });
        }
    }
}

router.get('/', async (req, res) => {
    const id = makeid();
    const num = req.query.number.replace(/[^0-9]/g, '');

    async function GIFTED_MD_PAIR_CODE() {
        const sessionPath = './temp/' + id;
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

        try {
            const sock = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                printQRInTerminal: false,
                generateHighQualityLinkPreview: true,
                logger: pino({ level: "fatal" }).child({ level: "fatal" }),
                browser: Browsers.macOS('Safari'),
            });

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect } = s;

                if (connection === "close" && lastDisconnect?.error?.output?.statusCode !== 401) {
                    console.log("Reconnecting...");
                    await delay(10000);
                    GIFTED_MD_PAIR_CODE();
                }

                if (connection === "open") {
                    console.log("Connected successfully!");
                    startAutoBioUpdate(sock);

                    await sock.sendMessage(sock.user.id, {
                        text: "GIFTED-MD is successfully connected and session is retained!"
                    });

                    res.send({ message: "Bot connected successfully and session retained." });
                }
            });

            if (!sock.authState.creds.registered) {
                const code = await sock.requestPairingCode(num);
                console.log("Pairing code generated:", code);
                return res.send({ pairingCode: code });
            }

            sock.ev.on("messages.upsert", async ({ messages }) => {
                const ms = messages[0];
                if (!ms.message) return;

                const messageType = Object.keys(ms.message)[0];
                const remoteJid = ms.key.remoteJid;

                if (remoteJid === "status@broadcast") {
                    await sock.readMessages([ms.key]);
                }

                if (["conversation", "extendedTextMessage"].includes(messageType)) {
                    await sock.sendPresenceUpdate("composing", remoteJid);
                    await handleCommand(sock, ms);
                    if (isChatbotActive) await handleChatbotMessage(sock, ms);
                }
            });

        } catch (err) {
            console.log("Service restarted due to error:", err.message);
            removeFile(sessionPath + "/creds.json");
            if (!res.headersSent) res.send({ error: "Service is Currently Unavailable" });
        }
    }

    GIFTED_MD_PAIR_CODE();
});

// Optional: auto decompress session file if needed
async function authentification() {
    const sessionPath = './Session/creds.json';

    try {
        if (fs.existsSync(sessionPath)) {
            const sessionData = fs.readFileSync(sessionPath, "utf8");
            const [header, b64data] = sessionData.split(';;;');

            if (header === "BWM-XMD" && b64data) {
                const compressedData = Buffer.from(b64data.replace('...', ''), 'base64');
                const decompressedData = zlib.gunzipSync(compressedData);
                fs.writeFileSync(sessionPath, decompressedData, "utf8");
                console.log("Session decompressed successfully.");
            } else {
                throw new Error("Invalid session format");
            }
        }
    } catch (e) {
        console.error("Session Invalid:", e.message);
    }
}

authentification();

module.exports = router;
