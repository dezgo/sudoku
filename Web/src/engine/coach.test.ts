// Port of iOS `CoachModeTests.swift`: every scenario must fire its target
// technique under the global findHint, guarding against engine-ordering
// regressions that would silently break a scenario.

import { describe, it, expect } from 'vitest';
import { ALL_SCENARIOS, expectedHint, isValid, validScenarios } from './coach';

describe('CoachMode', () => {
  it('everyScenarioIsValid', () => {
    const failures = ALL_SCENARIOS.filter((s) => !isValid(s)).map(
      (s) => `${s.technique}: got ${expectedHint(s)?.technique ?? 'nil'}`,
    );
    expect(failures).toEqual([]);
    expect(validScenarios()).toHaveLength(ALL_SCENARIOS.length);
  });

  it('shipsAtLeastSevenScenarios', () => {
    expect(ALL_SCENARIOS.length).toBeGreaterThanOrEqual(7);
  });

  it('ids match techniques and every intro is filled in', () => {
    for (const s of ALL_SCENARIOS) {
      expect(s.id).toBe(s.technique);
      expect(s.intro.length).toBeGreaterThan(0);
    }
  });
});
