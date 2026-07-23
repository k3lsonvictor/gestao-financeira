import { PayableRepository } from "../repositories/payable.repository.js";
import { TransactionService } from "./transaction.service.js";
import { RecipientType, PayableStatus } from "@prisma/client";

export class PayableService {
  private payableRepo: PayableRepository;
  private transactionService: TransactionService;

  constructor() {
    this.payableRepo = new PayableRepository();
    this.transactionService = new TransactionService();
  }

  async createPayable(data: {
    userId: string;
    recipientName: string;
    recipientType?: RecipientType;
    description: string;
    amount: number;
    dueDate: string | Date;
  }) {
    let parsedDate = new Date();
    if (typeof data.dueDate === "string") {
      parsedDate = new Date(data.dueDate);
      if (isNaN(parsedDate.getTime())) {
        parsedDate = new Date();
      }
    } else {
      parsedDate = data.dueDate;
    }

    return this.payableRepo.create({
      userId: data.userId,
      recipientName: data.recipientName,
      recipientType: data.recipientType || "FORNECEDOR",
      description: data.description,
      amount: data.amount,
      dueDate: parsedDate,
    });
  }

  async listPayables(userId: string, filter?: { recipientType?: RecipientType; status?: PayableStatus }) {
    return this.payableRepo.findManyByUser(userId, filter);
  }

  async markAsPaid(userId: string, recipientName: string) {
    const pending = await this.payableRepo.findPendingByRecipient(userId, recipientName);
    if (!pending) {
      return null;
    }

    await this.payableRepo.markAsPaid(pending.id, userId);

    // Registra automaticamente como uma DESPESA realizada nas transações!
    const category = pending.recipientType === "FUNCIONARIO" ? "Equipe/Salário" : "Matéria-prima";
    await this.transactionService.createTransaction({
      userId,
      type: "DESPESA",
      amount: Number(pending.amount),
      category,
      description: `Pagamento realizado: ${pending.recipientName} (${pending.description})`,
      paymentMethod: "PIX",
      date: new Date(),
    });

    return pending;
  }

  formatPayablesWhatsAppMessage(payables: any[]): string {
    if (payables.length === 0) {
      return "✅ Nenhuma conta a pagar encontrada para os fornecedores ou funcionários.";
    }

    const formatMoney = (val: number) =>
      Number(val).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

    let message = `📝 *Contas a Pagar (Fornecedores & Equipe)*\n\n`;

    for (const p of payables) {
      const typeBadge = p.recipientType === "FUNCIONARIO" ? "👨‍🍳 Funcionário" : "🚚 Fornecedor";
      const statusEmoji = p.status === "PAGO" ? "✅ PAGO" : "⏳ PENDENTE";
      const dateStr = new Date(p.dueDate).toLocaleDateString("pt-BR");

      message += `• *${p.recipientName}* (${typeBadge})\n`;
      message += `   ↳ Valor: *${formatMoney(p.amount)}* | Vencimento: ${dateStr} | Status: ${statusEmoji}\n`;
      message += `   ↳ Descrição: ${p.description}\n\n`;
    }

    return message;
  }
}
