import test from 'node:test';
import assert from 'node:assert/strict';
import { paths, factState, clarifyRoute, compare, evaluate, GraphError } from './graph.mjs';
import { fixtures, staleNorth } from './fixtures.mjs';

test('same hidden world: clarification avoids stale north entrance; baselines fail', () => {
  const result = compare(staleNorth()), [flat, shortest, aware] = result.policies;
  assert.equal(flat.completed_authorized_route, false);
  assert.equal(shortest.completed_authorized_route, false);
  assert.equal(aware.completed_authorized_route, true);
  assert.deepEqual(aware.questions.map(q => q.edge_id), ['north_gate', 'south_gate']);
  assert.equal(aware.total_simulated_seconds, 25);
  assert.equal(aware.oracle_authorized_travel_seconds, 15);
  assert.equal(aware.successful_route_regret_seconds, 10);
  assert.equal(new Set(result.policies.map(p => p.hidden_world_sha256)).size, 1);
  assert.equal(new Set(result.policies.map(p => p.graph_sha256)).size, 1);
});
test('fully specified single entrance asks nothing and matches authorized oracle', () => {
  const result = compare(fixtures()[1]);
  for (const policy of result.policies) {
    assert.equal(policy.completed_authorized_route, true);
    assert.equal(policy.clarification_count, 0);
    assert.equal(policy.total_simulated_seconds, 12);
  }
});
test('open restricted shortcut is never a route or an oracle option', () => {
  for (const fixture of fixtures()) for (const policy of compare(fixture).policies)
    assert.ok(!policy.route.includes('restricted_shortcut'));
  const fixture = fixtures()[2], result = compare(fixture);
  assert.equal(result.policies[2].planning_status, 'no_feasible_authorized_route');
  assert.equal(result.policies[2].oracle_authorized_travel_seconds, null);
  assert.ok(result.policies.every(p => !p.completed_authorized_route));
});
test('unaskable unknown access requires handoff instead of invented confirmation', () => {
  const result = compare(fixtures()[3]);
  assert.equal(result.policies[1].completed_authorized_route, true);
  assert.equal(result.policies[2].completed_authorized_route, false);
  assert.equal(result.policies[2].planning_status, 'handoff_required_unconfirmed_access');
  assert.equal(result.policies[2].clarification_count, 0);
});
test('expiry checked at estimated edge entry, not only departure', () => {
  const fixture = staleNorth();
  fixture.graph.edges.find(e => e.id === 'north_gate').fact.expiresAt = 102;
  assert.equal(factState(fixture.graph.edges.find(e => e.id === 'north_gate'), 100), 'open');
  const result = compare(fixture).policies[2];
  assert.equal(result.questions[0].edge_id, 'north_gate');
  assert.equal(result.completed_authorized_route, true);
});
test('time spent asking can expire another edge and force a handoff', () => {
  const fixture = staleNorth();
  fixture.graph.edges.find(edge => edge.id === 'unit_walk').fact.expiresAt = 108;
  const result = compare(fixture).policies[2];
  assert.equal(result.completed_authorized_route, false);
  assert.equal(result.planning_status, 'handoff_required_unconfirmed_access');
  assert.equal(result.planned_departure_seconds, 110);
});
test('question budgets and invalid answers fail explicitly, no mutation of input graph', () => {
  const fixture = staleNorth(), before = structuredClone(fixture.graph);
  const bounded = clarifyRoute(fixture.graph, fixture.now, () => ({ open: true, validForSeconds: 300 }), { maxQuestions: 0 });
  assert.equal(bounded.status, 'handoff_required_question_budget');
  assert.deepEqual(fixture.graph, before);
  assert.throws(() => clarifyRoute(fixture.graph, fixture.now, () => ({ open: 'yes', validForSeconds: 300 })), GraphError);
});
test('wrong clarification does not become proof of actual route success', () => {
  const fixture = staleNorth();
  const proposed = clarifyRoute(fixture.graph, fixture.now, () => ({ open: true, validForSeconds: 300 }));
  const result = evaluate(fixture.graph, fixture.world, fixture.now, proposed);
  assert.equal(result.completed_authorized_route, false);
  assert.equal(result.blocked_edge, 'north_gate');
  assert.equal(result.successful_route_regret_seconds, null);
});
test('cycles are bounded, duplicate IDs rejected, unauthorized proposal blocked', () => {
  const fixture = staleNorth();
  fixture.graph.edges.push({ ...fixture.graph.edges[0], id: 'return', from: 'north', to: 'street' });
  assert.ok(paths(fixture.graph, fixture.now).every(path => new Set(path.edges.map(e => e.to)).size === path.edges.length));
  fixture.graph.edges.push(structuredClone(fixture.graph.edges[0]));
  assert.throws(() => paths(fixture.graph, fixture.now), GraphError);
  const fresh = staleNorth();
  assert.throws(() => evaluate(fresh.graph, fresh.world, fresh.now, { route: ['restricted_shortcut'], questions: [] }), GraphError);
});
