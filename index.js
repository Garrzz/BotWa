const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const pino = require("pino");

const spamWords = ["spam", "invite grup", "promosi", "link wa", "join gc"];
const toxicWords = ["babi", "anjing", "kontol", "ngentot", "bangsat"];

// Menyimpan pelanggaran sementara di memori (tidak permanen)
const warningMap = {};

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    logger: pino({ level: "silent" }),
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === "close") {
      const shouldReconnect =
        new Boom(lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) startBot();
    } else if (connection === "open") {
      console.log("Bot aktif dan terhubung!");
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const sender = msg.key.participant || msg.key.remoteJid;
    const groupId = msg.key.remoteJid;

    const text =
      msg.message.conversation || msg.message.extendedTextMessage?.text;
    if (!text) return;

    const lowerText = text.toLowerCase();

    const isSpam = spamWords.some((word) => lowerText.includes(word));
    const isToxic = toxicWords.some((word) => lowerText.includes(word));

    if (isSpam || isToxic) {
      const key = `${groupId}_${sender}`;
      warningMap[key] = (warningMap[key] || 0) + 1;

      const count = warningMap[key];

      if (count < 3) {
        await sock.sendMessage(groupId, {
          text: `Peringatan ${count}/3 untuk @${
            sender.split("@")[0]
          } karena melanggar aturan.`,
          mentions: [sender],
        });
      } else {
        await sock.sendMessage(groupId, {
          text: `@${
            sender.split("@")[0]
          } telah melanggar sebanyak 3 kali. Mengeluarkan dari grup.`,
          mentions: [sender],
        });

        try {
          await sock.groupParticipantsUpdate(groupId, [sender], "remove");
          delete warningMap[key]; // reset pelanggaran setelah dikick
        } catch (err) {
          console.log("Gagal ngekick:", err);
        }
      }
    }
  });
}

console.log("Starting bot...");
startBot();

const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/ping", (req, res) => {
  res.send("Bot is alive");
});

app.listen(PORT, () => {
  console.log("Web server aktif di port " + PORT);
});

setInterval(() => {
  console.log("Bot masih aktif...");
}, 10000);