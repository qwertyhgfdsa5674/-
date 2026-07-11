import {
  EventCalendarEntrySchema,
  type EventCalendarEntry
} from "./schemas.js";

export interface EventSignal {
  event: EventCalendarEntry;
  daysUntilStart: number;
  weightBoost: number;
}

export class EventCalendar {
  private readonly entries: EventCalendarEntry[];

  public constructor(entries: EventCalendarEntry[] = defaultCalendarEntries()) {
    this.entries = entries.map((entry) =>
      EventCalendarEntrySchema.parse(entry)
    );
  }

  public list(): EventCalendarEntry[] {
    return [...this.entries].sort(
      (left, right) => left.startsAt.getTime() - right.startsAt.getTime()
    );
  }

  public upcoming(date = new Date(), category?: string): EventSignal[] {
    return this.entries
      .filter((event) => matchesCategory(event, category))
      .map((event) => ({
        event,
        daysUntilStart: daysBetween(date, event.startsAt),
        weightBoost: calculateBoost(event, date)
      }))
      .filter(
        (signal) =>
          signal.daysUntilStart >= 0 &&
          signal.daysUntilStart <= signal.event.leadDays
      )
      .sort((left, right) => right.weightBoost - left.weightBoost);
  }

  public categoryBoost(category: string, date = new Date()): number {
    return this.upcoming(date, category).reduce(
      (boost, signal) => Math.max(boost, signal.weightBoost),
      0
    );
  }
}

export function defaultCalendarEntries(
  year = new Date().getFullYear()
): EventCalendarEntry[] {
  return [
    entry(
      "new-year-goods",
      "New Year Goods Festival",
      "promotion",
      `${year}-01-05`,
      `${year}-01-25`,
      ["gifts", "food", "home"],
      70
    ),
    entry(
      "womens-day",
      "Women's Day",
      "holiday",
      `${year}-03-01`,
      `${year}-03-08`,
      ["beauty", "fashion", "gifts"],
      60
    ),
    entry(
      "618",
      "618 Mid-year Sale",
      "platform",
      `${year}-06-01`,
      `${year}-06-20`,
      ["all"],
      95
    ),
    entry(
      "summer-season",
      "Summer Seasonal Demand",
      "seasonal",
      `${year}-05-15`,
      `${year}-08-15`,
      ["summer", "outdoor", "home"],
      75
    ),
    entry(
      "back-to-school",
      "Back To School",
      "seasonal",
      `${year}-08-01`,
      `${year}-09-10`,
      ["education", "dorm", "stationery"],
      80
    ),
    entry(
      "double-11",
      "Double 11",
      "platform",
      `${year}-10-20`,
      `${year}-11-12`,
      ["all"],
      100
    ),
    entry(
      "double-12",
      "Double 12",
      "platform",
      `${year}-12-01`,
      `${year}-12-12`,
      ["all"],
      85
    ),
    entry(
      "winter-season",
      "Winter Seasonal Demand",
      "seasonal",
      `${year}-10-15`,
      `${year}-12-31`,
      ["winter", "home", "apparel"],
      75
    )
  ];
}

function entry(
  id: string,
  name: string,
  eventType: EventCalendarEntry["eventType"],
  startsAt: string,
  endsAt: string,
  affectedCategories: string[],
  priority: number
): EventCalendarEntry {
  return EventCalendarEntrySchema.parse({
    id,
    name,
    eventType,
    startsAt,
    endsAt,
    affectedCategories,
    priority,
    leadDays: eventType === "platform" ? 30 : 21
  });
}

function calculateBoost(event: EventCalendarEntry, date: Date): number {
  const daysUntilStart = daysBetween(date, event.startsAt);
  const leadRatio = 1 - daysUntilStart / Math.max(event.leadDays, 1);
  return Math.round(event.priority * Math.max(0.25, leadRatio));
}

function matchesCategory(
  event: EventCalendarEntry,
  category?: string
): boolean {
  if (!category) return true;
  return (
    event.affectedCategories.includes("all") ||
    event.affectedCategories.includes(category)
  );
}

function daysBetween(left: Date, right: Date): number {
  return Math.ceil((right.getTime() - left.getTime()) / (1000 * 60 * 60 * 24));
}
