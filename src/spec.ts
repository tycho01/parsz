import { equal } from "assert";
import * as fs from "fs";
import "mocha";
import { partsley } from ".";

const files: { [k: string]: string } = {
  carol: "carol_profile",
  tacorea: "tacorea",
  test: "index",
  yelp: "yelp",
};

const pages: { [k: string]: string } = Object.keys(files).reduce((acc: {}, k: string) => Object.assign(acc, {
  [k]: fs.readFileSync(__dirname + `/../test/${files[k]}.html`, "UTF-8"),
}), {});

const tacoPlacesInSanFrancsico = {
  "places(.regular-search-result)": [{
    address: "address",
    name: ".biz-name",
    phone: ".biz-phone",
    rating: ".biz-rating img@alt|parseFloat",
  }],
};

describe("Parsley", () => {
  it("should parse plain selectors", () => {
    const data = partsley(pages.test, {
      title: "h1",
    });
    equal(data.title, "Hello World!");
  });
  it("should parse list of elements", () => {
    const data = partsley(pages.test, {
      "links(ul a)": [{
        href: "@href",
        name: ".",
      }],
    });
    equal(data.links.length, 3);
    equal(data.links[0].name, "A");
    equal(data.links[0].href, "/a");
  });
  it("should parse attributes", () => {
    const data = partsley(pages.test, {
      published: "[itemprop=date-published]@content",
    });
    equal(data.published, "01/01/2015");
  });
  it("should parse array as object prop value", () => {
    const data = partsley(pages.test, {
      "images(img)": ["@src"],
    });
    equal(data.images[0], "a.png");
    equal(data.images[1], "b.jpg");
  });

  it("should parse yelp reviews", () => {
    const data = partsley(pages.yelp, tacoPlacesInSanFrancsico);
    equal(data.places
      .filter((place: { rating: number, name: string, phone: string }) => place.rating > 4)
      .length, 4);
    equal(data.places[0].rating, 4.5);
    equal(data.places[0].name, "Tacorea");
    equal(data.places[0].phone, "(415) 885-1325");
  });

  it("should parse simple remote data", () => {
    const url = "http://www.yelp.com/carol";
    const mapping = {
      "lastReviewedPlace~(.reviews li:first-child a)": {
        name: "h1",
      },
      "name": "h1",
    };
    const data = partsley(pages.carol, mapping, {
      context: "http://www.yelp.com/",
    });
    equal(data.name, "Carol L.");
    // equal(data.lastReviewedPlace.name, "Tacorea"); // deep
  });

  xit("should parse deep remote data", () => {
    const mapping = {
      "places(.regular-search-result)": [{
        "name": ".biz-name",
        "reviews(.review)~(.search-result-title a)": [{
          content: ".review-content p",
          name: ".user-display-name",
        }],
      }],
    };
    const data = partsley(pages.yelp, mapping, {
      context: "http://www.yelp.com/",
    });
    equal(data.places.length, 10);
    equal(data.places[0].name, "Tacorea");
    equal(data.places[0].reviews.length, 21);
    equal(data.places[0].reviews[1].name, "Carol L.");
    equal(data.places[0].reviews[1].content.startsWith("This place does Korean"), true);
  });
});
