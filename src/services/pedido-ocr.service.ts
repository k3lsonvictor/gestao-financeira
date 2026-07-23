import { OpenAIClient } from "../integrations/openai/openai.client.js";
import { ocrPedidoSchema, type OCRPedidoOutput } from "../schemas/pedido.schema.js";
import { PedidoRepository } from "../repositories/pedido.repository.js";
import { StatusPedido, StatusPagamento } from "@prisma/client";
import { AppError } from "../errors/app-error.js";

export class PedidoOCRService {
  private openaiClient: OpenAIClient;
  private pedidoRepository: PedidoRepository;

  constructor() {
    this.openaiClient = new OpenAIClient();
    this.pedidoRepository = new PedidoRepository();
  }

  /**
   * Processa a imagem do talão de pedido via OCR Multimodal (GPT-4o Vision),
   * valida o JSON extraído com Zod, recalcula os valores e persiste no banco de dados.
   */
  async processAndSaveOrderImage(data: {
    userId: string;
    imageBase64OrUrl: string;
    imagemUrl?: string;
  }) {
    console.log(`[PedidoOCRService] Processando talão de pedido para usuário ${data.userId}...`);

    let imageUrl = data.imageBase64OrUrl.trim();
    if (!imageUrl.startsWith("http://") && !imageUrl.startsWith("https://")) {
      if (imageUrl.startsWith("data:")) {
        if (!/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(imageUrl)) {
          imageUrl = imageUrl.replace(/^data:[^;]+;base64,/, "");
          imageUrl = `data:image/jpeg;base64,${imageUrl.replace(/\s+/g, "")}`;
        }
      } else {
        imageUrl = `data:image/jpeg;base64,${imageUrl.replace(/\s+/g, "")}`;
      }
    }

    const systemPrompt = `Você é um assistente especialista em OCR de notas e talões de pedidos manuscritos brasileiros.
Analise a imagem fornecida e extraia um JSON estruturado estritamente no seguinte formato:

{
  "cliente_nome": string ou null (Nome do cliente no topo do talão),
  "data": "YYYY-MM-DD" (Data escrita na nota. Se não legível ou ausente, use a data de hoje),
  "itens": [
    {
      "descricao": string (Nome/descrição do item),
      "quantidade": number (Quantidade do item, inteira ou fracionada),
      "preco_unitario": number (Preço por unidade),
      "subtotal": number (Preço total do item)
    }
  ],
  "valor_total_anotado": number ou null (Valor total escrito manualmente no papel),
  "status_pagamento": "pendente" | "parcial" | "quitado" (se houver anotação como 'pago', 'pix à vista', 'dinheiro', marque 'quitado'; se for 'fiado' ou 'a prazo', marque 'pendente')
}

IMPORTANTE:
- Recalcule a matemática (quantidade * preco_unitario) para cada item.
- Calcule a soma real de todos os subtotais dos itens.
- Responda APENAS com o objeto JSON sem marcações em markdown ou explicações externas.`;

    // 1. Envia a imagem para GPT-4o Vision
    let parsedRaw: any;
    try {
      const rawAiOutput = await this.openaiClient.client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: "Analise este talão de pedido manuscrito e extraia o JSON estruturado." },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      });

      const jsonText = rawAiOutput.choices[0]?.message?.content || "{}";
      parsedRaw = JSON.parse(jsonText);
    } catch (error: any) {
      console.error("[PedidoOCRService] Erro ao chamar OpenAI Vision:", error?.message || error);
      throw new AppError(
        "Não foi possível processar a foto do pedido. Por favor, envie uma imagem nos formatos PNG, JPEG ou WEBP com boa iluminação.",
        400
      );
    }

    // 2. Valida o JSON extraído com Zod Schema
    const validatedData: OCRPedidoOutput = ocrPedidoSchema.parse(parsedRaw);

    // 3. Recalcular matematicamente os subtotais e valor total
    let calculatedTotal = 0;
    const processedItens = validatedData.itens.map((item) => {
      const qty = Number(item.quantidade) || 1;
      const unit = Number(item.preco_unitario) || 0;
      const subtotal = Math.round(qty * unit * 100) / 100;
      calculatedTotal += subtotal;
      return {
        descricao: item.descricao || "Item Não Identificado",
        quantidade: qty,
        precoUnitario: unit,
        subtotal: subtotal > 0 ? subtotal : Number(item.subtotal) || 0,
      };
    });

    calculatedTotal = Math.round(calculatedTotal * 100) / 100;
    const valorAnotado = validatedData.valor_total_anotado != null ? Number(validatedData.valor_total_anotado) : null;
    const divergenciaCalculo = valorAnotado !== null && Math.abs(valorAnotado - calculatedTotal) > 0.05;

    // Determinar Status de Pagamento
    let statusPagamentoEnum: StatusPagamento = StatusPagamento.PENDENTE;
    if (validatedData.status_pagamento === "quitado") {
      statusPagamentoEnum = StatusPagamento.QUITADO;
    } else if (validatedData.status_pagamento === "parcial") {
      statusPagamentoEnum = StatusPagamento.PARCIAL;
    }

    // 4. Persistir Pedido e Itens via PedidoRepository
    const pedido = await this.pedidoRepository.create({
      userId: data.userId,
      clienteNome: validatedData.cliente_nome || null,
      dataEmissao: validatedData.data ? new Date(validatedData.data) : new Date(),
      valorTotal: calculatedTotal,
      valorAnotado: valorAnotado,
      divergenciaCalculo,
      statusPedido: StatusPedido.PENDENTE,
      statusPagamento: statusPagamentoEnum,
      imagemUrl: data.imagemUrl || null,
      itens: processedItens,
    });

    return {
      pedido,
      ocrData: validatedData,
      calculatedTotal,
      divergenciaCalculo,
    };
  }

  /**
   * Formata a mensagem de confirmação visual para envio via WhatsApp com Botões Interativos
   */
  formatWhatsAppOrderMessage(pedidoData: {
    pedido: any;
    divergenciaCalculo: boolean;
  }) {
    const { pedido, divergenciaCalculo } = pedidoData;
    const formatMoney = (val: number) =>
      Number(val).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

    const dateStr = new Date(pedido.dataEmissao).toLocaleDateString("pt-BR");
    const clienteStr = pedido.clienteNome ? pedido.clienteNome : "Não identificado";

    let message = `📸 *Pedido Processado com Sucesso!*\n\n`;
    message += `👤 *Cliente:* ${clienteStr}\n`;
    message += `🗓️ *Data:* ${dateStr}\n\n`;

    message += `📋 *Itens Reconhecidos:*\n`;
    for (const item of pedido.itens) {
      const qty = Number(item.quantidade);
      const subtotal = Number(item.subtotal);
      message += `• ${qty}x ${item.descricao} — ${formatMoney(subtotal)}\n`;
    }

    message += `\n💰 *Total do Pedido:* ${formatMoney(Number(pedido.valorTotal))}\n`;

    if (divergenciaCalculo && pedido.valorAnotado) {
      message += `\n⚠️ *Atenção:* O total escrito no papel (${formatMoney(Number(pedido.valorAnotado))}) difere da soma dos itens (${formatMoney(Number(pedido.valorTotal))}).\n`;
    }

    message += `\nEscolha uma ação abaixo:`;

    const buttons = [
      { id: `ped_confirm_${pedido.id}`, title: "✅ Confirmar Pedido" },
      { id: `ped_edit_${pedido.id}`, title: "✏️ Editar / Ajustar" },
      { id: `ped_pdf_${pedido.id}`, title: "📄 Gerar PDF" },
    ];

    return {
      responseText: message,
      buttons,
    };
  }
}
