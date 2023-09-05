const { TypedEmitter } = require('tiny-typed-emitter')

/**
 * @private
 * @typedef {'stopped' | 'starting' | 'started' | 'stopping' | 'error'} ServiceStateValue
 */
/**
 * @typedef {{ value: Exclude<ServiceStateValue, 'error'> } | { value: 'error', error: Error }} ServiceState
 */

/**
 * @private
 * @typedef {Object} InternalEvents
 * @property {() => void} started
 * @property {() => void} stopped
 * @property {(error: Error) => void} internal-error
 */

/**
 * @typedef {Object} ExternalEvents
 * @property {(state: ServiceState) => void} state
 */

/**
 * A state machine for managing a service that has asynchronous "start" and
 * "stop" methods. Create an instance passing async `opts.start()` and
 * `opts.stop()` methods. It manages state following some basic rules:
 *
 * - Most importantly: You can call start() and stop() multiple times, but the
 *   service will end in the state of the last call (e.g. if the last call was
 *   to `stop()` then it will end up stopped)
 * - Calling `start()` when the service is "stopped" calls the `opts.start()` method
 *   and resolves when it completes.
 * - Calling `start()` when the service is "starting" (e.g. `start()` has been
 *   called but has not completed) will not call `opts.start()` again, but will
 *   resolve once the service has started
 * - Calling `start()` when the service is "started" will resolve immediately
 *   and do nothing.
 * - If `opts.start()` or `opts.stop()` throw, then the service is left in an
 *   unrecoverable "error" state.
 * - Calling `start()` or `stop()` when the service is in "error" state will
 *   throw with the error from the error state
 *
 * Logic for calling `stop()` follows the inverse of `start()`.
 *
 *
 *
 * To wait for the service to be in the "started" state from other methods, use
 * `await stateMachine.started()`. Note that if the services is "stopping" or
 * "stopped" then this will await (e.g. queue) until next start
 *
 * @template {Array<any>} TStartArgs
 * @template {Array<any>} TStopArgs
 * @extends {TypedEmitter<ExternalEvents>}
 */
class StartStopStateMachine extends TypedEmitter {
  /** @type {ServiceState} */
  #state = { value: 'stopped' }
  /** @type {TypedEmitter<InternalEvents>} */
  #emitter = new TypedEmitter()
  #start
  #stop

  /**
   * @param {Object} [opts]
   * @param {(...args: TStartArgs) => Promise<void>} [opts.start]
   * @param {(...args: TStopArgs) => Promise<void>} [opts.stop]
   */
  constructor({ start = async () => {}, stop = async () => {} } = {}) {
    super()
    this.#start = start
    this.#stop = stop
  }

  /**
   * Get the current state of the service.
   *
   * @returns {ServiceState}
   */
  get state() {
    return this.#state
  }

  /**
   * @private
   * @param {ServiceState} state
   */
  _setState(state) {
    this.#state = state
    if (state.value === 'started') this.#emitter.emit('started')
    else if (state.value === 'stopped') this.#emitter.emit('stopped')
    else if (state.value === 'error')
      this.#emitter.emit('internal-error', state.error)
    this.emit('state', state)
  }

  /**
   * Will resolve when the service is in started state. E.g. to ensure an async
   * method only runs when the service is in "started" state, use:
   *
   * ```js
   * await this.started()
   * ```
   *
   * Will reject if the service is in "error" state.
   *
   * Note: If the service is in "stopping" or "stopped" state this will queue
   * until the next time the service starts. If this is not desirable behaviour,
   * check this.#state.value first
   *
   * @returns {Promise<void>}
   */
  async started() {
    if (this.#state.value === 'started') return
    if (this.#state.value === 'error') throw this.#state.error
    const emitter = this.#emitter
    return new Promise((resolve, reject) => {
      emitter.once('started', onStarted)
      emitter.once('internal-error', onError)
      function onStarted() {
        emitter.off('internal-error', onError)
        resolve()
      }
      /**
       * @private
       * @param {Error} err
       */
      function onError(err) {
        emitter.off('started', onStarted)
        reject(err)
      }
    })
    /* c8 ignore next */
  }

  /**
   * Will resolve when the service is in stopped state. Less useful than
   * `started()` E.g. to ensure an async method only runs when the service is in
   * "stopped" state, use:
   *
   * ```js
   * await this.stopped()
   * ```
   *
   * Will reject if the service is in "error" state.
   *
   * Note: If the service is in "starting" or "started" state this will queue
   * until the next time the service stops. If this is not desirable behaviour,
   * check this.#state.value first
   *
   * @returns {Promise<void>}
   */
  async stopped() {
    if (this.#state.value === 'stopped') return
    if (this.#state.value === 'error') throw this.#state.error
    const emitter = this.#emitter
    return new Promise((resolve, reject) => {
      emitter.once('stopped', onStopped)
      emitter.once('internal-error', onError)
      function onStopped() {
        emitter.off('internal-error', onError)
        resolve()
      }
      /**
       * @private
       * @param {Error} err
       */
      function onError(err) {
        emitter.off('stopped', onStopped)
        reject(err)
      }
    })
    /* c8 ignore next */
  }

  /**
   * Start service. If the service is starting or started, will resolve when the
   * service is started, and will not call opts.start() for than once. If the
   * service is in the process of stopping, will wait until it stops before
   * starting and will not call opts.stop() more than once
   *
   * @param {TStartArgs} args
   * @returns {Promise<void>} Resolves when service is started
   */
  async start(...args) {
    switch (this.#state.value) {
      case 'starting':
        await this.started()
        // Avoid race condition if another function is queued up
        return this.start(...args)
      case 'started':
        return
      case 'error':
        return Promise.reject(this.#state.error)
      case 'stopping':
        // Wait until stopped before continuing
        await this.stopped()
        // Avoid race condition if another function is queued up
        return this.start(...args)
      case 'stopped':
      default:
      // Continue
    }
    try {
      this._setState({ value: 'starting' })
      await this.#start.apply(this, args)
      this._setState({ value: 'started' })
    } catch (e) {
      this._setState({ value: 'error', error: e })
      throw e
    }
  }

  /**
   * Stop the service.
   *
   * @param {TStopArgs} args
   * @returns {Promise<void>}
   */
  async stop(...args) {
    switch (this.#state.value) {
      case 'stopping':
        await this.stopped()
        return this.stop.apply(this, args)
      case 'stopped':
        return
      case 'error':
        return Promise.reject(this.#state.error)
      case 'starting':
        // Wait until started until stopping
        await this.started()
        return this.stop.apply(this, args)
      case 'started':
      default:
      // Continue
    }
    try {
      this._setState({ value: 'stopping' })
      await this.#stop.apply(this, args)
      this._setState({ value: 'stopped' })
    } catch (e) {
      this._setState({ value: 'error', error: e })
      throw e
    }
  }
}

module.exports = StartStopStateMachine
