import test from "node:test";
import assert from "node:assert/strict";
import {
  listStockMovements,
  normalizeLimit,
  normalizeOffset,
  DEFAULT_LIMIT,
  MAX_LIMIT,
} from "./stock-movements.js";

type ClientEntry = { text: string; values: unknown[] };

function fakeClient(rows: any[] = []) {
  const calls: ClientEntry[] = [];
  return {
    calls,
    query: async (text: string, values?: unknown[]) => {
      calls.push({ text, values: values ?? [] });
      return { rows };
    },
  };
}

function singleCall(client: { calls: ClientEntry[] }): ClientEntry {
  const call = singleCall(client);
  assert.ok(call, "expected a query call");
  return call;
}

test("normalizeLimit clamps to MAX_LIMIT and floors at 1", () => {
  assert.equal(normalizeLimit(undefined), DEFAULT_LIMIT);
  assert.equal(normalizeLimit(null), DEFAULT_LIMIT);
  assert.equal(normalizeLimit(5000), MAX_LIMIT);
  assert.equal(normalizeLimit(50), 50);
  assert.equal(normalizeLimit(0), 1);
  assert.equal(normalizeLimit(NaN), DEFAULT_LIMIT);
});

test("normalizeOffset floors at 0 and truncates", () => {
  assert.equal(normalizeOffset(undefined), 0);
  assert.equal(normalizeOffset(null), 0);
  assert.equal(normalizeOffset(25), 25);
  assert.equal(normalizeOffset(-10), 0);
  assert.equal(normalizeOffset(2.9), 2);
});

test("listStockMovements returns an empty array for no rows", async () => {
  const client = fakeClient([]);
  const data = await listStockMovements(client, { productId: "p1" });
  assert.deepEqual(data, []);
  assert.equal(client.calls.length, 1);
});

test("listStockMovements selects explicit columns (no SELECT *)", async () => {
  const client = fakeClient([]);
  await listStockMovements(client, {});
  const sql = singleCall(client).text;
  assert.match(sql, /select sm\.id, sm\.product_id, sm\.movement_type/);
  assert.doesNotMatch(sql, /select \*/);
});

test("query is parameterized and bounded (limit + offset)", async () => {
  const client = fakeClient([]);
  await listStockMovements(client, { limit: 200, offset: 4 });
  const sql = singleCall(client).text;
  assert.match(sql, /order by sm\.created_at desc limit \$\d+ offset \$\d+/);
  const values = singleCall(client).values;
  assert.equal(values[0], MAX_LIMIT);
  assert.equal(values[1], 4);
});

test("filters are appended as parameterized placeholders", async () => {
  const client = fakeClient([]);
  await listStockMovements(client, {
    productId: "p1",
    movementType: "Sale",
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    limit: 10,
  });
  const sql = singleCall(client).text;
  assert.match(sql, /where sm\.product_id = \$1 and sm\.movement_type = \$2/);
  assert.match(sql, /sm\.created_at::date >= \$3/);
  assert.match(sql, /sm\.created_at::date <= \$4/);
  const values = singleCall(client).values;
  assert.deepEqual(values.slice(0, 4), ["p1", "Sale", "2026-01-01", "2026-01-31"]);
});

test("oversized limit is capped at MAX_LIMIT before querying", async () => {
  const client = fakeClient([]);
  await listStockMovements(client, { limit: 999999 });
  const values = singleCall(client).values;
  assert.equal(values[0], MAX_LIMIT);
});

test("maps quantity columns to numbers and keeps string dates", async () => {
  const client = fakeClient([
    {
      id: "m1",
      product_id: "p1",
      movement_type: "Sales Return",
      quantity_change: "3",
      resulting_qty: "12",
      reference: "R-1",
      reference_type: "Return",
      notes: "x",
      created_by: "u1",
      created_at: "2026-02-02 10:00:00",
    },
  ]);
  const data = await listStockMovements(client, {});
  assert.equal(data.length, 1);
  assert.equal(data[0].movement_type, "Sales Return");
  assert.equal(data[0].quantity_change, 3);
  assert.equal(data[0].resulting_qty, 12);
  assert.equal(typeof data[0].created_at, "string");
});
