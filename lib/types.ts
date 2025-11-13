export interface PluggyItemRecord {
  item_id: string;
  user_id?: string;
  connector_id?: string;
  connector_name?: string;
  connector_image_url?: string;
  status?: 'UPDATED' | 'UPDATING' | 'WAITING_USER_INPUT' | 'LOGIN_ERROR' | 'OUTDATED' | 'CREATED';
  created_at?: string;
  updated_at?: string;
  last_updated_at?: string;
  webhook_url?: string;
  parameters?: any;
  institution_name?: string;
  institution_url?: string;
  primary_color?: string;
  secondary_color?: string;
}

export interface AccountRecord {
  account_id: string;
  item_id: string;
  type: 'BANK' | 'CREDIT' | 'PAYMENT_ACCOUNT';
  subtype?: string;
  number?: string;
  name: string;
  marketing_name?: string;
  balance?: number;
  currency_code?: string;
  owner?: string;
  tax_number?: string;
  bank_data?: any;
  credit_data?: any;
  disaggregated_credit_limits?: any;
  created_at?: string;
  updated_at?: string;
}

export interface CreditCardBillRecord {
  bill_id: string;
  account_id: string;
  due_date: string;
  total_amount: number;
  total_amount_currency_code?: string;
  minimum_payment_amount?: number;
  allows_installments?: boolean;
  finance_charges?: any;
  created_at?: string;
  updated_at?: string;
}

export interface TransactionRecord {
  transaction_id: string;
  account_id: string;
  date: string;
  description: string;
  description_raw?: string;
  amount: number;
  amount_in_account_currency?: number;
  balance?: number;
  currency_code?: string;
  category?: string;
  category_id?: string;
  provider_code?: string;
  provider_id?: string;
  status?: 'POSTED' | 'PENDING';
  type: 'CREDIT' | 'DEBIT';
  operation_type?: string;
  operation_category?: string;
  payment_data?: any;
  credit_card_metadata?: any;
  merchant?: any;
  created_at?: string;
  updated_at?: string;
}

