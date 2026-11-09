import { describe, expect, it } from "vitest";
import { mapProductDetails, pickAgeRating, mapProducts, resolveScreenshotUrl } from "./fetch";

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
      { id: "1", slug: "lantern-keep", title: "Lantern Keep", productType: "game" },
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
        slug: "lantern-keep",
        title: "Lantern Keep",
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
        slug: "lantern-keep",
        title: "Lantern Keep",
        productType: "game",
        storeLink: "https://www.gog.com/en/game/lantern-keep",
      },
    ];

    expect(mapProducts(products)[0]?.storeLink).toBe("https://www.gog.com/en/game/lantern-keep");
  });

  it("converts reviewsRating's 0-50 scale to a 0-5 average when reviews exist", () => {
    const products = [
      {
        id: "1",
        slug: "lantern-keep",
        title: "Lantern Keep",
        productType: "game",
        reviewsRating: 40,
        reviewsCount: 1200,
      },
    ];

    expect(mapProducts(products)[0]?.rating).toEqual({ average: 4, count: 1200 });
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

describe("mapProductDetails", () => {
  // Invented values, in the shape of api.gog.com/products/<id>?expand=description.
  const game = {
    images: {
      icon: "//images-3.gog-statics.com/0123456789abcdef.png",
    },
    description: {
      lead: "<b>Lantern Keep</b> is a made-up mystery.",
      full: "<b>Lantern Keep</b> is a made-up mystery set in a made-up forest. \n <br><br>\nThe year is unknown.",
    },
  };

  it("resolves the protocol-relative icon and flattens the full description to text", () => {
    expect(mapProductDetails(game)).toEqual({
      iconUrl: "https://images-3.gog-statics.com/0123456789abcdef.png",
      longDescription:
        "Lantern Keep is a made-up mystery set in a made-up forest.\n\nThe year is unknown.",
    });
  });

  it("falls back to the lead, and to nothing", () => {
    expect(mapProductDetails({ description: { lead: "<p>Short.</p>" } }).longDescription).toBe(
      "Short.",
    );
    expect(mapProductDetails({})).toEqual({ iconUrl: undefined, longDescription: undefined });
  });
});

describe("mapProducts publisher", () => {
  it("comma-joins the publishers", () => {
    const [entry] = mapProducts([
      {
        id: "1",
        slug: "a",
        title: "A",
        productType: "game",
        publishers: ["Example Studio", "Sample Press"],
      },
    ]);
    expect(entry?.publisher).toBe("Example Studio, Sample Press");
  });
});

describe("pickAgeRating", () => {
  // Invented ratings, in the shape of catalog.gog.com.
  const game = [
    { name: "pegiRating", ageRating: "16" },
    { name: "esrbRating", ageRating: "17" },
  ];

  it("takes PEGI first, then ESRB, then USK", () => {
    expect(pickAgeRating(game)).toEqual({ system: "PEGI", value: "16", minAge: 16 });
    expect(pickAgeRating(game.slice(1))).toEqual({ system: "ESRB", value: "17", minAge: 17 });
    expect(pickAgeRating([{ name: "uskRating", ageRating: "0" }])).toEqual({
      system: "USK",
      value: "0",
      minAge: 0,
    });
  });

  it("ignores systems it doesn't map and unreadable ages", () => {
    expect(pickAgeRating([{ name: "gogRating", ageRating: "18" }])).toBeUndefined();
    expect(pickAgeRating([{ name: "pegiRating", ageRating: "n/a" }])).toBeUndefined();
    expect(pickAgeRating(undefined)).toBeUndefined();
  });
});
