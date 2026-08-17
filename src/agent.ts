import { config, loadBusinessConfig } from "./config";
import { store } from "./store";
import { notifyHuman } from "./leads";
import { sendWhatsAppText } from "./whatsapp";
import type { BusinessConfig, LeadInfo, StoredMessage } from "./types";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

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

// Tools en formato de function-calling compatible con OpenAI, que es lo que espera OpenRouter.
const tools = [
  {
    type: "function",
    function: {
      name: "update_lead_info",
      description:
        "Guarda o actualiza los datos que el cliente ha ido compartiendo sobre su proyecto de mural. " +
        "Llamala cada vez que el cliente mencione un dato nuevo, aunque sea parcial. No inventes datos.",
      parameters: {
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
  },
  {
    type: "function",
    function: {
      name: "qualify_lead",
      description:
        "Marca el lead como cualificado o no cualificado una vez tienes suficiente informacion. " +
        "Un lead cualificado tiene los datos clave (ciudad, tipo de proyecto, tamaño, plazo y presupuesto) " +
        "y el presupuesto/zona encajan con lo que ofrece la empresa.",
      parameters: {
        type: "object",
        properties: {
          qualified: { type: "boolean", description: "true si el lead cumple los criterios de cualificacion" },
          reason: { type: "string", description: "Breve motivo de la decision" },
        },
        required: ["qualified", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "request_human_handoff",
      description:
        "Avisa al equipo humano de Pintando Murales. Usala cuando el lead quede cualificado, " +
        "cuando el cliente pida explicitamente hablar con una persona, o ante una consulta que no puedas resolver.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string", description: "Motivo del traspaso a un humano" },
        },
        required: ["reason"],
      },
    },
  },
] as const;

interface OpenRouterToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface OpenRouterMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: OpenRouterToolCall[];
  tool_call_id?: string;
}

async function callOpenRouter(messages: OpenRouterMessage[]): Promise<{
  message: OpenRouterMessage;
  finishReason: string;
}> {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openrouterApiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/javifer31/Bot-Pintando-Murales",
      "X-Title": "Bot Pintando Murales",
    },
    body: JSON.stringify({
      model: config.openrouterModel,
      messages,
      tools,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter respondio ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as {
    choices: { message: OpenRouterMessage; finish_reason: string }[];
  };
  const choice = data.choices[0];
  return { message: choice.message, finishReason: choice.finish_reason };
}

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

function toOpenRouterHistory(messages: StoredMessage[]): OpenRouterMessage[] {
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

  let finalReplyText = "";

  // Historial de trabajo para este turno: system + historial persistido.
  // Los tool_calls intermedios viven solo aqui, no se persisten entre mensajes.
  const working: OpenRouterMessage[] = [
    { role: "system", content: buildSystemPrompt(businessConfig, state.lead) },
    ...toOpenRouterHistory(state.messages),
  ];

  // Bucle de tool-use: el modelo puede encadenar varias llamadas a herramientas
  // antes de dar la respuesta final en texto.
  for (let turn = 0; turn < 5; turn++) {
    const { message, finishReason } = await callOpenRouter(working);
    finalReplyText = (message.content ?? "").trim();

    if (finishReason !== "tool_calls" || !message.tool_calls?.length) break;

    working.push(message);

    for (const toolCall of message.tool_calls) {
      let input: Record<string, unknown> = {};
      try {
        input = JSON.parse(toolCall.function.arguments);
      } catch {
        // argumentos invalidos: se ignora el contenido y se trata como objeto vacio
      }

      let resultSummary = "ok";
      switch (toolCall.function.name) {
        case "update_lead_info":
          applyLeadUpdate(state.lead, input);
          resultSummary = "datos del lead actualizados";
          break;
        case "qualify_lead":
          state.lead.qualified = Boolean(input.qualified);
          state.lead.qualificationReason = String(input.reason ?? "");
          state.lead.status = state.lead.qualified ? "qualified" : "not_qualified";
          resultSummary = `lead marcado como ${state.lead.status}`;
          break;
        case "request_human_handoff":
          state.lead.status = "handed_off";
          await notifyHuman(state.lead, String(input.reason ?? "sin motivo especificado"), businessConfig);
          resultSummary = "equipo humano notificado";
          break;
      }

      working.push({ role: "tool", tool_call_id: toolCall.id, content: resultSummary });
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
