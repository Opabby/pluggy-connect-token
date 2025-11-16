import { getPluggyClient, hasPluggyCredentials } from "../../pluggyClient";
import { itemsService } from "../items";
import { accountsService } from "../accounts";
import { transactionsService } from "../transactions";
import { identityService } from "../identity";
import { investmentsService } from "../investments";
import { loansService } from "../loans";
import { creditCardBillsService } from "../credit-card-bills";
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
} from "../../types";

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

async function handleItemEvent(payload: ItemWebhookPayload): Promise<void> {
  if (!hasPluggyCredentials()) {
    console.error("Missing Pluggy credentials, cannot fetch item data");
    return;
  }

  const itemId = payload.itemId || payload.id;
  if (!itemId) {
    console.error("Missing itemId in webhook payload");
    return;
  }

  const { event } = payload;

  try {
    const pluggy = getPluggyClient();
    
    // Use SDK to fetch item
    const item = await pluggy.fetchItem(itemId);

    const itemData = item as any;
    const connector = itemData.connector || {};
    
    const itemRecord: PluggyItemRecord = {
      item_id: itemData.id,
      user_id: itemData.userId || payload.clientUserId || undefined,
      connector_id: connector.id ? connector.id.toString() : itemData.connectorId?.toString(),
      connector_name: connector.name || itemData.connectorName,
      connector_image_url: connector.imageUrl || connector.image_url || itemData.connectorImageUrl,
      status: itemData.status,
      created_at: itemData.createdAt,
      updated_at: itemData.updatedAt,
      last_updated_at: itemData.lastUpdatedAt,
      webhook_url: itemData.webhookUrl || itemData.webhook_url,
      parameters: itemData.parameters,
      institution_name: connector.name || itemData.connectorName || itemData.institutionName,
      institution_url: connector.url || connector.website || itemData.institutionUrl,
      primary_color: connector.primaryColor || connector.primary_color || itemData.primaryColor,
      secondary_color: connector.secondaryColor || connector.secondary_color || itemData.secondaryColor,
    };

    try {
      await itemsService.upsertItem(itemRecord);
    } catch (upsertError) {
      console.error(`Failed to upsert item ${itemId}:`, upsertError);
      throw upsertError;
    }

    if (event === "item/created" || event === "item/updated" || event === "item/login_succeeded") {
      try {
        await syncItemData(itemId);
      } catch (syncError) {
        console.error(`Error syncing data for item ${itemId}:`, syncError);
        console.error("Sync error details:", syncError instanceof Error ? syncError.stack : syncError);
      }
    }
  } catch (error) {
    console.error(`Error handling item event for ${itemId}:`, error);
    throw error;
  }
}

async function handleItemDeleted(payload: ItemWebhookPayload): Promise<void> {
  const itemId = payload.itemId || payload.id;
  if (!itemId) {
    console.error("Missing itemId in webhook payload");
    return;
  }

  try {
    await itemsService.deleteItem(itemId);
  } catch (error) {
    console.error(`Error deleting item ${itemId}:`, error);
    if (error instanceof Error && !error.message.includes("PGRST116")) {
      throw error;
    }
  }
}

async function handleItemStatusEvent(payload: ItemWebhookPayload): Promise<void> {
  const itemId = payload.itemId || payload.id;
  if (!itemId) {
    console.error("Missing itemId in webhook payload");
    return;
  }

  try {
    if (!hasPluggyCredentials()) {
      console.error("Missing Pluggy credentials, cannot fetch item data");
      return;
    }

    const pluggy = getPluggyClient();
    
    // Use SDK to fetch item
    const item = await pluggy.fetchItem(itemId);

    const itemData = item as any;
    const connector = itemData.connector || {};
    
    const itemRecord: PluggyItemRecord = {
      item_id: itemData.id,
      user_id: itemData.userId || payload.clientUserId || undefined,
      connector_id: connector.id ? connector.id.toString() : itemData.connectorId?.toString(),
      connector_name: connector.name || itemData.connectorName,
      connector_image_url: connector.imageUrl || connector.image_url || itemData.connectorImageUrl,
      status: itemData.status,
      created_at: itemData.createdAt,
      updated_at: itemData.updatedAt,
      last_updated_at: itemData.lastUpdatedAt,
      webhook_url: itemData.webhookUrl || itemData.webhook_url,
      parameters: itemData.parameters,
      institution_name: connector.name || itemData.connectorName || itemData.institutionName,
      institution_url: connector.url || connector.website || itemData.institutionUrl,
      primary_color: connector.primaryColor || connector.primary_color || itemData.primaryColor,
      secondary_color: connector.secondaryColor || connector.secondary_color || itemData.secondaryColor,
    };

    await itemsService.upsertItem(itemRecord);
  } catch (error) {
    console.error(`Error handling item status event for ${itemId}:`, error);
    throw error;
  }
}

