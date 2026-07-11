import { z } from "zod";

export const InventoryInputSchema = z.object({
  productId: z.string().min(1),
  skuId: z.string().min(1).optional(),
  onHand: z.number().int().nonnegative(),
  dailySales: z.array(z.number().nonnegative()).default([]),
  supplierAvailable: z.number().int().nonnegative().optional(),
  replenishmentLeadDays: z.number().int().positive().default(7),
  safetyDays: z.number().int().positive().default(10),
  seasonalMultiplier: z.number().positive().default(1)
});
export type InventoryInput = z.infer<typeof InventoryInputSchema>;

export interface InventoryForecast {
  productId: string;
  skuId?: string;
  velocity: number;
  daysRemaining: number;
  reorderQuantity: number;
  alert?: {
    type: "low_stock" | "slow_moving" | "supplier_shortage";
    severity: "low" | "medium" | "high";
    message: string;
  };
}

export class InventoryPlanner {
  public forecast(input: InventoryInput): InventoryForecast {
    const parsed = InventoryInputSchema.parse(input);
    const velocity =
      movingAverage(parsed.dailySales) * parsed.seasonalMultiplier;
    const daysRemaining =
      velocity > 0 ? parsed.onHand / Math.max(velocity, 0.01) : Infinity;
    const targetStock =
      (parsed.replenishmentLeadDays + parsed.safetyDays) *
      Math.max(velocity, 1);
    const reorderQuantity = Math.max(0, Math.ceil(targetStock - parsed.onHand));
    const alert = createAlert(parsed, daysRemaining, reorderQuantity, velocity);

    return {
      productId: parsed.productId,
      skuId: parsed.skuId,
      velocity: round(velocity),
      daysRemaining: Number.isFinite(daysRemaining)
        ? round(daysRemaining)
        : 999,
      reorderQuantity,
      alert
    };
  }
}

function createAlert(
  input: InventoryInput,
  daysRemaining: number,
  reorderQuantity: number,
  velocity: number
): InventoryForecast["alert"] {
  if (
    input.supplierAvailable !== undefined &&
    input.supplierAvailable < reorderQuantity
  ) {
    return {
      type: "supplier_shortage",
      severity: "high",
      message: "Supplier stock cannot cover recommended replenishment."
    };
  }

  if (daysRemaining <= input.safetyDays) {
    return {
      type: "low_stock",
      severity: daysRemaining <= 3 ? "high" : "medium",
      message: "Inventory is projected to fall below safety stock."
    };
  }

  if (velocity === 0 && input.onHand > 0) {
    return {
      type: "slow_moving",
      severity: "medium",
      message: "No recent sales; consider markdown or content refresh."
    };
  }

  return undefined;
}

function movingAverage(values: number[]): number {
  if (values.length === 0) return 0;
  const recent = values.slice(-14);
  return recent.reduce((total, value) => total + value, 0) / recent.length;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
