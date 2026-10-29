import type { Integration } from '../types'

/**
 * Connection registry. A future adapter may set status to "connected" only
 * after a real credentialed client exists. Nothing in this build does that.
 * demo_data means the figures live in the sample company, on this device.
 */
export function integrationRegistry(): Integration[] {
  return [
    {
      id: 'catalog',
      name: 'Product catalog',
      category: 'Catalog',
      status: 'demo_data',
      summary: 'Sample hardware and software the Northline tasks refer to. Stored in this app, not in a PIM.',
      connectionPoint: 'Replace the sample catalog strings in src/domain/sample.ts with a catalog adapter.',
      usedBy: 'Sales, Marketing, Technology',
    },
    {
      id: 'crm',
      name: 'CRM',
      category: 'Sales',
      status: 'not_connected',
      summary: 'Would hold real leads and accounts. The Riverside Academy lead is sample data.',
      connectionPoint: 'Implement a CRM adapter that can list leads and write draft notes.',
      usedBy: 'Sales',
    },
    {
      id: 'email',
      name: 'Email',
      category: 'Messages',
      status: 'not_connected',
      summary: 'Would send external mail after your approval. No mailbox is linked.',
      connectionPoint: 'Implement an email adapter whose send() runs only after an approval is granted.',
      usedBy: 'Sales',
    },
    {
      id: 'social',
      name: 'Social platforms',
      category: 'Publishing',
      status: 'not_connected',
      summary: 'Would publish an approved post. No social account is linked.',
      connectionPoint: 'Implement a social adapter that posts only the exact approved copy.',
      usedBy: 'Social Media',
    },
    {
      id: 'pr',
      name: 'PR / newswire',
      category: 'Publishing',
      status: 'not_connected',
      summary: 'Would release an approved announcement. No newswire is linked.',
      connectionPoint: 'Implement a PR adapter that releases only after approval.',
      usedBy: 'PR',
    },
    {
      id: 'calendar',
      name: 'Calendar',
      category: 'Planning',
      status: 'not_connected',
      summary: 'Would read availability for standups and launches. No calendar is linked.',
      connectionPoint: 'Implement a calendar adapter with read scope first.',
      usedBy: 'Managing Director, managers',
    },
    {
      id: 'suppliers',
      name: 'Supplier systems',
      category: 'Procurement',
      status: 'not_connected',
      summary: 'Would read live stock and place purchase orders. Quotes in this app are sample figures.',
      connectionPoint: 'Implement a supplier adapter. purchase.create still requires approval.',
      usedBy: 'Procurement',
    },
    {
      id: 'finance',
      name: 'Finance system',
      category: 'Finance',
      status: 'not_connected',
      summary: 'Would read and, with approval, change financial records. No ledger is linked.',
      connectionPoint: 'Implement a finance adapter. Writes require a finance_change approval.',
      usedBy: 'Finance',
    },
    {
      id: 'hr',
      name: 'HR system',
      category: 'People',
      status: 'not_connected',
      summary: 'Would store roles and send offers. No HR system is linked.',
      connectionPoint: 'Implement an HR adapter. Hiring still requires approval.',
      usedBy: 'HR',
    },
    {
      id: 'desktop',
      name: 'Desktop control',
      category: 'This computer',
      status: 'not_connected',
      summary:
        'A future agent could use a visible, revocable session. This build cannot see the screen or move the pointer.',
      connectionPoint:
        'Ship a desktop agent the owner starts explicitly. Keep agentConnected false until that session exists.',
      usedBy: 'Only staff with desktop permission, and only after approval',
    },
  ]
}
