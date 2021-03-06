import WebSocket from "isomorphic-ws";
import { Server } from "ws";
import SturdyWebSocket from "../src/index";

const PORT = 9327;
const URL = `ws://localhost:${PORT}`;

let server: Server;
let ws: SturdyWebSocket;

// Be careful to always assign created websockets to the top-level ws variable
// so they get cleaned up after the test, or otherwise close them manually.
// Otherwise, they will keep trying to reconnect and mess with following tests!

beforeEach(() => (server = new Server({ port: PORT })));
afterEach(() => {
    server.close();
    ws.close();
});

describe("basic functionality", () => {
    it("should make a connection like a normal WebSocket", done => {
        setupEchoServer();
        ws = new SturdyWebSocket(URL, { wsConstructor: WebSocket });
        const ondown = jest.fn();
        const onreopen = jest.fn();
        const onclose = jest.fn();
        ws.ondown = ondown;
        ws.onreopen = onreopen;
        ws.onclose = onclose;
        ws.onopen = () => ws.send("Echo?");
        ws.onmessage = event => {
            expect(event.data).toEqual("Echo?");
            expect(ondown).not.toHaveBeenCalled();
            expect(onreopen).not.toHaveBeenCalled();
            expect(onclose).not.toHaveBeenCalled();
            done();
        };
    });

    it("should reconnect if the connection is closed", done => {
        let connectCount = 0;
        server.on("connection", connection => {
            switch (connectCount++) {
                case 0:
                    connection.close();
                    break;
                case 1:
                    connection.send("Success");
                    break;
                default:
                    fail("More connections made than expected.");
            }
        });
        ws = new SturdyWebSocket(URL, { wsConstructor: WebSocket });
        const ondown = jest.fn();
        const onreopen = jest.fn();
        const onclose = jest.fn();
        ws.ondown = ondown;
        ws.onreopen = onreopen;
        ws.onclose = onclose;
        ws.onmessage = event => {
            expect(event.data).toEqual("Success");
            expect(connectCount).toEqual(2);
            expect(ondown).toHaveBeenCalledTimes(1);
            expect(onreopen).toHaveBeenCalledTimes(1);
            expect(onclose).not.toHaveBeenCalled();
            done();
        };
    });

    it("should use the protocol argument", done => {
        server.on("connection", async connection => {
            expect(connection.protocol).toEqual("some-protocol");
            done();
        });
        ws = new SturdyWebSocket(URL, "some-protocol", {
            wsConstructor: WebSocket,
        });
    });

    it("should work with event listeners", done => {
        setupEchoServer();
        ws = new SturdyWebSocket(URL, { wsConstructor: WebSocket });
        ws.addEventListener("open", () => ws.send("Echo??"));
        ws.addEventListener("message", event => {
            expect(event.data).toEqual("Echo??");
            done();
        });
    });

    interface GlobalWithWebSocket extends NodeJS.Global {
        WebSocket?: typeof WebSocket;
    }

    it("should default to global WebSocket if no wsConstructor option", () => {
        const wsGlobal = global as GlobalWithWebSocket;
        const oldGlobalWebSocket = wsGlobal.WebSocket;
        wsGlobal.WebSocket = WebSocket;
        try {
            ws = new SturdyWebSocket(URL);
        } finally {
            wsGlobal.WebSocket = oldGlobalWebSocket;
        }
    });

    it("should fail if no global WebSocket and no wsConstructor option", () => {
        // This test is mainly just to be sure that the previous test is
        // actually doing something.
        const wsGlobal = global as GlobalWithWebSocket;
        const oldGlobalWebSocket = wsGlobal.WebSocket;
        wsGlobal.WebSocket = undefined;
        try {
            expect(() => (ws = new SturdyWebSocket(URL))).toThrow(/global/);
        } finally {
            wsGlobal.WebSocket = oldGlobalWebSocket;
        }
    });
});

describe("shouldReconnect() option", () => {
    it("should prevent reconnect if returning false", done => {
        let connectCount = 0;
        server.on("connection", connection => {
            connectCount++;
            connection.close(
                1000,
                connectCount < 3 ? "Minor error" : "Grievous error",
            );
        });
        ws = new SturdyWebSocket(URL, {
            wsConstructor: WebSocket,
            minReconnectDelay: 10,
            shouldReconnect: event => event.reason === "Minor error",
        });
        ws.onclose = event => {
            expect(connectCount).toEqual(3);
            expect(event.reason).toEqual("Grievous error");
            done();
        };
    });

    it("should prevent reconnect until promise resolves to true", async () => {
        let connectCount = 0;
        server.on("connection", connection => {
            switch (connectCount++) {
                case 0:
                    connection.close();
                    break;
                case 1:
                    connection.send("Success");
                    break;
                default:
                    fail("More connections made than expected.");
            }
        });
        let resolve: (b: boolean) => void = undefined!;
        ws = new SturdyWebSocket(URL, {
            wsConstructor: WebSocket,
            minReconnectDelay: 5,
            shouldReconnect: () => new Promise(r => (resolve = r)),
        });
        const ondown = jest.fn();
        const onreopen = jest.fn();
        const onclose = jest.fn();
        ws.ondown = ondown;
        ws.onreopen = onreopen;
        ws.onclose = onclose;
        let onmessageCalled = false;
        ws.onmessage = event => {
            onmessageCalled = true;
            expect(event.data).toEqual("Success");
            expect(connectCount).toEqual(2);
            expect(ondown).toHaveBeenCalledTimes(1);
            expect(onreopen).toHaveBeenCalledTimes(1);
            expect(onclose).not.toHaveBeenCalled();
        };
        await delay(10);
        expect(ondown).toHaveBeenCalledTimes(1);
        expect(onreopen).not.toHaveBeenCalled();
        expect(onclose).not.toHaveBeenCalled();
        resolve(true);
        await delay(10);
        expect(onmessageCalled).toBe(true);
    });

    it("should prevent reconnect if promise resolves to false", async () => {
        server.on("connection", connection => connection.close());
        ws = new SturdyWebSocket(URL, {
            wsConstructor: WebSocket,
            minReconnectDelay: 5,
            shouldReconnect: () => Promise.resolve(false),
        });
        const ondown = jest.fn();
        const onreopen = jest.fn();
        const onclose = jest.fn();
        ws.ondown = ondown;
        ws.onreopen = onreopen;
        ws.onclose = onclose;
        await delay(10);
        expect(ondown).toHaveBeenCalledTimes(1);
        expect(onreopen).not.toHaveBeenCalled();
        expect(onclose).toHaveBeenCalledTimes(1);
    });
});

