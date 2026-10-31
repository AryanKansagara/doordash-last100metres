# Last100Metres

DoorDash operates delivery and local-commerce services, including Drive integration APIs. This independent project explores a narrower problem: arrival at the right street address can still leave an uncertain authorized path through the final entrance and handoff point.

**Implemented:** a bounded directed graph engine, expiring access facts, deterministic clarification and matched-world policy simulation. Every building, time, permission, recipient answer and delivery is fictional. No DoorDash API, real address, access code, mapping service or production routing is used.

## Run

Node 22+; no packages, keys or network.

```sh
npm test
node demo.mjs
node demo.mjs > demo.json
```

Nine tests exercise stale and initially valid-but-soon-expired facts, time spent asking, two entrances, fully known paths, inaccessible buildings, unaskable access, wrong recipient answers, question budgets, duplicate edges and cycles. `demo.json` is actual executable output from four fictional scenarios, with identical graph/hidden-world hashes across all policies in each scenario.

## Measured simulation

| Scenario | Flat instructions | Optimistic shortest path | Clarification policy |
| --- | --- | --- | --- |
| Stale north gate; usable south entrance | Blocked north; 37 simulated seconds | Blocked north; 37 seconds | South succeeds; 2 questions, 25 seconds |
| Fully known single entrance | Succeeds, 12 seconds | Succeeds, 12 seconds | Succeeds, 12 seconds, 0 questions |
| No open authorized path | Blocked north | No feasible route | No feasible route; 0 questions |
| Unknown access, nobody can confirm | Succeeds in this world | Succeeds in this world | Handoff required; declines to guess |

In the first scenario, the complete-information **authorized** oracle takes 15 travel seconds. Clarification spends 10 more seconds on two authored five-second questions; this is an explicit cost, not a claim of oracle-optimal behavior. Failed routes have no successful-route regret metric. Each failed access attempt has an authored 30-second penalty. These values are fixture assumptions, not measurements of courier performance.

## Policy and permission boundary

Edges carry direction, travel cost, an immutable-in-the-episode authorization flag, an askable flag, and a timestamped access fact. Expired or future-dated facts become unknown. Expiry is checked at estimated **edge entry**, including travel before that edge and elapsed clarification time. Open access never implies permission. Every policy and the oracle excludes unauthorized edges, even the tempting one-second open restricted shortcut. The evaluator also rejects unauthorized or disconnected proposals before traversal.

The flat baseline follows the fixture's listed instructions, including stale instructions, while preserving authorization. The shortest baseline minimizes authorized travel while optimistically assuming unknown access is usable and rejecting fresh known closures. Clarification first accepts a fully confirmed route if available. Otherwise it scores askable unknown edges by route coverage weighted by inverse travel cost, breaks ties by edge ID, asks one question, updates only that access fact, and replans. This is a deterministic heuristic, not an entropy estimator, optimal question policy, or learned agent.

Neither planner receives the hidden world. Only the clarification callback can return a fictional recipient answer; the evaluator separately uses the world to test actual traversal. Questions can confirm availability, never authorize an edge. An inaccessible graph returns no route. Missing confirmation or exhausted budget returns handoff required. False confirmations can still lead to failed traversal; a dedicated negative test demonstrates that limit.

## Limits and next work

Graphs are limited to 20 nodes and 60 edges, simple paths to 1,000 with 5,000 search expansions, and questions to at most 16 (default 8). This bounded enumerator is not a city-scale shortest-path service. Static hidden availability does not model real gates changing during traversal. Inputs and recipient answers are assumed truthful except the explicit false-answer test. Permission is a fictional preauthorized episode input, not something inferred or obtained by this program.

No weather, accessibility, emergency, route safety, resident privacy, access-code storage, mobile UI or actual courier behavior is modeled. A real application would need consenting building owners/residents, per-delivery permissions, secure secret handling and usability evaluation. Node is suitable for this graph/service experiment; there is no inference runtime to move to C++.

## Sources and inferred opportunity

Official sources checked October 31, 2026:

- https://developer.doordash.com/en-US/docs/drive/how_to/Parcel/webhooks_reason_codes/ — documented access-instruction and apartment-location delivery-failure reasons.
- https://developer.doordash.com/en-US/docs/drive/reference/webhooks/ — delivery lifecycle integration events.

Those sources establish that access can matter, not its prevalence or DoorDash's roadmap. DoorDash already has delivery instructions and tracking. This project contributes an independently testable uncertainty/clarification experiment; it does not claim to invent indoor navigation or identify a confidential vendor initiative.
