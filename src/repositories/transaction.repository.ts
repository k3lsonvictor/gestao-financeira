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
    let totalFiados = 0;
    const categoryTotals: Record<string, number> = {};

    for (const t of transactions) {
      const numAmount = Number(t.amount);
      if (t.type === "RECEITA") {
        totalReceitas += numAmount;
      } else if (t.type === "DESPESA") {
        totalDespesas += numAmount;
      }

      if (t.paymentMethod.toLowerCase().includes("fiado")) {
        totalFiados += numAmount;
      }

      categoryTotals[t.category] = (categoryTotals[t.category] || 0) + numAmount;
    }

    const saldo = totalReceitas - totalDespesas;

    return {
      totalReceitas,
      totalDespesas,
      saldo,
      totalFiados,
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

    let totalVendas = 0;
    let totalFiadoAtestado = 0;
    const byPaymentMethod: Record<string, number> = {};
    const byCustomer: Record<string, number> = {};
    const byCategory: Record<string, number> = {};

    for (const s of sales) {
      const numAmount = Number(s.amount);
      totalVendas += numAmount;

      const method = s.paymentMethod || "PIX/Outro";
      byPaymentMethod[method] = (byPaymentMethod[method] || 0) + numAmount;

      if (s.customerName) {
        byCustomer[s.customerName] = (byCustomer[s.customerName] || 0) + numAmount;
      }

      if (s.category) {
        byCategory[s.category] = (byCategory[s.category] || 0) + numAmount;
      }

      if (method.toLowerCase().includes("fiado")) {
        totalFiadoAtestado += numAmount;
      }
    }

    return {
      totalVendas,
      count: sales.length,
      totalFiadoAtestado,
      byPaymentMethod,
      byCustomer,
      byCategory,
      salesList: sales,
    };
  }

  async delete(id: string, userId: string) {
    return prisma.transaction.deleteMany({
      where: { id, userId },
    });
  }
}
