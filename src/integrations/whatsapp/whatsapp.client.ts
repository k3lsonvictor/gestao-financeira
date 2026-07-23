import axios from "axios";
import { env } from "../../config/env.js";

export class WhatsAppClient {
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = `https://graph.facebook.com/v22.0/${env.phoneNumberId}`;
  }

  /**
   * Envia uma mensagem de texto via WhatsApp Cloud API.
   */
  async sendTextMessage(to: string, message: string): Promise<any> {
    console.log(`[WhatsAppClient] Enviando mensagem de texto para ${to}...`);

    if (!env.whatsappToken || !env.phoneNumberId) {
      console.log(`[WhatsAppClient - MOCK SIMULATION] (Sem token configurado):
Para: ${to}
Mensagem:
${message}`);
      return { status: "simulated", messageId: `mock_${Date.now()}` };
    }

    try {
      const response = await axios.post(
        `${this.baseUrl}/messages`,
        {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "text",
          text: { body: message },
        },
        {
          headers: {
            Authorization: `Bearer ${env.whatsappToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      return response.data;
    } catch (error: any) {
      console.error("[WhatsAppClient] Erro ao enviar mensagem WhatsApp:", error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Faz o download de um arquivo de mídia (áudio/imagem) do WhatsApp usando seu mediaId.
   */
  async downloadMediaBuffer(mediaId: string): Promise<{ buffer: Buffer; mimeType: string }> {
    if (!env.whatsappToken) {
      throw new Error("WHATSAPP_ACCESS_TOKEN é necessário para baixar arquivos de mídia da Meta API.");
    }

    try {
      // 1. Obter URL do arquivo
      const urlResponse = await axios.get(`https://graph.facebook.com/v22.0/${mediaId}`, {
        headers: { Authorization: `Bearer ${env.whatsappToken}` },
      });

      const mediaUrl = urlResponse.data.url;
      const mimeType = urlResponse.data.mime_type || "application/octet-stream";

      // 2. Fazer download do binário
      const mediaResponse = await axios.get(mediaUrl, {
        headers: { Authorization: `Bearer ${env.whatsappToken}` },
        responseType: "arraybuffer",
      });

      return {
        buffer: Buffer.from(mediaResponse.data),
        mimeType,
      };
    } catch (error: any) {
      console.error("[WhatsAppClient] Erro ao baixar mídia do WhatsApp:", error.response?.data || error.message);
      throw error;
    }
  }
}
