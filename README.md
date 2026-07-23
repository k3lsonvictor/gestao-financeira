# 💰 Gestão Financeira via WhatsApp (IA)

Serviço backend de **gestão financeira inteligente para pequenos empreendedores e autônomos**, acessível através do WhatsApp. O serviço utiliza Inteligência Artificial (OpenAI GPT-4o, Visão e Whisper) para permitir que o usuário controle receitas, despesas, comprovantes e fiados conversando naturalmente por texto, notas de voz ou fotos de recibos.

---

## 🛠️ Pilha Tecnológica & Arquitetura

- **Linguagem & Runtime:** Node.js (TypeScript - ESM)
- **Framework Web:** Fastify 5
- **ORM & Banco de Dados:** Prisma 7 + PostgreSQL (`@prisma/adapter-pg` & `pg`)
- **Inteligência Artificial:**
  - **OpenAI GPT-4o / GPT-4o-mini:** Extração estruturada de intenções via JSON Schema / Function Calling
  - **OpenAI Whisper:** Transcrição automática de mensagens de áudio do WhatsApp
  - **GPT-4o Vision:** Leitura e OCR inteligente de notas fiscais, fotos e recibos de compra
- **Comunicação WhatsApp:** WhatsApp Cloud API / Evolution API / Webhook Router
- **Conteinerização:** Docker Compose para banco PostgreSQL nativo

---

## 🗄️ Esquema do Banco de Dados (Prisma Schema)

```prisma
model User {
  id           String        @id @default(uuid())
  phoneNumber  String        @unique @map("phone_number")
  name         String
  businessName String?       @map("business_name")
  createdAt    DateTime      @default(now()) @map("created_at")
  transactions Transaction[]
  chatHistory  ChatHistory[]

  @@map("users")
}

model Transaction {
  id            String          @id @default(uuid())
  userId        String          @map("user_id")
  type          TransactionType // Enum: RECEITA | DESPESA
  amount        Decimal         @db.Decimal(12, 2)
  category      String
  description   String          @db.Text
  date          DateTime        @default(now()) @db.Date
  paymentMethod String          @map("payment_method")
  receiptUrl    String?         @map("receipt_url")
  createdAt     DateTime        @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("transactions")
}

model ChatHistory {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  role      ChatRole // Enum: user | assistant | system
  content   String   @db.Text
  timestamp DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("chat_history")
}
```

---

## 🧠 Extração Estruturada de Dados (Intenções da IA)

Quando o usuário envia uma mensagem sobre uma movimentação financeira (texto, áudio transcrevido ou foto de recibo), o modelo extrai um JSON estruturado:

```json
{
  "intent": "ADD_TRANSACTION",
  "data": {
    "type": "DESPESA",
    "amount": 45.00,
    "category": "Matéria-prima",
    "description": "Compra de sacolas no centro",
    "payment_method": "PIX",
    "date": "2026-07-22"
  },
  "response_text": "Anotado! Cadastrei uma DESPESA de R$ 45,00 (Matéria-prima) paga em PIX. 🛍️"
}
```

### Intenções Suportadas:
- `ADD_TRANSACTION`: Registrar receita, despesa ou venda em fiado.
- `GET_SUMMARY`: Obter resumo financeiro (Saldo, Receitas, Despesas, Fiados e Total por Categoria por período: `hoje`, `semana`, `mes`, `ano`, `geral`).
- `LIST_TRANSACTIONS`: Listar lançamentos recentes ou filtrar contas em fiado a receber.
- `REGISTER_USER`: Atualizar nome do usuário e nome do negócio.
- `CHAT_RESPONSE`: Diálogo natural, orientações e dúvidas gerais.

---

## 🚀 Como Executar o Projeto

### 1. Clonar e Instalar Dependências
```bash
cd gestao-financeira
npm install
```

### 2. Subir Banco PostgreSQL via Docker
```bash
docker compose up -d
```

### 3. Sincronizar Banco com Prisma
```bash
npm run prisma:db:push
```

### 4. Iniciar em Ambiente de Desenvolvimento
```bash
npm run dev
```
O servidor estará rodando em `http://localhost:3334`.

---

## 🔗 Integração com o kel-ia (Mesmo número do WhatsApp)

Como o serviço de **Gestão Financeira** e o **kel-ia** utilizam o mesmo número do WhatsApp, foram disponibilizadas duas opções de roteamento:

1. **Webhook Direto Meta/Evolution:** Apontar o Webhook para `http://localhost:3334/webhook`.
2. **Encaminhamento Interno via `kel-ia`:** O `kel-ia` (porta 3333) pode encaminhar requisições financeiras para `http://localhost:3334/api/finance/process-message` passando o payload:
```json
{
  "phoneNumber": "5586981296314",
  "userName": "Nome do Usuário",
  "messageType": "text",
  "textBody": "Vendi 3 bolos no PIX total 90 reais",
  "sendWhatsAppReply": true
}
```

---

## 🧪 Rodando os Testes de Integração
```bash
npx tsx test-integration.ts
```
# gestao-financeira
