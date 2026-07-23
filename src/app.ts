import Fastify from "fastify";
import cors from "@fastify/cors";
import { webhookRoutes } from "./routes/webhook.routes.js";
import { financialRoutes } from "./routes/financial.routes.js";
import { AppError } from "./errors/app-error.js";

export const app = Fastify({
  logger: true,
});

// Registrar plugin de CORS
app.register(cors, {
  origin: "*",
});

// Handler de Erros Global
app.setErrorHandler((error: any, request, reply) => {
  if (error instanceof AppError) {
    request.log.warn({ err: error }, `Erro de aplicação previsto: ${error.message}`);
    return reply.status(error.statusCode).send({
      error: error.name,
      message: error.message,
    });
  }

  request.log.error(error, "Erro inesperado do servidor");
  return reply.status(500).send({
    error: "InternalServerError",
    message: "Ocorreu um erro interno inesperado no servidor.",
    details: process.env.NODE_ENV === "development" ? error?.message : undefined,
  });
});

// Rota raiz de verificação de status
app.get("/", async () => {
  return {
    service: "gestao-financeira",
    status: "online",
    message: "Serviço de Gestão Financeira via WhatsApp (IA) operando perfeitamente! 🚀",
  };
});

// Registrar rotas modulares
app.register(webhookRoutes);
app.register(financialRoutes);
