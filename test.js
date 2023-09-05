const test = require('tape')
const StartStopStateMachine = require('./')

// * - Calling `start()` when the service is "stopped" calls the `opts.start()` method
// *   and resolves when it completes.
// * - Calling `start()` when the service is "starting" (e.g. `start()` has been
// *   called but has not completed) will not call `opts.start()` again, but will
// *   resolve once the service has started
// * - Calling `start()` when the service is "started" will resolve immediately
// *   and do nothing.
// * - If `opts.start()` or `opts.stop()` throw, then the service is left in an
// *   unrecoverable "error" state.
// * - Calling `start()` or `stop()` when the service is in "error" state will
// *   throw with the error from the error state

test('Calling `start()` when the service is "stopped" calls the `opts.start()` method and resolves when it completes.', async (t) => {
  let started = false
  const startArgs = [{}, {}, {}]
  const service = new StartStopStateMachine({
    async start(...args) {
      t.deepEqual(args, startArgs, 'start args are passed to opts.start')
      await new Promise((res) => setTimeout(res, 100))
      started = true
    },
  })
  await service.start.apply(service, startArgs)
  t.true(started, 'Service is started')
  t.deepEqual(service.state, { value: 'started' })
})

test('Calling `start()` when the service is "starting" (e.g. `start()` has been called but has not completed) will not call `opts.start()` again, but will resolve once the service has started.', async (t) => {
  let startCount = 0
  const service = new StartStopStateMachine({
    async start() {
      await new Promise((res) => setTimeout(res, 100))
      startCount++
    },
  })
  t.deepEqual(
    service.state,
    { value: 'stopped' },
    'Service is in stopped state'
  )
  service.start()
  service.start()
  await new Promise((res) => setTimeout(res, 0))
  t.equal(startCount, 0, 'opts.start() has not yes been called')
  t.deepEqual(
    service.state,
    { value: 'starting' },
    'Service is in starting state'
  )
  await service.start()
  t.equal(startCount, 1, 'service opts.start() is only called once')
  t.deepEqual(
    service.state,
    { value: 'started' },
    'Service is in started state'
  )
})

test('Calling `start()` when the service is "started" will resolve immediately and do nothing.', async (t) => {
  let startCount = 0
  const service = new StartStopStateMachine({
    async start() {
      await new Promise((res) => setTimeout(res, 100))
      startCount++
    },
  })
  await service.start()
  t.equal(startCount, 1, 'service has started')
  t.deepEqual(
    service.state,
    { value: 'started' },
    'Service is in started state'
  )
  const timeStart = Date.now()
  await service.start()
  t.true(
    Date.now() - timeStart < 10,
    'calling second time resolves immediately'
  )
  await new Promise((res) => setTimeout(res, 0))
  t.equal(startCount, 1, 'service opts.start() has only been called once')
})

test('If `opts.start()` throws, then the service is left in an unrecoverable "error" state.', async (t) => {
  let startCount = 0
  const service = new StartStopStateMachine({
    async start() {
      await new Promise((res) => setTimeout(res, 100))
      startCount++
      // Throw the first time, but not on subsequent calls, but this should
      // never be called after it has thrown once
      if (startCount === 1) throw new Error('MyError')
    },
  })
  try {
    await service.start()
  } catch (e) {
    t.ok(e instanceof Error, 'throws on first call')
  }
  t.equal(service.state.value, 'error', 'in error state')
  try {
    await service.start()
  } catch (e) {
    t.ok(
      e instanceof Error,
      'throws once in error state, even if opts.start() does not throw on second call'
    )
  }
  t.equal(service.state.value, 'error', 'in error state')
})

test('Calling `start()` or `stop()` when the service is in "error" state will throw with the error from the error state', async (t) => {
  let startCount = 0
  const testError = new Error('TestError')
  const service = new StartStopStateMachine({
    async start() {
      startCount++
      return Promise.reject(testError)
    },
  })
  try {
    await service.start()
    t.fail('should not reach here')
  } catch (e) {
    t.equal(e, testError, 'start() throws with error from error state')
  }
  try {
    await service.start()
    t.fail('should not reach here')
  } catch (e) {
    t.equal(e, testError, 'start() throws with error from error state')
  }
  try {
    await service.stop()
    t.fail('should not reach here')
  } catch (e) {
    t.equal(e, testError, 'stop() throws with error from error state')
  }
  t.equal(startCount, 1, 'Only called opts.start() once when first threw')
  t.deepEqual(service.state, { value: 'error', error: testError })
})

