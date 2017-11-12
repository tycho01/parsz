import * as cheerio from "cheerio";
import * as R from "ramda";
import { IKeyInfo, IOptions, IOpts, IParselet, ISelectorInfo, ParseletItem, ParseletValue, Scope } from "./types";

const keyPattern = /^([\w-]+)(\?)?\(?([^)~]*)\)?~?\(?([^)]*)\)?$/;
const selectorPattern = /^([.-\s\w[\]=>]+)?@?([\w-]+)?\s*\|?\s*(.*)?$/;
const IDENTITY_SELECTOR = ".";
const VOID_NAME = "--";

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
    isVoid: name.trim() === VOID_NAME,
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
function parseValue({ $, transforms, isOptional, parselet }: IOpts<string>): {} {
  const { selector, attr, fn } = parseSelector(parselet);
  const item = getItemScope($, selector);
  const data = attr ? item.attr(attr) : item.text().trim();
  if (!data && !isOptional) {
    // tslint:disable-next-line:no-console
    console.error({ selector, attr, fn, data });
  }
  return data && fn ? evalExpr(fn, transforms || R)(data) : data;
}

// handle a parselet item: string or object
const parseItem = (opts: IOpts<ParseletItem>): {} =>
    R.ifElse<IOpts<any>, {}, {}>(R.propIs(String, "parselet"), parseValue, parseObject)(opts);

// handle a parselet object
const parseObject = (opts: IOpts<IParselet>): {} => R.pipe(
  R.toPairs,
  R.chain<"1", "list">()(([k, map]: [string, ParseletValue]) => {
    const { name, selector: sel, isOptional, isVoid } = parseKey(k);
    const opt: IOpts<ParseletValue> = R.merge(opts, { parselet: map, isOptional: isOptional || opts.isOptional });
    if (isVoid && R.is(Object, map)) {
      return R.pipe(
        R.evolve({ $: ($: Scope) => getItemScope($, sel) }) as R.Morphism<IOpts<ParseletItem>, IOpts<IParselet>>,
        parseObject, R.toPairs,
      )(opt as IOpts<IParselet>);
    }
    const data = R.is(Array, map) ?
        parseList(sel, opt) :
        parseItem(opt as IOpts<ParseletItem>);
    return [[name, data]] as Array<[string, any]>;
  }) as (r: Array<[string, any]>) => Array<[string, any]>,
  R.fromPairs,
)(opts.parselet);

// handle a parselet list, i.e. parse each selected Cheerio node
function parseList(sel: string, opts: IOpts<ParseletValue>): any[] {
  const opt = R.evolve({ parselet: R.prop(0) }, opts) as IOpts<ParseletItem>;
  const { $ } = opt;
  return getItemScope($, sel).map((i: number, el: CheerioElement) => parseItem(
    R.assoc("$",
      ($ as Cheerio).find ? cheerio.load(el) : ($ as CheerioSelector)(el),
    opt),
  )).get() as Array<{}>;
}

// handle a parselet object
export const partsley = (html: string, parselet: IParselet, opts:
    Partial<IOptions<IParselet>> = {}): { [k: string]: any } =>
    R.pipe(
      R.merge({ parselet, $: cheerio.load(html) }),
      parseObject,
    )(opts);
