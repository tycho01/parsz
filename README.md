# partsley
### - A tool for parsing the web

[![NPM Version](https://img.shields.io/npm/v/partsley.svg)](https://www.npmjs.com/package/partsley)

## Usage

Install from npm/yarn

``` bash
$ npm install partsley
```

Use a "parselet" as a recipe/filter to parse a website.

Parselets are just plain JS objects, so can be serialized using e.g. YAML or JSON. Examples here are shown in YAML for brevity.

Here is an example of a parselet for grabbing business data from a Yelp page:

```yaml
name: h1
phone: .biz-phone
address: address
reviews(.review):
- date: meta[itemprop=datePublished] @content
  name: .user-name a
  comment: .review-content p
```

## As a module

You can also use partsley as a module:

```ts
import { partsley } from 'parsz';

const opts = {};
const data = partsley(html, parselet, opts);
```

## Tips

This is a very general purpose and flexible tool. But here are some tips for getting started.

### Grabbing a list of data

Use a reference selector in the key and an Array as the value.

```yaml
users(.user):
- name: .name
  age: .age
```

### Use transformation functions on data

Add a pipe (|) and the transformation name after the data selector.

```yaml
user:
  name: .name
  age: .age|parseInt
  worth: .age|parseFloat
  someNumber: .age|Math.floor
```

By default functions in scope include any standard library functions. However, you're encouraged to bring your own functions into scope. You may consider e.g. curried libs like [Ramda](http://ramdajs.com/) or [Lodash FP](https://github.com/lodash/lodash/wiki/FP-Guide), such as to expose transforms like `toLower` and `split(',')`:

```ts
import { partsley } from 'parsz';
import * as R from 'ramda';

const opts = {
  transforms: R,
};
const data = partsley(html, parselet, opts);
```

### Grabbing an attribute

Use a (@) symbol to reference an attribute.

```yaml
user:
  name: .name
  nickname: .name@data-nickname
```

Have fun!

### Related projects

- [parsley](https://github.com/fizx/parsley) (C)
- [parslepy](https://github.com/redapple/parslepy/) (Python)
- [parsz](https://github.com/dijs/parsz) (JavaScript) - forked from this
