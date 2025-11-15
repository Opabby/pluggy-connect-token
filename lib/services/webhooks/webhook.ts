import { hasPluggyCredentials } from "../../pluggyClient";
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
import axios from "axios";

const { PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET } = process.env;

async function getPluggyApiKey(): Promise<string> {
  const authResponse = await axios.post("https://api.pluggy.ai/auth", {
    clientId: PLUGGY_CLIENT_ID,
    clientSecret: PLUGGY_CLIENT_SECRET,
  });
  return authResponse.data.apiKey;
}

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
    let apiKey: string;
    try {
      apiKey = await getPluggyApiKey();
    } catch (authError) {
      console.error("Error authenticating with Pluggy API:", authError);
      throw new Error("Failed to authenticate with Pluggy API");
    }

    const itemResponse = await axios.get(`https://api.pluggy.ai/items/${itemId}`, {
      headers: {
        "X-API-KEY": apiKey,
        Accept: "application/json",
      },
    });
    const item = itemResponse.data;

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
      const upsertedItem = await itemsService.upsertItem(itemRecord);
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

  const { event } = payload;

  try {
    if (!hasPluggyCredentials()) {
      console.error("Missing Pluggy credentials, cannot fetch item data");
      return;
    }

    let apiKey: string;
    try {
      apiKey = await getPluggyApiKey();
    } catch (authError) {
      console.error("Error authenticating with Pluggy API:", authError);
      throw new Error("Failed to authenticate with Pluggy API");
    }

    const itemResponse = await axios.get(`https://api.pluggy.ai/items/${itemId}`, {
      headers: {
        "X-API-KEY": apiKey,
        Accept: "application/json",
      },
    });
    const item = itemResponse.data;

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
    let apiKey: string;
    try {
      apiKey = await getPluggyApiKey();
    } catch (authError) {
      console.error("Error authenticating with Pluggy API:", authError);
      return; // Return early if authentication fails
    }

    try {
      const accountsResponse = await axios.get("https://api.pluggy.ai/accounts", {
        params: { itemId },
        headers: {
          "X-API-KEY": apiKey,
          Accept: "application/json",
        },
      });
      const accountsData = accountsResponse.data?.results || accountsResponse.data || [];
      if (accountsData.length > 0) {
        const accountsToUpsert: AccountRecord[] = accountsData.map(
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
        await accountsService.upsertMultipleAccounts(accountsToUpsert);

        for (const account of accountsData) {
          const accountData = account as any;
          try {
            const transactionsResponse = await axios.get("https://api.pluggy.ai/transactions", {
              params: { accountId: accountData.id },
              headers: {
                "X-API-KEY": apiKey,
                Accept: "application/json",
              },
            });
            const transactionsData = transactionsResponse.data?.results || transactionsResponse.data || [];
            if (transactionsData.length > 0) {
              for (const transaction of transactionsData) {
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
          } catch (transactionError) {
            console.error(`Error syncing transactions for account ${accountData.id}:`, transactionError);
          }

          if (accountData.type === "CREDIT") {
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

    try {
      const identityResponse = await axios.get("https://api.pluggy.ai/identity", {
        params: { itemId },
        headers: {
          "X-API-KEY": apiKey,
          Accept: "application/json",
        },
      });
      const identity = identityResponse.data;
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
      const investmentsResponse = await axios.get("https://api.pluggy.ai/investments", {
        params: { itemId },
        headers: {
          "X-API-KEY": apiKey,
          Accept: "application/json",
        },
      });
      const investmentsData = investmentsResponse.data?.results || investmentsResponse.data || [];
      if (investmentsData.length > 0) {
        for (const investment of investmentsData) {
          const investmentData = investment as any;
          const investmentRecord: InvestmentRecord = {
            item_id: itemId,
            investment_id: investmentData.id,
            name: investmentData.name,
            code: investmentData.code,
            isin: investmentData.isin,
            number: investmentData.number,
            owner: investmentData.owner,
            currency_code: investmentData.currencyCode,
            type: investmentData.type as any,
            subtype: investmentData.subtype,
            last_month_rate: investmentData.lastMonthRate,
            last_twelve_months_rate: investmentData.lastTwelveMonthsRate,
            annual_rate: investmentData.annualRate,
            date: investmentData.date ? (typeof investmentData.date === 'string' ? investmentData.date : new Date(investmentData.date).toISOString().split('T')[0]) : undefined,
            value: investmentData.value ?? 0,
            quantity: investmentData.quantity,
            amount: investmentData.amount,
            balance: investmentData.balance,
            taxes: investmentData.taxes,
            taxes2: investmentData.taxes2,
            due_date: investmentData.dueDate ? (typeof investmentData.dueDate === 'string' ? investmentData.dueDate : new Date(investmentData.dueDate).toISOString().split('T')[0]) : undefined,
            rate: investmentData.rate,
            rate_type: investmentData.rateType as any,
            fixed_annual_rate: investmentData.fixedAnnualRate ?? investmentData.annualRate,
            issuer: investmentData.issuer,
            issue_date: investmentData.issueDate ? (typeof investmentData.issueDate === 'string' ? investmentData.issueDate : new Date(investmentData.issueDate).toISOString().split('T')[0]) : undefined,
            amount_profit: investmentData.amountProfit,
            amount_withdrawal: investmentData.amountWithdrawal,
            amount_original: investmentData.amountOriginal,
            status: investmentData.status,
            institution: investmentData.institution,
            metadata: investmentData.metadata,
            provider_id: investmentData.providerId,
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
}

async function handleTransactionsCreated(payload: TransactionsWebhookPayload): Promise<void> {
  const { itemId, accountId, transactionIds } = payload;
  
  if (!transactionIds || !Array.isArray(transactionIds) || transactionIds.length === 0) {
    
    if (!hasPluggyCredentials()) {
      console.error("Missing Pluggy credentials, cannot fetch transactions");
      return;
    }

    try {
      let apiKey: string;
      try {
        apiKey = await getPluggyApiKey();
      } catch (authError) {
        console.error("Error authenticating with Pluggy API:", authError);
        return;
      }
      
      if (accountId) {
        const transactionsResponse = await axios.get("https://api.pluggy.ai/transactions", {
          params: { accountId },
          headers: {
            "X-API-KEY": apiKey,
            Accept: "application/json",
          },
        });
        const transactionsData = transactionsResponse.data?.results || transactionsResponse.data || [];
        if (transactionsData.length > 0) {
          for (const transaction of transactionsData) {
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
        }
      } else {
        const accountsResponse = await axios.get("https://api.pluggy.ai/accounts", {
          params: { itemId },
          headers: {
            "X-API-KEY": apiKey,
            Accept: "application/json",
          },
        });
        const accountsData = accountsResponse.data?.results || accountsResponse.data || [];
        if (accountsData.length > 0) {
          for (const account of accountsData) {
            const accountData = account as any;
            try {
              const transactionsResponse = await axios.get("https://api.pluggy.ai/transactions", {
                params: { accountId: accountData.id },
                headers: {
                  "X-API-KEY": apiKey,
                  Accept: "application/json",
                },
              });
              const transactionsData = transactionsResponse.data?.results || transactionsResponse.data || [];
              if (transactionsData.length > 0) {
                for (const transaction of transactionsData) {
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

  if (!hasPluggyCredentials()) {
    console.error("Missing Pluggy credentials, cannot fetch transactions");
    return;
  }

  try {
    let apiKey: string;
    try {
      apiKey = await getPluggyApiKey();
    } catch (authError) {
      console.error("Error authenticating with Pluggy API:", authError);
      throw new Error("Failed to authenticate with Pluggy API");
    }

    if (accountId) {
      const transactionsResponse = await axios.get("https://api.pluggy.ai/transactions", {
        params: { accountId },
        headers: {
          "X-API-KEY": apiKey,
          Accept: "application/json",
        },
      });
      const transactionsData = transactionsResponse.data?.results || transactionsResponse.data || [];
      if (transactionsData.length > 0) {
        const createdTransactions = transactionsData.filter((t: any) =>
          transactionIds.includes(t.id)
        );

        for (const transaction of createdTransactions) {
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
      }
    } else {
      const accountsResponse = await axios.get("https://api.pluggy.ai/accounts", {
        params: { itemId },
        headers: {
          "X-API-KEY": apiKey,
          Accept: "application/json",
        },
      });

      const accountsData = accountsResponse.data?.results || accountsResponse.data || [];
      if (accountsData.length > 0) {
        for (const account of accountsData) {
          const accountData = account as any;
          try {
            const transactionsResponse = await axios.get("https://api.pluggy.ai/transactions", {
              params: { accountId: accountData.id },
              headers: {
                "X-API-KEY": apiKey,
                Accept: "application/json",
              },
            });
            const transactionsData = transactionsResponse.data?.results || transactionsResponse.data || [];
            if (transactionsData.length > 0) {
              const createdTransactions = transactionsData.filter((t: any) =>
                transactionIds.includes(t.id)
              );

              for (const transaction of createdTransactions) {
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
    console.error(`Error handling transactions created event:`, error);
    throw error;
  }
}

async function handleTransactionsUpdated(payload: TransactionsWebhookPayload): Promise<void> {
  const { itemId, accountId, transactionIds } = payload;

  if (!transactionIds || !Array.isArray(transactionIds) || transactionIds.length === 0) {

    if (!hasPluggyCredentials()) {
      console.error("Missing Pluggy credentials, cannot fetch transactions");
      return;
    }

    try {
      let apiKey: string;
      try {
        apiKey = await getPluggyApiKey();
      } catch (authError) {
        console.error("Error authenticating with Pluggy API:", authError);
        return;
      }
      
      if (accountId) {
        const transactionsResponse = await axios.get("https://api.pluggy.ai/transactions", {
          params: { accountId },
          headers: {
            "X-API-KEY": apiKey,
            Accept: "application/json",
          },
        });
        const transactionsData = transactionsResponse.data?.results || transactionsResponse.data || [];
        if (transactionsData.length > 0) {
          for (const transaction of transactionsData) {
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
        }
      } else {
        const accountsResponse = await axios.get("https://api.pluggy.ai/accounts", {
          params: { itemId },
          headers: {
            "X-API-KEY": apiKey,
            Accept: "application/json",
          },
        });
        const accountsData = accountsResponse.data?.results || accountsResponse.data || [];
        if (accountsData.length > 0) {
          for (const account of accountsData) {
            const accountData = account as any;
            try {
              const transactionsResponse = await axios.get("https://api.pluggy.ai/transactions", {
                params: { accountId: accountData.id },
                headers: {
                  "X-API-KEY": apiKey,
                  Accept: "application/json",
                },
              });
              const transactionsData = transactionsResponse.data?.results || transactionsResponse.data || [];
              if (transactionsData.length > 0) {
                for (const transaction of transactionsData) {
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

  if (!hasPluggyCredentials()) {
    console.error("Missing Pluggy credentials, cannot fetch transactions");
    return;
  }

  try {
    let apiKey: string;
    try {
      apiKey = await getPluggyApiKey();
    } catch (authError) {
      console.error("Error authenticating with Pluggy API:", authError);
      throw new Error("Failed to authenticate with Pluggy API");
    }

    if (accountId) {
      const transactionsResponse = await axios.get("https://api.pluggy.ai/transactions", {
        params: { accountId },
        headers: {
          "X-API-KEY": apiKey,
          Accept: "application/json",
        },
      });
      const transactionsData = transactionsResponse.data?.results || transactionsResponse.data || [];
      if (transactionsData.length > 0) {
        const updatedTransactions = transactionsData.filter((t: any) =>
          transactionIds.includes(t.id)
        );

        for (const transaction of updatedTransactions) {
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
      }
    } else {
      const accountsResponse = await axios.get("https://api.pluggy.ai/accounts", {
        params: { itemId },
        headers: {
          "X-API-KEY": apiKey,
          Accept: "application/json",
        },
      });

      const accountsData = accountsResponse.data?.results || accountsResponse.data || [];
      if (accountsData.length > 0) {
        for (const account of accountsData) {
          const accountData = account as any;
          try {
            const transactionsResponse = await axios.get("https://api.pluggy.ai/transactions", {
              params: { accountId: accountData.id },
              headers: {
                "X-API-KEY": apiKey,
                Accept: "application/json",
              },
            });
            const transactionsData = transactionsResponse.data?.results || transactionsResponse.data || [];
            if (transactionsData.length > 0) {
              const updatedTransactions = transactionsData.filter((t: any) =>
                transactionIds.includes(t.id)
              );

              for (const transaction of updatedTransactions) {
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
    console.error(`Error handling transactions updated event:`, error);
    throw error;
  }
}

async function handleTransactionsDeleted(payload: TransactionsWebhookPayload): Promise<void> {
  const { itemId, accountId, transactionIds } = payload;
  
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
}

async function handlePaymentRequestUpdated(payload: PaymentRequestWebhookPayload): Promise<void> {
  const { paymentRequestId, status } = payload;
}

async function handleScheduledPaymentEvent(payload: ScheduledPaymentWebhookPayload): Promise<void> {
  const { event, scheduledPaymentId, paymentRequestId } = payload;
}

async function handleAutomaticPixPaymentEvent(payload: AutomaticPixPaymentWebhookPayload): Promise<void> {
  const { event, automaticPixPaymentId, paymentRequestId, endToEndId } = payload;
}

async function handlePaymentRefundEvent(payload: PaymentRefundWebhookPayload): Promise<void> {
  const { event, refundId, paymentRequestId } = payload;
}

