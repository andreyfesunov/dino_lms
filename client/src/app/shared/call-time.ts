// datetime-local values are interpreted in the explicitly selected IANA zone.
export function localCallTime(value: string, zone: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('invalid time');
  const target = Date.parse(value + ':00Z');
  if (!Number.isFinite(target)) throw new Error('invalid time');
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  let epoch = target;
  for (let i = 0; i < 4; i++) {
    const parts = Object.fromEntries(formatter.formatToParts(epoch).map((p) => [p.type, p.value]));
    const represented = Date.parse(
      `${parts['year']}-${parts['month']}-${parts['day']}T${parts['hour']}:${parts['minute']}:${parts['second']}Z`,
    );
    const delta = target - represented;
    if (delta === 0) return epoch / 1000;
    epoch += delta;
  }
  // A time inside a DST gap does not exist and must not silently shift.
  throw new Error('invalid time');
}

export function localCallInput(epoch: number, zone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('sv-SE', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(epoch * 1000)
      .map((p) => [p.type, p.value]),
  );
  return `${parts['year']}-${parts['month']}-${parts['day']}T${parts['hour']}:${parts['minute']}`;
}
