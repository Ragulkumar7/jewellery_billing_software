import { type Customer } from './supabase';
import { api } from './api';

export type CustomerSelection = Customer & {
  source: 'Internal' | 'Shopify' | 'Linked';
  shopify_customer_id?: string | null;
  total_orders?: number;
  total_spent?: number;
};

export async function searchCustomers(query: string): Promise<CustomerSelection[]> {
  const normalized = query.trim();
  const queryString = normalized ? `?q=${encodeURIComponent(normalized)}` : '';
  const customers = await api<Customer[]>(`/api/customers${queryString}`);
  return customers.map((customer) => ({
    ...customer,
    source: customer.source || 'Internal',
    total_spent: customer.total_purchases,
  }));
}

export async function importShopifyCustomer(customer: CustomerSelection): Promise<CustomerSelection> {
  if (customer.source !== 'Shopify' || !customer.shopify_customer_id) return customer;

  const data = await api<Customer>('/api/customers/import-shopify', {
    method: 'POST',
    body: JSON.stringify({
      shopifyCustomerId: customer.shopify_customer_id,
      name: customer.name,
      email: customer.email,
      phone: customer.mobile,
    }),
  });
  return { ...data, source: 'Linked', shopify_customer_id: customer.shopify_customer_id, total_orders: customer.total_orders, total_spent: customer.total_spent };
}
