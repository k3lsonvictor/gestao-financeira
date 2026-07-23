import "dotenv/config";

const requiredEnvVars = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
} as const;

for (const [key, value] of Object.entries(requiredEnvVars)) {
  if (!value) {
    console.warn(`[Config] AVISO: A variável de ambiente "${key}" não foi fornecida.`);
  }
}

export const env = {
  port: Number(process.env.PORT) || 3334,
  databaseUrl: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5434/gestao_financeira?schema=public",
  verifyToken: process.env.VERIFY_TOKEN || "minha-chave-super-secreta-kelia",
  whatsappToken: process.env.WHATSAPP_ACCESS_TOKEN || "",
  phoneNumberId: process.env.PHONE_NUMBER_ID || "",
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  openaiModel: process.env.OPENAI_MODEL || "gpt-4o-mini",
  kelIaApiUrl: process.env.KEL_IA_API_URL || "http://localhost:3333",
  publicUrl: process.env.PUBLIC_URL || process.env.APP_URL || "https://gestao-financeira-11io.onrender.com",
} as const;
