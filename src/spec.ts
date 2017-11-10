import * as fs from "fs";
import "mocha";
import * as nock from "nock";
import "should";
import { parsz } from ".";

nock("http://www.test.com")
  .get("/")
  .times(4)
  .reply(200, fs.readFileSync(__dirname + "/../test/index.html", "UTF-8"));

nock("http://www.yelp.com")
  .get("/")
  .times(2)
  .reply(200, fs.readFileSync(__dirname + "/../test/yelp.html", "UTF-8"))
  .get("/carol")
  .times(1)
  .reply(200, fs.readFileSync(__dirname + "/../test/carol_profile.html", "UTF-8"))
  .get("/biz/tacorea-san-francisco")
  .times(1)
  .reply(200, fs.readFileSync(__dirname + "/../test/tacorea.html", "UTF-8"))
  .get("/biz/tacorea-san-francisco?osq=tacos")
  .times(1)
  .reply(200, fs.readFileSync(__dirname + "/../test/tacorea.html", "UTF-8"))
  .get("/biz/el-farolito-san-francisco-2?osq=tacos")
  .times(1)
  .reply(200, fs.readFileSync(__dirname + "/../test/tacorea.html", "UTF-8"))
  .get("/biz/street-taco-san-francisco?osq=tacos")
  .times(1)
  .reply(200, fs.readFileSync(__dirname + "/../test/tacorea.html", "UTF-8"))
  .get("/biz/the-taco-shop-at-underdogs-san-francisco-2?osq=tacos")
  .times(1)
  .reply(200, fs.readFileSync(__dirname + "/../test/tacorea.html", "UTF-8"))
  .get("/biz/la-taqueria-san-francisco-2?osq=tacos")
  .times(1)
  .reply(200, fs.readFileSync(__dirname + "/../test/tacorea.html", "UTF-8"))
  .get("/biz/el-rinc%C3%B3n-yucateco-san-francisco-3?osq=tacos")
  .times(1)
  .reply(200, fs.readFileSync(__dirname + "/../test/tacorea.html", "UTF-8"))
  .get("/biz/taqueria-guadalajara-san-francisco?osq=tacos")
  .times(1)
  .reply(200, fs.readFileSync(__dirname + "/../test/tacorea.html", "UTF-8"))
  .get("/biz/garaje-san-francisco?osq=tacos")
  .times(1)
  .reply(200, fs.readFileSync(__dirname + "/../test/tacorea.html", "UTF-8"))
  .get("/biz/nicks-crispy-tacos-san-francisco-2?osq=tacos")
  .times(1)
  .reply(200, fs.readFileSync(__dirname + "/../test/tacorea.html", "UTF-8"))
  .get("/biz/taqueria-canc%C3%BAn-san-francisco-5?osq=tacos")
  .times(1)
  .reply(200, fs.readFileSync(__dirname + "/../test/tacorea.html", "UTF-8"));

const tacoPlacesInSanFrancsico = {
  "places(.regular-search-result)": [{
    address: "address|trim",
    name: ".biz-name",
    phone: ".biz-phone|trim",
    rating: ".biz-rating img@alt|parseFloat",
  }],
};

describe("Parsley", () => {
  it("should parse plain selectors", (done) => {
    parsz(
      {
        title: "h1",
      },
      "http://www.test.com",
    ).then((data) => {
      data.title.should.equal("Hello World!");
      done();
    }).catch(console.log);
  });
  it("should parse list of elements", (done) => {
    parsz(
      {
        "links(ul a)": [{
          href: "@href",
          name: ".",
        }],
      },
      "http://www.test.com",
    ).then((data) => {
      data.links.length.should.equal(3);
      data.links[0].name.should.equal("A");
      data.links[0].href.should.equal("/a");
      done();
    });
  });
  it("should parse attributes", (done) => {
    parsz(
      {
        published: "[itemprop=date-published]@content",
      },
      "http://www.test.com",
    ).then((data) => {
      data.published.should.equal("01/01/2015");
      done();
    });
  });
  it("should parse array as object prop value", (done) => {
    parsz(
      {
         "images(img)": ["@src"],
      },
      "http://www.test.com",
    ).then((data) => {
      data.images[0].should.equal("a.png");
      data.images[1].should.equal("b.jpg");
      done();
    });
  });

  it("should parse yelp reviews", (done) => {
    parsz(
      tacoPlacesInSanFrancsico,
      "http://www.yelp.com",
    ).then((data) => {
      data.places
        .filter((place: { rating: number, name: string, phone: string }) => place.rating > 4)
        .length.should.equal(4);
      data.places[0].rating.should.equal(4.5);
      data.places[0].name.should.equal("Tacorea");
      data.places[0].phone.should.equal("(415) 885-1325");
      done();
    });
  });

  it("should parse simple remote data", (done) => {
    const url = "http://www.yelp.com/carol";
    const mapping = {
      "lastReviewedPlace~(.reviews li:first-child a)": {
        name: "h1|trim",
      },
      "name": "h1|trim",
    };
    parsz(mapping, url, {
      context: "http://www.yelp.com/",
    })
      .then((data) => {
        data.name.should.equal("Carol L.");
        data.lastReviewedPlace.name.should.equal("Tacorea");
        done();
      });
  });

  it("should parse deep remote data", (done) => {
    const url = "http://www.yelp.com";
    const mapping = {
      "places(.regular-search-result)": [{
        "name": ".biz-name",
        "reviews(.review)~(.search-result-title a)": [{
          content: ".review-content p|trim",
          name: ".user-display-name|trim",
        }],
      }],
    };
    parsz(mapping, url, {
      context: "http://www.yelp.com/",
    })
      .then((data) => {
        data.places.length.should.equal(10);
        data.places[0].name.should.equal("Tacorea");
        data.places[0].reviews.length.should.equal(21);
        data.places[0].reviews[1].name.should.equal("Carol L.");
        data.places[0].reviews[1].content.should.startWith("This place does Korean");
        done();
      });
  });
});
