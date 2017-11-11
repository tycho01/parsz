export type ParseletItem = string | IParselet;
export type ParseletValue = ParseletItem | ParseletItem[];
export interface IParselet {
  [k: string]: ParseletValue;
}

export interface IKeyInfo {
  name: string;
  scope: string;
  linkSelector: string;
  isRemote: boolean;
}

export interface IOpts {
  context?: string;
  transforms?: {};
}

export interface ISelectorInfo {
  selector: string;
  attr: string;
  fn: string;
}
