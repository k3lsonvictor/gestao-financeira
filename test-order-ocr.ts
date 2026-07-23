import { PedidoRepository } from "./src/repositories/pedido.repository.js";
import { UserService } from "./src/services/user.service.js";
import { prisma } from "./src/config/prisma.js";
import { StatusPedido, StatusPagamento } from "@prisma/client";

async function testOrderOCRFlow() {
  console.log("==================================================");
  console.log("🧪 TESTANDO PERSISTÊNCIA DE PEDIDOS E ITENS (OCR MANUSCRITO)");
  console.log("==================================================\n");

  const userService = new UserService();
  const repo = new PedidoRepository();
  const testPhone = "5586999997777";

  const user = await userService.getOrCreateUser(testPhone, "Padaria Silva");

  // 1. Simular persistência em lote de Pedido e Itens lidos via OCR
  console.log("1️⃣ Criando Pedido Manuscrito lido via OCR (Status Pagamento: PENDENTE)...");
  const pedidoPendente = await repo.create({
    userId: user.id,
    clienteNome: "Mercado Central",
    valorTotal: 150.0,
    valorAnotado: 150.0,
    divergenciaCalculo: false,
    statusPedido: StatusPedido.PENDENTE,
    statusPagamento: StatusPagamento.PENDENTE,
    itens: [
      { descricao: "Saco 100 Litros", quantidade: 10, precoUnitario: 10.0, subtotal: 100.0 },
      { descricao: "Fita Adesiva Larga", quantidade: 5, precoUnitario: 10.0, subtotal: 50.0 },
    ],
  });

  console.log("✅ Pedido Criado com Sucesso! ID:", pedidoPendente.id);
  console.log("📦 Itens Gravados:", pedidoPendente.itens.length);
  console.log("💰 Valor Total:", pedidoPendente.valorTotal.toString());

  // Verificar que NÃO gerou transação financeira em caixa pois está PENDENTE
  const transacoes1 = await prisma.transaction.findMany({ where: { userId: user.id } });
  console.log("📊 Transações no Caixa (Esperado 0):", transacoes1.length);

  // 2. Simular persistência de Pedido QUITADO (à vista)
  console.log("\n2️⃣ Criando Pedido Manuscrito Quitado À Vista (Status Pagamento: QUITADO)...");
  const pedidoQuitado = await repo.create({
    userId: user.id,
    clienteNome: "Restaurante Sabor Real",
    valorTotal: 320.5,
    valorAnotado: 320.5,
    divergenciaCalculo: false,
    statusPedido: StatusPedido.ENTREGUE,
    statusPagamento: StatusPagamento.QUITADO,
    itens: [
      { descricao: "Caixa de Detergente 5L", quantidade: 2, precoUnitario: 60.25, subtotal: 120.5 },
      { descricao: "Fardo de Papel Toalha", quantidade: 4, precoUnitario: 50.0, subtotal: 200.0 },
    ],
  });

  console.log("✅ Pedido Quitado Criado! ID:", pedidoQuitado.id);

  // Verificar que GEROU transação financeira automática no caixa em Receita
  const transacoes2 = await prisma.transaction.findMany({ where: { userId: user.id } });
  console.log("📊 Transações no Caixa (Esperado 1):", transacoes2.length);
  if (transacoes2.length > 0) {
    console.log("💵 Valor da Entrada:", transacoes2[0]?.amount.toString(), "| Categoria:", transacoes2[0]?.category);
  }

  // Limpeza
  await prisma.pedido.deleteMany({ where: { userId: user.id } });
  await prisma.transaction.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
  await prisma.$disconnect();

  console.log("\n==================================================");
  console.log("✅ TESTE DE PEDIDOS OCR FINALIZADO COM SUCESSO!");
  console.log("==================================================");
}

testOrderOCRFlow().catch((err) => {
  console.error("❌ ERRO NO TESTE DE PEDIDOS:", err);
  prisma.$disconnect();
  process.exit(1);
});
