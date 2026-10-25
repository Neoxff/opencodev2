import { Effect, Schema } from "effect"
import { actionsEnabled, current, declare, normalize, samePlan } from "@/session/turn-plan"
import * as Tool from "./tool"

// Le parametre reste declare dans le schema : le deriver de la porte casse le typage Effect
// (`DecodingServices` devient `unknown`). La porte agit donc en aval, dans `declare` : un
// bras coupe n'enregistre pas les actions, ne les restitue pas et ne les renvoie pas.
const Parameters = Schema.Struct({
  intent: Schema.String.annotate({
    description:
      "The bounded OUTCOME this turn delivers, written as an imperative. Group every independent action you can complete now and run them together (parallel tool calls) rather than spending the turn on a single step.",
  }),
  expect: Schema.String.annotate({
    description:
      "The observation that proves the whole batch landed, stated as a concrete artifact: an exit code, a file path, or a measured value. It is compared against the real observation at the head of the next turn.",
  }),
  actions: Schema.optional(Schema.Array(Schema.String)).annotate({
    description:
      "The concrete targets this batch touches (file, route, symbol), e.g. ['read package.json', 'read tsconfig.json', 'grep SessionPrompt']. Naming them is what makes batching possible: a vague outcome offers nothing to batch on, and the list is restated to you next turn so the batch survives a long run. Not a quota — list only what you already know.",
  }),
  on_fail: Schema.optional(Schema.String).annotate({
    description: "The bounded fallback to run when the expectation is not observed.",
  }),
  stop_if: Schema.optional(Schema.String).annotate({
    description: "The condition that ends the turn.",
  }),
})

type Metadata = { declared: boolean; unchanged?: boolean }

export const TurnPlanTool = Tool.define<typeof Parameters, Metadata, never>(
  "turn_plan",
  Effect.gen(function* () {
    return {
      description:
        "Declare the next action before ending a turn that still leaves work open, and only when the batch changes: a plan already in force needs no new declaration and re-declaring it spends a whole step on a receipt. The plan is a prediction held in run state, never in the message history: the harness shows the real observation against `expect` at the head of the next turn, and a contradicting observation invalidates it. Each different declaration replaces the previous one. Never declare a plan you will not execute. Do not narrate the plan in your message; declare it here instead, in the same message as the calls it names.",
      parameters: Parameters,
      execute: (params, ctx) =>
        Effect.gen(function* () {
          // Detect a repeat before recording it: an identical plan is not a new
          // engagement, and the answer must say so rather than restate the plan as
          // if it had been recorded. Measured cost of the standalone declaration
          // this discourages: 2 279 steps, 46.5M input tokens on live traffic.
          const candidate = normalize({
            intent: params.intent,
            expect: params.expect,
            actions: params.actions ? [...params.actions] : undefined,
            onFail: params.on_fail,
            stopIf: params.stop_if,
          })
          const repeat = samePlan(current(ctx.sessionID)?.plan, candidate)
          const plan = declare(ctx.sessionID, {
            intent: params.intent,
            expect: params.expect,
            // `Schema.Array` yields a readonly array; the plan holds a mutable one, so copy
            // at the boundary rather than weakening the plan's type.
            actions: params.actions ? [...params.actions] : undefined,
            onFail: params.on_fail,
            stopIf: params.stop_if,
          })
          if (!plan) {
            return {
              title: "turn_plan needs an intent and an expectation",
              metadata: { declared: false },
              output:
                "`intent` and `expect` are both required and must be non-empty: a declaration without them binds nothing, so nothing was recorded.",
            }
          }
          if (repeat) {
            return {
              title: "turn_plan unchanged: already in force",
              metadata: { declared: true, unchanged: true },
              output: [
                `No change: this is exactly the plan already in force, expecting "${plan.expect}".`,
                "Nothing was recorded and no new step was needed for it.",
                "Put your next real call in the same message as this one, or skip the declaration entirely while the plan still holds.",
              ].join("\n"),
            }
          }
          return {
            title: `Engagement declared: ${plan.intent}`,
            metadata: { declared: true },
            output: [
              `Recorded for this turn: intent "${plan.intent}", expecting "${plan.expect}".`,
              ...(actionsEnabled() && plan.actions?.length
                ? [`Named actions (${plan.actions.length}), do them together where independent: ${plan.actions.join(" ; ")}.`]
                : []),
              ...(plan.onFail ? [`Fallback if the expectation is not observed: ${plan.onFail}.`] : []),
              ...(plan.stopIf ? [`The turn ends when: ${plan.stopIf}.`] : []),
              "This is a prediction, not a fact. Act on it at the start of your next turn, and treat it as invalidated if the observation contradicts it.",
            ].join("\n"),
          }
        }),
    }
  }),
)
