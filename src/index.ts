#!/usr/bin/env node
import * as cheerio from "cheerio";
import { Element, IKeyInfo, IOpts, IParselet, ISelectorInfo, ParseletItem, ParseletValue } from "./types";

const keyPattern = /(\w+)\(?([^)~]*)\)?~?\(?([^)]*)\)?/;
const selectorPattern = /^([.-\s\w[\]=>]+)?@?([\w-]+)?\s*\|?\s*(.*)?/;
const IDENTITY_SELECTOR = ".";

// http://2ality.com/2012/04/eval-variables.html
const evalExpr = (expr: string, vars: { [k: string]: any }): any => Function
  .apply(null, [...Object.keys(vars), `return ${expr}`])
  .apply(null, Object.values(vars));

function getMatch(selector: string, pattern: RegExp): string[] {
  const matched = selector.match(pattern);
  if (!matched) {
    throw new Error(`Could not match pattern: ${selector}`);
  }
  return matched;
}

function parseKey(key: string): IKeyInfo {
  const [, name, scope, linkSelector] = getMatch(key, keyPattern);
  return { isRemote: !!linkSelector, linkSelector, name, scope };
}

function parseSelector(str: string): ISelectorInfo {
  const [, selector, attr, fn] = getMatch(str, selectorPattern);
  return { attr, fn, selector };
}

const getItemScope = (el: Element, sel: string): Cheerio =>
    (!sel || sel.trim() === IDENTITY_SELECTOR) ?
    (el as Cheerio).find ? (el as Cheerio) :
        (el as CheerioSelector)({}) :
    (el as Cheerio).find ? (el as Cheerio).find(sel) :
        (el as CheerioSelector)(sel);

function parseLocalData(el: Element, smartSelector: string, opts: IOpts): {} {
  const { selector, attr, fn } = parseSelector(smartSelector);
  const item = getItemScope(el, selector);
  const data = attr ? item.attr(attr) : item.text().trim();
  if (data && fn) {
    const { transforms } = opts;
    return evalExpr(fn, transforms || {})(data);
  }
  return data;
}

const parseItem = (el: Element, itemMap: ParseletItem, opts: IOpts): {} =>
    typeof itemMap === "string" ? parseLocalData(el, itemMap, opts) :
    Object.keys(itemMap).map((k) => {
      const { name, scope } = parseKey(k);
      const map = itemMap[k];
      const data = Array.isArray(map) ? parseList(el, scope, map[0], opts) : parseItem(el, map, opts);
      return [name, data] as [string, any];
    }).reduce((memo: {}, [name, data]: [string, any]) => Object.assign(memo, { [name]: data }), {});

const parseList = (el: Element, sel: string, map: ParseletItem, opts: IOpts): any[] =>
    getItemScope(el, sel).map((index: number, item: CheerioElement) => parseItem(
      (el as Cheerio).find ? cheerio.load(item) : (el as CheerioSelector)(item),
    map, opts)).get() as Array<{}>;

const parseData = (el: CheerioStatic, key: string, map: ParseletValue, opts: IOpts): {} =>
    Array.isArray(map) ? parseList(el, parseKey(key).scope, map[0], opts) : parseItem(el, map, opts);

export function partsley(html: string, map: IParselet, opts: IOpts = {}): { [k: string]: any } {
  const scope = cheerio.load(html);
  return Object.keys(map).reduce((memo: {}, key: string, index: number) =>
      Object.assign(memo, { [parseKey(key).name]: parseData(scope, key, map[key], opts) }), {});
}
