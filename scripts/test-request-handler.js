import { Readable } from "node:stream";
import handler from "../api/request.js";

const requestBody = JSON.stringify({
  type: "one_tap_request",
  clientRequestId: "11111111-1111-4111-8111-111111111111",
  timestamp: new Date().toISOString()
});

class MockRequest extends Readable {
  constructor() {
    super();
    this.method = "POST";
    this.headers = {
      "content-type": "application/json",
      "x-forwarded-for": "127.0.0.1"
    };
    this.socket = { remoteAddress: "127.0.0.1" };
    this.sent = false;
  }

  _read() {
    if (this.sent) {
      this.push(null);
      return;
    }

    this.sent = true;
    this.push(requestBody);
    this.push(null);
  }
}

class MockResponse {
  constructor() {
    this.statusCode = 200;
    this.headers = {};
    this.body = "";
  }

  setHeader(name, value) {
    this.headers[name.toLowerCase()] = value;
  }

  end(body = "") {
    this.body = body;
  }
}

const response = new MockResponse();
await handler(new MockRequest(), response);

console.log(JSON.stringify({
  statusCode: response.statusCode,
  headers: response.headers,
  body: response.body ? JSON.parse(response.body) : null
}, null, 2));
