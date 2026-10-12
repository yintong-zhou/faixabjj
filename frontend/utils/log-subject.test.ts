import { describe, expect, it } from "vitest";

import { subjectKind } from "./log-subject";

describe("subjectKind", () => {
  it("reads gym actions as a gym, except the two about a manager", () => {
    expect(subjectKind("gyms", "updateGym")).toBe("gym");
    expect(subjectKind("gyms", "setGymStatus.suspended")).toBe("gym");
    expect(subjectKind("gyms", "addManager")).toBe("gym");
    expect(subjectKind("gyms", "revokeManager")).toBe("manager");
    expect(subjectKind("gyms", "resetManagerPassword")).toBe("manager");
  });

  it("never turns a member's action into anything but a kind", () => {
    expect(subjectKind("members", "changeRole")).toBe("member");
    expect(subjectKind("promotions", "recordPromotion")).toBe("member");
    expect(subjectKind("members", "setTemporaryPassword")).toBe("account");
    expect(subjectKind("members", "rejectRegistration")).toBe("request");
  });
});
