import { VercelRequest, VercelResponse } from '@vercel/node';
import { itemsService } from '../../lib/services/items';
import { accountsService } from '../../lib/services/accounts';
import { identityService } from '../../lib/services/identity';
import type { PluggyItemRecord, AccountRecord, IdentityRecord } from '../../lib/types';
import { PluggyClient } from 'pluggy-sdk';
import axios from 'axios';

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

    const savedItem = await itemsService.createItem(itemData);
    console.log('Item saved to Supabase:', savedItem);

    const responseData: {
      item: PluggyItemRecord;
      accounts?: AccountRecord[];
      identity?: IdentityRecord;
      warnings?: string[];
    } = {
      item: savedItem,
      warnings: [],
    };

    if (!PLUGGY_CLIENT_ID || !PLUGGY_CLIENT_SECRET) {
      console.error('Missing Pluggy credentials, skipping data fetch');
      responseData.warnings?.push('Item saved but accounts/identity not fetched due to missing Pluggy credentials');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(201).json(responseData);
    }

    const pluggyClient = new PluggyClient({
      clientId: PLUGGY_CLIENT_ID,
      clientSecret: PLUGGY_CLIENT_SECRET,
    });

    let apiKey: string | null = null;
    try {
      const authResponse = await axios.post('https://api.pluggy.ai/auth', {
        clientId: PLUGGY_CLIENT_ID,
        clientSecret: PLUGGY_CLIENT_SECRET,
      });
      apiKey = authResponse.data.apiKey;
    } catch (authError) {
      console.error('Error getting Pluggy API key:', authError);
      responseData.warnings?.push('Failed to authenticate with Pluggy API');
    }

    try {
      const accountsResponse = await pluggyClient.fetchAccounts(itemData.item_id);
      console.log('Accounts fetched from Pluggy:', accountsResponse);

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
        responseData.accounts = savedAccounts;
      } else {
        console.log('No accounts found for this item');
        responseData.accounts = [];
      }
    } catch (accountError) {
      console.error('Error fetching/saving accounts:', accountError);
      responseData.warnings?.push('Failed to fetch/save accounts: ' + (accountError instanceof Error ? accountError.message : 'Unknown error'));
    }

    if (apiKey) {
      try {
        console.log('Fetching identity for item:', itemData.item_id);
        const identityResponse = await axios.get('https://api.pluggy.ai/identity', {
          params: { itemId: itemData.item_id },
          headers: {
            'X-API-KEY': apiKey,
            'Accept': 'application/json',
          },
        });
        
        console.log('Identity fetched from Pluggy:', identityResponse.data);

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
            birth_date: identity.birthDate ? new Date(identity.birthDate).toISOString() : undefined,
            addresses: identity.addresses,
            phone_numbers: identity.phoneNumbers,
            emails: identity.emails,
            relations: identity.relations,
          };

          const savedIdentity = await identityService.createIdentity(identityToSave);
          console.log('Identity saved to Supabase:', savedIdentity);
          responseData.identity = savedIdentity;
        }
      } catch (identityError: any) {
        if (identityError.response?.status === 404) {
          console.log('No identity available for this item (404)');
        } else {
          console.error('Error fetching/saving identity:', identityError);
          responseData.warnings?.push('Failed to fetch/save identity: ' + (identityError.response?.data?.message || identityError.message || 'Unknown error'));
        }
      }
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(201).json(responseData);

  } catch (error) {
    console.error('Error saving item:', error);
    return res.status(500).json({ 
      error: 'Failed to save item',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}