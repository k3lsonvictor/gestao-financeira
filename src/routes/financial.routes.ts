import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { FinancialController } from "../controllers/financial.controller.js";

export const financialRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const controller = new FinancialController();

  // GET /api/finance/summary - Consulta de resumos financeiros por período
  fastify.get("/api/finance/summary", controller.getSummary);

  // GET /api/finance/transactions - Listagem e filtragem de lançamentos
  fastify.get("/api/finance/transactions", controller.listTransactions);

  // POST /api/finance/transactions - Cadastro manual de lançamentos
  fastify.post("/api/finance/transactions", controller.createTransaction);

  // GET /api/finance/spreadsheet/:userId - Download da planilha Excel (.xlsx)
  fastify.get("/api/finance/spreadsheet/:userId", controller.downloadSpreadsheet);
  fastify.get("/api/finance/spreadsheet", controller.downloadSpreadsheet);

  // GET /api/finance/payables - Consulta de contas a pagar (fornecedores / equipe)
  fastify.get("/api/finance/payables", controller.listPayables);

  // POST /api/finance/payables - Agendamento de conta a pagar
  fastify.post("/api/finance/payables", controller.createPayable);
};
