# Sturdy WebSocket

Tiny WebSocket wrapper that reconnects and resends failed messages.

[![Build
Status](https://travis-ci.org/dphilipson/sturdy-websocket.svg?branch=master)](https://travis-ci.org/dphilipson/sturdy-websocket)

## Table of Contents

<!-- toc -->

- [Introduction](#introduction)
- [Usage](#usage)
- [Installation](#installation)
- [Full API](#full-api)
  * [Options](#options)
    + [`allClearResetTime`](#allclearresettime)
    + [`connectTimeout`](#connecttimeout)
    + [`constructor`](#constructor)
    + [`debug`](#debug)
    + [`minReconnectDelay`](#minreconnectdelay)
    + [`maxReconnectDelay`](#maxreconnectdelay)
    + [`maxReconnectAttempts`](#maxreconnectattempts)
    + [`reconnectBackoffFactor`](#reconnectbackofffactor)
    + [`shouldReconnect`](#shouldreconnect)
  * [Additional Events](#additional-events)
    + [`down`](#down)
    + [`reopen`](#reopen)

<!-- tocstop -->

## Introduction

Sturdy WebSocket is a small (< 4kb gzipped) wrapper around a WebSocket that
reconnects when the WebSocket closes. If `send()` is called while the WebSocket
is closed, then the messages are stored in a buffer and sent once the connection
is reestablished.

## Usage

`SturdyWebSocket` fully implements the WebSocket API, as described [by
MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket), including the
ready state constants, `EventTarget` interface, and properties that you probably
don't care about like `bufferedAmount`. This means that it can be used as a
drop-in replacement for `WebSocket` with any existing code or other libraries
that consume WebSockets.

Example:
```js
import SturdyWebSocket from "sturdy-websocket";

const ws = new SturdyWebSocket("wss://example.com");
ws.onopen = () => ws.send("Hello!");
ws.onmessage = event => console.log("I got a message that says " + event.data);
// Or if you prefer event listeners:
ws.addEventListener("message", event =>
    console.log("I already said this, but the message says " + event.data));

// Like the normal constructor, the protocol can be given as a second argument.
const wsWithProtocol = new SturdyWebSocket("wss://foo.com", "some-protocol");

// Options can be provided as the final argument.
const wsWithOptions = new SturdyWebSocket("wss://bar.com", {
    connectTimeout: 5000,
    maxReconnectAttempts: 5
    reconnectBackoffFactor: 1.3
});
```
Because it is imitating a regular WebSocket, `onclose` will only be called once,
after the `SturdyWebSocket` is closed permanently either by using `close()` or
because the `shouldReconnect` option returned false. If you are interested in
being notified when the backing connection is temporarily down, you may listen
for the additional events `"down"` and `"reopen"`:
```js
const ws = new SturdyWebSocket("wss://example.com");
ws.ondown = closeEvent => console.log("Closed for reason " + closeEvent.reason);
ws.onreopen = () => console.log("We're back up!");
// Or with event listeners
ws.addEventListener("down", closeEvent => "Yea, it's down.");
```

## Installation

With Yarn:
```
yarn add sturdy-websocket
```

With NPM:
```
npm add --save sturdy-websocket
```

## Full API

As discussed above, `SturdyWebSocket` starts off by fully implementing the
[WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket).
Only features beyond the standard API are discussed below.

### Options

Options are passed as an optional final argument to the constructor, for
example:
```js
import SturdyWebSocket from "sturdy-websocket";

const ws1 = new SturdyWebSocket("wss://foo.com", { maxReconnectAttempts: 5 });
const ws2 = new SturdyWebSocket("wss://bar.com", "some-protocol", {
    connectTimeout: 4000,
    reconnectBackoffFactor: 1.3
});
```
All options which represent durations are in milliseconds.

#### `allClearResetTime`

Default: 5000

If a newly opened WebSocket closes immediately, it is considered to be a failed
connection for the purposes of increasing time between attempts and counting
towards `maxReconnectAttempts`. This option controls how long a connection must
remain open to be considered "successful" and reset these values.

#### `connectTimeout`

Default: 5000

When attempting to open a new connection, how long to wait before giving up and
making a new connection. Note that it is possible for an attempt to open a
WebSocket to stall forever, which is why this option is needed.

#### `constructor`

Default: `WebSocket`

Can be used to specify an implementation for the underlying WebSockets other
than the default. This may be useful in environments where `WebSocket` is not
available as a global variable, such as Node.js.

If this option is not provided and there is no variable named `WebSocket` in the
global scope, then the `SturdyWebSocket` constructor will throw.

#### `debug`

Default: false

If true, print various debug information to `console.log`, such as notifying
about reconnect attempts.

#### `minReconnectDelay`

Default: 1000

The minimum positive time between failed reconnect attempts. Note that the first
reconnect attempt happens immediately on the first failure, so this is actually
the delay between the first and second reconnect attempts.

#### `maxReconnectDelay`

Default: 30000

The maximum time between failed reconnect attempts. Additional attempts will
repeatedly use this as their delay.

#### `maxReconnectAttempts`

Default: Infinity

If reconnects fail this many times in a row, then the `SturdyWebSocket` closes
permanently, providing the `CloseEvent` from the last failed reconnect attempt.

#### `reconnectBackoffFactor`

Default: 1.5

The factor by which the time between reconnect attempts increases after each
failure.

#### `shouldReconnect`

Default: `() => true`

A function which is called when the backing WebSocket closes to determine if a
reconnect attempt should be made. It is provided the `CloseEvent` as an
argument. For example:
```js
const ws = new SturdyWebSocket("wss://example.com", {
    shouldReconnect: closeEvent => closeEvent.reason === "Harmless error"
});
```
If this returns false, then the `SturdyWebSocket` is closed and `onclose` is
called with the latest `CloseEvent`.

### Additional Events

These events, like all the standard WebSocket events, can be observed in two ways:
```js
ws.onreopen = () => console.log("We're back!");
ws.addEventListener("reopen", () => console.log("We're back!"));
```

#### `down`

Called when the backing WebSocket is closed but `SturdyWebSocket` will try to reconnect. Recieves the `CloseEvent` of the backing WebSocket.

#### `reopen`

Called when the backing WebSocket is reopened after it closed.

Copyright © 2017 David Philipson

