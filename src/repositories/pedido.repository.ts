import { prisma } from "../config/prisma.js";
import { StatusPedido, StatusPagamento, Prisma } from "@prisma/client";

export interface CreateItemPedidoDTO {
  descricao: string;
  quantidade: number;
  precoUnitario: number;
  subtotal: number;
}

export interface CreatePedidoDTO {
  userId: string;
  clienteNome?: string | null;
  dataEmissao?: Date;
  valorTotal: number;
  valorAnotado?: number | null;
  divergenciaCalculo?: boolean;
  statusPedido?: StatusPedido;
  statusPagamento?: StatusPagamento;
  imagemUrl?: string | null;
  itens: CreateItemPedidoDTO[];
}

export class PedidoRepository {
  /**
   * Persiste o pedido e seus itens em lote via transação Prisma.
   * Se o pagamento for 'QUITADO', cria automaticamente o registro financeiro em Receita (Vendas).
   */
  async create(data: CreatePedidoDTO) {
    const dataEmissao = data.dataEmissao || new Date();
    const statusPedido = data.statusPedido || StatusPedido.PENDENTE;
    const statusPagamento = data.statusPagamento || StatusPagamento.PENDENTE;

    return prisma.$transaction(async (tx) => {
      // 1. Criar Pedido com os Itens associados
      const pedido = await tx.pedido.create({
        data: {
          userId: data.userId,
          clienteNome: data.clienteNome || null,
          dataEmissao,
          valorTotal: data.valorTotal,
          valorAnotado: data.valorAnotado || null,
          divergenciaCalculo: data.divergenciaCalculo || false,
          statusPedido,
          statusPagamento,
          imagemUrl: data.imagemUrl || null,
          itens: {
            create: data.itens.map((item) => ({
              descricao: item.descricao,
              quantidade: item.quantidade,
              precoUnitario: item.precoUnitario,
              subtotal: item.subtotal,
            })),
          },
        },
        include: {
          itens: true,
        },
      });

      // 2. Se statusPagamento for QUITADO, cria entrada no caixa automaticamente
      if (statusPagamento === StatusPagamento.QUITADO) {
        await tx.transaction.create({
          data: {
            userId: data.userId,
            type: "RECEITA",
            amount: data.valorTotal,
            category: "Vendas",
            description: `Venda do Pedido #${pedido.id.substring(0, 8)} (${data.clienteNome || "Cliente Não Identificado"})`,
            date: dataEmissao,
            paymentMethod: "Dinheiro/PIX",
            customerName: data.clienteNome || undefined,
            receiptUrl: data.imagemUrl || undefined,
          },
        });
      }

      return pedido;
    });
  }

  async findById(id: string) {
    return prisma.pedido.findUnique({
      where: { id },
      include: {
        itens: true,
      },
    });
  }

  async findManyByUser(userId: string) {
    return prisma.pedido.findMany({
      where: { userId },
      include: {
        itens: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async updateStatus(id: string, statusPedido?: StatusPedido, statusPagamento?: StatusPagamento) {
    return prisma.pedido.update({
      where: { id },
      data: {
        ...(statusPedido && { statusPedido }),
        ...(statusPagamento && { statusPagamento }),
      },
      include: {
        itens: true,
      },
    });
  }

  async delete(id: string, userId: string) {
    return prisma.pedido.deleteMany({
      where: { id, userId },
    });
  }
}
