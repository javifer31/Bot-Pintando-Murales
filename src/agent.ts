import Anthropic from "@anthropic-ai/sdk";
import { config, loadBusinessConfig } from "./config";
import { store } from "./store";
import { notifyHuman } from "./leads";
import { sendWhatsAppText } from "./whatsapp";
import type { BusinessConfig, LeadInfo, StoredMessage } from "./types";

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

const LEAD_FIELD_NAMES = [
  "nombre",
  "ciudad",
  "tipoProyecto",
  "tamañoAproximado",
  "plazoDeseado",
  "presupuestoAproximado",
  "referenciaEstilo",
  "notas",
] as const;

const tools: Anthropic.Tool[] = [
  {
    name: "update_lead_info",
    description:
      "Guarda o actualiza los datos que el cliente ha ido compartiendo sobre su proyecto de mural. " +
      "Llamala cada vez que el cliente mencione un dato nuevo, aunque sea parcial. No inventes datos.",
    input_schema: {
      type: "object",
      properties: {
        nombre: { type: "string", description: "Nombre del cliente" },
        ciudad: { type: "string", description: "Ciudad o localidad donde esta el proyecto" },
        tipoProyecto: {
          type: "string",
          description: "Tipo de mural: interior, exterior/fachada, comercial, infantil, restauracion, etc.",
        },
        tamañoAproximado: { type: "string", description: "Tamaño o superficie aproximada (m2 o descripcion)" },
        plazoDeseado: { type: "string", description: "Cuando quiere el cliente que se realice el proyecto" },
        presupuestoAproximado: {
          type: "string",
          description: "Presupuesto aproximado que maneja el cliente, en euros si es posible",
        },
        referenciaEstilo: { type: "string", description: "Estilo o referencias visuales que le gustan" },
        notas: { type: "string", description: "Cualquier otro detalle relevante" },
      },
    },
  },
  {
    name: "qualify_lead",
    description:
      "Marca el lead como cualificado o no cualificado una vez tienes suficiente informacion. " +
      "Un lead cualificado tiene los datos clave (ciudad, tipo de proyecto, tamaño, plazo y presupuesto) " +
      "y el presupuesto/zona encajan con lo que ofrece la empresa.",
    input_schema: {
      type: "object",
      properties: {
        qualified: { type: "boolean", description: "true si el lead cumple los criterios de cualificacion" },
        reason: { type: "string", description: "Breve motivo de la decision" },
      },
      required: ["qualified", "reason"],
    },
  },
  {
    name: "request_human_handoff",
    description:
      "Avisa al equipo humano de Pintando Murales. Usala cuando el lead quede cualificado, " +
      "cuando el cliente pida explicitamente hablar con una persona, o ante una consulta que no puedas resolver.",
    input_schema: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Motivo del traspaso a un humano" },
      },
      required: ["reason"],
    },
  },
];

function buildSystemPrompt(businessConfig: BusinessConfig, lead: LeadInfo): string {
  const known = LEAD_FIELD_NAMES.filter((f) => lead[f]).map((f) => `- ${f}: ${lead[f]}`);

  return `Eres el agente conversacional de WhatsApp de "${businessConfig.companyName}", una empresa que pinta murales.
Idioma: ${businessConfig.language}. Tono: ${businessConfig.tone}.

Servicios que ofrece la empresa:
${businessConfig.services.map((s) => `- ${s}`).join("\n")}

Zonas de servicio: ${businessConfig.serviceAreas.join(", ")}
Horario de atencion humana: ${businessConfig.businessHours}

Tu objetivo es mantener una conversacion natural y breve (mensajes cortos, como en WhatsApp) para
cualificar al cliente potencial, recopilando estos datos a lo largo de la conversacion:
${businessConfig.qualification.requiredFields.map((f) => `- ${f}`).join("\n")}

Presupuesto minimo orientativo para un proyecto: ${businessConfig.qualification.minBudgetEUR}€.
${businessConfig.qualification.notes ?? ""}

Datos que ya conoces de este cliente (no vuelvas a preguntarlos, confirmalos si hace falta):
${known.length > 0 ? known.join("\n") : "(ninguno todavia)"}

Reglas:
1. Pregunta de uno en uno, de forma conversacional, no como un formulario.
2. Cada vez que el cliente de un dato nuevo, llama a la herramienta update_lead_info.
3. En cuanto tengas todos los datos requeridos, evalua con la herramienta qualify_lead.
4. Si el lead queda cualificado, o el cliente pide hablar con una persona, o preguntan algo fuera de tu
   alcance (precios cerrados, contratos, visitas), llama a request_human_handoff y comunica al cliente
   que el equipo se pondra en contacto, usando este mensaje como base: "${businessConfig.handoff.humanContactNote}"
5. Nunca inventes precios exactos, disponibilidad ni plazos del equipo humano.
6. Si el cliente esta fuera de las zonas de servicio o el presupuesto es claramente insuficiente,
   se honesto y amable al respecto en vez de forzar la cualificacion.`;
}

