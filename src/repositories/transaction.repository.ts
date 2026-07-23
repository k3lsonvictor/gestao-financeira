import { prisma } from "../config/prisma.js";
import { TransactionType, Prisma } from "@prisma/client";

export interface CreateTransactionDTO {
  userId: string;
  type: TransactionType;
  amount: number | Prisma.Decimal;
  category: string;
  description: string;
  date?: Date;
  paymentMethod: string;
  customerName?: string;
  installments?: number;
  receiptUrl?: string;
}

export interface TransactionFilterDTO {
  type?: TransactionType;
  category?: string;
  paymentMethod?: string;
  customerName?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

export class TransactionRepository {
  async create(data: CreateTransactionDTO) {
    return prisma.transaction.create({
      data: {
        userId: data.userId,
        type: data.type,
        amount: data.amount,
        category: data.category,
        description: data.description,
        date: data.date || new Date(),
        paymentMethod: data.paymentMethod,
        customerName: data.customerName,
        installments: data.installments || 1,
        receiptUrl: data.receiptUrl,
      },
    });
  }

  async deleteById(id: string, userId: string) {
    return prisma.transaction.deleteMany({
      where: { id, userId },
    });
  }

  async deleteLatest(userId: string) {
    const latest = await prisma.transaction.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    if (latest) {
      await prisma.transaction.delete({ where: { id: latest.id } });
      return latest;
    }
    return null;
  }

  async findManyByUser(userId: string, filters?: TransactionFilterDTO) {
    const where: Prisma.TransactionWhereInput = { userId };

    if (filters?.type) where.type = filters.type;
    if (filters?.category) where.category = { contains: filters.category, mode: "insensitive" };
    if (filters?.paymentMethod) where.paymentMethod = { contains: filters.paymentMethod, mode: "insensitive" };
    if (filters?.customerName) where.customerName = { contains: filters.customerName, mode: "insensitive" };

    if (filters?.startDate || filters?.endDate) {
      where.date = {};
      if (filters.startDate) where.date.gte = filters.startDate;
      if (filters.endDate) where.date.lte = filters.endDate;
    }

    return prisma.transaction.findMany({
      where,
      orderBy: { date: "desc" },
      take: filters?.limit || 50,
    });
  }

  async getFinancialSummary(userId: string, startDate?: Date, endDate?: Date) {
    const where: Prisma.TransactionWhereInput = { userId };

    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = startDate;
      if (endDate) where.date.lte = endDate;
    }

    const transactions = await prisma.transaction.findMany({
      where,
      orderBy: { date: "desc" },
    });

    let totalReceitas = 0;
    let totalDespesas = 0;
    let totalFiadosGerados = 0;
    let totalRecebimentosFiado = 0;
    const categoryTotals: Record<string, number> = {};

    for (const t of transactions) {
      const numAmount = Number(t.amount);
      const isFiadoReceipt =
        t.category.toLowerCase().includes("recebimento de fiado") ||
        t.description.toLowerCase().includes("pagamento de fiado");

      if (t.type === "RECEITA") {
        totalReceitas += numAmount;
        if (isFiadoReceipt) {
          totalRecebimentosFiado += numAmount;
        }
      } else if (t.type === "DESPESA") {
        totalDespesas += numAmount;
      }

      if (t.paymentMethod.toLowerCase().includes("fiado") && !isFiadoReceipt) {
        totalFiadosGerados += numAmount;
      }

      categoryTotals[t.category] = (categoryTotals[t.category] || 0) + numAmount;
    }

    const saldo = totalReceitas - totalDespesas;
    const totalFiadosPendentes = Math.max(0, totalFiadosGerados - totalRecebimentosFiado);

    return {
      totalReceitas,
      totalDespesas,
      saldo,
      totalFiados: totalFiadosPendentes,
      count: transactions.length,
      categoryTotals,
      recentTransactions: transactions.slice(0, 5),
    };
  }

  async getSalesSummary(userId: string, startDate?: Date, endDate?: Date) {
    const where: Prisma.TransactionWhereInput = {
      userId,
      type: "RECEITA",
    };

    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = startDate;
      if (endDate) where.date.lte = endDate;
    }

    const sales = await prisma.transaction.findMany({
      where,
      orderBy: { date: "desc" },
    });

    let totalNovasVendas = 0;
    let totalRecebimentosFiado = 0;
    let totalFiadoGerado = 0;
    let countVendas = 0;

    const byPaymentMethod: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    const customerSummary: Record<string, { vendas: number; pagoFiado: number; devendo: number }> = {};

    for (const s of sales) {
      const numAmount = Number(s.amount);
      const isFiadoReceipt =
        s.category.toLowerCase().includes("recebimento de fiado") ||
        s.description.toLowerCase().includes("pagamento de fiado");

      const method = s.paymentMethod || "Outro";
      const isMethodFiado = method.toLowerCase().includes("fiado");

      if (isFiadoReceipt) {
        totalRecebimentosFiado += numAmount;

        if (s.customerName) {
          const c = customerSummary[s.customerName] || { vendas: 0, pagoFiado: 0, devendo: 0 };
          c.pagoFiado += numAmount;
          c.devendo = Math.max(0, c.vendas - c.pagoFiado);
          customerSummary[s.customerName] = c;
        }
      } else {
        totalNovasVendas += numAmount;
        countVendas++;

        if (isMethodFiado) {
          totalFiadoGerado += numAmount;
        }

        byPaymentMethod[method] = (byPaymentMethod[method] || 0) + numAmount;
        byCategory[s.category] = (byCategory[s.category] || 0) + numAmount;

        if (s.customerName) {
          const c = customerSummary[s.customerName] || { vendas: 0, pagoFiado: 0, devendo: 0 };
          c.vendas += numAmount;
          c.devendo = Math.max(0, c.vendas - c.pagoFiado);
          customerSummary[s.customerName] = c;
        }
      }
    }

    const totalFiadoPendenteAtual = Math.max(0, totalFiadoGerado - totalRecebimentosFiado);

    return {
      totalNovasVendas,
      totalRecebimentosFiado,
      totalFiadoGerado,
      totalFiadoPendenteAtual,
      countVendas,
      byPaymentMethod,
      byCategory,
      customerSummary,
      salesList: sales,
    };
  }

  async delete(id: string, userId: string) {
    return prisma.transaction.deleteMany({
      where: { id, userId },
    });
  }
}
