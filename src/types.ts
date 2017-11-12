export type ParseletItem = string | IParselet;
export type ParseletValue = ParseletItem | ParseletItem[];
export interface IParselet {
  [k: string]: ParseletValue;
}

export interface IKeyInfo {
  name: string;
  selector: string;
  linkSelector: string;
  isRemote: boolean;
  isOptional: boolean;
}

export interface IOpts<T> extends IOptions<T> {
  $: Scope;
}
export interface IOptions<T> {
  parselet: T;
  $?: Scope;
  context?: string;
  transforms?: {};
  isOptional?: boolean;
}

export interface ISelectorInfo {
  selector: string;
  attr: string;
  fn: string;
}

export type Scope = Cheerio | CheerioSelector;
