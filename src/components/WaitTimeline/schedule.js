export const SCENES = [
  {id: 'robots', label: 'Cartpole + G1', prototypes: [
    {id: 'cartpole', name: 'Cartpole', shape: 'cartpole', before: 3, after: 2, role: 'donor'},
    {id: 'g1', name: 'G1', shape: 'g1', before: 1, after: 2, role: 'receiver'},
  ]},
  {id: 'franka', label: 'Four banana / Franka scenes', prototypes: [
    {id: 'banana-franka', name: '1 banana · 1 Franka', shape: 'assembly', parts: [1, 1], before: 3, after: 2, role: 'donor'},
    {id: 'banana-frankas', name: '1 banana · 2 Frankas', shape: 'assembly', parts: [1, 2], before: 1, after: 2, role: 'receiver'},
    {id: 'bananas-franka', name: '2 bananas · 1 Franka', shape: 'assembly', parts: [2, 1], before: 2, after: 2, role: 'continuing'},
    {id: 'franka', name: '1 Franka', shape: 'assembly', parts: [0, 1], before: 2, after: 2, role: 'continuing'},
  ]},
  {id: 'keyboards', label: '6 / 36 / 72 / 108 keys', prototypes: [
    {id: 'keys6', name: '6 keys', shape: 'keyboard', keys: 6, before: 3, after: 2, role: 'donor'},
    {id: 'keys36', name: '36 keys', shape: 'keyboard', keys: 36, before: 2, after: 2, role: 'continuing'},
    {id: 'keys72', name: '72 keys', shape: 'keyboard', keys: 72, before: 2, after: 2, role: 'continuing'},
    {id: 'keys108', name: '108 keys', shape: 'keyboard', keys: 108, before: 1, after: 2, role: 'receiver'},
  ]},
];

export const STAGES = [
  {name: 'Baseline', short: 'Rebuild', removed: 'No waits removed yet.',
    remaining: 'The CPU joins readers, replaces buffers, records changed addresses, chooses rows and sets work sizes.'},
  {name: 'Fixed addresses', short: 'Addresses', removed: 'Growing backing no longer relocates arrays or requires recording their new addresses.',
    remaining: 'The CPU still waits for readers, chooses placement and reads counts to set work sizes.'},
  {name: 'GPU placement', short: 'Placement', removed: 'Placement no longer needs a directory readback or a CPU row choice.',
    remaining: 'The CPU still reads world counts and sets recorded work sizes before submitting physics.'},
  {name: 'GPU counts', short: 'Counts', removed: 'Recorded GPU updates replace count readback and CPU work-size changes.',
    remaining: 'Backing changes still join readers on the CPU; driver allocation, mapping and access calls remain.'},
  {name: 'Fresh mapping', short: 'Fresh maps', removed: 'A fresh suffix can be mapped while the old replay runs, without a CPU reader join.',
    remaining: 'Mapping and access calls still cost CPU time. Publication waits for ordered readers; used addresses need maintenance.'},
  {name: 'Reuse backing', short: 'Pool', removed: 'A compatible existing physical handle replaces a fresh driver allocation.',
    remaining: 'The handle must be unmapped elsewhere. Mapping and access calls remain; shrinking still blocks the CPU.'},
  {name: 'Deferred retirement', short: 'Retirement', removed: 'A GPU-ordered withdrawal and completion polling replace the blocking shrink join.',
    remaining: 'Unmapping still runs on the CPU. Later replays use the surviving prefix, and growth waits for retirement to resolve.'},
];

