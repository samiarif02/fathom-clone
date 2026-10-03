export type TemplateId = "general" | "sales" | "customer" | "one_on_one" | "standup" | "interview";

export type Template = {
  id: TemplateId;
  label: string;
  description: string;
  /** Section headings the model fills, in order. `{chapters}` expands to one section per chapter. */
  instructions: string;
};

export const TEMPLATES: Template[] = [
  {
    id: "general",
    label: "General",
    description: "Overview, decisions and discussion by topic",
    instructions: `Sections, in this order:
1. "Overview": 2-3 bullets on the purpose and outcome of the meeting.
2. "Key decisions": choices the group actually agreed on (what will or will not happen, dates committed to, trade-offs accepted). Not individual to-dos; those are action items. Omit the section if nothing was decided.
3. One section per chapter, using the chapter title as the heading: 2-4 bullets on what was discussed, the numbers mentioned, and where it landed.
4. "Open questions": anything explicitly parked or unresolved. Omit the section if there is none.`,
  },
  {
    id: "sales",
    label: "Sales",
    description: "Pain, budget, authority, timeline, next steps",
    instructions: `Sections, in this order: "Prospect & context" (who they are, size, current tools), "Pain points", "Budget", "Decision process & authority", "Timeline", "Objections & questions", "Next steps". Use specifics the prospect said: numbers, names, dates. If something was not covered, write one bullet saying it was not discussed.`,
  },
  {
    id: "customer",
    label: "Customer success",
    description: "Customer goals, issues, commitments, risks",
    instructions: `Sections, in this order: "Customer goals", "Issues raised", "Our commitments" (what we promised, with dates and owners), "Their commitments", "Risks to the account", "Next steps".`,
  },
  {
    id: "one_on_one",
    label: "1:1",
    description: "Wins, concerns, feedback, growth",
    instructions: `Sections, in this order: "Check-in" (how they are doing), "Topics discussed", "Feedback given" (in both directions), "Growth & career", "Follow-ups". Keep a supportive, factual tone; do not editorialise about people.`,
  },
  {
    id: "standup",
    label: "Standup",
    description: "Per-person progress and blockers",
    instructions: `One section per person who gave an update, headed with their name, with bullets for what they did, what they are doing next, and any blocker. Then a final "Blockers & asks" section collecting every blocker with who will unblock it.`,
  },
  {
    id: "interview",
    label: "Interview",
    description: "Background, strengths, concerns, next steps",
    instructions: `Sections, in this order: "Candidate background", "Strengths", "Concerns or gaps", "Notable answers" (the most telling questions and what the candidate said), "Candidate's questions", "Next steps". Be evidence-based: tie each point to something said.`,
  },
];

export const templateById = (id: string) => TEMPLATES.find((t) => t.id === id);
