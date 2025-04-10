const zlib = require('zlib');
const express = require('express');
const fs = require('fs');
const pino = require("pino");
const { makeid } = require('./id');
const fetch = require('node-fetch');
const {
    default: Ibrahim_Adams,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
} = require("maher-zubair-baileys");

const router = express.Router();

let isChatbotActive = true;

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
        const bioText = `BWM XMD is online! 🚀\n"${getCurrentDateTime()}"`;
        await bot.updateProfileStatus(bioText);
        console.log(`Updated Bio: ${bioText}`);
    }, 60000);
}

async function handleChatbotMessage(bot, message) {
    const remoteJid = message.key.remoteJid;
    const messageContent = message.message.conversation || message.message.extendedTextMessage?.text;

    if (message.key.fromMe || !messageContent) return;

    try {
        const apiUrl = 'https://api.gurusensei.workers.dev/llama';
        const response = await fetch(`${apiUrl}?prompt=${encodeURIComponent(messageContent)}`);
        const data = await response.json();

        if (data?.response?.response) {
            let replyText = data.response.response;

            // For WhatsApp-like poll structure
            const lines = replyText.split('\n');
            let formattedPoll = "";
            for (let line of lines) {
                if (line.includes('%')) {
                    // Emulate WhatsApp poll format
                    formattedPoll += `▢ ${line}\n`;
                } else {
                    formattedPoll += `*${line}*\n\n`;
                }
            }

            await bot.sendPresenceUpdate("composing", remoteJid);
            await delay(1000);

            await bot.sendMessage(remoteJid, { text: formattedPoll.trim() });
        } else {
            throw new Error("Invalid GPT response");
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

    if (messageContent.startsWith('!chatbot')) {
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

    async function BWM_XMD_PAIR_CODE() {
        const sessionPath = __dirname + "/Session";
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

        try {
            let Pair_Code_By_Ibrahim_Adams = Ibrahim_Adams({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                logger: pino({ level: "fatal" }).child({ level: "fatal" }),
                browser: ["Chrome (Linux)", "", ""]
            });

            Pair_Code_By_Ibrahim_Adams.ev.on('creds.update', saveCreds);

            Pair_Code_By_Ibrahim_Adams.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect } = s;

                if (connection === "close" && lastDisconnect?.error?.output?.statusCode != 401) {
                    console.log("Reconnecting...");
                    await delay(10000);
                    BWM_XMD_PAIR_CODE();
                }

                if (connection === "open") {
                    console.log("Connected successfully!");
                    startAutoBioUpdate(Pair_Code_By_Ibrahim_Adams);

                    await Pair_Code_By_Ibrahim_Adams.sendMessage(Pair_Code_By_Ibrahim_Adams.user.id, {
                        text: "Bot is successfully connected and session is retained!"
                    });

                    res.send({ message: "Bot connected successfully and session retained." });
                }
            });

            if (!Pair_Code_By_Ibrahim_Adams.authState.creds.registered) {
                const code = await Pair_Code_By_Ibrahim_Adams.requestPairingCode(num);
                console.log("Pairing code generated:", code);
                res.send({ pairingCode: code });
            }

            Pair_Code_By_Ibrahim_Adams.ev.on("messages.upsert", async (m) => {
                const { messages } = m;
                const ms = messages[0];

                if (!ms.message) return;

                const messageType = Object.keys(ms.message)[0];
                const remoteJid = ms.key.remoteJid;

                if (ms.key.remoteJid === "status@broadcast") {
                    await Pair_Code_By_Ibrahim_Adams.readMessages([ms.key]);
                }

                if (messageType === "conversation" || messageType === "extendedTextMessage") {
                    await Pair_Code_By_Ibrahim_Adams.sendPresenceUpdate("composing", remoteJid);
                    await handleCommand(Pair_Code_By_Ibrahim_Adams, ms);
                    if (isChatbotActive) await handleChatbotMessage(Pair_Code_By_Ibrahim_Adams, ms);
                }
            });
        } catch (err) {
            console.log("Service restarted due to an error:", err.message);
            removeFile(sessionPath + "/creds.json");
            if (!res.headersSent) res.send({ error: "Service is Currently Unavailable" });
        }
    }

    return BWM_XMD_PAIR_CODE();
});

async function authentification() {
    const sessionPath = __dirname + "/Session/creds.json";

    try {
        if (!fs.existsSync(sessionPath)) {
            console.log("No existing session found...");
        } else {
            console.log("Existing session found...");
            const sessionData = fs.readFileSync(sessionPath, "utf8");
            const [header, b64data] = sessionData.split(';;;');

            if (header === "BWM-XMD" && b64data) {
                let compressedData = Buffer.from(b64data.replace('...', ''), 'base64');
                let decompressedData = zlib.gunzipSync(compressedData);
                fs.writeFileSync(sessionPath, decompressedData, "utf8");
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
