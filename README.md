# Usage
```javascript
var Ws = requre(ws);
var ws = new Ws('wss://<host>/email/uid');

ws.on('open', function open() {
  ws.send('Yay!');
});

ws.on('message', function incoming(data) {
  var data = JSON.stringify(data);
  // have fun with data.
});
```

### NOTE: Will not work with `ws`