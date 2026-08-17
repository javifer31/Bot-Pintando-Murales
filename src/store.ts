import fs from "fs";
import path from "path";
import type { ConversationState, LeadInfo } from "./types";

const DB_PATH = path.resolve(process.cwd(), "data", "conversations.json");

type Db = Record<string, ConversationState>;

function readDb(): Db {
  if (!fs.existsSync(DB_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, "utf-8")) as Db;
  } catch {
    return {};
  }
}

function writeDb(db: Db): void {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
}

/**
 * Almacen de conversaciones simple basado en fichero JSON.
 * Suficiente para un unico proceso/instancia. Para produccion con varias
 * instancias, sustituye esto por Redis/Postgres manteniendo la misma interfaz.
 */
export class Store {
  private db: Db;

  constructor() {
    this.db = readDb();
  }

  getOrCreate(phone: string): ConversationState {
    if (!this.db[phone]) {
      const now = new Date().toISOString();
      const lead: LeadInfo = {
        phone,
        status: "new",
        createdAt: now,
        updatedAt: now,
      };
      this.db[phone] = { phone, messages: [], lead };
      writeDb(this.db);
    }
    return this.db[phone];
  }

  save(state: ConversationState): void {
    state.lead.updatedAt = new Date().toISOString();
    this.db[state.phone] = state;
    writeDb(this.db);
  }

  all(): ConversationState[] {
    return Object.values(this.db);
  }
}

export const store = new Store();
