// EvalClient.js
//
// Copyright (c) Eddie.
// Distributed under the terms of the MIT License.

const EvalClientError = {
  UNMAKABLE_SERVER: Symbol("Unmakable server"),
  DEAD_SERVER: Symbol("Dead server")
};

class EvalClient {

  constructor(masterURI, clientId, websocket = false) {
    this.id = clientId;
    this.enableWebSocket = websocket;
    this.ws = null;
    this.evalURI = null;
    this.masterURI = masterURI;
    this.token = null;
  }

  static makeRequest(method, params, id = null) {
    return JSON.stringify({
      "jsonrpc": "2.0",
      "method": method,
      "params": params,
      "id": id
    });
  }

  static makeServerMessage(clientId, websocket) {
    return JSON.stringify({
      "method": "makeServer",
      "params": {
        "enableWebSocket": websocket,
        "clientId": clientId
      }
    });
  }

  makeServer() {
    console.log("[->] Make eval-server...");
    return new Promise((resolve, reject) => {
      http.put(this.masterURI, EvalClient.makeServerMessage(this.id, this.enableWebSocket))
        .then(json => {
          this.evalURI = json.uri;
          this.token = json.token;
          resolve();
        })
        .catch(err => {
          reject(EvalClientError.UNMAKABLE_SERVER);
        });
    });
  }

  connect() {
    return new Promise((resolve, reject) => {
      if (this.evalURI) {
        this.ws = new WebSocket(this.evalURI);
        this.ws.addEventListener('open', event => {
          console.log("[->WS] Open successful");
          resolve(event);
        });
        this.ws.addEventListener('error', event => {
          console.log(`[Error] failed connect (${event})`);
          reject(EvalClientError.DEAD_SERVER);
        });
      } else {
        reject(EvalClientError.DEAD_SERVER);
      }
    });
  }

  /** DEPRECATED
    * Note:
    * JSONRPC server don't support Cross-Origin Resource Sharing.
    * We should use WebSocket instead. */
  sendTCP(request) {
    console.log("[->TCP] "+ request);
    return new Promise((resolve, reject) => {
      http.put(this.evalURI, request).then(json => {
        console.log("[<-TCP] Resolve");
        resolve(json);
      }).catch(err => {
        console.log("[<-TCP] Reject (DEAD_SERVER)");
        reject(EvalClientError.DEAD_SERVER);
      });
    });
  }

  sendWS(request) {
    console.log("[->WS] "+ request);
    return new Promise((resolve, reject) => {
      this.connect()
        .then(() => {
          this.ws.addEventListener('message', event => {
            console.log("[<-WS] Resolve");
            resolve(JSON.parse(event.data));
          });
          this.ws.send(request);
        })
        .catch(err => {
          console.log("[<-WS] Reject (DEAD_SERVER)");
          reject(EvalClientError.DEAD_SERVER);
        });
    });
  }

  requestUntilSuccessful(request, trueResolve, trueReject) {
    console.log("Try request...");
    let proc = this.enableWebSocket ? this.sendWS.bind(this) : this.sendTCP.bind(this) ;
    proc(request)
      .then(json => {
        if (json.id !== this.id) {
          trueReject(new Error("INVALID_ID"));
        } else {
          trueResolve(json);
        }
      })
      .catch(err => {
        console.log(`[Reject] Request receive failed (${String(err)})`);
        if (err == EvalClientError.DEAD_SERVER) {
          this.makeServer()
            .then(() => {
              setTimeout(100, this.requestUntilSuccessful, request, trueResolve, trueReject);
            })
            .catch(err => {
              console.log("[Error] Unmakable server");
              setTimeout(1000, this.requestUntilSuccessful, request, trueResolve, trueReject);
              //trueReject(EvalClientError.UNMAKABLE_SERVER);
            });
        }
      });
  }

  request(request) {
    return new Promise((resolve, reject) => {
      this.requestUntilSuccessful(request, resolve, reject);
    });
  }

  eval(code, cellId, outputRendering = true) {
    const request = EvalClient.makeRequest('darkmatter/eval', {
      code: code,
      outputRendering: outputRendering,
      cellId: cellId
    }, this.id);
    return this.request(request);
  }
}
