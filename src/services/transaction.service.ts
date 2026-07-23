import { TransactionRepository } from "../repositories/transaction.repository.js";
import { TransactionType } from "@prisma/client";

export class TransactionService {
  private transactionRepository: TransactionRepository;

  constructor() {
    this.transactionRepository = new TransactionRepository();
  }

  async createTransaction(data: {
    userId: string;
    type: TransactionType;
    amount: number;
    category: string;
    description: string;
    paymentMethod: string;
    customerName?: string;
    installments?: number;
    date?: string | Date;
    receiptUrl?: string;
  }) {
    let parsedDate = new Date();
    if (data.date) {
      if (typeof data.date === "string") {
        parsedDate = new Date(data.date);
        if (isNaN(parsedDate.getTime())) {
          parsedDate = new Date();
        }
      } else {
        parsedDate = data.date;
      }
    }

    return this.transactionRepository.create({
      userId: data.userId,
      type: data.type,
      amount: data.amount,
      category: data.category || "Outros",
      description: data.description || `${data.type} registrada`,
      paymentMethod: data.paymentMethod || "Outro",
      customerName: data.customerName,
      installments: data.installments || 1,
      date: parsedDate,
      receiptUrl: data.receiptUrl,
    });
  }

  async getSummary(userId: string, period: "hoje" | "semana" | "mes" | "ano" | "geral" = "mes") {
    const now = new Date();
    let startDate: Date | undefined;
    let endDate: Date | undefined;

    if (period === "hoje") {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    } else if (period === "semana") {
      const dayOfWeek = now.getDay();
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek, 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (6 - dayOfWeek), 23, 59, 59);
    } else if (period === "mes") {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    } else if (period === "ano") {
      startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0);
      endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
    }

    const summary = await this.transactionRepository.getFinancialSummary(userId, startDate, endDate);
    return {
      period,
      ...summary,
    };
  }

  formatSummaryWhatsAppMessage(summary: any): string {
    const formatMoney = (val: number) =>
      val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

    const periodLabelMap: Record<string, string> = {
      hoje: "de Hoje",
      semana: "desta Semana",
      mes: "deste Mês",
      ano: "deste Ano",
      geral: "Geral (Todo o Período)",
    };

    const periodLabel = periodLabelMap[summary.period] || "deste Mês";
    const saldoEmoji = summary.saldo >= 0 ? "🟢" : "🔴";

    let message = `📊 *Resumo Financeiro ${periodLabel}*\n\n`;
    message += `💰 *Receitas:* ${formatMoney(summary.totalReceitas)}\n`;
    message += `💸 *Despesas:* ${formatMoney(summary.totalDespesas)}\n`;
    message += `-------------------------\n`;
    message += `${saldoEmoji} *Saldo Líquido:* ${formatMoney(summary.saldo)}\n`;

    if (summary.totalFiados > 0) {
      message += `📝 *Total em Fiados/A receber:* ${formatMoney(summary.totalFiados)}\n`;
    }

    if (Object.keys(summary.categoryTotals).length > 0) {
      message += `\n🏷️ *Por Categoria:*\n`;
      for (const [cat, amount] of Object.entries(summary.categoryTotals)) {
        message += `• ${cat}: ${formatMoney(amount as number)}\n`;
      }
    }

    return message;
  }

  async listTransactions(userId: string, filter?: { paymentMethod?: string; type?: TransactionType; customerName?: string; limit?: number }) {
    return this.transactionRepository.findManyByUser(userId, filter);
  }

  formatListWhatsAppMessage(transactions: any[], title = "Lançamentos"): string {
    if (transactions.length === 0) {
      return `ℹ️ Nenhum lançamento encontrado para os critérios solicitados.`;
    }

    const formatMoney = (val: number) =>
      Number(val).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

    let message = `📋 *${title} (${transactions.length})*\n\n`;

    for (const t of transactions) {
      const typeEmoji = t.type === "RECEITA" ? "📈" : "📉";
      const dateStr = new Date(t.date).toLocaleDateString("pt-BR");
      const clientInfo = t.customerName ? ` (Cliente: ${t.customerName})` : "";
      const parcelasInfo = t.installments && t.installments > 1 ? ` em ${t.installments}x` : "";

      message += `${typeEmoji} *${formatMoney(t.amount)}* - ${t.description}${clientInfo}\n`;
      message += `   ↳ _${t.category}_ | ${t.paymentMethod}${parcelasInfo} | ${dateStr}\n\n`;
    }

    return message;
  }
}
