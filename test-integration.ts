import { FinancialAgentService } from "./src/services/financial-agent.service.js";
import { TransactionService } from "./src/services/transaction.service.js";
import { UserService } from "./src/services/user.service.js";
import { prisma } from "./src/config/prisma.js";

async function runIntegrationTest() {
  console.log("==================================================");
  console.log("🧪 INICIANDO TESTE DE INTEGRAÇÃO COMPLETO - GESTÃO FINANCEIRA");
  console.log("==================================================\n");

  const agent = new FinancialAgentService();
  const userService = new UserService();

  const testPhone = "5586999998888";

  // Limpar dados anteriores do usuário de teste
  const existingUser = await userService.getUserByPhone(testPhone);
  if (existingUser) {
    await prisma.transaction.deleteMany({ where: { userId: existingUser.id } });
    await prisma.payable.deleteMany({ where: { userId: existingUser.id } });
    await prisma.chatHistory.deleteMany({ where: { userId: existingUser.id } });
    await prisma.user.delete({ where: { id: existingUser.id } });
    console.log("🧹 Dados antigos de teste removidos.");
  }

  // Teste 1: Venda no cartão de crédito em parcelas com nome de cliente
  console.log("\n1️⃣  Testando Mensagem 1: 'Vendi um bolo de casamento por 450 reais no cartão em 3x pra Amanda'");
  const res1 = await agent.processIncomingMessage({
    phoneNumber: testPhone,
    userName: "Carlos",
    messageType: "text",
    textBody: "Vendi um bolo de casamento por 450 reais no cartão em 3x pra Amanda",
  });
  console.log("👉 Intenção:", res1.intent);
  console.log("📦 Dados Extraídos:", JSON.stringify(res1.extractedData));
  console.log("💬 Resposta da IA:\n", res1.responseText);

  // Teste 2: Agendamento de Conta a Pagar para Fornecedor
  console.log("\n2️⃣  Testando Mensagem 2: 'Tenho que pagar 600 reais pro fornecedor Moinho Sul dia 15/08'");
  const res2 = await agent.processIncomingMessage({
    phoneNumber: testPhone,
    messageType: "text",
    textBody: "Tenho que pagar 600 reais pro fornecedor Moinho Sul dia 15/08",
  });
  console.log("👉 Intenção:", res2.intent);
  console.log("📦 Dados Extraídos:", JSON.stringify(res2.extractedData));
  console.log("💬 Resposta da IA:\n", res2.responseText);

  // Teste 3: Agendamento de Salário de Funcionário
  console.log("\n3️⃣  Testando Mensagem 3: 'Salário da funcionária Maria de 1400 reais vence dia 05/08'");
  const res3 = await agent.processIncomingMessage({
    phoneNumber: testPhone,
    messageType: "text",
    textBody: "Salário da funcionária Maria de 1400 reais vence dia 05/08",
  });
  console.log("👉 Intenção:", res3.intent);
  console.log("📦 Dados Extraídos:", JSON.stringify(res3.extractedData));
  console.log("💬 Resposta da IA:\n", res3.responseText);

  // Teste 4: Consulta de Contas a Pagar (Fornecedores & Equipe)
  console.log("\n4️⃣  Testando Mensagem 4: 'Quais contas eu tenho pra pagar?'");
  const res4 = await agent.processIncomingMessage({
    phoneNumber: testPhone,
    messageType: "text",
    textBody: "Quais contas eu tenho pra pagar?",
  });
  console.log("👉 Intenção:", res4.intent);
  console.log("💬 Resposta da IA:\n", res4.responseText);

  // Teste 5: Marcar Conta como Paga
  console.log("\n5️⃣  Testando Mensagem 5: 'Paguei o fornecedor Moinho Sul'");
  const res5 = await agent.processIncomingMessage({
    phoneNumber: testPhone,
    messageType: "text",
    textBody: "Paguei o fornecedor Moinho Sul",
  });
  console.log("👉 Intenção:", res5.intent);
  console.log("💬 Resposta da IA:\n", res5.responseText);

  // Teste 6: Consulta de Apenas Gastos
  console.log("\n6️⃣  Testando Mensagem 6: 'Quero ver apenas os meus gastos deste mês'");
  const res6 = await agent.processIncomingMessage({
    phoneNumber: testPhone,
    messageType: "text",
    textBody: "Quero ver apenas os meus gastos deste mês",
  });
  console.log("👉 Intenção:", res6.intent);
  console.log("💬 Resposta da IA:\n", res6.responseText);

  // Teste 7: Consulta de Apenas Entradas
  console.log("\n7️⃣  Testando Mensagem 7: 'Mostre apenas as minhas entradas'");
  const res7 = await agent.processIncomingMessage({
    phoneNumber: testPhone,
    messageType: "text",
    textBody: "Mostre apenas as minhas entradas",
  });
  console.log("👉 Intenção:", res7.intent);
  console.log("💬 Resposta da IA:\n", res7.responseText);

  // Teste 8: Lançamento com Confirmação em Botões
  console.log("\n8️⃣  Testando Mensagem 8 (Botões de Confirmação): 'Comprei embalagens por 35 reais no dinheiro'");
  const res8 = await agent.processIncomingMessage({
    phoneNumber: testPhone,
    messageType: "text",
    textBody: "Comprei embalagens por 35 reais no dinheiro",
  });
  console.log("👉 Intenção:", res8.intent);
  console.log("💬 Resposta da IA:\n", res8.responseText);
  console.log("🔘 Botões Gerados:", JSON.stringify(res8.buttons));

  // Teste 8.1: Clique no botão de confirmação
  console.log("\n8️⃣.1 Clique no Botão: '✅ Sim, confirmar'");
  const res8Click = await agent.processIncomingMessage({
    phoneNumber: testPhone,
    messageType: "text",
    textBody: "✅ Sim, confirmar",
  });
  console.log("👉 Intenção:", res8Click.intent);
  console.log("💬 Resposta da IA:\n", res8Click.responseText);

  // Teste 9: Tratamento de Mensagem Confusa / Sem Valor Numérico
  console.log("\n9️⃣  Testando Mensagem Confusa 9: 'comprei uns trem lá pra loja'");
  const res9 = await agent.processIncomingMessage({
    phoneNumber: testPhone,
    messageType: "text",
    textBody: "comprei uns trem lá pra loja",
  });
  console.log("👉 Intenção:", res9.intent);
  console.log("💬 Resposta da IA:\n", res9.responseText);

  console.log("\n==================================================");
  console.log("✅ TESTE DE INTEGRAÇÃO FINALIZADO COM SUCESSO!");
  console.log("==================================================");

  await prisma.$disconnect();
}

runIntegrationTest().catch((err) => {
  console.error("❌ ERRO NO TESTE DE INTEGRAÇÃO:", err);
  prisma.$disconnect();
  process.exit(1);
});
