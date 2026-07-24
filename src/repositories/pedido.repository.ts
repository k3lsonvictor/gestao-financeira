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

  async findLatestByUser(userId: string) {
    return prisma.pedido.findFirst({
      where: { userId },
      include: {
        itens: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async findOrderByIdOrSnippetOrClient(userId: string, search: string) {
    const cleanSearch = search.trim();
    if (!cleanSearch) return this.findLatestByUser(userId);

    const byId = await prisma.pedido.findFirst({
      where: { userId, id: cleanSearch },
      include: { itens: true },
    });
    if (byId) return byId;

    const bySnippet = await prisma.pedido.findFirst({
      where: { userId, id: { startsWith: cleanSearch } },
      include: { itens: true },
      orderBy: { createdAt: "desc" },
    });
    if (bySnippet) return bySnippet;

    const byClient = await prisma.pedido.findFirst({
      where: { userId, clienteNome: { contains: cleanSearch, mode: "insensitive" } },
      include: { itens: true },
      orderBy: { createdAt: "desc" },
    });
    if (byClient) return byClient;

    return this.findLatestByUser(userId);
  }

  async updateOrderItems(id: string, itens: CreateItemPedidoDTO[], clienteNome?: string | null) {
    const valorTotal = itens.reduce((sum, item) => sum + (item.subtotal || item.quantidade * item.precoUnitario), 0);

    return prisma.$transaction(async (tx) => {
      await tx.itemPedido.deleteMany({ where: { pedidoId: id } });

      return tx.pedido.update({
        where: { id },
        data: {
          ...(clienteNome !== undefined && { clienteNome }),
          valorTotal,
          itens: {
            create: itens.map((item) => ({
              descricao: item.descricao,
              quantidade: item.quantidade,
              precoUnitario: item.precoUnitario,
              subtotal: item.subtotal || item.quantidade * item.precoUnitario,
            })),
          },
        },
        include: { itens: true },
      });
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
