
// Send commands over WS.
// The emited commands will be handled by olympus module
// on nodemcu (esp8266) running on espruino runtime.
// (The module Will publish soon.)

module.exports = (ws) => {
  const send = (obj) => {
    console.log('Sending ... ', obj);
    ws.send(JSON.stringify(obj));
  };

  return {
    send,
    on: cb => ws.on('message', message => cb(JSON.parse(message))),
    set: payload => send(Object.assign({ command: 'SET' }, payload)),
    read: ({ pin }) => send({ command: 'GET', pin }),
  };
};