test('Multiple calls to `start()` or `stop()` when the service is in "error" state will throw the same error', async (t) => {
  let stopCount = 0
  const testError = new Error('TestError')
  const service = new StartStopStateMachine({
    async start() {
      return Promise.reject(testError)
    },
    async stop() {
      stopCount++
    },
  })

  for (let i = 0; i < 10; i++) {
    try {
      await service.start()
      t.fail('should not reach here')
    } catch (e) {
      t.equal(e, testError, 'start() throws with error from error state')
    }
  }
  for (let i = 0; i < 10; i++) {
    try {
      await service.stop()
      t.fail('Should not reach here')
    } catch (e) {
      t.equal(e, testError, 'stop() throws with error from error state')
    }
  }
  t.equal(stopCount, 0, 'opts.stop() is never called due to error state')
  t.deepEqual(service.state, { value: 'error', error: testError })
})

test('Awaiting started() when service is starting, but subsequently errors, throws', async (t) => {
  const testError = new Error('TestError')
  const service = new StartStopStateMachine({
    async start() {
      await new Promise((res) => process.nextTick(res))
      return Promise.reject(testError)
    },
  })
  const startPromise = service
    .start()
    .catch((e) =>
      t.equal(e, testError, 'start() throws with error from error state')
    )
  t.equal(service.state.value, 'starting', 'in starting state')
  try {
    await service.started()
    t.fail('should not reach here')
  } catch (e) {
    t.equal(e, testError, 'started() throws with error from error state')
  }
  await startPromise
})

test('Awaiting stopped() when service is stopping, but subsequently errors, throws', async (t) => {
  const testError = new Error('TestError')
  const service = new StartStopStateMachine({
    async stop() {
      await new Promise((res) => process.nextTick(res))
      return Promise.reject(testError)
    },
  })
  await service.start()
  const stopPromise = service
    .stop()
    .catch((e) =>
      t.equal(e, testError, 'stop() throws with error from error state')
    )
  t.equal(service.state.value, 'stopping', 'in stopping state')
  try {
    await service.stopped()
    t.fail('should not reach here')
  } catch (e) {
    t.equal(e, testError, 'stopped() throws with error from error state')
  }
  await stopPromise
})

test('Awaiting started() when service is starting, resolves when the service is started', async (t) => {
  const service = new StartStopStateMachine({
    async start() {
      await new Promise((res) => process.nextTick(res))
    },
  })
  const startPromise = service.start()
  t.equal(service.state.value, 'starting', 'in starting state')
  await service.started()
  t.equal(service.state.value, 'started', 'in started state')
  await startPromise
})

test('Awaiting stopped() when service is stopping, resolves when the service is stopped', async (t) => {
  const service = new StartStopStateMachine({
    async stop() {
      await new Promise((res) => process.nextTick(res))
    },
  })
  await service.start()
  const stopPromise = service.stop()
  t.equal(service.state.value, 'stopping', 'in stopping state')
  await service.stopped()
  t.equal(service.state.value, 'stopped', 'in stopped state')
  await stopPromise
})

test('Awaiting `started()` or `stopped()` when the service is in "error" state will throw with the error from the error state', async (t) => {
  const testError = new Error('TestError')
  const service = new StartStopStateMachine({
    async start() {
      return Promise.reject(testError)
    },
  })
  try {
    await service.start()
    t.fail('should not reach here')
  } catch (e) {
    t.equal(e, testError, 'start() throws with error from error state')
  }
  try {
    await service.started()
    t.fail('should not reach here')
  } catch (e) {
    t.equal(e, testError, 'started() throws with error from error state')
  }
  try {
    await service.stopped()
    t.fail('should not reach here')
  } catch (e) {
    t.equal(e, testError, 'stopped() throws with error from error state')
  }
})

test('Awaiting started() when service is started resolves', async (t) => {
  const service = new StartStopStateMachine()
  await service.start()
  t.equal(service.state.value, 'started', 'in started state')
  await service.started()
  t.pass('started() resolves')
})

