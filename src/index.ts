import * as cheerio from "cheerio";
import * as R from "ramda";
import { Element, IKeyInfo, IOpts, IParselet, ISelectorInfo, ParseletItem, ParseletValue } from "./types";

const keyPattern = /^([\w-]+)(\?)?\(?([^)~]*)\)?~?\(?([^)]*)\)?$/;
const selectorPattern = /^([.-\s\w[\]=>]+)?@?([\w-]+)?\s*\|?\s*(.*)?$/;
const IDENTITY_SELECTOR = ".";

const mapPairs = (fn: ([k, v]: [string, any]) => [string, any]) =>
    R.pipe(R.toPairs, R.map(fn) as (r: Array<[string, any]>) => Array<[string, any]>, R.fromPairs);

const checkOptional = (isOptional: boolean, opts: IOpts) => isOptional ? R.merge(opts, { isOptional }) : opts;

// http://2ality.com/2012/04/eval-variables.html
const evalExpr = (expr: string, o: {}): any => Function
  .apply(null, [...R.keys(o), `return ${expr}`])
  .apply(null, R.values(o));

function getMatch(selector: string, pattern: RegExp): string[] {
  const matched = selector.match(pattern);
  if (!matched) {
    throw new Error(`Could not match pattern: ${selector}`);
  }
  return matched;
}

function parseKey(key: string): IKeyInfo {
  const [, name, optional, scope, linkSelector] = getMatch(key, keyPattern);
  return { isRemote: !!linkSelector, isOptional: !!optional, linkSelector, name, scope };
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

function parseValue(el: Element, sel: string, opts: IOpts): {} {
  const { selector, attr, fn } = parseSelector(sel);
  const { transforms, isOptional } = opts;
  const item = getItemScope(el, selector);
  const data = attr ? item.attr(attr) : item.text().trim();
  if (!data && !isOptional) {
    // tslint:disable-next-line:no-console
    console.error({ sel, selector, attr, fn, data });
  }
  return data && fn ? evalExpr(fn, transforms || R)(data) : data;
}

const parseItem = (el: Element, item: ParseletItem, opts: IOpts): {} =>
    typeof item === "string" ? parseValue(el, item, opts) :
    parseObject(el, item, opts);

const parseObject = (el: Element, item: IParselet, opts: IOpts): {} =>
    mapPairs(([k, v]: [string, ParseletValue]) => {
      const { name, scope, isOptional } = parseKey(k);
      const opt = checkOptional(isOptional, opts);
      const data = parseData(el, k, v, opt);
      return [name, data];
    })(item);

const parseList = (el: Element, sel: string, map: ParseletItem, opts: IOpts): any[] =>
    getItemScope(el, sel).map((i: number, item: CheerioElement) => parseItem(
      (el as Cheerio).find ? cheerio.load(item) : (el as CheerioSelector)(item),
    map, opts)).get() as Array<{}>;

function parseData(el: Element, k: string, map: ParseletValue, opts: IOpts): {} {
  const { scope, isOptional } = parseKey(k);
  const opt = checkOptional(isOptional, opts);
  return R.is(Array, map) ?
    parseList(el, scope, map[0], opt) :
    parseItem(el, map, opt);
}

export const partsley = (html: string, plet: IParselet, opts: IOpts = {}): { [k: string]: any } =>
    parseObject(cheerio.load(html), plet, opts);
