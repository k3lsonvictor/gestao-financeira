import type { FastifyRequest, FastifyReply } from "fastify";
import { env } from "../config/env.js";
import { FinancialAgentService } from "../services/financial-agent.service.js";
import { WhatsAppClient } from "../integrations/whatsapp/whatsapp.client.js";
import { AppError } from "../errors/app-error.js";

export class WebhookController {
  private financialAgentService: FinancialAgentService;
  private whatsappClient: WhatsAppClient;

  constructor() {
    this.financialAgentService = new FinancialAgentService();
    this.whatsappClient = new WhatsAppClient();
  }

  /**
   * Validação inicial do webhook do WhatsApp Cloud API (GET /webhook)
   */
  public verifyWebhook = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      "hub.mode"?: string;
      "hub.verify_token"?: string;
      "hub.challenge"?: string;
    };

    const mode = query["hub.mode"];
    const token = query["hub.verify_token"];
    const challenge = query["hub.challenge"];

    if (mode === "subscribe" && token === env.verifyToken) {
      console.log("[WebhookController] Webhook verificado com sucesso pelo Meta WhatsApp Cloud!");
      return reply.status(200).send(challenge);
    }

    console.warn("[WebhookController] Falha na verificação do token do webhook.");
    return reply.status(403).send({ error: "Forbidden", message: "Token de verificação inválido." });
  };

  /**
   * Recebimento de eventos do Webhook (POST /webhook)
   */
  public receiveMessage = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as any;

      // Retorna 200 OK imediatamente para a Meta não expirar a requisição
      reply.status(200).send({ status: "EVENT_RECEIVED" });

      const entry = body?.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;

      if (!value?.messages?.[0]) {
        return; // Não é uma mensagem recebida (pode ser atualização de status de entrega)
      }

      const messageObj = value.messages[0];
      const fromNumber = messageObj.from;
      const userName = value.contacts?.[0]?.profile?.name || "Empreendedor";
      const messageType = messageObj.type;

      let textBody: string | undefined;
      let audioBase64: string | undefined;
      let imageBase64: string | undefined;

      if (messageType === "text") {
        textBody = messageObj.text?.body;
      } else if (messageType === "audio" && messageObj.audio?.id) {
        try {
          const downloaded = await this.whatsappClient.downloadMediaBuffer(messageObj.audio.id);
          audioBase64 = downloaded.buffer.toString("base64");
        } catch (err) {
          console.error("[WebhookController] Não foi possível baixar o áudio enviado:", err);
        }
      } else if (messageType === "image" && messageObj.image?.id) {
        try {
          const downloaded = await this.whatsappClient.downloadMediaBuffer(messageObj.image.id);
          imageBase64 = downloaded.buffer.toString("base64");
          textBody = messageObj.image?.caption;
        } catch (err) {
          console.error("[WebhookController] Não foi possível baixar a imagem enviada:", err);
        }
      }

      console.log(`[WebhookController] Processando mensagem do WhatsApp de ${fromNumber}...`);

      const result = await this.financialAgentService.processIncomingMessage({
        phoneNumber: fromNumber,
        userName,
        messageType: messageType as any,
        textBody,
        audioBase64,
        imageBase64,
      });

      // Envia resposta no WhatsApp
      await this.whatsappClient.sendTextMessage(fromNumber, result.responseText);
    } catch (error: any) {
      console.error("[WebhookController] Erro ao processar mensagem do webhook:", error?.message || error);
    }
  };

  /**
   * Endpoint direto REST (POST /api/finance/process-message)
   * Permite integração direta do kel-ia ou testes via Postman/curl
   */
  public processDirectMessage = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      phoneNumber?: string;
      userName?: string;
      messageType?: "text" | "audio" | "image";
      textBody?: string;
      audioBase64?: string;
      imageBase64?: string;
      sendWhatsAppReply?: boolean;
    };

    if (!body.phoneNumber) {
      throw new AppError("O campo 'phoneNumber' é obrigatório.", 400);
    }

    const result = await this.financialAgentService.processIncomingMessage({
      phoneNumber: body.phoneNumber,
      userName: body.userName,
      messageType: body.messageType || "text",
      textBody: body.textBody,
      audioBase64: body.audioBase64,
      imageBase64: body.imageBase64,
    });

    if (body.sendWhatsAppReply) {
      await this.whatsappClient.sendTextMessage(body.phoneNumber, result.responseText);
    }

    return reply.status(200).send({
      success: true,
      data: result,
    });
  };

  /**
   * Endpoint para visualização/impressão do PDF do Pedido
   */
  public getOrderPDF = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const repo = new (await import("../repositories/pedido.repository.js")).PedidoRepository();
    const pdfService = new (await import("../services/pdf-generator.service.js")).PDFGeneratorService();

    const pedido = await repo.findById(id);
    if (!pedido) {
      throw new AppError("Pedido não encontrado.", 404);
    }

    const htmlContent = pdfService.generateOrderHTML(pedido);
    return reply.type("text/html").send(htmlContent);
  };
}
