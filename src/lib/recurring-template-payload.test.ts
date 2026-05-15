import { describe, expect, it } from 'vitest';
import {
  buildCreatePayload,
  buildUpdatePayload,
  cadenceFields,
  type RecurringTemplateFormValues,
} from './recurring-template-payload';

const USER_ID = '00000000-0000-0000-0000-000000000001';

function values(
  overrides: Partial<RecurringTemplateFormValues> = {},
): RecurringTemplateFormValues {
  return {
    title:            'Stock check',
    description:      'Daily check of pantry stock',
    branch:           'salt',
    category:         'operations',
    priority:         'normal',
    assignment:       'me',
    recurrence:       'daily',
    recurrence_time:  '09:00:00',
    recurrence_dow:   [],
    recurrence_dom:   '',
    recurrence_month: '',
    ...overrides,
  };
}

describe('cadenceFields', () => {
  it('daily → no cadence-specific keys', () => {
    expect(cadenceFields('daily', { recurrence_dow: [1, 2], recurrence_dom: 15, recurrence_month: 6 }))
      .toEqual({});
  });

  it('weekly → recurrence_dow only', () => {
    expect(cadenceFields('weekly', { recurrence_dow: [1, 3, 5], recurrence_dom: 15, recurrence_month: 6 }))
      .toEqual({ recurrence_dow: [1, 3, 5] });
  });

  it('weekly with null dow → empty array (not null)', () => {
    expect(cadenceFields('weekly', { recurrence_dow: null, recurrence_dom: null, recurrence_month: null }))
      .toEqual({ recurrence_dow: [] });
  });

  it('monthly → recurrence_dom only, parsed as number', () => {
    expect(cadenceFields('monthly', { recurrence_dow: [1], recurrence_dom: '15', recurrence_month: 6 }))
      .toEqual({ recurrence_dom: 15 });
  });

  it('monthly with empty dom → omits the key (RPC leaves column alone)', () => {
    expect(cadenceFields('monthly', { recurrence_dow: [1], recurrence_dom: '', recurrence_month: 6 }))
      .toEqual({});
  });

  it('yearly → recurrence_dom + recurrence_month, both parsed as numbers', () => {
    expect(cadenceFields('yearly', { recurrence_dow: [1], recurrence_dom: '4', recurrence_month: '12' }))
      .toEqual({ recurrence_dom: 4, recurrence_month: 12 });
  });

  it('yearly with only month set → recurrence_month included, dom omitted', () => {
    expect(cadenceFields('yearly', { recurrence_dow: [], recurrence_dom: '', recurrence_month: '3' }))
      .toEqual({ recurrence_month: 3 });
  });
});

describe('buildUpdatePayload', () => {
  it('daily update has NO recurrence_dow / dom / month keys', () => {
    const payload = buildUpdatePayload(values({ recurrence: 'daily' }), USER_ID);
    expect(payload).not.toHaveProperty('recurrence_dow');
    expect(payload).not.toHaveProperty('recurrence_dom');
    expect(payload).not.toHaveProperty('recurrence_month');
    expect(payload.recurrence).toBe('daily');
    expect(payload.recurrence_time).toBe('09:00:00');
  });

  it('weekly update sends recurrence_dow only (no dom/month keys)', () => {
    const payload = buildUpdatePayload(
      values({ recurrence: 'weekly', recurrence_dow: [1, 3] }),
      USER_ID,
    );
    expect(payload.recurrence_dow).toEqual([1, 3]);
    expect(payload).not.toHaveProperty('recurrence_dom');
    expect(payload).not.toHaveProperty('recurrence_month');
  });

  it('monthly update sends recurrence_dom only (no dow/month keys)', () => {
    const payload = buildUpdatePayload(
      values({ recurrence: 'monthly', recurrence_dom: '15' }),
      USER_ID,
    );
    expect(payload.recurrence_dom).toBe(15);
    expect(payload).not.toHaveProperty('recurrence_dow');
    expect(payload).not.toHaveProperty('recurrence_month');
  });

  it('yearly update sends recurrence_dom + recurrence_month (no dow key)', () => {
    const payload = buildUpdatePayload(
      values({ recurrence: 'yearly', recurrence_dom: '4', recurrence_month: '12' }),
      USER_ID,
    );
    expect(payload.recurrence_dom).toBe(4);
    expect(payload.recurrence_month).toBe(12);
    expect(payload).not.toHaveProperty('recurrence_dow');
  });

  it('"unassigned" sends assigned_to=null; "me" sends the user id', () => {
    expect(buildUpdatePayload(values({ assignment: 'unassigned' }), USER_ID).assigned_to)
      .toBeNull();
    expect(buildUpdatePayload(values({ assignment: 'me' }), USER_ID).assigned_to)
      .toBe(USER_ID);
    expect(buildUpdatePayload(values({ assignment: 'me' }), null).assigned_to)
      .toBeNull();
  });

  it('empty description coerces to null (not "")', () => {
    expect(buildUpdatePayload(values({ description: '' }), USER_ID).description)
      .toBeNull();
    expect(buildUpdatePayload(values({ description: null }), USER_ID).description)
      .toBeNull();
    expect(buildUpdatePayload(values({ description: 'has body' }), USER_ID).description)
      .toBe('has body');
  });

  it('always includes the always-applicable keys', () => {
    const payload = buildUpdatePayload(values(), USER_ID);
    expect(Object.keys(payload).sort()).toEqual(
      [
        'assigned_to',
        'branch',
        'category',
        'description',
        'priority',
        'recurrence',
        'recurrence_time',
        'title',
      ].sort(),
    );
  });
});

describe('buildCreatePayload', () => {
  it('always includes all three recurrence_* keys (explicit nulls allowed at create time)', () => {
    const payload = buildCreatePayload(values({ recurrence: 'daily' }), USER_ID);
    expect(payload).toHaveProperty('recurrence_dow');
    expect(payload.recurrence_dow).toBeNull();
    expect(payload).toHaveProperty('recurrence_dom');
    expect(payload.recurrence_dom).toBeNull();
    expect(payload).toHaveProperty('recurrence_month');
    expect(payload.recurrence_month).toBeNull();
  });

  it('weekly create populates recurrence_dow with the selected ints', () => {
    const payload = buildCreatePayload(
      values({ recurrence: 'weekly', recurrence_dow: [2, 4] }),
      USER_ID,
    );
    expect(payload.recurrence_dow).toEqual([2, 4]);
    expect(payload.recurrence_dom).toBeNull();
    expect(payload.recurrence_month).toBeNull();
  });

  it('yearly create populates both dom + month as numbers', () => {
    const payload = buildCreatePayload(
      values({ recurrence: 'yearly', recurrence_dom: '4', recurrence_month: '12' }),
      USER_ID,
    );
    expect(payload.recurrence_dom).toBe(4);
    expect(payload.recurrence_month).toBe(12);
    expect(payload.recurrence_dow).toBeNull();
  });
});
