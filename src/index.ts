#!/usr/bin/env node
import * as cheerio from "cheerio";
import * as debug from "debug";
import * as request from "request";
import { resolve as urlResolve } from "url";
import { Element, IKeyInfo, IOpts, IParselet, ISelectorInfo, ParseletItem, ParseletValue } from "./types";
const log = debug("parsz");

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

function parseDataKeyInfo(key: string): IKeyInfo {
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
  log("Parsing local data with", { selector, attr });
  const item = getItemScope(el, selector);
  const data = attr ? item.attr(attr) : item.text();
  log(`Parsed local data -> ${data}`);
  if (fn) {
    const transformations = opts.transformations || { trim: (s: string) => s.trim() };
    const transformed = evalExpr(fn, transformations)(data);
    log(`Transforming data to "${transformed}"`);
    return transformed;
  }
  return data;
}

function parseLocalDataListItem(el: Element, itemMap: ParseletItem, opts: IOpts): {} {
  // Handle simple case
  if (typeof itemMap === "string") {
    return parseLocalData(el, itemMap, opts);
  }
  // Handle another mapping object
  return Object.keys(itemMap).map((itemKey: string) => {
    const { name, scope } = parseDataKeyInfo(itemKey);
    const map = itemMap[itemKey];
    const data = Array.isArray(map)
      ? parseLocalDataList(el, scope, map[0], opts)
      : parseLocalDataListItem(el, map, opts);
    return [name, data];
  }).reduce((memo: { [k: string]: any }, [name, data]: [string, any]) => {
    memo[name] = data;
    return memo;
  }, {});
}

function parseLocalDataList(el: Element, selector: string, map: ParseletItem, opts: IOpts): string[] {
  log(`Parsing data list of selector (${selector || "n/a"})`);
  const items = getItemScope(el, selector);
  log(`Items: ${items.length}`);
  return items.map((index: number, item: CheerioElement) =>
    parseLocalDataListItem(el(item) as Element, map, opts)).get();
}

function parseData(el: Element, key: string, map: ParseletValue, opts: IOpts): {} {
  const { name, scope } = parseDataKeyInfo(key);
  if (Array.isArray(map)) {
    log(`Parsing list "${name}"...`);
    return parseLocalDataList(el, scope, map[0], opts);
  }
  log(`Parsing "${name}"...`);
  return parseLocalDataListItem(el, map, {});
}

export function mapToData(html: string, map: IParselet, opts: IOpts = {}): { [k: string]: any } {
  const scope = cheerio.load(html) as Element;
  const results = Object.keys(map).map((key: string) => parseData(scope, key, map[key], opts));
  // TODO: I think we need iterative here....
  return Object.keys(map).reduce((memo: { [k: string]: any }, key: string, index: number) => {
    const { name } = parseDataKeyInfo(key);
    memo[name] = results[index];
    return memo;
  }, {});
}

// fetchy parts

const getHtml = (url: string): Promise<string> => new Promise((resolve, reject) => {
  request(url, (err, res: request.RequestResponse, html: string) => {
    if (!err && res.statusCode === 200) {
      resolve(html);
    } else {
      reject(err || new Error(`URL returned a status of ${res.statusCode}`));
    }
  });
});

export function parse(parselet: IParselet, url: string, opts: IOpts = {}): Promise<{ [k: string]: any }> {
  log(`Requesting ${url}`);
  return getHtml(url).then((html: string) => mapToData(html, parselet, opts));
}