async function syncItemData(itemId: string): Promise<void> {
  if (!hasPluggyCredentials()) {
    console.error("Missing Pluggy credentials, cannot sync item data");
    return;
  }

  try {
    const pluggy = getPluggyClient();

    // Sync accounts
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

        // Sync transactions and bills for each account
        for (const account of accounts) {
          try {
            // Fetch all transactions using SDK
            const allTransactions = await pluggy.fetchAllTransactions(account.id);
            
            if (allTransactions.length > 0) {
              for (const transaction of allTransactions) {
                await upsertTransactionRecord(transaction as any, account.id);
              }
            }
          } catch (transactionError) {
            console.error(`Error syncing transactions for account ${account.id}:`, transactionError);
          }

          // Sync credit card bills if it's a credit account
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

    // Sync identity
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
      // 404 is expected if identity is not available
      if (identityError.response?.status !== 404) {
        console.error(`Error syncing identity for item ${itemId}:`, identityError);
      }
    }

    // Sync investments
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
      // 404 is expected if investments are not available
      if (investmentError.response?.status !== 404) {
        console.error(`Error syncing investments for item ${itemId}:`, investmentError);
      }
    }

    // Sync loans
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
      // 404 is expected if loans are not available
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
  // Implementation depends on your business logic
  console.log(`Connector ${connectorId} status updated:`, data);
}

async function handleTransactionsCreated(payload: TransactionsWebhookPayload): Promise<void> {
  const { itemId, accountId, transactionIds } = payload;
  
  if (!hasPluggyCredentials()) {
    console.error("Missing Pluggy credentials, cannot fetch transactions");
    return;
  }

  const pluggy = getPluggyClient();

  try {
    if (accountId) {
      // Fetch all transactions for the specific account
      const allTransactions = await pluggy.fetchAllTransactions(accountId);
      
      // Filter only the created transactions if IDs are provided
      const transactionsToProcess = transactionIds && transactionIds.length > 0
        ? allTransactions.filter((t: any) => transactionIds.includes(t.id))
        : allTransactions;
      
      if (transactionsToProcess.length > 0) {
        for (const transaction of transactionsToProcess) {
          await upsertTransactionRecord(transaction as any, accountId);
        }
      }
    } else if (itemId) {
      // If no accountId, fetch all accounts for the item
      const { results: accounts } = await pluggy.fetchAccounts(itemId);
      
      for (const account of accounts) {
        try {
          const allTransactions = await pluggy.fetchAllTransactions(account.id);
          
          const transactionsToProcess = transactionIds && transactionIds.length > 0
            ? allTransactions.filter((t: any) => transactionIds.includes(t.id))
            : allTransactions;
          
          if (transactionsToProcess.length > 0) {
            for (const transaction of transactionsToProcess) {
              await upsertTransactionRecord(transaction as any, account.id);
            }
          }
        } catch (error) {
          console.error(`Error fetching transactions for account ${account.id}:`, error);
        }
      }
    }
  } catch (error) {
    console.error(`Error handling transactions created event:`, error);
    throw error;
  }
}

async function handleTransactionsUpdated(payload: TransactionsWebhookPayload): Promise<void> {
  // Same logic as handleTransactionsCreated since we're upserting
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

async function handlePaymentIntentEvent(payload: PaymentIntentWebhookPayload): Promise<void> {
  const { event, paymentIntentId, paymentRequestId, bulkPaymentId } = payload;
  // Implementation depends on your business logic
  console.log(`Payment intent event ${event}:`, { paymentIntentId, paymentRequestId, bulkPaymentId });
}

async function handlePaymentRequestUpdated(payload: PaymentRequestWebhookPayload): Promise<void> {
  const { paymentRequestId, status } = payload;
  // Implementation depends on your business logic
  console.log(`Payment request ${paymentRequestId} updated to status:`, status);
}

async function handleScheduledPaymentEvent(payload: ScheduledPaymentWebhookPayload): Promise<void> {
  const { event, scheduledPaymentId, paymentRequestId } = payload;
  // Implementation depends on your business logic
  console.log(`Scheduled payment event ${event}:`, { scheduledPaymentId, paymentRequestId });
}

async function handleAutomaticPixPaymentEvent(payload: AutomaticPixPaymentWebhookPayload): Promise<void> {
  const { event, automaticPixPaymentId, paymentRequestId, endToEndId } = payload;
  // Implementation depends on your business logic
  console.log(`Automatic Pix payment event ${event}:`, { automaticPixPaymentId, paymentRequestId, endToEndId });
}

async function handlePaymentRefundEvent(payload: PaymentRefundWebhookPayload): Promise<void> {
  const { event, refundId, paymentRequestId } = payload;
  // Implementation depends on your business logic
  console.log(`Payment refund event ${event}:`, { refundId, paymentRequestId });
}

// Helper function to upsert transaction record
async function upsertTransactionRecord(transaction: any, accountId: string): Promise<void> {
  const transactionDate = transaction.date 
    ? (typeof transaction.date === 'string' 
        ? transaction.date 
        : new Date(transaction.date).toISOString().split('T')[0])
    : new Date().toISOString().split('T')[0];
  
  const transactionRecord: TransactionRecord = {
    transaction_id: transaction.id,
    account_id: accountId,
    date: transactionDate,
    description: transaction.description || "",
    description_raw: transaction.descriptionRaw,
    amount: transaction.amount,
    amount_in_account_currency: transaction.amountInAccountCurrency,
    balance: transaction.balance,
    currency_code: transaction.currencyCode,
    category: transaction.category,
    category_id: transaction.categoryId,
    provider_code: transaction.providerCode,
    provider_id: transaction.providerId,
    status: transaction.status,
    type: transaction.type,
    operation_type: transaction.operationType,
    operation_category: transaction.operationCategory,
    payment_data: transaction.paymentData,
    credit_card_metadata: transaction.creditCardMetadata,
    merchant: transaction.merchant,
  };

  await transactionsService.upsertTransaction(transactionRecord);
}