describe("reconnect()", () => {
    it("should close the backing websocket and open a new one", async () => {
        const serverOnOpen = jest.fn();
        const serverOnClose = jest.fn();
        server.on("connection", connection => {
            serverOnOpen();
            connection.on("close", serverOnClose);
        });
        ws = new SturdyWebSocket(URL, {
            wsConstructor: WebSocket,
        });
        await delay(10);
        expect(serverOnOpen).toHaveBeenCalledTimes(1);
        expect(serverOnClose).not.toHaveBeenCalled();
        ws.reconnect();
        await delay(10);
        expect(serverOnOpen).toHaveBeenCalledTimes(2);
        expect(serverOnClose).toHaveBeenCalledWith(1000, expect.anything());
    });

    it("should call the down and reopen handlers", async () => {
        ws = new SturdyWebSocket(URL, {
            wsConstructor: WebSocket,
        });
        const ondown = jest.fn();
        const onreopen = jest.fn();
        ws.ondown = ondown;
        ws.onreopen = onreopen;
        await delay(10);
        expect(ondown).not.toHaveBeenCalled();
        expect(onreopen).not.toHaveBeenCalled();
        ws.reconnect();
        await delay(10);
        expect(ondown).toHaveBeenCalledWith(undefined);
        expect(onreopen).toHaveBeenCalled();
    });

    it("should throw an error if the websocket is already closed", async () => {
        ws = new SturdyWebSocket(URL, {
            wsConstructor: WebSocket,
        });
        ws.close();
        expect(() => ws.reconnect()).toThrow(/closed/);
    });
});

describe("retry backoff", () => {
    // A pretty scrappy test. We can use spies to see all the calls made to
    // setTimeout(), but not to see which of those calls are for scheduling
    // reconnections. Instead, ensure that the expected sequence of calls
    // appears somewhere amongst all the calls.

    const originalSetTimeout = setTimeout;
    let timeoutRequests: number[];

    beforeEach(() => {
        timeoutRequests = [];
        window.setTimeout = ((...args: any[]) => {
            timeoutRequests.push(args[1]);
            return (originalSetTimeout as any)(...args);
        }) as any;
    });
    afterEach(() => {
        window.setTimeout = originalSetTimeout;
    });

    it("should back off exponentially and stop after max", done => {
        server.on("connection", connection => {
            connection.close();
        });
        ws = new SturdyWebSocket(URL, {
            wsConstructor: WebSocket,
            minReconnectDelay: 1,
            maxReconnectDelay: 9,
            maxReconnectAttempts: 7,
            reconnectBackoffFactor: 2,
        });
        ws.onclose = () => {
            const expectedSubsequence = [0, 1, 2, 4, 8, 9, 9];
            const unexpectedSubsequence = [...expectedSubsequence, 9];
            expect(
                containsSubsequence(timeoutRequests, expectedSubsequence),
            ).toEqual(true);
            expect(
                containsSubsequence(timeoutRequests, unexpectedSubsequence),
            ).toEqual(false);
            done();
        };
    });
});

describe("buffering", () => {
    it("should send stored messages after reconnecting", done => {
        // Shut down the server for a bit, then make sure the messages go
        // through once it starts up again.
        server.close();
        setTimeout(() => {
            server = new Server({ port: PORT });
            server.on("connection", connection =>
                connection.on("message", message => {
                    expect(message).toEqual("Finally");
                    done();
                }),
            );
        }, 20);

        ws = new SturdyWebSocket(URL, {
            wsConstructor: WebSocket,
            minReconnectDelay: 10,
        });
        ws.send("Finally");
    });
});

describe("connect timeout", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("should retry if socket takes too long to open", () => {
        const wsMock: any = {
            send: jest.fn(),
            close: jest.fn(() => wsMock.onclose()),
        };
        const constructorMock = jest.fn(() => wsMock);
        ws = new SturdyWebSocket("", {
            connectTimeout: 100,
            wsConstructor: constructorMock,
        });
        expect(wsMock.close).not.toHaveBeenCalled();
        expect(constructorMock).toHaveBeenCalledTimes(1);
        jest.runTimersToTime(150);
        expect(wsMock.close).toHaveBeenCalled();
        expect(constructorMock).toHaveBeenCalledTimes(2);
    });
});

function setupEchoServer(): void {
    server.on("connection", connection => {
        connection.on("message", message => {
            connection.send(message);
        });
    });
}

function containsSubsequence<T>(haystack: T[], needle: T[]): boolean {
    let haystackIndex = 0;
    let needleIndex = 0;
    while (true) {
        if (needleIndex >= needle.length) {
            return true;
        } else if (haystackIndex >= haystack.length) {
            return false;
        } else if (haystack[haystackIndex] === needle[needleIndex]) {
            needleIndex++;
        }
        haystackIndex++;
    }
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
