import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  round2,
  calculateUnitPrice,
  calculateLinePrice,
  calculateTax,
  calculateFinalPrice,
  isSilverRateValid,
  getCurrentSilverRate,
  type PriceComponents,
} from './pricing.js';

const base: PriceComponents = {
  net_weight: 10,
  making_charge: 100,
  stone_charge: 50,
  other_charge: 25,
};

// ---------------------------------------------------------------------------
// round2
// ---------------------------------------------------------------------------
test('round2 rounds to 2 decimal places', () => {
  assert.equal(round2(1.005), 1.01);
  assert.equal(round2(1.004), 1.0);
  assert.equal(round2(2.345), 2.35);
});

// ---------------------------------------------------------------------------
// calculateUnitPrice (tax-exclusive)
// ---------------------------------------------------------------------------
test('unit price = net_weight * rate + making + stone + other', () => {
  assert.equal(calculateUnitPrice(base, 92.8), 10 * 92.8 + 100 + 50 + 25);
});

test('unit price handles omitted charges as zero', () => {
  assert.equal(calculateUnitPrice({ net_weight: 5 }, 80), 5 * 80);
  assert.equal(calculateUnitPrice({ net_weight: 5, making_charge: null, gst_rate: null }, 80), 400);
});

test('unit price handles string charges and weights', () => {
  assert.equal(calculateUnitPrice({ net_weight: '10', making_charge: '100', stone_charge: '50', other_charge: '25' }, 92.8), 10 * 92.8 + 100 + 50 + 25);
});

test('unit price rounds to 2 dp', () => {
  assert.equal(calculateUnitPrice({ net_weight: 3.33, making_charge: 0, stone_charge: 0, other_charge: 0 }, 92.8), round2(3.33 * 92.8));
});

// ---------------------------------------------------------------------------
// calculateLinePrice
// ---------------------------------------------------------------------------
test('line price = unit price * quantity', () => {
  assert.equal(calculateLinePrice(base, 92.8, 3), round2((10 * 92.8 + 100 + 50 + 25) * 3));
});

test('line price rounds to 2 dp', () => {
  assert.equal(calculateLinePrice({ net_weight: 3.33 }, 92.8, 2), round2(round2(3.33 * 92.8) * 2));
});

// ---------------------------------------------------------------------------
// calculateTax
// ---------------------------------------------------------------------------
test('tax = taxable * gst_rate / 100', () => {
  assert.equal(calculateTax(1000, 18), 180);
  assert.equal(calculateTax(1000, 0), 0);
  assert.equal(calculateTax(1000, null), 0);
  assert.equal(calculateTax(1000, undefined), 0);
  assert.equal(calculateTax(1000, '18'), 180);
});

// ---------------------------------------------------------------------------
// calculateFinalPrice (tax-inclusive)
// ---------------------------------------------------------------------------
test('final price without GST = unit price', () => {
  // base has no gst_rate, so tax is zero and final equals the unit price.
  assert.equal(calculateFinalPrice(base, 92.8), calculateUnitPrice(base, 92.8));
});

test('final price with GST', () => {
  const unit = 10 * 92.8 + 100 + 50 + 25; // 1103
  assert.equal(calculateFinalPrice({ ...base, gst_rate: 18 }, 92.8), 1103 + round2(1103 * 0.18));
});

// ---------------------------------------------------------------------------
// isSilverRateValid
// ---------------------------------------------------------------------------
test('isSilverRateValid', () => {
  assert.equal(isSilverRateValid(92.8), true);
  assert.equal(isSilverRateValid(0), false);
  assert.equal(isSilverRateValid(-5), false);
  assert.equal(isSilverRateValid(NaN), false);
  assert.equal(isSilverRateValid(Infinity), false);
  assert.equal(isSilverRateValid(null), false);
  assert.equal(isSilverRateValid(undefined), false);
});

// ---------------------------------------------------------------------------
// getCurrentSilverRate — no fabricated/fallback rate
// ---------------------------------------------------------------------------
function clientWith(rate: any) {
  return {
    query: async () => ({ rows: rate === undefined ? [] : [{ rate_per_gram: rate }] }),
  };
}

test('returns a valid configured rate', async () => {
  assert.equal(await getCurrentSilverRate(clientWith(92.8)), 92.8);
});

test('accepts string rates converted to number', async () => {
  assert.equal(await getCurrentSilverRate(clientWith('92.8')), 92.8);
});

test('returns null when no rate rows exist', async () => {
  assert.equal(await getCurrentSilverRate(clientWith(undefined)), null);
});

test('returns null (never a fabricated rate) for missing/invalid values', async () => {
  for (const bad of [null, undefined, '', 0, -1, NaN, Infinity]) {
    assert.equal(await getCurrentSilverRate(clientWith(bad)), null, `rate=${String(bad)} must not fabricate a rate`);
  }
});

test('never returns the deprecated 92.8 fallback implicitly', async () => {
  // The engine only returns what is actually configured; absence is null.
  assert.equal(await getCurrentSilverRate(clientWith(undefined)), null);
  assert.equal(await getCurrentSilverRate(clientWith(null)), null);
});
