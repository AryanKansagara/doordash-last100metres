import { createHash } from 'node:crypto';

export class GraphError extends Error {}
const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1e9;
const id = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,40}$/.test(value);
export const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function validate(graph, now) {
  if (!graph || !number(now) || !Array.isArray(graph.nodes) || graph.nodes.length < 2 || graph.nodes.length > 20
      || !graph.nodes.every(id) || new Set(graph.nodes).size !== graph.nodes.length
      || !graph.nodes.includes(graph.start) || !graph.nodes.includes(graph.goal)
      || !Array.isArray(graph.edges) || graph.edges.length > 60) throw new GraphError('Invalid graph or clock');
  const seen = new Set();
  for (const edge of graph.edges) {
    if (!edge || !id(edge.id) || seen.has(edge.id) || !graph.nodes.includes(edge.from) || !graph.nodes.includes(edge.to)
        || edge.from === edge.to || !number(edge.seconds) || edge.seconds < 1 || edge.seconds > 300
        || typeof edge.authorized !== 'boolean' || typeof edge.askable !== 'boolean'
        || !edge.fact || !['open', 'closed', 'unknown'].includes(edge.fact.status)
        || !number(edge.fact.observedAt) || !number(edge.fact.expiresAt) || typeof edge.fact.provenance !== 'string')
      throw new GraphError('Invalid or duplicate access edge');
    seen.add(edge.id);
  }
}

export function factState(edge, entryTime) {
  return edge.fact.observedAt > entryTime || edge.fact.expiresAt <= entryTime ? 'unknown' : edge.fact.status;
}

/** Bounded simple paths; authorization is a hard constraint for every policy. */
export function paths(graph, now, allow = (edge, entry) => factState(edge, entry) !== 'closed') {
  validate(graph, now);
  const found = [];
  let expansions = 0;
  function visit(node, edges, visited, seconds) {
    if (++expansions > 5000 || found.length >= 1000) throw new GraphError('Path search budget exhausted');
    if (node === graph.goal) {
      found.push({ edges, seconds, unknown: edges.filter((edge, index) => {
        const entry = now + edges.slice(0, index).reduce((sum, prior) => sum + prior.seconds, 0);
        return factState(edge, entry) === 'unknown';
      }) });
      return;
    }
    for (const edge of graph.edges.filter(e => e.from === node && e.authorized).sort((a, b) => a.id.localeCompare(b.id))) {
      if (!visited.has(edge.to) && allow(edge, now + seconds))
        visit(edge.to, [...edges, edge], new Set([...visited, edge.to]), seconds + edge.seconds);
    }
  }
  visit(graph.start, [], new Set([graph.start]), 0);
  return found.sort((a, b) => a.seconds - b.seconds || a.edges.map(e => e.id).join(',').localeCompare(b.edges.map(e => e.id).join(',')));
}

function plan(status, route, questions = []) { return { status, route: route?.edges.map(edge => edge.id) ?? [], questions }; }

export function flatInstructions(graph, now) {
  validate(graph, now);
  const edgeMap = new Map(graph.edges.map(edge => [edge.id, edge]));
  const route = graph.flatRoute?.map(edgeId => edgeMap.get(edgeId));
  if (!route || !route.length || route.some(edge => !edge || !edge.authorized)
      || route[0].from !== graph.start || route.at(-1).to !== graph.goal
      || route.some((edge, i) => i && route[i - 1].to !== edge.from))
    return plan('invalid_or_unauthorized_instructions', null);
  return plan('route', { edges: route });
}

export function shortestOptimistic(graph, now) {
  const route = paths(graph, now)[0];
  return plan(route ? 'route' : 'no_feasible_authorized_route', route);
}