export interface InvestmentRecord {
  investment_id: string;
  item_id: string;
  name: string;
  code?: string;
  isin?: string;
  number?: string;
  owner?: string;
  currency_code?: string;
  type?: 'FIXED_INCOME' | 'SECURITY' | 'MUTUAL_FUND' | 'EQUITY' | 'ETF' | 'COE';
  subtype?: string;
  last_month_rate?: number;
  last_twelve_months_rate?: number;
  annual_rate?: number;
  date?: string;
  value?: number;
  quantity?: number;
  amount: number;
  balance: number;
  taxes?: number;
  taxes2?: number;
  due_date?: string;
  rate?: number;
  rate_type?: 'CDI' | 'IPCA' | 'PRE_FIXADO' | 'SELIC';
  fixed_annual_rate?: number;
  issuer?: string;
  issue_date?: string;
  amount_profit?: number;
  amount_withdrawal?: number;
  amount_original?: number;
  status?: 'ACTIVE' | 'PENDING' | 'TOTAL_WITHDRAWAL';
  institution?: any;
  metadata?: any;
  provider_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface InvestmentTransactionRecord {
  transaction_id: string;
  investment_id: string;
  trade_date: string;
  date: string;
  description?: string;
  quantity?: number;
  value?: number;
  amount: number;
  net_amount?: number;
  type: 'BUY' | 'SELL' | 'DIVIDEND' | 'SPLIT' | 'BONUS';
  brokerage_number?: string;
  expenses?: any;
  created_at?: string;
  updated_at?: string;
}

export interface LoanRecord {
  loan_id: string;
  item_id: string;
  contract_number?: string;
  ipoc_code?: string;
  product_name: string;
  provider_id?: string;
  type?: string;
  date?: string;
  contract_date?: string;
  disbursement_dates?: any;
  settlement_date?: string;
  due_date?: string;
  first_installment_due_date?: string;
  contract_amount?: number;
  currency_code?: string;
  cet?: number;
  installment_periodicity?: string;
  installment_periodicity_additional_info?: string;
  amortization_scheduled?: string;
  amortization_scheduled_additional_info?: string;
  cnpj_consignee?: string;
  interest_rates?: any;
  contracted_fees?: any;
  contracted_finance_charges?: any;
  warranties?: any;
  installments?: any;
  payments?: any;
  created_at?: string;
  updated_at?: string;
}

export interface IdentityRecord {
  identity_id: string;
  item_id: string;
  full_name?: string;
  company_name?: string;
  document?: string;
  document_type?: string;
  tax_number?: string;
  job_title?: string;
  birth_date?: string;
  investor_profile?: string;
  establishment_code?: string;
  establishment_name?: string;
  addresses?: any;
  phone_numbers?: any;
  emails?: any;
  relations?: any;
  created_at?: string;
  updated_at?: string;
}

// Webhook Event Types
export type WebhookEventType =
  // Data Events
  | 'item/created'
  | 'item/updated'
  | 'item/deleted'
  | 'item/error'
  | 'item/waiting_user_input'
  | 'item/login_succeeded'
  | 'connector/status_updated'
  | 'transactions/deleted'
  | 'transactions/created'
  | 'transactions/updated'
  // Payment Events
  | 'payment_intent/created'
  | 'payment_intent/completed'
  | 'payment_intent/waiting_payer_authorization'
  | 'payment_intent/error'
  | 'scheduled_payment/created'
  | 'scheduled_payment/completed'
  | 'scheduled_payment/error'
  | 'scheduled_payment/canceled'
  | 'payment_refund/completed'
  | 'payment_refund/error'
  | 'payment_request/updated'
  | 'automatic_pix_payment/created'
  | 'automatic_pix_payment/completed'
  | 'automatic_pix_payment/error'
  | 'automatic_pix_payment/canceled';

export type TriggeredBy = 'USER' | 'CLIENT' | 'SYNC' | 'INTERNAL';
export type ConnectorStatus = 'ONLINE' | 'UNSTABLE' | 'OFFLINE';
export type PaymentRequestStatus = 'CANCELED' | 'PENDING' | 'COMPLETED' | 'ERROR';

// Base Webhook Payload (matches actual payload structure from RequestCatcher)
export interface BaseWebhookPayload {
  event: WebhookEventType;
  eventId: string;
  id?: string; // Present in some payloads (same as itemId)
  clientId?: string;
  clientUserId?: string;
  triggeredBy?: TriggeredBy;
}

// Item Webhook Payloads (based on actual payload structure)
export interface ItemWebhookPayload extends BaseWebhookPayload {
  itemId: string;
  id?: string; // Sometimes present (same as itemId)
  triggeredBy: TriggeredBy;
  clientUserId?: string;
  clientId?: string;
}

// Connector Webhook Payload
export interface ConnectorStatusWebhookPayload extends BaseWebhookPayload {
  event: 'connector/status_updated';
  connectorId: string;
  id?: string;
  data: {
    status: ConnectorStatus;
  };
}

// Transaction Webhook Payloads
export interface TransactionsWebhookPayload extends BaseWebhookPayload {
  itemId: string;
  accountId?: string;
  transactionIds: string[];
}

// Payment Intent Webhook Payloads
export interface PaymentIntentWebhookPayload extends BaseWebhookPayload {
  paymentIntentId: string;
  paymentRequestId?: string;
  bulkPaymentId?: string;
}

// Payment Request Webhook Payload
export interface PaymentRequestWebhookPayload extends BaseWebhookPayload {
  event: 'payment_request/updated';
  paymentRequestId: string;
  clientId: string;
  status: PaymentRequestStatus;
}

// Scheduled Payment Webhook Payloads
export interface ScheduledPaymentWebhookPayload extends BaseWebhookPayload {
  paymentRequestId: string;
  scheduledPaymentId: string;
}

// Automatic PIX Payment Webhook Payloads
export interface AutomaticPixPaymentWebhookPayload extends BaseWebhookPayload {
  paymentRequestId: string;
  automaticPixPaymentId: string;
  endToEndId?: string;
}

// Payment Refund Webhook Payloads
export interface PaymentRefundWebhookPayload extends BaseWebhookPayload {
  refundId: string;
  paymentRequestId?: string;
}

// Union type for all webhook payloads
export type WebhookPayload =
  | ItemWebhookPayload
  | ConnectorStatusWebhookPayload
  | TransactionsWebhookPayload
  | PaymentIntentWebhookPayload
  | PaymentRequestWebhookPayload
  | ScheduledPaymentWebhookPayload
  | AutomaticPixPaymentWebhookPayload
  | PaymentRefundWebhookPayload;