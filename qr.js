const QRCode = require('qrcode');
const express = require('express');
const path = require('path');
const fs = require('fs');
let router = express.Router();
const pino = require("pino");
const { 
    default: Ibrahim_Adams, 
    useMultiFileAuthState, 
    Browsers, 
    delay 
} = require("@whiskeysockets/baileys");

function removeFile(FilePath) {
    if (!fs.existsSync(FilePath)) return false;
    fs.rmSync(FilePath, { recursive: true, force: true });
}

router.get('/', async (req, res) => {
    const id = Date.now().toString(); // Use timestamp-based unique ID
    async function BWM_XMD_QR_CODE() {
        const { state, saveCreds } = await useMultiFileAuthState('./temp/' + id);
        try {
            let Qr_Code_By_Ibrahim_Adams = Ibrahim_Adams({
                auth: state,
                printQRInTerminal: false,
                logger: pino({ level: "silent" }),
                browser: Browsers.macOS("Desktop"),
            });

            Qr_Code_By_Ibrahim_Adams.ev.on('creds.update', saveCreds);
            Qr_Code_By_Ibrahim_Adams.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect, qr } = s;

                if (qr) {
                    // Send QR code as an image response
                    const qrImage = await QRCode.toDataURL(qr);
                    return res.send(`<img src="${qrImage}" alt="QR Code" />`);
                }

                if (connection === "open") {
                    await delay(5000);

                    let data = fs.readFileSync(path.join(__dirname, `/temp/${id}/creds.json`));
                    await delay(800);
                    let b64data = Buffer.from(data).toString('base64');
                    let sessionData = `BWM_XMD_SESSION:::${b64data}`;

                    // Send session data
                    await Qr_Code_By_Ibrahim_Adams.sendMessage(Qr_Code_By_Ibrahim_Adams.user.id, { text: sessionData });

                    // Cool new message
                    let BWM_XMD_TEXT = `
🌟 *Session Connected!* 🌟  
  
- 🚀 Stay updated with new bot features!  
- 🔗 Get support and explore more:  
   - Github: _https://github.com/ibrahimaitech_  
   - Website: _https://www.ibrahimadams.site_  
   - Whatsappchannel: _https://whatsapp.com/channel/0029VaZuGSxEawdxZK9CzM0Y_
   
😎 _Made with ❤️ by Ibrahim Adams_
`;

                    await Qr_Code_By_Ibrahim_Adams.sendMessage(Qr_Code_By_Ibrahim_Adams.user.id, { text: BWM_XMD_TEXT });

                    await delay(100);
                    await Qr_Code_By_Ibrahim_Adams.ws.close();
                    return await removeFile('./temp/' + id);
                } else if (connection === "close" && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output.statusCode !== 401) {
                    await delay(10000);
                    BWM_XMD_QR_CODE();
                }
            });
        } catch (err) {
            if (!res.headersSent) {
                await res.json({ code: "Service is Currently Unavailable" });
            }
            console.log(err);
            await removeFile('./temp/' + id);
        }
    }

    return await BWM_XMD_QR_CODE();
});

module.exports = router;
