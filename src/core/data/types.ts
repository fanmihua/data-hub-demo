/**
 * Data Hub 的数据配置结构。默认值在 public/config/data.json，
 * 可在「风格与数据」面板里替换。全部为演示数据，金额单位：人民币元。
 */
export type DomainStatus = 'ready' | 'planned';

export interface Domain {
  id: string;
  name: string;
  english: string;
  desc: string;
  categories: string[];
  status: DomainStatus;
}

export interface Asset {
  id: string;
  domain: string;
  category: string;
  name: string;
  desc: string;
  owner: string;
  source: string;
  tags: string[];
  updated: string;
  code: string;
}

export interface MonthlyAmount {
  /** YYYY-MM */
  month: string;
  amount: number;
}

export interface Model {
  /** 型号编号，例如 HX-01 */
  id: string;
  dept: string;
  target: number;
  revenue: number;
  received: number;
  monthlyRevenue: MonthlyAmount[];
}

export interface Contract {
  id: string;
  name: string;
  unit: string;
  amount: number;
  /** YYYY-MM-DD */
  signed: string;
}

export interface Payment {
  id: string;
  date: string;
  amount: number;
  account: string;
}

export interface Bill {
  id: string;
  date: string;
  model: string;
  system: string;
  component: string;
  dept: string;
  scope: string;
  contractId: string | null;
  unit: string;
  summary: string;
  subject: string;
  voucher: string;
  amount: number;
  payments: Payment[];
}

export interface DataMeta {
  title: string;
  org: string;
  /** ISO 时间，数据截至 */
  asOf: string;
  fiscalYear: number;
  currency: string;
  note: string;
}

export interface DataHubData {
  meta: DataMeta;
  domains: Domain[];
  assets: Asset[];
  models: Model[];
  contracts: Contract[];
  bills: Bill[];
}
