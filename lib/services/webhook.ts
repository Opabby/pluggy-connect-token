import { getPluggyClient, hasPluggyCredentials } from "../pluggyClient";
import { itemsService } from "./items";
import { accountsService } from "./accounts";
import { transactionsService } from "./transactions";
import { identityService } from "./identity";
import { investmentsService } from "./investments";
import { loansService } from "./loans";
import { creditCardBillsService } from "./credit-card-bills";
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
import axios from "axios";

const { PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET } = process.env;

/**
 * Process webhook events asynchronously
 * This function is called after the webhook handler responds to Pluggy
 */
export async function processWebhookEvent(payload: WebhookPayload): Promise<void> {
  console.log(`Processing webhook event: ${payload.event} (eventId: ${payload.eventId})`);

  try {
    switch (payload.event) {
      // Item Events
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

      // Connector Events
      case "connector/status_updated":
        await handleConnectorStatusUpdate(payload as ConnectorStatusWebhookPayload);
        break;

      // Transaction Events
      case "transactions/created":
        await handleTransactionsCreated(payload as TransactionsWebhookPayload);
        break;

      case "transactions/updated":
        await handleTransactionsUpdated(payload as TransactionsWebhookPayload);
        break;

      case "transactions/deleted":
        await handleTransactionsDeleted(payload as TransactionsWebhookPayload);
        break;

      // Payment Intent Events
      case "payment_intent/created":
      case "payment_intent/completed":
      case "payment_intent/waiting_payer_authorization":
      case "payment_intent/error":
        await handlePaymentIntentEvent(payload as PaymentIntentWebhookPayload);
        break;

      // Payment Request Events
      case "payment_request/updated":
        await handlePaymentRequestUpdated(payload as PaymentRequestWebhookPayload);
        break;

      // Scheduled Payment Events
      case "scheduled_payment/created":
      case "scheduled_payment/completed":
      case "scheduled_payment/error":
      case "scheduled_payment/canceled":
        await handleScheduledPaymentEvent(payload as ScheduledPaymentWebhookPayload);
        break;

      // Automatic PIX Payment Events
      case "automatic_pix_payment/created":
      case "automatic_pix_payment/completed":
      case "automatic_pix_payment/error":
      case "automatic_pix_payment/canceled":
        await handleAutomaticPixPaymentEvent(payload as AutomaticPixPaymentWebhookPayload);
        break;

      // Payment Refund Events
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
    // Don't throw - we've already responded to Pluggy with success
    // Log the error for monitoring/retry purposes
  }
}

/**
 * Handle item events (created, updated, login_succeeded)
 * Fetches the latest item data from Pluggy API and syncs all related data
 */
async function handleItemEvent(payload: ItemWebhookPayload): Promise<void> {
  if (!hasPluggyCredentials()) {
    console.error("Missing Pluggy credentials, cannot fetch item data");
    return;
  }

  // Normalize itemId (use id if itemId is not present, as per actual payload structure)
  const itemId = payload.itemId || payload.id;
  if (!itemId) {
    console.error("Missing itemId in webhook payload");
    return;
  }

  const { event } = payload;
  console.log(`Handling item event: ${event} for item: ${itemId}`);

  try {
    // IMPORTANT: Fetch latest item data from Pluggy API first (as per documentation)
    const pluggyClient = getPluggyClient();
    const item = await pluggyClient.fetchItem(itemId);

    // Convert Pluggy item to our record format
    // Use type assertion to handle SDK response structure
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

    // Upsert item in database
    await itemsService.upsertItem(itemRecord);
    console.log(`Item ${itemId} upserted to database`);

    // For created/updated/login_succeeded events, sync all related data
    // Always sync data when item is created/updated/login_succeeded (regardless of status)
    // The status check is handled inside syncItemData if needed
    if (event === "item/created" || event === "item/updated" || event === "item/login_succeeded") {
      await syncItemData(itemId);
    }
  } catch (error) {
    console.error(`Error handling item event for ${itemId}:`, error);
    throw error;
  }
}

/**
 * Handle item deleted event
 */
async function handleItemDeleted(payload: ItemWebhookPayload): Promise<void> {
  // Normalize itemId (use id if itemId is not present, as per actual payload structure)
  const itemId = payload.itemId || payload.id;
  if (!itemId) {
    console.error("Missing itemId in webhook payload");
    return;
  }

  console.log(`Handling item deleted event for item: ${itemId}`);

  try {
    // Delete item from database (cascade delete should handle related records)
    await itemsService.deleteItem(itemId);
    console.log(`Item ${itemId} deleted from database`);
  } catch (error) {
    console.error(`Error deleting item ${itemId}:`, error);
    // Don't throw if item doesn't exist
    if (error instanceof Error && !error.message.includes("PGRST116")) {
      throw error;
    }
  }
}

/**
 * Handle item status events (error, waiting_user_input)
 * Fetches latest item data and updates status
 */
async function handleItemStatusEvent(payload: ItemWebhookPayload): Promise<void> {
  // Normalize itemId (use id if itemId is not present, as per actual payload structure)
  const itemId = payload.itemId || payload.id;
  if (!itemId) {
    console.error("Missing itemId in webhook payload");
    return;
  }

  const { event } = payload;
  console.log(`Handling item status event: ${event} for item: ${itemId}`);

  try {
    // Fetch latest item data from Pluggy API to get current status
    if (!hasPluggyCredentials()) {
      console.error("Missing Pluggy credentials, cannot fetch item data");
      return;
    }

    const pluggyClient = getPluggyClient();
    const item = await pluggyClient.fetchItem(itemId);

    // Update item status in database using upsert
    // Use type assertion to handle SDK response structure
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
    console.log(`Item ${itemId} status updated to ${itemData.status}`);
  } catch (error) {
    console.error(`Error handling item status event for ${itemId}:`, error);
    throw error;
  }
}

/**
 * Sync all data related to an item (accounts, transactions, identity, investments, loans, bills)
 * Uses upsert methods to keep data up to date
 */
async function syncItemData(itemId: string): Promise<void> {
  if (!hasPluggyCredentials()) {
    console.error("Missing Pluggy credentials, cannot sync item data");
    return;
  }

  console.log(`Syncing data for item: ${itemId}`);

  try {
    // Get API key
    let apiKey: string | null = null;
    try {
      const authResponse = await axios.post("https://api.pluggy.ai/auth", {
        clientId: PLUGGY_CLIENT_ID,
        clientSecret: PLUGGY_CLIENT_SECRET,
      });
      apiKey = authResponse.data.apiKey;
    } catch (authError) {
      console.error("Error getting Pluggy API key:", authError);
      return;
    }

    const pluggyClient = getPluggyClient();

    // Fetch and sync accounts
    try {
      const accountsResponse = await pluggyClient.fetchAccounts(itemId);
      if (accountsResponse.results && accountsResponse.results.length > 0) {
        // Map accounts to our record format (matching api/items.ts pattern)
        const accountsToUpsert: AccountRecord[] = accountsResponse.results.map(
          (account: any) => ({
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
          })
        );

        // Upsert all accounts in batch
        await accountsService.upsertMultipleAccounts(accountsToUpsert);
        console.log(`Synced ${accountsToUpsert.length} accounts for item ${itemId}`);

        // Sync transactions for each account
        for (const account of accountsResponse.results) {
          const accountData = account as any;
          try {
            const transactionsResponse = await pluggyClient.fetchTransactions(accountData.id);
            if (transactionsResponse.results && transactionsResponse.results.length > 0) {
              // Upsert each transaction
              for (const transaction of transactionsResponse.results) {
                const transactionData = transaction as any;
                // Handle date - convert Date objects to ISO string format (YYYY-MM-DD)
                const transactionDate = transactionData.date 
                  ? (typeof transactionData.date === 'string' 
                      ? transactionData.date 
                      : new Date(transactionData.date).toISOString().split('T')[0])
                  : new Date().toISOString().split('T')[0];
                
                const transactionRecord: TransactionRecord = {
                  transaction_id: transactionData.id,
                  account_id: accountData.id,
                  date: transactionDate,
                  description: transactionData.description || "",
                  description_raw: transactionData.descriptionRaw,
                  amount: transactionData.amount,
                  amount_in_account_currency: transactionData.amountInAccountCurrency,
                  balance: transactionData.balance,
                  currency_code: transactionData.currencyCode,
                  category: transactionData.category,
                  category_id: transactionData.categoryId,
                  provider_code: transactionData.providerCode,
                  provider_id: transactionData.providerId,
                  status: transactionData.status,
                  type: transactionData.type,
                  operation_type: transactionData.operationType,
                  operation_category: transactionData.operationCategory,
                  payment_data: transactionData.paymentData,
                  credit_card_metadata: transactionData.creditCardMetadata,
                  merchant: transactionData.merchant,
                };

                await transactionsService.upsertTransaction(transactionRecord);
              }
              console.log(`Synced ${transactionsResponse.results.length} transactions for account ${accountData.id}`);
            }
          } catch (transactionError) {
            console.error(`Error syncing transactions for account ${accountData.id}:`, transactionError);
          }

          // Sync bills for credit accounts
          if (accountData.type === "CREDIT" && apiKey) {
            try {
              const billsResponse = await axios.get("https://api.pluggy.ai/bills", {
                params: { accountId: accountData.id },
                headers: {
                  "X-API-KEY": apiKey,
                  Accept: "application/json",
                },
              });

              const billsData = billsResponse.data?.results || billsResponse.data;
              const billsArray = Array.isArray(billsData) ? billsData : [];

              if (billsArray.length > 0) {
                // Upsert each bill
                for (const bill of billsArray) {
                  const billRecord: CreditCardBillRecord = {
                    bill_id: bill.id,
                    account_id: accountData.id,
                    due_date: bill.dueDate,
                    total_amount: bill.totalAmount,
                    total_amount_currency_code: bill.totalAmountCurrencyCode,
                    minimum_payment_amount: bill.minimumPaymentAmount,
                    allows_installments: bill.allowsInstallments,
                    finance_charges: bill.financeCharges,
                  };

                  await creditCardBillsService.upsertBill(billRecord);
                }
                console.log(`Synced ${billsArray.length} bills for account ${accountData.id}`);
              }
            } catch (billError) {
              console.error(`Error syncing bills for account ${accountData.id}:`, billError);
            }
          }
        }
      }
    } catch (accountError) {
      console.error(`Error syncing accounts for item ${itemId}:`, accountError);
    }

    // Fetch and sync identity
    if (apiKey) {
      try {
        const identityResponse = await axios.get("https://api.pluggy.ai/identity", {
          params: { itemId },
          headers: {
            "X-API-KEY": apiKey,
            Accept: "application/json",
          },
        });

        if (identityResponse.data) {
          const identity = identityResponse.data;
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
          console.log(`Synced identity for item ${itemId}`);
        }
      } catch (identityError: any) {
        if (identityError.response?.status !== 404) {
          console.error(`Error syncing identity for item ${itemId}:`, identityError);
        }
      }
    }

    // Fetch and sync investments
    if (apiKey) {
      try {
        const investmentsResponse = await axios.get("https://api.pluggy.ai/investments", {
          params: { itemId },
          headers: {
            "X-API-KEY": apiKey,
            Accept: "application/json",
          },
        });

        if (investmentsResponse.data?.results && investmentsResponse.data.results.length > 0) {
          // Upsert each investment
          for (const investment of investmentsResponse.data.results) {
            const investmentRecord: InvestmentRecord = {
              item_id: itemId,
              investment_id: investment.id,
              name: investment.name,
              code: investment.code,
              isin: investment.isin,
              number: investment.number,
              owner: investment.owner,
              currency_code: investment.currencyCode,
              type: investment.type,
              subtype: investment.subtype,
              last_month_rate: investment.lastMonthRate,
              last_twelve_months_rate: investment.lastTwelveMonthsRate,
              annual_rate: investment.annualRate,
              date: investment.date,
              value: investment.value,
              quantity: investment.quantity,
              amount: investment.amount,
              balance: investment.balance,
              taxes: investment.taxes,
              taxes2: investment.taxes2,
              due_date: investment.dueDate,
              rate: investment.rate,
              rate_type: investment.rateType,
              fixed_annual_rate: investment.fixedAnnualRate,
              issuer: investment.issuer,
              issue_date: investment.issueDate,
              amount_profit: investment.amountProfit,
              amount_withdrawal: investment.amountWithdrawal,
              amount_original: investment.amountOriginal,
              status: investment.status,
              institution: investment.institution,
              metadata: investment.metadata,
              provider_id: investment.providerId,
            };

            await investmentsService.upsertInvestiment(investmentRecord);
          }
          console.log(`Synced ${investmentsResponse.data.results.length} investments for item ${itemId}`);
        }
      } catch (investmentError: any) {
        if (investmentError.response?.status !== 404) {
          console.error(`Error syncing investments for item ${itemId}:`, investmentError);
        }
      }
    }

    // Fetch and sync loans
    if (apiKey) {
      try {
        const loansResponse = await axios.get("https://api.pluggy.ai/loans", {
          params: { itemId },
          headers: {
            "X-API-KEY": apiKey,
            Accept: "application/json",
          },
        });

        const loansData = loansResponse.data?.results || loansResponse.data;
        const loansArray = Array.isArray(loansData) ? loansData : [];

        if (loansArray.length > 0) {
          // Upsert each loan
          for (const loan of loansArray) {
            const loanRecord: LoanRecord = {
              item_id: itemId,
              loan_id: loan.id,
              contract_number: loan.contractNumber,
              ipoc_code: loan.ipocCode,
              product_name: loan.productName,
              provider_id: loan.providerId,
              type: loan.type,
              date: loan.date,
              contract_date: loan.contractDate,
              disbursement_dates: loan.disbursementDates,
              settlement_date: loan.settlementDate,
              due_date: loan.dueDate,
              first_installment_due_date: loan.firstInstallmentDueDate,
              contract_amount: loan.contractAmount,
              currency_code: loan.currencyCode,
              cet: loan.cet,
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

            await loansService.upsertLoans(loanRecord);
          }
          console.log(`Synced ${loansArray.length} loans for item ${itemId}`);
        }
      } catch (loanError: any) {
        if (loanError.response?.status !== 404) {
          console.error(`Error syncing loans for item ${itemId}:`, loanError);
        }
      }
    }
  } catch (error) {
    console.error(`Error syncing item data for ${itemId}:`, error);
    throw error;
  }
}

/**
 * Handle connector status update
 */
async function handleConnectorStatusUpdate(payload: ConnectorStatusWebhookPayload): Promise<void> {
  const { connectorId, data } = payload;
  console.log(`Connector ${connectorId} status updated to: ${data.status}`);
  // Implement your connector status update logic here
  // For example, update a connector status table or send notifications
}

/**
 * Handle transactions created event
 * Fetches created transactions from Pluggy API
 */
async function handleTransactionsCreated(payload: TransactionsWebhookPayload): Promise<void> {
  const { itemId, accountId, transactionIds } = payload;
  
  // Handle case where transactionIds is missing or empty
  if (!transactionIds || !Array.isArray(transactionIds) || transactionIds.length === 0) {
    console.log(`Transactions created event for item ${itemId}, account ${accountId || "unknown"}: No transaction IDs provided, fetching all transactions for account`);
    
    // If no transactionIds provided, fetch all transactions for the account/item
    // This handles cases where the webhook doesn't include specific transaction IDs
    if (!hasPluggyCredentials()) {
      console.error("Missing Pluggy credentials, cannot fetch transactions");
      return;
    }

    try {
      const pluggyClient = getPluggyClient();
      
      // If accountId is provided, fetch all transactions for that account
      if (accountId) {
        const transactionsResponse = await pluggyClient.fetchTransactions(accountId);
        if (transactionsResponse.results && transactionsResponse.results.length > 0) {
          // Upsert all transactions (new ones will be created, existing ones updated)
          for (const transaction of transactionsResponse.results) {
            const transactionData = transaction as any;
            const transactionDate = transactionData.date 
              ? (typeof transactionData.date === 'string' 
                  ? transactionData.date 
                  : new Date(transactionData.date).toISOString().split('T')[0])
              : new Date().toISOString().split('T')[0];
            
            const transactionRecord: TransactionRecord = {
              transaction_id: transactionData.id,
              account_id: accountId,
              date: transactionDate,
              description: transactionData.description || "",
              description_raw: transactionData.descriptionRaw,
              amount: transactionData.amount,
              amount_in_account_currency: transactionData.amountInAccountCurrency,
              balance: transactionData.balance,
              currency_code: transactionData.currencyCode,
              category: transactionData.category,
              category_id: transactionData.categoryId,
              provider_code: transactionData.providerCode,
              provider_id: transactionData.providerId,
              status: transactionData.status,
              type: transactionData.type,
              operation_type: transactionData.operationType,
              operation_category: transactionData.operationCategory,
              payment_data: transactionData.paymentData,
              credit_card_metadata: transactionData.creditCardMetadata,
              merchant: transactionData.merchant,
            };

            await transactionsService.upsertTransaction(transactionRecord);
          }
          console.log(`Upserted ${transactionsResponse.results.length} transactions for account ${accountId}`);
        }
      } else {
        // If no accountId, fetch all accounts for the item and sync all transactions
        console.log("No accountId provided, fetching all accounts for item");
        const accountsResponse = await pluggyClient.fetchAccounts(itemId);
        if (accountsResponse.results && accountsResponse.results.length > 0) {
          for (const account of accountsResponse.results) {
            const accountData = account as any;
            try {
              const transactionsResponse = await pluggyClient.fetchTransactions(accountData.id);
              if (transactionsResponse.results && transactionsResponse.results.length > 0) {
                for (const transaction of transactionsResponse.results) {
                  const transactionData = transaction as any;
                  const transactionDate = transactionData.date 
                    ? (typeof transactionData.date === 'string' 
                        ? transactionData.date 
                        : new Date(transactionData.date).toISOString().split('T')[0])
                    : new Date().toISOString().split('T')[0];
                  
                  const transactionRecord: TransactionRecord = {
                    transaction_id: transactionData.id,
                    account_id: accountData.id,
                    date: transactionDate,
                    description: transactionData.description || "",
                    description_raw: transactionData.descriptionRaw,
                    amount: transactionData.amount,
                    amount_in_account_currency: transactionData.amountInAccountCurrency,
                    balance: transactionData.balance,
                    currency_code: transactionData.currencyCode,
                    category: transactionData.category,
                    category_id: transactionData.categoryId,
                    provider_code: transactionData.providerCode,
                    provider_id: transactionData.providerId,
                    status: transactionData.status,
                    type: transactionData.type,
                    operation_type: transactionData.operationType,
                    operation_category: transactionData.operationCategory,
                    payment_data: transactionData.paymentData,
                    credit_card_metadata: transactionData.creditCardMetadata,
                    merchant: transactionData.merchant,
                  };

                  await transactionsService.upsertTransaction(transactionRecord);
                }
              }
            } catch (error) {
              console.error(`Error fetching transactions for account ${accountData.id}:`, error);
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error handling transactions created event (no IDs):`, error);
      throw error;
    }
    return;
  }

  console.log(`Transactions created for item ${itemId}, account ${accountId || "unknown"}: ${transactionIds.length} transactions`);

  if (!hasPluggyCredentials()) {
    console.error("Missing Pluggy credentials, cannot fetch transactions");
    return;
  }

  try {
    const pluggyClient = getPluggyClient();

    // If accountId is provided, fetch transactions for that account
    if (accountId) {
      const transactionsResponse = await pluggyClient.fetchTransactions(accountId);
      if (transactionsResponse.results) {
        // Filter to only the created transactions and upsert them
        const createdTransactions = transactionsResponse.results.filter((t: any) =>
          transactionIds.includes(t.id)
        );

        for (const transaction of createdTransactions) {
          const transactionData = transaction as any;
          // Handle date - convert Date objects to ISO string format (YYYY-MM-DD)
          const transactionDate = transactionData.date 
            ? (typeof transactionData.date === 'string' 
                ? transactionData.date 
                : new Date(transactionData.date).toISOString().split('T')[0])
            : new Date().toISOString().split('T')[0];
          
          const transactionRecord: TransactionRecord = {
            transaction_id: transactionData.id,
            account_id: accountId,
            date: transactionDate,
            description: transactionData.description || "",
            description_raw: transactionData.descriptionRaw,
            amount: transactionData.amount,
            amount_in_account_currency: transactionData.amountInAccountCurrency,
            balance: transactionData.balance,
            currency_code: transactionData.currencyCode,
            category: transactionData.category,
            category_id: transactionData.categoryId,
            provider_code: transactionData.providerCode,
            provider_id: transactionData.providerId,
            status: transactionData.status,
            type: transactionData.type,
            operation_type: transactionData.operationType,
            operation_category: transactionData.operationCategory,
            payment_data: transactionData.paymentData,
            credit_card_metadata: transactionData.creditCardMetadata,
            merchant: transactionData.merchant,
          };

          await transactionsService.upsertTransaction(transactionRecord);
        }
        console.log(`Upserted ${createdTransactions.length} new transactions`);
      }
    } else {
      // If accountId is not provided, fetch all accounts for the item and search for transactions
      console.log("accountId not provided, fetching all accounts for item");
      const accountsResponse = await pluggyClient.fetchAccounts(itemId);

      if (accountsResponse.results && accountsResponse.results.length > 0) {
        for (const account of accountsResponse.results) {
          const accountData = account as any;
          try {
            const transactionsResponse = await pluggyClient.fetchTransactions(accountData.id);
            if (transactionsResponse.results) {
              const createdTransactions = transactionsResponse.results.filter((t: any) =>
                transactionIds.includes(t.id)
              );

              for (const transaction of createdTransactions) {
                const transactionData = transaction as any;
                // Handle date - convert Date objects to ISO string format (YYYY-MM-DD)
                const transactionDate = transactionData.date 
                  ? (typeof transactionData.date === 'string' 
                      ? transactionData.date 
                      : new Date(transactionData.date).toISOString().split('T')[0])
                  : new Date().toISOString().split('T')[0];
                
                const transactionRecord: TransactionRecord = {
                  transaction_id: transactionData.id,
                  account_id: accountData.id,
                  date: transactionDate,
                  description: transactionData.description || "",
                  description_raw: transactionData.descriptionRaw,
                  amount: transactionData.amount,
                  amount_in_account_currency: transactionData.amountInAccountCurrency,
                  balance: transactionData.balance,
                  currency_code: transactionData.currencyCode,
                  category: transactionData.category,
                  category_id: transactionData.categoryId,
                  provider_code: transactionData.providerCode,
                  provider_id: transactionData.providerId,
                  status: transactionData.status,
                  type: transactionData.type,
                  operation_type: transactionData.operationType,
                  operation_category: transactionData.operationCategory,
                  payment_data: transactionData.paymentData,
                  credit_card_metadata: transactionData.creditCardMetadata,
                  merchant: transactionData.merchant,
                };

                await transactionsService.upsertTransaction(transactionRecord);
              }
            }
          } catch (error) {
            console.error(`Error fetching transactions for account ${accountData.id}:`, error);
          }
        }
      }
    }
  } catch (error) {
    console.error(`Error handling transactions created event:`, error);
    throw error;
  }
}

/**
 * Handle transactions updated event
 * Fetches updated transactions from Pluggy API and upserts them
 */
async function handleTransactionsUpdated(payload: TransactionsWebhookPayload): Promise<void> {
  const { itemId, accountId, transactionIds } = payload;
  
  // Handle case where transactionIds is missing or empty
  if (!transactionIds || !Array.isArray(transactionIds) || transactionIds.length === 0) {
    console.log(`Transactions updated event for item ${itemId}, account ${accountId || "unknown"}: No transaction IDs provided, fetching all transactions for account`);
    
    // If no transactionIds provided, fetch all transactions for the account/item
    // This handles cases where the webhook doesn't include specific transaction IDs
    if (!hasPluggyCredentials()) {
      console.error("Missing Pluggy credentials, cannot fetch transactions");
      return;
    }

    try {
      const pluggyClient = getPluggyClient();
      
      // If accountId is provided, fetch all transactions for that account
      if (accountId) {
        const transactionsResponse = await pluggyClient.fetchTransactions(accountId);
        if (transactionsResponse.results && transactionsResponse.results.length > 0) {
          // Upsert all transactions (existing ones will be updated)
          for (const transaction of transactionsResponse.results) {
            const transactionData = transaction as any;
            const transactionDate = transactionData.date 
              ? (typeof transactionData.date === 'string' 
                  ? transactionData.date 
                  : new Date(transactionData.date).toISOString().split('T')[0])
              : new Date().toISOString().split('T')[0];
            
            const transactionRecord: TransactionRecord = {
              transaction_id: transactionData.id,
              account_id: accountId,
              date: transactionDate,
              description: transactionData.description || "",
              description_raw: transactionData.descriptionRaw,
              amount: transactionData.amount,
              amount_in_account_currency: transactionData.amountInAccountCurrency,
              balance: transactionData.balance,
              currency_code: transactionData.currencyCode,
              category: transactionData.category,
              category_id: transactionData.categoryId,
              provider_code: transactionData.providerCode,
              provider_id: transactionData.providerId,
              status: transactionData.status,
              type: transactionData.type,
              operation_type: transactionData.operationType,
              operation_category: transactionData.operationCategory,
              payment_data: transactionData.paymentData,
              credit_card_metadata: transactionData.creditCardMetadata,
              merchant: transactionData.merchant,
            };

            await transactionsService.upsertTransaction(transactionRecord);
          }
          console.log(`Upserted ${transactionsResponse.results.length} updated transactions for account ${accountId}`);
        }
      } else {
        // If no accountId, fetch all accounts for the item and sync all transactions
        console.log("No accountId provided, fetching all accounts for item");
        const accountsResponse = await pluggyClient.fetchAccounts(itemId);
        if (accountsResponse.results && accountsResponse.results.length > 0) {
          for (const account of accountsResponse.results) {
            const accountData = account as any;
            try {
              const transactionsResponse = await pluggyClient.fetchTransactions(accountData.id);
              if (transactionsResponse.results && transactionsResponse.results.length > 0) {
                for (const transaction of transactionsResponse.results) {
                  const transactionData = transaction as any;
                  const transactionDate = transactionData.date 
                    ? (typeof transactionData.date === 'string' 
                        ? transactionData.date 
                        : new Date(transactionData.date).toISOString().split('T')[0])
                    : new Date().toISOString().split('T')[0];
                  
                  const transactionRecord: TransactionRecord = {
                    transaction_id: transactionData.id,
                    account_id: accountData.id,
                    date: transactionDate,
                    description: transactionData.description || "",
                    description_raw: transactionData.descriptionRaw,
                    amount: transactionData.amount,
                    amount_in_account_currency: transactionData.amountInAccountCurrency,
                    balance: transactionData.balance,
                    currency_code: transactionData.currencyCode,
                    category: transactionData.category,
                    category_id: transactionData.categoryId,
                    provider_code: transactionData.providerCode,
                    provider_id: transactionData.providerId,
                    status: transactionData.status,
                    type: transactionData.type,
                    operation_type: transactionData.operationType,
                    operation_category: transactionData.operationCategory,
                    payment_data: transactionData.paymentData,
                    credit_card_metadata: transactionData.creditCardMetadata,
                    merchant: transactionData.merchant,
                  };

                  await transactionsService.upsertTransaction(transactionRecord);
                }
              }
            } catch (error) {
              console.error(`Error fetching transactions for account ${accountData.id}:`, error);
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error handling transactions updated event (no IDs):`, error);
      throw error;
    }
    return;
  }

  console.log(`Transactions updated for item ${itemId}, account ${accountId || "unknown"}: ${transactionIds.length} transactions`);

  if (!hasPluggyCredentials()) {
    console.error("Missing Pluggy credentials, cannot fetch transactions");
    return;
  }

  try {
    const pluggyClient = getPluggyClient();

    // If accountId is provided, fetch transactions for that account
    if (accountId) {
      const transactionsResponse = await pluggyClient.fetchTransactions(accountId);
      if (transactionsResponse.results) {
        // Filter to only the updated transactions and upsert them
        const updatedTransactions = transactionsResponse.results.filter((t: any) =>
          transactionIds.includes(t.id)
        );

        for (const transaction of updatedTransactions) {
          const transactionData = transaction as any;
          // Handle date - convert Date objects to ISO string format (YYYY-MM-DD)
          const transactionDate = transactionData.date 
            ? (typeof transactionData.date === 'string' 
                ? transactionData.date 
                : new Date(transactionData.date).toISOString().split('T')[0])
            : new Date().toISOString().split('T')[0];
          
          const transactionRecord: TransactionRecord = {
            transaction_id: transactionData.id,
            account_id: accountId,
            date: transactionDate,
            description: transactionData.description || "",
            description_raw: transactionData.descriptionRaw,
            amount: transactionData.amount,
            amount_in_account_currency: transactionData.amountInAccountCurrency,
            balance: transactionData.balance,
            currency_code: transactionData.currencyCode,
            category: transactionData.category,
            category_id: transactionData.categoryId,
            provider_code: transactionData.providerCode,
            provider_id: transactionData.providerId,
            status: transactionData.status,
            type: transactionData.type,
            operation_type: transactionData.operationType,
            operation_category: transactionData.operationCategory,
            payment_data: transactionData.paymentData,
            credit_card_metadata: transactionData.creditCardMetadata,
            merchant: transactionData.merchant,
          };

          await transactionsService.upsertTransaction(transactionRecord);
        }
        console.log(`Upserted ${updatedTransactions.length} updated transactions`);
      }
    } else {
      // If accountId is not provided, fetch all accounts for the item and search for transactions
      console.log("accountId not provided, fetching all accounts for item");
      const accountsResponse = await pluggyClient.fetchAccounts(itemId);

      if (accountsResponse.results && accountsResponse.results.length > 0) {
        for (const account of accountsResponse.results) {
          const accountData = account as any;
          try {
            const transactionsResponse = await pluggyClient.fetchTransactions(accountData.id);
            if (transactionsResponse.results) {
              const updatedTransactions = transactionsResponse.results.filter((t: any) =>
                transactionIds.includes(t.id)
              );

              for (const transaction of updatedTransactions) {
                const transactionData = transaction as any;
                // Handle date - convert Date objects to ISO string format (YYYY-MM-DD)
                const transactionDate = transactionData.date 
                  ? (typeof transactionData.date === 'string' 
                      ? transactionData.date 
                      : new Date(transactionData.date).toISOString().split('T')[0])
                  : new Date().toISOString().split('T')[0];
                
                const transactionRecord: TransactionRecord = {
                  transaction_id: transactionData.id,
                  account_id: accountData.id,
                  date: transactionDate,
                  description: transactionData.description || "",
                  description_raw: transactionData.descriptionRaw,
                  amount: transactionData.amount,
                  amount_in_account_currency: transactionData.amountInAccountCurrency,
                  balance: transactionData.balance,
                  currency_code: transactionData.currencyCode,
                  category: transactionData.category,
                  category_id: transactionData.categoryId,
                  provider_code: transactionData.providerCode,
                  provider_id: transactionData.providerId,
                  status: transactionData.status,
                  type: transactionData.type,
                  operation_type: transactionData.operationType,
                  operation_category: transactionData.operationCategory,
                  payment_data: transactionData.paymentData,
                  credit_card_metadata: transactionData.creditCardMetadata,
                  merchant: transactionData.merchant,
                };

                await transactionsService.upsertTransaction(transactionRecord);
              }
            }
          } catch (error) {
            console.error(`Error fetching transactions for account ${accountData.id}:`, error);
          }
        }
      }
    }
  } catch (error) {
    console.error(`Error handling transactions updated event:`, error);
    throw error;
  }
}

/**
 * Handle transactions deleted event
 * Deletes transactions from database
 */
async function handleTransactionsDeleted(payload: TransactionsWebhookPayload): Promise<void> {
  const { itemId, accountId, transactionIds } = payload;
  
  // Handle case where transactionIds is missing or empty
  if (!transactionIds || !Array.isArray(transactionIds) || transactionIds.length === 0) {
    console.log(`Transactions deleted event for item ${itemId}, account ${accountId || "unknown"}: No transaction IDs provided, skipping deletion`);
    return;
  }

  console.log(`Transactions deleted for item ${itemId}, account ${accountId || "unknown"}: ${transactionIds.length} transactions`);

  try {
    // Delete transactions from database in batch
    await transactionsService.deleteMultipleTransactions(transactionIds);
    console.log(`Deleted ${transactionIds.length} transactions`);
  } catch (error) {
    console.error(`Error handling transactions deleted event:`, error);
    throw error;
  }
}

/**
 * Handle payment intent events
 */
async function handlePaymentIntentEvent(payload: PaymentIntentWebhookPayload): Promise<void> {
  const { event, paymentIntentId, paymentRequestId, bulkPaymentId } = payload;
  console.log(`Payment intent event: ${event} for paymentIntentId: ${paymentIntentId}`);
  // Implement your payment intent handling logic here
  // For example, update payment status in database, send notifications, etc.
}

/**
 * Handle payment request updated event
 */
async function handlePaymentRequestUpdated(payload: PaymentRequestWebhookPayload): Promise<void> {
  const { paymentRequestId, status } = payload;
  console.log(`Payment request ${paymentRequestId} status updated to: ${status}`);
  // Implement your payment request update logic here
  // For example, update payment request status in database, send notifications, etc.
}

/**
 * Handle scheduled payment events
 */
async function handleScheduledPaymentEvent(payload: ScheduledPaymentWebhookPayload): Promise<void> {
  const { event, scheduledPaymentId, paymentRequestId } = payload;
  console.log(`Scheduled payment event: ${event} for scheduledPaymentId: ${scheduledPaymentId}`);
  // Implement your scheduled payment handling logic here
  // For example, update scheduled payment status in database, send notifications, etc.
}

/**
 * Handle automatic PIX payment events
 */
async function handleAutomaticPixPaymentEvent(payload: AutomaticPixPaymentWebhookPayload): Promise<void> {
  const { event, automaticPixPaymentId, paymentRequestId, endToEndId } = payload;
  console.log(`Automatic PIX payment event: ${event} for automaticPixPaymentId: ${automaticPixPaymentId}`);
  // Implement your automatic PIX payment handling logic here
  // For example, update payment status in database, send notifications, etc.
}

/**
 * Handle payment refund events
 */
async function handlePaymentRefundEvent(payload: PaymentRefundWebhookPayload): Promise<void> {
  const { event, refundId, paymentRequestId } = payload;
  console.log(`Payment refund event: ${event} for refundId: ${refundId}`);
  // Implement your payment refund handling logic here
  // For example, update refund status in database, send notifications, etc.
}

