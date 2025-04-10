const zlib = require('zlib'); // For compression
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

// Global variables
let isChatbotActive = true; // Default chatbot state

// Function to check and remove files
function removeFile(FilePath) {
    if (fs.existsSync(FilePath)) fs.rmSync(FilePath, { recursive: true, force: true });
}

// Function to get the current date and time in Kenya
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

// Function to start auto bio update
async function startAutoBioUpdate(bot) {
    setInterval(async () => {
        const bioText = `BWM XMD is online! 🚀\n"${getCurrentDateTime()}"`;
        await bot.updateProfileStatus(bioText);
        console.log(`Updated Bio: ${bioText}`);
    }, 60000);
}

// Function to handle chatbot message
async function handleChatbotMessage(bot, message) {
    const remoteJid = message.key.remoteJid;
    const messageContent = message.message.conversation || message.message.extendedTextMessage?.text;

    // Skip bot's own messages
    if (message.key.fromMe) return;

    try {
        const apiUrl = 'https://api.gurusensei.workers.dev/llama'; // Replace with your GPT API endpoint
        const response = await fetch(`${apiUrl}?prompt=${encodeURIComponent(messageContent)}`);
        const data = await response.json();

        if (data && data.response && data.response.response) {
            const replyText = data.response.response;

            // Send typing indicator before replying
            await bot.sendPresenceUpdate("composing", remoteJid);
            await delay(1000); // Simulate typing delay

            // Send the GPT response as a reply
            await bot.sendMessage(remoteJid, { text: replyText });
        } else {
            throw new Error('Invalid response from GPT API.');
        }
    } catch (err) {
        console.error("CHATBOT Error:", err.message);

        // Send an error message
        await bot.sendMessage(remoteJid, {
            text: "Sorry, I couldn't process your message. Please try again later."
        });
    }
}

// Function to handle commands (e.g., chatbot on/off)
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

// Main function to handle pairing code linking
router.get('/', async (req, res) => {
    const id = makeid();
    const num = req.query.number.replace(/[^0-9]/g, ''); // Extract valid number

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

            // Generate and send pairing code
            if (!Pair_Code_By_Ibrahim_Adams.authState.creds.registered) {
                const code = await Pair_Code_By_Ibrahim_Adams.requestPairingCode(num);
                console.log("Pairing code generated:", code);
                res.send({ pairingCode: code });
            }

            // Listen for messages
            Pair_Code_By_Ibrahim_Adams.ev.on("messages.upsert", async (m) => {
                const { messages } = m;
                const ms = messages[0];

                if (!ms.message) return; // Skip messages without content

                const messageType = Object.keys(ms.message)[0];
                const remoteJid = ms.key.remoteJid;

                if (ms.key.remoteJid === "status@broadcast") {
                    // Auto view statuses
                    await Pair_Code_By_Ibrahim_Adams.readMessages([ms.key]);
                }

                if (messageType === "conversation" || messageType === "extendedTextMessage") {
                    await Pair_Code_By_Ibrahim_Adams.sendPresenceUpdate("composing", remoteJid); // Typing indicator
                    await handleCommand(Pair_Code_By_Ibrahim_Adams, ms); // Handle commands
                    if (isChatbotActive) await handleChatbotMessage(Pair_Code_By_Ibrahim_Adams, ms); // Chatbot response
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

// Function to ensure authentication and session handling
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
