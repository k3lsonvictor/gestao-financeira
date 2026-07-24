import { OpenAIClient } from "../integrations/openai/openai.client.js";
import { UserService } from "./user.service.js";
import { TransactionService } from "./transaction.service.js";
import { PayableService } from "./payable.service.js";
import { PedidoOCRService } from "./pedido-ocr.service.js";
import { PedidoRepository } from "../repositories/pedido.repository.js";
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
  private pedidoOcrService: PedidoOCRService;
  private pedidoRepository: PedidoRepository;
  private chatHistoryRepo: ChatHistoryRepository;

  constructor() {
    this.openaiClient = new OpenAIClient();
    this.userService = new UserService();
    this.transactionService = new TransactionService();
    this.payableService = new PayableService();
    this.pedidoOcrService = new PedidoOCRService();
    this.pedidoRepository = new PedidoRepository();
    this.chatHistoryRepo = new ChatHistoryRepository();
  }

  async processIncomingMessage(payload: IncomingMessagePayload): Promise<ProcessMessageResult> {
    console.log(`[FinancialAgentService] Processando mensagem de ${payload.phoneNumber} (Tipo: ${payload.messageType})`);

    // 1. Obter ou criar usuário no banco
    const user = await this.userService.getOrCreateUser(payload.phoneNumber, payload.userName);

    // 2. Processar Fotos de Talão de Pedido Manuscrito (OCR Multimodal)
    if (payload.messageType === "image" && payload.imageBase64) {
      console.log("[FinancialAgentService] Analisando talão de pedido via Visão Computacional / OCR Multimodal...");
      const ocrResult = await this.pedidoOcrService.processAndSaveOrderImage({
        userId: user.id,
        imageBase64OrUrl: payload.imageBase64,
      });

      const formatted = this.pedidoOcrService.formatWhatsAppOrderMessage(ocrResult);
      await this.chatHistoryRepo.addMessage(user.id, "user", "[Foto de Talão de Pedido Enviada]");
      await this.chatHistoryRepo.addMessage(user.id, "assistant", formatted.responseText);

      return {
        userId: user.id,
        phoneNumber: user.phoneNumber,
        intent: "OCR_PEDIDO",
        responseText: formatted.responseText,
        buttons: formatted.buttons,
      };
    }

    // Tratar notas de voz
    let processedMessageText = payload.textBody || "";

    if (payload.messageType === "audio" && payload.audioBase64) {
      console.log("[FinancialAgentService] Transcrevendo nota de voz enviada pelo usuário...");
      const rawBase64 = payload.audioBase64.replace(/^data:[^;]+;base64,/, "");
      const audioBuffer = Buffer.from(rawBase64, "base64");
      processedMessageText = await this.openaiClient.transcribeAudio(audioBuffer);
    }

    if (!processedMessageText.trim()) {
      throw new AppError("Mensagem vazia ou sem conteúdo identificável.", 400);
    }

    const cleanText = processedMessageText.trim();
    const cleanLower = cleanText.toLowerCase();

    // 2.1 Botões Interativos de Pedidos (Confirmar, Editar, PDF)
    if (cleanText.startsWith("ped_confirm_") || cleanLower === "✅ confirmar pedido" || cleanLower === "confirmar pedido") {
      const resp = "✅ *Pedido verificado e confirmado com sucesso!* 🚀\nSe o pedido tiver sido marcado como pago, o valor já foi atualizado no seu fluxo de caixa.";
      await this.chatHistoryRepo.addMessage(user.id, "assistant", resp);
      return {
        userId: user.id,
        phoneNumber: user.phoneNumber,
        intent: "CONFIRM_PEDIDO",
        responseText: resp,
      };
    } else if (cleanText.startsWith("ped_edit_") || cleanLower === "✏️ editar / ajustar" || cleanLower === "editar pedido") {
      const resp = "Sem problemas! Qual item, quantidade ou valor do pedido você deseja ajustar? Pode me responder por texto ou áudio a correção. ✍️";
      await this.chatHistoryRepo.addMessage(user.id, "assistant", resp);
      return {
        userId: user.id,
        phoneNumber: user.phoneNumber,
        intent: "EDIT_PEDIDO",
        responseText: resp,
      };
    } else if (cleanText.startsWith("ped_pdf_") || cleanLower.includes("gerar pdf") || cleanLower.includes("pdf")) {
      let pedidoId = cleanText.startsWith("ped_pdf_") ? cleanText.replace("ped_pdf_", "").trim() : "";

      if (!pedidoId || pedidoId === "doc") {
        const latestOrder = await this.pedidoRepository.findLatestByUser(user.id);
        if (latestOrder) {
          pedidoId = latestOrder.id;
        }
      }

      if (!pedidoId) {
        const resp = "Não encontrei nenhum pedido recente para gerar o PDF. Envie a foto de um talão para começar!";
        await this.chatHistoryRepo.addMessage(user.id, "assistant", resp);
        return {
          userId: user.id,
          phoneNumber: user.phoneNumber,
          intent: "GENERATE_PEDIDO_PDF",
          responseText: resp,
        };
      }

      const pdfUrl = `${env.publicUrl}/api/finance/pedido/${pedidoId}/pdf`;
      const resp = `📄 *Seu Pedido em PDF está pronto para visualização/impressão!*\n\n📥 *Link do Documento/PDF:* ${pdfUrl}\n\n*(Clique no link para abrir a via completa do pedido).* 📗✨`;
      await this.chatHistoryRepo.addMessage(user.id, "assistant", resp);
      return {
        userId: user.id,
        phoneNumber: user.phoneNumber,
        intent: "GENERATE_PEDIDO_PDF",
        responseText: resp,
      };
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

    let isButtonClicked = false;
    let parsedResult: ExtractedIntentJSON;

    if (cleanText.startsWith("fin_confirm_") || cleanLower === "✅ sim, confirmar" || cleanLower === "sim, confirmar" || cleanLower === "confirmar lançamento") {
      parsedResult = { intent: "CONFIRM_TRANSACTION" };
      isButtonClicked = true;
    } else if (cleanText.startsWith("fin_cancel_") || cleanLower === "❌ cancelar" || cleanLower === "cancelar lançamento") {
      parsedResult = { intent: "CANCEL_TRANSACTION" };
      isButtonClicked = true;
    } else if (cleanText.startsWith("fin_edit_") || cleanLower === "✏️ editar" || cleanLower === "editar lançamento") {
      parsedResult = { intent: "EDIT_TRANSACTION" };
      isButtonClicked = true;
    } else {
      // 7. Chamar OpenAI com extração estruturada de JSON
      console.log("[FinancialAgentService] Extraindo intenção e dados estruturados via OpenAI...");
      const rawAiOutput = await this.openaiClient.generateCompletion(messagesForModel, true);

      try {
        parsedResult = JSON.parse(rawAiOutput);
      } catch (err) {
        console.error("[FinancialAgentService] Erro ao parsear JSON da OpenAI:", rawAiOutput);
        parsedResult = {
          intent: "CHAT_RESPONSE",
          response_text: "Desculpe, não consegui entender perfeitamente o lançamento. Pode repetir?",
        };
      }
    }

    console.log(`[FinancialAgentService] Intenção identificada: ${parsedResult.intent}`);

    let finalResponseText = parsedResult.response_text || "Processado com sucesso!";
    let transactionCreated: any = null;
    let payableCreated: any = null;
    let summaryData: any = null;
    let buttons: Array<{ id: string; title: string }> | undefined = undefined;

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

          const formattedAmount = Number(transactionCreated.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
          const categoryName = transactionCreated.category;

          finalResponseText = `Registrei ${formattedAmount} em ${categoryName}. Está certo?`;
          buttons = [
            { id: `fin_confirm_${transactionCreated.id}`, title: "✅ Sim, confirmar" },
            { id: `fin_edit_${transactionCreated.id}`, title: "✏️ Editar" },
            { id: `fin_cancel_${transactionCreated.id}`, title: "❌ Cancelar" },
          ];
        } else {
          finalResponseText = parsedResult.response_text || "Não consegui entender o valor. Pode me falar quanto foi? Ex: Gastei 50 na papelaria";
        }
        break;
      }

      case "CONFIRM_TRANSACTION": {
        finalResponseText = "Perfeito! Lançamento verificado e confirmado no seu caixa com sucesso. 🚀✨";
        break;
      }

      case "CANCEL_TRANSACTION": {
        const deleted = await this.transactionService.deleteLatestTransaction(user.id);
        if (deleted) {
          const formattedAmount = Number(deleted.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
          finalResponseText = `🗑️ Lançamento de ${formattedAmount} (${deleted.description}) cancelado e removido do seu caixa!`;
        } else {
          finalResponseText = "Não encontrei nenhum lançamento recente para cancelar.";
        }
        break;
      }

      case "EDIT_TRANSACTION": {
        finalResponseText = "Sem problemas! O que você gostaria de alterar no lançamento? Pode digitar ou mandar por áudio a correção (ex: 'Altere o valor para 50 reais' ou 'Mude a categoria para Transporte'). ✍️";
        break;
      }

      case "EDIT_PEDIDO": {
        const latestOrder = await this.pedidoRepository.findLatestByUser(user.id);
        if (!latestOrder) {
          finalResponseText = "Não encontrei nenhum pedido recente para editar. Envie uma foto do talão de pedido para começar!";
          break;
        }

        const rawItens = (parsedResult.data as any)?.itens || [];
        if (rawItens.length > 0) {
          const updatedItens = rawItens.map((item: any) => {
            const qty = Number(item.quantidade) || 1;
            const unit = Number(item.preco_unitario) || (Number(item.subtotal) / qty) || 0;
            const subtotal = Number(item.subtotal) || (qty * unit);
            return {
              descricao: item.descricao || "Item do Pedido",
              quantidade: qty,
              precoUnitario: unit,
              subtotal,
            };
          });

          const updatedOrder = await this.pedidoRepository.updateOrderItems(
            latestOrder.id,
            updatedItens,
            (parsedResult.data as any)?.cliente_nome
          );

          const formatted = this.pedidoOcrService.formatWhatsAppOrderMessage({
            pedido: updatedOrder,
            divergenciaCalculo: false,
          });

          finalResponseText = `✏️ *Pedido Atualizado com Sucesso!*\n\n${formatted.responseText.replace("📸 *Pedido Processado com Sucesso!*\n\n", "")}`;
          buttons = formatted.buttons;
        } else {
          finalResponseText = "Sem problemas! O que você gostaria de alterar no pedido? Pode me enviar os itens, quantidades ou valores por texto ou áudio. ✍️";
        }
        break;
      }

      case "LIST_PEDIDOS": {
        const pedidos = await this.pedidoRepository.findManyByUser(user.id);
        finalResponseText = this.pedidoOcrService.formatPedidosListWhatsAppMessage(pedidos);
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

      case "GET_SALES_SUMMARY": {
        const period = parsedResult.data?.period || "mes";
        const salesSummary = await this.transactionService.getSalesSummary(user.id, period);
        summaryData = salesSummary;
        finalResponseText = this.transactionService.formatSalesSummaryWhatsAppMessage(salesSummary, period);
        break;
      }

      case "LIST_TRANSACTIONS": {
        const paymentMethodFilter = parsedResult.data?.payment_method;
        const typeFilter = parsedResult.data?.type as any;
        const periodFilter = parsedResult.data?.period || "mes";

        const list = await this.transactionService.listTransactions(user.id, {
          paymentMethod: paymentMethodFilter,
          type: typeFilter,
          customerName: parsedResult.data?.customer_name,
          period: periodFilter,
        });

        let title = "Lançamentos";
        if (paymentMethodFilter && paymentMethodFilter.toLowerCase().includes("fiado")) {
          title = "Contas em Fiado / A Receber de Clientes";
        } else if (typeFilter === "RECEITA") {
          title = "Entradas / Receitas";
        } else if (typeFilter === "DESPESA") {
          title = "Gastos / Despesas";
        }

        finalResponseText = this.transactionService.formatListWhatsAppMessage(
          list,
          title,
          periodFilter,
          typeFilter
        );
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
      buttons,
    };
  }
}
