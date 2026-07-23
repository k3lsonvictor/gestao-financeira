import { prisma } from "../config/prisma.js";
import { PayableStatus, RecipientType, Prisma } from "@prisma/client";

export interface CreatePayableDTO {
  userId: string;
  recipientName: string;
  recipientType?: RecipientType;
  description: string;
  amount: number | Prisma.Decimal;
  dueDate: Date;
  status?: PayableStatus;
}

export interface PayableFilterDTO {
  recipientType?: RecipientType;
  status?: PayableStatus;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

export class PayableRepository {
  async create(data: CreatePayableDTO) {
    return prisma.payable.create({
      data: {
        userId: data.userId,
        recipientName: data.recipientName,
        recipientType: data.recipientType || "FORNECEDOR",
        description: data.description,
        amount: data.amount,
        dueDate: data.dueDate,
        status: data.status || "PENDENTE",
      },
    });
  }

  async findManyByUser(userId: string, filters?: PayableFilterDTO) {
    const where: Prisma.PayableWhereInput = { userId };

    if (filters?.recipientType) where.recipientType = filters.recipientType;
    if (filters?.status) where.status = filters.status;

    if (filters?.startDate || filters?.endDate) {
      where.dueDate = {};
      if (filters.startDate) where.dueDate.gte = filters.startDate;
      if (filters.endDate) where.dueDate.lte = filters.endDate;
    }

    return prisma.payable.findMany({
      where,
      orderBy: { dueDate: "asc" },
      take: filters?.limit || 50,
    });
  }

  async markAsPaid(id: string, userId: string) {
    return prisma.payable.updateMany({
      where: { id, userId },
      data: {
        status: "PAGO",
        paidAt: new Date(),
      },
    });
  }

  async findPendingByRecipient(userId: string, recipientName: string) {
    return prisma.payable.findFirst({
      where: {
        userId,
        status: "PENDENTE",
        recipientName: { contains: recipientName, mode: "insensitive" },
      },
      orderBy: { dueDate: "asc" },
    });
  }
}