// All durations are schematic layout units, never milliseconds or measured speedups.
// Lanes: 0 = one CPU thread; 1 = shared GPU work; 2 + prototype index = graph siblings.
// A dependency always finishes before its dependent starts. A wait's following operation
// also names the readers it joined; a waiting interval itself starts before those finish.
// Milestones are completion times except request, alloc, poolTake, mapStart, shrinkRequest
// and the *Step starts. Missing operations are null. With a tight budget, nextStep is the
// pre-reset prefix replay at stage 6, or the reset replay itself at earlier stages.
export function makeSchedule(stageIndex, sceneId, tightBudget = false) {
  const stage = STAGES[stageIndex] || STAGES[0];
  const level = STAGES.indexOf(stage);
  const scene = SCENES.find((item) => item.id === sceneId) || SCENES[0];
  const events = [];
  const milestones = Object.fromEntries([
    'request', 'oldDone', 'alloc', 'poolTake', 'mapStart', 'mapped', 'ready', 'replace',
    'compact', 'counts', 'resetStep', 'resetDone', 'shrinkRequest', 'withdraw', 'unmapped',
    'nextStep', 'nextDone', 'retirementResolved', 'prefixStep', 'poolReturn', 'released', 'allocated',
  ].map((key) => [key, null]));
  let cpu = null;
  const add = (id, lane, start, duration, kind, label, detail, dependencies = []) => {
    const deps = [...dependencies];
    if (lane === 0 && cpu && !deps.includes(cpu)) deps.push(cpu);
    const begin = Math.round(Math.max(start, ...deps.map((event) => event.end)) * 1000) / 1000;
    const event = {id, lane, start: begin, end: Math.round((begin + duration) * 1000) / 1000, kind, label, detail, deps: deps.map((item) => item.id)};
    events.push(event);
    if (lane === 0) cpu = event;
    return event;
  };
  const branches = (prefix, start, dependencies, after) => scene.prototypes.map((prototype, index) =>
    add(`${prefix}-${prototype.id}`, index + 2, start, 6 + index * 3 / (scene.prototypes.length - 1),
      'physics', `${after ? prototype.after : prototype.before} ${(after ? prototype.after : prototype.before) === 1 ? 'world' : 'worlds'} · physics`,
      `${prototype.name}: ${after ? prototype.after : prototype.before} live worlds. This is a sibling branch of one recorded graph, not a separate stream or executable. Substeps inside the branch remain ordered.${prefix === 'old' ? ' Its shared lifecycle and count updates finished before the visible timeline begins.' : ''}`, dependencies));
  const workSizes = (prefix, preceding) => {
    let sizes = preceding;
    if (level < 3) {
      sizes = add(`${prefix}-read-counts`, 0, sizes.end, 0.8, 'host', 'Read world counts',
        'After lifecycle changes finish, copy the current counts to the CPU. This teaching baseline submits lifecycle and physics separately.', [sizes]);
      sizes = add(`${prefix}-set-sizes`, 0, sizes.end, 0.8, 'host', 'Set work sizes',
        'The CPU sets the physics launches and bounded-copy extents from those counts.', [sizes]);
      sizes = add(`${prefix}-submit-physics`, 0, sizes.end, 0.4, 'host', 'Submit physics',
        'Submit the physics portion only after the host has installed its work sizes. Prototype physics remains sibling work.', [sizes]);
    } else {
      sizes = add(`${prefix}-gpu-counts`, 1, sizes.end, 0.8, 'gpu', 'GPU work sizes',
        'Captured update operations read current GPU world, contact and CCD counts and update the recorded launches and copies before every physics branch.', [sizes]);
    }
    return add(`${prefix}-check-ready`, 1, sizes.end, 0.4, 'gpu', 'Check readiness',
      'Every branch waits for shared lifecycle and work-size updates. Readiness covers all persistent and temporary owners; errors suppress physics.', [sizes]);
  };
  const previous = branches('old', 0, [], false);
  const oldDone = Math.max(...previous.map((event) => event.end));
  milestones.oldDone = oldDone;
  const request = add('request', 0, 2, 0.6, 'host', 'Request reset',
    'The task expresses its reset intent while the previous replay runs. It does not overwrite command buffers that the old replay may still read.');
  milestones.request = request.start;
  let growthFence = previous;
  let backing = request;

  // Tight budget reclaims existing EMPTY headroom, never the departing live world.
  if (tightBudget) {
    milestones.shrinkRequest = request.end;
    if (level < 6) {
      backing = add('join-headroom', 0, request.end, oldDone - request.end, 'wait', 'Join old readers',
        'Wait for every branch before retiring already-empty donor headroom. The donor still holds all three live worlds.', [request]);
      backing.waitFor = previous.map(event => event.id);
    }
    const queue = add('queue-headroom', 0, backing.end, 0.4, 'host', 'Queue withdrawal',
      `Lower usable capacity only over the donor’s already-empty suffix. The pending replacement has not run.${level === 6 ? ' Also queue an unchanged-command prefix replay behind the withdrawal.' : ''}`, [backing]);
    const withdraw = add('withdraw', 1, oldDone, 0.6, 'gpu', 'Withdraw headroom',
      'After all previous readers, publish a smaller ready prefix. All donor live rows remain covered; the empty suffix is retained until retirement completes.', [...previous, queue]);
    milestones.withdraw = withdraw.end;
    if (level === 6) {
      const unchanged = add('prefix-commands', 1, withdraw.end, 0.4, 'gpu', 'Unchanged commands',
        'The queued prefix replay keeps the old command sequence, skips reset work and reads only the surviving ready prefix.', [withdraw]);
      const gate = workSizes('prefix', unchanged);
      growthFence = branches('prefix', gate.end, [gate], false);
      milestones.prefixStep = gate.end;
      milestones.nextStep = gate.end;
      milestones.nextDone = Math.max(...growthFence.map((event) => event.end));
      add('poll-headroom-pending', 0, queue.end, 0.4, 'host', 'Poll: still pending',
        'A completion query returns pending without blocking the CPU. There is only one retirement batch; growth remains forbidden.', [queue]);
      backing = add('poll-headroom-done', 0, withdraw.end + 0.7, 0.4, 'host', 'Poll: complete',
        'The withdrawal completion is now observed. Prefix-only GPU work may continue while the CPU reclaims the suffix.', [withdraw]);
    } else {
      backing = add('join-headroom-withdrawal', 0, queue.end, withdraw.end - queue.end, 'wait', 'Wait for withdrawal',
        'This blocking policy also waits until the ordered capacity withdrawal has completed.', [queue]);
      backing.waitFor = [withdraw.id];
    }
    backing = add('unmap', 0, backing.end, 1.4, 'driver', 'Unmap donor tail',
      'Unmap only the already-empty headroom after its old readers and withdrawal finish. This physical handle is not mapped into the receiver yet.', [backing, withdraw]);
    milestones.unmapped = backing.end;
    milestones.retirementResolved = backing.end;
    if (level < 5) {
      backing = add('release-headroom', 0, backing.end, 0.6, 'driver', 'Release old handle',
        'Return the retired physical handle before allocating receiver backing within the tight budget.', [backing]);
      milestones.released = backing.end;
    }
  } else if (level < 4) {
    backing = add('join-growth', 0, request.end, oldDone - request.end, 'wait', 'Join old readers',
      'This growth policy joins every old graph branch on the CPU before allocating and mapping the receiver suffix.', [request]);
    backing.waitFor = previous.map(event => event.id);
  }

  const pooled = level >= 5;
  backing = add(pooled ? 'pool-take' : 'allocate', 0, backing.end, pooled ? 0.6 : 2.4,
    pooled ? 'host' : 'driver', pooled ? 'Take pooled handle' : 'Allocate backing',
    pooled ? (tightBudget
      ? 'Take the compatible donor handle only after it has been unmapped and retirement has resolved. A page is never mapped to donor and receiver simultaneously.'
      : 'Take an existing compatible, currently unmapped physical handle from the pool. No fresh physical allocation is needed.')
      : 'Ask the driver for physical backing. Allocation has a separate cost from mapping and granting access.',
    [backing, ...(!tightBudget && level < 4 ? previous : [])]);
  milestones[pooled ? 'poolTake' : 'alloc'] = backing.start;
  if (!pooled) milestones.allocated = backing.end;
  const mapped = add('map', 0, backing.end, 1.4, 'driver', 'Map + grant access',
    level >= 4
      ? 'Map the receiver’s never-before-mapped virtual suffix and grant access. These are real CPU driver calls; fresh addresses permit overlap, not free or guaranteed overlap.'
      : 'Install physical backing and access permissions after the blocking reader join. These driver calls remain separate from physical allocation.', [backing]);
  milestones.mapStart = mapped.start;
  milestones.mapped = mapped.end;
  let queued = add('queue-reset', 0, mapped.end, 0.4, 'host', level < 3 ? 'Submit lifecycle' : 'Queue reset replay',
    'Queue work after the complete supplied replay. The command buffers will be written in that GPU order, so no running reader sees a new command sequence.', [mapped]);
  let lifecycle = add('publish-ready', 1, queued.end, 0.5, 'gpu', 'Publish ready prefix',
    'Publish receiver readiness only after mapping, access permissions and all supplied readers finish, including any intervening prefix replay. All required storage owners must be ready.', [queued, ...growthFence]);
  milestones.ready = lifecycle.end;
  if (level === 0) {
    lifecycle = add('relocate', 1, lifecycle.end, 1.2, 'gpu', 'Copy moved buffers',
      'In this baseline, receiver growth changes its array addresses. Preserve existing receiver state in the replacement buffers.', [lifecycle]);
    lifecycle = add('record-new-addresses', 0, lifecycle.end, 1.6, 'capture', 'Record new addresses',
      'Re-record because this runtime buffer relocation changed addresses. Initial discovery, scratch preparation and capture are separate startup work.', [lifecycle]);
  }
  lifecycle = add('write-commands', 1, lifecycle.end, 0.5, 'gpu', 'Write reset commands',
    'Write the new command sequence only after all supplied old readers finish; now the queued reset may consume it.', [lifecycle]);
  if (level < 2) {
    lifecycle = add('read-placement', 0, lifecycle.end, 0.8, 'host', 'Read placement data',
      'The host-coordinated baseline reads the completed directory state before choosing the receiver row.', [lifecycle]);
  }
  lifecycle = add('placement', level < 2 ? 0 : 1, lifecycle.end, 1.2, level < 2 ? 'host' : 'gpu',
    level < 2 ? 'CPU chooses row' : 'GPU chooses row',
    'Validate the replacement and choose a ready destination. The donor’s departing live world is still present until the new world is initialized.', [lifecycle]);
  lifecycle = add('initialize', 1, lifecycle.end, 0.9, 'gpu', 'Initialize receiver',
    'Copy prototype defaults and apply the task’s reset state to the admitted receiver row. Scratch is initialized by its numerical operations, not copied as episode state.', [lifecycle]);
  lifecycle = add('publish-replacement', 1, lifecycle.end, 0.5, 'gpu', 'Publish replacement',
    'Only after initialization succeeds, replace the old world handle and publish the new generation and receiver location.', [lifecycle]);
  milestones.replace = lifecycle.end;
  lifecycle = add('compact', 1, lifecycle.end, 1.3, 'gpu', 'Compact + publish',
    'Fill the donor hole with a continuing world’s state and publish its moved location. Its episode survives. The donor tail becomes empty only now.', [lifecycle]);
  milestones.compact = lifecycle.end;
  const resetGate = workSizes('reset', lifecycle);
  milestones.counts = resetGate.start;
  milestones.resetStep = resetGate.end;
  const reset = branches('reset', resetGate.end, [resetGate], true);
  const resetDone = Math.max(...reset.map((event) => event.end));
  milestones.resetDone = resetDone;

  if (!tightBudget) {
    const shrink = add('request-shrink', 0, resetGate.end + 1, 0.5, 'host', 'Request tail shrink',
      'The reset has already compacted the donor. Request retirement of its now-empty tail while reset-replay physics is running.', [lifecycle]);
    milestones.shrinkRequest = shrink.start;
    let retirement = shrink;
    if (level < 6) {
      retirement = add('join-shrink', 0, shrink.end, resetDone - shrink.end, 'wait', 'Join reset readers',
        'Block the CPU until every branch of the reset replay finishes, even if the donor branch finished earlier.', [shrink]);
      retirement.waitFor = reset.map(event => event.id);
    }
    queued = add('queue-shrink', 0, retirement.end, 0.4, 'host', 'Queue withdrawal',
      `Order the smaller ready prefix after every supplied reset-replay reader. Later readers must honor the smaller capacity.${level === 6 ? ' Also queue the unchanged-command replay behind withdrawal, without overwriting its commands.' : ''}`, [retirement]);
    const withdraw = add('withdraw', 1, resetDone, 0.6, 'gpu', 'Withdraw donor tail',
      'Reduce readiness and admission only after all reset-replay branches finish. Keep physical pages until completion permits reclamation.', [queued, ...reset]);
    milestones.withdraw = withdraw.end;
    if (level === 6) {
      const unchanged = add('next-commands', 1, withdraw.end, 0.4, 'gpu', 'Unchanged commands',
        'The next queued replay sees the same processed command sequence, skips reset work and uses only the surviving prefix.', [withdraw]);
      const gate = workSizes('next', unchanged);
      const next = branches('next', gate.end, [gate], true);
      milestones.nextStep = gate.end;
      milestones.nextDone = Math.max(...next.map((event) => event.end));
      add('poll-pending', 0, queued.end, 0.4, 'host', 'Poll: still pending',
        'Completion is not ready. Return immediately; the CPU is free while the reset replay continues. Growth is forbidden while retirement is pending.', [queued]);
      retirement = add('poll-done', 0, withdraw.end + 0.7, 0.4, 'host', 'Poll: complete',
        'Observe withdrawal completion without joining the surviving-prefix replay. No later reader may access the retired tail.', [withdraw]);
    } else {
      retirement = add('join-withdrawal', 0, queued.end, withdraw.end - queued.end, 'wait', 'Wait for withdrawal',
        'The blocking shrink policy waits for capacity withdrawal before making the unmap calls.', [queued]);
      retirement.waitFor = [withdraw.id];
    }
    retirement = add('unmap', 0, retirement.end, 1.4, 'driver', 'Unmap donor tail',
      'Unmap the withdrawn suffix after completion. These are CPU driver calls; with deferred retirement they can overlap the next prefix-only physics.', [retirement, withdraw]);
    milestones.unmapped = retirement.end;
    milestones.retirementResolved = retirement.end;
    if (level >= 5) milestones.poolReturn = retirement.end;
    else {
      retirement = add('release-tail', 0, retirement.end, 0.6, 'driver', 'Release old handle',
        'Return the now-unmapped donor handle to the driver. Without pooling, a future growth allocates a fresh handle.', [retirement]);
      milestones.released = retirement.end;
    }
    if (level < 6) {
      const queueNext = add('queue-next', 0, retirement.end, 0.4, 'host', 'Queue next replay',
        'With this blocking policy, the CPU resumes submission only after shrinking has completed.', [retirement]);
      const unchanged = add('next-commands', 1, queueNext.end, 0.4, 'gpu', 'Unchanged commands',
        'The next replay keeps the processed command sequence and skips reset work.', [queueNext]);
      const gate = workSizes('next', unchanged);
      const next = branches('next', gate.end, [gate], true);
      milestones.nextStep = gate.end;
      milestones.nextDone = Math.max(...next.map((event) => event.end));
    }
  } else if (level < 6) {
    milestones.nextStep = milestones.resetStep;
    milestones.nextDone = milestones.resetDone;
  }

  return {events, end: Math.max(...events.map((event) => event.end)), milestones, scene, stage: level, stageInfo: stage,
    preparation: 'Before this timeline: discover allocations, prepare persistent and scratch storage, then record and bind the executable. One graph has shared lifecycle/count work and sibling prototype physics branches.',
  };
}
