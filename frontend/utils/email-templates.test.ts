import { describe, expect, it } from "vitest";

import {
  APP_TEMPLATES,
  declaredVariables,
  isAppTemplate,
  isTemplateName,
  missingAppTemplates,
  placeholders,
  renderPreview,
  sampleValues,
  templateStates,
  unknownPlaceholders,
} from "./email-templates";

describe("placeholders", () => {
  it("lists each name once, in order, with or without spaces", () => {
    expect(placeholders("Hi {{ name }} {{name}} {{ resetUrl }}")).toEqual(["name", "resetUrl"]);
  });

  it("ignores names notify-flow would not accept", () => {
    expect(placeholders("{{ bad-name }}")).toEqual([]);
  });
});

describe("unknownPlaceholders", () => {
  it("names the placeholders outside the allowed list", () => {
    expect(
      unknownPlaceholders(["{{ name }} {{ oops }}"], APP_TEMPLATES["password-changed"].variables),
    ).toEqual(["oops"]);
  });

  it("looks across every part", () => {
    expect(unknownPlaceholders(["{{ name }}", "{{ extra }}"], ["name"])).toEqual(["extra"]);
  });
});

describe("declaredVariables", () => {
  it("is the fixed list for a template the app sends, whatever the content uses", () => {
    expect(declaredVariables("email-change", ["no placeholders"])).toEqual([
      "appName",
      "name",
      "confirmUrl",
    ]);
  });

  it("is the content's placeholders plus appName for any other template", () => {
    expect(declaredVariables("promo", ["{{ name }}"])).toEqual(["appName", "name"]);
  });
});

describe("renderPreview", () => {
  it("escapes the values it puts in the HTML", () => {
    expect(renderPreview("<p>{{ name }}</p>", { name: "<script>x</script>" })).toBe(
      "<p>&lt;script&gt;x&lt;/script&gt;</p>",
    );
  });

  it("leaves a placeholder with no value as written", () => {
    expect(renderPreview("{{ other }}", {})).toBe("{{ other }}");
  });
});

describe("sampleValues", () => {
  it("gives every variable an app template uses a value", () => {
    const values = sampleValues("https://faixabjj.example", "Faixa BJJ");
    for (const { variables } of Object.values(APP_TEMPLATES)) {
      for (const variable of variables) expect(values[variable]).toBeTruthy();
    }
    expect(values.resetUrl.startsWith("https://faixabjj.example/")).toBe(true);
  });
});

describe("isTemplateName / isAppTemplate", () => {
  it("accepts notify-flow's names only", () => {
    expect(isTemplateName("email-change")).toBe(true);
    for (const bad of ["Email", "", "a".repeat(65), "../x"]) expect(isTemplateName(bad)).toBe(false);
  });

  it("knows the templates the app sends", () => {
    expect(isAppTemplate("welcome")).toBe(true);
    expect(isAppTemplate("promo")).toBe(false);
    expect(isAppTemplate("toString")).toBe(false);
  });
});

describe("templateStates / missingAppTemplates", () => {
  const states = templateStates([
    { name: "welcome", locale: "it", builtin: false },
    { name: "welcome", locale: "en", builtin: true },
  ]);

  it("tells an override from a built-in and from nothing", () => {
    expect(states.get("welcome")).toEqual({ it: "customised", en: "builtin", "pt-BR": "missing" });
  });

  it("lists every app template, even one notify-flow doesn't have", () => {
    expect(states.get("email-change")).toEqual({ it: "missing", en: "missing", "pt-BR": "missing" });
  });

  it("calls an own row with no built-in behind it custom", () => {
    const custom = templateStates([{ name: "email-change", locale: "it", builtin: false }]);
    expect(custom.get("email-change")?.it).toBe("custom");
  });

  it("flags the app templates that would fail to send", () => {
    const missing = missingAppTemplates(states);
    expect(missing).toContainEqual({ name: "email-change", locale: "it" });
    expect(missing).toContainEqual({ name: "welcome", locale: "pt-BR" });
    expect(missing).not.toContainEqual({ name: "welcome", locale: "it" });
  });
});
