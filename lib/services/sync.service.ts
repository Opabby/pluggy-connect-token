import { getPluggyClient, hasPluggyCredentials } from "../pluggyClient";
import { itemsService } from "./items.service";
import { accountsService } from "./accounts.service";
import { transactionsService } from "./transactions.service";
import { identityService } from "./identity.service";
import { investmentsService } from "./investments.service";
import { loansService } from "./loans.service";
import { creditCardBillsService } from "./credit-card-bills.service";
import type {
  WebhookPayload,
  ItemWebhookPayload,
  ConnectorStatusWebhookPayload,
  TransactionsWebhookPayload,
  PaymentIntentWebhookPayload,
  PaymentRequestWebhookPayload,
  ScheduledPaymentWebhookPayload,
  AutomaticPixPaymentWebhookPayload,
  PaymentRefundWebhookPayload,
  PluggyItemRecord,
  AccountRecord,
  TransactionRecord,
  IdentityRecord,
  InvestmentRecord,
  LoanRecord,
  CreditCardBillRecord,
} from "../types";
import { handleItemEvent, handleItemDeleted, handleItemStatusEvent } from "./webhook-handlers/item.handler";
import { handleTransactionsCreated } from "./webhook-handlers/transaction.handler";
import { upsertTransactionRecord } from "./webhook-handlers/utils";

export async function processWebhookEvent(payload: WebhookPayload): Promise<void> {
  try {
    switch (payload.event) {
      case "item/created":
      case "item/updated":
      case "item/login_succeeded":
        await handleItemEvent(payload as ItemWebhookPayload);
        break;

      case "item/deleted":
        await handleItemDeleted(payload as ItemWebhookPayload);
        break;

      case "item/error":
      case "item/waiting_user_input":
        await handleItemStatusEvent(payload as ItemWebhookPayload);
        break;

      case "connector/status_updated":
        await handleConnectorStatusUpdate(payload as ConnectorStatusWebhookPayload);
        break;

      case "transactions/created":
        await handleTransactionsCreated(payload as TransactionsWebhookPayload);
        break;

      case "transactions/updated":
        await handleTransactionsUpdated(payload as TransactionsWebhookPayload);
        break;

      case "transactions/deleted":
        await handleTransactionsDeleted(payload as TransactionsWebhookPayload);
        break;

      case "payment_intent/created":
      case "payment_intent/completed":
      case "payment_intent/waiting_payer_authorization":
      case "payment_intent/error":
        await handlePaymentIntentEvent(payload as PaymentIntentWebhookPayload);
        break;

      case "payment_request/updated":
        await handlePaymentRequestUpdated(payload as PaymentRequestWebhookPayload);
        break;

      case "scheduled_payment/created":
      case "scheduled_payment/completed":
      case "scheduled_payment/error":
      case "scheduled_payment/canceled":
        await handleScheduledPaymentEvent(payload as ScheduledPaymentWebhookPayload);
        break;

      case "automatic_pix_payment/created":
      case "automatic_pix_payment/completed":
      case "automatic_pix_payment/error":
      case "automatic_pix_payment/canceled":
        await handleAutomaticPixPaymentEvent(payload as AutomaticPixPaymentWebhookPayload);
        break;

      case "payment_refund/completed":
      case "payment_refund/error":
        await handlePaymentRefundEvent(payload as PaymentRefundWebhookPayload);
        break;

      default:
        const unknownPayload = payload as any;
        console.warn(`Unknown webhook event type: ${unknownPayload.event}`);
    }
  } catch (error) {
    const errorPayload = payload as any;
    console.error(`Error processing webhook event ${errorPayload.event}:`, error);
  }
}

