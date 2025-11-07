import { VercelRequest, VercelResponse } from '@vercel/node';
import { itemsService } from '../../lib/services/items';
import { accountsService } from '../../lib/services/accounts';
import { identityService } from '../../lib/services/identity';
import type { PluggyItemRecord, AccountRecord, IdentityRecord } from '../../lib/types';
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

    try {
      const item = await pluggyClient.fetchItem(itemData.item_id);
      const itemWithIdentity = item as any;
      console.log('Item fetched from Pluggy:', item);
      
      if (itemWithIdentity.identityId) {
        console.log('Identity ID found:', itemWithIdentity.identityId);
        const identityResponse = await pluggyClient.fetchIdentity(itemWithIdentity.identityId);
        console.log('Identity fetched from Pluggy:', identityResponse);

        if (identityResponse) {
          const identityToSave: IdentityRecord = {
            item_id: itemData.item_id,
            identity_id: identityResponse.id,
            full_name: identityResponse.fullName,
            company_name: identityResponse.companyName,
            document: identityResponse.document,
            document_type: identityResponse.documentType,
            tax_number: identityResponse.taxNumber,
            job_title: identityResponse.jobTitle,
            birth_date: identityResponse.birthDate?.toISOString(),
            addresses: identityResponse.addresses,
            phone_numbers: identityResponse.phoneNumbers,
            emails: identityResponse.emails,
            relations: identityResponse.relations,
          };

          const savedIdentity = await identityService.createIdentity(identityToSave);
          console.log('Identity saved to Supabase:', savedIdentity);
          responseData.identity = savedIdentity;
        }
      } else {
        console.log('No identity ID available for this item - identity product may not be enabled');
      }
    } catch (identityError) {
      console.error('Error fetching/saving identity:', identityError);
      responseData.warnings?.push('Failed to fetch/save identity: ' + (identityError instanceof Error ? identityError.message : 'Unknown error'));
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