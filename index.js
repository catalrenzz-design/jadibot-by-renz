import makeWASocket, { useMultiFileAuthState, DisconnectReason, makeCacheableSignalKeyStore } from "@whiskeysockets/baileys"
import pino from "pino"
import qrcode from "qrcode-terminal"
import fs from "fs"
if(!fs.existsSync("./session")) fs.mkdirSync("./session")
async function startBot(){
  const { state, saveCreds } = await useMultiFileAuthState("./session")
  const sock = makeWASocket({
    logger: pino({ level: "silent" }),
    printQRInTerminal: true,
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })) },
    browser: ["BY RENZ","Chrome","1.0"]
  })
  sock.ev.on("creds.update", saveCreds)
  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if(qr) qrcode.generate(qr, { small: true })
    if(connection==="close"){
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut
      if(shouldReconnect) startBot()
    } else if(connection==="open") console.log("✅ BY RENZ CONNECTED")
  })
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const m = messages[0]
    if(!m.message || m.key.fromMe) return
    const from = m.key.remoteJid
    const body = m.message.conversation || m.message.extendedTextMessage?.text || ""
    if(body===".menu") await sock.sendMessage(from, { text: "*BY RENZ BOT*\n.menu\n.ping" })
    if(body===".ping") await sock.sendMessage(from, { text: "Pong! BY RENZ ACTIVE ✅" })
  })
}
startBot()
