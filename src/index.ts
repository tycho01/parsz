#!/usr/bin/env node

import * as cheerio from "cheerio";
import * as program from "commander";
import * as debug from "debug";
import * as request from "request";
import { parse as urlParse, resolve as urlResolve } from "url";

const log = debug("parsz");

export interface IPair {
  key: string;
  data: any;
}

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

export interface IOptions {
  context?: string;
}

export interface ISelectorInfo {
  selector: string;
  attr: string;
  fn: string;
}

export type Element = CheerioStatic & Cheerio;

const keyPattern = /(\w+)\(?([^)~]*)\)?~?\(?([^)]*)\)?/;
const selectorPattern = /^([.-\s\w[\]=]+)?@?(\w+)?\|?(\w+)?/;
const IDENTITY_SELECTOR = ".";

const transformations: { [k: string]: (v: any) => any } = {
  floor: Math.floor,
  identity: (value) => value,
  max: Math.max,
  parseFloat,
  parseInt,
  trim: (s: string) => s.trim(),
};

const getHtml = (url: string): Promise<string> => new Promise((resolve, reject) => {
  request(url, (err, res: request.RequestResponse, html: string) => {
    if (!err && res.statusCode === 200) {
      resolve(html);
    } else {
      reject(err || new Error(`URL returned a status of ${res.statusCode}`));
    }
  });
});

function parseDataKeyInfo(key: string): IKeyInfo {
  const matched = key.match(keyPattern);
  if (!matched) {
    throw new Error(`Could not match key pattern`);
  }
  const [, name, scope, linkSelector] = matched;
  const isRemote = !!linkSelector;
  return {
    isRemote,
    linkSelector,
    name,
    scope,
  };
}

function parseSelectorInfo(smartSelector: string): ISelectorInfo {
  const matched = smartSelector.match(selectorPattern);
  if (!matched) {
    throw new Error(`Could not match selector pattern: ${smartSelector}`);
  }
  const [, selector, attr, fn] = matched;
  return {
    attr,
    fn,
    selector,
  };
}

function getItemScope(scope: Element, selector: string): Cheerio {
  if (!selector || selector === IDENTITY_SELECTOR) {
    return scope;
  }
  return scope.find ? scope.find(selector) : scope(selector);
}

function getScopeResolver(currentScope: Element, keyInfo: IKeyInfo, options: IOptions): Promise<Element> {
  return keyInfo.isRemote
    ? new Promise((resolve) => {
      log("Parsing remote data...", keyInfo);
      const linkScope = getItemScope(currentScope, keyInfo.linkSelector);
      const path = linkScope.attr("href");
      const url = urlResolve(options.context || "", path);
      log(`Requesting ${url}`);
      return getHtml(url)
        .then((html: string) => resolve(cheerio.load(html) as Element));
    })
    : Promise.resolve(currentScope);
}

function parseLocalData(scope: Element, smartSelector: string): Promise<{}> {
  const { selector, attr, fn } = parseSelectorInfo(smartSelector);
  log("Parsing local data with", { selector, attr });
  const item = getItemScope(scope, selector);
  const data = attr ? item.attr(attr) : item.text();
  log(`Parsed local data -> ${data}`);
  if (fn) {
    const transformed = transformations[fn](data);
    log(`Transforming data to "${transformed}"`);
    return Promise.resolve(transformed);
  }
  return Promise.resolve(data);
}

function parseLocalDataListItem(item: Element, itemMap: ParseletItem, options: IOptions): Promise<{}> {
  // Handle simple case
  if (typeof itemMap === "string") {
    return parseLocalData(item, itemMap);
  }
  // Handle another mapping object
  const itemPropertyResolvers = Object.keys(itemMap).map((itemKey: string) => {
    const keyInfo = parseDataKeyInfo(itemKey);
    const map = itemMap[itemKey];
    return getScopeResolver(item, keyInfo, options)
      .then((scope: Element) => {
        const dataResolver = Array.isArray(map)
        // eslint-disable-next-line no-use-before-define
          ? parseLocalDataList(scope, keyInfo.scope, map[0], options)
          : parseLocalDataListItem(scope, map, options);
        return dataResolver;
      })
      .then((data: {}) => {
        const namedData: IPair = {
          data,
          key: keyInfo.name,
        };
        return namedData;
      });
  });
  return Promise.all(itemPropertyResolvers).then((pairs: IPair[]) => {
    const resolvedItem = pairs.reduce((memo: { [k: string]: any }, pair: IPair) => {
      memo[pair.key] = pair.data;
      return memo;
    }, {});
    return resolvedItem;
  });
}

function parseLocalDataList(scope: Element, itemSelector: string, itemMap: ParseletItem,
                            options: IOptions): Promise<string[]> {
  log(`Parsing data list of selector (${itemSelector || "n/a"})`);
  const items = getItemScope(scope, itemSelector);
  log(`Items: ${items.length}`);
  return Promise.all(items.map((index: number, item: CheerioElement) => {
    const itemParser = parseLocalDataListItem(scope(item) as Element, itemMap, options);
    return itemParser;
  }).get());
}

function parseData(currentScope: Element, key: string, map: ParseletValue, options: IOptions): Promise<{}> {
  const keyInfo = parseDataKeyInfo(key);
  return getScopeResolver(currentScope, keyInfo, options)
    .then((scope: Element) => {
      if (Array.isArray(map)) {
        log(`Parsing list "${keyInfo.name}"...`);
        const itemMap = map[0];
        const itemSelector = keyInfo.scope;
        return parseLocalDataList(scope, itemSelector, itemMap, options);
      }
      log(`Parsing "${keyInfo.name}"...`);
      return parseLocalDataListItem(scope, map, {});
    });
}

function mapToData(html: string, map: IParselet, options: IOptions): Promise<{ [k: string]: any }> {
  const scope = cheerio.load(html) as Element;
  const dataPoints = Object.keys(map).map((key: string) => {
    const dataParser = parseData(scope, key, map[key], options);
    return dataParser;
  });
  // TODO: I think we need iterative here....
  return Promise.all(dataPoints).then((results) => {
    const data = Object.keys(map).reduce((memo: { [k: string]: any }, key: string, index: number) => {
      const keyInfo = parseDataKeyInfo(key);
      memo[keyInfo.name] = results[index];
      return memo;
    }, {});
    return data;
  });
}

export function parsz(parselet: IParselet, url: string, options: IOptions = {}): Promise<{ [k: string]: any }> {
  log(`Requesting ${url}`);
  return getHtml(url).then((html: string) => mapToData(html, parselet, options));
}

if (require.main === module) {
  program
    .version("0.0.1")
    .option("-v, --verbose", "Verbose mode")
    .option("-u, --url <path>", "URL to parse")
    .option("-p, --parselet <path>", "Path to parselet")
    .parse(process.argv);

  if (!program.parselet || !program.url) {
    // tslint:disable-next-line:no-console
    console.log("Please use --help");
    process.exit();
  }

  const parsedUrl = urlParse(program.url);
  // tslint:disable-next-line:no-var-requires
  parsz(require(program.parselet), program.url, {
    context: `${parsedUrl.protocol}//${parsedUrl.host}`,
  })
  // tslint:disable-next-line:no-console
  .then((data) => console.log(JSON.stringify(data, null, "\t")))
  .catch(console.error);
}
