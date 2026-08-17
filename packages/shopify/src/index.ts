export type ShopifyConfig = {
  storeDomain: string;
  accessToken: string;
  apiVersion: string;
  locationId?: string;
};

export type ShopifyGraphQLError = { message: string; extensions?: Record<string, unknown> };

export class ShopifyApiError extends Error {
  constructor(message: string, public readonly details?: unknown) {
    super(message);
    this.name = 'ShopifyApiError';
  }
}

export function createShopifyClient(config: ShopifyConfig) {
  const endpoint = `https://${config.storeDomain}/admin/api/${config.apiVersion}/graphql.json`;

  async function query<T>(document: string, variables?: Record<string, unknown>): Promise<T> {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': config.accessToken,
      },
      body: JSON.stringify({ query: document, variables }),
    });
    const body = await response.json() as { data?: T; errors?: ShopifyGraphQLError[] };
    if (!response.ok || body.errors?.length || !body.data) {
      throw new ShopifyApiError(body.errors?.map((error) => error.message).join('; ') || `Shopify API returned ${response.status}`, body.errors);
    }
    return body.data;
  }

  return { query, endpoint };
}
