import crypto from "crypto";
import { config } from "./config";
import type { WhatsAppIncomingMessage } from "./types";

const GRAPH_API_VERSION = "v20.0";

function apiUrl(): string {
  return `https://graph.facebook.com/${GRAPH_API_VERSION}/${config.whatsappPhoneNumberId}/messages`;
}

/** Envia un mensaje de texto por WhatsApp Cloud API. */
export async function sendWhatsAppText(to: string, body: string): Promise<void> {
  const res = await fetch(apiUrl(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.whatsappToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body, preview_url: false },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[whatsapp] Error enviando mensaje a ${to}: ${res.status} ${errText}`);
  }
}

/** Marca un mensaje entrante como leido (doble check azul). */
export async function markAsRead(messageId: string): Promise<void> {
  await fetch(apiUrl(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.whatsappToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    }),
  }).catch((err) => console.error("[whatsapp] Error marcando como leido:", err));
}

/** Verifica la firma X-Hub-Signature-256 que envia Meta en cada webhook. */
export function verifySignature(rawBody: Buffer, signatureHeader?: string): boolean {
  if (!config.whatsappAppSecret) return true; // firma no configurada: se omite la verificacion
  if (!signatureHeader) return false;

  const expected =
    "sha256=" +
    crypto.createHmac("sha256", config.whatsappAppSecret).update(rawBody).digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}

/** Extrae el primer mensaje de texto entrante de un payload de webhook de Meta. */
export function extractIncomingMessage(payload: any): WhatsAppIncomingMessage | null {
  const value = payload?.entry?.[0]?.changes?.[0]?.value;
  const message = value?.messages?.[0];
  if (!message) return null;

  return {
    from: message.from,
    id: message.id,
    timestamp: message.timestamp,
    type: message.type,
    text: message.text,
  };
}