export async function syncItemData(itemId: string): Promise<void> {
  if (!hasPluggyCredentials()) {
    console.error("Missing Pluggy credentials, cannot sync item data");
    return;
  }

  try {
    const pluggy = getPluggyClient();

    try {
      const { results: accounts } = await pluggy.fetchAccounts(itemId);
      
      if (accounts.length > 0) {
        const accountsToUpsert: AccountRecord[] = accounts.map((account: any) => ({
          item_id: itemId,
          account_id: account.id,
          type: account.type,
          subtype: account.subtype,
          number: account.number,
          name: account.name,
          marketing_name: account.marketingName,
          balance: account.balance,
          currency_code: account.currencyCode,
          owner: account.owner,
          tax_number: account.taxNumber,
          bank_data: account.bankData,
          credit_data: account.creditData,
          disaggregated_credit_limits: account.disaggregatedCreditLimits,
        }));
        
        await accountsService.upsertMultipleAccounts(accountsToUpsert);

        for (const account of accounts) {
          try {
            const allTransactions = await pluggy.fetchAllTransactions(account.id);
            
            if (allTransactions.length > 0) {
              for (const transaction of allTransactions) {
                await upsertTransactionRecord(transaction as any, account.id);
              }
            }
          } catch (transactionError) {
            console.error(`Error syncing transactions for account ${account.id}:`, transactionError);
          }

          if (account.type === "CREDIT") {
            try {
              const { results: bills } = await pluggy.fetchCreditCardBills(account.id);

              if (bills.length > 0) {
                for (const bill of bills) {
                  const billRecord: CreditCardBillRecord = {
                    bill_id: bill.id,
                    account_id: account.id,
                    due_date: bill.dueDate 
                      ? (typeof bill.dueDate === 'string' 
                          ? bill.dueDate 
                          : new Date(bill.dueDate).toISOString().split('T')[0])
                      : undefined,
                    total_amount: bill.totalAmount,
                    total_amount_currency_code: bill.totalAmountCurrencyCode,
                    minimum_payment_amount: bill.minimumPaymentAmount,
                    allows_installments: bill.allowsInstallments,
                    finance_charges: bill.financeCharges,
                  };

                  await creditCardBillsService.upsertBill(billRecord);
                }
              }
            } catch (billError) {
              console.error(`Error syncing bills for account ${account.id}:`, billError);
            }
          }
        }
      }
    } catch (accountError) {
      console.error(`Error syncing accounts for item ${itemId}:`, accountError);
    }

    try {
      const identity = await pluggy.fetchIdentityByItemId(itemId);
      
      if (identity) {
        const identityRecord: IdentityRecord = {
          item_id: itemId,
          identity_id: identity.id,
          full_name: identity.fullName,
          company_name: identity.companyName,
          document: identity.document,
          document_type: identity.documentType,
          tax_number: identity.taxNumber,
          job_title: identity.jobTitle,
          birth_date: identity.birthDate ? new Date(identity.birthDate).toISOString() : undefined,
          addresses: identity.addresses,
          phone_numbers: identity.phoneNumbers,
          emails: identity.emails,
          relations: identity.relations,
        };

        await identityService.upsertIdentity(identityRecord);
      }
    } catch (identityError: any) {
      if (identityError.response?.status !== 404) {
        console.error(`Error syncing identity for item ${itemId}:`, identityError);
      }
    }

    try {
      const { results: investments } = await pluggy.fetchInvestments(itemId);
      
      if (investments.length > 0) {
        for (const investment of investments) {
          const investmentRecord: InvestmentRecord = {
            item_id: itemId,
            investment_id: investment.id,
            name: investment.name,
            code: investment.code,
            isin: investment.isin,
            number: investment.number,
            owner: investment.owner,
            currency_code: investment.currencyCode,
            type: investment.type as any,
            subtype: investment.subtype,
            last_month_rate: investment.lastMonthRate,
            last_twelve_months_rate: investment.lastTwelveMonthsRate,
            annual_rate: investment.annualRate,
            date: investment.date ? (typeof investment.date === 'string' ? investment.date : new Date(investment.date).toISOString().split('T')[0]) : undefined,
            value: investment.value ?? 0,
            quantity: investment.quantity,
            amount: investment.amount,
            balance: investment.balance,
            taxes: investment.taxes,
            taxes2: investment.taxes2,
            due_date: investment.dueDate ? (typeof investment.dueDate === 'string' ? investment.dueDate : new Date(investment.dueDate).toISOString().split('T')[0]) : undefined,
            rate: investment.rate,
            rate_type: investment.rateType as any,
            fixed_annual_rate: investment.fixedAnnualRate ?? investment.annualRate,
            issuer: investment.issuer,
            issue_date: investment.issueDate ? (typeof investment.issueDate === 'string' ? investment.issueDate : new Date(investment.issueDate).toISOString().split('T')[0]) : undefined,
            amount_profit: investment.amountProfit,
            amount_withdrawal: investment.amountWithdrawal,
            amount_original: investment.amountOriginal,
            status: investment.status,
            institution: investment.institution,
            metadata: investment.metadata,
            provider_id: (investment as any).providerId,
          };

          await investmentsService.upsertInvestment(investmentRecord);
        }
      }
    } catch (investmentError: any) {
      if (investmentError.response?.status !== 404) {
        console.error(`Error syncing investments for item ${itemId}:`, investmentError);
      }
    }

    try {
      const { results: loans } = await pluggy.fetchLoans(itemId);

      if (loans.length > 0) {
        for (const loan of loans) {
          const loanRecord: LoanRecord = {
            item_id: itemId,
            loan_id: loan.id,
            contract_number: loan.contractNumber,
            ipoc_code: loan.ipocCode,
            product_name: loan.productName,
            provider_id: (loan as any).providerId,
            type: loan.type,
            date: loan.date 
              ? (typeof loan.date === 'string' 
                  ? loan.date 
                  : new Date(loan.date).toISOString().split('T')[0])
              : undefined,
            contract_date: loan.contractDate 
              ? (typeof loan.contractDate === 'string' 
                  ? loan.contractDate 
                  : new Date(loan.contractDate).toISOString().split('T')[0])
              : undefined,
            disbursement_dates: loan.disbursementDates,
            settlement_date: loan.settlementDate 
              ? (typeof loan.settlementDate === 'string' 
                  ? loan.settlementDate 
                  : new Date(loan.settlementDate).toISOString().split('T')[0])
              : undefined,
            due_date: loan.dueDate 
              ? (typeof loan.dueDate === 'string' 
                  ? loan.dueDate 
                  : new Date(loan.dueDate).toISOString().split('T')[0])
              : undefined,
            first_installment_due_date: loan.firstInstallmentDueDate 
              ? (typeof loan.firstInstallmentDueDate === 'string' 
                  ? loan.firstInstallmentDueDate 
                  : new Date(loan.firstInstallmentDueDate).toISOString().split('T')[0])
              : undefined,
            contract_amount: loan.contractAmount,
            currency_code: loan.currencyCode,
            cet: loan.CET,
            installment_periodicity: loan.installmentPeriodicity,
            installment_periodicity_additional_info: loan.installmentPeriodicityAdditionalInfo,
            amortization_scheduled: loan.amortizationScheduled,
            amortization_scheduled_additional_info: loan.amortizationScheduledAdditionalInfo,
            cnpj_consignee: loan.cnpjConsignee,
            interest_rates: loan.interestRates,
            contracted_fees: loan.contractedFees,
            contracted_finance_charges: loan.contractedFinanceCharges,
            warranties: loan.warranties,
            installments: loan.installments,
            payments: loan.payments,
          };

          await loansService.upsertLoan(loanRecord);
        }
      }
    } catch (loanError: any) {
      if (loanError.response?.status !== 404) {
        console.error(`Error syncing loans for item ${itemId}:`, loanError);
      }
    }
  } catch (error) {
    console.error(`Error syncing item data for ${itemId}:`, error);
    throw error;
  }
}

