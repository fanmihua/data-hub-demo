/** 金额、百分比与日期的统一格式。金额输入一律为「元」。 */

const zh = (digits: number) => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: digits, minimumFractionDigits: 0 });

/** 元 → 万元数字文本，例如 8040000 → "804" */
export const wan = (yuan: number, digits = 1) => zh(digits).format(yuan / 10000);

/** 元 → "804 万元" */
export const wanLabel = (yuan: number, digits = 1) => `${wan(yuan, digits)} 万元`;

/** 元 → 自动单位：≥1 亿用亿，否则万 */
export const money = (yuan: number) => (Math.abs(yuan) >= 1e8 ? { value: zh(2).format(yuan / 1e8), unit: '亿元' } : { value: wan(yuan), unit: '万元' });

/** 0.772 → "77.2%" */
export const pct = (ratio: number, digits = 1) => `${(ratio * 100).toFixed(digits)}%`;

/** 0.772 → "77.2" */
export const pctNumber = (ratio: number, digits = 1) => (ratio * 100).toFixed(digits);

/** "2026-06" → "6 月" */
export const monthLabel = (month: string) => `${Number(month.slice(5, 7))} 月`;

/** "2026-06" → "6月"（紧凑，用于坐标轴） */
export const monthShort = (month: string) => `${Number(month.slice(5, 7))}月`;

/** "2026-07-15" → "7月15日" */
export const dayLabel = (date: string) => `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`;

/** ISO → "2026-11-04 09:00"（按北京时间显示） */
export const dateTimeLabel = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const parts = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
};

/** 整数千分位：1234 → "1,234" */
export const int = (n: number) => zh(0).format(n);
