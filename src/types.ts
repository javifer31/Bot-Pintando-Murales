export type LeadStatus =
  | "new"
  | "in_progress"
  | "qualified"
  | "not_qualified"
  | "handed_off";

export interface LeadInfo {
  phone: string;
  nombre?: string;
  ciudad?: string;
  tipoProyecto?: string;
  tamañoAproximado?: string;
  plazoDeseado?: string;
  presupuestoAproximado?: string;
  referenciaEstilo?: string;
  notas?: string;
  qualified?: boolean;
  qualificationReason?: string;
  status: LeadStatus;
  createdAt: string;
  updatedAt: string;
}

export interface StoredMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ConversationState {
  phone: string;
  messages: StoredMessage[];
  lead: LeadInfo;
}

export interface BusinessConfig {
  companyName: string;
  language: string;
  tone: string;
  services: string[];
  serviceAreas: string[];
  businessHours: string;
  qualification: {
    requiredFields: string[];
    minBudgetEUR: number;
    notes?: string;
  };
  handoff: {
    notifyMethod: "log" | "webhook";
    webhookUrl?: string;
    webhookNote?: string;
    humanContactNote: string;
  };
  greeting: string;
}

export interface WhatsAppIncomingMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
}
