import { OpenAI, toFile } from "openai";
import { env } from "../../config/env.js";
import { AppError } from "../../errors/app-error.js";

export class OpenAIClient {
  public readonly client: OpenAI;

  constructor() {
    if (!env.openaiApiKey) {
      console.warn("[OpenAIClient] Atenção: OPENAI_API_KEY não configurada.");
    }
    this.client = new OpenAI({
      apiKey: env.openaiApiKey,
    });
  }

  /**
   * Transcreve um áudio (Buffer ou File) usando a API Whisper da OpenAI.
   */
  async transcribeAudio(audioBuffer: Buffer, filename = "audio.ogg"): Promise<string> {
    try {
      console.log(`[OpenAIClient] Transcrevendo áudio via Whisper (${audioBuffer.length} bytes)...`);

      const file = await toFile(audioBuffer, filename, { type: "audio/ogg" });

      const response = await this.client.audio.transcriptions.create({
        file,
        model: "whisper-1",
        language: "pt",
      });

      console.log(`[OpenAIClient] Transcrição concluída: "${response.text}"`);
      return response.text;
    } catch (error: any) {
      console.error("[OpenAIClient] Erro ao transcrever áudio com Whisper:", error?.message || error);
      throw new AppError(`Falha ao transcrever áudio: ${error?.message || "Erro na OpenAI Whisper API"}`, 500);
    }
  }

  /**
   * Analisa uma imagem (comprovante/recibo/nota) usando modelo GPT-4o com suporte a Visão.
   */
  async analyzeReceiptImage(imageBase64OrUrl: string, promptInstruction: string): Promise<string> {
    try {
      console.log("[OpenAIClient] Analisando imagem/recibo via GPT-4o Vision...");

      const imageUrl = imageBase64OrUrl.startsWith("http")
        ? imageBase64OrUrl
        : `data:image/jpeg;base64,${imageBase64OrUrl}`;

      const response = await this.client.chat.completions.create({
        model: env.openaiModel || "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "Você é um especialista em OCR e leitura de notas fiscais, recibos e comprovantes de pagamento brasileiros.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: promptInstruction },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
        max_tokens: 600,
      });

      const resultText = response.choices[0]?.message?.content || "";
      console.log("[OpenAIClient] Análise de visão concluída.");
      return resultText;
    } catch (error: any) {
      console.error("[OpenAIClient] Erro na análise de visão:", error?.message || error);
      throw new AppError(`Falha ao analisar imagem: ${error?.message || "Erro na OpenAI Vision API"}`, 500);
    }
  }

  /**
   * Gera uma resposta estruturada JSON com base no histórico de conversas e prompt do sistema.
   */
  async generateCompletion(
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
    jsonMode = true
  ): Promise<string> {
    try {
      const response = await this.client.chat.completions.create({
        model: env.openaiModel,
        messages,
        temperature: 0.2, // Baixa temperatura para extração de dados consistente e precisa
        response_format: jsonMode ? { type: "json_object" } : undefined,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("OpenAI retornou uma resposta vazia.");
      }

      return content;
    } catch (error: any) {
      console.error("[OpenAIClient] Erro ao gerar completion:", error?.message || error);
      throw new AppError(`Falha ao comunicar com a IA: ${error?.message || "Erro na OpenAI API"}`, 500);
    }
  }
}
