// Looks up a Shopify order by its name (e.g. "#DTFN24609") via the Admin
// GraphQL API. `admin` is the authenticated client from authenticate.admin().

type OrderInfo = {
  gid: string;
  name: string;
  totalPrice: string;
  currency: string;
  customer: string | null;
  email: string | null;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
} | null;

export async function lookupOrderByName(
  admin: { graphql: (q: string, opts?: { variables?: Record<string, unknown> }) => Promise<Response> },
  orderName: string,
): Promise<OrderInfo> {
  const name = orderName.trim();
  const query = name.startsWith("#") ? `name:${name}` : `name:#${name}`;
  const resp = await admin.graphql(
    `#graphql
    query ReprintOrderLookup($q: String!) {
      orders(first: 1, query: $q) {
        nodes {
          id
          name
          email
          displayFinancialStatus
          displayFulfillmentStatus
          customer { displayName }
          totalPriceSet { shopMoney { amount currencyCode } }
        }
      }
    }`,
    { variables: { q: query } },
  );
  const body = await resp.json();
  const node = body?.data?.orders?.nodes?.[0];
  if (!node) return null;
  return {
    gid: node.id,
    name: node.name,
    totalPrice: node.totalPriceSet?.shopMoney?.amount ?? "0",
    currency: node.totalPriceSet?.shopMoney?.currencyCode ?? "GBP",
    customer: node.customer?.displayName ?? null,
    email: node.email ?? null,
    financialStatus: node.displayFinancialStatus ?? null,
    fulfillmentStatus: node.displayFulfillmentStatus ?? null,
  };
}
