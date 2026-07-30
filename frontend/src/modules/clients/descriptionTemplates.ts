/**
 * Ordered list of description-template ids shown in the "Insert template"
 * dropdown on the client notes panel. Titles and bodies live in the i18n
 * files under `clients.notes.templates.<id>.title` and `.body` so they
 * translate cleanly per locale — the body of each template is a chunk of
 * plain-text markdown with `→ ` markers where the trainer types answers.
 *
 * Add a new template by:
 *   1. Extending the tuple below with its id (order controls dropdown order).
 *   2. Adding matching `title` + `body` entries in `i18n/en.json` and
 *      `i18n/es.json` under `clients.notes.templates.<id>`.
 */
export const DESCRIPTION_TEMPLATE_IDS = [
  "goals",
  "habits",
  "sleep",
  "commitment",
  "history",
  "pain",
  "recovery",
  "equipment",
  "communication",
] as const;

export type DescriptionTemplateId = (typeof DESCRIPTION_TEMPLATE_IDS)[number];
