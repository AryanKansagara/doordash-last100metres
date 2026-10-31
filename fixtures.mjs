const fact = (status = 'open', expiresAt = 500) => ({ status, observedAt: 80, expiresAt, provenance: 'fictional_resident_note' });
export function staleNorth() {
  return { name: 'stale_north_two_entrances', now: 100,
    graph: { start: 'street', goal: 'unit', nodes: ['street', 'north', 'south', 'lobby', 'unit'],
      flatRoute: ['north_walk', 'north_gate', 'unit_walk'], edges: [
        { id: 'north_walk', from: 'street', to: 'north', seconds: 4, authorized: true, askable: false, fact: fact() },
        { id: 'north_gate', from: 'north', to: 'lobby', seconds: 3, authorized: true, askable: true, fact: fact('open', 90) },
        { id: 'south_walk', from: 'street', to: 'south', seconds: 6, authorized: true, askable: false, fact: fact() },
        { id: 'south_gate', from: 'south', to: 'lobby', seconds: 4, authorized: true, askable: true, fact: fact('unknown') },
        { id: 'unit_walk', from: 'lobby', to: 'unit', seconds: 5, authorized: true, askable: false, fact: fact() },
        { id: 'restricted_shortcut', from: 'street', to: 'unit', seconds: 1, authorized: false, askable: false, fact: fact() },
      ] },
    world: { north_walk: true, north_gate: false, south_walk: true, south_gate: true, unit_walk: true, restricted_shortcut: true } };
}
export function fixtures() {
  const stale = staleNorth();
  const known = staleNorth(); known.name = 'fully_known_single_entrance';
  known.graph.edges = known.graph.edges.filter(edge => !edge.id.startsWith('south'));
  known.graph.edges.find(edge => edge.id === 'north_gate').fact = fact(); known.world.north_gate = true;
  const inaccessible = staleNorth(); inaccessible.name = 'no_authorized_open_route';
  for (const edge of inaccessible.graph.edges.filter(edge => edge.id.endsWith('gate'))) edge.fact = fact('closed');
  inaccessible.world.south_gate = false;
  const unaskable = staleNorth(); unaskable.name = 'unconfirmed_unaskable_access';
  unaskable.graph.edges = unaskable.graph.edges.filter(edge => !edge.id.startsWith('south'));
  const gate = unaskable.graph.edges.find(edge => edge.id === 'north_gate');
  gate.fact = fact('unknown'); gate.askable = false; unaskable.world.north_gate = true;
  return [stale, known, inaccessible, unaskable];
}
