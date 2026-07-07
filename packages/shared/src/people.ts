/** Person and relationship vocabulary (PRD §12–§13). */

export const GENDERS = ["male", "female", "nonbinary", "unknown", "custom"] as const;
export type Gender = (typeof GENDERS)[number];

export const GENDER_LABELS: Record<Gender, string> = {
  male: "Male",
  female: "Female",
  nonbinary: "Nonbinary",
  unknown: "Unknown",
  custom: "Custom",
};

export function isGender(value: unknown): value is Gender {
  return typeof value === "string" && (GENDERS as readonly string[]).includes(value);
}

/**
 * Directional parent→child relationship types (PRD §13.2). `from` is the parent,
 * `to` is the child. Child links are these edges read from the child's side.
 */
export const PARENT_RELATIONSHIP_TYPES = [
  "biological_parent",
  "adoptive_parent",
  "step_parent",
  "foster_parent",
  "guardian",
  "unknown_parent",
] as const;
export type ParentRelationshipType = (typeof PARENT_RELATIONSHIP_TYPES)[number];

/** Symmetric partner relationship types (PRD §13.2); stored once, read from both sides. */
export const PARTNER_RELATIONSHIP_TYPES = [
  "spouse",
  "divorced_spouse",
  "partner",
  "former_partner",
] as const;
export type PartnerRelationshipType = (typeof PARTNER_RELATIONSHIP_TYPES)[number];

export type RelationshipType = ParentRelationshipType | PartnerRelationshipType;

export const RELATIONSHIP_TYPE_LABELS: Record<RelationshipType, string> = {
  biological_parent: "Biological parent",
  adoptive_parent: "Adoptive parent",
  step_parent: "Step-parent",
  foster_parent: "Foster parent",
  guardian: "Guardian",
  unknown_parent: "Unknown parent",
  spouse: "Spouse",
  divorced_spouse: "Divorced spouse",
  partner: "Partner",
  former_partner: "Former partner",
};

export function isParentRelationshipType(value: unknown): value is ParentRelationshipType {
  return (
    typeof value === "string" && (PARENT_RELATIONSHIP_TYPES as readonly string[]).includes(value)
  );
}

export function isPartnerRelationshipType(value: unknown): value is PartnerRelationshipType {
  return (
    typeof value === "string" && (PARTNER_RELATIONSHIP_TYPES as readonly string[]).includes(value)
  );
}

export function isRelationshipType(value: unknown): value is RelationshipType {
  return isParentRelationshipType(value) || isPartnerRelationshipType(value);
}

/** Kinds for alternate names (PRD §12.2). Free-form-ish; these drive the UI select. */
export const PERSON_NAME_KINDS = ["maiden", "nickname", "also_known_as"] as const;
export type PersonNameKind = (typeof PERSON_NAME_KINDS)[number];

export const PERSON_NAME_KIND_LABELS: Record<PersonNameKind, string> = {
  maiden: "Maiden name",
  nickname: "Nickname",
  also_known_as: "Also known as",
};

export function isPersonNameKind(value: unknown): value is PersonNameKind {
  return typeof value === "string" && (PERSON_NAME_KINDS as readonly string[]).includes(value);
}
