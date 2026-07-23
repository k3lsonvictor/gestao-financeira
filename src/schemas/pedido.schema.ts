import { z } from "zod";

export const itemPedidoSchema = z.object({
  descricao: z.string().describe("Nome ou descrição do item"),
  quantidade: z.number().describe("Quantidade do item (suporta decimais)"),
  preco_unitario: z.number().describe("Preço unitário do item"),
  subtotal: z.number().describe("Subtotal calculado (quantidade * preco_unitario)"),
});

export const ocrPedidoSchema = z.object({
  cliente_nome: z.string().nullable().optional().describe("Nome do cliente no topo da nota"),
  data: z.string().optional().describe("Data da emissão no formato YYYY-MM-DD"),
  itens: z.array(itemPedidoSchema).default([]).describe("Lista de itens identificados no talão"),
  valor_total_anotado: z.number().nullable().optional().describe("Valor total escrito no talão"),
  status_pagamento: z.enum(["pendente", "parcial", "quitado"]).default("pendente").describe("Status do pagamento se indicado na nota"),
});

export type OCRPedidoOutput = z.infer<typeof ocrPedidoSchema>;
