import { beforeEach, describe, expect, it } from 'vitest';
import { BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js';
import { Currency, SalePaymentMethod } from '@store-mgmt/domain';
import { DataSerializerService, EDataFileName } from '../data-serializer-service';
import { ChannelRateOfflineService } from '~/management/channel-rates/lib/services/channel-rate-offline-service';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { InventoryOfflineService } from '~/inventory/lib/services/inventory-offline-service';
import { OrderOfflineService } from '~/sales/lib/services/order-offline-service';
import { ExpenseOfflineService } from '~/expenses/lib/services/expense-offline-service';
import { SaleCreditOfflineService } from '~/sales/lib/services/sale-credit-offline-service';
import { WarehouseOfflineService } from '~/inventory/lib/services/warehouse-offline-service';

const STORE_ID = 'store-channel-rates';
const PASSWORD = 'hunter2-correct-horse';
/** Retired with the daily register (retire-exchange-rates-register): no longer in `EDataFileName`. */
const RETIRED_EXCHANGE_RATES_ENTRY = 'exchange-rates.json';

/** Builds a v1 archive (no meta.json) with the given entries, writer-level password. */
async function buildLegacyV1Zip(
  payloads: Record<string, string>,
  derivedPassword: string,
): Promise<Uint8Array> {
  const zipWriter = new ZipWriter(new BlobWriter('application/zip'), {
    password: derivedPassword,
  });
  for (const [name, text] of Object.entries(payloads)) {
    await zipWriter.add(name, new TextReader(text));
  }
  const blob = await zipWriter.close();
  return new Uint8Array(await blob.arrayBuffer());
}

function makeSerializerWithRealServices() {
  const categoryRepo = new ProductCategoryRepository(STORE_ID);
  const productRepo = new ProductRepository(STORE_ID, categoryRepo);
  const inventorySvc = new InventoryOfflineService(STORE_ID, productRepo);
  const channelRateSvc = new ChannelRateOfflineService(STORE_ID);
  const serializer = new DataSerializerService(
    STORE_ID,
    categoryRepo,
    productRepo,
    inventorySvc,
    new OrderOfflineService(STORE_ID),
    new ExpenseOfflineService(STORE_ID),
    new SaleCreditOfflineService(STORE_ID),
    new WarehouseOfflineService(STORE_ID, productRepo, inventorySvc),
    channelRateSvc,
  );
  return { serializer, channelRateSvc };
}

describe('DataSerializerService — channelRates entry (multipayments T4)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('export writes channel-rates.json and import parses the rows back', async () => {
    const { serializer, channelRateSvc } = makeSerializerWithRealServices();
    channelRateSvc.registerRate({
      method: SalePaymentMethod.Efectivo,
      currency: Currency.CUP,
      buyValue: 700,
      sellValue: 700,
      effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
    });
    channelRateSvc.registerRate({
      method: SalePaymentMethod.Zelle,
      currency: Currency.USD,
      buyValue: 1,
      sellValue: 1,
      effectiveFrom: new Date('2026-09-10T00:00:00.000Z'),
    });

    const payload = await serializer.export(PASSWORD);
    const parsed = await serializer.import(payload, PASSWORD);

    expect(parsed.channelRates).toHaveLength(2);
    expect(parsed.channelRates[0].method).toBe(SalePaymentMethod.Efectivo);
    expect(parsed.channelRates[0].currency).toBe(Currency.CUP);
    expect(parsed.channelRates[0].buyValue).toBe(700);
    expect(parsed.channelRates[1].buyValue).toBe(1);
  });

  it('preserves the isActive flag across export → import (T19b)', async () => {
    const { serializer, channelRateSvc } = makeSerializerWithRealServices();
    const registered = channelRateSvc.registerRate({
      method: SalePaymentMethod.Efectivo,
      currency: Currency.CUP,
      buyValue: 700,
      sellValue: 700,
      effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
    });
    channelRateSvc.setChannelRateActive(registered.data!.id!, false);

    const payload = await serializer.export(PASSWORD);
    const parsed = await serializer.import(payload, PASSWORD);

    expect(parsed.channelRates).toHaveLength(1);
    expect(parsed.channelRates[0].isActive).toBe(false);
  });

  it('an export with no channel rates still carries an empty channel-rates.json entry', async () => {
    const { serializer } = makeSerializerWithRealServices();

    const payload = await serializer.export(PASSWORD);
    const parsed = await serializer.import(payload, PASSWORD);

    expect(parsed.channelRates).toEqual([]);
  });

  it('a legacy archive WITHOUT channel-rates.json imports with an empty register (backwards compatible)', async () => {
    // Archives exported before multipayments carry the previous entry set —
    // the new entry simply does not exist there.
    const legacyPayload = await buildLegacyV1Zip(
      {
        [EDataFileName.Categories]: JSON.stringify([]),
        [EDataFileName.Products]: JSON.stringify([]),
        [EDataFileName.InventoryEntries]: JSON.stringify([]),
        [EDataFileName.Orders]: JSON.stringify([]),
        [EDataFileName.Expenses]: JSON.stringify([]),
        [EDataFileName.SaleCredits]: JSON.stringify([]),
        [RETIRED_EXCHANGE_RATES_ENTRY]: JSON.stringify([]),
        [EDataFileName.Warehouses]: JSON.stringify([]),
        [EDataFileName.WarehouseStockLevels]: JSON.stringify([]),
        [EDataFileName.WarehouseStockMovements]: JSON.stringify([]),
      },
      PASSWORD + STORE_ID,
    );

    const { serializer } = makeSerializerWithRealServices();
    const parsed = await serializer.import(legacyPayload, PASSWORD);

    expect(parsed.channelRates).toEqual([]);
  });

  it('an archive from BEFORE the retirement still carrying exchange-rates.json imports and IGNORES it (retire-exchange-rates-register)', async () => {
    // The daily register is retired, but backups taken before the retirement
    // are still out there with a populated entry. An unknown-but-present entry
    // must not be an error: the serializer simply never looks it up.
    const oldPayload = await buildLegacyV1Zip(
      {
        [EDataFileName.Categories]: JSON.stringify([]),
        [EDataFileName.Products]: JSON.stringify([]),
        [EDataFileName.InventoryEntries]: JSON.stringify([]),
        [EDataFileName.Orders]: JSON.stringify([]),
        [EDataFileName.Expenses]: JSON.stringify([]),
        [EDataFileName.SaleCredits]: JSON.stringify([]),
        [RETIRED_EXCHANGE_RATES_ENTRY]: JSON.stringify([
          { id: '2026-09-01', date: '2026-09-01T00:00:00.000Z', value: 400 },
        ]),
        [EDataFileName.ChannelRates]: JSON.stringify([]),
      },
      PASSWORD + STORE_ID,
    );

    const { serializer } = makeSerializerWithRealServices();

    await expect(serializer.import(oldPayload, PASSWORD)).resolves.toMatchObject({
      channelRates: [],
    });
    const parsed = await serializer.import(oldPayload, PASSWORD);
    expect(parsed.exchangeRates).toBeUndefined();
  });
});
