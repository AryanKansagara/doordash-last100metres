import { compare } from './graph.mjs';
import { fixtures } from './fixtures.mjs';
const experiments = fixtures().map(compare);
console.log(JSON.stringify({ provenance: 'fictional_authorized_graphs_and_hidden_worlds_real_executable_route_algorithms',
  permission: 'authorization_is_an_input_constraint_not_inferred_from_access_or_clarification',
  comparison_control: 'all_policies_receive_identical_graph_now_and_hidden_world_per_scenario',
  question_cost_seconds: 5, failed_access_penalty_seconds: 30,
  all_worlds_matched: experiments.every(e => new Set(e.policies.map(p => p.hidden_world_sha256)).size === 1), experiments }, null, 2));
