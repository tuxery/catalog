import { describe, expect, it } from "vitest";
import { mapProducts, resolveScreenshotUrl } from "./fetch";

describe("resolveScreenshotUrl", () => {
  it("substitutes the {formatter} placeholder for a verified-working size", () => {
    expect(resolveScreenshotUrl("https://images.gog-statics.com/abc123_{formatter}.jpg")).toBe(
      "https://images.gog-statics.com/abc123_product_card_v2_mobile_slider_639.jpg",
    );
  });
});

describe("mapProducts", () => {
  it("keeps only productType 'game', dropping packs and DLC", () => {
    const products = [
      { id: "1", slug: "firewatch", title: "Firewatch", productType: "game" },
      { id: "2", slug: "bundle", title: "Some Bundle", productType: "pack" },
      { id: "3", slug: "addon", title: "Some DLC", productType: "dlc" },
    ];

    expect(mapProducts(products).map((entry) => entry.id)).toEqual(["1"]);
  });

  it("drops entries missing id, title, or slug", () => {
    const products = [
      { id: "1", slug: "app", title: undefined, productType: "game" },
      { id: undefined, slug: "app", title: "App", productType: "game" },
      { id: "1", slug: undefined, title: "App", productType: "game" },
    ];

    expect(mapProducts(products)).toEqual([]);
  });

  it("resolves every screenshot URL through resolveScreenshotUrl", () => {
    const products = [
      {
        id: "1",
        slug: "firewatch",
        title: "Firewatch",
        productType: "game",
        screenshots: ["https://images.gog-statics.com/a_{formatter}.jpg"],
      },
    ];

    expect(mapProducts(products)[0]?.screenshots).toEqual([
      "https://images.gog-statics.com/a_product_card_v2_mobile_slider_639.jpg",
    ]);
  });

  it("falls back gracefully when developers/screenshots are missing", () => {
    const products = [{ id: "1", slug: "app", title: "App", productType: "game" }];

    const [entry] = mapProducts(products);
    expect(entry?.developers).toEqual([]);
    expect(entry?.screenshots).toEqual([]);
  });

  it("keeps storeLink when the API provides one", () => {
    const products = [
      {
        id: "1",
        slug: "firewatch",
        title: "Firewatch",
        productType: "game",
        storeLink: "https://www.gog.com/en/game/firewatch",
      },
    ];

    expect(mapProducts(products)[0]?.storeLink).toBe("https://www.gog.com/en/game/firewatch");
  });

  it("converts reviewsRating's 0-50 scale to a 0-5 average when reviews exist", () => {
    const products = [
      {
        id: "1",
        slug: "firewatch",
        title: "Firewatch",
        productType: "game",
        reviewsRating: 39,
        reviewsCount: 2153,
      },
    ];

    expect(mapProducts(products)[0]?.rating).toEqual({ average: 3.9, count: 2153 });
  });

  it("drops the rating for unreviewed products rather than keeping a fake zero", () => {
    const products = [
      {
        id: "1",
        slug: "app",
        title: "App",
        productType: "game",
        reviewsRating: 0,
        reviewsCount: 0,
      },
    ];

    expect(mapProducts(products)[0]?.rating).toBeUndefined();
  });
});
