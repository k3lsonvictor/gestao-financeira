import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { WebhookController } from "../controllers/webhook.controller.js";

export const webhookRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const controller = new WebhookController();

  // GET /webhook - Validação inicial do webhook da API do WhatsApp Cloud
  fastify.get("/webhook", controller.verifyWebhook);

  // POST /webhook - Recebimento de mensagens do WhatsApp Cloud API
  fastify.post("/webhook", controller.receiveMessage);

  // POST /api/finance/process-message - Processamento direto (para kel-ia / testes)
  fastify.post("/api/finance/process-message", controller.processDirectMessage);
};
