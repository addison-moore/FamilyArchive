import { describe, expect, it } from "vitest";

import {
  orderRelatives,
  personBirthSortKey,
  type PersonRow,
  type RelatedPerson,
} from "@/lib/people";
import { layoutTreeGraph } from "@/lib/tree-layout";

// All names fictional.
const person = (id: string, year?: number, month?: number, day?: number) =>
  ({
    id,
    fullName: `Test ${id}`,
    birthYear: year ?? null,
    birthMonth: month ?? null,
    birthDay: day ?? null,
  }) as PersonRow;

const related = (p: PersonRow): RelatedPerson => ({
  person: p,
  type: "biological_parent",
  relationshipId: `edge-${p.id}`,
});

const parentOf = (from: string, to: string) => ({
  type: "biological_parent" as const,
  fromPersonId: from,
  toPersonId: to,
});

const spouses = (from: string, to: string) => ({
  type: "spouse" as const,
  fromPersonId: from,
  toPersonId: to,
});

const ids = (group: { person: PersonRow }[]) => group.map((r) => r.person.id);

/** Groups with only the one list set; everyone related is `people`, in creation order. */
const orderChildrenAndSiblings = (people: PersonRow[]) =>
  orderRelatives(
    { parents: [], children: people.map(related), partners: [], siblings: people },
    people,
    [],
  );

describe("orderRelatives", () => {
  it("reads children and siblings eldest first however they were stored", () => {
    const people = [
      person("clara", 1925, 3, 12),
      person("rose", 1915, 5, 3),
      person("max", 1938),
      person("hugh", 1915),
      person("ada", 1915, 5),
    ];
    const eldestFirst = ["hugh", "ada", "rose", "clara", "max"];

    const graph = orderChildrenAndSiblings(people);

    expect(ids(graph.children)).toEqual(eldestFirst);
    expect(graph.siblings.map((p) => p.id)).toEqual(eldestFirst);
  });

  it("puts people with no birth date after the dated, with ties in creation order", () => {
    const people = [
      person("owen"),
      person("tess", 1920),
      person("clara", 1925),
      person("silas"),
      person("nell", 1920),
    ];
    const eldestFirst = ["tess", "nell", "clara", "owen", "silas"];

    const graph = orderChildrenAndSiblings(people);

    expect(ids(graph.children)).toEqual(eldestFirst);
    expect(graph.siblings.map((p) => p.id)).toEqual(eldestFirst);
  });

  it("keeps both of a child's relationships together, in the order given", () => {
    const [younger, elder] = [person("younger", 1950), person("elder", 1940)];
    const adopted: RelatedPerson = {
      ...related(younger),
      type: "adoptive_parent",
      relationshipId: "a",
    };
    const born: RelatedPerson = { ...related(younger), relationshipId: "b" };

    const { children } = orderRelatives(
      { parents: [], children: [adopted, related(elder), born], partners: [], siblings: [] },
      [younger, elder],
      [],
    );

    expect(children.map((r) => r.relationshipId)).toEqual(["edge-elder", "a", "b"]);
  });

  it("matches the canvas's left-to-right order for a family's children", () => {
    const parents = [person("mum", 1890), person("dad", 1888)];
    const children = [
      person("clara", 1925),
      person("owen"),
      person("tess", 1920),
      person("hugh", 1915),
      person("silas"),
      person("nell", 1920),
    ];
    const everyone = [...parents, ...children];

    const canvas = layoutTreeGraph(
      {
        people: everyone.map((p) => ({
          id: p.id,
          fullName: p.fullName,
          lifespan: null,
          birthSortKey: personBirthSortKey(p),
          generation: parents.includes(p) ? 0 : 1,
          verified: false,
        })),
        parentEdges: parents.flatMap((parent) =>
          children.map((child) => ({
            id: `${parent.id}-${child.id}`,
            from: parent.id,
            to: child.id,
          })),
        ),
        partnerEdges: [{ id: "couple", from: "dad", to: "mum" }],
      },
      "dad",
    );
    const leftToRight = canvas.nodes
      .filter((node) => children.some((child) => child.id === node.id))
      .sort((a, b) => a.x - b.x)
      .map((node) => node.id);

    const { siblings } = orderChildrenAndSiblings(children);

    expect(siblings.map((p) => p.id)).toEqual(leftToRight);
  });

  it("reads a couple in the order their partnership was recorded", () => {
    const [mum, dad] = [person("mum", 1890), person("dad", 1895)];
    const both = {
      parents: [related(mum), related(dad)],
      children: [],
      partners: [],
      siblings: [],
    };

    const husbandFirst = orderRelatives(both, [mum, dad], [spouses("dad", "mum")]);
    const wifeFirst = orderRelatives(both, [mum, dad], [spouses("mum", "dad")]);

    expect(ids(husbandFirst.parents)).toEqual(["dad", "mum"]);
    expect(ids(wifeFirst.parents)).toEqual(["mum", "dad"]);
  });

  it("keeps parents in the order given when no partnership links them", () => {
    const [guardian, mum] = [person("guardian", 1880), person("mum", 1890)];

    const { parents } = orderRelatives(
      { parents: [related(mum), related(guardian)], children: [], partners: [], siblings: [] },
      [guardian, mum],
      [spouses("mum", "someone-else")],
    );

    expect(ids(parents)).toEqual(["mum", "guardian"]);
  });

  it("reads a remarried person's partners in the order their families started", () => {
    const [first, second, childless] = [person("first"), person("second"), person("childless")];
    const [elder, younger, youngest] = [
      person("elder", 1944),
      person("younger", 1947),
      person("youngest", 1950),
    ];

    const { partners } = orderRelatives(
      {
        parents: [],
        children: [related(elder), related(younger), related(youngest)],
        partners: [related(childless), related(second), related(first)],
        siblings: [],
      },
      [childless, second, first, youngest, younger, elder],
      [
        parentOf("first", "youngest"),
        parentOf("second", "younger"),
        parentOf("first", "elder"),
        parentOf("me", "elder"),
      ],
    );

    expect(ids(partners)).toEqual(["first", "second", "childless"]);
  });
});
