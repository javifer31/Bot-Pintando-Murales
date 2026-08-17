import "dotenv/config";
import fs from "fs";
import path from "path";
import type { BusinessConfig } from "./types";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${name}. Copia .env.example a .env y rellenala.`
    );
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  openrouterApiKey: required("OPENROUTER_API_KEY"),
  openrouterModel: process.env.OPENROUTER_MODEL ?? "meta-llama/llama-3.3-70b-instruct",
  whatsappToken: required("WHATSAPP_TOKEN"),
  whatsappPhoneNumberId: required("WHATSAPP_PHONE_NUMBER_ID"),
  whatsappVerifyToken: required("WHATSAPP_VERIFY_TOKEN"),
  whatsappAppSecret: process.env.WHATSAPP_APP_SECRET ?? "",
  businessConfigPath:
    process.env.BUSINESS_CONFIG_PATH ?? "./business.config.json",
};

export function loadBusinessConfig(): BusinessConfig {
  const resolved = path.resolve(process.cwd(), config.businessConfigPath);
  const raw = fs.readFileSync(resolved, "utf-8");
  return JSON.parse(raw) as BusinessConfig;
}
