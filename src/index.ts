import * as cheerio from "cheerio";
import * as R from "ramda";
import { IKeyInfo, IOpts, IParselet, ISelectorInfo, Opts, ParseletItem, ParseletValue, Scope } from "./types";

const keyPattern = /^([\w-]+)(\?)?\(?([^)~]*)\)?~?\(?([^)]*)\)?$/;
const selectorPattern = /^([.-\s\w[\]=>]+)?@?([\w-]+)?\s*\|?\s*(.*)?$/;
const IDENTITY_SELECTOR = ".";

const mapPairs = (fn: ([k, v]: [string, any]) => [string, any]) =>
    R.pipe(R.toPairs, R.map(fn) as (r: Array<[string, any]>) => Array<[string, any]>, R.fromPairs);

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

// parse a key string
function parseKey(key: string): IKeyInfo {
  const [, name, optional, selector, linkSelector] = getMatch(key, keyPattern);
  return {
    isOptional: !!optional,
    isRemote: !!linkSelector,
    linkSelector, name, selector,
  };
}

// parse a value string
function parseSelector(str: string): ISelectorInfo {
  const [, selector, attr, fn] = getMatch(str, selectorPattern);
  return { attr, fn, selector };
}

// get the Cheerio scope for a selector
const getItemScope = ($: Scope, sel: string): Cheerio =>
    (!sel || sel.trim() === IDENTITY_SELECTOR) ?
      ($ as Cheerio).find ? ($ as Cheerio) :
        ($ as CheerioSelector)({}) :
      ($ as Cheerio).find ? ($ as Cheerio).find(sel) :
        ($ as CheerioSelector)(sel);

// handle a parselet leaf (string)
function parseValue(sel: string, { $, transforms, isOptional }: IOpts): {} {
  const { selector, attr, fn } = parseSelector(sel);
  const item = getItemScope($, selector);
  const data = attr ? item.attr(attr) : item.text().trim();
  if (!data && !isOptional) {
    // tslint:disable-next-line:no-console
    console.error({ sel, selector, attr, fn, data });
  }
  return data && fn ? evalExpr(fn, transforms || R)(data) : data;
}

// handle a parselet item: string or object
const parseItem = (item: ParseletItem, opts: IOpts): {} =>
    typeof item === "string" ?
        parseValue(item, opts) :
        parseObject(opts)(item);

// handle a parselet object
const parseObject = (opts: IOpts) =>
    mapPairs(([k, map]: [string, ParseletValue]) => {
      const { name, selector: sel, isOptional } = parseKey(k);
      const opt = isOptional ? R.merge(opts, { isOptional }) : opts;
      const data = R.is(Array, map) ?
          parseList(sel, map[0], opt) :
          parseItem(map, opt);
      return [name, data];
    });

// handle a parselet list, i.e. parse each selected Cheerio node
function parseList(sel: string, item: ParseletItem, opts: IOpts): any[] {
  const { $ } = opts;
  return getItemScope($, sel).map((i: number, el: CheerioElement) => parseItem(item,
    R.assoc("$", ($ as Cheerio).find ? cheerio.load(el) : ($ as CheerioSelector)(el), opts),
  )).get() as Array<{}>;
}

// handle a parselet object
export const partsley = (html: string, plet: IParselet, opts: Opts = {}): { [k: string]: any } =>
    parseObject(R.assoc("$", cheerio.load(html), opts))(plet);
