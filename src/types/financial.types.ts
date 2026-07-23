export type TransactionType = "RECEITA" | "DESPESA";
export type PayableStatusType = "PENDENTE" | "PAGO" | "CANCELADO";
export type RecipientType = "FORNECEDOR" | "FUNCIONARIO" | "OUTRO";

export type IntentType =
  | "ADD_TRANSACTION"
  | "GET_SUMMARY"
  | "LIST_TRANSACTIONS"
  | "ADD_PAYABLE"
  | "LIST_PAYABLES"
  | "MARK_PAYABLE_PAID"
  | "REGISTER_USER"
  | "CHAT_RESPONSE";

export interface TransactionExtractionData {
  type: TransactionType;
  amount: number;
  category: string;
  description: string;
  payment_method: string;
  customer_name?: string;
  installments?: number;
  date?: string; // Formato YYYY-MM-DD
}

export interface PayableExtractionData {
  recipient_name: string;
  recipient_type?: RecipientType;
  amount: number;
  description: string;
  due_date: string; // Formato YYYY-MM-DD
  status?: PayableStatusType;
}

export interface SummaryFilterData {
  period?: "hoje" | "semana" | "mes" | "ano" | "geral";
  category?: string;
  type?: TransactionType;
}

export interface ListFilterData {
  payment_method?: string; // Ex: "Fiado"
  type?: TransactionType;
  category?: string;
  customer_name?: string;
  recipient_type?: RecipientType;
  payable_id?: string;
  limit?: number;
}

export interface UserRegistrationData {
  name?: string;
  business_name?: string;
}

export interface ExtractedIntentJSON {
  intent: IntentType;
  data?: TransactionExtractionData &
    PayableExtractionData &
    SummaryFilterData &
    ListFilterData &
    UserRegistrationData;
  response_text?: string;
}

export interface IncomingMessagePayload {
  phoneNumber: string;
  userName?: string;
  messageType: "text" | "audio" | "image";
  textBody?: string;
  audioBase64?: string;
  audioUrl?: string;
  mimeType?: string;
  imageBase64?: string;
  imageUrl?: string;
  mediaId?: string;
}

export interface ProcessMessageResult {
  userId: string;
  phoneNumber: string;
  intent: IntentType;
  extractedData?: any;
  responseText: string;
  transactionCreated?: any;
  payableCreated?: any;
  summaryData?: any;
}