test('Awaiting stopped() when service is stopped resolves', async (t) => {
  const service = new StartStopStateMachine()
  await service.start()
  await service.stop()
  t.equal(service.state.value, 'stopped', 'in stopped state')
  await service.stopped()
  t.pass('stopped() resolves')
})

test('Calling `stop()` when the service is "started" calls the `opts.stop()` method and resolves when it completes.', async (t) => {
  let started = false
  const stopArgs = [{}, {}, {}]
  const service = new StartStopStateMachine({
    async start() {
      started = true
    },
    async stop(...args) {
      t.deepEqual(args, stopArgs, 'stop args are passed to opts.stop')
      started = false
    },
  })
  await service.start()
  t.true(started, 'Service is in started state')
  t.deepEqual(service.state, { value: 'started' })
  await service.stop.apply(service, stopArgs)
  t.false(started, 'Service is stopped once `stop()` resolves')
  t.deepEqual(service.state, { value: 'stopped' })
})

test('Calling `stop()` when the service is "stopping" (e.g. `stop()` has been called but has not completed) will not call `opts.stop()` again, but will resolve once the service has stopped.', async (t) => {
  let stopCount = 0
  const service = new StartStopStateMachine({
    async stop() {
      await new Promise((res) => setTimeout(res, 100))
      stopCount++
    },
  })
  await service.start()
  service.stop()
  service.stop()
  await new Promise((res) => setTimeout(res, 0))
  t.equal(stopCount, 0, 'Service not yet stopped')
  t.deepEqual(service.state, { value: 'stopping' })
  await service.stop()
  t.equal(stopCount, 1, 'service opts.stop() is only called once')
  t.deepEqual(service.state, { value: 'stopped' })
})

test('Calling `stop()` when the service is "stopped" will resolve immediately and do nothing.', async (t) => {
  let stopCount = 0
  const service = new StartStopStateMachine({
    async stop() {
      await new Promise((res) => setTimeout(res, 100))
      stopCount++
    },
  })
  await service.start()
  await service.stop()
  t.equal(stopCount, 1, 'service has stopped')
  t.deepEqual(service.state, { value: 'stopped' })
  const timeStart = Date.now()
  await service.stop()
  t.true(
    Date.now() - timeStart < 10,
    'calling second time resolves immediately'
  )
  await new Promise((res) => setTimeout(res, 0))
  t.equal(stopCount, 1, 'service opts.stop() has only been called once')
  t.deepEqual(service.state, { value: 'stopped' })
})

test('If `opts.stop()` throws, then the service is left in an unrecoverable "error" state.', async (t) => {
  let stopCount = 0
  const service = new StartStopStateMachine({
    async stop() {
      await new Promise((res) => setTimeout(res, 20))
      stopCount++
      // Throw the first time, but not on subsequent calls, but this should
      // never be called after it has thrown once
      if (stopCount === 1) throw new Error('MyError')
    },
  })
  await service.start()
  try {
    await service.stop()
    t.fail('Should not reach here')
  } catch (e) {
    t.ok(e instanceof Error, 'throws on first call')
  }
  t.equal(service.state.value, 'error', 'in error state')
  try {
    await service.stop()
  } catch (e) {
    t.ok(
      e instanceof Error,
      'throws once in error state, even if opts.start() does not throw on second call'
    )
  }
  t.equal(service.state.value, 'error', 'in error state')
})

test('Calling start() and stop() multiple times ends in expected state', async (t) => {
  let started = false
  const service = new StartStopStateMachine({
    async start() {
      await new Promise((res) => setTimeout(res, 60))
      started = true
    },
    async stop() {
      await new Promise((res) => setTimeout(res, 20))
      started = false
    },
  })
  service.start()
  await nextTick()
  service.start()
  await nextTick()
  service.stop()
  await nextTick()
  await service.start()
  t.true(started, 'service is started')
  t.deepEqual(service.state, { value: 'started' })

  service.stop()
  await nextTick()
  service.start()
  await nextTick()
  await service.stop()
  t.false(started, 'service is stopped')
  t.deepEqual(service.state, { value: 'stopped' })
})

async function nextTick() {
  return new Promise((res) => process.nextTick(res))
}
