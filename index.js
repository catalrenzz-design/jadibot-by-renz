const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
  delay,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');

const SESSION_DIR = './session';
const PHONE_NUMBER = process.env.WA_NUMBER || process.argv[2];
const SILENT_LOGGER = pino({ level: 'silent' });

if (!PHONE_NUMBER) {
  console.error('Nomor WA wajib! Set secret WA_NUMBER');
  process.exit(1);
}

let sock = null;
let isConnecting = false;
let reconnectAttempts = 0;

async function startBot() {
  if (isConnecting) return;
  isConnecting = true;

  try {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      logger: SILENT_LOGGER,
      printQRInTerminal: false,
      browser: Browsers.ubuntu('Chrome'),
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, SILENT_LOGGER),
      },
      syncFullHistory: false,
      markOnlineOnConnect: true,
    });

    sock.ev.on('creds.update', saveCreds);

    if (!sock.authState.creds.registered) {
      console.log('⏳ Menunggu 3 detik...');
      await delay(3000);

      try {
        const cleanNumber = PHONE_NUMBER.replace(/\D/g, '');
        const code = await sock.requestPairingCode(cleanNumber);
        const formatted = code?.match(/.{1,4}/g)?.join('-') || code;

        console.log('========================================');
        console.log('       PAIRING CODE ANDA');
        console.log('========================================');
        console.log('       >>>  ' + formatted + '  <<<');
        console.log('========================================');

        try {
          fs.writeFileSync('PAIRING_CODE.txt', 'Code: ' + formatted + '\nWaktu: ' + new Date().toISOString() + '\n');
        } catch (e) {}
      } catch (err) {
        console.error('Gagal request code:', err?.message || err);
      }
    }

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === 'close') {
        isConnecting = false;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        console.log('Koneksi terputus (code: ' + statusCode + ')');

        if (shouldReconnect) {
          reconnectAttempts++;
          const waitTime = Math.min(3000 * reconnectAttempts, 30000);
          await delay(waitTime);
          startBot();
        } else {
          console.log('Logged out.');
          process.exit(0);
        }
      } else if (connection === 'open') {
        isConnecting = false;
        reconnectAttempts = 0;
        console.log('✅ Bot terhubung ke WhatsApp!');
      }
    });

    sock.ev.on('messages.upsert', async (m) => {
      try {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        if (!text) return;

        const command = text.trim().toLowerCase();
        const pushName = msg.pushName || 'Kak';

        if (command === '.ping') {
          const start = Date.now();
          await sock.sendMessage(from, { text: '🏓 Pong!' }, { quoted: msg });
          const latency = Date.now() - start;
          await sock.sendMessage(from, {
            text: '⚡ *Pong!*\n📊 Latency: *' + latency + 'ms*',
          }, { quoted: msg });
        }

        if (command === '.menu') {
          const menuText = '╔══════════════════════╗\n║      🤖 *BOT MENU*       ║\n╚══════════════════════╝\n\nHalo *' + pushName + '*! 👋\n\n• *.menu* → Menu ini\n• *.ping* → Cek latency\n\n> _Powered by Baileys_';
          await sock.sendMessage(from, { text: menuText }, { quoted: msg });
        }
      } catch (err) {
        console.error('Error handling:', err?.message || err);
      }
    });

  } catch (err) {
    isConnecting = false;
    console.error('Error start:', err?.message || err);
    reconnectAttempts++;
    await delay(5000);
    startBot();
  }
}

process.on('SIGINT', async () => { try { await sock?.end?.(); } catch {} process.exit(0); });
process.on('uncaughtException', (e) => console.error('Uncaught:', e?.message));
process.on('unhandledRejection', (e) => console.error('Unhandled:', e?.message));

startBot(); 
