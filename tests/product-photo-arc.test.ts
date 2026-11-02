import { describe, expect, it } from "vitest";
import { evaluateFinalProductArc, productPhotoClass } from "@/lib/storyboard/product-photo-planner";

describe("product evidence to desire arc", () => {
  it("classifies proof and beauty roles separately", () => {
    expect(productPhotoClass("movement_detail")).toBe("evidence");
    expect(productPhotoClass("hallmark")).toBe("evidence");
    expect(productPhotoClass("clous_de_paris")).toBe("desire");
    expect(productPhotoClass("full_watch")).toBe("desire");
    expect(productPhotoClass("side_case")).toBe("desire");
    expect(productPhotoClass("hero")).toBe("desire");
  });

  it("requires a desire visual in the final 20 percent and at payoff", () => {
    const pass = evaluateFinalProductArc([
      { watchReference: true, productPhotoRole: "movement" },
      { watchReference: false },
      { watchReference: true, productPhotoRole: "clous_de_paris" },
      { watchReference: true, productPhotoRole: "hero" },
    ]);
    expect(pass.passed).toBe(true);

    const fail = evaluateFinalProductArc([
      { watchReference: true, productPhotoRole: "dial" },
      { watchReference: false },
      { watchReference: true, productPhotoRole: "movement" },
      { watchReference: true, productPhotoRole: "caseback" },
    ]);
    expect(fail.passed).toBe(false);
  });
});
