import { env } from "../config/env.js";

export class PDFGeneratorService {
  /**
   * Retorna a URL e a mensagem para download do PDF do pedido
   */
  generateOrderPDFUrl(pedidoId: string): string {
    return `${env.publicUrl}/api/finance/pedido/${pedidoId}/pdf`;
  }

  /**
   * Gera HTML estilizado para impressão/download em PDF do Pedido
   */
  generateOrderHTML(pedido: any): string {
    const formatMoney = (val: number) =>
      Number(val).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

    const dateStr = new Date(pedido.dataEmissao).toLocaleDateString("pt-BR");
    const cliente = pedido.clienteNome || "Cliente Não Identificado";

    let rowsHTML = "";
    for (const item of pedido.itens || []) {
      rowsHTML += `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.descricao}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${Number(item.quantidade)}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${formatMoney(Number(item.precoUnitario))}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold;">${formatMoney(Number(item.subtotal))}</td>
        </tr>
      `;
    }

    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Pedido #${pedido.id.substring(0, 8)}</title>
  <style>
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #333; }
    .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #6366f1; padding-bottom: 15px; }
    .header h1 { margin: 0; color: #4f46e5; font-size: 24px; }
    .info { display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 14px; }
    th { background: #f3f4f6; padding: 12px; text-align: left; font-weight: 600; }
    .total-box { margin-top: 30px; text-align: right; font-size: 18px; font-weight: bold; color: #111827; }
    .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="header">
    <h1>📄 TALÃO DE PEDIDO</h1>
    <p style="margin: 5px 0 0 0; color: #6b7280;">Documento de Venda Processado via OCR</p>
  </div>

  <div class="info">
    <div>
      <strong>Cliente:</strong> ${cliente}<br>
      <strong>Código do Pedido:</strong> #${pedido.id.substring(0, 8)}
    </div>
    <div style="text-align: right;">
      <strong>Data de Emissão:</strong> ${dateStr}<br>
      <strong>Status Pagamento:</strong> ${pedido.statusPagamento}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Descrição do Item</th>
        <th style="text-align: center;">Qtd</th>
        <th style="text-align: right;">Preço Unit.</th>
        <th style="text-align: right;">Subtotal</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHTML}
    </tbody>
  </table>

  <div class="total-box">
    VALOR TOTAL: ${formatMoney(Number(pedido.valorTotal))}
  </div>

  <div class="footer">
    Gerado automaticamente pela Plataforma de Gestão Inteligente Promto
  </div>
</body>
</html>
    `;
  }
}
