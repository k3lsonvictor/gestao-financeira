import { OpenAIClient } from "../integrations/openai/openai.client.js";
import { UserService } from "./user.service.js";
import { TransactionService } from "./transaction.service.js";
import { PayableService } from "./payable.service.js";
import { ChatHistoryRepository } from "../repositories/chat-history.repository.js";
import { getFinancialAgentSystemPrompt } from "../prompts/financial-agent.prompt.js";
import type { ExtractedIntentJSON, IncomingMessagePayload, ProcessMessageResult } from "../types/financial.types.js";
import { AppError } from "../errors/app-error.js";
import { env } from "../config/env.js";

export class FinancialAgentService {
  private openaiClient: OpenAIClient;
  private userService: UserService;
  private transactionService: TransactionService;
  private payableService: PayableService;
  private chatHistoryRepo: ChatHistoryRepository;

  constructor() {
    this.openaiClient = new OpenAIClient();
    this.userService = new UserService();
    this.transactionService = new TransactionService();
    this.payableService = new PayableService();
    this.chatHistoryRepo = new ChatHistoryRepository();
  }

  async processIncomingMessage(payload: IncomingMessagePayload): Promise<ProcessMessageResult> {
    console.log(`[FinancialAgentService] Processando mensagem de ${payload.phoneNumber} (Tipo: ${payload.messageType})`);

    // 1. Obter ou criar usuário no banco
    const user = await this.userService.getOrCreateUser(payload.phoneNumber, payload.userName);

    // 2. Tratar entradas multimídia (áudio/imagem)
    let processedMessageText = payload.textBody || "";

    if (payload.messageType === "audio" && payload.audioBase64) {
      console.log("[FinancialAgentService] Transcrevendo nota de voz enviada pelo usuário...");
      const rawBase64 = payload.audioBase64.replace(/^data:[^;]+;base64,/, "");
      const audioBuffer = Buffer.from(rawBase64, "base64");
      processedMessageText = await this.openaiClient.transcribeAudio(audioBuffer);
    } else if (payload.messageType === "image" && payload.imageBase64) {
      console.log("[FinancialAgentService] Analisando imagem de comprovante enviada...");
      const visionPrompt = "Descreva detalhadamente o valor total, tipo de transação, data, estabelecimento/categoria, nome do cliente (se houver) e forma de pagamento presente nesta nota ou recibo.";
      const imageAnalysis = await this.openaiClient.analyzeReceiptImage(payload.imageBase64, visionPrompt);
      processedMessageText = `[Foto do Recibo Enviada] ${processedMessageText ? `Legenda do usuário: ${processedMessageText}. ` : ""}Análise do recibo: ${imageAnalysis}`;
    }

    if (!processedMessageText.trim()) {
      throw new AppError("Mensagem vazia ou sem conteúdo identificável.", 400);
    }

    // 3. Salvar mensagem do usuário no histórico de conversa
    await this.chatHistoryRepo.addMessage(user.id, "user", processedMessageText);

    // 4. Carregar histórico recente de conversa
    const recentHistory = await this.chatHistoryRepo.getRecentHistory(user.id, 6);

    // 5. Preparar prompt do sistema
    const currentDateStr = new Date().toISOString().split("T")[0]!;
    const systemPrompt = getFinancialAgentSystemPrompt(
      currentDateStr,
      user.name,
      user.businessName || undefined
    );

    // 6. Montar array de mensagens para OpenAI
    const messagesForModel: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemPrompt },
      ...recentHistory.map((h) => ({
        role: h.role as "system" | "user" | "assistant",
        content: h.content,
      })),
    ];

    // 7. Chamar OpenAI com extração estruturada de JSON
    console.log("[FinancialAgentService] Extraindo intenção e dados estruturados via OpenAI...");
    const rawAiOutput = await this.openaiClient.generateCompletion(messagesForModel, true);

    let parsedResult: ExtractedIntentJSON;
    try {
      parsedResult = JSON.parse(rawAiOutput);
    } catch (err) {
      console.error("[FinancialAgentService] Erro ao parsear JSON da OpenAI:", rawAiOutput);
      parsedResult = {
        intent: "CHAT_RESPONSE",
        response_text: "Desculpe, não consegui entender perfeitamente o lançamento. Pode repetir?",
      };
    }

    console.log(`[FinancialAgentService] Intenção identificada: ${parsedResult.intent}`);

    let finalResponseText = parsedResult.response_text || "Processado com sucesso!";
    let transactionCreated: any = null;
    let payableCreated: any = null;
    let summaryData: any = null;

    // 8. Executar ação no banco de dados com base na intenção
    switch (parsedResult.intent) {
      case "ADD_TRANSACTION": {
        if (parsedResult.data && parsedResult.data.amount) {
          transactionCreated = await this.transactionService.createTransaction({
            userId: user.id,
            type: parsedResult.data.type || "DESPESA",
            amount: Number(parsedResult.data.amount),
            category: parsedResult.data.category || "Outros",
            description: parsedResult.data.description || "Lançamento via WhatsApp",
            paymentMethod: parsedResult.data.payment_method || "PIX",
            customerName: parsedResult.data.customer_name,
            installments: parsedResult.data.installments,
            date: parsedResult.data.date,
          });
        } else {
          finalResponseText = "Não identifiquei o valor numérico da transação. Por favor, me informe o valor em reais (ex: R$ 50,00).";
        }
        break;
      }

      case "ADD_PAYABLE": {
        if (parsedResult.data && parsedResult.data.amount && parsedResult.data.recipient_name) {
          payableCreated = await this.payableService.createPayable({
            userId: user.id,
            recipientName: parsedResult.data.recipient_name,
            recipientType: parsedResult.data.recipient_type || "FORNECEDOR",
            description: parsedResult.data.description || `Conta a pagar para ${parsedResult.data.recipient_name}`,
            amount: Number(parsedResult.data.amount),
            dueDate: parsedResult.data.due_date || currentDateStr,
          });
        } else {
          finalResponseText = "Por favor, informe o nome do fornecedor/funcionário e o valor da conta a pagar.";
        }
        break;
      }

      case "LIST_PAYABLES": {
        const payables = await this.payableService.listPayables(user.id, {
          recipientType: parsedResult.data?.recipient_type,
        });
        finalResponseText = this.payableService.formatPayablesWhatsAppMessage(payables);
        break;
      }

      case "MARK_PAYABLE_PAID": {
        const recipientName = parsedResult.data?.recipient_name || parsedResult.data?.description || "";
        const paidPayable = await this.payableService.markAsPaid(user.id, recipientName);

        if (paidPayable) {
          finalResponseText = `✅ Marquei a conta de ${paidPayable.recipientName} (R$ ${Number(paidPayable.amount).toFixed(2)}) como PAGA! Essa despesa também foi lançada no seu caixa. 💸`;
        } else {
          finalResponseText = `Não encontrei nenhuma conta pendente para "${recipientName}". Quer que eu faça o lançamento direto como despesa?`;
        }
        break;
      }

      case "GET_SUMMARY": {
        const period = parsedResult.data?.period || "mes";
        summaryData = await this.transactionService.getSummary(user.id, period);
        finalResponseText = this.transactionService.formatSummaryWhatsAppMessage(summaryData);
        break;
      }

      case "LIST_TRANSACTIONS": {
        const paymentMethodFilter = parsedResult.data?.payment_method;
        const list = await this.transactionService.listTransactions(user.id, {
          paymentMethod: paymentMethodFilter,
          type: parsedResult.data?.type,
          customerName: parsedResult.data?.customer_name,
        });

        const title = paymentMethodFilter && paymentMethodFilter.toLowerCase().includes("fiado")
          ? "Contas em Fiado / A Receber de Clientes"
          : "Lançamentos Recentes";

        finalResponseText = this.transactionService.formatListWhatsAppMessage(list, title);
        break;
      }

      case "REGISTER_USER": {
        if (parsedResult.data?.name || parsedResult.data?.business_name) {
          await this.userService.updateUserProfile(
            user.id,
            parsedResult.data.name,
            parsedResult.data.business_name
          );
          finalResponseText = `Prazer! Dados atualizados com sucesso. ${parsedResult.data.name ? `Nome: ${parsedResult.data.name}.` : ""} ${parsedResult.data.business_name ? `Negócio: ${parsedResult.data.business_name}.` : ""} 🤝`;
        }
        break;
      }

      case "EXPORT_SPREADSHEET": {
        const downloadUrl = `${env.publicUrl}/api/finance/spreadsheet/${user.id}`;
        finalResponseText = `📊 *Sua planilha financeira no Excel está pronta!*\n\n` +
          `Acesse o link abaixo para baixar seu relatório completo em Excel (.xlsx) com todas as receitas, despesas e contas a pagar:\n\n` +
          `📥 *Link de Download:* ${downloadUrl}\n\n` +
          `*(A planilha contém abas com Lançamentos, Contas a Pagar e Balanço Líquido).* 📗✨`;
        break;
      }

      case "CHAT_RESPONSE":
      default:
        break;
    }

    // 9. Salvar a resposta no histórico
    await this.chatHistoryRepo.addMessage(user.id, "assistant", finalResponseText);

    return {
      userId: user.id,
      phoneNumber: user.phoneNumber,
      intent: parsedResult.intent,
      extractedData: parsedResult.data,
      responseText: finalResponseText,
      transactionCreated,
      payableCreated,
      summaryData,
    };
  }
}
