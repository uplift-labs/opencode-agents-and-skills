# Traceability: Require OpenSpec Change Retrospective Gate

| User Idea / Requirement | Covered In | Notes |
| --- | --- | --- |
| Final step in all OpenSpec changes is a retrospective. | `specs/openspec-retrospective/spec.md` requirement `Retrospective Task Is Final In Task Lists`; `tasks.md` future implementation and final section. | Applies to new changes and existing active changes once implementation is approved. |
| Retrospective is mandatory before archive. | `specs/openspec-retrospective/spec.md` requirement `Retrospective Required Before Archive`; `design.md` archive gate semantics. | Archive blocked if missing or incomplete. |
| Retrospective examines the whole context of the specific change. | `design.md` evidence sources; spec requirement `Retrospective Reviews Full Work Context`. | Unavailable context must be recorded, not guessed. |
| Find problems, repeated/extra actions, long waits, quality and speed issues. | `design.md` problem categories; spec requirement `Retrospective Searches For Workflow And Token Waste`. | Includes validation, reviewer, MR, blocker, and handoff friction. |
| Find token waste and token-saving ideas. | `design.md` problem categories and retrospective template section `Token And Command Efficiency`. | Includes large outputs, repeated reads, manual synthesis. |
| Improve skills, agents, and instructions. | `design.md` output routing and skill/workflow update table. | Reusable findings route to `opencode-dev-kit`. |
| Generate ideas for better future project work. | Retrospective template sections `Quality And Review Improvements` and `Skill/Agent/Instruction Improvements`. | Project-local findings stay in current project. |
| Outputs are OpenSpec changes in current project or OpenSpec proposals for `opencode-dev-kit`. | `design.md` output routing; spec requirement `Findings Become Durable Follow-Ups`. | Cross-repo writes require approval; local handoff artifact allowed. |
| Produce concrete MR-ready proposals for `opencode-dev-kit`. | `design.md` OpenCode Dev Kit proposal flow; `tasks.md` future implementation. | MR creation remains approval-gated. |
| Make rule enforceable and not just prose. | `design.md` deterministic helper design; spec requirement `Retro Gate Is Machine-Checkable`. | Future TypeScript helper proposed. |
