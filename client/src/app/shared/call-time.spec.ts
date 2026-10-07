import { localCallInput, localCallTime } from './call-time';

describe('call time zones', () => {
  it('interprets local time in the chosen zone independently of the browser', () => {
    const epoch = Date.parse('2030-01-02T11:30:00Z') / 1000;
    expect(localCallTime('2030-01-02T14:30', 'Europe/Moscow')).toBe(epoch);
    expect(localCallInput(epoch, 'Europe/Moscow')).toBe('2030-01-02T14:30');
    expect(localCallTime('2030-01-02T17:00', 'Asia/Kolkata')).toBe(epoch);
  });
  it('rejects missing values and nonexistent times during daylight saving transitions', () => {
    expect(() => localCallTime('', 'UTC')).toThrow();
    expect(() => localCallTime('2030-03-10T02:30', 'America/New_York')).toThrow();
  });
  it('handles dates on both sides of daylight saving changes', () => {
    for (const local of ['2030-03-10T01:30', '2030-03-10T03:30', '2030-11-03T03:00']) {
      expect(localCallInput(localCallTime(local, 'America/New_York'), 'America/New_York')).toBe(
        local,
      );
    }
  });
});
