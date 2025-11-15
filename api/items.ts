import { VercelRequest, VercelResponse } from "@vercel/node";
import { itemsService } from "../lib/services/items";
import { accountsService } from "../lib/services/accounts";
import { identityService } from "../lib/services/identity";
import { transactionsService } from "../lib/services/transactions";
import { investmentsService } from "../lib/services/investments";
import { loansService } from "../lib/services/loans";
import { creditCardBillsService } from "../lib/services/credit-card-bills";
import { getPluggyClient, hasPluggyCredentials } from "../lib/pluggyClient";
import type {
  PluggyItemRecord,
  AccountRecord,
  IdentityRecord,
  TransactionRecord,
  InvestmentRecord,
  InvestmentTransactionRecord,
  LoanRecord,
  CreditCardBillRecord,
} from "../lib/types";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(200).end();
  }

  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    switch (req.method) {
      case "GET":
        return await handleGet(req, res);
      case "POST":
        return await handlePost(req, res);
      case "DELETE":
        return await handleDelete(req, res);
      default:
        return res.status(405).json({ error: "Method not allowed" });
    }
  } catch (error) {
    console.error("Error in items handler:", error);
    
    if (error instanceof Error) {
      if ('response' in error && typeof error.response === 'object') {
        const response = error.response as { status?: number };
        
        switch (response.status) {
          case 401:
            return res.status(401).json({ 
              error: "Authentication failed. Please check Pluggy credentials." 
            });
          case 404:
            return res.status(404).json({ 
              error: "Resource not found" 
            });
          case 429:
            return res.status(429).json({ 
              error: "Rate limit exceeded. Please try again later." 
            });
          default:
            break;
        }
      }
      
      return res.status(500).json({
        error: "Internal server error",
        details: error.message,
      });
    }
    
    return res.status(500).json({
      error: "Internal server error",
      details: "Unknown error",
    });
  }
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
  const { itemId, userId } = req.query;

  // Fetch specific item from Pluggy
  if (itemId && typeof itemId === "string") {
    if (!hasPluggyCredentials()) {
      return res.status(503).json({
        error: "Pluggy integration not configured",
        details: "Missing required credentials"
      });
    }

    try {
      const pluggyClient = getPluggyClient();
      const item = await pluggyClient.fetchItem(itemId);
      return res.json({
        success: true,
        data: item
      });
    } catch (error) {
      console.error("Error fetching item from Pluggy:", error);
      throw error;
    }
  }

  try {
    const userIdFilter = userId && typeof userId === "string" ? userId : undefined;
    const items = await itemsService.getUserItems(userIdFilter);
    return res.json({
      success: true,
      data: items
    });
  } catch (error) {
    console.error("Error fetching items from database:", error);
    throw error;
  }
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
  const itemData: PluggyItemRecord = req.body;

  if (!itemData.item_id) {
    return res.status(400).json({ 
      error: "Bad request",
      details: "item_id is required" 
    });
  }

  const savedItem = await itemsService.upsertItem(itemData);

  const responseData: {
    item: PluggyItemRecord;
    accounts?: AccountRecord[];
    identity?: IdentityRecord;
    investments?: InvestmentRecord[];
    loans?: LoanRecord[];
    warnings?: string[];
  } = {
    item: savedItem,
    warnings: [],
  };

  if (!hasPluggyCredentials()) {
    console.error("Missing Pluggy credentials, skipping data fetch");
    responseData.warnings?.push(
      "Item saved but accounts/identity/investments/loans not fetched due to missing Pluggy credentials"
    );
    return res.status(201).json(responseData);
  }

  const pluggyClient = getPluggyClient();

  try {
    const accountsResponse = await pluggyClient.fetchAccounts(itemData.item_id);

    if (accountsResponse.results && accountsResponse.results.length > 0) {
      const accountsToSave: AccountRecord[] = accountsResponse.results.map(
        (account: any) => ({
          item_id: itemData.item_id,
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

      const savedAccounts = await accountsService.upsertMultipleAccounts(accountsToSave);
      responseData.accounts = savedAccounts;

      if (savedAccounts && savedAccounts.length > 0) {
        const allTransactions: TransactionRecord[] = [];
        
        for (const account of savedAccounts) {
          try {

            const transactionsResponse = await pluggyClient.fetchTransactions(
              account.account_id
            );

            if (transactionsResponse.results && transactionsResponse.results.length > 0) {
              const transactionsToSave: TransactionRecord[] = transactionsResponse.results.map(
                (transaction: any) => ({
                  transaction_id: transaction.id,
                  account_id: account.account_id,
                  date: transaction.date,
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
                })
              );

              allTransactions.push(...transactionsToSave);
            }
          } catch (transactionError) {
            console.error(
              `Error fetching transactions for account ${account.account_id}:`,
              transactionError
            );
            responseData.warnings?.push(
              `Failed to fetch transactions for account ${account.account_id}: ${
                transactionError instanceof Error
                  ? transactionError.message
                  : "Unknown error"
              }`
            );
          }
        }

        if (allTransactions.length > 0) {
          try {
            const savedTransactions =
              await transactionsService.upsertMultipleTransactions(allTransactions);
          } catch (saveError) {
            console.error("Error saving transactions to Supabase:", saveError);
            responseData.warnings?.push(
              `Failed to save transactions: ${
                saveError instanceof Error ? saveError.message : "Unknown error"
              }`
            );
          }
        }

        const allBills: CreditCardBillRecord[] = [];

        for (const account of savedAccounts) {
          try {

            const billsResponse = await pluggyClient.fetchCreditCardBills(account.account_id);

            const billsArray = billsResponse.results || [];

            if (billsArray.length > 0) {
              const billsToSave: CreditCardBillRecord[] = billsArray.map(
                (bill: any) => ({
                  bill_id: bill.id,
                  account_id: account.account_id,
                  due_date: bill.dueDate,
                  total_amount: bill.totalAmount,
                  total_amount_currency_code: bill.totalAmountCurrencyCode,
                  minimum_payment_amount: bill.minimumPaymentAmount,
                  allows_installments: bill.allowsInstallments,
                  finance_charges: bill.financeCharges,
                })
              );

              allBills.push(...billsToSave);
            }
          } catch (billError) {
            console.error(
              `Error fetching bills for account ${account.account_id}:`,
              billError
            );
            responseData.warnings?.push(
              `Failed to fetch bills for account ${account.account_id}: ${
                billError instanceof Error
                  ? billError.message
                  : "Unknown error"
              }`
            );
          }
        }

        if (allBills.length > 0) {
          try {
            const savedBills =
              await creditCardBillsService.upsertMultipleBills(allBills);
          } catch (saveError) {
            console.error("Error saving bills to Supabase:", saveError);
            responseData.warnings?.push(
              `Failed to save bills: ${
                saveError instanceof Error ? saveError.message : "Unknown error"
              }`
            );
          }
        }
      }
    } else {
      responseData.accounts = [];
    }
  } catch (accountError) {
    console.error("Error fetching/saving accounts:", accountError);
    responseData.warnings?.push(
      "Failed to fetch/save accounts: " +
        (accountError instanceof Error ? accountError.message : "Unknown error")
    );
  }

  try {
    
    const identity = await pluggyClient.fetchIdentityByItemId(itemData.item_id);

    if (identity) {
      const identityToSave: IdentityRecord = {
        item_id: itemData.item_id,
        identity_id: identity.id,
        full_name: identity.fullName,
        company_name: identity.companyName,
        document: identity.document,
        document_type: identity.documentType,
        tax_number: identity.taxNumber,
        job_title: identity.jobTitle,
        birth_date: identity.birthDate
          ? new Date(identity.birthDate).toISOString()
          : undefined,
        addresses: identity.addresses,
        phone_numbers: identity.phoneNumbers,
        emails: identity.emails,
        relations: identity.relations,
      };

      const savedIdentity = await identityService.upsertIdentity(identityToSave);
      responseData.identity = savedIdentity;
    }
  } catch (identityError) {
    if (identityError instanceof Error && 'response' in identityError) {
      const response = identityError.response as { status?: number };
      if (response.status === 404) {
      } else {
        console.error("Error fetching/saving identity:", identityError);
        responseData.warnings?.push(
          "Failed to fetch/save identity: " + identityError.message
        );
      }
    } else {
      console.error("Error fetching/saving identity:", identityError);
      responseData.warnings?.push("Failed to fetch/save identity");
    }
  }

  try {

    const investmentsResponse = await pluggyClient.fetchInvestments(itemData.item_id);

    if (investmentsResponse.results && investmentsResponse.results.length > 0) {
      const investmentsToSave: InvestmentRecord[] =
        investmentsResponse.results.map((investment: any) => ({
          item_id: itemData.item_id,
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
        }));

      const savedInvestments =
        await investmentsService.upsertMultipleInvestments(investmentsToSave);
      responseData.investments = savedInvestments;

      if (savedInvestments && savedInvestments.length > 0) {
        const allInvestmentTransactions: InvestmentTransactionRecord[] = [];

        for (const investment of savedInvestments) {
          try {

            const transactionsResponse = await pluggyClient.fetchInvestmentTransactions(
              investment.investment_id,
              { pageSize: 500, page: 1 }
            );

            if (transactionsResponse.results && transactionsResponse.results.length > 0) {
              const transactionsToSave: InvestmentTransactionRecord[] =
                transactionsResponse.results.map((transaction: any) => ({
                  transaction_id: transaction.id,
                  investment_id: investment.investment_id,
                  trade_date: transaction.tradeDate,
                  date: transaction.date,
                  description: transaction.description,
                  quantity: transaction.quantity,
                  value: transaction.value,
                  amount: transaction.amount,
                  net_amount: transaction.netAmount,
                  type: transaction.type as
                    | "BUY"
                    | "SELL"
                    | "DIVIDEND"
                    | "SPLIT"
                    | "BONUS",
                  brokerage_number: transaction.brokerageNumber,
                  expenses: transaction.expenses,
                }));

              allInvestmentTransactions.push(...transactionsToSave);
            }
          } catch (transactionError) {
            console.error(
              `Error fetching transactions for investment ${investment.investment_id}:`,
              transactionError
            );
            responseData.warnings?.push(
              `Failed to fetch transactions for investment ${investment.investment_id}: ${
                transactionError instanceof Error
                  ? transactionError.message
                  : "Unknown error"
              }`
            );
          }
        }

        if (allInvestmentTransactions.length > 0) {
          try {
            const savedInvestmentTransactions =
              await investmentsService.upsertMultipleInvestmentTransactions(
                allInvestmentTransactions
              );
          } catch (saveError) {
            console.error(
              "Error saving investment transactions to Supabase:",
              saveError
            );
            responseData.warnings?.push(
              `Failed to save investment transactions: ${
                saveError instanceof Error ? saveError.message : "Unknown error"
              }`
            );
          }
        }
      }
    } else {
      responseData.investments = [];
    }
  } catch (investmentError) {
    if (investmentError instanceof Error && 'response' in investmentError) {
      const response = investmentError.response as { status?: number };
      if (response.status === 404) {
        responseData.investments = [];
      } else {
        console.error("Error fetching/saving investments:", investmentError);
        responseData.warnings?.push(
          "Failed to fetch/save investments: " + investmentError.message
        );
      }
    } else {
      console.error("Error fetching/saving investments:", investmentError);
      responseData.warnings?.push("Failed to fetch/save investments");
    }
  }

  try {
    const loansResponse = await pluggyClient.fetchLoans(itemData.item_id);
    const loansArray = loansResponse.results || [];

    if (loansArray.length > 0) {
      const loansToSave: LoanRecord[] = loansArray.map(
        (loan: any) => ({
          item_id: itemData.item_id,
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
          installment_periodicity_additional_info:
            loan.installmentPeriodicityAdditionalInfo,
          amortization_scheduled: loan.amortizationScheduled,
          amortization_scheduled_additional_info:
            loan.amortizationScheduledAdditionalInfo,
          cnpj_consignee: loan.cnpjConsignee,
          interest_rates: loan.interestRates,
          contracted_fees: loan.contractedFees,
          contracted_finance_charges: loan.contractedFinanceCharges,
          warranties: loan.warranties,
          installments: loan.installments,
          payments: loan.payments,
        })
      );

      const savedLoans = await loansService.upsertMultipleLoans(loansToSave);
      responseData.loans = savedLoans;
    } else {
      responseData.loans = [];
    }
  } catch (loanError) {
    if (loanError instanceof Error && 'response' in loanError) {
      const response = loanError.response as { status?: number };
      if (response.status === 404) {
        responseData.loans = [];
      } else {
        console.error("Error fetching/saving loans:", loanError);
        responseData.warnings?.push(
          "Failed to fetch/save loans: " + loanError.message
        );
      }
    } else {
      console.error("Error fetching/saving loans:", loanError);
      responseData.warnings?.push("Failed to fetch/save loans");
    }
  }

  return res.status(201).json(responseData);
}

async function handleDelete(req: VercelRequest, res: VercelResponse) {
  const { itemId } = req.query;

  if (!itemId || typeof itemId !== "string") {
    return res.status(400).json({ 
      error: "Bad request",
      details: "itemId is required" 
    });
  }

  const warnings: string[] = [];

  if (hasPluggyCredentials()) {
    try {
      const pluggyClient = getPluggyClient();
      await pluggyClient.deleteItem(itemId);
    } catch (pluggyError) {
      if (pluggyError instanceof Error && 'response' in pluggyError) {
        const response = pluggyError.response as { status?: number };
        
        if (response.status === 404) {
          warnings.push(
            "Item not found in Pluggy (already deleted or never existed)"
          );
        } else {
          console.error("Error deleting item from Pluggy:", pluggyError);
          warnings.push(
            `Failed to delete from Pluggy: ${pluggyError.message}`
          );
        }
      } else {
        console.error("Error deleting item from Pluggy:", pluggyError);
        warnings.push("Failed to delete from Pluggy: Unknown error");
      }
    }
  }

  try {
    await itemsService.deleteItem(itemId);
  } catch (itemError) {
    console.error("Error deleting item from database:", itemError);
    return res.status(500).json({
      error: "Failed to delete item from database",
      details: itemError instanceof Error ? itemError.message : "Unknown error",
    });
  }

  return res.status(200).json({
    success: true,
    message: "Item and related data deleted successfully",
    itemId,
    warnings: warnings.length > 0 ? warnings : undefined,
  });
}