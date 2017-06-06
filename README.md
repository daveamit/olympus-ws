# Usage
```javascript
var Ws = requre(ws);
var ws = new Ws('wss://<host>/email/uid/device');

ws.on('open', function open() {
  // Will send current state (all pin status)
  ws.send('Yay!');
});

ws.on('message', function incoming(data) {
  var data = JSON.stringify(data);
  
  /*
  data.command -> GET or SET
  data.pin -> The corresponding pin
  data.value -> The value to set, present when data.command is SET
  */

  // have fun with data.
});
```

### NOTE: Should not be used with `ws` for security reasons.