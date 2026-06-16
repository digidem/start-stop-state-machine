# start-stop-state-machine

[![Node.js CI](https://github.com/digidem/start-stop-state-machine/workflows/Node.js%20CI/badge.svg)](https://github.com/digidem/start-stop-state-machine/actions/workflows/node.js.yml)
[![Coverage Status](https://coveralls.io/repos/github/digidem/start-stop-state-machine/badge.svg)](https://coveralls.io/github/digidem/start-stop-state-machine)
[![Npm package version](https://img.shields.io/npm/v/start-stop-state-machine)](https://npmjs.com/package/start-stop-state-machine)
[![standard-readme compliant](https://img.shields.io/badge/standard--readme-OK-green.svg?style=flat-square)](https://github.com/RichardLitt/standard-readme)

A simple state machine for managing a service that asynchronously starts and stops.

## Table of Contents

- [Install](#install)
- [Usage](#usage)
- [API](#api)
- [Maintainers](#maintainers)
- [Contributing](#contributing)
- [License](#license)

## Install

    npm install start-stop-state-machine

## Usage

```js
import StateMachine from 'start-stop-state-machine'

async function startService() {
  console.log('starting')
  await new Promise((res) => setTimeout(res, 200))
  console.log('started')
}

async function stopService() {
  console.log('stopping')
  await new Promise((res) => setTimeout(res, 200))
  console.log('stopped')
}

const sm = new StateMachine({ start: startService, stop: stopService })

;(async () => {
  sm.start()
  sm.start()
  await sm.started()
  // logs "starting" then "started", but only once
  await sm.stop()
  // logs "stopping", then "stopped"
})()
```

## API

### `new StateMachine(opts)`

Create a state machine instance.

- `opts.start` — async function called to start the service. Any arguments
  passed to `sm.start()` are forwarded to it. Its resolved value becomes the
  start result (see `started()`). Defaults to a no-op.
- `opts.stop` — async function called to stop the service. Any arguments
  passed to `sm.stop()` are forwarded to it. Defaults to a no-op.

You can call `start()` and `stop()` multiple times. The service ends in the
state of the _last_ call, and `opts.start()` / `opts.stop()` are each called
at most once per transition:

- Calling `start()` when **stopped** calls `opts.start()` and resolves when it
  completes.
- Calling `start()` when **starting** does not call `opts.start()` again, but
  resolves once the service has started.
- Calling `start()` when **started** resolves immediately and does nothing.
- Calling `start()` when **stopping** waits until the service is stopped, then
  starts it.

`stop()` follows the inverse logic.

If `opts.start()` or `opts.stop()` throw, the service is left in an
unrecoverable `error` state. Calling any method while in the `error` state
rejects with that error.

### `sm.start(...args)`

Start the service, forwarding `args` to `opts.start()`. Returns a `Promise`
that resolves with the value returned by `opts.start()` once the service is
started.

### `sm.stop(...args)`

Stop the service, forwarding `args` to `opts.stop()`. Returns a `Promise` that
resolves once the service is stopped.

### `sm.started()`

Returns a `Promise` that resolves with the start result once the service is in
the `started` state, and rejects if it enters the `error` state. Useful for
gating other methods on the service being ready:

```js
await sm.started()
```

Note: if the service is `stopping` or `stopped`, this queues until the next
time the service starts. Check `sm.state.value` first if that is not desired.

### `sm.stopped()`

Returns a `Promise` that resolves once the service is in the `stopped` state,
and rejects if it enters the `error` state. The counterpart to `started()`.

Note: if the service is `starting` or `started`, this queues until the next
time the service stops.

### `sm.state`

Getter returning the current state, an object of the form:

```js
{ value: 'stopped' | 'starting' | 'started' | 'stopping' }
// or, in the error state:
{ value: 'error', error: Error }
```

### `'state'` event

The state machine extends [`tiny-typed-emitter`][tiny-typed-emitter]. It emits
a `state` event with the new state object on every transition:

```js
sm.on('state', (state) => {
  console.log(state.value)
})
```

[tiny-typed-emitter]: https://github.com/binier/tiny-typed-emitter

## Maintainers

[@digidem](https://github.com/digidem)

## Contributing

PRs accepted.

Small note: If editing the README, please conform to the [standard-readme](https://github.com/RichardLitt/standard-readme) specification.

## License

MIT © 2022 Digital Democracy
