import type { BusinessConfig, LeadInfo } from "./types";

/**
 * Notifica al equipo humano de que hay un lead cualificado (o que ha pedido
 * hablar con una persona). Por defecto solo lo deja en el log del proceso;
 * si business.config.json tiene handoff.notifyMethod = "webhook", lo reenvia
 * ademas a la URL indicada (por ejemplo, el Custom Webhook del escenario de
 * Make ya existente "Integration Google Ads Web Form, Google Sheets", para
 * reutilizar el mismo pipeline de Google Sheets + HubSpot).
 */
export async function notifyHuman(
  lead: LeadInfo,
  reason: string,
  businessConfig: BusinessConfig
): Promise<void> {
  console.log(
    `[lead] Aviso al equipo humano | telefono=${lead.phone} motivo="${reason}"`,
    JSON.stringify(lead, null, 2)
  );

  const { notifyMethod, webhookUrl } = businessConfig.handoff;
  if (notifyMethod !== "webhook" || !webhookUrl) return;

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "whatsapp-bot-pintando-murales",
        reason,
        ...lead,
      }),
    });
    if (!res.ok) {
      console.error(`[lead] El webhook de aviso respondio ${res.status}`);
    }
  } catch (err) {
    console.error("[lead] No se pudo notificar via webhook:", err);
  }
}