async function handleConnectorStatusUpdate(payload: ConnectorStatusWebhookPayload): Promise<void> {
  const { connectorId, data } = payload;
  console.log(`Connector ${connectorId} status updated:`, data);
}

async function handleTransactionsUpdated(payload: TransactionsWebhookPayload): Promise<void> {
  await handleTransactionsCreated(payload);
}

async function handleTransactionsDeleted(payload: TransactionsWebhookPayload): Promise<void> {
  const { transactionIds } = payload;
  
  if (!transactionIds || !Array.isArray(transactionIds) || transactionIds.length === 0) {
    return;
  }

  try {
    await transactionsService.deleteMultipleTransactions(transactionIds);
  } catch (error) {
    console.error(`Error handling transactions deleted event:`, error);
    throw error;
  }
}

// async function handlePaymentIntentEvent(payload: PaymentIntentWebhookPayload): Promise<void> {
//   const { event, paymentIntentId, paymentRequestId, bulkPaymentId } = payload;
//   console.log(`Payment intent event ${event}:`, { paymentIntentId, paymentRequestId, bulkPaymentId });
// }

// async function handlePaymentRequestUpdated(payload: PaymentRequestWebhookPayload): Promise<void> {
//   const { paymentRequestId, status } = payload;
//   console.log(`Payment request ${paymentRequestId} updated to status:`, status);
// }

// async function handleScheduledPaymentEvent(payload: ScheduledPaymentWebhookPayload): Promise<void> {
//   const { event, scheduledPaymentId, paymentRequestId } = payload;
//   console.log(`Scheduled payment event ${event}:`, { scheduledPaymentId, paymentRequestId });
// }

// async function handleAutomaticPixPaymentEvent(payload: AutomaticPixPaymentWebhookPayload): Promise<void> {
//   const { event, automaticPixPaymentId, paymentRequestId, endToEndId } = payload;
//   console.log(`Automatic Pix payment event ${event}:`, { automaticPixPaymentId, paymentRequestId, endToEndId });
// }

// async function handlePaymentRefundEvent(payload: PaymentRefundWebhookPayload): Promise<void> {
//   const { event, refundId, paymentRequestId } = payload;
//   console.log(`Payment refund event ${event}:`, { refundId, paymentRequestId });
// }
