import type {
  Agency,
  Inspection,
  Operation,
  RateConfig,
  InvoiceLineItem,
  DefaultLineItem,
} from '@dios/shared';

/**
 * Resolves the rate configuration for a given agency and operation type.
 * If per-type rates are enabled and the operation type has custom rates,
 * those rates are returned; otherwise the agency's top-level rates apply.
 */
export function resolveRates(agency: Agency, operationType: string): RateConfig {
  if (agency.perTypeRatesEnabled && operationType) {
    try {
      const ratesByType: Record<string, RateConfig> = JSON.parse(agency.ratesByType);
      if (ratesByType[operationType]) {
        return ratesByType[operationType];
      }
    } catch {
      // Fall through to default rates if JSON is invalid
    }
  }

  return {
    isFlatRate: agency.isFlatRate,
    flatRateAmount: agency.flatRateAmount,
    flatRateIncludedHours: agency.flatRateIncludedHours,
    flatRateOverageRate: agency.flatRateOverageRate,
    hourlyRate: agency.hourlyRate,
    driveTimeHourlyRate: agency.driveTimeHourlyRate,
    mileageReimbursed: agency.mileageReimbursed,
    mileageRate: agency.mileageRate,
    perDiemRate: agency.perDiemRate,
  };
}

/**
 * Rounds a duration in minutes up to the nearest half-hour increment.
 * e.g. 45 minutes -> 1.0 hours, 20 minutes -> 0.5 hours
 */
export function roundToNearestHalfHour(minutes: number): number {
  return Math.ceil(minutes / 30) * 0.5;
}

/**
 * Builds an itemized list of invoice line items from inspection data,
 * agency rate configuration, and linked expenses.
 */
export function calculateInvoiceLineItems(
  inspection: Inspection,
  agency: Agency,
  operation: Operation,
  linkedExpenseTotal: number
): { lineItems: InvoiceLineItem[]; total: number } {
  const rates = resolveRates(agency, operation.operationType);
  const lineItems: InvoiceLineItem[] = [];

  const totalHours = inspection.prepHours + inspection.onsiteHours + inspection.reportHours;

  // 1. Inspection fee
  if (rates.isFlatRate) {
    lineItems.push({
      name: 'Inspection Fee',
      amount: rates.flatRateAmount,
      details: `Up to ${rates.flatRateIncludedHours} hrs included`,
    });
  } else {
    lineItems.push({
      name: 'Inspection Fee',
      amount: totalHours * rates.hourlyRate,
      details: `${totalHours} hrs @ $${rates.hourlyRate}/hr`,
    });
  }

  // 2. Additional hours (flat rate only, when hours exceed included amount)
  if (rates.isFlatRate && totalHours > rates.flatRateIncludedHours) {
    const overage = totalHours - rates.flatRateIncludedHours;
    lineItems.push({
      name: 'Additional Hours',
      amount: overage * rates.flatRateOverageRate,
      details: `${overage} hrs @ $${rates.flatRateOverageRate}/hr`,
    });
  }

  // 3. Drive time
  if (inspection.calculatedDriveTime > 0 && rates.driveTimeHourlyRate > 0) {
    let driveHours = roundToNearestHalfHour(inspection.calculatedDriveTime / 60);
    if (inspection.isBundled && inspection.totalTripStops && inspection.totalTripStops > 0) {
      driveHours = driveHours / inspection.totalTripStops;
    }
    lineItems.push({
      name: 'Drive Time',
      amount: driveHours * rates.driveTimeHourlyRate,
      details: `${driveHours} hrs @ $${rates.driveTimeHourlyRate}/hr`,
    });
  }

  // 4. Mileage reimbursement
  if (rates.mileageReimbursed && inspection.calculatedMileage > 0) {
    let miles = inspection.calculatedMileage;
    if (inspection.isBundled && inspection.totalTripStops && inspection.totalTripStops > 0) {
      miles = miles / inspection.totalTripStops;
    }
    lineItems.push({
      name: 'Mileage',
      amount: miles * rates.mileageRate,
      details: `${miles.toFixed(1)} mi @ $${rates.mileageRate}/mi`,
    });
  }

  // 5. Per diem
  if (inspection.perDiemDays && inspection.perDiemDays > 0 && rates.perDiemRate > 0) {
    lineItems.push({
      name: 'Per Diem',
      amount: inspection.perDiemDays * rates.perDiemRate,
      details: `${inspection.perDiemDays} day(s) @ $${rates.perDiemRate}/day`,
    });
  }

  // 6. Meals & expenses
  if (inspection.mealsAndExpenses && inspection.mealsAndExpenses > 0) {
    lineItems.push({
      name: 'Meals & Expenses',
      amount: inspection.mealsAndExpenses,
    });
  }

  // 7. Agency default line items
  if (agency.defaultLineItems) {
    try {
      const defaults: DefaultLineItem[] = JSON.parse(agency.defaultLineItems);
      for (const item of defaults) {
        if (item.name && item.amount > 0) {
          lineItems.push({
            name: item.name,
            amount: item.amount,
          });
        }
      }
    } catch {
      // Skip if JSON is invalid
    }
  }

  // 8. Linked expenses
  if (linkedExpenseTotal > 0) {
    lineItems.push({
      name: 'Linked Expenses',
      amount: linkedExpenseTotal,
    });
  }

  // 9. Custom line item
  if (inspection.customLineItemName && inspection.customLineItemAmount && inspection.customLineItemAmount > 0) {
    lineItems.push({
      name: inspection.customLineItemName,
      amount: inspection.customLineItemAmount,
    });
  }

  const total = lineItems.reduce((sum, item) => sum + item.amount, 0);

  return { lineItems, total };
}
