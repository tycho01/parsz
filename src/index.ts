#!/usr/bin/env node
import * as cheerio from "cheerio";
import { Element, IKeyInfo, IOpts, IParselet, ISelectorInfo, ParseletItem, ParseletValue } from "./types";

const keyPattern = /(\w+)\(?([^)~]*)\)?~?\(?([^)]*)\)?/;
const selectorPattern = /^([.-\s\w[\]=]+)?@?(\w+)?\|?(\w+)?/;
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

function parseSelectorInfo(str: string): ISelectorInfo {
  const [, selector, attr, fn] = getMatch(str, selectorPattern);
  return { attr, fn, selector };
}

const getItemScope = (el: Element, selector: string): Cheerio =>
    (!selector || selector === IDENTITY_SELECTOR) ? el :
    el.find ? el.find(selector) :
    el(selector);

function parseLocalData(el: Element, smartSelector: string, opts: IOpts): {} {
  const { selector, attr, fn } = parseSelectorInfo(smartSelector);
  const item = getItemScope(el, selector);
  const data = attr ? item.attr(attr) : item.text();
  if (fn) {
    const transformations = opts.transformations || { trim: (s: string) => s.trim() };
    const transformed = evalExpr(fn, transformations)(data);
    return transformed;
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

const parseList = (el: Element, sel: string, map: ParseletItem, opts: IOpts): string[] => getItemScope(el, sel)
    .map((index: number, item: CheerioElement) => parseItem(el(item) as Element, map, opts)).get();

const parseData = (el: Element, key: string, map: ParseletValue, opts: IOpts): {} =>
    Array.isArray(map) ? parseList(el, parseKey(key).scope, map[0], opts) : parseItem(el, map, {});

export function parsz(html: string, map: IParselet, opts: IOpts = {}): { [k: string]: any } {
  const scope = cheerio.load(html) as Element;
  return Object.keys(map).reduce((memo: {}, key: string, index: number) =>
      Object.assign(memo, { [parseKey(key).name]: parseData(scope, key, map[key], opts) }), {});
}