/** Only this callback can reveal access availability; it cannot grant authorization. */
export function clarifyRoute(input, now, clarify, { maxQuestions = 8 } = {}) {
  validate(input, now);
  if (!Number.isSafeInteger(maxQuestions) || maxQuestions < 0 || maxQuestions > 16)
    throw new GraphError('Invalid question budget');
  const graph = structuredClone(input), questions = [];
  for (;;) {
    const planningNow = now + questions.length * 5;
    const candidates = paths(graph, planningNow);
    if (!candidates.length) return plan('no_feasible_authorized_route', null, questions);
    const confirmed = candidates.find(path => path.unknown.length === 0);
    // Prefer a known feasible route over interrupting a customer for speculative savings.
    if (confirmed) return plan('route', confirmed, questions);
    if (questions.length >= maxQuestions) return plan('handoff_required_question_budget', null, questions);
    const scores = new Map();
    for (const path of candidates) for (const edge of path.unknown.filter(edge => edge.askable))
      scores.set(edge.id, (scores.get(edge.id) ?? 0) + 1 / (path.seconds + 1));
    const ranked = [...scores].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (!ranked.length) return plan('handoff_required_unconfirmed_access', null, questions);
    const [edgeId, score] = ranked[0], edge = graph.edges.find(edge => edge.id === edgeId);
    const answer = clarify({ edge_id: edgeId, question: `Is the authorized ${edgeId} access usable for this delivery?` });
    if (!answer || typeof answer.open !== 'boolean' || !Number.isSafeInteger(answer.validForSeconds)
        || answer.validForSeconds < 1 || answer.validForSeconds > 3600)
      throw new GraphError('Invalid clarification response');
    questions.push({ edge_id: edgeId, answer_open: answer.open, score: Number(score.toFixed(8)),
      reason: 'route_coverage_weighted_by_inverse_travel_cost', provenance: 'fictional_recipient_response' });
    const responseAt = planningNow + 5;
    edge.fact = { status: answer.open ? 'open' : 'closed', observedAt: responseAt,
      expiresAt: responseAt + answer.validForSeconds, provenance: 'fictional_recipient_response' };
  }
}

export function evaluate(graph, world, now, proposed) {
  validate(graph, now);
  if (!world || !graph.edges.every(edge => typeof world[edge.id] === 'boolean')) throw new GraphError('Incomplete hidden world');
  const oracle = paths(graph, now, edge => world[edge.id])[0];
  const edges = proposed.route.map(edgeId => graph.edges.find(edge => edge.id === edgeId));
  if (edges.some(edge => !edge || !edge.authorized)) throw new GraphError('Unauthorized route refused before traversal');
  let node = graph.start, travel = 0, blocked = null;
  for (const edge of edges) {
    if (edge.from !== node) throw new GraphError('Disconnected route refused');
    travel += edge.seconds;
    if (!world[edge.id]) { blocked = edge.id; break; }
    node = edge.to;
  }
  const complete = !blocked && node === graph.goal;
  const clarification = proposed.questions.length * 5, failure = blocked ? 30 : 0;
  const total = travel + clarification + failure;
  return { completed_authorized_route: complete, route: proposed.route, planning_status: proposed.status,
    questions: proposed.questions, clarification_count: proposed.questions.length,
    blocked_edge: blocked, blocked_access_attempts: blocked ? 1 : 0,
    travel_seconds: travel, clarification_seconds: clarification, failed_access_penalty_seconds: failure,
    planned_departure_seconds: now + clarification,
    total_simulated_seconds: total, oracle_authorized_travel_seconds: oracle?.seconds ?? null,
    successful_route_regret_seconds: complete && oracle ? total - oracle.seconds : null,
    hidden_world_sha256: fingerprint(world), graph_sha256: fingerprint(graph) };
}

export function compare(fixture) {
  const { graph, world, now } = fixture;
  const planners = {
    flat: () => flatInstructions(structuredClone(graph), now),
    shortest: () => shortestOptimistic(structuredClone(graph), now),
    clarification: () => clarifyRoute(structuredClone(graph), now,
      ({ edge_id }) => ({ open: world[edge_id], validForSeconds: 300 })),
  };
  return { scenario: fixture.name, policies: Object.entries(planners).map(([policy, run]) => ({ policy,
    ...evaluate(structuredClone(graph), structuredClone(world), now, run()) })) };
}