function toAnthropicMessages(messages: StoredMessage[]): Anthropic.MessageParam[] {
  return messages.map((m) => ({ role: m.role, content: m.content }));
}

function applyLeadUpdate(lead: LeadInfo, input: Record<string, unknown>): void {
  for (const field of LEAD_FIELD_NAMES) {
    const value = input[field];
    if (typeof value === "string" && value.trim().length > 0) {
      lead[field] = value.trim();
    }
  }
  if (lead.status === "new") lead.status = "in_progress";
}

/** Procesa un mensaje entrante de un cliente y devuelve la respuesta que se le envia por WhatsApp. */
export async function handleIncomingMessage(phone: string, text: string): Promise<void> {
  const businessConfig = loadBusinessConfig();
  const state = store.getOrCreate(phone);

  state.messages.push({ role: "user", content: text });

  let handedOff = false;
  let finalReplyText = "";

  // Bucle de tool-use: Claude puede encadenar varias llamadas a herramientas
  // antes de dar la respuesta final en texto.
  for (let turn = 0; turn < 5; turn++) {
    const response = await anthropic.messages.create({
      model: config.anthropicModel,
      max_tokens: 1024,
      system: buildSystemPrompt(businessConfig, state.lead),
      tools,
      messages: toAnthropicMessages(state.messages),
    });

    const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text");
    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");

    finalReplyText = textBlocks.map((b) => b.text).join("\n").trim();

    if (toolUses.length === 0) break;

    // Registramos el turno del asistente (con sus tool_use) y ejecutamos las herramientas.
    state.messages.push({
      role: "assistant",
      content: finalReplyText || "(usando herramientas)",
    });

    const toolResultsSummary: string[] = [];
    for (const toolUse of toolUses) {
      const input = toolUse.input as Record<string, unknown>;
      switch (toolUse.name) {
        case "update_lead_info":
          applyLeadUpdate(state.lead, input);
          toolResultsSummary.push("datos del lead actualizados");
          break;
        case "qualify_lead":
          state.lead.qualified = Boolean(input.qualified);
          state.lead.qualificationReason = String(input.reason ?? "");
          state.lead.status = state.lead.qualified ? "qualified" : "not_qualified";
          toolResultsSummary.push(`lead marcado como ${state.lead.status}`);
          break;
        case "request_human_handoff":
          state.lead.status = "handed_off";
          handedOff = true;
          await notifyHuman(state.lead, String(input.reason ?? "sin motivo especificado"), businessConfig);
          toolResultsSummary.push("equipo humano notificado");
          break;
      }
    }

    // Feedback minimo para que Claude pueda continuar la conversacion de forma coherente.
    state.messages.push({
      role: "user",
      content: `[sistema] ${toolResultsSummary.join("; ")}`,
    });

    if (handedOff) {
      // Ya se ha avisado al humano; dejamos que el modelo formule la despedida en la siguiente vuelta.
    }
  }

  if (!finalReplyText) {
    finalReplyText =
      "Perdona, ¿me lo puedes repetir? Ha habido un problema por mi parte y quiero asegurarme de entenderte bien.";
  }

  state.messages.push({ role: "assistant", content: finalReplyText });
  store.save(state);

  await sendWhatsAppText(phone, finalReplyText);
}

/** Envia el saludo inicial configurado a un numero (util para pruebas o para iniciar conversacion). */
export async function sendGreeting(phone: string): Promise<void> {
  const businessConfig = loadBusinessConfig();
  const state = store.getOrCreate(phone);
  state.messages.push({ role: "assistant", content: businessConfig.greeting });
  store.save(state);
  await sendWhatsAppText(phone, businessConfig.greeting);
}
