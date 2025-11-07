import { VercelRequest, VercelResponse } from '@vercel/node';
import { itemsService } from '../../lib/services/items';
import { accountsService } from '../../lib/services/accounts';
import type { PluggyItemRecord, AccountRecord } from '../../lib/types';
import { PluggyClient } from 'pluggy-sdk';

const { PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET } = process.env;

export default async function handler(req: VercelRequest, res: VercelResponse) {

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end(); 
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const itemData: PluggyItemRecord = req.body;

    if (!itemData.item_id) {
      return res.status(400).json({ error: 'item_id is required' });
    }

    // Step 1: Save the item to Supabase
    const savedItem = await itemsService.createItem(itemData);
    console.log('Item saved to Supabase:', savedItem);

    // Step 2: Fetch accounts from Pluggy API
    if (!PLUGGY_CLIENT_ID || !PLUGGY_CLIENT_SECRET) {
      console.error('Missing Pluggy credentials, skipping account fetch');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(201).json({ 
        item: savedItem,
        warning: 'Item saved but accounts not fetched due to missing Pluggy credentials'
      });
    }

    const pluggyClient = new PluggyClient({
      clientId: PLUGGY_CLIENT_ID,
      clientSecret: PLUGGY_CLIENT_SECRET,
    });

    try {
      const accountsResponse = await pluggyClient.fetchAccounts(itemData.item_id);
      console.log('Accounts fetched from Pluggy:', accountsResponse);

      // Step 3: Transform and save accounts to Supabase
      if (accountsResponse.results && accountsResponse.results.length > 0) {
        const accountsToSave: AccountRecord[] = accountsResponse.results.map((account: any) => ({
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
        }));

        const savedAccounts = await accountsService.createMultipleAccounts(accountsToSave);
        console.log('Accounts saved to Supabase:', savedAccounts);

        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.status(201).json({ 
          item: savedItem,
          accounts: savedAccounts,
          message: 'Item and accounts saved successfully'
        });
      } else {
        console.log('No accounts found for this item');
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.status(201).json({ 
          item: savedItem,
          accounts: [],
          message: 'Item saved but no accounts found'
        });
      }
    } catch (accountError) {
      console.error('Error fetching/saving accounts:', accountError);
      // Still return success for item save, but indicate account fetch/save failed
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(201).json({ 
        item: savedItem,
        warning: 'Item saved but failed to fetch/save accounts',
        error: accountError instanceof Error ? accountError.message : 'Unknown error'
      });
    }

  } catch (error) {
    console.error('Error saving item:', error);
    return res.status(500).json({ 
      error: 'Failed to save item',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}