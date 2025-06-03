import express from 'express';
import fs from 'fs';
import pino from 'pino';
import { makeWASocket, useMultiFileAuthState, delay, makeCacheableSignalKeyStore, jidNormalizedUser } from '@whiskeysockets/baileys';
import { upload } from './mega.js';

const router = express.Router();

// Ensure the session directory exists
function removeFile(FilePath) {
    try {
        if (!fs.existsSync(FilePath)) return false;
        fs.rmSync(FilePath, { recursive: true, force: true });
    } catch (e) {
        console.error('Error removing file:', e);
    }
}

router.get('/', async (req, res) => {
    let num = req.query.number;
    let dirs = './' + (num || `session`);
    
    // Remove existing session if present
    await removeFile(dirs);
    
    async function initiateSession() {
        const { state, saveCreds } = await useMultiFileAuthState(dirs);

        try {
            let SUPUNMDInc = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }).child({ level: "fatal" }),
                browser: ["Ubuntu", "Chrome", "20.0.04"],
            });

            if (!SUPUNMDInc.authState.creds.registered) {
                await delay(2000);
                num = num.replace(/[^0-9]/g, '');
                const code = await SUPUNMDInc.requestPairingCode(num);
                if (!res.headersSent) {
                    console.log({ num, code });
                    await res.send({ code });
                }
            }

            SUPUNMDInc.ev.on('creds.update', saveCreds);

            // Use a flag to ensure message is sent only once
            let messageSent = false;

            SUPUNMDInc.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect } = s;

                if (connection === "open" && !messageSent) {
                    messageSent = true; // Prevent multiple sends
                    await delay(10000);
                    const sessionGlobal = fs.readFileSync(dirs + '/creds.json');

                    // Helper to generate a random Mega file ID
                    function generateRandomId(length = 6, numberLength = 4) {
                        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
                        let result = '';
                        for (let i = 0; i < length; i++) {
                            result += characters.charAt(Math.floor(Math.random() * characters.length));
                        }
                        const number = Math.floor(Math.random() * Math.pow(10, numberLength));
                        return `${result}${number}`;
                    }

                    // Upload session file to Mega
                    const megaUrl = await upload(fs.createReadStream(`${dirs}/creds.json`), `${generateRandomId()}.json`);
                    let stringSession = megaUrl.replace('https://mega.nz/file/', ''); // Extract session ID from URL
                    stringSession = '𝔮𝔲𝔢𝔢𝔫-𝔫𝔦𝔪𝔞𝔰𝔥𝔞-𝔪𝔡~' + stringSession; // Prepend your name to the session ID

                    // Send messages
                    const userJid = jidNormalizedUser(num + '@s.whatsapp.net');
                    const imageUrl = 'url'; // Replace with your  image URL

                    try {
                        // Send Session ID as a separate text message
                        const sessionMessage = `*Session ID:* ${stringSession}\n\n`;
                        console.log('Sending session ID message to:', userJid);
                        await SUPUNMDInc.sendMessage(userJid, { text: sessionMessage });

                        // Send image with remaining caption
                        const imageMessage = {
                            image: { https://files.catbox.moe/j6b875.jpg },
                            caption: `*┏━━━━━━━━━━━━━━*
*┃QUEEN NIMASHA-MD SESSION IS*
*┃SUCCESSFULLY*
*┃CONNECTED 😎*
*┗━━━━━━━━━━━━━━━*
▬▬▬▬▬▬▬▬▬▬▬▬▬▬
*❶ || Creator =* ᴄʏʙᴇʀ ꜱᴀᴛʜɪꜱʜᴋᴀ ᴏꜰᴄ
▬▬▬▬▬▬▬▬▬▬▬▬▬▬
*❷ || WhatsApp Channel =* https://whatsapp.com/channel/0029Vb1d6P27tkj4EnWdN40n
▬▬▬▬▬▬▬▬▬▬▬▬▬▬
*❸ || Owner =* https://wa.me/+94767965032
▬▬▬▬▬▬▬▬▬▬▬▬▬▬
*❹ || Repo =* coming soon
▬▬▬▬▬▬▬▬▬▬▬▬▬▬
*❺ || YouTube =* https://youtube.com/@sathishka_ofc?si=_y9fgOgWXza3Kppy
▬▬▬▬▬▬▬▬▬▬▬▬▬▬
*🧚‍♀️ᴄʀᴇᴀᴛᴇᴅ ʙʏ ꜱᴀᴛʜɪꜱʜᴋᴀ ᴘʀᴀꜱᴀᴅ🥷*`
                        };
                        console.log('Sending image message to:', userJid);
                        await SUPUNMDInc.sendMessage(userJid, imageMessage);
                    } catch (error) {
                        console.error('Error sending messages:', error);
                        console.log('Failed to send messages. Session ID not sent.');
                    }
                    
                    // Clean up session after use
                    await delay(100);
                    removeFile(dirs);
                    SUPUNMDInc.ev.removeAllListeners(); // Remove all event listeners to prevent duplicates
                    process.exit(0);
                } else if (connection === 'close' && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output.statusCode !== 401) {
                    console.log('Connection closed unexpectedly:', lastDisconnect.error);
                    await delay(10000);
                    initiateSession(); // Retry session initiation if needed
                }
            });
        } catch (err) {
            console.error('Error initializing session:', err);
            if (!res.headersSent) {
                res.status(503).send({ code: 'Service Unavailable' });
            }
        }
    }

    await initiateSession();
});

// Global uncaught exception handler
process.on('uncaughtException', (err) => {
    console.log('Caught exception: ' + err);
});

export default router;