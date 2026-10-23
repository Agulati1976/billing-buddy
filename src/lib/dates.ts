/** Calendar dates for this Indian billing business, independent of UTC/device zone. */
export function businessDate(value: Date | string | number = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(value));
}
