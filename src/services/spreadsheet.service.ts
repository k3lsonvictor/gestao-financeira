import ExcelJS from "exceljs";
import { prisma } from "../config/prisma.js";
import { AppError } from "../errors/app-error.js";

export class SpreadsheetService {
  /**
   * Gera um buffer de planilha Excel (.xlsx) completo com os lançamentos,
   * contas a pagar e resumo financeiro do usuário.
   */
  async generateFinancialSpreadsheetBuffer(userId: string): Promise<Buffer> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AppError("Usuário não encontrado.", 404);
    }

    const transactions = await prisma.transaction.findMany({
      where: { userId },
      orderBy: { date: "desc" },
    });

    const payables = await prisma.payable.findMany({
      where: { userId },
      orderBy: { dueDate: "desc" },
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Gestão Financeira IA";
    workbook.created = new Date();

    // -------------------------------------------------------------
    // ABA 1: LANÇAMENTOS (RECEITAS E DESPESAS)
    // -------------------------------------------------------------
    const sheetTrans = workbook.addWorksheet("Lançamentos");

    sheetTrans.columns = [
      { header: "Data", key: "date", width: 14 },
      { header: "Tipo", key: "type", width: 12 },
      { header: "Categoria", key: "category", width: 18 },
      { header: "Descrição", key: "description", width: 35 },
      { header: "Valor (R$)", key: "amount", width: 16 },
      { header: "Forma de Pagamento", key: "paymentMethod", width: 22 },
      { header: "Cliente", key: "customerName", width: 20 },
      { header: "Parcelas", key: "installments", width: 10 },
    ];

    // Estilizar cabeçalho
    const headerRowTrans = sheetTrans.getRow(1);
    headerRowTrans.font = { bold: true, color: { argb: "FFFFFF" } };
    headerRowTrans.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "1E293B" }, // Dark Slate
    };
    headerRowTrans.alignment = { vertical: "middle", horizontal: "center" };

    let totalReceitas = 0;
    let totalDespesas = 0;
    let totalFiados = 0;

    for (const t of transactions) {
      const val = Number(t.amount);
      if (t.type === "RECEITA") {
        totalReceitas += val;
        if (t.paymentMethod && t.paymentMethod.toLowerCase().includes("fiado")) {
          totalFiados += val;
        }
      } else {
        totalDespesas += val;
      }

      const dateStr = t.date ? new Date(t.date).toLocaleDateString("pt-BR") : "";

      const row = sheetTrans.addRow({
        date: dateStr,
        type: t.type,
        category: t.category,
        description: t.description,
        amount: val,
        paymentMethod: t.paymentMethod,
        customerName: t.customerName || "-",
        installments: t.installments || 1,
      });

      // Formatação condicional de cores por tipo
      const typeCell = row.getCell("type");
      if (t.type === "RECEITA") {
        typeCell.font = { color: { argb: "16A34A" }, bold: true }; // Verde
      } else {
        typeCell.font = { color: { argb: "DC2626" }, bold: true }; // Vermelho
      }

      row.getCell("amount").numFmt = '"R$"#,##0.00;[Red]"-R$"#,##0.00';
    }

    // -------------------------------------------------------------
    // ABA 2: CONTAS A PAGAR (FORNECEDORES / FUNCIONÁRIOS)
    // -------------------------------------------------------------
    const sheetPayables = workbook.addWorksheet("Contas a Pagar");

    sheetPayables.columns = [
      { header: "Favorecido/Fornecedor", key: "recipientName", width: 25 },
      { header: "Tipo", key: "recipientType", width: 16 },
      { header: "Descrição", key: "description", width: 35 },
      { header: "Valor (R$)", key: "amount", width: 16 },
      { header: "Vencimento", key: "dueDate", width: 14 },
      { header: "Status", key: "status", width: 14 },
      { header: "Data Pagamento", key: "paidAt", width: 16 },
    ];

    const headerRowPay = sheetPayables.getRow(1);
    headerRowPay.font = { bold: true, color: { argb: "FFFFFF" } };
    headerRowPay.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "0F172A" },
    };
    headerRowPay.alignment = { vertical: "middle", horizontal: "center" };

    let totalContasPendentes = 0;

    for (const p of payables) {
      const val = Number(p.amount);
      if (p.status === "PENDENTE") {
        totalContasPendentes += val;
      }

      const dueStr = p.dueDate ? new Date(p.dueDate).toLocaleDateString("pt-BR") : "";
      const paidStr = p.paidAt ? new Date(p.paidAt).toLocaleDateString("pt-BR") : "-";

      const row = sheetPayables.addRow({
        recipientName: p.recipientName,
        recipientType: p.recipientType,
        description: p.description,
        amount: val,
        dueDate: dueStr,
        status: p.status,
        paidAt: paidStr,
      });

      const statusCell = row.getCell("status");
      if (p.status === "PAGO") {
        statusCell.font = { color: { argb: "16A34A" }, bold: true };
      } else if (p.status === "PENDENTE") {
        statusCell.font = { color: { argb: "D97706" }, bold: true }; // Laranja
      }

      row.getCell("amount").numFmt = '"R$"#,##0.00;[Red]"-R$"#,##0.00';
    }

    // -------------------------------------------------------------
    // ABA 3: RESUMO GERAL
    // -------------------------------------------------------------
    const sheetSummary = workbook.addWorksheet("Resumo Financeiro");

    sheetSummary.columns = [
      { header: "Indicador / Métrica", key: "metric", width: 35 },
      { header: "Valor (R$)", key: "value", width: 22 },
    ];

    const headerRowSum = sheetSummary.getRow(1);
    headerRowSum.font = { bold: true, color: { argb: "FFFFFF" } };
    headerRowSum.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "047857" }, // Emerald Green
    };

    const saldoLiquido = totalReceitas - totalDespesas;

    const summaryRows = [
      { metric: "Total de Receitas (Vendas/Entradas)", value: totalReceitas },
      { metric: "Total de Despesas (Gastos/Saídas)", value: totalDespesas },
      { metric: "Saldo Líquido em Caixa", value: saldoLiquido },
      { metric: "Contas Pendentes a Pagar (Fornecedores)", value: totalContasPendentes },
      { metric: "Total em Fiados a Receber (Clientes)", value: totalFiados },
    ];

    for (const item of summaryRows) {
      const row = sheetSummary.addRow(item);
      row.getCell("value").numFmt = '"R$"#,##0.00;[Red]"-R$"#,##0.00';

      if (item.metric.includes("Saldo Líquido")) {
        row.font = { bold: true };
        row.getCell("value").font = {
          bold: true,
          color: { argb: saldoLiquido >= 0 ? "16A34A" : "DC2626" },
        };
      }
    }

    const uint8Array = await workbook.xlsx.writeBuffer();
    return Buffer.from(uint8Array);
  }
}
