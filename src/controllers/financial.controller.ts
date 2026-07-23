import type { FastifyRequest, FastifyReply } from "fastify";
import { TransactionService } from "../services/transaction.service.js";
import { PayableService } from "../services/payable.service.js";
import { UserService } from "../services/user.service.js";
import { SpreadsheetService } from "../services/spreadsheet.service.js";
import { AppError } from "../errors/app-error.js";
import { TransactionType, RecipientType } from "@prisma/client";

export class FinancialController {
  private transactionService: TransactionService;
  private payableService: PayableService;
  private userService: UserService;
  private spreadsheetService: SpreadsheetService;

  constructor() {
    this.transactionService = new TransactionService();
    this.payableService = new PayableService();
    this.userService = new UserService();
    this.spreadsheetService = new SpreadsheetService();
  }

  public downloadSpreadsheet = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { userId?: string };
    const query = request.query as { phoneNumber?: string; userId?: string };

    let targetUserId = params.userId || query.userId;

    if (!targetUserId && query.phoneNumber) {
      const user = await this.userService.getUserByPhone(query.phoneNumber);
      if (!user) {
        throw new AppError("Usuário não encontrado.", 404);
      }
      targetUserId = user.id;
    }

    if (!targetUserId) {
      throw new AppError("Informe o 'userId' ou 'phoneNumber' para gerar a planilha.", 400);
    }

    const buffer = await this.spreadsheetService.generateFinancialSpreadsheetBuffer(targetUserId);
    const dateStr = new Date().toISOString().split("T")[0];
    const filename = `relatorio_financeiro_${dateStr}.xlsx`;

    return reply
      .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("Content-Disposition", `attachment; filename="${filename}"`)
      .send(buffer);
  };

  public getSummary = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { phoneNumber?: string; period?: "hoje" | "semana" | "mes" | "ano" | "geral" };
    if (!query.phoneNumber) {
      throw new AppError("Parâmetro 'phoneNumber' é obrigatório.", 400);
    }

    const user = await this.userService.getUserByPhone(query.phoneNumber);
    if (!user) {
      throw new AppError("Usuário não encontrado.", 404);
    }

    const summary = await this.transactionService.getSummary(user.id, query.period || "mes");
    return reply.status(200).send({
      success: true,
      user: { id: user.id, name: user.name, phoneNumber: user.phoneNumber, businessName: user.businessName },
      summary,
    });
  };

  public listTransactions = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      phoneNumber?: string;
      type?: TransactionType;
      paymentMethod?: string;
      customerName?: string;
      limit?: string;
    };

    if (!query.phoneNumber) {
      throw new AppError("Parâmetro 'phoneNumber' é obrigatório.", 400);
    }

    const user = await this.userService.getUserByPhone(query.phoneNumber);
    if (!user) {
      throw new AppError("Usuário não encontrado.", 404);
    }

    const transactions = await this.transactionService.listTransactions(user.id, {
      type: query.type,
      paymentMethod: query.paymentMethod,
      customerName: query.customerName,
      limit: query.limit ? Number(query.limit) : 50,
    });

    return reply.status(200).send({
      success: true,
      count: transactions.length,
      transactions,
    });
  };

  public createTransaction = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      phoneNumber: string;
      type: TransactionType;
      amount: number;
      category: string;
      description: string;
      paymentMethod: string;
      customerName?: string;
      installments?: number;
      date?: string;
      receiptUrl?: string;
    };

    if (!body.phoneNumber || !body.amount || !body.type) {
      throw new AppError("Os campos 'phoneNumber', 'amount' e 'type' são obrigatórios.", 400);
    }

    const user = await this.userService.getOrCreateUser(body.phoneNumber);
    const transaction = await this.transactionService.createTransaction({
      userId: user.id,
      type: body.type,
      amount: body.amount,
      category: body.category || "Outros",
      description: body.description || `${body.type} manual`,
      paymentMethod: body.paymentMethod || "PIX",
      customerName: body.customerName,
      installments: body.installments,
      date: body.date,
      receiptUrl: body.receiptUrl,
    });

    return reply.status(201).send({
      success: true,
      transaction,
    });
  };

  public listPayables = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      phoneNumber?: string;
      recipientType?: RecipientType;
    };

    if (!query.phoneNumber) {
      throw new AppError("Parâmetro 'phoneNumber' é obrigatório.", 400);
    }

    const user = await this.userService.getUserByPhone(query.phoneNumber);
    if (!user) {
      throw new AppError("Usuário não encontrado.", 404);
    }

    const payables = await this.payableService.listPayables(user.id, {
      recipientType: query.recipientType,
    });

    return reply.status(200).send({
      success: true,
      count: payables.length,
      payables,
    });
  };

  public createPayable = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      phoneNumber: string;
      recipientName: string;
      recipientType?: RecipientType;
      description: string;
      amount: number;
      dueDate: string;
    };

    if (!body.phoneNumber || !body.recipientName || !body.amount || !body.dueDate) {
      throw new AppError("Os campos 'phoneNumber', 'recipientName', 'amount' e 'dueDate' são obrigatórios.", 400);
    }

    const user = await this.userService.getOrCreateUser(body.phoneNumber);
    const payable = await this.payableService.createPayable({
      userId: user.id,
      recipientName: body.recipientName,
      recipientType: body.recipientType || "FORNECEDOR",
      description: body.description || `Conta a pagar para ${body.recipientName}`,
      amount: body.amount,
      dueDate: body.dueDate,
    });

    return reply.status(201).send({
      success: true,
      payable,
    });
  };
}
