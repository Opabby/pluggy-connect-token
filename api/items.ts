import { VercelRequest, VercelResponse } from "@vercel/node";
import { itemsService } from "../lib/services/items";
import { accountsService } from "../lib/services/accounts";
import { identityService } from "../lib/services/identity";
import { transactionsService } from "../lib/services/transactions";
import { investmentsService } from "../lib/services/investments";
import { getPluggyClient, hasPluggyCredentials } from "../lib/pluggyClient";
import type {
  PluggyItemRecord,
  AccountRecord,
  IdentityRecord,
  TransactionRecord,
  InvestmentRecord,
} from "../lib/types";
import axios from "axios";

const { PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET } = process.env;

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
    return res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
  const { itemId, userId } = req.query;

  if (itemId && typeof itemId === "string") {
    if (!hasPluggyCredentials()) {
      return res.status(500).json({
        error: "Missing Pluggy credentials in environment variables",
      });
    }

    const pluggyClient = getPluggyClient();
    const item = await pluggyClient.fetchItem(itemId);
    return res.json(item);
  }

  const userIdFilter =
    userId && typeof userId === "string" ? userId : undefined;
  const items = await itemsService.getUserItems(userIdFilter);
  return res.json(items);
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
  const itemData: PluggyItemRecord = req.body;

  if (!itemData.item_id) {
    return res.status(400).json({ error: "item_id is required" });
  }

  const savedItem = await itemsService.createItem(itemData);
  console.log("Item saved to Supabase:", savedItem);

  const responseData: {
    item: PluggyItemRecord;
    accounts?: AccountRecord[];
    identity?: IdentityRecord;
    investments?: InvestmentRecord[];
    warnings?: string[];
  } = {
    item: savedItem,
    warnings: [],
  };

  if (!hasPluggyCredentials()) {
    console.error("Missing Pluggy credentials, skipping data fetch");
    responseData.warnings?.push(
      "Item saved but accounts/identity/investments not fetched due to missing Pluggy credentials"
    );
    return res.status(201).json(responseData);
  }

  const pluggyClient = getPluggyClient();

  let apiKey: string | null = null;
  try {
    const authResponse = await axios.post("https://api.pluggy.ai/auth", {
      clientId: PLUGGY_CLIENT_ID,
      clientSecret: PLUGGY_CLIENT_SECRET,
    });
    apiKey = authResponse.data.apiKey;
  } catch (authError) {
    console.error("Error getting Pluggy API key:", authError);
    responseData.warnings?.push("Failed to authenticate with Pluggy API");
  }

  try {
    const accountsResponse = await pluggyClient.fetchAccounts(itemData.item_id);
    console.log("Accounts fetched from Pluggy:", accountsResponse);

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

      const savedAccounts = await accountsService.createMultipleAccounts(
        accountsToSave
      );
      console.log("Accounts saved to Supabase:", savedAccounts);
      responseData.accounts = savedAccounts;

      // Fetch and save transactions for each account
      if (savedAccounts && savedAccounts.length > 0) {
        const allTransactions: TransactionRecord[] = [];
        
        for (const account of savedAccounts) {
          try {
            console.log(`Fetching transactions for account: ${account.account_id}`);
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
              console.log(
                `Found ${transactionsToSave.length} transactions for account ${account.account_id}`
              );
            } else {
              console.log(`No transactions found for account ${account.account_id}`);
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

        // Save all transactions in batch
        if (allTransactions.length > 0) {
          try {
            const savedTransactions =
              await transactionsService.createMultipleTransactions(allTransactions);
            console.log(
              `Saved ${savedTransactions.length} transactions to Supabase`
            );
          } catch (saveError) {
            console.error("Error saving transactions to Supabase:", saveError);
            responseData.warnings?.push(
              `Failed to save transactions: ${
                saveError instanceof Error ? saveError.message : "Unknown error"
              }`
            );
          }
        }
      }
    } else {
      console.log("No accounts found for this item");
      responseData.accounts = [];
    }
  } catch (accountError) {
    console.error("Error fetching/saving accounts:", accountError);
    responseData.warnings?.push(
      "Failed to fetch/save accounts: " +
        (accountError instanceof Error ? accountError.message : "Unknown error")
    );
  }

  // Fetch and save identity
  if (apiKey) {
    try {
      console.log("Fetching identity for item:", itemData.item_id);
      const identityResponse = await axios.get(
        "https://api.pluggy.ai/identity",
        {
          params: { itemId: itemData.item_id },
          headers: {
            "X-API-KEY": apiKey,
            Accept: "application/json",
          },
        }
      );

      console.log("Identity fetched from Pluggy:", identityResponse.data);

      if (identityResponse.data) {
        const identity = identityResponse.data;
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

        const savedIdentity = await identityService.createIdentity(
          identityToSave
        );
        console.log("Identity saved to Supabase:", savedIdentity);
        responseData.identity = savedIdentity;
      }
    } catch (identityError) {
      if (
        identityError &&
        typeof identityError === "object" &&
        "response" in identityError
      ) {
        const axiosError = identityError as any;
        if (axiosError.response?.status === 404) {
          console.log("No identity available for this item (404)");
        } else {
          console.error("Error fetching/saving identity:", identityError);
          responseData.warnings?.push(
            "Failed to fetch/save identity: " +
              (axiosError.response?.data?.message ||
                axiosError.message ||
                "Unknown error")
          );
        }
      } else {
        console.error("Error fetching/saving identity:", identityError);
        responseData.warnings?.push("Failed to fetch/save identity");
      }
    }
  }

  if (apiKey) {
    try {
      console.log("Fetching investments for item:", itemData.item_id);
      const investmentsResponse = await axios.get(
        "https://api.pluggy.ai/investments",
        {
          params: { itemId: itemData.item_id },
          headers: {
            "X-API-KEY": apiKey,
            Accept: "application/json",
          },
        }
      );

      console.log("Investments fetched from Pluggy:", investmentsResponse.data);

      if (
        investmentsResponse.data?.results &&
        investmentsResponse.data.results.length > 0
      ) {
        const investmentsToSave: InvestmentRecord[] =
          investmentsResponse.data.results.map((investment: any) => ({
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
          await investmentsService.createMultipleInvestments(investmentsToSave);
        console.log("Investments saved to Supabase:", savedInvestments);
        responseData.investments = savedInvestments;
      } else {
        console.log("No investments found for this item");
        responseData.investments = [];
      }
    } catch (investmentError) {
      if (
        investmentError &&
        typeof investmentError === "object" &&
        "response" in investmentError
      ) {
        const axiosError = investmentError as any;
        if (axiosError.response?.status === 404) {
          console.log("No investments available for this item (404)");
          responseData.investments = [];
        } else {
          console.error("Error fetching/saving investments:", investmentError);
          responseData.warnings?.push(
            "Failed to fetch/save investments: " +
              (axiosError.response?.data?.message ||
                axiosError.message ||
                "Unknown error")
          );
        }
      } else {
        console.error("Error fetching/saving investments:", investmentError);
        responseData.warnings?.push("Failed to fetch/save investments");
      }
    }
  }

  return res.status(201).json(responseData);
}

async function handleDelete(req: VercelRequest, res: VercelResponse) {
  const { itemId } = req.query;

  if (!itemId || typeof itemId !== "string") {
    return res.status(400).json({ error: "itemId is required" });
  }

  const warnings: string[] = [];

  // Attempt to delete from Pluggy (non-blocking)
  if (hasPluggyCredentials()) {
    try {
      const pluggyClient = getPluggyClient();
      await pluggyClient.deleteItem(itemId);
      console.log(`Item ${itemId} deleted from Pluggy`);
    } catch (pluggyError) {
      const error = pluggyError as any;
      console.error("Error deleting item from Pluggy:", pluggyError);

      if (error.response?.status === 404) {
        warnings.push(
          "Item not found in Pluggy (already deleted or never existed)"
        );
      } else {
        warnings.push(
          `Failed to delete from Pluggy: ${
            error.message || "Unknown error"
          }`
        );
      }
    }
  }

  // Delete item from database (CASCADE DELETE will handle related records)
  try {
    await itemsService.deleteItem(itemId);
    console.log(`Item ${itemId} deleted from database (cascade delete handled related records)`);
  } catch (itemError) {
    console.error("Error deleting item from database:", itemError);
    return res.status(500).json({
      error: "Failed to delete item from database",
      details:
        itemError instanceof Error ? itemError.message : "Unknown error",
    });
  }

  return res.status(200).json({
    success: true,
    message: "Item and related data deleted successfully",
    itemId,
    warnings: warnings.length > 0 ? warnings : undefined,
  });
}
