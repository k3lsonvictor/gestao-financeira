import { app } from "./app.js";
import { env } from "./config/env.js";

async function startServer() {
  try {
    const address = await app.listen({
      port: env.port,
      host: "0.0.0.0",
    });

    console.log(`\n🚀 [Gestão Financeira IA] Servidor iniciado com sucesso!`);
    console.log(`🔗 URL local: http://localhost:${env.port}`);
    console.log(`📲 Webhook WhatsApp: http://localhost:${env.port}/webhook`);
    console.log(`💬 Endpoint Direto: http://localhost:${env.port}/api/finance/process-message\n`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

startServer();
