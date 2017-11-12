#!/usr/bin/env node
import * as cheerio from "cheerio";
import * as R from "ramda";
import { Element, IKeyInfo, IOpts, IParselet, ISelectorInfo, ParseletItem, ParseletValue } from "./types";

const keyPattern = /^([\w-]+)(\?)?\(?([^)~]*)\)?~?\(?([^)]*)\)?$/;
const selectorPattern = /^([.-\s\w[\]=>]+)?@?([\w-]+)?\s*\|?\s*(.*)?$/;
const IDENTITY_SELECTOR = ".";

const mapPairs = (fn: ([k, v]: [string, any]) => [string, any]) =>
    R.pipe(R.toPairs, R.map(fn), R.fromPairs);

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
  const [, name, questionMark, scope, linkSelector] = getMatch(key, keyPattern);
  return { isRemote: !!linkSelector, isOptional: !!questionMark, linkSelector, name, scope };
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
    return evalExpr(fn, transforms || R)(data);
  }
  return data;
}

const parseItem = (el: Element, item: ParseletItem, opts: IOpts): {} =>
    typeof item === "string" ? parseLocalData(el, item, opts) :
    mapPairs(([k, v]: [string, ParseletValue]) => {
      const { name, scope } = parseKey(k);
      const data = R.is(Array, v) ?
          parseList(el, scope, v[0], opts) :
          parseItem(el, v, opts);
      return [name, data];
    })(item);

const parseList = (el: Element, sel: string, map: ParseletItem, opts: IOpts): any[] =>
    getItemScope(el, sel).map((i: number, item: CheerioElement) => parseItem(
      (el as Cheerio).find ? cheerio.load(item) : (el as CheerioSelector)(item),
    map, opts)).get() as Array<{}>;

const parseData = (el: CheerioStatic, k: string, map: ParseletValue, opts: IOpts): {} =>
    R.is(Array, map) ?
        parseList(el, parseKey(k).scope, map[0], opts) :
        parseItem(el, map, opts);

export const partsley = (html: string, plet: IParselet, opts: IOpts = {}): { [k: string]: any } =>
    mapPairs(([k, v]: [string, ParseletValue]) => [
      parseKey(k).name,
      parseData(cheerio.load(html), k, v, opts),
    ])(plet);
