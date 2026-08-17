import express, { type Request, type Response } from "express";
import { config } from "./config";
import { extractIncomingMessage, markAsRead, verifySignature } from "./whatsapp";
import { handleIncomingMessage } from "./agent";

const app = express();

// Guardamos el cuerpo crudo para poder verificar la firma X-Hub-Signature-256 de Meta.
app.use(
  express.json({
    verify: (req: Request & { rawBody?: Buffer }, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

app.get("/health", (_req, res) => res.json({ ok: true }));

// Verificacion del webhook (handshake que exige Meta al configurar la URL).
app.get("/webhook", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log(`[webhook] GET verificacion: mode=${mode} tokenMatch=${token === config.whatsappVerifyToken}`);

  if (mode === "subscribe" && token === config.whatsappVerifyToken) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Recepcion de mensajes entrantes.
app.post("/webhook", (req: Request & { rawBody?: Buffer }, res: Response) => {
  console.log("[webhook] POST recibido:", JSON.stringify(req.body));

  const signature = req.header("x-hub-signature-256") ?? undefined;
  if (!verifySignature(req.rawBody ?? Buffer.from(""), signature)) {
    console.warn("[webhook] Firma invalida, se descarta la peticion");
    return res.sendStatus(401);
  }

  // Respondemos 200 de inmediato (requisito de Meta) y procesamos en segundo plano.
  res.sendStatus(200);

  const message = extractIncomingMessage(req.body);
  if (!message) {
    console.log("[webhook] No se pudo extraer un mensaje del payload (probablemente un evento de estado, no un mensaje)");
    return;
  }

  console.log(`[webhook] Mensaje extraido: from=${message.from} type=${message.type}`);

  markAsRead(message.id).catch(() => {});

  if (message.type !== "text" || !message.text?.body) {
    console.log(`[webhook] Mensaje de tipo "${message.type}" ignorado (solo se procesa texto por ahora)`);
    return;
  }

  console.log(`[agent] Procesando mensaje de ${message.from}: "${message.text.body}"`);
  handleIncomingMessage(message.from, message.text.body)
    .then(() => console.log(`[agent] Respuesta enviada a ${message.from}`))
    .catch((err) => {
      console.error(`[agent] Error procesando mensaje de ${message.from}:`, err);
    });
});

app.listen(config.port, () => {
  console.log(`Bot Pintando Murales escuchando en el puerto ${config.port}`);
});
