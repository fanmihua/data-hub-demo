import type { DataHubData } from './types';

/**
 * 校验用户在配置面板里粘贴的数据。返回中文错误列表；空数组表示可以使用。
 * 只检查页面渲染依赖的字段，不做业务口径校验（那部分见 scripts/check-data.ts）。
 */
export function validateData(input: unknown): string[] {
  const errors: string[] = [];
  const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
  const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  const isStr = (v: unknown) => typeof v === 'string';

  if (!isObj(input)) return ['最外层必须是一个 JSON 对象。'];
  const d = input as Record<string, unknown>;

  if (!isObj(d.meta)) errors.push('缺少 meta（标题、截至时间等）。');
  else {
    if (!isStr(d.meta.title)) errors.push('meta.title 必须是文字。');
    if (!isStr(d.meta.asOf) || Number.isNaN(Date.parse(d.meta.asOf as string))) errors.push('meta.asOf 必须是有效的时间，例如 2026-11-04T09:00:00+08:00。');
  }

  const list = (key: string) => {
    const v = d[key];
    if (!Array.isArray(v)) { errors.push(`${key} 必须是数组。`); return [] as Record<string, unknown>[]; }
    return v as Record<string, unknown>[];
  };

  list('domains').forEach((x, i) => {
    if (!isStr(x.id) || !isStr(x.name)) errors.push(`domains[${i}] 需要 id 和 name。`);
    if (x.status !== 'ready' && x.status !== 'planned') errors.push(`domains[${i}].status 只能是 ready 或 planned。`);
  });
  const domainIds = new Set((d.domains as Record<string, unknown>[] | undefined)?.map(x => x.id) ?? []);
  list('assets').forEach((x, i) => {
    if (!isStr(x.id) || !isStr(x.name)) errors.push(`assets[${i}] 需要 id 和 name。`);
    if (!domainIds.has(x.domain)) errors.push(`assets[${i}].domain「${String(x.domain)}」不在 domains 里。`);
  });
  const models = list('models');
  if (models.length === 0) errors.push('models 至少要有一个型号。');
  models.forEach((x, i) => {
    if (!isStr(x.id)) errors.push(`models[${i}] 需要 id。`);
    for (const k of ['target', 'revenue', 'received']) if (!isNum(x[k])) errors.push(`models[${i}].${k} 必须是数字（元）。`);
    if (!Array.isArray(x.monthlyRevenue)) errors.push(`models[${i}].monthlyRevenue 必须是数组。`);
    else (x.monthlyRevenue as Record<string, unknown>[]).forEach((m, j) => {
      if (!isStr(m.month) || !/^\d{4}-\d{2}$/.test(m.month as string)) errors.push(`models[${i}].monthlyRevenue[${j}].month 格式应为 YYYY-MM。`);
      if (!isNum(m.amount)) errors.push(`models[${i}].monthlyRevenue[${j}].amount 必须是数字。`);
    });
  });
  const contractIds = new Set<unknown>();
  list('contracts').forEach((x, i) => {
    if (!isStr(x.id) || !isStr(x.name)) errors.push(`contracts[${i}] 需要 id 和 name。`);
    if (!isNum(x.amount)) errors.push(`contracts[${i}].amount 必须是数字。`);
    contractIds.add(x.id);
  });
  list('bills').forEach((x, i) => {
    if (!isStr(x.id) || !isStr(x.date)) errors.push(`bills[${i}] 需要 id 和 date。`);
    if (!isNum(x.amount)) errors.push(`bills[${i}].amount 必须是数字。`);
    if (x.contractId !== null && !contractIds.has(x.contractId)) errors.push(`bills[${i}].contractId「${String(x.contractId)}」不在 contracts 里（没有合同时填 null）。`);
    if (!Array.isArray(x.payments)) errors.push(`bills[${i}].payments 必须是数组（没有付款时填 []）。`);
    for (const k of ['model', 'system', 'dept']) if (!isStr(x[k])) errors.push(`bills[${i}].${k} 必须是文字。`);
  });
  return errors.slice(0, 12);
}

export function isDataHubData(input: unknown): input is DataHubData {
  return validateData(input).length === 0;
}
